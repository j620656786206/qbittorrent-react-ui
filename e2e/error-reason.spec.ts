import type { APIRequestContext, Page } from '@playwright/test'
import { DEFAULT_MODES, expect, login, setModes, test } from './fixtures'

// Story 2.10: an errored torrent's reason from qBittorrent's log, in
// Chromium against the built server and scripts/fake-qbit.mjs (one fake log
// for every data set). `many`: the errored torrent has a markup name, its
// newest line is a file error alert with No such file or directory.
// `states`: Fake.State.10.Error's newest line is an upload-only error with
// No space left on device. The container reads log/main at most once a
// minute. Screenshots for the PR: the board card and the detail hero,
// desktop and phone, light and dark.

const SCREENSHOT_DIR = 'e2e-output/screenshots/2-10'
const DESKTOP = { width: 1440, height: 900 }
const PHONE = { width: 390, height: 844 }
const SCHEMES = ['light', 'dark'] as const
const ERRORED_NAME = '<img src=x onerror=alert(1)>'
const STATES_ERROR_HASH = (0x300a).toString(16).padStart(40, '0')
const UNKNOWN_HASH = (0x300d).toString(16).padStart(40, '0')
const UNKNOWN_NAME = 'Fake.State.13.ErrorUnknown.1080p'
const CLEANED = 'fake tracker （位址） refused （路徑）'
/** The container's window (src/server/sync/error-reasons.ts). */
const ERROR_REASON_REFRESH_MS = 55_000

test.beforeEach(async ({ request }) => {
  await setModes(request, { ...DEFAULT_MODES, data: 'many' })
})

test.afterEach(async ({ request }) => {
  await setModes(request, DEFAULT_MODES)
})

/** The desktop board region, or the phone's status tabs (no region). */
const board = (page: Page) => page.getByRole('main')
const panel = (page: Page) => page.getByRole('complementary', { name: '詳情' })
const sheet = (page: Page) => page.getByRole('dialog')
const erroredCard = (page: Page) =>
  board(page)
    .getByRole('listitem')
    .locator(':scope > button')
    .filter({ has: page.getByTitle(ERRORED_NAME, { exact: true }) })
const heroSummary = (scope: ReturnType<typeof panel>) =>
  scope.locator('[role="tabpanel"] p').nth(1)

/** The times (ms) of every log/main request the fake received. */
async function logRequests(request: APIRequestContext) {
  const response = await request.get('/__fake/log')
  expect(response.ok(), await response.text()).toBe(true)
  const { requests } = (await response.json()) as {
    requests: Array<{ lastKnownId: number; at: number }>
  }
  return requests
}

/** No two log/main requests closer than the container's rate limit. */
async function expectRateLimited(request: APIRequestContext) {
  const requests = await logRequests(request)
  for (let index = 1; index < requests.length; index += 1) {
    expect(requests[index].at - requests[index - 1].at).toBeGreaterThanOrEqual(
      ERROR_REASON_REFRESH_MS - 50,
    )
  }
  return requests
}

/** Waits until no finite animation runs (the panel slide, the entrance). */
async function settled(page: Page) {
  await page.waitForFunction(() =>
    document
      .getAnimations()
      .every(
        (animation) =>
          animation.playState !== 'running' ||
          animation.effect?.getTiming().iterations === Infinity,
      ),
  )
}

test('many: the errored card and its detail show the cleaned reason as text; log/main stays rate limited', async ({
  page,
  request,
}) => {
  await page.setViewportSize(DESKTOP)
  await login(page)
  const card = erroredCard(page)
  await expect(card).toContainText('找不到檔案或資料夾')
  await expect(card).not.toContainText('qBittorrent 回報錯誤')
  // Never a path from the log line.
  await expect(card).not.toContainText('/data/')
  // The markup name stays text.
  await expect(page.locator('img')).toHaveCount(0)

  await card.click()
  await expect(panel(page)).toBeVisible()
  await expect(heroSummary(panel(page))).toHaveText('找不到檔案或資料夾')

  // The list row says it too; reloads within the minute ask nothing more.
  await page.goto('/?sort=added_on')
  const row = page
    .getByRole('listitem')
    .filter({ has: page.getByTitle(ERRORED_NAME, { exact: true }) })
  await expect(row).toContainText('找不到檔案或資料夾')
  await page.reload()
  await expect(row).toContainText('找不到檔案或資料夾')
  const requests = await expectRateLimited(request)
  expect(requests.length).toBeLessThanOrEqual(1)
})

test('states: the upload-only error reads 磁碟空間不足 in the detail', async ({
  page,
  request,
}) => {
  await setModes(request, { data: 'states' })
  await page.setViewportSize(DESKTOP)
  await login(page)
  await page.goto(`/?hash=${STATES_ERROR_HASH}`)
  await expect(panel(page)).toBeVisible()
  await expect(heroSummary(panel(page))).toHaveText('磁碟空間不足')
  await expectRateLimited(request)
})

test('states: an unknown reason is cleaned on the card and in the detail; the answer carries no path or address', async ({
  page,
  request,
}) => {
  await setModes(request, { data: 'states' })
  await page.setViewportSize(DESKTOP)
  // Every getErrorReasons answer body (the ones that carry `reasons`).
  const bodies: Array<Promise<string>> = []
  page.on('response', (response) => {
    if (response.url().includes('/_serverFn/'))
      bodies.push(response.text().catch(() => ''))
  })
  await login(page)
  const card = board(page)
    .getByRole('listitem')
    .locator(':scope > button')
    .filter({ has: page.getByTitle(UNKNOWN_NAME, { exact: true }) })
  await expect(card).toContainText(CLEANED)
  await page.goto(`/?hash=${UNKNOWN_HASH}`)
  await expect(heroSummary(panel(page))).toHaveText(CLEANED)
  const reasonBodies = (await Promise.all(bodies)).filter((body) =>
    body.includes('reasons'),
  )
  expect(reasonBodies.length).toBeGreaterThan(0)
  for (const body of reasonBodies) {
    expect(body).toContain('（路徑）')
    expect(body).not.toContain('/data/')
    expect(body).not.toContain('203.0.113')
  }
  await expectRateLimited(request)
})

test('screenshots: errored card and detail, desktop and phone, light and dark', async ({
  page,
  request,
}) => {
  await login(page)
  for (const scheme of SCHEMES) {
    await page.emulateMedia({ colorScheme: scheme })

    await page.setViewportSize(DESKTOP)
    await page.goto('/')
    await expect(erroredCard(page)).toContainText('找不到檔案或資料夾')
    await settled(page)
    await page.screenshot({
      path: `${SCREENSHOT_DIR}/board-desktop-${scheme}.png`,
      animations: 'disabled',
    })
    await erroredCard(page).click()
    await expect(heroSummary(panel(page))).toHaveText('找不到檔案或資料夾')
    await settled(page)
    await page.screenshot({
      path: `${SCREENSHOT_DIR}/detail-desktop-${scheme}.png`,
      animations: 'disabled',
    })

    await page.setViewportSize(PHONE)
    await page.goto('/')
    await expect(erroredCard(page)).toContainText('找不到檔案或資料夾')
    await settled(page)
    await page.screenshot({
      path: `${SCREENSHOT_DIR}/board-phone-${scheme}.png`,
      animations: 'disabled',
    })
    await erroredCard(page).click()
    await expect(sheet(page)).toBeVisible()
    await expect(sheet(page).locator('[role="tabpanel"] p').nth(1)).toHaveText(
      '找不到檔案或資料夾',
    )
    await settled(page)
    await page.screenshot({
      path: `${SCREENSHOT_DIR}/detail-phone-${scheme}.png`,
      animations: 'disabled',
    })
  }
  await expectRateLimited(request)
})
