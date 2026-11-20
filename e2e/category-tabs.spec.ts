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

// Story 3.2: the desktop category tabs in Chromium against the built app
// and scripts/fake-qbit.mjs (fake data, code-name categories only). A tab
// click filters to the category, switches to its remembered sort (else
// 「狀態」) with the 「（這個分類記住的）」 hint, and a manual pick saves the
// sort for that category; a reload keeps the category; a bad category
// falls back to 「全部」. The PR screenshots (light and dark) go to
// e2e-output/screenshots/3-2/: the tabs overflowing, the selected tab at the
// far right, the hint, the emptied category. The fixtures fail the test on
// any CSP violation or console error.

const DESKTOP = { width: 1280, height: 800 }
const SCREENSHOT_DIR = 'e2e-output/screenshots/3-2'

test.beforeEach(async ({ request }) => {
  await setModes(request, DEFAULT_MODES)
})

test.afterEach(async ({ request }) => {
  await setModes(request, DEFAULT_MODES)
})

const tablist = (page: Page) =>
  page.getByRole('group', { name: '分類' }).filter({ visible: true })

/** The tab whose name (first span) is exactly `label`. */
const tab = (page: Page, label: string) =>
  tablist(page)
    .getByRole('button')
    .filter({
      has: page.locator(':scope > span:first-child', {
        hasText: new RegExp(
          `^${label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`,
        ),
      }),
    })

const sortPill = (page: Page) =>
  page
    .getByRole('button', { name: /^排序：.*，(列表|看板)$/ })
    .filter({ visible: true })

const HINT = '（這個分類記住的）'

/** Waits for the entrance (story 2.9) to end, so a screenshot is final. */
async function settle(page: Page) {
  await page.evaluate(async () => {
    await new Promise((resolve) => requestAnimationFrame(resolve))
    await Promise.all(
      document
        .getAnimations()
        .map((animation) => animation.finished.catch(() => null)),
    )
  })
}

/** Picks `label` in the desktop sort menu. */
async function pickSort(page: Page, label: string) {
  await sortPill(page).click()
  await page
    .getByRole('menu', { name: '排序' })
    .getByRole('menuitemradio', { name: label })
    .click()
}

test('a tab filters, switches to its remembered sort, and a reload keeps it', async ({
  page,
}) => {
  await page.setViewportSize(DESKTOP)
  await login(page)
  await expect(tab(page, '全部')).toHaveAttribute('aria-pressed', 'true')
  await expect(tab(page, '全部')).toHaveText('全部4')

  // mteam-X has nothing remembered: 狀態, as before, so no hint.
  await tab(page, 'mteam-X').click()
  await expect(page).toHaveURL(/[?&]category=mteam-X/)
  await expect(tab(page, 'mteam-X')).toHaveAttribute('aria-pressed', 'true')
  await expect(sortPill(page)).toHaveAccessibleName('排序：狀態，看板')
  await expect(sortPill(page)).not.toContainText(HINT)

  // A manual pick inside mteam-X saves mteam-X's sort.
  await expectSaveOf(page, 'mteam-X', () => pickSort(page, '做種時間'))
  await expect(sortPill(page)).toHaveAccessibleName(
    '排序：做種時間，久的在前，列表',
  )
  // Only mteam-X's two visible torrents show.
  await expect(page.getByRole('listitem')).toHaveCount(2)

  // Back to 全部 (nothing remembered): 狀態, and no hint (nothing was
  // remembered, so the app did not apply a remembered sort).
  await tab(page, '全部').click()
  await expect(page).not.toHaveURL(/category=/)
  await expect(sortPill(page)).toHaveAccessibleName('排序：狀態，看板')
  await expect(sortPill(page)).not.toContainText(HINT)

  // mteam-X again: its remembered 做種時間, with the hint.
  await tab(page, 'mteam-X').click()
  await expect
    .poll(() => {
      const params = new URL(page.url()).searchParams
      return [params.get('category'), params.get('sort'), params.get('dir')]
    })
    .toEqual(['mteam-X', 'seeding_time', 'desc'])
  await expect(sortPill(page)).toHaveAccessibleName(
    `排序：做種時間，久的在前${HINT}，列表`,
  )
  await expect(sortPill(page)).toContainText(HINT)

  // A manual pick hides the hint.
  await expectSaveOf(page, 'mteam-X', () => pickSort(page, '分享率'))
  await expect(sortPill(page)).not.toContainText(HINT)

  // A reload with only the category: back on mteam-X with its sort.
  await page.goto('/?category=mteam-X')
  await expect(tab(page, 'mteam-X')).toHaveAttribute('aria-pressed', 'true')
  await expect(sortPill(page)).toHaveAccessibleName(
    '排序：分享率，高的在前，列表',
  )
  await expect(sortPill(page)).not.toContainText(HINT)
  await expect(page.getByRole('listitem')).toHaveCount(2)
})

test('the switch goes back to the top', async ({ page, request }) => {
  await setModes(request, { data: 'many' })
  await page.setViewportSize(DESKTOP)
  await login(page)
  // Remember a list sort for mteam-tv so the switch stays in the list.
  await page.goto('/?category=mteam-tv&sort=added_on')
  await expectSaveOf(page, 'mteam-tv', () => pickSort(page, '做種時間'))
  await tab(page, '全部').click()
  await expectSaveOf(page, '__all__', () => pickSort(page, '加入時間'))
  await expect(page.getByRole('listitem').first()).toBeVisible()
  await page.locator(`#${LIST_SCROLL_ID}`).evaluate((scroller) => {
    scroller.scrollTop = 2000
  })
  await expect
    .poll(() =>
      page
        .locator(`#${LIST_SCROLL_ID}`)
        .evaluate((scroller) => scroller.scrollTop),
    )
    .toBeGreaterThan(0)
  await tab(page, 'mteam-tv').click()
  await expect(sortPill(page)).toContainText(HINT)
  await expect
    .poll(() =>
      page
        .locator(`#${LIST_SCROLL_ID}`)
        .evaluate((scroller) => scroller.scrollTop),
    )
    .toBe(0)
})

test('a category no torrent has falls back to 全部 with the URL fixed', async ({
  page,
}) => {
  await page.setViewportSize(DESKTOP)
  await login(page)
  await page.goto('/?category=nope&sort=added_on')
  await expect(page).not.toHaveURL(/category=/)
  await expect(page).toHaveURL(/[?&]sort=added_on/)
  await expect(tab(page, '全部')).toHaveAttribute('aria-pressed', 'true')
  await expect(page.getByRole('listitem')).toHaveCount(4)
})

test('a category the router reads as a number (2024) round-trips', async ({
  page,
  request,
}) => {
  await setModes(request, { data: 'categories' })
  await page.setViewportSize(DESKTOP)
  await login(page)
  await tab(page, '2024').click()
  await expect(tab(page, '2024')).toHaveAttribute('aria-pressed', 'true')
  await expect
    .poll(() => new URL(page.url()).searchParams.get('category'))
    .toBe('"2024"')
  // Reload what the app wrote, then the name typed by hand.
  await page.reload()
  await expect(tab(page, '2024')).toHaveAttribute('aria-pressed', 'true')
  await page.goto('/?category=2024')
  await expect(tab(page, '2024')).toHaveAttribute('aria-pressed', 'true')
  // The router rewrites the typed number in its own quoted form.
  await expect
    .poll(() => new URL(page.url()).searchParams.get('category'))
    .toBe('"2024"')
})

for (const scheme of ['light', 'dark'] as const) {
  test(`screenshots for the PR (${scheme})`, async ({ page, request }) => {
    mkdirSync(SCREENSHOT_DIR, { recursive: true })
    await setModes(request, { data: 'categories' })
    await page.emulateMedia({ colorScheme: scheme })
    await page.setViewportSize(DESKTOP)
    await login(page)
    const fade = page
      .getByTestId('category-tabs-fade')
      .filter({ visible: true })

    // The row overflows: it scrolls sideways, never wraps, the fade shows.
    await expect(fade).toBeVisible()
    const row = await tablist(page).evaluate((element) => ({
      scrollWidth: element.scrollWidth,
      clientWidth: element.clientWidth,
      height: element.getBoundingClientRect().height,
    }))
    expect(row.scrollWidth).toBeGreaterThan(row.clientWidth)
    expect(row.height).toBeLessThan(50)
    const pillBefore = await sortPill(page).boundingBox()
    await settle(page)
    await page.screenshot({
      path: `${SCREENSHOT_DIR}/tabs-overflow-desktop-${scheme}.png`,
    })

    // Markup in a category name is plain text.
    await expect(tab(page, '<script>alert(1)</script>')).toBeAttached()
    expect(await page.locator('[role="group"] script').count()).toBe(0)

    // The last tab, selected, scrolls into view at the far right; the sort
    // pill keeps its place and width.
    const last = tablist(page).getByRole('button').last()
    await last.click()
    await expect(last).toHaveAttribute('aria-pressed', 'true')
    await expect(fade).toHaveCount(0)
    const pillAfter = await sortPill(page).boundingBox()
    if (pillBefore === null || pillAfter === null) {
      throw new Error('the sort pill has no box')
    }
    expect(pillAfter.x).toBe(pillBefore.x)
    expect(pillAfter.width).toBe(pillBefore.width)
    const inView = await last.evaluate((element) => {
      const box = element.getBoundingClientRect()
      const scroller = element.parentElement?.getBoundingClientRect()
      return (
        scroller !== undefined &&
        box.left >= scroller.left &&
        box.right <= scroller.right
      )
    })
    expect(inView).toBe(true)
    await settle(page)
    await page.screenshot({
      path: `${SCREENSHOT_DIR}/tabs-selected-far-right-desktop-${scheme}.png`,
    })

    // The hint: cat-03 remembers 做種時間; coming from 全部 (狀態) shows it.
    await tab(page, 'cat-03').click()
    await expectSaveOf(page, 'cat-03', () => pickSort(page, '做種時間'))
    await tab(page, '全部').click()
    await tab(page, 'cat-03').click()
    await expect(sortPill(page)).toContainText(HINT)
    await expect(page.getByRole('listitem').first()).toBeVisible()
    // With the hint the pill is wider: it stays whole at the right of the
    // row, and the tab row still does not wrap.
    const withHint = await sortPill(page).boundingBox()
    const filterRow = await tablist(page).locator('xpath=../..').boundingBox()
    if (withHint === null || filterRow === null) {
      throw new Error('the sort pill or the filter row has no box')
    }
    expect(withHint.x + withHint.width).toBeLessThanOrEqual(
      filterRow.x + filterRow.width + 0.5,
    )
    expect(withHint.x).toBeGreaterThan(filterRow.x)
    expect(withHint.height).toBeLessThan(50)
    const rowHeight = await tablist(page).evaluate(
      (element) => element.getBoundingClientRect().height,
    )
    expect(rowHeight).toBeLessThan(50)
    await settle(page)
    await page.screenshot({
      path: `${SCREENSHOT_DIR}/remembered-hint-desktop-${scheme}.png`,
    })

    // The selected category empties on screen: its tab stays with 0 and
    // 「這個分類沒有種子」 with 「新增種子」 (it opens the add screen, story 4.6).
    await tab(page, 'mteam-X').click()
    await expect(tab(page, 'mteam-X')).toHaveAttribute('aria-pressed', 'true')
    await setModes(request, { data: 'categories-emptied' })
    const main = page.locator(`#${MAIN_ID}`)
    await expect(main.getByText('這個分類沒有種子')).toBeVisible({
      timeout: 15_000,
    })
    await expect(main.getByRole('button', { name: '新增種子' })).toBeEnabled()
    await expect(tab(page, 'mteam-X')).toHaveText('mteam-X0')
    await settle(page)
    await page.screenshot({
      path: `${SCREENSHOT_DIR}/emptied-category-desktop-${scheme}.png`,
    })
    // Leaving it removes its tab.
    await tab(page, '全部').click()
    await expect(tab(page, 'mteam-X')).toHaveCount(0)
  })
}
