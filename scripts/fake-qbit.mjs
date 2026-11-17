// Fake qBittorrent for screenshots and browser checks (specs 1.7, 1.8) and
// the Playwright browser smoke (story 2.0). It may run locally and in CI.
// AD-15: it only ever talks to the fake qBittorrent it starts itself: the
// app's QBIT_URL is built from that server's own loopback address, the
// inherited app variables are removed, and .env is never read. No
// dependencies. Never imported from src/, never shipped in .output. Fake
// data only: code-name categories (X, mteam-X, mteam-tv), fake paths and
// fake hashes.
//
// 1. Starts a fake qBittorrent on a free loopback port:
//    POST /api/v2/auth/login answers `Ok.` with `Set-Cookie: SID=fake`;
//    GET /api/v2/sync/maindata answers the torrents of the `data` mode and a
//    mode-driven server_state, always as a full update. Every torrent also
//    carries the sort extras (story 2.1): fake `.example` tracker URLs with
//    a fake `passkey=`, fake comments, content paths under /data, fake
//    magnet links, and qBittorrent's special values (-1, -2, 0).
// 2. Boots the built server (.output/server/index.mjs) with fake env, the
//    inherited app variables removed (like scripts/smoke-built-server.mjs).
// 3. Runs a front proxy on http://localhost:<port> (default 3100) that
//    forwards to it and can pretend to be a broken path from outside.
//
// Usage: npm run fake-qbit [-- --port 3100]  (also --port=3100)
// Switch modes (loopback only; any subset of the parameters):
//   curl -X POST 'http://localhost:3100/__fake/mode?qbit=normal&front=normal&data=sample&grow=0'
//   qbit:  normal | alt | firewalled | disconnected | slow | down | rejected
//          (slow delays maindata 25 s; down closes every connection;
//          rejected answers maindata with 200 `not json`, so the container
//          returns qbit_rejected)
//   front: normal | down | cloudflare | cloudflare-redirect | cloudflare-html
//          (down answers 502 to server function calls; the three Cloudflare
//          forms answer requests with X-Requested-With with a 401, a 302 to
//          an Access login page, or a 200 HTML login page)
//   data:  sample | many | empty | archived | calm
//          (sample: six torrents, two archived, 「全部 4」; many: 4165
//          visible plus 50 archived, the newest 12 cover every status, a
//          name over 200 characters and three markup names, speeds change on
//          every request; empty: none; archived: only archived ones; calm
//          (story 2.3): nothing stalled or errored, so the board's 要處理
//          column is empty: one torrent each downloading, seeding and done,
//          plus one archived)
//          states (story 2.5): one torrent per detail hero row, 12 in all
//          (hashes 3001 to 3012 in hex: 下載中, 抓種子資訊中, 排隊中, 檢查檔
//          案中, 已暫停, 停滯, 做種中, 已完成, 找不到檔案, 錯誤, 狀態不明,
//          已整理); the first has a long save path with Chinese in it
//   grow:  0 | 1 (1: each maindata request adds one newer torrent)
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
  'rejected',
])
const DATA_MODES = new Set([
  'sample',
  'many',
  'empty',
  'archived',
  'calm',
  'states',
])
const GROW_MODES = new Set(['0', '1'])
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
const mode = { qbit: 'normal', front: 'normal', data: 'sample', grow: '0' }

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
const DAY = 24 * HOUR
const BASE_TIME = Math.floor(Date.UTC(2026, 10, 15, 1, 0, 0) / 1000)
const TRACKERS = [
  'https://tracker.example/announce?passkey=fake-passkey-0000',
  'udp://open.tracker.example:1337/announce',
  'https://pt.mteam.example/announce.php?passkey=fake-passkey-1111',
  '',
]

/**
 * The sort extras (story 2.1), varied by `n` so every extra sort orders
 * something: fake `.example` trackers with a fake `passkey=` (the container
 * must reduce them to the hostname), fake comments, fake content paths under
 * /data, and qBittorrent's special values (-1, -2, 0) on some torrents.
 */
function extras(n, fields) {
  const name = fields.name ?? `Fake.Show.S01E0${n}.1080p`
  const savePath = fields.save_path ?? '/data/media/X/incompleted'
  const size = fields.size ?? 4 * 1024 ** 3
  const progress = fields.progress ?? 0.5
  const timeActive = (n % 97) * HOUR + (n % 13) * 60
  return {
    total_size: size + (n % 5) * 1024 ** 3,
    amount_left: Math.round(size * (1 - progress)),
    downloaded: Math.round(size * progress),
    uploaded: Math.round(size * (fields.ratio ?? 0)),
    downloaded_session: (n % 7) * 1024 ** 2,
    uploaded_session: (n % 11) * 1024 ** 2,
    time_active: timeActive,
    last_activity: BASE_TIME - (n % 50) * HOUR,
    seen_complete: n % 6 === 0 ? 0 : BASE_TIME - (n % 30) * DAY,
    availability: progress >= 1 ? -1 : ((n * 37) % 300) / 100,
    popularity: ((n * 13) % 500) / 100,
    num_seeds: n % 9,
    num_leechs: n % 4,
    num_complete: n % 10 === 0 ? -1 : (n * 7) % 120,
    num_incomplete: (n * 3) % 40,
    tracker: TRACKERS[n % TRACKERS.length],
    trackers_count: n % TRACKERS.length === 3 ? 0 : 1 + (n % 3),
    content_path: `${savePath.replace(/\/$/, '')}/${name}`,
    root_path: n % 4 === 0 ? '' : `${savePath.replace(/\/$/, '')}/${name}`,
    dl_limit: n % 5 === 0 ? 2 * 1024 ** 2 : -1,
    up_limit: n % 7 === 0 ? 512 * 1024 : 0,
    ratio_limit: n % 3 === 0 ? 2 : -2,
    seeding_time_limit: n % 4 === 0 ? 7 * 24 * 60 : -2,
    inactive_seeding_time_limit: n % 6 === 0 ? 24 * 60 : -1,
    priority: progress < 1 ? (n % 12) + 1 : 0,
    reannounce: (n * 61) % 1800,
    infohash_v1: hash(n),
    infohash_v2: n % 2 === 0 ? n.toString(16).padStart(64, 'e') : '',
    has_metadata: fields.state !== 'metaDL',
    comment: n % 3 === 0 ? '' : `Fake comment ${n}`,
    magnet_uri: `magnet:?xt=urn:btih:${hash(n)}&tr=fake-magnet-tracker`,
    download_path: '',
    tags: '',
  }
}

function torrent(n, fields) {
  return [
    hash(n),
    {
      ...extras(n, fields),
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
const SAMPLE = Object.fromEntries([
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

// Spec 1.8 `data=many`: 4165 visible torrents plus 50 archived. Numbers
// from 1000 up so the hashes never meet the sample's.
const MANY_VISIBLE = 4165
const MANY_ARCHIVED = 50
/** Added time of the newest `many` torrent: fixed, so screenshots repeat. */
const MANY_NEWEST = BASE_TIME + 10 * HOUR
const LONG_NAME = `Fake.Long.Name.${'Season.Pack.Extended.Edition.'.repeat(8)}2160p.WEB-DL`
const MARKUP_NAMES = [
  '<script>alert(1)</script>',
  '<img src=x onerror=alert(1)>',
  'javascript:alert(1)',
]
const SEED = {
  category: 'mteam-tv',
  save_path: '/data/torrent/mteam-seed',
  private: true,
}
/** The newest 12, newest first: every status the list draws. */
const NEWEST = [
  { state: 'downloading', progress: 0.87, eta: 2040 },
  { name: MARKUP_NAMES[0], state: 'pausedDL', progress: 0.45 },
  { name: LONG_NAME, state: 'stalledDL', progress: 0.87, category: 'mteam-X' },
  {
    ...SEED,
    state: 'uploading',
    progress: 1,
    ratio: 3.12,
    seeding_time: 41 * DAY,
  },
  {
    state: 'stoppedUP',
    progress: 1,
    ratio: 0.88,
    completion_on: MANY_NEWEST - HOUR,
  },
  { name: MARKUP_NAMES[1], state: 'error', progress: 0.3 },
  { ...SEED, state: 'missingFiles', progress: 1, ratio: 1 },
  { state: 'moving', progress: 1, ratio: -1 },
  { name: MARKUP_NAMES[2], state: 'unknown', progress: 0.1 },
  { state: 'downloading', progress: 0, eta: 8_640_000 },
  { state: 'queuedDL', progress: 0.12, category: 'mteam-X' },
  {
    ...SEED,
    state: 'stalledUP',
    progress: 1,
    ratio: 1.42,
    seeding_time: 9 * DAY,
  },
]
const BULK_STATES = [
  'stoppedUP',
  'uploading',
  'stalledUP',
  'pausedDL',
  'downloading',
]

function manyTorrent(index) {
  const n = 1000 + index
  const added_on = MANY_NEWEST - index * 47 * 60
  const base = {
    name: `Fake.Show.${n}.S01E${String((index % 24) + 1).padStart(2, '0')}.1080p`,
    state: BULK_STATES[index % BULK_STATES.length],
    progress: 1,
    size: (2 + (index % 40)) * 1024 ** 3,
    ratio: (index % 300) / 100,
    added_on,
    completion_on: added_on + HOUR,
    seeding_time: (index % 400) * DAY,
    save_path:
      index % 3 === 0
        ? '/data/torrent/mteam-seed'
        : '/data/media/X/incompleted',
    category: ['X', 'mteam-X', 'mteam-tv'][index % 3],
    private: index % 3 === 0,
  }
  if (base.state === 'pausedDL' || base.state === 'downloading') {
    base.progress = ((index * 37) % 100) / 100
    base.completion_on = -1
    base.seeding_time = 0
  }
  const fields = { ...base, ...(NEWEST[index] ?? {}) }
  // Like qBittorrent: an incomplete torrent never completed or seeded.
  if (fields.progress < 1) {
    fields.completion_on = -1
    fields.seeding_time = 0
  }
  return torrent(n, fields)
}

const MANY = Object.fromEntries([
  ...Array.from({ length: MANY_VISIBLE }, (_, index) => manyTorrent(index)),
  ...Array.from({ length: MANY_ARCHIVED }, (_, index) =>
    torrent(9000 + index, {
      name: `Fake.Archived.${index}.1080p`,
      state: 'missingFiles',
      progress: 1,
      added_on: MANY_NEWEST - (index + 1) * 13 * 60,
    }),
  ),
])

const ARCHIVED = Object.fromEntries(
  Array.from({ length: 6 }, (_, index) =>
    torrent(9500 + index, {
      name: `Fake.Archived.${index}.1080p`,
      state: 'missingFiles',
      progress: 1,
    }),
  ),
)

const CALM = Object.fromEntries([
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
  torrent(7, {
    state: 'stoppedUP',
    progress: 1,
    ratio: 0.88,
    completion_on: BASE_TIME - 2 * HOUR,
  }),
  torrent(5, { state: 'missingFiles', progress: 1 }),
])

// Story 2.5 `data=states`: one torrent per row of EXPERIENCE 「詳情狀態區每
// 種狀態寫什麼」, fake names and code-name categories only.
const GB = 1024 ** 3
const STATE_ROWS = [
  [
    'Downloading',
    {
      dlspeed: 6_510_000,
      eta: 2040,
      progress: 0.87,
      category: 'mteam-tv',
      save_path:
        '/data/media/tv/假影集.第一季.Fake.Show.Season.Pack.2160p.WEB-DL',
    },
  ],
  ['Meta', { state: 'metaDL', progress: 0, size: 0, category: 'mteam-tv' }],
  ['Queued', { state: 'queuedDL', progress: 0.12, category: 'mteam-tv' }],
  ['Checking', { state: 'checkingDL', progress: 0.45, category: 'mteam-tv' }],
  ['Paused', { state: 'stoppedDL', progress: 0.87, category: 'mteam-tv' }],
  ['Stalled', { state: 'stalledDL', progress: 0.87, category: 'mteam-X' }],
  [
    'Seeding',
    {
      state: 'uploading',
      progress: 1,
      ratio: 3.12,
      upspeed: 2_495_611,
      completion_on: BASE_TIME - 41 * DAY,
      seeding_time: 41 * DAY,
      category: 'mteam-tv',
      save_path: '/data/torrent/mteam-seed',
      private: true,
    },
  ],
  [
    'Done',
    {
      state: 'stoppedUP',
      progress: 1,
      ratio: 3.12,
      completion_on: BASE_TIME - 2 * HOUR,
      category: 'mteam-tv',
    },
  ],
  [
    'MissingFiles',
    {
      state: 'missingFiles',
      progress: 1,
      category: 'mteam-X',
      save_path: '/data/torrent/mteam-seed',
      private: true,
    },
  ],
  ['Error', { state: 'error', progress: 0.3, category: 'mteam-tv' }],
  ['Unknown', { state: 'unknown', progress: 0.1, category: 'mteam-tv' }],
  [
    'Archived',
    {
      state: 'missingFiles',
      progress: 1,
      completion_on: Math.floor(Date.UTC(2025, 6, 18, 4, 0) / 1000),
      category: 'X',
      save_path: '/data/media/X',
    },
  ],
]
const STATES = Object.fromEntries(
  STATE_ROWS.map(([kind, fields], index) => {
    const n = 0x3001 + index
    return torrent(n, {
      name: `Fake.State.${String(index + 1).padStart(2, '0')}.${kind}.1080p`,
      size: 85 * GB,
      ...fields,
    })
  }),
)

const DATA = {
  sample: SAMPLE,
  states: STATES,
  many: MANY,
  empty: {},
  archived: ARCHIVED,
  calm: CALM,
}

/** `grow=1`: one newer torrent per maindata request, newest on top. */
const grown = {}
let growCount = 0

function addGrown() {
  growCount += 1
  const n = 20_000 + growCount
  const [key, value] = torrent(n, {
    name: `Fake.New.${growCount}.S01E01.1080p`,
    progress: 0.01,
    dlspeed: 1_200_000,
    eta: 3600,
    added_on: MANY_NEWEST + growCount * 60,
  })
  grown[key] = value
}

/** In `many`, downloading and seeding speeds move on every request. */
function withSpeeds(torrents, tick) {
  const out = {}
  for (const [key, value] of Object.entries(torrents)) {
    const wave = ((Number.parseInt(key.slice(-4), 16) + tick * 7) % 50) + 1
    if (value.state === 'downloading' && value.progress > 0) {
      out[key] = { ...value, dlspeed: wave * 130_000, upspeed: wave * 3_000 }
    } else if (value.state === 'uploading') {
      out[key] = { ...value, upspeed: wave * 50_000 }
    } else {
      out[key] = value
    }
  }
  return out
}

function currentTorrents(tick) {
  const base = DATA[mode.data]
  const torrents = mode.data === 'many' ? withSpeeds(base, tick) : base
  return growCount > 0 ? { ...torrents, ...grown } : torrents
}

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
    if (mode.qbit === 'rejected') return send(res, 200, 'not json')
    rid += 1
    if (mode.grow === '1') addGrown()
    return send(
      res,
      200,
      JSON.stringify({
        rid,
        full_update: true,
        torrents: currentTorrents(rid),
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
    const allowed = {
      qbit: QBIT_MODES,
      front: FRONT_MODES,
      data: DATA_MODES,
      grow: GROW_MODES,
    }
    const next = {}
    for (const [name, values] of Object.entries(allowed)) {
      const value = url.searchParams.get(name)
      if (value === null) continue
      if (!values.has(value))
        return send(res, 400, `unknown ${name} mode: ${value}\n`)
      next[name] = value
    }
    // A new data set or growth turned off starts without grown torrents.
    if ((next.data && next.data !== mode.data) || next.grow === '0') {
      for (const key of Object.keys(grown)) delete grown[key]
      growCount = 0
    }
    Object.assign(mode, next)
    console.log(
      `mode: qbit=${mode.qbit} front=${mode.front} data=${mode.data} grow=${mode.grow}`,
    )
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
  await listen(fakeQbit, 0, LOOPBACK)
  // The app's only qBittorrent: the fake above, read back from its socket.
  const fakeQbitUrl = `http://${LOOPBACK}:${fakeQbit.address().port}`
  // Picked after the fake listens, so the OS cannot hand out its port.
  const appPort = await freePort()

  configDir = mkdtempSync(join(tmpdir(), 'rt-fake-qbit-'))
  const env = { ...process.env }
  for (const name of APP_ENV) delete env[name]
  app = spawn(process.execPath, [ENTRY], {
    cwd: ROOT,
    env: {
      ...env,
      QBIT_URL: fakeQbitUrl,
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
  curl -X POST '${origin}/__fake/mode?qbit=normal&front=normal&data=sample&grow=0'
  qbit:  normal | alt | firewalled | disconnected | slow | down | rejected
  front: normal | down | cloudflare | cloudflare-redirect | cloudflare-html
  data:  sample | many | empty | archived
  grow:  0 | 1
Ctrl+C stops everything.`)
}

main().catch((error) => {
  console.error(error)
  exit(1)
})
