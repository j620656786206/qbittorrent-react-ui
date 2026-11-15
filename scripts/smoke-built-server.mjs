// Smoke test for the built server (.output). No dependencies.
// 1. Boots with fake valid env and checks the HTML nonce plumbing, /healthz,
//    the static-asset CSP and that no access-control-* header is sent.
// 2. Boots without SESSION_SECRET and checks it refuses to start.
// Never talks to a real qBittorrent: QBIT_URL is a .invalid host.
import { spawn } from 'node:child_process'
import { randomBytes } from 'node:crypto'
import { existsSync, mkdtempSync, rmSync } from 'node:fs'
import { createServer } from 'node:net'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { STATIC_CSP } from '../src/shared/csp.ts'

const ROOT = fileURLToPath(new URL('..', import.meta.url))
const ENTRY = join(ROOT, '.output/server/index.mjs')
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

async function checkValidBoot(configDir) {
  const port = await freePort()
  const base = `http://localhost:${port}`
  const server = boot({
    QBIT_URL: 'http://qbit.test.invalid:8080',
    QBIT_USERNAME: 'smoke-user',
    QBIT_PASSWORD: randomBytes(12).toString('base64url'),
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
