import type { Page } from '@playwright/test'
import {
  DEFAULT_MODES,
  expect,
  login,
  opCalls,
  setModes,
  test,
} from './fixtures'

// Story 2.6: 暫停／繼續 from the detail's 「⋯」 and the failure toast, in
// Chromium against the built server and scripts/fake-qbit.mjs (fake data
// only, AD-15: the fake records the calls and flips the states). Sample
// data: E01 downloading in the board's 下載中. Calm data: E07 stoppedUP in
// 完成, E02 seeding. Screenshots for the PR: the menu (暫停, 繼續) and the
// failure toast, desktop and phone 390 (over the sheet), light and dark.

const SCREENSHOT_DIR = 'e2e-output/screenshots/2-6'
const DESKTOP = { width: 1440, height: 900 }
const PHONE = { width: 390, height: 844 }
const SCHEMES = ['light', 'dark'] as const
const hashOf = (n: number) => n.toString(16).padStart(40, '0')
const FAILURE = '暫停失敗：qBittorrent 拒絕這個操作'
/** fake-qbit's call log entries for E01. */
const STOP = { op: 'stop', hashes: [hashOf(1)] }
const STOP_REJECTED = { ...STOP, rejected: true }
const START_REJECTED = { op: 'start', hashes: [hashOf(1)], rejected: true }

test.beforeEach(async ({ request }) => {
  await setModes(request, DEFAULT_MODES)
})

test.afterEach(async ({ request }) => {
  await setModes(request, DEFAULT_MODES)
})

const panel = (page: Page) => page.getByRole('complementary', { name: '詳情' })
const sheet = (page: Page) => page.getByRole('dialog')
const menu = (page: Page) => page.getByRole('menu')
const toastCard = (page: Page) => page.locator('[data-slot="toast"]')
/** The hero headline of the detail (the board's phone tabs are tabpanels too). */
const headline = (page: Page) =>
  page.getByRole('tabpanel', { name: '概覽' }).locator('p').first()

/** Waits until no animation runs (slides, fades, the toast's rise). */
async function settled(page: Page) {
  await page.waitForFunction(() =>
    document
      .getAnimations()
      .every((animation) => animation.playState !== 'running'),
  )
}

async function openMenu(page: Page) {
  await page.getByRole('button', { name: '更多動作' }).click()
  await expect(menu(page)).toBeVisible()
}

test('pause a downloading torrent: one stop call, no toast, 已暫停 and 繼續 after the refresh', async ({
  page,
  request,
}) => {
  await page.setViewportSize(DESKTOP)
  await login(page)
  await page.goto(`/?hash=${hashOf(1)}`)
  await expect(panel(page)).toBeVisible()
  await expect(headline(page)).toHaveText('下載中　87%')

  await openMenu(page)
  await expect(menu(page).getByRole('menuitem')).toHaveText(['暫停'])
  await menu(page).getByRole('menuitem', { name: '暫停' }).click()

  await expect(headline(page)).toHaveText('已暫停　87%')
  expect(await opCalls(request)).toEqual([{ op: 'stop', hashes: [hashOf(1)] }])
  await expect(toastCard(page)).toHaveCount(0)
  // Still 下載中's column; the item now offers 繼續, enabled.
  await expect(
    panel(page).getByText(/^下載中\u3000第 1 個／共 \d 個$/),
  ).toBeVisible()
  await openMenu(page)
  const resume = menu(page).getByRole('menuitem', { name: '繼續' })
  await expect(resume).toBeVisible()
  await expect(resume).not.toHaveAttribute('aria-disabled', 'true')
})

test('start a 已完成 torrent: it moves to 做種中, the panel stays and recounts', async ({
  page,
  request,
}) => {
  await setModes(request, { data: 'calm' })
  await page.setViewportSize(DESKTOP)
  await login(page)
  await page.goto(`/?hash=${hashOf(7)}`)
  await expect(panel(page)).toBeVisible()
  await expect(headline(page)).toHaveText('已完成')
  await expect(panel(page).getByText('完成　第 1 個／共 1 個')).toBeVisible()

  await openMenu(page)
  await menu(page).getByRole('menuitem', { name: '繼續' }).click()

  await expect(headline(page)).toHaveText(/^做種 /)
  await expect(
    panel(page).getByText(/^做種中\u3000第 \d 個／共 2 個$/),
  ).toBeVisible()
  expect(await opCalls(request)).toEqual([{ op: 'start', hashes: [hashOf(7)] }])
  await expect(toastCard(page)).toHaveCount(0)
  await expect(page).toHaveURL(new RegExp(`[?&]hash=${hashOf(7)}`))
})

test('rejected: the failure toast with 重試; 重試 resends; ✕ closes', async ({
  page,
  request,
}) => {
  await setModes(request, { ops: 'reject' })
  await page.setViewportSize(DESKTOP)
  await login(page)
  await page.goto(`/?hash=${hashOf(1)}`)
  await expect(panel(page)).toBeVisible()

  await openMenu(page)
  await menu(page).getByRole('menuitem', { name: '暫停' }).click()
  await expect(toastCard(page)).toBeVisible()
  await expect(toastCard(page)).toContainText(FAILURE)
  await expect(page.getByRole('alert')).toContainText(FAILURE)
  expect(await opCalls(request)).toEqual([STOP_REJECTED])
  // Desktop: bottom right, 24px in, 356px wide (after the rise).
  await settled(page)
  const box = await toastCard(page).boundingBox()
  expect(box?.width).toBe(356)
  expect(Math.round((box?.x ?? 0) + (box?.width ?? 0))).toBe(DESKTOP.width - 24)
  expect(Math.round((box?.y ?? 0) + (box?.height ?? 0))).toBe(
    DESKTOP.height - 24,
  )
  // A failure never closes on its own.
  await page.waitForTimeout(4500)
  await expect(toastCard(page)).toBeVisible()
  // The item is enabled again; the state did not change.
  await expect(headline(page)).toHaveText('下載中　87%')

  // Still rejected: 重試 sends again and shows the toast again.
  await toastCard(page).getByRole('button', { name: '重試' }).click()
  await expect(toastCard(page)).toBeVisible()
  await expect
    .poll(async () => await opCalls(request))
    .toEqual([STOP_REJECTED, STOP_REJECTED])

  // qBittorrent accepts now: 重試 closes the toast and the pause shows.
  await setModes(request, { ops: 'normal' })
  await toastCard(page).getByRole('button', { name: '重試' }).click()
  await expect(toastCard(page)).toHaveCount(0)
  await expect(headline(page)).toHaveText('已暫停　87%')
  expect(await opCalls(request)).toEqual([STOP_REJECTED, STOP_REJECTED, STOP])

  // ✕ closes a failure toast without sending anything.
  await setModes(request, { ops: 'reject' })
  await openMenu(page)
  await menu(page).getByRole('menuitem', { name: '繼續' }).click()
  await expect(toastCard(page)).toContainText(
    '繼續失敗：qBittorrent 拒絕這個操作',
  )
  const before = await opCalls(request)
  expect(before.at(-1)).toEqual(START_REJECTED)
  await toastCard(page).getByRole('button', { name: '關閉' }).click()
  await expect(toastCard(page)).toHaveCount(0)
  // Nothing new was sent.
  await page.waitForTimeout(500)
  expect(await opCalls(request)).toEqual(before)
})

test('phone 390: the menu inside the sheet; the failure toast on top of the sheet, 重試 and ✕ work', async ({
  page,
  request,
}) => {
  await setModes(request, { ops: 'reject' })
  await page.setViewportSize(PHONE)
  await login(page)
  await page.goto(`/?hash=${hashOf(1)}`)
  await expect(sheet(page)).toBeVisible()
  await settled(page)

  const more = sheet(page).getByRole('button', { name: '更多動作' })
  expect((await more.boundingBox())?.height).toBe(44)
  await more.click()
  await expect(menu(page)).toBeVisible()
  // Portaled into the sheet, so its focus trap leaves the menu open.
  expect(
    await menu(page).evaluate(
      (element) => element.closest('[role="dialog"]') !== null,
    ),
  ).toBe(true)
  const item = menu(page).getByRole('menuitem', { name: '暫停' })
  expect((await item.boundingBox())?.height).toBe(44)
  await item.click()

  await expect(toastCard(page)).toBeVisible()
  await settled(page)
  const box = await toastCard(page).boundingBox()
  expect(Math.round(box?.x ?? 0)).toBe(16)
  expect(Math.round(box?.y ?? 0)).toBe(16)
  expect(Math.round(box?.width ?? 0)).toBe(PHONE.width - 32)
  // On top of the sheet and its scrim: the point hits the toast.
  const retry = toastCard(page).getByRole('button', { name: '重試' })
  const hit = await retry.evaluate((element) => {
    const rect = element.getBoundingClientRect()
    const top = document.elementFromPoint(
      rect.left + rect.width / 2,
      rect.top + rect.height / 2,
    )
    return top === element || element.contains(top)
  })
  expect(hit).toBe(true)
  // Focusable over the open sheet: focus stays on it.
  await retry.focus()
  expect(
    await retry.evaluate((element) => document.activeElement === element),
  ).toBe(true)

  await setModes(request, { ops: 'normal' })
  await retry.click()
  await expect(toastCard(page)).toHaveCount(0)
  await expect(sheet(page)).toBeVisible()
  await expect(headline(page)).toHaveText('已暫停　87%')
  expect(await opCalls(request)).toEqual([STOP_REJECTED, STOP])

  await setModes(request, { ops: 'reject' })
  await more.click()
  await menu(page).getByRole('menuitem', { name: '繼續' }).click()
  await expect(toastCard(page)).toBeVisible()
  await toastCard(page).getByRole('button', { name: '關閉' }).click()
  await expect(toastCard(page)).toHaveCount(0)
  await page.waitForTimeout(500)
  expect(await opCalls(request)).toEqual([STOP_REJECTED, STOP, START_REJECTED])
  await expect(sheet(page)).toBeVisible()
})

test('screenshots: menu (暫停, 繼續) and failure toast, desktop and phone 390, light and dark', async ({
  page,
  request,
}) => {
  await login(page)
  for (const scheme of SCHEMES) {
    await page.emulateMedia({ colorScheme: scheme })

    // 暫停 (sample E01) and 繼續 (calm E07), desktop then phone.
    for (const [data, n, word] of [
      ['sample', 1, 'pause'],
      ['calm', 7, 'resume'],
    ] as const) {
      await setModes(request, { data })
      await page.setViewportSize(DESKTOP)
      await page.goto(`/?hash=${hashOf(n)}`)
      await expect(panel(page)).toBeVisible()
      await openMenu(page)
      await settled(page)
      await page.screenshot({
        path: `${SCREENSHOT_DIR}/menu-${word}-desktop-${scheme}.png`,
        animations: 'disabled',
      })

      await page.setViewportSize(PHONE)
      await page.goto(`/?hash=${hashOf(n)}`)
      await expect(sheet(page)).toBeVisible()
      await settled(page)
      await sheet(page).getByRole('button', { name: '更多動作' }).click()
      await expect(menu(page)).toBeVisible()
      await settled(page)
      await page.screenshot({
        path: `${SCREENSHOT_DIR}/menu-${word}-phone-${scheme}.png`,
        animations: 'disabled',
      })
    }

    await setModes(request, { data: 'sample', ops: 'reject' })
    await page.setViewportSize(DESKTOP)
    await page.goto(`/?hash=${hashOf(1)}`)
    await expect(panel(page)).toBeVisible()
    await openMenu(page)
    await menu(page).getByRole('menuitem', { name: '暫停' }).click()
    await expect(toastCard(page)).toBeVisible()
    await settled(page)
    await page.screenshot({
      path: `${SCREENSHOT_DIR}/toast-failure-desktop-${scheme}.png`,
      animations: 'disabled',
    })

    await page.setViewportSize(PHONE)
    await page.goto(`/?hash=${hashOf(1)}`)
    await expect(sheet(page)).toBeVisible()
    await settled(page)
    await sheet(page).getByRole('button', { name: '更多動作' }).click()
    await menu(page).getByRole('menuitem', { name: '暫停' }).click()
    await expect(toastCard(page)).toBeVisible()
    await settled(page)
    await page.screenshot({
      path: `${SCREENSHOT_DIR}/toast-failure-phone-sheet-${scheme}.png`,
      animations: 'disabled',
    })
    await setModes(request, { ops: 'normal' })
  }
})
