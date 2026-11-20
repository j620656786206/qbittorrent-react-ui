// Story 4.6 (closes 4.5's deferred browser measurement): reading and
// judging 20 .torrent files of 10 MB must never block the main thread for
// more than 200 ms (epic 4 performance rule). Local only, never in CI.
// Starts scripts/fake-qbit.mjs (fake data only, AD-15: nothing is sent,
// submitting is story 4.7) on a free port, its stderr passed through, and
// opens the add screen in headless Chromium at 1440 x 900. Two sets, each
// picked at once through the hidden file input (`setInputFiles` with paths
// in a temporary folder), each on a freshly opened screen:
// - `single`: 20 v1 single-file torrents of just under 10 MB, the `info`
//   value almost the whole file (the hashing worst case for that size);
// - `many-files`: 20 v1 multi-file torrents under 10 MB with 150,000
//   `files` entries each, so the check of the `files` list (sliced every
//   5000 entries since 80d1c42) is what runs long.
// From the pick until all 20 rows show it records long tasks
// (`PerformanceObserver` `longtask`, every task over 50 ms) and a Chrome
// trace (devtools.timeline and toplevel: each task on the page's main
// thread, found through a `console.timeStamp` marker). Reports the longest
// task of each set. The JSON summary in the committed screenshots folder
// is written only when both sets showed all 20 rows, so a broken run never
// replaces a good record. Exits 1 when a set is incomplete or its longest
// task is 200 ms or more.
//
// Usage: npm run build && node scripts/trace-add-files.mjs

import { spawn } from 'node:child_process'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { createServer } from 'node:net'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { chromium } from '@playwright/test'

const OUT_DIR = '_bmad-output/implementation-artifacts/screenshots/4-6'
const FILES = 20
/** The add screen's limit (`MAX_TORRENT_FILE_BYTES`). */
const MAX_BYTES = 10_485_760
/** Just under the limit. */
const SINGLE_BYTES = MAX_BYTES - 512
const MANY_FILES_ENTRIES = 150_000
const LIMIT_MS = 200
const PIECE_LENGTH = 262_144
/** One main-thread task: `RunTask` in older Chromium, the scheduler's now. */
const TASK_NAMES = new Set(['RunTask', 'ThreadControllerImpl::RunTask'])

const utf8 = new TextEncoder()

/** A bencoded byte string. */
const str = (bytes) =>
  Buffer.concat([Buffer.from(`${bytes.length}:`), Buffer.from(bytes)])
const text = (value) => str(utf8.encode(value))
const int = (value) => Buffer.from(`i${value}e`)

function fakePieces(count, seed) {
  const pieces = Buffer.alloc(count * 20)
  for (let i = 0; i < pieces.length; i++) pieces[i] = (i * 7 + seed) & 0xff
  return pieces
}

/** A torrent around `info` (keys in sorted order, as clients write them). */
function torrent(info) {
  return Buffer.concat([
    Buffer.from('d'),
    text('announce'),
    text('http://tracker.invalid/announce'),
    text('info'),
    info,
    Buffer.from('e'),
  ])
}

/**
 * A valid single-file v1 torrent of about `size` bytes: `pieces` fills the
 * `info` value (fake piece hashes), so nearly every byte is hashed.
 */
function singleOfSize(size, name) {
  const pieceCount = Math.floor((size - 400) / 20)
  return torrent(
    Buffer.concat([
      Buffer.from('d'),
      text('length'),
      int(pieceCount * PIECE_LENGTH),
      text('name'),
      text(name),
      text('piece length'),
      int(PIECE_LENGTH),
      text('pieces'),
      str(fakePieces(pieceCount, name.length)),
      Buffer.from('e'),
    ]),
  )
}

/** A valid multi-file v1 torrent with `entries` files of 1 KiB each. */
function manyFiles(entries, name) {
  const fileLength = 1024
  const files = [Buffer.from('l')]
  for (let i = 0; i < entries; i++) {
    files.push(
      Buffer.from('d'),
      text('length'),
      int(fileLength),
      text('path'),
      Buffer.from('l'),
      text(`e${String(i).padStart(6, '0')}.bin`),
      Buffer.from('e'),
      Buffer.from('e'),
    )
  }
  files.push(Buffer.from('e'))
  const total = entries * fileLength
  return torrent(
    Buffer.concat([
      Buffer.from('d'),
      text('files'),
      ...files,
      text('name'),
      text(name),
      text('piece length'),
      int(PIECE_LENGTH),
      text('pieces'),
      str(fakePieces(Math.ceil(total / PIECE_LENGTH), name.length)),
      Buffer.from('e'),
    ]),
  )
}

/** A port nothing listens on now, from the OS. */
function freePort() {
  return new Promise((resolve, reject) => {
    const probe = createServer()
    probe.once('error', reject)
    probe.listen(0, '127.0.0.1', () => {
      const { port } = probe.address()
      probe.close(() => resolve(port))
    })
  })
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

async function waitForHealth(base, server) {
  for (let i = 0; i < 100; i += 1) {
    if (server.exitCode !== null) {
      throw new Error(`fake-qbit exited (code ${server.exitCode})`)
    }
    try {
      const response = await fetch(`${base}/healthz`)
      if (response.ok) return
    } catch {
      // Not up yet.
    }
    await sleep(200)
  }
  throw new Error('fake-qbit did not start')
}

const folder = mkdtempSync(join(tmpdir(), 'rt-trace-add-'))
function writeSet(label, make) {
  return Array.from({ length: FILES }, (_, index) => {
    const name = `Fake.Trace.${label}.S01E${String(index + 1).padStart(2, '0')}`
    const bytes = make(name)
    if (bytes.length > MAX_BYTES) {
      throw new Error(`${label}: generated file over 10 MB`)
    }
    const path = join(folder, `${name}.torrent`)
    writeFileSync(path, bytes)
    return { path, bytes: bytes.length }
  })
}
const sets = [
  {
    label: 'single',
    description: `${FILES} single-file torrents just under 10 MB`,
    files: writeSet('Single', (name) => singleOfSize(SINGLE_BYTES, name)),
  },
  {
    label: 'many-files',
    description: `${FILES} multi-file torrents of ${MANY_FILES_ENTRIES} files each`,
    files: writeSet('Many', (name) => manyFiles(MANY_FILES_ENTRIES, name)),
  },
]

const port = await freePort()
const base = `http://localhost:${port}`
const server = spawn(
  process.execPath,
  ['scripts/fake-qbit.mjs', '--port', String(port)],
  { stdio: ['ignore', 'ignore', 'inherit'] },
)

/** Picks one set on a freshly opened add screen and measures it. */
async function measure(browser, page, set) {
  const header = page.locator('header')
  const dialog = page.getByRole('dialog', { name: '新增種子' })
  if (await dialog.isVisible()) {
    await page.keyboard.press('Escape')
    await dialog.waitFor({ state: 'detached' })
  }
  await header.getByRole('button', { name: '新增', exact: true }).click()
  await dialog.waitFor()
  // The page's entrance and the dialog's pop must be over.
  await page.waitForFunction(
    () =>
      document
        .getAnimations()
        .every((animation) => animation.playState !== 'running'),
    null,
    { timeout: 30_000 },
  )
  await sleep(500)

  await browser.startTracing(page, {
    categories: ['devtools.timeline', 'toplevel'],
  })
  await page.evaluate(() => {
    window.__rtLongTasks = []
    window.__rtLongTasksOn = true
    console.timeStamp('rt-pick')
  })
  const started = Date.now()
  await dialog
    .locator('[data-add-file-input]')
    .setInputFiles(set.files.map((file) => file.path))
  const rows = dialog.locator('[data-add-row]')
  // Plain waits: `waitForFunction` would add work to every frame.
  for (let i = 0; i < 1200; i += 1) {
    if ((await rows.count()) === FILES) break
    await sleep(100)
  }
  const elapsedMs = Date.now() - started
  const shown = await rows.count()
  await sleep(300)
  await page.evaluate(() => {
    window.__rtLongTasksOn = false
    console.timeStamp('rt-done')
  })
  const buffer = await browser.stopTracing()
  const longTasks = await page.evaluate(() => window.__rtLongTasks)
  const addable = await dialog.locator('[data-add-row="addable"]').count()

  const { traceEvents } = JSON.parse(buffer.toString('utf8'))
  const marker = (name) =>
    traceEvents.find(
      (event) =>
        event.name === 'TimeStamp' && event.args?.data?.message === name,
    )
  const pick = marker('rt-pick')
  const done = marker('rt-done')
  if (!pick || !done) throw new Error('trace markers missing')
  const tasks = traceEvents
    .filter(
      (event) =>
        TASK_NAMES.has(event.name) &&
        event.ph === 'X' &&
        event.pid === pick.pid &&
        event.tid === pick.tid &&
        event.ts >= pick.ts &&
        event.ts <= done.ts,
    )
    .map((event) => Math.round((event.dur ?? 0) / 1000))
    .sort((a, b) => b - a)
  const longestLongTaskMs = longTasks.length > 0 ? Math.max(...longTasks) : 0
  const longestRunTaskMs = tasks[0] ?? 0
  return {
    set: set.label,
    description: set.description,
    largestFileBytes: Math.max(...set.files.map((file) => file.bytes)),
    rowsShown: shown,
    rowsAddable: addable,
    secondsUntilAllRows: Math.round(elapsedMs / 100) / 10,
    longTasksOver50Ms: longTasks.length,
    longestLongTaskMs,
    longestRunTaskMs,
    topRunTasksMs: tasks.slice(0, 5),
    complete: shown === FILES,
    pass:
      shown === FILES && Math.max(longestLongTaskMs, longestRunTaskMs) < LIMIT_MS,
  }
}

let browser
let exitCode = 0
try {
  await waitForHealth(base, server)
  browser = await chromium.launch()
  const page = await browser.newPage({
    viewport: { width: 1440, height: 900 },
    baseURL: base,
  })
  await page.addInitScript(() => {
    window.__rtLongTasks = []
    window.__rtLongTasksOn = false
    new PerformanceObserver((list) => {
      if (!window.__rtLongTasksOn) return
      for (const entry of list.getEntries()) {
        window.__rtLongTasks.push(Math.round(entry.duration))
      }
    }).observe({ type: 'longtask', buffered: false })
  })
  await page.goto('/login')
  await page.getByLabel('帳號').fill('fake-user')
  await page.getByLabel('密碼', { exact: true }).fill('fake-pass')
  await page.getByRole('button', { name: '登入', exact: true }).click()
  await page.waitForURL(`${base}/`)

  const results = []
  for (const set of sets) results.push(await measure(browser, page, set))
  const result = {
    recordedAt: new Date().toISOString(),
    browser: `headless Chromium ${browser.version()}`,
    limitMs: LIMIT_MS,
    sets: results,
    pass: results.every((each) => each.pass),
  }
  console.log(JSON.stringify(result, null, 2))
  if (results.every((each) => each.complete)) {
    mkdirSync(OUT_DIR, { recursive: true })
    writeFileSync(
      `${OUT_DIR}/trace-add-files.json`,
      `${JSON.stringify(result, null, 2)}\n`,
    )
  } else {
    console.error('incomplete run: trace-add-files.json left as it was')
  }
  if (!result.pass) exitCode = 1
} catch (error) {
  console.error(error)
  exitCode = 1
} finally {
  await browser?.close()
  server.kill('SIGTERM')
  rmSync(folder, { recursive: true, force: true })
}
process.exit(exitCode)
