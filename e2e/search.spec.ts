import { mkdirSync } from 'node:fs'
import type { Page } from '@playwright/test'
import {
  DEFAULT_MODES,
  MAIN_ID,
  expect,
  login,
  setModes,
  test,
} from './fixtures'

// Story 3.5: the in-list search in Chromium against the built app and
// scripts/fake-qbit.mjs (`sample` data: Fake.Show.S01E01 to E06 in X,
// mteam-tv and mteam-X, two archived). The magnifier and `/` open the box
// with focus in it (desktop: the 240 x 36px pill in the magnifier's place,
// no other button moving; phone: over the first row with 「取消」); typing
// filters by name and writes `q`; a category switch keeps the keyword; no
// result in a category offers 「在全部裡找」, in 「全部」 only the line; ✕,
// 「取消」 and `Esc` (before the detail) clear `q`; a reload
// with `q` opens the box. The PR screenshots (desktop and phone 390px,
// light and dark) go to e2e-output/screenshots/3-5/. The fixtures fail the
// test on any CSP violation or console error.

const DESKTOP = { width: 1280, height: 800 }
const PHONE = { width: 390, height: 844 }
const SCREENSHOT_DIR = 'e2e-output/screenshots/3-5'

test.beforeEach(async ({ request }) => {
  await setModes(request, DEFAULT_MODES)
})

test.afterEach(async ({ request }) => {
  await setModes(request, DEFAULT_MODES)
})

const magnifier = (page: Page) =>
  page.getByRole('button', { name: '搜尋', exact: true }).filter({
    visible: true,
  })
const field = (page: Page) =>
  page.getByRole('searchbox', { name: '找名字' }).filter({ visible: true })
const clearButton = (page: Page) =>
  page.getByRole('button', { name: '清除搜尋' }).filter({ visible: true })
const cancelButton = (page: Page) =>
  page.getByRole('button', { name: '取消', exact: true }).filter({
    visible: true,
  })
const board = (page: Page) => page.getByRole('region', { name: '看板' })
const noResult = (page: Page) =>
  page.locator(`#${MAIN_ID}`).getByRole('region', { name: '搜尋結果' })
const panel = (page: Page) => page.getByRole('complementary', { name: '詳情' })
const searchAll = (page: Page) =>
  page.getByRole('button', { name: '在全部裡找' })

/** The tab whose name (first span) is exactly `label`. */
const tab = (page: Page, label: string) =>
  page
    .getByRole('group', { name: '分類' })
    .filter({ visible: true })
    .getByRole('button')
    .filter({
      has: page.locator(':scope > span:first-child', {
        hasText: new RegExp(
          `^${label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`,
        ),
      }),
    })

/** The board's column labels, left to right. */
const columns = (page: Page) =>
  board(page)
    .locator(':scope > section')
    .evaluateAll((sections) =>
      sections.map((section) => section.getAttribute('aria-label')),
    )

const query = (page: Page) => new URL(page.url()).searchParams.get('q')

const horizontalOverflow = (page: Page) =>
  page.evaluate(
    () =>
      document.documentElement.scrollWidth -
      document.documentElement.clientWidth,
  )

/** Waits for the entrance and transitions, so a screenshot is final. */
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

test('desktop: open, type, the board follows, switch keeps it, no result, 在全部裡找, ✕', async ({
  page,
}) => {
  await page.setViewportSize(DESKTOP)
  await login(page)
  const add = page
    .getByRole('button', { name: '新增', exact: true })
    .filter({ visible: true })
  const addBefore = await add.boundingBox()

  // The magnifier turns into the 240 x 36px pill; focus in the field.
  await magnifier(page).click()
  await expect(field(page)).toBeFocused()
  await expect(magnifier(page)).toHaveCount(0)
  const pill = page.getByRole('search').filter({ visible: true })
  const box = await pill.boundingBox()
  expect(box?.width).toBe(240)
  expect(box?.height).toBe(36)
  // Other buttons do not move.
  expect(await add.boundingBox()).toEqual(addBefore)

  // Typing filters by name (case and spaces aside) and writes q trimmed.
  await field(page).fill('  s01e02 ')
  await expect.poll(() => query(page)).toBe('s01e02')
  await expect
    .poll(() => columns(page))
    .toEqual([
      '要處理，0 個',
      '下載中，0 個',
      '做種中，1 個',
      '完成，0 個',
      '已整理欄',
    ])
  await expect(
    board(page).getByRole('region', { name: '下載中，0 個' }),
  ).toContainText('沒有')
  // Tab counts do not change.
  await expect(tab(page, '全部')).toHaveText('全部4')

  // Another category keeps the keyword and the box.
  await tab(page, 'mteam-X').click()
  await expect(page).toHaveURL(/[?&]category=mteam-X/)
  expect(query(page)).toBe('s01e02')
  await expect(field(page)).toHaveValue('  s01e02 ')
  await expect(noResult(page).getByRole('status')).toHaveText(
    '『s01e02』在 mteam-X 找不到',
  )

  // 「在全部裡找」: 全部, the keyword kept.
  await searchAll(page).click()
  await expect(page).not.toHaveURL(/category=/)
  expect(query(page)).toBe('s01e02')
  await expect(board(page)).toBeVisible()

  // ✕ clears q and collapses the box; focus back on the magnifier.
  await clearButton(page).click()
  await expect.poll(() => query(page)).toBeNull()
  await expect(field(page)).toHaveCount(0)
  await expect(magnifier(page)).toBeFocused()
  await expect
    .poll(() => columns(page))
    .toEqual([
      '要處理，2 個',
      '下載中，1 個',
      '做種中，1 個',
      '完成，0 個',
      '已整理欄',
    ])
})

test('desktop at 1024px: the pill does not move the other header buttons', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1024, height: 768 })
  await login(page)
  const buttons = page
    .locator('header')
    .filter({ visible: true })
    .getByRole('button')
    .filter({ hasNot: page.locator('svg.lucide-search') })
  const boxes = () =>
    buttons.evaluateAll((elements) =>
      elements
        .filter((element) => element.getAttribute('aria-label') !== '搜尋')
        .map((element) => {
          const box = element.getBoundingClientRect()
          return [
            element.textContent || element.getAttribute('aria-label'),
            box.x,
            box.y,
          ]
        }),
    )
  const before = await boxes()
  expect(before.length).toBe(3)
  await magnifier(page).click()
  await expect(field(page)).toBeFocused()
  const after = (await boxes()).filter(([name]) => name !== '清除搜尋')
  expect(after).toEqual(before)
  // The header still sits on one line.
  const header = await page
    .locator('header')
    .filter({ visible: true })
    .boundingBox()
  expect(header?.height).toBeLessThan(50)
})

test('desktop: / opens, Esc closes the search before the detail', async ({
  page,
}) => {
  await page.setViewportSize(DESKTOP)
  await login(page)
  // The detail panel open on a card.
  await board(page).getByText('Fake.Show.S01E02.1080p').click()
  await expect(panel(page)).toBeVisible()

  await page.keyboard.press('/')
  await expect(field(page)).toBeFocused()
  await expect(field(page)).toHaveValue('')
  await page.keyboard.type('S01E02')
  await expect.poll(() => query(page)).toBe('S01E02')

  // Esc: the search first (the panel stays), then the detail.
  await page.keyboard.press('Escape')
  await expect(field(page)).toHaveCount(0)
  await expect.poll(() => query(page)).toBeNull()
  await expect(panel(page)).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(panel(page)).toHaveCount(0)
})

test('no result in 全部, literal characters, archived matches and a reload', async ({
  page,
}) => {
  await page.setViewportSize(DESKTOP)
  await login(page)

  // 牧神記 in 全部: only the line.
  await page.goto('/?q=牧神記')
  await expect(field(page)).toHaveValue('牧神記')
  await expect(noResult(page)).toHaveText('找不到『牧神記』')
  await expect(searchAll(page)).toHaveCount(0)

  // `(` and `<script>` are text, matched literally.
  await field(page).fill('(')
  await expect(noResult(page)).toHaveText('找不到『(』')
  await field(page).fill('<script>')
  await expect(noResult(page)).toHaveText('找不到『<script>』')
  expect(await noResult(page).locator('script').count()).toBe(0)

  // Only an archived torrent matches: the board stays, its 已整理 count is 1.
  await field(page).fill('S01E05')
  await expect
    .poll(() => columns(page))
    .toEqual([
      '要處理，0 個',
      '下載中，0 個',
      '做種中，0 個',
      '完成，0 個',
      '已整理欄',
    ])
  await expect(
    board(page).getByRole('button', { name: '展開已整理欄，1 個' }),
  ).toBeVisible()
  // The list leaves archived torrents out: no result there.
  await page.goto('/?sort=added_on&q=S01E05')
  await expect(noResult(page)).toHaveText('找不到『S01E05』')

  // A reload with q: the box open with it, filtered.
  await page.goto('/?sort=added_on&q=S01E0')
  await expect(field(page)).toHaveValue('S01E0')
  await expect(page.getByRole('listitem')).toHaveCount(4)
})

test('phone: the field covers the first row; 取消 clears and closes', async ({
  page,
}) => {
  await page.setViewportSize(PHONE)
  await login(page)
  await magnifier(page).click()
  await expect(field(page)).toBeFocused()
  const box = await field(page)
    .locator('xpath=ancestor::*[@role="search"]')
    .boundingBox()
  expect(box?.height).toBe(44)
  // The title is covered, kept for screen readers only; the field is
  // 16px (no iOS zoom).
  await expect(
    page.getByRole('heading', { name: '種子' }).filter({ visible: true }),
  ).toHaveClass('sr-only')
  expect(
    await field(page).evaluate((element) => getComputedStyle(element).fontSize),
  ).toBe('16px')
  await field(page).fill('S01E02')
  await expect.poll(() => query(page)).toBe('S01E02')
  expect(await horizontalOverflow(page)).toBe(0)
  // A long keyword without break points wraps; no sideways scroll.
  const long = `Fake.${'Season.Pack.Extended.'.repeat(6)}Nothing`
  await field(page).fill(long)
  await expect(noResult(page)).toHaveText(`找不到『${long}』`)
  expect(await horizontalOverflow(page)).toBe(0)
  const block = await noResult(page).boundingBox()
  expect((block?.x ?? 0) + (block?.width ?? 0)).toBeLessThanOrEqual(PHONE.width)
  await cancelButton(page).click()
  await expect.poll(() => query(page)).toBeNull()
  await expect(field(page)).toHaveCount(0)
  await expect(magnifier(page)).toBeFocused()
})

for (const scheme of ['light', 'dark'] as const) {
  test(`screenshots for the PR, desktop (${scheme})`, async ({ page }) => {
    mkdirSync(SCREENSHOT_DIR, { recursive: true })
    await page.emulateMedia({ colorScheme: scheme })
    await page.setViewportSize(DESKTOP)
    await login(page)

    // The open box, empty.
    await magnifier(page).click()
    await expect(field(page)).toBeFocused()
    await settle(page)
    await page.screenshot({
      path: `${SCREENSHOT_DIR}/search-open-desktop-${scheme}.png`,
    })

    // A board with results.
    await field(page).fill('S01E0')
    await expect.poll(() => query(page)).toBe('S01E0')
    await field(page).fill('S01E02')
    await expect.poll(() => columns(page)).toContain('做種中，1 個')
    await settle(page)
    await page.screenshot({
      path: `${SCREENSHOT_DIR}/board-results-desktop-${scheme}.png`,
    })

    // No result in a category.
    await tab(page, 'mteam-X').click()
    await expect(searchAll(page)).toBeVisible()
    await settle(page)
    await page.screenshot({
      path: `${SCREENSHOT_DIR}/no-result-category-desktop-${scheme}.png`,
    })

    // No result in 全部.
    await tab(page, '全部').click()
    await field(page).fill('牧神記')
    await expect(noResult(page)).toHaveText('找不到『牧神記』')
    await settle(page)
    await page.screenshot({
      path: `${SCREENSHOT_DIR}/no-result-all-desktop-${scheme}.png`,
    })
  })

  test(`screenshots for the PR, phone 390px (${scheme})`, async ({ page }) => {
    mkdirSync(SCREENSHOT_DIR, { recursive: true })
    await page.emulateMedia({ colorScheme: scheme })
    await page.setViewportSize(PHONE)
    await login(page)

    // The open box, empty.
    await magnifier(page).click()
    await expect(field(page)).toBeFocused()
    await settle(page)
    expect(await horizontalOverflow(page)).toBe(0)
    await page.screenshot({
      path: `${SCREENSHOT_DIR}/search-open-phone-${scheme}.png`,
    })

    // A board with results (the phone's status tabs).
    await field(page).fill('S01E0')
    await expect.poll(() => query(page)).toBe('S01E0')
    await field(page).blur()
    await settle(page)
    expect(await horizontalOverflow(page)).toBe(0)
    await page.screenshot({
      path: `${SCREENSHOT_DIR}/board-results-phone-${scheme}.png`,
    })

    // No result in a category (reached through the URL; the sheet is 3.4's).
    await page.goto('/?category=mteam-X&q=S01E02')
    await expect(searchAll(page)).toBeVisible()
    await settle(page)
    expect(await horizontalOverflow(page)).toBe(0)
    await page.screenshot({
      path: `${SCREENSHOT_DIR}/no-result-category-phone-${scheme}.png`,
    })

    // No result in 全部. Story 3.6: `q` alone would go back to the last
    // category (mteam-X), so the URL names its sort.
    await page.goto('/?q=牧神記&sort=state')
    await expect(noResult(page)).toHaveText('找不到『牧神記』')
    await settle(page)
    expect(await horizontalOverflow(page)).toBe(0)
    await page.screenshot({
      path: `${SCREENSHOT_DIR}/no-result-all-phone-${scheme}.png`,
    })
  })
}
