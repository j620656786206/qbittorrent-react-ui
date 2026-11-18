// Story 3.5: does each search keystroke plus redraw stay within 100 ms on
// about 4165 torrents? Local only, never in CI. Mirrors
// scripts/trace-category-switch.mjs: starts scripts/fake-qbit.mjs (fake data
// only, AD-15) on its own port with the `many` data mode (4165 visible
// torrents named `Fake.Show.<n>.S01E<xx>.1080p`), desktop 1440 x 900,
// headless Chromium, opens the search box and times keystrokes in two
// modes: list (「全部」 remembers 加入時間, picked through the sort menu) and
// board (settings reset, 「狀態」). Each keystroke is typed in the page as
// the browser would (the field's value set, then an `input` event, which
// React's onChange reads); the keystrokes are 3, 31, 314, 3141, then back
// to empty, so every one changes the result. The timing runs in the page:
// `performance.now()` right before the event; the commit is the first DOM
// change that alters what the content says (the list's 「共 N 個」, the
// board's column counts or the no-result line), seen by a MutationObserver;
// the frame is a `requestAnimationFrame` callback after it, then a
// message-channel task, which runs after that frame was painted. Reports
// every keystroke and the median, p95 and max per mode, fails unless every
// list keystroke shows the list and every board keystroke the board, and
// writes a JSON summary to e2e-output/screenshots/3-5/keystroke-timing.json.
//
// Usage: npm run build && node scripts/trace-search-keystroke.mjs

import { spawn } from 'node:child_process'
import { mkdirSync, writeFileSync } from 'node:fs'
import { chromium } from '@playwright/test'

const PORT = 3294
const BASE = `http://localhost:${PORT}`
const OUT_DIR = 'e2e-output/screenshots/3-5'
const BUDGET_MS = 100
const ROUNDS = 5
const KEYSTROKES = ['3', '31', '314', '3141', '314', '31', '3', '']

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

async function post(path) {
  const response = await fetch(`${BASE}${path}`, { method: 'POST' })
  if (!response.ok) throw new Error(`${path}: ${response.status}`)
}

async function login(page) {
  await page.goto('/login')
  await page.getByLabel('帳號').fill('fake-user')
  await page.getByLabel('密碼', { exact: true }).fill('fake-pass')
  await page.getByRole('button', { name: '登入', exact: true }).click()
  await page.waitForURL(`${BASE}/`)
}

/** Picks 加入時間 for 「全部」 and waits for the save to answer. */
async function rememberAddedOn(page) {
  const saved = page.waitForResponse(
    (response) =>
      response.request().method() === 'POST' &&
      response.url().includes('/_serverFn/'),
  )
  await page.getByRole('button', { name: /^排序：.*，(列表|看板)$/ }).click()
  await page
    .getByRole('menu', { name: '排序' })
    .getByRole('menuitemradio', { name: '加入時間' })
    .click()
  await saved
}

/** Runs in the page: one timed keystroke that makes the field read `text`. */
function timedKeystroke(text) {
  const field = [
    ...document.querySelectorAll('input[type="search"][aria-label="找名字"]'),
  ].find((element) => element.getClientRects().length > 0)
  if (!field) throw new Error('no visible search field')
  const says = () => {
    const list = document.querySelector('section[aria-label^="種子列表，共"]')
    if (list) return `list:${list.getAttribute('aria-label')}`
    const board = document.querySelector('[role="region"][aria-label="看板"]')
    if (board) {
      return `board:${[...board.children]
        .map((column) => column.getAttribute('aria-label'))
        .join('|')}`
    }
    const none = document.querySelector('section[aria-label="搜尋結果"]')
    return none ? `none:${none.textContent}` : 'other'
  }
  const before = says()
  return new Promise((resolve, reject) => {
    let commitMs = null
    const start = performance.now()
    const observer = new MutationObserver(() => {
      if (commitMs !== null || says() === before) return
      observer.disconnect()
      commitMs = performance.now() - start
      afterPaint()
    })
    // Never hang: a keystroke that changes nothing fails the run.
    const timer = setTimeout(() => {
      observer.disconnect()
      reject(new Error(`"${text}" changed nothing within 5 s (${before})`))
    }, 5000)
    const afterPaint = () => {
      requestAnimationFrame(() => {
        const channel = new MessageChannel()
        channel.port1.onmessage = () => {
          clearTimeout(timer)
          resolve({
            text,
            commitMs,
            frameMs: performance.now() - start,
            shows: says(),
          })
        }
        channel.port2.postMessage(null)
      })
    }
    observer.observe(document.body, {
      subtree: true,
      childList: true,
      attributes: true,
      characterData: true,
    })
    Object.getOwnPropertyDescriptor(
      HTMLInputElement.prototype,
      'value',
    ).set.call(field, text)
    field.dispatchEvent(new InputEvent('input', { bubbles: true }))
  })
}

function stats(values) {
  const sorted = [...values].sort((a, b) => a - b)
  const at = (q) =>
    sorted[Math.min(sorted.length - 1, Math.ceil(q * sorted.length) - 1)]
  const round = (n) => Math.round(n * 10) / 10
  return {
    median: round(at(0.5)),
    p95: round(at(0.95)),
    max: round(sorted.at(-1)),
  }
}

async function runMode(page, name) {
  await page.getByRole('button', { name: '搜尋', exact: true }).click()
  await page.getByRole('searchbox', { name: '找名字' }).waitFor()
  const keystrokes = []
  for (let round = 0; round < ROUNDS; round += 1) {
    for (const text of KEYSTROKES) {
      const result = await page.evaluate(timedKeystroke, text)
      keystrokes.push(result)
      // About a typing pause; lets a poll land between keystrokes too.
      await sleep(300)
    }
  }
  await page.getByRole('button', { name: '清除搜尋' }).click()
  return {
    mode: name,
    keystrokes,
    frame: stats(keystrokes.map((entry) => entry.frameMs)),
    commit: stats(keystrokes.map((entry) => entry.commitMs)),
  }
}

const server = spawn(
  process.execPath,
  ['scripts/fake-qbit.mjs', '--port', String(PORT)],
  { stdio: ['ignore', 'ignore', 'pipe'] },
)
// fake-qbit's and the app's errors show up in this script's output.
server.stderr.pipe(process.stderr)
// fake-qbit exiting early (the port taken, a crash) fails the run.
let finished = false
const serverExited = new Promise((_, reject) => {
  server.on('exit', (code, signal) => {
    if (!finished) {
      reject(new Error(`fake-qbit exited early (${signal ?? code})`))
    }
  })
})
serverExited.catch(() => {})

let browser
try {
  await Promise.race([measure(), serverExited])
} finally {
  finished = true
  await browser?.close()
  server.kill('SIGTERM')
}

async function measure() {
  await waitForHealth()
  await post('/__fake/mode?data=many')
  await post('/__fake/settings?reset=1')
  await sleep(1100)
  mkdirSync(OUT_DIR, { recursive: true })
  browser = await chromium.launch()
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    baseURL: BASE,
  })
  const page = await context.newPage()
  await login(page)

  // Board: nothing remembered, 「狀態」.
  await page.getByRole('region', { name: '看板' }).waitFor()
  await sleep(1500)
  const board = await runMode(page, 'board')

  // List: 「全部」 remembers 加入時間.
  await rememberAddedOn(page)
  await page.locator('section[aria-label^="種子列表，共"]').waitFor()
  await sleep(1500)
  const list = await runMode(page, 'list')

  const runs = [list, board]
  const result = {
    recordedAt: new Date().toISOString(),
    data: 'fake-qbit many (4165 visible torrents)',
    browser: 'headless Chromium, 1440 x 900',
    method:
      'in-page performance.now() before the input event (the field value set, then input, as React reads a keystroke); commit = the first DOM change that alters the list count, the board column counts or the no-result line (MutationObserver); frame = requestAnimationFrame then a MessageChannel task (after the first frame with the filtered result is painted)',
    keystrokes: KEYSTROKES,
    budgetMs: BUDGET_MS,
    runs,
    // Each mode really showed what it measures (a no-result or other
    // screen counts for neither).
    showsExpected:
      list.keystrokes.every((entry) => entry.shows.startsWith('list:')) &&
      board.keystrokes.every((entry) => entry.shows.startsWith('board:')),
  }
  result.ok =
    result.showsExpected && runs.every((run) => run.frame.max <= BUDGET_MS)
  writeFileSync(
    `${OUT_DIR}/keystroke-timing.json`,
    `${JSON.stringify(result, null, 2)}\n`,
  )
  for (const run of runs) {
    console.log(
      `${run.mode}: frame median ${run.frame.median} ms, p95 ${run.frame.p95} ms, max ${run.frame.max} ms; commit median ${run.commit.median} ms, max ${run.commit.max} ms`,
    )
    for (const entry of run.keystrokes) {
      console.log(
        `  ${JSON.stringify(entry.text).padEnd(7)} commit ${entry.commitMs.toFixed(1)} ms, frame ${entry.frameMs.toFixed(1)} ms (${entry.shows.slice(0, 70)})`,
      )
    }
  }
  if (!result.showsExpected) {
    console.log('FAILED: a run did not show its mode (list or board)')
  }
  console.log(result.ok ? 'ok: within budget' : 'NOT OK')
  if (!result.ok) process.exitCode = 1
}
