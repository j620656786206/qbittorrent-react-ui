// Story 5.1 row R3: do the location tags follow a common-path change within
// 100 ms on 4165 torrents with many distinct save paths and 50 common
// paths? Local only, never in CI. Starts scripts/fake-qbit.mjs (fake data
// only, AD-15) on its own port with `data=many&paths=varied` (4165 visible
// torrents, each in its own fake folder under one of 50 parents) and the
// `fifty` seed (a common path on each parent, every other one a media
// library), desktop 1440 x 900, headless Chromium. Each round writes the
// other seed (`fifty-renamed` renames all 50 and flips every 「媒體庫」, then
// back to `fifty`) and refocuses the page, which refetches ['settings'].
// The timing runs in the page: a fetch wrapper (an init script) stamps
// `performance.now()` when the settings answer arrives; a MutationObserver
// sees the first visible tag with the new name (the commit), then the
// first frame after it: a `requestAnimationFrame` callback, then a
// message-channel task, which runs after that frame was painted. Measured
// on the list (加入時間) and on the board. Reports every round and the
// median and max per mode (six rounds are too few for a p95), fails
// unless every round changed every
// visible tag, and writes a JSON summary to
// e2e-output/screenshots/5-1/location-tags-timing.json.
//
// Usage: npm run build && node scripts/trace-location-tags.mjs

import { spawn } from 'node:child_process'
import { mkdirSync, writeFileSync } from 'node:fs'
import { chromium } from '@playwright/test'

const PORT = 3294
const BASE = `http://localhost:${PORT}`
const OUT_DIR = 'e2e-output/screenshots/5-1'
const BUDGET_MS = 100
const ROUNDS = 6
const FOLDER_ICON = 'M3 7h6l2 2h10v10H3z'

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

/** Init script: stamps every server function answer that carries settings. */
function stampSettingsAnswers() {
  const original = window.fetch.bind(window)
  window.__rtSettingsAnswers = []
  window.fetch = async (...args) => {
    const response = await original(...args)
    const at = performance.now()
    const input = args[0]
    const url =
      typeof input === 'string' ? input : (input?.url ?? String(input))
    if (url.includes('/_serverFn/')) {
      response
        .clone()
        .text()
        .then((text) => {
          if (text.includes('commonPaths')) {
            window.__rtSettingsAnswers.push({ at, text })
          }
        })
        .catch(() => {})
    }
    return response
  }
}

/** Runs in the page: one refocus, timed until the tags show `marker`. */
function timedRefresh({ marker, icon }) {
  const tags = () =>
    [...document.querySelectorAll(`svg path[d="${icon}"]`)].map(
      (path) => path.closest('svg').parentElement,
    )
  const before = window.__rtSettingsAnswers.length
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      observer.disconnect()
      reject(new Error(`no tag showed ${marker} within 10 s`))
    }, 10_000)
    const observer = new MutationObserver(() => {
      if (!tags().some((tag) => tag.textContent.includes(marker))) return
      observer.disconnect()
      const commitAt = performance.now()
      requestAnimationFrame(() => {
        const channel = new MessageChannel()
        channel.port1.onmessage = async () => {
          const frameAt = performance.now()
          clearTimeout(timer)
          // The clone's body resolves with the app's own read; wait for it
          // only if the stamp is not in yet.
          let answer
          for (let i = 0; i < 50 && !answer; i += 1) {
            answer = window.__rtSettingsAnswers
              .slice(before)
              .find((entry) => entry.text.includes(marker))
            if (!answer) await new Promise((r) => setTimeout(r, 20))
          }
          if (!answer) {
            reject(new Error('the settings answer was never stamped'))
            return
          }
          const shown = tags()
          resolve({
            marker,
            commitMs: commitAt - answer.at,
            frameMs: frameAt - answer.at,
            visibleTags: shown.length,
            changedTags: shown.filter((tag) => tag.textContent.includes(marker))
              .length,
          })
        }
        channel.port2.postMessage(null)
      })
    })
    observer.observe(document.body, {
      subtree: true,
      childList: true,
      characterData: true,
      attributes: true,
    })
    document.dispatchEvent(new Event('visibilitychange', { bubbles: true }))
  })
}

function stats(values) {
  const sorted = [...values].sort((a, b) => a - b)
  const at = (q) =>
    sorted[Math.min(sorted.length - 1, Math.ceil(q * sorted.length) - 1)]
  const round = (n) => Math.round(n * 10) / 10
  return {
    median: round(at(0.5)),
    max: round(sorted.at(-1)),
  }
}

/** The page shows the `fifty` seed when this starts. */
async function runMode(page, name) {
  const rounds = []
  for (let round = 0; round < ROUNDS; round += 1) {
    const renamed = round % 2 === 0
    await post(`/__fake/settings?seed=${renamed ? 'fifty-renamed' : 'fifty'}`)
    const result = await page.evaluate(timedRefresh, {
      marker: renamed ? '改名' : '常用',
      icon: FOLDER_ICON,
    })
    rounds.push(result)
    // Let the next poll and any entrance settle between rounds.
    await sleep(1500)
  }
  return {
    mode: name,
    rounds,
    frame: stats(rounds.map((entry) => entry.frameMs)),
    commit: stats(rounds.map((entry) => entry.commitMs)),
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
  await post('/__fake/mode?data=many&paths=varied')
  await post('/__fake/settings?reset=1')
  await post('/__fake/settings?seed=fifty')
  await sleep(1100)
  mkdirSync(OUT_DIR, { recursive: true })
  browser = await chromium.launch()
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    baseURL: BASE,
  })
  await context.addInitScript(stampSettingsAnswers)
  const page = await context.newPage()
  await login(page)

  await page.goto('/?sort=added_on')
  await page.getByRole('listitem').first().waitFor()
  await page.getByText('常用 01').first().waitFor()
  await sleep(1500)
  const list = await runMode(page, 'list')

  await page.goto('/')
  await page.getByRole('region', { name: '看板' }).waitFor()
  await page.getByText('常用 01').first().waitFor()
  await sleep(1500)
  const board = await runMode(page, 'board')

  const runs = [list, board]
  const result = {
    recordedAt: new Date().toISOString(),
    data: 'fake-qbit many + paths=varied (4165 visible torrents, 4165 distinct save paths under 50 parents), seeds fifty and fifty-renamed (50 common paths, all renamed and every 媒體庫 flipped each round)',
    browser: 'headless Chromium, 1440 x 900',
    method:
      'in-page: performance.now() when fetch() resolves with the settings answer (init-script wrapper); commit = a MutationObserver sees the first visible tag with the new name; frame = requestAnimationFrame then a MessageChannel task (after the first frame with the new tags is painted)',
    budgetMs: BUDGET_MS,
    runs,
    // Every round changed every visible tag (no tag left on the old list).
    allTagsChanged: runs.every((run) =>
      run.rounds.every(
        (entry) =>
          entry.visibleTags > 0 && entry.changedTags === entry.visibleTags,
      ),
    ),
  }
  result.ok =
    result.allTagsChanged && runs.every((run) => run.frame.max <= BUDGET_MS)
  writeFileSync(
    `${OUT_DIR}/location-tags-timing.json`,
    `${JSON.stringify(result, null, 2)}\n`,
  )
  for (const run of runs) {
    console.log(
      `${run.mode}: frame median ${run.frame.median} ms, max ${run.frame.max} ms; commit median ${run.commit.median} ms, max ${run.commit.max} ms`,
    )
    for (const entry of run.rounds) {
      console.log(
        `  ${entry.marker} commit ${entry.commitMs.toFixed(1)} ms, frame ${entry.frameMs.toFixed(1)} ms (${entry.changedTags}/${entry.visibleTags} tags)`,
      )
    }
  }
  if (!result.allTagsChanged) {
    console.log('FAILED: a round left some visible tags on the old list')
  }
  console.log(result.ok ? 'ok: within budget' : 'NOT OK')
  if (!result.ok) process.exitCode = 1
}
