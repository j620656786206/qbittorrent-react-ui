// Smoke test for the container image (spec 1.9 rows I1 to I5). Drives the
// Docker CLI with spawn (no shell); the only package it uses is seroval,
// through ./server-fn.mjs, to call the server functions the way the page does.
//
//   node scripts/smoke-image.mjs <image> <commit-sha>
//
// Never talks to a real qBittorrent: QBIT_URL is a closed loopback port.
// Never reads .env: every value is fake or generated here, and reaches
// `docker run` through the child process env (`-e NAME`), never the command
// line. Server behavior on .output is covered by smoke-built-server.mjs; this
// covers the container only.
//
// I1 valid boot: hardened flags, a fresh named volume on /config, healthy
//    within 60 s, /healthz is 200 `ok`, / is 200 text/html.
// I2 missing env: for each required variable, a container without it stops
//    by itself within 20 s, non-zero exit, a startup_env_invalid line naming
//    it, no Listening line. Stops at the first variable that fails.
// I3 hardening: uid 99, everything under /app owned by root, writing under
//    /app fails with a read-only or permission error, /config is writable,
//    image user 99:100.
// I4 commit sha: exactly one startup line, whose commit is the given sha.
// I5 secrets stay out: no .env or .env.* entry in the exported filesystem,
//    /app holds only .output, the SPA shell was prerendered, logs never
//    contain the fake password or secret. Before the logs are read, the
//    password goes through the paths that handle it: a wrong login whose
//    password contains the real one, a right login, and getMaindata, whose
//    qBittorrent login is refused by the closed port (qbit_unreachable).
//
// Every docker call and fetch has a timeout naming the step that stalled.
// Containers and the volume are removed at the end, on failure and on
// SIGINT/SIGTERM.
import { spawn } from 'node:child_process'
import { randomBytes } from 'node:crypto'
import {
  closeSync,
  mkdtempSync,
  openSync,
  readSync,
  rmSync,
  statSync,
} from 'node:fs'
import { createServer } from 'node:net'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { callServerFn, serverFnIds } from './server-fn.mjs'

const [IMAGE, COMMIT] = process.argv.slice(2)
if (!IMAGE || !/^[0-9a-f]{7,40}$/.test(COMMIT ?? '')) {
  console.error('usage: node scripts/smoke-image.mjs <image> <commit-sha>')
  process.exit(2)
}

// Port 1 on loopback: nothing listens there, so every connect is refused.
const QBIT_URL_CLOSED = 'http://127.0.0.1:1'
// Same list as REQUIRED_ENV in src/server/env (src/deploy-files.test.ts
// checks the Unraid template against it).
const REQUIRED_ENV = [
  'QBIT_URL',
  'QBIT_USERNAME',
  'QBIT_PASSWORD',
  'SESSION_SECRET',
  'APP_ORIGINS',
  'SAVE_ROOTS',
]
const APP_ENV = [
  ...REQUIRED_ENV,
  'CONFIG_DIR',
  'PORT',
  'HOST',
  'NITRO_PORT',
  'NITRO_HOST',
]
const HEALTHY_WITHIN_MS = 60_000
const EXIT_WITHIN_MS = 20_000
const FETCH_TIMEOUT_MS = 10_000
const DOCKER_TIMEOUT_MS = 60_000
const EXPORT_TIMEOUT_MS = 180_000

const RUN_ID = `rt-smoke-${randomBytes(4).toString('hex')}`
const VOLUME = `${RUN_ID}-config`
const OK_NAME = `${RUN_ID}-ok`
const HARDENED = [
  '--read-only',
  '--tmpfs',
  '/tmp',
  '--cap-drop=ALL',
  '--security-opt=no-new-privileges',
  '-v',
  `${VOLUME}:/config`,
]

const failures = []
function check(condition, message) {
  if (!condition) failures.push(message)
}

/** Containers `docker run` was asked to create; all removed in cleanup. */
const containers = new Set()
let volumeCreated = false
let tempDir = null

function freePort() {
  return new Promise((resolve, reject) => {
    const server = createServer()
    server.once('error', reject)
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address()
      server.close(() => resolve(port))
    })
  })
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

/** The parent env without any app variable, plus `env`. */
function dockerEnv(env = {}) {
  const base = { ...process.env }
  for (const name of APP_ENV) delete base[name]
  return { ...base, ...env }
}

/**
 * Runs `docker <args>`; resolves with the exit code and output. Rejects
 * naming `step` when the call does not finish within `timeoutMs`.
 */
function docker(args, options = {}) {
  const {
    env,
    step = `docker ${args[0]}`,
    timeoutMs = DOCKER_TIMEOUT_MS,
  } = options
  return new Promise((resolve, reject) => {
    const child = spawn('docker', args, {
      env: dockerEnv(env),
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    let stdout = ''
    let stderr = ''
    const timer = setTimeout(() => {
      child.kill('SIGKILL')
      reject(
        new Error(`${step}: docker ${args[0]} stalled for ${timeoutMs} ms`),
      )
    }, timeoutMs)
    child.stdout.on('data', (chunk) => (stdout += chunk))
    child.stderr.on('data', (chunk) => (stderr += chunk))
    child.once('error', (error) => {
      clearTimeout(timer)
      reject(error)
    })
    child.once('close', (code) => {
      clearTimeout(timer)
      resolve({ code, stdout, stderr })
    })
  })
}

async function dockerOk(args, options = {}) {
  const result = await docker(args, options)
  if (result.code !== 0) {
    const step = options.step ?? `docker ${args[0]}`
    throw new Error(`${step}: failed (${result.code}): ${result.stderr.trim()}`)
  }
  return result.stdout
}

/** `docker logs` (stdout and stderr together). */
async function logs(name, step) {
  const result = await docker(['logs', name], { step })
  return result.stdout + result.stderr
}

/** Status, health and exit code of a container. */
async function state(name, step) {
  const out = await dockerOk(
    [
      'inspect',
      '-f',
      '{{.State.Status}}|{{if .State.Health}}{{.State.Health.Status}}{{end}}|{{.State.ExitCode}}',
      name,
    ],
    { step },
  )
  const [status, health, exitCode] = out.trim().split('|')
  return { status, health, exitCode: Number(exitCode) }
}

/** Starts a detached container; app values go through the env only. */
async function run(name, env, extra, step) {
  containers.add(name)
  const flags = Object.keys(env).flatMap((key) => ['-e', key])
  await dockerOk(
    ['run', '-d', '--name', name, ...HARDENED, ...extra, ...flags, IMAGE],
    { env, step },
  )
}

async function get(url, step) {
  try {
    return await fetch(url, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) })
  } catch (error) {
    throw new Error(
      `${step}: ${error instanceof Error ? error.message : error}`,
    )
  }
}

function fakeEnv(port) {
  return {
    QBIT_URL: QBIT_URL_CLOSED,
    QBIT_USERNAME: 'smoke-user',
    QBIT_PASSWORD: randomBytes(12).toString('base64url'),
    SESSION_SECRET: randomBytes(32).toString('base64'),
    APP_ORIGINS: `http://127.0.0.1:${port}`,
    SAVE_ROOTS: '/downloads',
  }
}

/** I1. Returns the env and port the running container got. */
async function checkValidBoot() {
  let port = await freePort()
  let env = fakeEnv(port)
  try {
    await run(OK_NAME, env, ['-p', `127.0.0.1:${port}:3000`], 'I1 run')
  } catch (error) {
    if (!/port is already allocated/.test(String(error.message))) throw error
    // Another process took the port between freePort() and docker run.
    await docker(['rm', '-f', OK_NAME], { step: 'I1 retry cleanup' })
    port = await freePort()
    env = fakeEnv(port)
    await run(OK_NAME, env, ['-p', `127.0.0.1:${port}:3000`], 'I1 run retry')
  }

  const deadline = Date.now() + HEALTHY_WITHIN_MS
  let last = { status: 'created', health: '' }
  while (Date.now() < deadline) {
    last = await state(OK_NAME, 'I1 wait for healthy')
    if (last.status === 'running' && last.health === 'healthy') break
    if (last.status === 'exited' || last.status === 'dead') break
    await sleep(1000)
  }
  if (last.status !== 'running' || last.health !== 'healthy') {
    throw new Error(
      `I1: container is ${last.status} ${last.health || ''} after start; logs:\n${await logs(OK_NAME, 'I1 logs')}`,
    )
  }

  const base = `http://127.0.0.1:${port}`
  const healthz = await get(`${base}/healthz`, 'I1 GET /healthz')
  const body = await healthz.text()
  check(healthz.status === 200, `I1: /healthz status ${healthz.status}`)
  check(body === 'ok', 'I1: /healthz body is not ok')
  const page = await get(`${base}/`, 'I1 GET /')
  await page.text()
  check(page.status === 200, `I1: / status ${page.status}`)
  check(
    (page.headers.get('content-type') ?? '').startsWith('text/html'),
    `I1: / content-type ${page.headers.get('content-type') ?? 'missing'}`,
  )
  return { env, port }
}

/** I2 for one variable; returns its logs. */
async function checkMissing(env, missing, index) {
  const name = `${RUN_ID}-no-${index}`
  const step = `I2 without ${missing}`
  const rest = { ...env }
  delete rest[missing]
  await run(name, rest, [], step)
  const deadline = Date.now() + EXIT_WITHIN_MS
  let last = { status: 'created', exitCode: 0 }
  while (Date.now() < deadline) {
    last = await state(name, step)
    if (last.status === 'exited' || last.status === 'dead') break
    await sleep(500)
  }
  const output = await logs(name, step)
  if (last.status !== 'exited' && last.status !== 'dead') {
    await docker(['kill', name], { step })
    check(false, `${step}: still ${last.status} after 20 s`)
    return output
  }
  check(last.exitCode !== 0, `${step}: exit code ${last.exitCode}`)
  const invalid = output
    .split('\n')
    .filter(
      (line) =>
        line.includes('"event":"startup_env_invalid"') &&
        line.includes(missing),
    )
  check(
    invalid.length === 1,
    `${step}: ${invalid.length} startup_env_invalid lines name it`,
  )
  check(!/Listening/.test(output), `${step}: server started listening`)
  await docker(['rm', '-f', name], { step })
  containers.delete(name)
  return output
}

/** I2 for every required variable, stopping at the first failure. */
async function checkMissingEnv(env) {
  let output = ''
  for (const [index, missing] of REQUIRED_ENV.entries()) {
    const before = failures.length
    output += await checkMissing(env, missing, index)
    if (failures.length > before) break
  }
  return output
}

async function checkHardening() {
  const uid = await docker(['exec', OK_NAME, 'id', '-u'], { step: 'I3 id -u' })
  check(
    uid.code === 0 && uid.stdout.trim() === '99',
    `I3: id -u is ${uid.stdout.trim() || uid.stderr.trim()}`,
  )

  const notRoot = await docker(
    ['exec', OK_NAME, 'find', '/app', '-not', '-user', '0'],
    {
      step: 'I3 find /app',
    },
  )
  check(
    notRoot.code === 0 && notRoot.stdout.trim() === '',
    `I3: find /app -not -user 0 exit ${notRoot.code}, ${notRoot.stdout.trim().split('\n').length} entries not owned by root`,
  )

  const appWrite = await docker(
    ['exec', OK_NAME, 'sh', '-c', 'echo x > /app/.smoke-probe'],
    { step: 'I3 write /app' },
  )
  check(
    appWrite.code !== 0 &&
      /Read-only file system|Permission denied/.test(appWrite.stderr),
    `I3: writing under /app did not fail with a read-only or permission error (exit ${appWrite.code})`,
  )

  const configWrite = await docker(
    [
      'exec',
      OK_NAME,
      'sh',
      '-c',
      'echo x > /config/.smoke-probe && rm /config/.smoke-probe',
    ],
    { step: 'I3 write /config' },
  )
  check(
    configWrite.code === 0,
    `I3: writing /config/.smoke-probe failed: ${configWrite.stderr.trim()}`,
  )

  const user = await dockerOk(
    ['image', 'inspect', '-f', '{{.Config.User}}', IMAGE],
    { step: 'I3 image user' },
  )
  check(user.trim() === '99:100', `I3: image user is ${user.trim()}`)
}

function checkCommit(output) {
  const startup = output
    .split('\n')
    .filter((line) => line.includes('"event":"startup"'))
  check(startup.length === 1, `I4: ${startup.length} startup lines`)
  if (startup.length !== 1) return
  let commit
  try {
    commit = JSON.parse(startup[0]).commit
  } catch {
    check(false, 'I4: startup line is not JSON')
    return
  }
  check(
    commit === COMMIT,
    `I4: startup commit is ${commit}, expected ${COMMIT}`,
  )
}

const parseOctal = (buf) =>
  parseInt(buf.toString('latin1').replace(/\0.*$/s, '').trim() || '0', 8)
const cString = (buf) => buf.toString('utf8').replace(/\0.*$/s, '')

/**
 * Entry paths of a tar file (ustar, GNU long names and PAX `path`), read
 * header by header so the archive never sits in memory.
 */
function tarEntries(file) {
  const fd = openSync(file, 'r')
  const size = statSync(file).size
  const header = Buffer.alloc(512)
  const entries = []
  let offset = 0
  let longName = null
  try {
    while (offset + 512 <= size) {
      readSync(fd, header, 0, 512, offset)
      if (header.every((byte) => byte === 0)) break
      const entrySize = parseOctal(header.subarray(124, 136))
      const type = String.fromCharCode(header[156])
      const dataStart = offset + 512
      offset = dataStart + Math.ceil(entrySize / 512) * 512
      if (type === 'L' || type === 'x') {
        const data = Buffer.alloc(entrySize)
        readSync(fd, data, 0, entrySize, dataStart)
        if (type === 'L') longName = cString(data)
        else {
          const match = /(?:^|\n)\d+ path=([^\n]*)\n/.exec(
            data.toString('utf8'),
          )
          if (match) longName = match[1]
        }
        continue
      }
      if (type === 'g') continue
      let name = cString(header.subarray(0, 100))
      const prefix = cString(header.subarray(345, 500))
      if (header.subarray(257, 262).toString('latin1') === 'ustar' && prefix) {
        name = `${prefix}/${name}`
      }
      entries.push((longName ?? name).replace(/^\.?\//, ''))
      longName = null
    }
  } finally {
    closeSync(fd)
  }
  return entries
}

async function checkFilesystem(dir) {
  const tar = join(dir, 'export.tar')
  await dockerOk(['export', '-o', tar, OK_NAME], {
    step: 'I5 docker export',
    timeoutMs: EXPORT_TIMEOUT_MS,
  })
  const entries = tarEntries(tar)
  check(entries.length > 100, `I5: export lists only ${entries.length} entries`)
  const envFiles = entries.filter((entry) =>
    /^\.env(\..*)?$/.test(entry.replace(/\/$/, '').split('/').pop()),
  )
  check(envFiles.length === 0, `I5: ${envFiles.length} .env entries in image`)
  const appChildren = new Set(
    entries
      .filter((entry) => entry.startsWith('app/'))
      .map((entry) => entry.split('/')[1])
      .filter(Boolean),
  )
  check(
    appChildren.size === 1 && appChildren.has('.output'),
    `I5: /app holds ${[...appChildren].join(', ') || 'nothing'}`,
  )
  // The build skips the prerender silently when it cannot reach its preview
  // server (the Dockerfile's ipv4first line).
  check(
    entries.includes('app/.output/public/_shell.html'),
    'I5: /app/.output/public/_shell.html is missing (SPA prerender failed)',
  )
}

/**
 * I5: sends the fake password through login and the qBittorrent client, so
 * the log check below has something it could catch.
 */
async function exerciseSecrets(dir, base, env) {
  const serverDir = join(dir, 'server')
  await dockerOk(['cp', `${OK_NAME}:/app/.output/server`, serverDir], {
    step: 'I5 docker cp server',
  })
  const ids = serverFnIds(serverDir, ['login', 'getMaindata'])
  const login = (password) =>
    callServerFn(base, ids.login, {
      method: 'POST',
      data: { username: env.QBIT_USERNAME, password, remember: false },
    })

  const wrong = await login(`${env.QBIT_PASSWORD}x`)
  check(
    wrong.result?.error?.code === 'login_failed',
    `I5 wrong login: ${wrong.status} ${JSON.stringify(wrong.result)}`,
  )
  const right = await login(env.QBIT_PASSWORD)
  const cookie = right.cookies
    .find((value) => value.startsWith('rt_session='))
    ?.split(';')[0]
  check(
    right.result?.ok === true && Boolean(cookie),
    `I5 login: ${right.status} ${JSON.stringify(right.result)}`,
  )
  if (!cookie) return
  const maindata = await callServerFn(base, ids.getMaindata, {
    method: 'GET',
    data: {},
    cookie,
  })
  check(
    maindata.result?.error?.code === 'qbit_unreachable',
    `I5 getMaindata: ${maindata.status} ${JSON.stringify(maindata.result)}`,
  )
}

function checkLogsClean(output, env) {
  check(
    !output.includes(env.QBIT_PASSWORD),
    'I5: logs contain the fake password',
  )
  check(
    !output.includes(env.SESSION_SECRET),
    'I5: logs contain the fake secret',
  )
}

/** Removes everything this run created; never throws, reports problems. */
let cleaning = null
function cleanup() {
  cleaning ??= (async () => {
    const problems = []
    const attempt = async (what, fn) => {
      try {
        await fn()
      } catch (error) {
        problems.push(
          `cleanup ${what}: ${error instanceof Error ? error.message : error}`,
        )
      }
    }
    if (containers.size > 0) {
      await attempt('containers', async () => {
        const result = await docker(['rm', '-f', ...containers], {
          step: 'cleanup containers',
        })
        if (result.code !== 0 && !/No such container/.test(result.stderr)) {
          throw new Error(result.stderr.trim())
        }
      })
    }
    if (volumeCreated) {
      await attempt('volume', () =>
        dockerOk(['volume', 'rm', '-f', VOLUME], { step: 'cleanup volume' }),
      )
    }
    if (tempDir) {
      await attempt('temp dir', () =>
        rmSync(tempDir, { recursive: true, force: true }),
      )
    }
    return problems
  })()
  return cleaning
}

for (const [signal, code] of [
  ['SIGINT', 130],
  ['SIGTERM', 143],
]) {
  process.once(signal, () => {
    console.error(`smoke-image: ${signal}, cleaning up`)
    void cleanup().then((problems) => {
      for (const problem of problems) console.error(`  - ${problem}`)
      process.exit(code)
    })
  })
}

async function main() {
  try {
    tempDir = mkdtempSync(join(tmpdir(), 'rt-smoke-image-'))
    await dockerOk(['volume', 'create', VOLUME], { step: 'volume create' })
    volumeCreated = true
    const { env, port } = await checkValidBoot()
    const missingLogs = await checkMissingEnv(env)
    await checkHardening()
    await exerciseSecrets(tempDir, `http://127.0.0.1:${port}`, env)
    const okLogs = await logs(OK_NAME, 'I4 logs')
    checkCommit(okLogs)
    await checkFilesystem(tempDir)
    checkLogsClean(okLogs + missingLogs, env)
  } catch (error) {
    failures.push(error instanceof Error ? error.message : String(error))
  } finally {
    failures.push(...(await cleanup()))
  }
  if (failures.length > 0) {
    console.error(`smoke-image: ${failures.length} problem(s)`)
    for (const failure of failures) console.error(`  - ${failure}`)
    process.exit(1)
  }
  console.log('smoke-image: ok')
}

await main()
