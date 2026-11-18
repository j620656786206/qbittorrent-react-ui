// Story 3.2: does a category tab switch plus redraw stay within 100 ms on
// about 4165 torrents? Local only, never in CI. Starts scripts/fake-qbit.mjs
// (fake data only, AD-15) on its own port with the `many` data mode (4165
// visible torrents in the code-name categories X, mteam-X and mteam-tv),
// desktop 1440 x 900, headless Chromium, and times tab clicks in two modes:
// list (every category remembers 加入時間, picked through the sort menu
// first, so each switch stays a list) and board (settings reset, so every
// switch shows 「狀態」). The timing runs in the page: `performance.now()`
// right before the tab's `click()`, then the commit (the tab turns
// `aria-pressed`, in the same commit as the new rows), then the first
// frame after it: a `requestAnimationFrame` callback, then a message-channel
// task, which runs after that frame was painted. Reports every switch and
// the median, p95 and max per mode, and writes a JSON summary to
// e2e-output/screenshots/3-2/switch-timing.json.
//
// Usage: npm run build && node scripts/trace-category-switch.mjs

import { spawn } from 'node:child_process'
import { mkdirSync, writeFileSync } from 'node:fs'
import { chromium } from '@playwright/test'

const PORT = 3293
const BASE = `http://localhost:${PORT}`
const OUT_DIR = 'e2e-output/screenshots/3-2'
const BUDGET_MS = 100
const ROUNDS = 5
const CYCLE = ['X', 'mteam-X', 'mteam-tv', '全部']

const escapeRegExp = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

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

const tab = (page, label) =>
  page
    .getByRole('group', { name: '分類' })
    .getByRole('button')
    .filter({
      has: page.locator(':scope > span:first-child', {
        hasText: new RegExp(`^${escapeRegExp(label)}$`),
      }),
    })

/** Picks 加入時間 in the desktop sort menu and waits for the save. */
async function rememberAddedOn(page) {
  const saved = page.waitForResponse(
    (response) =>
      response.request().method() === 'POST' &&
      response.url().includes('/_serverFn/') &&
      (response.request().postData() ?? '').includes('category'),
  )
  await page.getByRole('button', { name: /^排序：.*，(列表|看板)$/ }).click()
  await page
    .getByRole('menu', { name: '排序' })
    .getByRole('menuitemradio', { name: '加入時間' })
    .click()
  await saved
}

/** Runs in the page: one timed switch to the tab named `label`. */
function timedSwitch(label) {
  const group = document.querySelector('[role="group"][aria-label="分類"]')
  const target = [...(group?.querySelectorAll('button') ?? [])].find(
    (element) => element.firstElementChild?.textContent === label,
  )
  if (!target) throw new Error(`no tab ${label}`)
  if (target.getAttribute('aria-pressed') === 'true') {
    throw new Error(
      `tab ${label} is already selected: a click would do nothing`,
    )
  }
  return new Promise((resolve, reject) => {
    let commitMs = null
    const start = performance.now()
    const observer = new MutationObserver(() => {
      if (target.getAttribute('aria-pressed') !== 'true') return
      observer.disconnect()
      commitMs = performance.now() - start
      afterPaint()
    })
    // Never hang: a tab that does not turn selected fails the run.
    const timer = setTimeout(() => {
      observer.disconnect()
      reject(new Error(`tab ${label} did not turn selected within 5 s`))
    }, 5000)
    const afterPaint = () => {
      requestAnimationFrame(() => {
        const channel = new MessageChannel()
        channel.port1.onmessage = () => {
          clearTimeout(timer)
          const section = document.querySelector(
            'section[aria-label^="種子列表，共"]',
          )
          resolve({
            label,
            commitMs,
            frameMs: performance.now() - start,
            shows: section
              ? section.getAttribute('aria-label')
              : document.querySelector('[role="region"][aria-label="看板"]')
                ? 'board'
                : 'other',
          })
        }
        channel.port2.postMessage(null)
      })
    }
    observer.observe(target, { attributes: true })
    target.click()
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
  const switches = []
  for (let round = 0; round < ROUNDS; round += 1) {
    for (const label of CYCLE) {
      const result = await page.evaluate(timedSwitch, label)
      switches.push(result)
      // Let the entrance and the next poll settle between switches.
      await sleep(1500)
    }
  }
  return {
    mode: name,
    switches,
    frame: stats(switches.map((entry) => entry.frameMs)),
    commit: stats(switches.map((entry) => entry.commitMs)),
  }
}

const server = spawn(
  process.execPath,
  ['scripts/fake-qbit.mjs', '--port', String(PORT)],
  { stdio: ['ignore', 'ignore', 'pipe'] },
)
// fake-qbit's and the app's errors show up in this script's output.
server.stderr.pipe(process.stderr)

let browser
try {
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

  // Board: nothing remembered, every switch shows 「狀態」.
  await tab(page, '全部').waitFor()
  await sleep(1500)
  const board = await runMode(page, 'board')

  // List: every category remembers 加入時間.
  for (const label of CYCLE) {
    await tab(page, label).click()
    await rememberAddedOn(page)
  }
  await sleep(1500)
  const list = await runMode(page, 'list')

  const runs = [list, board]
  const result = {
    recordedAt: new Date().toISOString(),
    data: 'fake-qbit many (4165 visible torrents, categories X, mteam-X, mteam-tv)',
    browser: 'headless Chromium, 1440 x 900',
    method:
      'in-page performance.now() before the tab click(); commit = the tab turns aria-pressed (same commit as the new rows); frame = requestAnimationFrame then a MessageChannel task (after the first frame with the new rows is painted)',
    budgetMs: BUDGET_MS,
    runs,
    ok: runs.every((run) => run.frame.max <= BUDGET_MS),
  }
  writeFileSync(
    `${OUT_DIR}/switch-timing.json`,
    `${JSON.stringify(result, null, 2)}\n`,
  )
  for (const run of runs) {
    console.log(
      `${run.mode}: frame median ${run.frame.median} ms, p95 ${run.frame.p95} ms, max ${run.frame.max} ms; commit median ${run.commit.median} ms, max ${run.commit.max} ms`,
    )
    for (const entry of run.switches) {
      console.log(
        `  ${entry.label.padEnd(9)} commit ${entry.commitMs.toFixed(1)} ms, frame ${entry.frameMs.toFixed(1)} ms (${entry.shows})`,
      )
    }
  }
  console.log(result.ok ? 'ok: within budget' : 'OVER BUDGET')
  if (!result.ok) process.exitCode = 1
} finally {
  await browser?.close()
  server.kill('SIGTERM')
}
