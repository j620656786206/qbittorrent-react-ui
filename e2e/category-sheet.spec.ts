import { mkdirSync } from 'node:fs'
import type { Page } from '@playwright/test'
import {
  DEFAULT_MODES,
  LIST_SCROLL_ID,
  MAIN_ID,
  expect,
  expectSaveOf,
  login,
  setModes,
  test,
} from './fixtures'
import { REMEMBERED_HINT_LINE_PREFIX } from '../src/features/header/sort-model'

// Story 3.4: the phone category button and sheet at 390px in Chromium
// against the built app and scripts/fake-qbit.mjs (fake data, code-name
// categories only). The button opens the 「分類」 sheet; a row switches the
// category like a desktop tab (URL, remembered sort, hint line); the
// current row only closes it; 「設定」 opens the settings page and back
// returns to the list. The hint line sits under the third row and pushes
// the list down; a manual sort pick removes it. The PR screenshots (light
// and dark) go to e2e-output/screenshots/3-4/. The fixtures fail the test
// on any CSP violation or console error.

const PHONE = { width: 390, height: 844 }
const SCREENSHOT_DIR = 'e2e-output/screenshots/3-4'
const HINT_LINE = `${REMEMBERED_HINT_LINE_PREFIX}做種時間 ↓`

test.beforeEach(async ({ request }) => {
  await setModes(request, DEFAULT_MODES)
})

test.afterEach(async ({ request }) => {
  await setModes(request, DEFAULT_MODES)
})

const categoryButton = (page: Page) =>
  page.getByRole('button', { name: /^分類：/ }).filter({ visible: true })
const categorySheet = (page: Page) => page.getByRole('dialog', { name: '分類' })
/** The sheet's row for `label` (its name reads 「<label>，<count> 個」). */
const categoryRow = (page: Page, label: string) =>
  categorySheet(page)
    .getByRole('listitem')
    .getByRole('button', {
      name: new RegExp(
        `^${label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(，|$)`,
      ),
    })
const sortPill = (page: Page) =>
  page
    .getByRole('button', { name: /^排序：.*，(列表|看板)$/ })
    .filter({ visible: true })
const hintLine = (page: Page) =>
  page.getByRole('status').filter({ hasText: REMEMBERED_HINT_LINE_PREFIX })

async function pickCategory(page: Page, label: string) {
  await categoryButton(page).click()
  await expect(categorySheet(page)).toBeVisible()
  await categoryRow(page, label).click()
  await expect(categorySheet(page)).toHaveCount(0)
}

/** Picks `label` in the phone sort sheet. */
async function pickSort(page: Page, label: string) {
  await sortPill(page).click()
  await page
    .getByRole('dialog', { name: '排序' })
    .getByRole('button', { name: label, exact: true })
    .click()
}

/** mteam-tv remembers 做種時間, and the screen ends on 全部 (狀態). */
async function rememberSeedingTimeForTv(page: Page) {
  await pickCategory(page, 'mteam-tv')
  await expect(page).toHaveURL(/[?&]category=mteam-tv/)
  // Nothing remembered yet: 狀態, no line.
  await expect(hintLine(page)).toHaveCount(0)
  await expectSaveOf(page, 'mteam-tv', () => pickSort(page, '做種時間'))
  await pickCategory(page, '全部')
  await expect(page).not.toHaveURL(/category=/)
  await expect(sortPill(page)).toHaveAccessibleName('排序：狀態，看板')
  await expect(hintLine(page)).toHaveCount(0)
}

/** `main`'s top edge: content under the third row moves when it grows. */
const mainTop = (page: Page) =>
  page
    .locator(`#${MAIN_ID}`)
    .evaluate((element) => element.getBoundingClientRect().top)

const horizontalOverflow = (page: Page) =>
  page.evaluate(
    () =>
      document.documentElement.scrollWidth -
      document.documentElement.clientWidth,
  )

/** Waits for the sheet slide and the entrance, so a screenshot is final. */
async function settle(page: Page) {
  await page.evaluate(async () => {
    await new Promise((resolve) => requestAnimationFrame(resolve))
    await Promise.all(
      document
        .getAnimations()
        .filter(
          (animation) => animation.effect?.getTiming().iterations !== Infinity,
        )
        .map((animation) => animation.finished.catch(() => null)),
    )
  })
}

test('the sheet: open, pick with a remembered sort, the line, pick current, a manual pick, 設定 and back', async ({
  page,
}) => {
  await page.setViewportSize(PHONE)
  await login(page)
  const button = categoryButton(page)
  await expect(button).toBeEnabled()
  await expect(button).toHaveAccessibleName('分類：全部')
  await expect(button).toHaveText('全部4')
  await expect(button).toHaveAttribute('aria-expanded', 'false')
  expect((await button.boundingBox())?.height).toBe(44)

  // Open: 「分類」, 全部 first then the tab order, focus on the current row,
  // 設定 last.
  await button.click()
  const sheet = categorySheet(page)
  await expect(sheet).toBeVisible()
  await expect(button).toHaveAttribute('aria-expanded', 'true')
  await expect(categoryRow(page, '全部')).toBeFocused()
  await expect(categoryRow(page, '全部')).toHaveAttribute(
    'aria-current',
    'true',
  )
  const rows = sheet.getByRole('listitem').getByRole('button')
  await expect(rows).toHaveCount(4)
  expect(await rows.first().getAttribute('aria-label')).toBe('全部，4 個')
  expect((await rows.first().boundingBox())?.height).toBe(52)
  await expect(
    sheet.getByRole('button', { name: '設定', exact: true }),
  ).toBeVisible()
  expect(await horizontalOverflow(page)).toBe(0)
  await sheet.getByRole('button', { name: '關閉' }).click()
  await expect(sheet).toHaveCount(0)
  await expect(button).toBeFocused()

  await rememberSeedingTimeForTv(page)
  const topWithoutLine = await mainTop(page)

  // mteam-tv again: its remembered 做種時間 and the line under the third
  // row, which pushes the list down.
  await pickCategory(page, 'mteam-tv')
  await expect
    .poll(() => {
      const params = new URL(page.url()).searchParams
      return [params.get('category'), params.get('sort'), params.get('dir')]
    })
    .toEqual(['mteam-tv', 'seeding_time', 'desc'])
  await expect(hintLine(page)).toHaveText(HINT_LINE)
  await expect(page.getByRole('listitem').first()).toBeVisible()
  const line = await hintLine(page).boundingBox()
  const pill = await sortPill(page).boundingBox()
  const topWithLine = await mainTop(page)
  if (line === null || pill === null) throw new Error('no line or pill box')
  expect(line.y).toBeGreaterThanOrEqual(pill.y + pill.height)
  expect(topWithLine).toBeGreaterThanOrEqual(line.y + line.height)
  expect(topWithLine).toBeGreaterThan(topWithoutLine)
  await expect(button).toHaveText(/^mteam-tv\d+$/)

  // The current row: the sheet closes and nothing changes.
  const urlBefore = page.url()
  await categoryButton(page).click()
  await expect(categoryRow(page, 'mteam-tv')).toBeFocused()
  await categoryRow(page, 'mteam-tv').click()
  await expect(categorySheet(page)).toHaveCount(0)
  expect(page.url()).toBe(urlBefore)
  await expect(hintLine(page)).toHaveText(HINT_LINE)

  // A manual pick removes the line, and the list moves back up.
  await expectSaveOf(page, 'mteam-tv', () => pickSort(page, '分享率'))
  await expect(hintLine(page)).toHaveCount(0)
  await expect.poll(() => mainTop(page)).toBe(topWithoutLine)

  // 設定: the settings page with the list's search; back returns.
  const listUrl = page.url()
  await categoryButton(page).click()
  await categorySheet(page)
    .getByRole('button', { name: '設定', exact: true })
    .click()
  await expect(categorySheet(page)).toHaveCount(0)
  await expect(page.getByRole('region', { name: '設定' })).toBeVisible()
  const settingsUrl = new URL(page.url())
  expect(settingsUrl.pathname).toBe('/settings')
  expect(settingsUrl.search).toBe(new URL(listUrl).search)
  await page.goBack()
  await expect.poll(() => page.url()).toBe(listUrl)
  await expect(page.getByRole('region', { name: '設定' })).toHaveCount(0)
  await expect(categoryButton(page)).toHaveAccessibleName('分類：mteam-tv')
})

test('on the settings page a pick goes to the list on that category', async ({
  page,
}) => {
  await page.setViewportSize(PHONE)
  await login(page)
  await page.goto('/settings')
  await expect(page.getByRole('region', { name: '設定' })).toBeVisible()
  await categoryButton(page).click()
  await expect(
    categorySheet(page).getByRole('button', { name: '設定', exact: true }),
  ).toHaveAttribute('aria-current', 'page')
  await categoryRow(page, 'mteam-X').click()
  await expect(categorySheet(page)).toHaveCount(0)
  await expect.poll(() => new URL(page.url()).pathname).toBe('/')
  await expect(page).toHaveURL(/[?&]category=mteam-X/)
  await expect(page.getByRole('region', { name: '設定' })).toHaveCount(0)
})

test('desktop width: no phone button and no line, the pill shows the hint instead', async ({
  page,
}) => {
  await page.setViewportSize(PHONE)
  await login(page)
  await rememberSeedingTimeForTv(page)
  await pickCategory(page, 'mteam-tv')
  await expect(hintLine(page)).toHaveText(HINT_LINE)
  await expect(hintLine(page)).toBeVisible()

  await page.setViewportSize({ width: 1280, height: 800 })
  await expect(sortPill(page)).toContainText('（這個分類記住的）')
  await expect(categoryButton(page)).toHaveCount(0)
  await expect(hintLine(page).filter({ visible: true })).toHaveCount(0)
})

test('a pick from the sheet goes back to the top of the list', async ({
  page,
  request,
}) => {
  await setModes(request, { data: 'many' })
  await page.setViewportSize(PHONE)
  await login(page)
  // List sorts for mteam-tv and 全部, so both stay in the list.
  await page.goto('/?category=mteam-tv&sort=added_on')
  await expectSaveOf(page, 'mteam-tv', () => pickSort(page, '做種時間'))
  await pickCategory(page, '全部')
  await expectSaveOf(page, '__all__', () => pickSort(page, '加入時間'))
  const scroller = page.locator(`#${LIST_SCROLL_ID}`)
  await expect(page.getByRole('listitem').first()).toBeVisible()
  await scroller.evaluate((element) => {
    element.scrollTop = 2000
  })
  await expect
    .poll(() => scroller.evaluate((element) => element.scrollTop))
    .toBeGreaterThan(0)
  await pickCategory(page, 'mteam-tv')
  await expect(hintLine(page)).toHaveText(HINT_LINE)
  await expect
    .poll(() => scroller.evaluate((element) => element.scrollTop))
    .toBe(0)
})

for (const scheme of ['light', 'dark'] as const) {
  test(`screenshots for the PR, 390px (${scheme})`, async ({ page }) => {
    mkdirSync(SCREENSHOT_DIR, { recursive: true })
    await page.emulateMedia({ colorScheme: scheme })
    await page.setViewportSize(PHONE)
    await login(page)
    await rememberSeedingTimeForTv(page)

    // The category button.
    await settle(page)
    expect(await horizontalOverflow(page)).toBe(0)
    await page.screenshot({
      path: `${SCREENSHOT_DIR}/category-button-phone-${scheme}.png`,
    })

    // The open sheet, 設定 included.
    await categoryButton(page).click()
    await expect(
      categorySheet(page).getByRole('button', { name: '設定', exact: true }),
    ).toBeInViewport()
    await settle(page)
    expect(await horizontalOverflow(page)).toBe(0)
    await page.screenshot({
      path: `${SCREENSHOT_DIR}/category-sheet-phone-${scheme}.png`,
    })

    // The hint line after switching to mteam-tv.
    await categoryRow(page, 'mteam-tv').click()
    await expect(hintLine(page)).toHaveText(HINT_LINE)
    await expect(page.getByRole('listitem').first()).toBeVisible()
    await settle(page)
    expect(await horizontalOverflow(page)).toBe(0)
    await page.screenshot({
      path: `${SCREENSHOT_DIR}/hint-line-phone-${scheme}.png`,
    })
  })
}
