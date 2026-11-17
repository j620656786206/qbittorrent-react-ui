// Story 2.9: does the entrance (rows rise, rings turn) keep the main thread
// free on 4165 torrents? Local only, never in CI. Starts
// scripts/fake-qbit.mjs (fake data only, AD-15) on its own port with the
// `many` data mode, and for desktop 1440 x 900 and phone 390 x 844, list and
// board, records a Chrome trace (CDP `Tracing` through Playwright) from the
// navigation to 2.5 s after the first data. An init script wraps
// `Element.prototype.animate` (calling the real one) to mark the first
// entrance animation (the sweep) with `console.timeStamp`, keep each
// entrance animation, and sample on every frame how many ring animations
// run at once. Reports renderer main-thread tasks over 50 ms from the
// navigation start to the sweep and from the sweep to the last animation's
// end (and whether that end falls inside the trace), the most rings running
// at once against the circles in view, and a frame sequence (entrance
// animations paused and stepped to 0, 150, 300, 600, 900 and 1500 ms) as
// screenshots. Writes a JSON summary next to them.
//
// Usage: npm run build && node scripts/trace-entrance.mjs [--keep dir]

import { spawn } from 'node:child_process'
import { mkdirSync, writeFileSync } from 'node:fs'
import { chromium } from '@playwright/test'

const PORT = 3292
const BASE = `http://localhost:${PORT}`
const OUT_DIR = 'e2e-output/screenshots/2-9'
const AFTER_DATA_MS = 2500
const LONG_TASK_MS = 50
const FRAMES_MS = [0, 150, 300, 600, 900, 1500]
const VIEWPORTS = [
  { name: 'desktop', width: 1440, height: 900 },
  { name: 'phone', width: 390, height: 844 },
]
const MODES = [
  { name: 'list', path: '/?sort=added_on' },
  { name: 'board', path: '/' },
]

const keepIndex = process.argv.indexOf('--keep')
const keepDir = keepIndex === -1 ? null : process.argv[keepIndex + 1]
if (keepIndex !== -1 && (!keepDir || keepDir.startsWith('--'))) {
  console.error('usage: node scripts/trace-entrance.mjs [--keep dir]')
  process.exit(2)
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

async function waitForHealth() {
  for (let i = 0; i < 100; i += 1) {
    try {
      const response = await fetch(`${BASE}/healthz`)
      if (response.ok) return
    } catch {
      // Not up yet.
    }
    await sleep(200)
  }
  throw new Error('fake-qbit did not start')
}

/**
 * Runs in the page before the app. `pause`: each entrance animation is
 * paused at creation (for the frame sequence).
 */
function instrument(pause) {
  const original = Element.prototype.animate
  const state = {
    sweepAt: null,
    animations: [],
    maxRings: 0,
    visibleCircles: null,
  }
  window.__rtTrace = state
  const kindOf = (element) =>
    element.hasAttribute('data-entrance')
      ? 'rise'
      : element.hasAttribute('data-progress-arc')
        ? 'spin'
        : element.hasAttribute('data-progress-bar')
          ? 'grow'
          : null
  const CLIPS = new Set(['hidden', 'clip', 'scroll', 'auto'])
  const clippers = (element) => {
    const out = []
    for (let node = element.parentElement; node; node = node.parentElement) {
      const style = getComputedStyle(node)
      if (CLIPS.has(style.overflowX) || CLIPS.has(style.overflowY))
        out.push(node)
    }
    return out
  }
  const overlaps = (a, b) =>
    a.bottom > b.top && a.top < b.bottom && a.right > b.left && a.left < b.right
  const countVisibleCircles = () => {
    const view = { top: 0, left: 0, bottom: innerHeight, right: innerWidth }
    let visible = 0
    for (const arc of document.querySelectorAll('[data-progress-arc]')) {
      const rect = arc.getBoundingClientRect()
      if (!overlaps(rect, view)) continue
      // Every ancestor that clips (scroll boxes, the phone swipe viewport).
      if (
        clippers(arc).some(
          (node) => !overlaps(rect, node.getBoundingClientRect()),
        )
      )
        continue
      visible += 1
    }
    return visible
  }
  const sample = () => {
    const rings = document
      .getAnimations()
      .filter(
        (animation) =>
          animation.playState === 'running' &&
          animation.effect?.target?.hasAttribute?.('data-progress-arc'),
      ).length
    state.maxRings = Math.max(state.maxRings, rings)
    const live = state.animations.some(
      (animation) =>
        animation.playState === 'running' || animation.playState === 'paused',
    )
    if (live && !pause) requestAnimationFrame(sample)
  }
  Element.prototype.animate = function (keyframes, options) {
    const animation = original.call(this, keyframes, options)
    const kind = kindOf(this)
    if (kind) {
      if (state.sweepAt === null) {
        state.sweepAt = performance.now()
        console.timeStamp('rt-sweep')
        // The circles in view when the sweep reads its boxes (the same
        // layout, before anything moves).
        state.visibleCircles = countVisibleCircles()
        requestAnimationFrame(sample)
      }
      animation.__rtKind = kind
      state.animations.push(animation)
      if (pause) animation.pause()
    }
    return animation
  }
}

async function login(context) {
  const page = await context.newPage()
  await page.goto('/login')
  await page.getByLabel('帳號').fill('fake-user')
  await page.getByLabel('密碼', { exact: true }).fill('fake-pass')
  await page.getByRole('button', { name: '登入', exact: true }).click()
  await page.waitForURL(`${BASE}/`)
  await page.close()
}

/** Where the entrance animations end, in page `performance.now()` ms. */
const lastEnd = (page) =>
  page.evaluate(() => {
    let end = null
    for (const animation of window.__rtTrace.animations) {
      // Pending or cancelled: no start time, no end on the timeline.
      if (animation.startTime === null) continue
      const timing = animation.effect?.getComputedTiming()
      const at = Number(animation.startTime) + Number(timing?.endTime)
      if (Number.isFinite(at)) end = Math.max(end ?? at, at)
    }
    return end
  })

async function traceRun(browser, context, viewport, mode) {
  const page = await context.newPage()
  await page.addInitScript(instrument, false)
  await browser.startTracing(page, {
    categories: [
      'devtools.timeline',
      'toplevel',
      'blink.user_timing',
      'disabled-by-default-devtools.timeline',
    ],
  })
  await page.goto(mode.path)
  await page.locator('[data-entrance]').first().waitFor({ timeout: 30_000 })
  await sleep(AFTER_DATA_MS)
  const buffer = await browser.stopTracing()
  const pageState = await page.evaluate(() => ({
    sweepAt: window.__rtTrace.sweepAt,
    maxRings: window.__rtTrace.maxRings,
    visibleCircles: window.__rtTrace.visibleCircles,
    kinds: window.__rtTrace.animations.reduce((counts, animation) => {
      counts[animation.__rtKind] = (counts[animation.__rtKind] ?? 0) + 1
      return counts
    }, {}),
  }))
  const endAt = await lastEnd(page)
  await page.close()
  if (keepDir) {
    mkdirSync(keepDir, { recursive: true })
    writeFileSync(`${keepDir}/${viewport.name}-${mode.name}.json`, buffer)
  }

  const { traceEvents } = JSON.parse(buffer.toString('utf8'))
  const marker = traceEvents.find(
    (event) =>
      event.name === 'TimeStamp' && event.args?.data?.message === 'rt-sweep',
  )
  if (!marker || pageState.sweepAt === null) {
    throw new Error(`${viewport.name} ${mode.name}: no entrance sweep`)
  }
  // Trace clock (µs) to page clock (ms) through the marker.
  const toPage = (ts) => ts / 1000 - marker.ts / 1000 + pageState.sweepAt
  // The app document's navigation start (the page's renderer), else the
  // trace's first event (tracing starts right before `goto`).
  const navigation = traceEvents
    .filter(
      (event) =>
        event.name === 'navigationStart' &&
        event.pid === marker.pid &&
        event.ts <= marker.ts,
    )
    .reduce((latest, event) => Math.max(latest, event.ts), -Infinity)
  const traceStart = traceEvents
    .filter((event) => event.ts > 0)
    .reduce((first, event) => Math.min(first, event.ts), Infinity)
  const traceEnd = traceEvents.reduce(
    (last, event) => Math.max(last, event.ts + (event.dur ?? 0)),
    -Infinity,
  )
  const fromMs =
    toPage(Number.isFinite(navigation) ? navigation : traceStart) -
    pageState.sweepAt
  const traceEndMs = toPage(traceEnd) - pageState.sweepAt
  const endMs = endAt === null ? 0 : endAt - pageState.sweepAt
  // Every renderer main thread: a cross-process navigation may run the
  // document's first tasks before the marker's process is the page.
  const rendererMains = new Set(
    traceEvents
      .filter(
        (event) =>
          event.ph === 'M' &&
          event.name === 'thread_name' &&
          event.args?.name === 'CrRendererMain',
      )
      .map((event) => `${event.pid}:${event.tid}`),
  )
  const tasks = traceEvents
    .filter(
      (event) =>
        event.ph === 'X' &&
        event.name === 'RunTask' &&
        rendererMains.has(`${event.pid}:${event.tid}`) &&
        event.dur / 1000 > LONG_TASK_MS,
    )
    .map((event) => ({
      startMs: Math.round(toPage(event.ts) - pageState.sweepAt),
      durationMs: Math.round(event.dur / 1000),
      pageRenderer: event.pid === marker.pid,
    }))
    .filter(
      (task) => task.startMs + task.durationMs > fromMs && task.startMs < endMs,
    )
  return {
    viewport: `${viewport.width}x${viewport.height}`,
    mode: mode.name,
    animations: pageState.kinds,
    navigationStartMs: Math.round(fromMs),
    navigationStartFrom: Number.isFinite(navigation)
      ? 'navigationStart'
      : 'trace start',
    lastAnimationEndMs: Math.round(endMs),
    traceEndMs: Math.round(traceEndMs),
    lastAnimationEndInsideTrace: endAt !== null && endMs <= traceEndMs,
    longTasksBeforeSweep: tasks.filter(
      (task) => task.startMs + task.durationMs <= 0,
    ),
    longTasksDuringEntrance: tasks.filter(
      (task) => task.startMs + task.durationMs > 0,
    ),
    maxRingsAtOnce: pageState.maxRings,
    visibleCircles: pageState.visibleCircles,
  }
}

async function frames(context, viewport, mode) {
  const page = await context.newPage()
  await page.addInitScript(instrument, true)
  await page.goto(mode.path)
  await page.locator('[data-entrance]').first().waitFor({ timeout: 30_000 })
  await page.evaluate(
    () => new Promise((resolve) => requestAnimationFrame(() => resolve(null))),
  )
  const files = []
  for (const at of FRAMES_MS) {
    await page.evaluate((time) => {
      for (const animation of window.__rtTrace.animations) {
        animation.currentTime = time
      }
      return new Promise((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(resolve)),
      )
    }, at)
    const file = `${OUT_DIR}/${viewport.name}-${mode.name}-${String(at).padStart(4, '0')}ms.png`
    await page.screenshot({ path: file })
    files.push(file)
  }
  await page.evaluate(() => {
    for (const animation of window.__rtTrace.animations) animation.finish()
  })
  await page.close()
  return files
}

const server = spawn(
  process.execPath,
  ['scripts/fake-qbit.mjs', '--port', String(PORT)],
  { stdio: 'ignore' },
)

let browser
try {
  await waitForHealth()
  const mode = await fetch(`${BASE}/__fake/mode?data=many`, { method: 'POST' })
  if (!mode.ok) throw new Error('could not switch to the many data mode')
  await sleep(1100)
  mkdirSync(OUT_DIR, { recursive: true })

  browser = await chromium.launch()
  const runs = []
  for (const viewport of VIEWPORTS) {
    const context = await browser.newContext({
      viewport: { width: viewport.width, height: viewport.height },
      baseURL: BASE,
    })
    await login(context)
    for (const view of MODES) {
      const run = await traceRun(browser, context, viewport, view)
      run.frames = await frames(context, viewport, view)
      runs.push(run)
    }
    await context.close()
  }
  const result = {
    recordedAt: new Date().toISOString(),
    data: 'fake-qbit many (about 4165 torrents)',
    browser: 'headless Chromium',
    longTaskMs: LONG_TASK_MS,
    note: 'ms are relative to the sweep (the first entrance animation); long tasks count on every renderer main thread from the navigation start to the last animation end',
    framesMs: FRAMES_MS,
    runs,
    ok: runs.every(
      (run) =>
        run.longTasksDuringEntrance.length === 0 &&
        run.lastAnimationEndInsideTrace &&
        run.maxRingsAtOnce <= run.visibleCircles,
    ),
  }
  writeFileSync(
    `${OUT_DIR}/trace-summary.json`,
    `${JSON.stringify(result, null, 2)}\n`,
  )
  console.log(JSON.stringify(result, null, 2))
} finally {
  await browser?.close()
  server.kill('SIGTERM')
}
