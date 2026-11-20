// Story 4.4: does the delete exit lay out or paint per frame? Local only,
// never in CI. Starts scripts/fake-qbit.mjs (fake data only, AD-15: its
// torrents/delete only drops torrents from the fake's own data) on its own
// port with the `many` data mode (4165 visible torrents), opens the list
// in headless Chromium in a window tall enough that 50 rows show
// (1440 x 3400), ticks those 50 rows, deletes them without files, and
// records a Chrome trace (devtools.timeline, over CDP `Tracing` through
// Playwright) over the exit. The fade starts with the first `animate` call
// on a row wrapper, the slide with the first `translate` one (both marked
// with `console.timeStamp` by an init script). Layout, Paint and
// UpdateLayoutTree events within PHASE_START_MS of a phase's start are that
// phase's one layout change (the commit that starts it); the rest happened
// during its animation. Writes a JSON summary and a rendered summary image
// into the committed screenshots folder, so a rerun updates what is in git.
//
// Usage: npm run build && node scripts/trace-delete-exit.mjs [--keep trace.json]

import { spawn } from 'node:child_process'
import { mkdirSync, writeFileSync } from 'node:fs'
import { chromium } from '@playwright/test'

const PORT = 3292
const BASE = `http://localhost:${PORT}`
const OUT_DIR = '_bmad-output/implementation-artifacts/screenshots/4-4'
const FADE_MS = 200
const SLIDE_MS = 200
const ROWS = 50
/** A phase's own layout change: its commit and the next frame. */
const PHASE_START_MS = 50

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
    viewport: { width: 1440, height: 3400 },
    baseURL: BASE,
  })
  // Marks the first fade and the first slide on a row wrapper.
  await page.addInitScript(() => {
    const original = Element.prototype.animate
    let fade = false
    let slide = false
    window.__rtExitCounts = { fade: 0, slide: 0 }
    Element.prototype.animate = function (keyframes, options) {
      const first = Array.isArray(keyframes) ? keyframes[0] : null
      if (this instanceof HTMLElement && this.dataset.hash && first) {
        if ('opacity' in first) {
          window.__rtExitCounts.fade += 1
          if (!fade) console.timeStamp('rt-fade')
          fade = true
        } else if ('translate' in first) {
          window.__rtExitCounts.slide += 1
          if (!slide) console.timeStamp('rt-slide')
          slide = true
        }
      }
      return original.call(this, keyframes, options)
    }
  })
  await page.goto('/login')
  await page.getByLabel('帳號').fill('fake-user')
  await page.getByLabel('密碼', { exact: true }).fill('fake-pass')
  await page.getByRole('button', { name: '登入', exact: true }).click()
  await page.waitForURL(`${BASE}/`)
  await page.goto('/?sort=added_on')
  await page.getByRole('listitem').first().waitFor({ timeout: 30_000 })
  // The first load's entrance (about 4 s for 54 rows in view, its rings
  // drawn by stroke-dashoffset) must be over before anything is measured.
  const settled = () =>
    page.waitForFunction(
      () =>
        document
          .getAnimations()
          .every((animation) => animation.playState !== 'running'),
      null,
      { timeout: 30_000 },
    )
  await settled()

  // Tick the first 50 rows (all in view at 3400 px).
  const first = page.getByRole('listitem').first()
  await first.hover()
  await first.getByRole('checkbox').click()
  await page.evaluate((want) => {
    const boxes = document.querySelectorAll(
      '[role="listitem"] button[role="checkbox"][aria-checked="false"]',
    )
    for (const box of [...boxes].slice(0, want - 1)) box.click()
  }, ROWS)
  await page.mouse.move(0, 0)
  const bar = page.locator('[data-selection-bar]')
  await bar.getByText(`已選 ${ROWS} 個`).waitFor()
  const visible = await page.evaluate(() => {
    const scroller = document.getElementById('rt-list-scroll')
    const box = scroller.getBoundingClientRect()
    return [
      ...document.querySelectorAll('[role="listitem"][data-hash]'),
    ].filter((row) => {
      const rect = row.getBoundingClientRect()
      return rect.bottom > box.top && rect.top < box.bottom
    }).length
  })
  await bar.getByRole('button', { name: '刪除（含檔案）', exact: true }).click()
  const dialog = page.getByRole('alertdialog')
  await dialog.getByRole('checkbox', { name: '連檔案一起刪' }).click()
  await settled()
  await sleep(300)

  await browser.startTracing(page, { categories: ['devtools.timeline'] })
  await dialog.getByRole('button').filter({ hasText: /只刪/ }).last().click()
  // Plain waits: `waitForFunction` polls on every animation frame, which
  // would itself paint each frame inside the windows measured.
  for (let i = 0; i < 30; i += 1) {
    await sleep(500)
    const done = await page.evaluate(() => window.__rtExitCounts.slide > 0)
    if (done) break
  }
  await sleep(SLIDE_MS + 600)
  const buffer = await browser.stopTracing()
  const counts = await page.evaluate(() => window.__rtExitCounts)

  if (keepPath) writeFileSync(keepPath, buffer)
  const { traceEvents } = JSON.parse(buffer.toString('utf8'))
  const marker = (name) =>
    traceEvents.find(
      (event) =>
        event.name === 'TimeStamp' && event.args?.data?.message === name,
    )?.ts
  const fadeAt = marker('rt-fade')
  const slideAt = marker('rt-slide')
  if (fadeAt === undefined || slideAt === undefined) {
    throw new Error('trace markers missing')
  }
  const ms = (us) => us / 1000
  const windows = [
    { name: 'fade', start: ms(fadeAt), end: ms(fadeAt) + FADE_MS },
    { name: 'slide', start: ms(slideAt), end: ms(slideAt) + SLIDE_MS },
  ]
  const NAMES = ['Layout', 'Paint', 'UpdateLayoutTree']
  const relevant = traceEvents.filter(
    (event) => NAMES.includes(event.name) && event.ph !== 'E',
  )
  const summary = windows.map((window) => {
    const result = {}
    for (const name of NAMES) {
      const inside = relevant
        .filter(
          (event) =>
            event.name === name &&
            ms(event.ts) >= window.start &&
            ms(event.ts) < window.end,
        )
        .map((event) => Math.round(ms(event.ts) - window.start))
      result[name] = {
        atPhaseStart: inside.filter((at) => at < PHASE_START_MS).length,
        duringAnimation: inside.filter((at) => at >= PHASE_START_MS).length,
        atMs: inside,
      }
    }
    return {
      window: window.name,
      durationMs: Math.round(window.end - window.start),
      ...result,
    }
  })
  const result = {
    recordedAt: new Date().toISOString(),
    data: 'fake-qbit many (4165 visible torrents)',
    viewport: '1440x3400, headless Chromium',
    rowsDeleted: ROWS,
    rowsVisibleBeforeDelete: visible,
    fadeAnimations: counts.fade,
    slideAnimations: counts.slide,
    phaseStartMs: PHASE_START_MS,
    gapBetweenPhasesMs: Math.round(ms(slideAt) - ms(fadeAt)),
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
    viewport: { width: 760, height: 300 },
  })
  await summaryPage.setContent(
    '<!doctype html><meta charset="utf-8"><body style="margin:0;padding:20px;font:14px -apple-system,system-ui,sans-serif;background:#f6f6f4;color:#141414"><h1 style="font-size:18px;margin:0 0 12px"></h1><table style="border-collapse:collapse;width:100%"><thead><tr></tr></thead><tbody></tbody></table><p style="color:#65655f;font-size:12px"></p></body>',
  )
  await summaryPage.evaluate((data) => {
    document.querySelector('h1').textContent =
      `Story 4.4 delete exit trace (fake many data, ${data.rowsDeleted} rows)`
    const head = document.querySelector('thead tr')
    for (const label of [
      'phase',
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
        `${row.Layout.atPhaseStart} / ${row.Layout.duringAnimation}`,
        `${row.Paint.atPhaseStart} / ${row.Paint.duringAnimation}`,
        `${row.UpdateLayoutTree.atPhaseStart} / ${row.UpdateLayoutTree.duringAnimation}`,
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
      `${data.fadeAnimations} fades, ${data.slideAnimations} slides; start = within ${data.phaseStartMs} ms of the phase's start (the commits that start it); during = the rest of the phase. ${data.recordedAt}`
  }, result)
  await summaryPage.screenshot({ path: `${OUT_DIR}/trace-summary.png` })
} finally {
  await browser?.close()
  server.kill('SIGTERM')
}
