import type { Page } from '@playwright/test'
import {
  DEFAULT_MODES,
  LIST_SCROLL_ID,
  expect,
  expectSaveOf,
  login,
  setModes,
  test,
} from './fixtures'

// Story 3.6: opening the app where it was left, in Chromium against the
// built app and scripts/fake-qbit.mjs (`data=categories`, code-name
// categories only). The last category and the torrent viewed there are
// stored per device (this browser context's localStorage); `/` goes back to
// that category with its remembered sort and, in list mode, shows that
// torrent in the panel without scrolling to it. A URL with `sort` is
// followed as is; the board never opens a detail by itself. The fixtures
// fail the test on any CSP violation or console error.

const DESKTOP = { width: 1280, height: 800 }

test.beforeEach(async ({ request }) => {
  await setModes(request, { ...DEFAULT_MODES, data: 'categories' })
})

test.afterEach(async ({ request }) => {
  await setModes(request, DEFAULT_MODES)
})

/** Category X's torrents (fake-qbit `categories`): E03 is the newest. */
const X_OLDEST = 'Fake.Cat03.S01E01.1080p'
const X_NEWEST = 'Fake.Cat03.S01E03.1080p'
/** One of mteam-tv's torrents. */
const TV_FIRST = 'Fake.Cat02.S01E01.1080p'

const tab = (page: Page, label: string) =>
  page
    .getByRole('group', { name: '分類' })
    .filter({ visible: true })
    .getByRole('button')
    .filter({
      has: page.locator(':scope > span:first-child', {
        hasText: new RegExp(`^${label}$`),
      }),
    })

const sortPill = (page: Page) =>
  page
    .getByRole('button', { name: /^排序：.*，(列表|看板)$/ })
    .filter({ visible: true })

const panel = (page: Page) => page.getByRole('complementary', { name: '詳情' })
const row = (page: Page, name: string) =>
  page
    .getByRole('listitem')
    .locator(':scope > button')
    .filter({ has: page.getByTitle(name, { exact: true }) })
const card = (page: Page, name: string) =>
  page
    .getByRole('region', { name: '看板' })
    .getByRole('listitem')
    .locator(':scope > button')
    .filter({ has: page.getByTitle(name, { exact: true }) })

const params = (page: Page) => {
  const search = new URL(page.url()).searchParams
  return {
    category: search.get('category'),
    sort: search.get('sort'),
    dir: search.get('dir'),
    hash: search.get('hash'),
  }
}

async function pickSort(page: Page, label: string) {
  await sortPill(page).click()
  await page
    .getByRole('menu', { name: '排序' })
    .getByRole('menuitemradio', { name: label })
    .click()
}

test('reopening / returns to the category, its sort and the torrent viewed there', async ({
  page,
}) => {
  await page.setViewportSize(DESKTOP)
  await login(page)

  await tab(page, 'X').click()
  await expect(tab(page, 'X')).toHaveAttribute('aria-pressed', 'true')
  await expectSaveOf(page, 'X', () => pickSort(page, '加入時間'))
  // Without a viewed torrent the panel shows the first row (the newest).
  await expect(panel(page)).toContainText(X_NEWEST)
  await row(page, X_OLDEST).click()
  await expect(panel(page)).toContainText(X_OLDEST)
  await expect.poll(() => params(page).hash).not.toBeNull()

  // Reopen on a bare URL: the same category and sort, written with
  // `replace`, and the same torrent in the panel (the URL gets no `hash`).
  const historyBefore = await page.evaluate(() => history.length)
  await page.goto('/')
  await expect
    .poll(() => params(page))
    .toEqual({ category: 'X', sort: 'added_on', dir: 'desc', hash: null })
  await expect(tab(page, 'X')).toHaveAttribute('aria-pressed', 'true')
  await expect(sortPill(page)).toHaveAccessibleName(
    '排序：加入時間，新的在前，列表',
  )
  await expect(panel(page)).toContainText(X_OLDEST)
  await expect(panel(page)).not.toContainText(X_NEWEST)
  // `goto` adds one entry; the restore replaced it.
  expect(await page.evaluate(() => history.length)).toBe(historyBefore + 1)
  // The list stays at the top (the preferred row is not scrolled to).
  expect(
    await page.evaluate(
      (id) => document.getElementById(id)?.scrollTop ?? -1,
      LIST_SCROLL_ID,
    ),
  ).toBe(0)
  // Not a tab switch: no hint.
  await expect(sortPill(page)).not.toContainText('記住的')
})

test('q alone still returns to the last category, with the keyword applied', async ({
  page,
}) => {
  await page.setViewportSize(DESKTOP)
  await login(page)
  await tab(page, 'mteam-X').click()
  await expect(tab(page, 'mteam-X')).toHaveAttribute('aria-pressed', 'true')
  await expectSaveOf(page, 'mteam-X', () => pickSort(page, '加入時間'))

  // Claude 代決: `q` alone names no place. `S01E01` matches one torrent of
  // every category; in mteam-X only one.
  await page.goto('/?q=S01E01')
  await expect
    .poll(() => {
      const search = new URL(page.url()).searchParams
      return [search.get('category'), search.get('sort'), search.get('q')]
    })
    .toEqual(['mteam-X', 'added_on', 'S01E01'])
  await expect(tab(page, 'mteam-X')).toHaveAttribute('aria-pressed', 'true')
  await expect(page.getByRole('listitem')).toHaveCount(1)
  await expect(row(page, 'Fake.Cat01.S01E01.1080p')).toBeVisible()
})

test('a URL with sort is followed as is', async ({ page }) => {
  await page.setViewportSize(DESKTOP)
  await login(page)
  await tab(page, 'X').click()
  await expect(page).toHaveURL(/[?&]category=X/)

  await page.goto('/?sort=ratio')
  await expect(sortPill(page)).toHaveAccessibleName(/^排序：分享率/)
  await expect(tab(page, '全部')).toHaveAttribute('aria-pressed', 'true')
  expect(params(page)).toEqual({
    category: null,
    sort: 'ratio',
    dir: null,
    hash: null,
  })
})

test('board mode: the category comes back, no detail opens by itself', async ({
  page,
}) => {
  await page.setViewportSize(DESKTOP)
  await login(page)
  // mteam-tv remembers nothing: 「狀態」, the board.
  await tab(page, 'mteam-tv').click()
  await expect(page.getByRole('region', { name: '看板' })).toBeVisible()
  await card(page, TV_FIRST).click()
  await expect(panel(page)).toBeVisible()
  await expect.poll(() => params(page).hash).not.toBeNull()

  await page.goto('/')
  await expect
    .poll(() => params(page))
    // 「狀態」 has no direction: the URL drops `dir` (fixListSearch).
    .toEqual({ category: 'mteam-tv', sort: 'state', dir: null, hash: null })
  await expect(page.getByRole('region', { name: '看板' })).toBeVisible()
  await expect(card(page, TV_FIRST)).toBeVisible()
  await expect(panel(page)).toHaveCount(0)
})
