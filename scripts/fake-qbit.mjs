// Dev-only fake qBittorrent for screenshots and browser checks (spec 1.7).
// No dependencies. Never imported from src/, never run in CI, never shipped
// in .output. Never talks to a real qBittorrent and never reads .env.
//
// 1. Starts a fake qBittorrent on a free loopback port:
//    POST /api/v2/auth/login answers `Ok.` with `Set-Cookie: SID=fake`;
//    GET /api/v2/sync/maindata answers six fake torrents (two archived) and a
//    mode-driven server_state, always as a full update.
// 2. Boots the built server (.output/server/index.mjs) with fake env, the
//    inherited app variables removed (like scripts/smoke-built-server.mjs).
// 3. Runs a front proxy on http://localhost:<port> (default 3100) that
//    forwards to it and can pretend to be a broken path from outside.
//
// Usage: npm run fake-qbit [-- --port 3100]  (also --port=3100)
// Switch modes (loopback only):
//   curl -X POST 'http://localhost:3100/__fake/mode?qbit=normal&front=normal'
//   qbit:  normal | alt | firewalled | disconnected | slow | down
//          (slow delays maindata 25 s; down closes every connection)
//   front: normal | down | cloudflare | cloudflare-redirect | cloudflare-html
//          (down answers 502 to server function calls; the three Cloudflare
//          forms answer requests with X-Requested-With with a 401, a 302 to
//          an Access login page, or a 200 HTML login page)
import { spawn } from 'node:child_process'
import { randomBytes } from 'node:crypto'
import { existsSync, mkdtempSync, rmSync } from 'node:fs'
import { createServer, request } from 'node:http'
import { createServer as createNetServer } from 'node:net'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = fileURLToPath(new URL('..', import.meta.url))
const ENTRY = join(ROOT, '.output/server/index.mjs')
const LOOPBACK = '127.0.0.1'
const USERNAME = 'fake-user'
const PASSWORD = 'fake-pass'
const SERVER_FN_PREFIX = '/_serverFn/'
const SLOW_MS = 25_000
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

const QBIT_MODES = new Set([
  'normal',
  'alt',
  'firewalled',
  'disconnected',
  'slow',
  'down',
])
const FRONT_MODES = new Set([
  'normal',
  'down',
  'cloudflare',
  'cloudflare-redirect',
  'cloudflare-html',
])
// A reserved name (RFC 2606): never resolves, never leaves this machine.
const ACCESS_LOGIN = 'https://access.example/cdn-cgi/access/login'
const ACCESS_PAGE = '<!doctype html><html><body><h1>Sign in</h1></body></html>'
const mode = { qbit: 'normal', front: 'normal' }

/** `--port 3200` or `--port=3200`; 3100 when absent. */
function frontPort() {
  const args = process.argv.slice(2)
  const index = args.findIndex(
    (arg) => arg === '--port' || arg.startsWith('--port='),
  )
  if (index === -1) return 3100
  const raw = args[index].startsWith('--port=')
    ? args[index].slice('--port='.length)
    : args[index + 1]
  const port = Number(raw)
  if (!Number.isInteger(port) || port <= 0 || port > 65535) {
    console.error('--port needs a port number')
    process.exit(2)
  }
  return port
}

function freePort() {
  return new Promise((resolve, reject) => {
    const server = createNetServer()
    server.once('error', reject)
    server.listen(0, LOOPBACK, () => {
      const { port } = server.address()
      server.close(() => resolve(port))
    })
  })
}

// Spec 1.7 row H11: 6 fake torrents, 2 archived (non-private missingFiles),
// so 「全部 4」. Code-name categories, fake hashes, fake paths only.
const hash = (n) => n.toString(16).padStart(40, '0')
const HOUR = 3600
const BASE_TIME = Math.floor(Date.UTC(2026, 10, 15, 1, 0, 0) / 1000)
function torrent(n, fields) {
  return [
    hash(n),
    {
      name: `Fake.Show.S01E0${n}.1080p`,
      state: 'downloading',
      progress: 0.5,
      size: 4 * 1024 ** 3,
      dlspeed: 0,
      upspeed: 0,
      eta: 8_640_000,
      ratio: 0,
      added_on: BASE_TIME + n * HOUR,
      completion_on: -1,
      seeding_time: 0,
      save_path: '/data/media/X/incompleted',
      category: 'X',
      private: false,
      ...fields,
    },
  ]
}
const TORRENTS = Object.fromEntries([
  torrent(1, { dlspeed: 6_510_000, eta: 2040, progress: 0.87 }),
  torrent(2, {
    state: 'uploading',
    progress: 1,
    ratio: 3.12,
    upspeed: 2_495_611,
    completion_on: BASE_TIME,
    seeding_time: 41 * 24 * HOUR,
    category: 'mteam-tv',
    save_path: '/data/torrent/mteam-seed',
    private: true,
  }),
  torrent(3, { state: 'stalledDL', progress: 0.42, category: 'mteam-X' }),
  torrent(4, {
    state: 'missingFiles',
    progress: 1,
    category: 'mteam-X',
    private: true,
  }),
  torrent(5, { state: 'missingFiles', progress: 1 }),
  torrent(6, { state: 'missingFiles', progress: 1, category: 'mteam-tv' }),
])
const CATEGORIES = {
  X: { name: 'X', savePath: '/data/media/X' },
  'mteam-X': { name: 'mteam-X', savePath: '/data/torrent/mteam-seed' },
  'mteam-tv': { name: 'mteam-tv', savePath: '/data/torrent/mteam-seed' },
}

function serverState() {
  const state = {
    dl_info_speed: 10_433_331,
    up_info_speed: 2_495_611,
    dl_rate_limit: 0,
    up_rate_limit: 34_288_435,
    use_alt_speed_limits: false,
    connection_status: 'connected',
  }
  if (mode.qbit === 'alt') {
    state.use_alt_speed_limits = true
    state.dl_rate_limit = 10_485_760
  }
  if (mode.qbit === 'firewalled') state.connection_status = 'firewalled'
  if (mode.qbit === 'disconnected') state.connection_status = 'disconnected'
  return state
}

let rid = 0

function send(res, status, body, headers = {}) {
  res.writeHead(status, {
    'content-type': 'text/plain; charset=utf-8',
    ...headers,
  })
  res.end(body)
}

function readBody(req) {
  return new Promise((resolve) => {
    let body = ''
    req.on('data', (chunk) => (body += chunk))
    req.on('end', () => resolve(body))
  })
}

const fakeQbit = createServer(async (req, res) => {
  if (mode.qbit === 'down') {
    req.socket.destroy()
    return
  }
  const url = new URL(req.url ?? '/', 'http://fake')
  if (req.method === 'POST' && url.pathname === '/api/v2/auth/login') {
    const form = new URLSearchParams(await readBody(req))
    if (form.get('username') !== USERNAME || form.get('password') !== PASSWORD)
      return send(res, 200, 'Fails.')
    return send(res, 200, 'Ok.', {
      'set-cookie': 'SID=fake; HttpOnly; path=/',
    })
  }
  if (req.method === 'GET' && url.pathname === '/api/v2/sync/maindata') {
    if (!/(^|;\s*)SID=fake(;|$)/.test(req.headers.cookie ?? ''))
      return send(res, 403, 'Forbidden')
    if (mode.qbit === 'slow') {
      await new Promise((resolve) => setTimeout(resolve, SLOW_MS))
    }
    rid += 1
    return send(
      res,
      200,
      JSON.stringify({
        rid,
        full_update: true,
        torrents: TORRENTS,
        categories: CATEGORIES,
        server_state: serverState(),
      }),
      { 'content-type': 'application/json' },
    )
  }
  send(res, 404, 'Not Found')
})

function isLoopback(address) {
  return (
    address === '127.0.0.1' ||
    address === '::1' ||
    address === '::ffff:127.0.0.1'
  )
}

function controlMode(req, res, url) {
  if (!isLoopback(req.socket.remoteAddress))
    return send(res, 403, 'loopback only\n')
  if (req.method === 'POST') {
    const qbit = url.searchParams.get('qbit')
    const front = url.searchParams.get('front')
    if (qbit !== null && !QBIT_MODES.has(qbit))
      return send(res, 400, `unknown qbit mode: ${qbit}\n`)
    if (front !== null && !FRONT_MODES.has(front))
      return send(res, 400, `unknown front mode: ${front}\n`)
    if (qbit !== null) mode.qbit = qbit
    if (front !== null) mode.front = front
    console.log(`mode: qbit=${mode.qbit} front=${mode.front}`)
  } else if (req.method !== 'GET') {
    return send(res, 405, 'POST or GET\n')
  }
  send(res, 200, `${JSON.stringify(mode)}\n`, {
    'content-type': 'application/json',
  })
}

function frontHandler(appPort) {
  return (req, res) => {
    const url = new URL(req.url ?? '/', 'http://front')
    if (url.pathname === '/__fake/mode') return controlMode(req, res, url)
    if (mode.front === 'down' && url.pathname.startsWith(SERVER_FN_PREFIX)) {
      return send(res, 502, '<html><body>Bad gateway</body></html>', {
        'content-type': 'text/html; charset=utf-8',
      })
    }
    if (
      mode.front.startsWith('cloudflare') &&
      req.headers['x-requested-with']
    ) {
      if (mode.front === 'cloudflare-redirect') {
        return send(res, 302, '', { location: ACCESS_LOGIN })
      }
      if (mode.front === 'cloudflare-html') {
        return send(res, 200, ACCESS_PAGE, {
          'content-type': 'text/html; charset=utf-8',
        })
      }
      return send(res, 401, 'Unauthorized')
    }
    const upstream = request(
      {
        host: LOOPBACK,
        port: appPort,
        method: req.method,
        path: req.url,
        // Host and Origin stay what the browser sent (APP_ORIGINS lists it).
        headers: req.headers,
      },
      (answer) => {
        res.writeHead(answer.statusCode ?? 502, answer.headers)
        answer.pipe(res)
      },
    )
    upstream.on('error', () => {
      if (!res.headersSent) send(res, 502, 'app server not reachable\n')
      else res.destroy()
    })
    req.pipe(upstream)
  }
}

function listen(server, port, host) {
  return new Promise((resolve, reject) => {
    server.once('error', reject)
    server.listen(port, host, () => {
      server.off('error', reject)
      resolve()
    })
  })
}

async function waitForHealthz(base, child) {
  for (let i = 0; i < 100; i += 1) {
    if (child.exitCode !== null) throw new Error('app server exited')
    try {
      const response = await fetch(`${base}/healthz`)
      if (response.ok) return
    } catch {
      // Not listening yet.
    }
    await new Promise((resolve) => setTimeout(resolve, 100))
  }
  throw new Error('app server did not answer /healthz within 10 s')
}

// Hoisted so every exit path (Ctrl+C, an app crash, a startup failure)
// stops the app and removes the temporary CONFIG_DIR.
let app = null
let configDir = null
const servers = [fakeQbit]

function cleanup() {
  if (app && app.exitCode === null && app.signalCode === null) {
    app.kill('SIGTERM')
  }
  for (const server of servers) server.close()
  if (configDir) rmSync(configDir, { recursive: true, force: true })
  configDir = null
}

function exit(code) {
  cleanup()
  process.exit(code)
}

async function main() {
  if (!existsSync(ENTRY)) {
    console.error('.output is missing: run `npm run build` first.')
    process.exit(1)
  }
  const port = frontPort()
  const origin = `http://localhost:${port}`
  const qbitPort = await freePort()
  const appPort = await freePort()
  await listen(fakeQbit, qbitPort, LOOPBACK)

  configDir = mkdtempSync(join(tmpdir(), 'rt-fake-qbit-'))
  const env = { ...process.env }
  for (const name of APP_ENV) delete env[name]
  app = spawn(process.execPath, [ENTRY], {
    cwd: ROOT,
    env: {
      ...env,
      QBIT_URL: `http://${LOOPBACK}:${qbitPort}`,
      QBIT_USERNAME: USERNAME,
      QBIT_PASSWORD: PASSWORD,
      SESSION_SECRET: randomBytes(32).toString('base64'),
      APP_ORIGINS: origin,
      SAVE_ROOTS: '/data',
      CONFIG_DIR: configDir,
      HOST: LOOPBACK,
      PORT: String(appPort),
    },
    stdio: ['ignore', 'inherit', 'inherit'],
  })

  let stopping = false
  process.on('SIGINT', () => {
    stopping = true
    exit(0)
  })
  process.on('SIGTERM', () => {
    stopping = true
    exit(0)
  })
  app.once('exit', (code, signal) => {
    if (stopping) return
    console.error(`app server exited (${code ?? signal})`)
    exit(code === 0 ? 0 : 1)
  })

  await waitForHealthz(`http://${LOOPBACK}:${appPort}`, app)
  const v4 = createServer(frontHandler(appPort))
  await listen(v4, port, LOOPBACK)
  servers.push(v4)
  // `localhost` may resolve to ::1 first; listen there too when the machine
  // has IPv6 loopback. Any other error (the port taken) is fatal.
  const v6 = createServer(frontHandler(appPort))
  try {
    await listen(v6, port, '::1')
    servers.push(v6)
  } catch (error) {
    if (!['EADDRNOTAVAIL', 'EAFNOSUPPORT'].includes(error?.code)) throw error
  }

  console.log(`
fake qBittorrent is up. Open ${origin}/
  username: ${USERNAME}
  password: ${PASSWORD}
switch modes:
  curl -X POST '${origin}/__fake/mode?qbit=normal&front=normal'
  qbit:  normal | alt | firewalled | disconnected | slow | down
  front: normal | down | cloudflare | cloudflare-redirect | cloudflare-html
Ctrl+C stops everything.`)
}

main().catch((error) => {
  console.error(error)
  exit(1)
})
