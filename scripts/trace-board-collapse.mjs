// Story 2.8: does the board's auto-collapse lay out or paint per frame?
// Local only, never in CI. Starts scripts/fake-qbit.mjs (fake data only,
// AD-15) on its own port with the `many` data mode (about 4165 torrents),
// opens the desktop board in headless Chromium at 1440 x 900, records a
// Chrome trace (devtools.timeline, over CDP `Tracing` through Playwright)
// over one collapse and one expand, and counts the Layout, Paint and
// UpdateLayoutTree events inside each animation window. Events within
// STEP_START_MS of a step's start are the single layout change of that
// step (React's commit, the FLIP's measure, the virtualizer catching up);
// the rest happened during the animation. Writes a JSON summary and a
// rendered summary image next to the e2e screenshots.
//
// Usage: npm run build && node scripts/trace-board-collapse.mjs [--keep trace.json]

import { spawn } from 'node:child_process'
import { mkdirSync, writeFileSync } from 'node:fs'
import { chromium } from '@playwright/test'

const PORT = 3291
const BASE = `http://localhost:${PORT}`
const OUT_DIR = 'e2e-output/screenshots/2-8'
const COLLAPSE_MS = 380
const SPREAD_MS = 1300
const EXPAND_MS = 975
const RIPPLE_MAX_MS = 320
/** A step's own layout change: its commit, measure and the next frame. */
const STEP_START_MS = 50

const keepIndex = process.argv.indexOf('--keep')
const keepPath = keepIndex === -1 ? null : process.argv[keepIndex + 1]

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

const server = spawn(
  process.execPath,
  ['scripts/fake-qbit.mjs', '--port', String(PORT)],
  { stdio: 'ignore' },
)

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

let browser
try {
  await waitForHealth()
  const mode = await fetch(`${BASE}/__fake/mode?data=many`, { method: 'POST' })
  if (!mode.ok) throw new Error('could not switch to the many data mode')
  await sleep(1100)

  browser = await chromium.launch()
  const page = await browser.newPage({
    viewport: { width: 1440, height: 900 },
    baseURL: BASE,
  })
  await page.goto('/login')
  await page.getByLabel('帳號').fill('fake-user')
  await page.getByLabel('密碼', { exact: true }).fill('fake-pass')
  await page.getByRole('button', { name: '登入', exact: true }).click()
  await page.waitForURL(`${BASE}/`)
  const board = page.getByRole('region', { name: '看板' })
  await board
    .getByRole('region', { name: /^做種中，[\d,]{5} 個$/ })
    .waitFor({ timeout: 30_000 })
  const body = board
    .getByRole('region', { name: /^做種中/ })
    .getByRole('group', { name: '做種中' })
  await page.mouse.move(0, 0)
  await sleep(500)

  await browser.startTracing(page, { categories: ['devtools.timeline'] })
  // Collapse: the marker, then one scroll past one column height.
  await body.evaluate((element) => {
    console.timeStamp('rt-collapse')
    element.scrollTop = element.clientHeight + 40
  })
  await sleep(COLLAPSE_MS + SPREAD_MS + RIPPLE_MAX_MS + 1400)
  // Expand: scroll up partway (Alex moving up), then to the top.
  await body.evaluate((element) => {
    element.scrollTop = 300
  })
  await sleep(300)
  await body.evaluate((element) => {
    console.timeStamp('rt-expand')
    element.scrollTop = 0
  })
  await sleep(EXPAND_MS + RIPPLE_MAX_MS + 600)
  const buffer = await browser.stopTracing()

  if (keepPath) writeFileSync(keepPath, buffer)
  const { traceEvents } = JSON.parse(buffer.toString('utf8'))
  const marker = (name) =>
    traceEvents.find(
      (event) =>
        event.name === 'TimeStamp' && event.args?.data?.message === name,
    )?.ts
  const collapseAt = marker('rt-collapse')
  const expandAt = marker('rt-expand')
  if (collapseAt === undefined || expandAt === undefined) {
    throw new Error('trace markers missing')
  }
  const ms = (us) => us / 1000
  const windows = [
    {
      name: 'collapse step 1',
      start: ms(collapseAt),
      end: ms(collapseAt) + COLLAPSE_MS,
    },
    {
      name: 'collapse step 2',
      start: ms(collapseAt) + COLLAPSE_MS,
      end: ms(collapseAt) + COLLAPSE_MS + SPREAD_MS + RIPPLE_MAX_MS,
    },
    {
      name: 'expand',
      start: ms(expandAt),
      end: ms(expandAt) + EXPAND_MS + RIPPLE_MAX_MS,
    },
  ]
  const NAMES = ['Layout', 'Paint', 'UpdateLayoutTree']
  const relevant = traceEvents.filter(
    (event) => NAMES.includes(event.name) && event.ph !== 'E',
  )
  const summary = windows.map((window) => {
    const counts = {}
    for (const name of NAMES) {
      const inside = relevant
        .filter(
          (event) =>
            event.name === name &&
            ms(event.ts) >= window.start &&
            ms(event.ts) < window.end,
        )
        .map((event) => Math.round(ms(event.ts) - window.start))
      counts[name] = {
        atStepStart: inside.filter((at) => at < STEP_START_MS).length,
        duringAnimation: inside.filter((at) => at >= STEP_START_MS).length,
        atMs: inside,
      }
    }
    return {
      window: window.name,
      durationMs: Math.round(window.end - window.start),
      ...counts,
    }
  })
  const animationFrames = traceEvents.filter(
    (event) =>
      event.name === 'Animation' &&
      (event.ph === 'b' || event.ph === 'S') &&
      ms(event.ts) >= windows[0].start,
  ).length
  const result = {
    recordedAt: new Date().toISOString(),
    data: 'fake-qbit many (about 4165 torrents)',
    viewport: '1440x900, headless Chromium',
    stepStartMs: STEP_START_MS,
    animationsStarted: animationFrames,
    windows: summary,
  }
  mkdirSync(OUT_DIR, { recursive: true })
  writeFileSync(
    `${OUT_DIR}/trace-summary.json`,
    `${JSON.stringify(result, null, 2)}\n`,
  )
  console.log(JSON.stringify(result, null, 2))

  // A rendered summary for the PR (plain text into a fixed table).
  const summaryPage = await browser.newPage({
    viewport: { width: 760, height: 320 },
  })
  await summaryPage.setContent(
    '<!doctype html><meta charset="utf-8"><body style="margin:0;padding:20px;font:14px -apple-system,system-ui,sans-serif;background:#f6f6f4;color:#141414"><h1 style="font-size:18px;margin:0 0 12px"></h1><table style="border-collapse:collapse;width:100%"><thead><tr></tr></thead><tbody></tbody></table><p style="color:#65655f;font-size:12px"></p></body>',
  )
  await summaryPage.evaluate((data) => {
    document.querySelector('h1').textContent =
      'Story 2.8 auto-collapse trace (fake many data)'
    const head = document.querySelector('thead tr')
    for (const label of [
      'window',
      'ms',
      'Layout start / during',
      'Paint start / during',
      'Style start / during',
    ]) {
      const th = document.createElement('th')
      th.textContent = label
      th.style.cssText =
        'text-align:left;padding:6px 8px;border-bottom:1px solid #e4e4e0'
      head.append(th)
    }
    const tbody = document.querySelector('tbody')
    for (const row of data.windows) {
      const tr = document.createElement('tr')
      for (const text of [
        row.window,
        String(row.durationMs),
        `${row.Layout.atStepStart} / ${row.Layout.duringAnimation}`,
        `${row.Paint.atStepStart} / ${row.Paint.duringAnimation}`,
        `${row.UpdateLayoutTree.atStepStart} / ${row.UpdateLayoutTree.duringAnimation}`,
      ]) {
        const td = document.createElement('td')
        td.textContent = text
        td.style.cssText =
          'padding:6px 8px;border-bottom:1px solid #e4e4e0;font-variant-numeric:tabular-nums'
        tr.append(td)
      }
      tbody.append(tr)
    }
    document.querySelector('p').textContent =
      `start = within ${data.stepStartMs} ms of the step's start (its one layout change); during = the rest of the animation window. ${data.recordedAt}`
  }, result)
  await summaryPage.screenshot({ path: `${OUT_DIR}/trace-summary.png` })
} finally {
  await browser?.close()
  server.kill('SIGTERM')
}
