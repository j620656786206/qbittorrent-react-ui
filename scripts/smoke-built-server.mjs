// Smoke test for the built server (.output). No dependencies.
// 1. Boots with fake valid env and checks the HTML nonce plumbing, that the
//    HTML has no inline styles, /healthz, the static-asset CSP and that no
//    access-control-* header is sent.
//    Then calls the real `getSession` and `login` server functions through
//    Start's handler (spec 1.4 rows B1 to B6): the gate's session context,
//    not_logged_in as HTTP 200, the `rt_session` cookie flags and a foreign
//    Origin. B7 and B8 (epic 1 review): a forged payload.context.session and
//    the 64 KB body cap without a session. Also that /_shell.html is not served.
// 2. Boots without SESSION_SECRET and checks it refuses to start.
// Never talks to a real qBittorrent: QBIT_URL is a .invalid host.
import { spawn } from 'node:child_process'
import { randomBytes } from 'node:crypto'
import {
  existsSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
} from 'node:fs'
import { createServer } from 'node:net'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { fromCrossJSON, toJSONAsync } from 'seroval'
import { STATIC_CSP } from '../src/shared/csp.ts'

const ROOT = fileURLToPath(new URL('..', import.meta.url))
const ENTRY = join(ROOT, '.output/server/index.mjs')
const SERVER_DIR = join(ROOT, '.output/server')
const SERVER_FN_BASE = '/_serverFn/'
const FOREIGN_ORIGIN = 'https://evil.example'
const APP_ENV = [
  'QBIT_URL',
  'QBIT_USERNAME',
  'QBIT_PASSWORD',
  'SESSION_SECRET',
  'APP_ORIGINS',
  'SAVE_ROOTS',
  'CONFIG_DIR',
  'PORT',
  'HOST',
  'NITRO_PORT',
  'NITRO_HOST',
]

const failures = []
function check(condition, message) {
  if (!condition) failures.push(message)
}

function freePort() {
  return new Promise((resolve, reject) => {
    const server = createServer()
    server.once('error', reject)
    server.listen(0, () => {
      const { port } = server.address()
      server.close(() => resolve(port))
    })
  })
}

function boot(env) {
  const base = { ...process.env }
  for (const name of APP_ENV) delete base[name]
  const child = spawn(process.execPath, [ENTRY], {
    cwd: ROOT,
    env: { ...base, ...env },
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  const output = { stdout: '', stderr: '' }
  child.stdout.on('data', (chunk) => (output.stdout += chunk))
  child.stderr.on('data', (chunk) => (output.stderr += chunk))
  const exited = new Promise((resolve) =>
    child.once('exit', (code, signal) => resolve({ code, signal })),
  )
  return { child, output, exited }
}

function withTimeout(promise, ms, what) {
  let timer
  const timeout = new Promise((_resolve, reject) => {
    timer = setTimeout(() => reject(new Error(`timed out: ${what}`)), ms)
  })
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer))
}

async function waitForHealthz(base, exited) {
  let gone = false
  void exited.then(() => (gone = true))
  for (let i = 0; i < 100; i += 1) {
    if (gone) throw new Error('server exited before listening')
    try {
      const response = await fetch(`${base}/healthz`)
      if (response.ok) return
    } catch {
      // Not listening yet.
    }
    await new Promise((resolve) => setTimeout(resolve, 100))
  }
  throw new Error('server did not answer /healthz within 10 s')
}

function noAccessControl(response, what) {
  const names = [...response.headers.keys()].filter((name) =>
    name.startsWith('access-control-'),
  )
  check(names.length === 0, `${what}: has ${names.join(', ')}`)
}

function serverFiles(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name)
    if (entry.isDirectory()) return serverFiles(path)
    return /\.m?js$/.test(entry.name) ? [path] : []
  })
}

/**
 * The build id of each named server function. Start's compiler writes
 * `createServerRpc({ id: "<sha256>", name: "<export>", ... })` into the
 * function's server chunk; each name must appear exactly once.
 */
function serverFnIds(names) {
  const found = new Map(names.map((name) => [name, new Set()]))
  const pattern = /\bid:\s*"([0-9a-f]{64})",\s*name:\s*"(\w+)"/g
  let manifestText = ''
  for (const file of serverFiles(SERVER_DIR)) {
    const text = readFileSync(file, 'utf8')
    if (text.includes('functionName:')) manifestText += text
    for (const [, id, name] of text.matchAll(pattern)) {
      found.get(name)?.add(id)
    }
  }
  const ids = {}
  for (const [name, set] of found) {
    if (set.size !== 1) {
      throw new Error(
        `built server: expected exactly one server function named ${name}, found ${set.size}`,
      )
    }
    const [id] = set
    if (!manifestText.includes(`"${id}"`)) {
      throw new Error(
        `built server: ${name} id is not in the server fn manifest`,
      )
    }
    ids[name] = id
  }
  return ids
}

/**
 * A server function request the way Start's serverFnFetcher builds it.
 * `origin: null` sends no Origin, like a browser's same-origin GET;
 * `headers` adds or overrides headers.
 */
async function callServerFn(
  base,
  id,
  { method, data, context, origin = base, cookie, headers: extra = {} },
) {
  const headers = {
    Host: new URL(base).host,
    'X-Requested-With': 'XMLHttpRequest',
    Accept: 'application/json',
    'x-tsr-serverFn': 'true',
  }
  if (origin !== null) headers.Origin = origin
  if (cookie) headers.Cookie = cookie
  Object.assign(headers, extra)
  let url = `${base}${SERVER_FN_BASE}${id}`
  let body
  if (data !== undefined || context !== undefined) {
    // `context` is what a client may put in payload.context; Start merges it
    // under the request middleware's context.
    const payload = JSON.stringify(await toJSONAsync({ data, context }))
    if (method === 'GET') url += `?${new URLSearchParams({ payload })}`
    else {
      body = payload
      headers['Content-Type'] = 'application/json'
    }
  }
  const response = await fetch(url, { method, headers, body })
  const text = await response.text()
  let json
  try {
    json = JSON.parse(text)
  } catch {
    json = undefined
  }
  const result =
    json !== undefined && response.headers.get('x-tss-serialized')
      ? fromCrossJSON(json, { refs: new Map() }).result
      : json
  return {
    status: response.status,
    contentType: response.headers.get('content-type') ?? '',
    cookies: response.headers.getSetCookie(),
    result,
  }
}

const codeOf = (result) => result?.error?.code

/** Spec 1.4 rows B1 to B6, carried items (a) and (b) from 1.2. */
async function checkLoginFlow(base, password) {
  const ids = serverFnIds(['login', 'getSession'])
  const getSession = (options = {}) =>
    callServerFn(base, ids.getSession, { method: 'GET', ...options })
  const login = (data, options = {}) =>
    callServerFn(base, ids.login, { method: 'POST', data, ...options })

  // B1: the gate runs, finds no cookie, and guard() answers in the contract.
  const b1 = await getSession()
  check(b1.status === 200, `B1 getSession without cookie: status ${b1.status}`)
  check(
    codeOf(b1.result) === 'not_logged_in',
    `B1 getSession without cookie: ${JSON.stringify(b1.result)}`,
  )
  // B1 again without Origin: a browser's same-origin GET sends none.
  const b1NoOrigin = await getSession({ origin: null })
  check(
    b1NoOrigin.status === 200 && codeOf(b1NoOrigin.result) === 'not_logged_in',
    `B1 getSession without cookie or Origin: ${b1NoOrigin.status} ${JSON.stringify(b1NoOrigin.result)}`,
  )

  // B2: wrong password, no cookie.
  const b2 = await login({
    username: 'smoke-user',
    password: 'wrong',
    remember: false,
  })
  check(b2.status === 200, `B2 wrong login: status ${b2.status}`)
  check(
    codeOf(b2.result) === 'login_failed',
    `B2 wrong login: ${JSON.stringify(b2.result)}`,
  )
  check(b2.cookies.length === 0, 'B2 wrong login: sent Set-Cookie')

  // B3: plain http, not remembered: 12 hours, no Secure.
  const b3 = await login({ username: 'smoke-user', password, remember: false })
  check(
    b3.status === 200 && b3.result?.ok === true,
    `B3 login over http: ${JSON.stringify(b3.result)}`,
  )
  check(
    typeof b3.result?.data?.exp === 'number',
    'B3 login over http: no exp in data',
  )
  const b3Cookie = b3.cookies.find((c) => c.startsWith('rt_session='))
  check(Boolean(b3Cookie), 'B3 login over http: no rt_session cookie')
  if (b3Cookie) {
    const flags = b3Cookie.split(';').map((part) => part.trim())
    for (const flag of [
      'Max-Age=43200',
      'Path=/',
      'HttpOnly',
      'SameSite=Strict',
    ]) {
      check(flags.includes(flag), `B3 login over http: cookie lacks ${flag}`)
    }
    check(!flags.includes('Secure'), 'B3 login over http: cookie has Secure')
  }

  // B4: X-Forwarded-Proto https (the Tunnel), remembered: 90 days, Secure.
  const b4 = await login(
    { username: 'smoke-user', password, remember: true },
    { headers: { 'X-Forwarded-Proto': 'https' } },
  )
  check(
    b4.status === 200 && b4.result?.ok === true,
    `B4 login over https: ${b4.status} ${JSON.stringify(b4.result)}`,
  )
  const b4Cookie = b4.cookies.find((c) => c.startsWith('rt_session='))
  check(Boolean(b4Cookie), 'B4 login over https: no rt_session cookie')
  if (b4Cookie) {
    const flags = b4Cookie.split(';').map((part) => part.trim())
    for (const flag of [
      'Max-Age=7776000',
      'Path=/',
      'HttpOnly',
      'SameSite=Strict',
      'Secure',
    ]) {
      check(flags.includes(flag), `B4 login over https: cookie lacks ${flag}`)
    }
  }

  const cookie = b3Cookie?.split(';')[0]
  if (!cookie) return

  // B5: the B3 cookie reaches guard() through the gate's context.
  const b5 = await getSession({ cookie })
  check(
    b5.status === 200 && b5.result?.ok === true,
    `B5 getSession with cookie: ${JSON.stringify(b5.result)}`,
  )
  const b5NoOrigin = await getSession({ cookie, origin: null })
  check(
    b5NoOrigin.status === 200 && b5NoOrigin.result?.ok === true,
    `B5 getSession with cookie, no Origin: ${b5NoOrigin.status} ${JSON.stringify(b5NoOrigin.result)}`,
  )

  // B6: a foreign Origin is rejected by the gate before any function runs.
  const b6Get = await getSession({ cookie, origin: FOREIGN_ORIGIN })
  check(
    b6Get.status === 403,
    `B6 getSession foreign Origin: status ${b6Get.status}`,
  )
  check(
    b6Get.contentType.includes('application/json'),
    'B6 getSession foreign Origin: not JSON',
  )
  check(
    codeOf(b6Get.result) === 'bad_origin',
    `B6 getSession foreign Origin: ${JSON.stringify(b6Get.result)}`,
  )
  const b6Post = await login(
    { username: 'smoke-user', password, remember: false },
    { origin: FOREIGN_ORIGIN },
  )
  check(
    b6Post.status === 403,
    `B6 login foreign Origin: status ${b6Post.status}`,
  )
  check(
    codeOf(b6Post.result) === 'bad_origin',
    `B6 login foreign Origin: ${JSON.stringify(b6Post.result)}`,
  )
  check(b6Post.cookies.length === 0, 'B6 login foreign Origin: sent Set-Cookie')

  // B7: a session forged in the client's payload.context logs no one in.
  const b7 = await getSession({
    context: { session: { iat: 1, exp: 9_999_999_999 } },
  })
  check(
    b7.status === 200 && codeOf(b7.result) === 'not_logged_in',
    `B7 getSession with a forged context.session: ${b7.status} ${JSON.stringify(b7.result)}`,
  )

  // B8: without a session the gate caps the body at 64 KB before Start reads it.
  const b8 = await login({
    username: 'x'.repeat(70_000),
    password: 'y',
    remember: false,
  })
  check(
    b8.status === 413 && codeOf(b8.result) === 'invalid_input',
    `B8 login with a 70 KB body: ${b8.status} ${JSON.stringify(b8.result)}`,
  )
  check(b8.cookies.length === 0, 'B8 login with a 70 KB body: sent Set-Cookie')
}

async function checkValidBoot(configDir) {
  const port = await freePort()
  const base = `http://localhost:${port}`
  const password = randomBytes(12).toString('base64url')
  const server = boot({
    QBIT_URL: 'http://qbit.test.invalid:8080',
    QBIT_USERNAME: 'smoke-user',
    QBIT_PASSWORD: password,
    SESSION_SECRET: randomBytes(32).toString('base64'),
    APP_ORIGINS: base,
    SAVE_ROOTS: '/downloads',
    CONFIG_DIR: configDir,
    PORT: String(port),
  })
  try {
    await waitForHealthz(base, server.exited)

    const page = await fetch(`${base}/`)
    const html = await page.text()
    check(page.status === 200, `/: status ${page.status}`)
    noAccessControl(page, '/')
    const csp = page.headers.get('content-security-policy') ?? ''
    const nonce = /'nonce-([^']+)'/.exec(csp)?.[1]
    check(Boolean(nonce), `/: CSP has no nonce (${csp || 'missing'})`)
    const scripts = html.match(/<script\b[^>]*>/gi) ?? []
    check(scripts.length > 0, '/: no <script> tags found')
    for (const tag of scripts) {
      check(
        tag.includes(`nonce="${nonce}"`),
        `/: script without the nonce: ${tag}`,
      )
    }

    // AR-31: the CSP has no style-src, so the page must not need inline
    // styles (spec 1.3, CSP style-src finding).
    check(!/<style\b/i.test(html), '/: has a <style> tag')
    check(!/ style="/i.test(html), '/: has an inline style attribute')

    const health = await fetch(`${base}/healthz`)
    const healthBody = await health.text()
    check(health.status === 200 && healthBody === 'ok', '/healthz: not 200 ok')
    noAccessControl(health, '/healthz')

    const asset = /\/assets\/[^"'\s]+\.js/.exec(html)?.[0]
    check(Boolean(asset), '/: no /assets/*.js referenced')
    if (asset) {
      const response = await fetch(`${base}${asset}`)
      await response.arrayBuffer()
      check(response.status === 200, `${asset}: status ${response.status}`)
      check(
        response.headers.get('content-security-policy') === STATIC_CSP,
        `${asset}: CSP is not the AR-31 string`,
      )
      noAccessControl(response, asset)
    }

    // SPA mode leaves the prerendered shell in .output/public. Its inline
    // scripts carry a build-time nonce, so it must never be served as a page;
    // if a Nitro or Start upgrade starts serving it, give it the static CSP.
    const shell = await fetch(`${base}/_shell.html`)
    await shell.arrayBuffer()
    check(shell.status === 404, `/_shell.html: served (status ${shell.status})`)

    // The login page is client-rendered (ssr: false) and needs no inline style.
    const loginPage = await fetch(`${base}/login`)
    const loginHtml = await loginPage.text()
    check(loginPage.status === 200, `/login: status ${loginPage.status}`)
    check(!/<style\b/i.test(loginHtml), '/login: has a <style> tag')
    check(!/ style="/i.test(loginHtml), '/login: has an inline style attribute')

    await checkLoginFlow(base, password)
  } finally {
    server.child.kill('SIGTERM')
    await withTimeout(server.exited, 5000, 'server shutdown').catch(() =>
      server.child.kill('SIGKILL'),
    )
  }
}

async function checkMissingSecret(configDir) {
  const port = await freePort()
  const server = boot({
    QBIT_URL: 'http://qbit.test.invalid:8080',
    QBIT_USERNAME: 'smoke-user',
    QBIT_PASSWORD: 'smoke-password',
    APP_ORIGINS: `http://localhost:${port}`,
    SAVE_ROOTS: '/downloads',
    CONFIG_DIR: configDir,
    PORT: String(port),
  })
  let result
  try {
    result = await withTimeout(
      server.exited,
      15000,
      'exit without SESSION_SECRET',
    )
  } catch (error) {
    server.child.kill('SIGKILL')
    check(false, `missing SESSION_SECRET: ${error.message}`)
    return
  }
  const { stdout, stderr } = server.output
  check(
    result.code !== 0 && result.code !== null,
    `missing SESSION_SECRET: exit code ${result.code}`,
  )
  const lines = stdout
    .split('\n')
    .filter((line) => line.includes('SESSION_SECRET'))
  check(
    lines.length === 1,
    `missing SESSION_SECRET: ${lines.length} stdout lines name it`,
  )
  check(
    !/Listening/.test(stdout + stderr),
    'missing SESSION_SECRET: server started listening',
  )
}

async function main() {
  if (!existsSync(ENTRY)) {
    console.error(`smoke: ${ENTRY} not found; run npm run build first`)
    process.exit(1)
  }
  const configDir = mkdtempSync(join(tmpdir(), 'rt-smoke-'))
  try {
    await checkValidBoot(configDir)
    await checkMissingSecret(configDir)
  } catch (error) {
    failures.push(error instanceof Error ? error.message : String(error))
  } finally {
    rmSync(configDir, { recursive: true, force: true })
  }
  if (failures.length > 0) {
    console.error(`smoke: ${failures.length} problem(s)`)
    for (const failure of failures) console.error(`  - ${failure}`)
    process.exit(1)
  }
  console.log('smoke: built server ok')
}

await main()
