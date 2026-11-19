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
//          (hashes 0x3001 to 0x300c: 下載中, 抓種子資訊中, 排隊中, 檢查檔
//          案中, 已暫停, 停滯, 做種中, 已完成, 找不到檔案, 錯誤, 狀態不明,
//          已整理); the first has a long save path with Chinese in it;
//          story 2.10 adds a 13th (0x300d), another 錯誤 whose log reason
//          has a fake path and a 203.0.113.x address (never shown)
//          categories (story 3.2): 22 code-name categories (mteam-X,
//          mteam-tv, X, cat-01 to cat-16, uncategorized, a markup name,
//          2024)
//          of 1 to 4 torrents each, plus `only-archived` with one archived
//          torrent, so the desktop tab row overflows; categories-emptied:
//          the same without mteam-X
//   grow:  0 | 1 (1: each maindata request adds one newer torrent)
//   ops:   normal | reject | slow (story 2.6: reject answers torrents/stop
//          and torrents/start, story 4.3 torrents/delete too, with HTTP
//          400, which the container maps to qbit_rejected; slow: see 4.3
//          below)
//   files: normal | slow | fail (story 2.7: slow delays torrents/files
//          25 s, fail answers it with HTTP 500, which the container maps
//          to qbit_rejected; for the loading and failure screenshots)
//   Story 4.3: ops=slow delays torrents/stop, /start and /delete 12 s
//   (past the dialog's 10 s 「還在等 NAS 回應」), then applies them.
//   Any `data` parameter (even the current one) also clears the deleted
//   torrents, the stop/start state overrides, the file priorities set, the call log, the
//   torrents/files request log and the log/main request log below.
// Story 2.6: POST /api/v2/torrents/stop and /start (cookie required, form
// field `hashes`, `|` between) record each call and override those
// torrents' states for the next maindata: stop gives stoppedUP when complete
// else stoppedDL; start gives uploading when complete else downloading.
// Story 4.3: POST /api/v2/torrents/delete (cookie required, form fields
// `hashes` with `|` between and `deleteFiles` true or false) logs
// `{ op: 'delete', hashes, deleteFiles }` and drops those torrents from
// every later maindata until the next `data` change; `ops=reject` answers
// 400 and logs it with `rejected: true`. Another device's delete (the
// selection emptying under an open dialog) is a loopback-only control
// that drops torrents without logging a call:
//   curl -X POST 'http://localhost:3100/__fake/remove?hashes=<a>|<b>'
// Story 2.7: GET /api/v2/torrents/files?hash= (cookie required) answers
// deterministic fake files for every torrent of the data set (fake names
// under the torrent's own name, so only code-name paths); sample E03 has
// 1000 files (the virtualisation check), a torrent still fetching its
// metadata has none, an unknown hash is 404. POST /api/v2/torrents/filePrio
// (form fields hash, id with `|` between, priority) records each call and
// sets those files' priority for the next files answer; a missing or empty
// id or priority, a non-integer id or a priority other than 0, 1, 6, 7 is
// 400, an unknown torrent 404, an unknown file id 409, and `ops=reject`
// answers 400; every call not applied is logged with `rejected: true`. The
// hashes torrents/files was asked for: curl 'http://localhost:3100/__fake/files'
// The calls (loopback only, rejected ones marked `rejected: true`):
//   curl 'http://localhost:3100/__fake/ops'
// Story 2.10: GET /api/v2/log/main (cookie required) answers one fake log
// for all data sets: a normal, an info and a critical line, a warning
// about a torrent that is not errored, and for each `error` torrent of
// `many`, `states` and `sample` an older 「File error alert」 (Permission
// denied) then a newer line: 「File error alert」 with No such file or
// directory and fake /data paths for many's markup name (picked by name), a
// 「Torrent errored」 upload-only line with No space left on device for the
// others (states' Fake.State.10.Error), and for states' 0x300d an unknown
// reason with a fake path and 203.0.113.7 (the allow-list shows nothing).
// Every line is newer than every
// fake torrent's added_on. Ids start at 0 and never change;
// `last_known_id` (default -1) and the `normal`, `info`, `warning`,
// `critical` flags (default true) filter like qBittorrent 5.1.4. Every
// request (its `last_known_id` and time) is logged:
//   curl 'http://localhost:3100/__fake/log'
// Story 3.1: the app's settings.json lives in the temporary CONFIG_DIR; a
// reset removes it (and any kept broken copy), so the next read writes the
// defaults (the e2e fixtures reset before every test):
//   curl -X POST 'http://localhost:3100/__fake/settings?reset=1'
import { spawn } from 'node:child_process'
import { randomBytes } from 'node:crypto'
import { existsSync, mkdtempSync, readdirSync, rmSync } from 'node:fs'
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
/**
 * Story 4.3 `ops=slow`: operations answer after this long, past the
 * dialog's 10 s 「還在等 NAS 回應」 and well inside the 30 s timeout.
 */
const OPS_SLOW_MS = 12_000
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
  'categories',
  'categories-emptied',
])
const GROW_MODES = new Set(['0', '1'])
const OPS_MODES = new Set(['normal', 'reject', 'slow'])
const FILES_MODES = new Set(['normal', 'slow', 'fail'])
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
const mode = {
  qbit: 'normal',
  front: 'normal',
  data: 'sample',
  grow: '0',
  ops: 'normal',
  files: 'normal',
}

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
      state: 'downloading',
      private: false,
      dlspeed: 6_510_000,
      eta: 2040,
      progress: 0.87,
      category: 'mteam-tv',
      num_seeds: 12,
      num_leechs: 2,
      save_path:
        '/data/media/tv/假影集.第一季.Fake.Show.Season.Pack.2160p.WEB-DL',
    },
  ],
  [
    'Meta',
    {
      state: 'metaDL',
      private: false,
      progress: 0,
      size: 0,
      category: 'mteam-tv',
    },
  ],
  [
    'Queued',
    { state: 'queuedDL', private: false, progress: 0.12, category: 'mteam-tv' },
  ],
  [
    'Checking',
    {
      state: 'checkingDL',
      private: false,
      progress: 0.45,
      category: 'mteam-tv',
    },
  ],
  [
    'Paused',
    {
      state: 'stoppedDL',
      private: false,
      progress: 0.87,
      category: 'mteam-tv',
    },
  ],
  [
    'Stalled',
    { state: 'stalledDL', private: false, progress: 0.87, category: 'mteam-X' },
  ],
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
      num_seeds: 0,
      num_leechs: 3,
    },
  ],
  [
    'Done',
    {
      state: 'stoppedUP',
      private: false,
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
  [
    'Error',
    { state: 'error', private: false, progress: 0.3, category: 'mteam-tv' },
  ],
  [
    'Unknown',
    { state: 'unknown', private: false, progress: 0.1, category: 'mteam-tv' },
  ],
  [
    'Archived',
    {
      state: 'missingFiles',
      private: false,
      progress: 1,
      completion_on: Math.floor(Date.UTC(2025, 6, 18, 4, 0) / 1000),
      category: 'X',
      save_path: '/data/media/X',
    },
  ],
  // Story 2.10: a second `error` torrent whose log reason the allow-list
  // never shows (an unknown reason with a fake path and a documentation
  // address): the fixed text stays.
  [
    'ErrorUnknown',
    { state: 'error', private: false, progress: 0.6, category: 'X' },
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

// Story 3.2 `data=categories`: enough categories to overflow the desktop
// tab row. Code names only: mteam-X, mteam-tv, X, cat-01 to cat-16, the
// uncategorized key '', a markup name (shown as plain text), `2024` (a
// name the router reads as a number when typed in a URL) and
// `only-archived`, which holds archived torrents only (its tab reads 0).
// Each category holds 1 to 4 torrents, alternately downloading and
// seeding. `categories-emptied` is the same set without mteam-X (the
// selected category emptying on screen).
const CATEGORY_NAMES = [
  'mteam-X',
  'mteam-tv',
  'X',
  ...Array.from(
    { length: 16 },
    (_, index) => `cat-${String(index + 1).padStart(2, '0')}`,
  ),
  '',
  '<script>alert(1)</script>',
  // A name the router parses as a number from a typed URL.
  '2024',
]
const CATEGORY_SET = CATEGORY_NAMES.flatMap((category, c) =>
  Array.from({ length: (c % 4) + 1 }, (_, i) => {
    const seeding = i % 2 === 1
    return torrent(0x4000 + c * 16 + i, {
      name: `Fake.Cat${String(c + 1).padStart(2, '0')}.S01E0${i + 1}.1080p`,
      category,
      state: seeding ? 'uploading' : 'downloading',
      progress: seeding ? 1 : 0.25 + i * 0.2,
      dlspeed: seeding ? 0 : 1_500_000,
      eta: seeding ? 8_640_000 : 1800 * (i + 1),
      completion_on: seeding ? BASE_TIME - c * HOUR : -1,
      seeding_time: seeding ? (c + 1) * (i + 1) * 6 * HOUR : 0,
      ratio: seeding ? 0.5 + c / 10 : 0,
    })
  }),
)
const CATEGORIES_DATA = Object.fromEntries([
  ...CATEGORY_SET,
  torrent(0x4fff, {
    name: 'Fake.Archived.Only.1080p',
    category: 'only-archived',
    state: 'missingFiles',
    progress: 1,
    private: false,
  }),
])
const CATEGORIES_EMPTIED = Object.fromEntries(
  Object.entries(CATEGORIES_DATA).filter(
    ([, value]) => value.category !== 'mteam-X',
  ),
)

const DATA = {
  sample: SAMPLE,
  states: STATES,
  many: MANY,
  empty: {},
  archived: ARCHIVED,
  calm: CALM,
  categories: CATEGORIES_DATA,
  'categories-emptied': CATEGORIES_EMPTIED,
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

/** Story 2.6: state codes set by stop/start calls, by hash. */
const stateOverrides = new Map()
/** Stories 2.6, 2.7: every stop/start and filePrio call, oldest first. */
const opLog = []
/** Story 4.3: torrents deleted (by the app or "another device"). */
const removed = new Set()
/**
 * Story 4.3: bumped by every `data` change, so an `ops=slow` call still
 * waiting across a reset does not apply to the next test's data.
 */
let dataEpoch = 0

function withoutRemoved(torrents) {
  if (removed.size === 0) return torrents
  return Object.fromEntries(
    Object.entries(torrents).filter(([key]) => !removed.has(key)),
  )
}

function withOverrides(torrents) {
  if (stateOverrides.size === 0) return torrents
  const out = { ...torrents }
  for (const [key, state] of stateOverrides) {
    if (out[key]) out[key] = { ...out[key], state }
  }
  return out
}

function currentTorrents(tick) {
  const base = DATA[mode.data]
  const torrents = mode.data === 'many' ? withSpeeds(base, tick) : base
  return withoutRemoved(
    withOverrides(growCount > 0 ? { ...torrents, ...grown } : torrents),
  )
}

const OP_PATHS = {
  '/api/v2/torrents/stop': 'stop',
  '/api/v2/torrents/start': 'start',
  '/api/v2/torrents/delete': 'delete',
}

/**
 * qBittorrent checks these before "stopped", so a stop or start leaves the
 * state code as it was (TorrentImpl::updateState); the fake does the same.
 */
const KEPT_STATES = new Set(['error', 'missingFiles'])

/**
 * Story 4.3: delete: record the call (with `deleteFiles`) and drop the
 * torrents from later maindata.
 */
function applyDelete(hashes, deleteFiles) {
  opLog.push({ op: 'delete', hashes, deleteFiles })
  for (const key of hashes) removed.add(key)
}

/** stop/start: record the call and override the states it names. */
function applyOp(op, hashes) {
  opLog.push({ op, hashes })
  const torrents = currentTorrents(rid)
  for (const key of hashes) {
    const torrent = torrents[key]
    if (!torrent || KEPT_STATES.has(torrent.state)) continue
    const complete = torrent.progress >= 1
    stateOverrides.set(
      key,
      op === 'stop'
        ? complete
          ? 'stoppedUP'
          : 'stoppedDL'
        : complete
          ? 'uploading'
          : 'downloading',
    )
  }
}

// Story 2.7: torrents/files and torrents/filePrio.
const MANY_FILES = 1000
const MANY_FILES_HASH = hash(3)
const FILE_PRIORITY_VALUES = new Set([0, 1, 6, 7])
/** Priorities set by filePrio calls: hash -> (index -> priority). */
const filePriorities = new Map()
/** Every torrents/files request's hash, oldest first (`/__fake/files`). */
const filesLog = []

/** The fake files of one torrent, deterministic per hash, before calls. */
function baseFiles(key, torrent) {
  if (torrent.state === 'metaDL' || torrent.state === 'forcedMetaDL') return []
  const root = torrent.name
  const seed = Number.parseInt(key.slice(-4), 16)
  const count = key === MANY_FILES_HASH ? MANY_FILES : 3 + (seed % 4)
  const files = []
  for (let index = 0; index < count; index += 1) {
    const episode = String(index + 1).padStart(count > 99 ? 4 : 2, '0')
    const name =
      index === count - 1 && count < MANY_FILES
        ? `${root}/Extras/${root}.Extras.Trailer.mkv`
        : `${root}/${root}.E${episode}.mkv`
    const progress =
      torrent.progress >= 1 ? 1 : ((index * 37 + seed) % 100) / 100
    files.push({
      index,
      name,
      size: (300 + ((index * 131 + seed) % 3700)) * 1024 ** 2,
      progress,
      // The trailer is unticked, the second file 高, the rest 一般.
      priority: name.includes('Trailer') ? 0 : index === 1 ? 6 : 1,
      is_seed: progress >= 1,
      piece_range: [index * 10, index * 10 + 9],
      availability: 1.5,
    })
  }
  return files
}

function filesOf(key) {
  const torrent = currentTorrents(rid)[key]
  if (!torrent) return null
  const set = filePriorities.get(key)
  return baseFiles(key, torrent).map((file) =>
    set?.has(file.index) ? { ...file, priority: set.get(file.index) } : file,
  )
}

/** filePrio's status as qBittorrent 5.1.4 would answer it, before applying. */
function filePrioStatus(key, idField, priorityField) {
  // A missing or empty field, or an id that is not a whole number: 400.
  if (!idField || !priorityField) return 400
  const parts = idField.split('|')
  if (!parts.every((part) => /^\d+$/.test(part))) return 400
  if (!/^-?\d+$/.test(priorityField)) return 400
  if (!FILE_PRIORITY_VALUES.has(Number(priorityField))) return 400
  const files = filesOf(key)
  if (files === null) return 404
  if (!parts.every((part) => Number(part) < files.length)) return 409
  return 200
}

/** filePrio: logs the call (anything not applied as `rejected: true`). */
function applyFilePrio(form) {
  const key = form.get('hash') ?? ''
  const idField = form.get('id')
  const priorityField = form.get('priority')
  const ids = (idField ?? '').split('|').filter(Boolean).map(Number)
  const priority = Number(priorityField)
  const status =
    mode.ops === 'reject' ? 400 : filePrioStatus(key, idField, priorityField)
  const call = { op: 'filePrio', hash: key, ids, priority }
  opLog.push(status === 200 ? call : { ...call, rejected: true })
  if (status !== 200) return status
  const set = filePriorities.get(key) ?? new Map()
  for (const id of ids) set.set(id, priority)
  filePriorities.set(key, set)
  return 200
}

// Story 2.10: qBittorrent's log (WARNING lines name torrents by name).
const LOG_TYPES = { normal: 1, info: 2, warning: 4, critical: 8 }
/** Every log/main request, oldest first (`/__fake/log`). */
const logLog = []

function fileErrorLine(name, reason) {
  const file = `/data/media/X/incompleted/${name}/${name}.mkv`
  return `File error alert. Torrent: "${name}". File: "${file}". Reason: "${name} file_open (${file}) error: ${reason}"`
}

/**
 * The fake log, oldest first, ids from 0: one history for every data set
 * (qBittorrent's log outlives what the torrent list shows), so the
 * container's cached reasons hold whichever data set is on. Built once.
 */
let fakeLog = null

function logLines() {
  if (fakeLog) return fakeLog
  const errored = [MANY, STATES, SAMPLE]
    .flatMap((set) => Object.values(set))
    .filter((torrent) => torrent.state === 'error')
  const lines = [
    [LOG_TYPES.normal, 'qBittorrent v5.1.4 started'],
    [LOG_TYPES.info, 'Fake info line'],
    [
      LOG_TYPES.warning,
      'Fast resume data was rejected. Torrent: "Fake.Show.S01E01.1080p". Reason: "fake"',
    ],
  ]
  for (const torrent of errored) {
    lines.push([
      LOG_TYPES.warning,
      fileErrorLine(torrent.name, 'Permission denied'),
    ])
  }
  lines.push([LOG_TYPES.critical, 'Fake critical line'])
  for (const torrent of errored) {
    lines.push([
      LOG_TYPES.warning,
      torrent.name.includes('ErrorUnknown')
        ? `Torrent errored. Torrent: "${torrent.name}". Error: "fake tracker 203.0.113.7 refused /data/media/X/incompleted/${torrent.name}.mkv"`
        : // many's errored torrent (the e2e expects this reason on it).
          torrent.name === MARKUP_NAMES[1]
          ? fileErrorLine(torrent.name, 'No such file or directory')
          : `Torrent errored. Torrent: "${torrent.name}". Error: "Couldn't write to file. Reason: \"No space left on device\". Torrent is now in \"upload only\" mode."`,
    ])
  }
  // Written after every fake torrent was added: a line older than its
  // torrent belongs to an earlier one of that name (the container drops it).
  const start =
    Math.max(
      ...[MANY, STATES, SAMPLE].flatMap((set) =>
        Object.values(set).map((torrent) => torrent.added_on),
      ),
    ) + 60
  fakeLog = lines.map(([type, message], id) => ({
    id,
    message,
    timestamp: start + id,
    type,
  }))
  return fakeLog
}

/** log/main as qBittorrent answers it: newer than last_known_id, by flag. */
function logAnswer(params) {
  const flag = (name) => params.get(name) !== 'false'
  const lastKnownId = Number(params.get('last_known_id') ?? '-1')
  logLog.push({ lastKnownId, at: Date.now() })
  const shown = new Set(
    Object.entries(LOG_TYPES)
      .filter(([name]) => flag(name))
      .map(([, type]) => type),
  )
  return logLines().filter(
    (line) => line.id > lastKnownId && shown.has(line.type),
  )
}

const CATEGORIES = {
  X: { name: 'X', savePath: '/data/media/X' },
  'mteam-X': { name: 'mteam-X', savePath: '/data/torrent/mteam-seed' },
  'mteam-tv': { name: 'mteam-tv', savePath: '/data/torrent/mteam-seed' },
  // Story 3.3: a category no torrent uses (no tab, listed on the settings
  // page).
  'X-empty': { name: 'X-empty', savePath: '/data/media/X-empty' },
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
  if (req.method === 'POST' && Object.hasOwn(OP_PATHS, url.pathname)) {
    if (!/(^|;\s*)SID=fake(;|$)/.test(req.headers.cookie ?? ''))
      return send(res, 403, 'Forbidden')
    const form = new URLSearchParams(await readBody(req))
    const hashes = (form.get('hashes') ?? '').split('|').filter(Boolean)
    const op = OP_PATHS[url.pathname]
    const deleteFiles = form.get('deleteFiles')
    if (op === 'delete' && deleteFiles !== 'true' && deleteFiles !== 'false')
      return send(res, 400, 'Bad Request')
    const extra = op === 'delete' ? { deleteFiles: deleteFiles === 'true' } : {}
    if (mode.ops === 'reject') {
      // Logged too, so a test can see 重試 really sent again.
      opLog.push({ op, hashes, ...extra, rejected: true })
      return send(res, 400, 'Bad Request')
    }
    if (mode.ops === 'slow') {
      const epoch = dataEpoch
      await new Promise((resolve) => setTimeout(resolve, OPS_SLOW_MS))
      if (epoch !== dataEpoch) return send(res, 200, '')
    }
    if (op === 'delete') applyDelete(hashes, deleteFiles === 'true')
    else applyOp(op, hashes)
    return send(res, 200, '')
  }
  if (req.method === 'GET' && url.pathname === '/api/v2/torrents/files') {
    if (!/(^|;\s*)SID=fake(;|$)/.test(req.headers.cookie ?? ''))
      return send(res, 403, 'Forbidden')
    filesLog.push(url.searchParams.get('hash') ?? '')
    if (mode.files === 'slow') {
      await new Promise((resolve) => setTimeout(resolve, SLOW_MS))
    }
    if (mode.files === 'fail') return send(res, 500, 'Internal Server Error')
    const files = filesOf(url.searchParams.get('hash') ?? '')
    if (files === null) return send(res, 404, 'Not Found')
    return send(res, 200, JSON.stringify(files), {
      'content-type': 'application/json',
    })
  }
  if (req.method === 'POST' && url.pathname === '/api/v2/torrents/filePrio') {
    if (!/(^|;\s*)SID=fake(;|$)/.test(req.headers.cookie ?? ''))
      return send(res, 403, 'Forbidden')
    const status = applyFilePrio(new URLSearchParams(await readBody(req)))
    return send(res, status, status === 200 ? '' : 'Rejected')
  }
  if (req.method === 'GET' && url.pathname === '/api/v2/log/main') {
    if (!/(^|;\s*)SID=fake(;|$)/.test(req.headers.cookie ?? ''))
      return send(res, 403, 'Forbidden')
    return send(res, 200, JSON.stringify(logAnswer(url.searchParams)), {
      'content-type': 'application/json',
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
      ops: OPS_MODES,
      files: FILES_MODES,
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
    // Any data parameter starts from the data set as written.
    if (next.data) {
      dataEpoch += 1
      removed.clear()
      stateOverrides.clear()
      filePriorities.clear()
      filesLog.length = 0
      opLog.length = 0
      logLog.length = 0
    }
    Object.assign(mode, next)
    console.log(
      `mode: qbit=${mode.qbit} front=${mode.front} data=${mode.data} grow=${mode.grow} ops=${mode.ops} files=${mode.files}`,
    )
  } else if (req.method !== 'GET') {
    return send(res, 405, 'POST or GET\n')
  }
  send(res, 200, `${JSON.stringify(mode)}\n`, {
    'content-type': 'application/json',
  })
}

/**
 * Story 4.3: another device deletes these torrents (loopback only, POST,
 * `hashes` with `|` between); not logged as a call.
 */
function controlRemove(req, res, url) {
  if (!isLoopback(req.socket.remoteAddress))
    return send(res, 403, 'loopback only\n')
  if (req.method !== 'POST') return send(res, 405, 'POST\n')
  const hashes = (url.searchParams.get('hashes') ?? '')
    .split('|')
    .filter(Boolean)
  for (const key of hashes) removed.add(key)
  send(res, 200, `${JSON.stringify({ removed: hashes })}\n`, {
    'content-type': 'application/json',
  })
}

/** Stories 2.6, 2.7: the stop/start and filePrio calls so far (loopback only, GET). */
function controlOps(req, res) {
  if (!isLoopback(req.socket.remoteAddress))
    return send(res, 403, 'loopback only\n')
  if (req.method !== 'GET') return send(res, 405, 'GET\n')
  send(res, 200, `${JSON.stringify({ calls: opLog })}\n`, {
    'content-type': 'application/json',
  })
}

/** Story 2.7: the hashes torrents/files was asked for (loopback only, GET). */
function controlFiles(req, res) {
  if (!isLoopback(req.socket.remoteAddress))
    return send(res, 403, 'loopback only\n')
  if (req.method !== 'GET') return send(res, 405, 'GET\n')
  send(res, 200, `${JSON.stringify({ requests: filesLog })}\n`, {
    'content-type': 'application/json',
  })
}

/** Story 2.10: every log/main request so far (loopback only, GET). */
function controlLog(req, res) {
  if (!isLoopback(req.socket.remoteAddress))
    return send(res, 403, 'loopback only\n')
  if (req.method !== 'GET') return send(res, 405, 'GET\n')
  send(res, 200, `${JSON.stringify({ requests: logLog })}\n`, {
    'content-type': 'application/json',
  })
}

/** Story 3.1: removes the app's settings files (loopback only, POST). */
function controlSettings(req, res, url) {
  if (!isLoopback(req.socket.remoteAddress))
    return send(res, 403, 'loopback only\n')
  if (req.method !== 'POST') return send(res, 405, 'POST\n')
  if (url.searchParams.get('reset') !== '1' || !configDir) {
    return send(res, 400, 'reset=1\n')
  }
  for (const name of readdirSync(configDir)) {
    if (name.startsWith('settings.json') || name.startsWith('.settings.json')) {
      rmSync(join(configDir, name), { force: true })
    }
  }
  send(res, 200, 'ok\n')
}

function frontHandler(appPort) {
  return (req, res) => {
    const url = new URL(req.url ?? '/', 'http://front')
    if (url.pathname === '/__fake/mode') return controlMode(req, res, url)
    if (url.pathname === '/__fake/ops') return controlOps(req, res)
    if (url.pathname === '/__fake/remove') return controlRemove(req, res, url)
    if (url.pathname === '/__fake/files') return controlFiles(req, res)
    if (url.pathname === '/__fake/log') return controlLog(req, res)
    if (url.pathname === '/__fake/settings') {
      return controlSettings(req, res, url)
    }
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
  curl -X POST '${origin}/__fake/mode?qbit=normal&front=normal&data=sample&grow=0&ops=normal&files=normal'
  qbit:  normal | alt | firewalled | disconnected | slow | down | rejected
  front: normal | down | cloudflare | cloudflare-redirect | cloudflare-html
  data:  sample | many | empty | archived | calm | states | categories | categories-emptied
  grow:  0 | 1
  ops:   normal | reject
  files: normal | slow | fail
stop/start and filePrio calls: curl '${origin}/__fake/ops'
torrents/files requests: curl '${origin}/__fake/files'
reset settings.json: curl -X POST '${origin}/__fake/settings?reset=1'
Ctrl+C stops everything.`)
}

main().catch((error) => {
  console.error(error)
  exit(1)
})
