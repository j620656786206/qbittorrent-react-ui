// Story 3.7: a Playwright video of the desktop keyboard flow, for the PR
// (`gh` cannot attach files, so the video is committed and linked). Local
// only, never in CI. Starts scripts/fake-qbit.mjs (fake data only, AD-15)
// on its own port with the `sample` data and fresh settings, desktop
// 1280 x 800, headless Chromium with video recording, and presses: `2`
// (second category tab), `1` (back to 「全部」), `S` then `3` (加入時間),
// `↓` `↓` `↑` (the viewed row and focus follow), `?` (the 「快捷鍵」
// window), `Esc` (closes it). Pauses between keys so the video can be
// followed. Writes _bmad-output/implementation-artifacts/screenshots/3-7/
// shortcuts.webm and fails when a step does not show what it should.
// https://playwright.dev/docs/videos
//
// Usage: npm run build && node scripts/record-shortcuts.mjs

import { spawn } from 'node:child_process'
import { mkdirSync, renameSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { chromium } from '@playwright/test'

const PORT = 3297
const BASE = `http://localhost:${PORT}`
const OUT_DIR = '_bmad-output/implementation-artifacts/screenshots/3-7'
const VIDEO = join(OUT_DIR, 'shortcuts.webm')
const RAW_DIR = join(OUT_DIR, '.raw-video')
const VIEWPORT = { width: 1280, height: 800 }
const PAUSE_MS = 900
/**
 * The container reuses a qBittorrent pull for 1 s (syncer
 * MIN_PULL_INTERVAL_MS), so a page loaded right after the data mode
 * changed could still get the old torrents; e2e/fixtures.ts waits the same
 * (PULL_REUSE_WAIT_MS). Nothing on the page says when that window ends.
 */
const PULL_REUSE_WAIT_MS = 1100

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
  await page
    .locator('#rt-main [aria-busy="true"]')
    .waitFor({ state: 'detached' })
}

/** Fails the run unless `check` turns true within 5 s. */
async function expectSoon(label, check) {
  for (let i = 0; i < 50; i += 1) {
    if (await check()) return
    await sleep(100)
  }
  throw new Error(`step failed: ${label}`)
}

const param = (page, name) => new URL(page.url()).searchParams.get(name)

async function key(page, name) {
  await page.keyboard.press(name)
  await sleep(PAUSE_MS)
}

async function record() {
  await waitForHealth()
  await post('/__fake/mode?data=sample')
  await post('/__fake/settings?reset=1')
  await sleep(PULL_REUSE_WAIT_MS)
  rmSync(RAW_DIR, { recursive: true, force: true })
  mkdirSync(RAW_DIR, { recursive: true })
  // Closed here, whatever happens, so a run cut short leaves no browser.
  const browser = await chromium.launch()
  try {
    await recordWith(browser)
  } finally {
    await browser.close()
  }
}

async function recordWith(browser) {
  const context = await browser.newContext({
    viewport: VIEWPORT,
    baseURL: BASE,
    recordVideo: { dir: RAW_DIR, size: VIEWPORT },
  })
  const page = await context.newPage()
  let recorded = false
  try {
    await login(page)
    await sleep(PAUSE_MS)

    const tabs = page.getByRole('group', { name: '分類' }).getByRole('button')
    const rowButton = (index) =>
      page.getByRole('listitem').nth(index).getByRole('button')

    await key(page, '2')
    await expectSoon('2 selects the second tab', async () => {
      return (await tabs.nth(1).getAttribute('aria-pressed')) === 'true'
    })
    await key(page, '1')
    await expectSoon(
      '1 selects 全部',
      async () => param(page, 'category') === null,
    )

    await key(page, 'S')
    await expectSoon('S opens the sort menu', () =>
      page.getByRole('menu', { name: '排序' }).isVisible(),
    )
    await key(page, '3')
    await expectSoon('3 picks 加入時間', async () => {
      return param(page, 'sort') === 'added_on'
    })

    await key(page, 'ArrowDown')
    await key(page, 'ArrowDown')
    await expectSoon('↓ ↓ views the third row', async () => {
      return (await rowButton(2).getAttribute('aria-current')) === 'true'
    })
    await key(page, 'ArrowUp')
    await expectSoon('↑ views the second row, focused', async () => {
      const current =
        (await rowButton(1).getAttribute('aria-current')) === 'true'
      const focused = await rowButton(1).evaluate(
        (element) => element === document.activeElement,
      )
      return current && focused
    })

    await key(page, 'Shift+Slash')
    await expectSoon('? opens the 快捷鍵 window', () =>
      page.getByRole('dialog', { name: '快捷鍵' }).isVisible(),
    )
    await sleep(PAUSE_MS)
    await key(page, 'Escape')
    await expectSoon('Esc closes it', async () => {
      return (await page.getByRole('dialog', { name: '快捷鍵' }).count()) === 0
    })

    recorded = true
  } finally {
    // A failed run leaves no partial video in the tracked folder.
    const video = page.video()
    await context.close()
    const raw = await video?.path()
    if (recorded && raw) {
      rmSync(VIDEO, { force: true })
      renameSync(raw, VIDEO)
    }
    rmSync(RAW_DIR, { recursive: true, force: true })
  }
  console.log(`ok: ${VIDEO}`)
}

const server = spawn(
  process.execPath,
  ['scripts/fake-qbit.mjs', '--port', String(PORT)],
  { stdio: ['ignore', 'ignore', 'pipe'] },
)
server.stderr.pipe(process.stderr)
let finished = false
const serverExited = new Promise((_, reject) => {
  server.on('exit', (code, signal) => {
    if (!finished) {
      reject(new Error(`fake-qbit exited early (${signal ?? code})`))
    }
  })
})
serverExited.catch(() => {})

try {
  await Promise.race([record(), serverExited])
} catch (error) {
  console.error(error instanceof Error ? error.message : error)
  process.exitCode = 1
} finally {
  finished = true
  rmSync(RAW_DIR, { recursive: true, force: true })
  server.kill('SIGTERM')
}
