// Story 4.6 (closes 4.5's deferred browser measurement): reading and
// judging 20 .torrent files of 10 MB must never block the main thread for
// more than 200 ms (epic 4 performance rule). Local only, never in CI.
// Starts scripts/fake-qbit.mjs (fake data only, AD-15: nothing is sent,
// submitting is story 4.7) on its own port, opens the add screen in
// headless Chromium at 1440 x 900, and picks 20 generated v1 torrents of
// just under 10 MB each (the `info` value is almost the whole file, so
// hashing is the worst case for that size) through the hidden file input
// (`setInputFiles` with paths in a temporary folder). From the pick until
// all 20 rows show it records long tasks (`PerformanceObserver`
// `longtask`, every task over 50 ms) and a Chrome trace (devtools.timeline
// and toplevel: each task on the page's main thread, found through a
// `console.timeStamp` marker). Reports the longest of both and writes a JSON summary into the
// committed screenshots folder, so a rerun updates what is in git. Exits 1
// when the longest task is 200 ms or more.
//
// Usage: npm run build && node scripts/trace-add-files.mjs

import { spawn } from 'node:child_process'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { chromium } from '@playwright/test'

const PORT = 3293
const BASE = `http://localhost:${PORT}`
const OUT_DIR = '_bmad-output/implementation-artifacts/screenshots/4-6'
const FILES = 20
/** Just under the 10 MB limit (`MAX_TORRENT_FILE_BYTES`, 10,485,760). */
const FILE_BYTES = 10_485_760 - 512
const LIMIT_MS = 200
const PIECE_LENGTH = 262_144
/** One main-thread task: `RunTask` in older Chromium, the scheduler's now. */
const TASK_NAMES = new Set(['RunTask', 'ThreadControllerImpl::RunTask'])

const utf8 = new TextEncoder()

/** A bencoded byte string. */
const str = (bytes) =>
  Buffer.concat([Buffer.from(`${bytes.length}:`), Buffer.from(bytes)])

/**
 * A valid single-file v1 torrent of about `size` bytes, named `name`:
 * `pieces` fills the `info` value (fake piece hashes), so nearly every byte
 * is hashed. Keys in sorted order, as clients write them.
 */
function torrentOfSize(size, name) {
  const pieceCount = Math.floor((size - 400) / 20)
  const pieces = Buffer.alloc(pieceCount * 20)
  for (let i = 0; i < pieces.length; i++) pieces[i] = (i * 7 + name.length) & 0xff
  const info = Buffer.concat([
    Buffer.from('d'),
    str(utf8.encode('length')),
    Buffer.from(`i${pieceCount * PIECE_LENGTH}e`),
    str(utf8.encode('name')),
    str(utf8.encode(name)),
    str(utf8.encode('piece length')),
    Buffer.from(`i${PIECE_LENGTH}e`),
    str(utf8.encode('pieces')),
    str(pieces),
    Buffer.from('e'),
  ])
  return Buffer.concat([
    Buffer.from('d'),
    str(utf8.encode('announce')),
    str(utf8.encode('http://tracker.invalid/announce')),
    str(utf8.encode('info')),
    info,
    Buffer.from('e'),
  ])
}

async function waitForHealth() {
  for (let i = 0; i < 100; i += 1) {
    try {
      const response = await fetch(`${BASE}/healthz`)
      if (response.ok) return
    } catch {
      // Not up yet.
    }
    await new Promise((resolve) => setTimeout(resolve, 200))
  }
  throw new Error('fake-qbit did not start')
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

const folder = mkdtempSync(join(tmpdir(), 'rt-trace-add-'))
const paths = Array.from({ length: FILES }, (_, index) => {
  const name = `Fake.Trace.S01E${String(index + 1).padStart(2, '0')}.1080p`
  const path = join(folder, `${name}.torrent`)
  const bytes = torrentOfSize(FILE_BYTES, name)
  if (bytes.length > 10_485_760) throw new Error('generated file over 10 MB')
  writeFileSync(path, bytes)
  return path
})

const server = spawn(
  process.execPath,
  ['scripts/fake-qbit.mjs', '--port', String(PORT)],
  { stdio: 'ignore' },
)

let browser
let exitCode = 0
try {
  await waitForHealth()
  browser = await chromium.launch()
  const page = await browser.newPage({
    viewport: { width: 1440, height: 900 },
    baseURL: BASE,
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
  await page.waitForURL(`${BASE}/`)
  await page
    .locator('header')
    .getByRole('button', { name: '新增', exact: true })
    .click()
  const dialog = page.getByRole('dialog', { name: '新增種子' })
  await dialog.waitFor()
  // The first load's entrance and the dialog's pop must be over.
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
    window.__rtLongTasksOn = true
    console.timeStamp('rt-pick')
  })
  const started = Date.now()
  await dialog.locator('[data-add-file-input]').setInputFiles(paths)
  const rows = dialog.locator('[data-add-row]')
  // Plain waits: `waitForFunction` would add work to every frame.
  for (let i = 0; i < 600; i += 1) {
    if ((await rows.count()) === FILES) break
    await sleep(100)
  }
  const elapsedMs = Date.now() - started
  const shown = await rows.count()
  await sleep(300)
  await page.evaluate(() => console.timeStamp('rt-done'))
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
  const longestMs = Math.max(longestLongTaskMs, longestRunTaskMs)
  const result = {
    recordedAt: new Date().toISOString(),
    browser: `headless Chromium ${browser.version()}`,
    files: FILES,
    bytesEach: FILE_BYTES,
    rowsShown: shown,
    rowsAddable: addable,
    secondsUntilAllRows: Math.round(elapsedMs / 100) / 10,
    longTasksOver50Ms: longTasks.length,
    longestLongTaskMs,
    longestRunTaskMs,
    topRunTasksMs: tasks.slice(0, 5),
    limitMs: LIMIT_MS,
    pass: shown === FILES && longestMs < LIMIT_MS,
  }
  mkdirSync(OUT_DIR, { recursive: true })
  writeFileSync(
    `${OUT_DIR}/trace-add-files.json`,
    `${JSON.stringify(result, null, 2)}\n`,
  )
  console.log(JSON.stringify(result, null, 2))
  if (!result.pass) exitCode = 1
} finally {
  await browser?.close()
  server.kill('SIGTERM')
  rmSync(folder, { recursive: true, force: true })
}
process.exit(exitCode)
