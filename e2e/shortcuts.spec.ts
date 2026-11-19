import type { Page } from '@playwright/test'
import {
  DEFAULT_MODES,
  expect,
  listScrollTop,
  login,
  openList,
  setModes,
  test,
} from './fixtures'

// Story 3.7: the desktop keyboard shortcuts in Chromium against the built
// app and scripts/fake-qbit.mjs (`sample` data, code-name categories only).
// `2` switches to the second tab and `1` back to 「全部」, `[` on the first
// tab stays and `]` goes to the second, `S` then `3`
// picks 加入時間, `↓` views the next row (the URL `hash` replaced, no new
// history entry) and focus follows it, `↑` at the top neither moves nor
// scrolls (Tab to another row shows the focus outline while the viewed row
// keeps its ring); on the board with the detail open `↑` `↓` stay in the
// card's column; `?` opens the 「快捷鍵」 window and `Esc` closes it, before
// an open search box; the tooltips name their keys; the phone has no 快捷鍵
// button and answers no new key. Checks that something does not happen
// watch for a while, so a wrong navigation would have landed. The fixtures
// fail the test on any CSP violation or console error.

const DESKTOP = { width: 1280, height: 800 }
const PHONE = { width: 390, height: 844 }

test.beforeEach(async ({ request }) => {
  await setModes(request, DEFAULT_MODES)
})

test.afterEach(async ({ request }) => {
  await setModes(request, DEFAULT_MODES)
})

const tabs = (page: Page) =>
  page
    .getByRole('group', { name: '分類' })
    .filter({ visible: true })
    .getByRole('button')
const sortPill = (page: Page) =>
  page
    .getByRole('button', { name: /^排序：.*，(列表|看板)$/ })
    .filter({ visible: true })
const helpButton = (page: Page) =>
  page.getByRole('button', { name: '快捷鍵', exact: true }).filter({
    visible: true,
  })
const helpDialog = (page: Page) => page.getByRole('dialog', { name: '快捷鍵' })
const rowButton = (page: Page, index: number) =>
  page.getByRole('listitem').nth(index).getByRole('button')
const param = (page: Page, name: string) =>
  new URL(page.url()).searchParams.get(name)
const panel = (page: Page) => page.getByRole('complementary', { name: '詳情' })
const positionText = (page: Page) => panel(page).getByText(/個／共/)
const historyLength = (page: Page) => page.evaluate(() => history.length)

/** `read()` keeps giving `value` for `ms`. */
async function stays<T>(
  page: Page,
  read: () => T | Promise<T>,
  value: T,
  ms = 800,
) {
  const end = Date.now() + ms
  while (Date.now() < end) {
    const now: unknown = await read()
    expect(now).toEqual(value)
    await page.waitForTimeout(100)
  }
}

test('desktop: 2, 1, [ ] switch category, S then 3 picks 加入時間, ↓ moves the viewed row and focus', async ({
  page,
}) => {
  await page.setViewportSize(DESKTOP)
  await login(page)

  // `2`: the second tab, like a click.
  const second = tabs(page).nth(1)
  const secondKey = await second.getAttribute('data-category')
  expect(secondKey).not.toBeNull()
  await page.keyboard.press('2')
  await expect(second).toHaveAttribute('aria-pressed', 'true')
  await expect.poll(() => param(page, 'category')).toBe(secondKey)

  // `1`: back to 「全部」 (more than one row to step through).
  await page.keyboard.press('1')
  await expect(tabs(page).first()).toHaveAttribute('aria-pressed', 'true')
  await expect.poll(() => param(page, 'category')).toBeNull()

  // `[` on the first tab stays (no wrap); `]` goes to the second tab.
  await page.keyboard.press('[')
  await stays(page, () => param(page, 'category'), null)
  await page.keyboard.press(']')
  await expect(second).toHaveAttribute('aria-pressed', 'true')
  await expect.poll(() => param(page, 'category')).toBe(secondKey)
  await page.keyboard.press('1')
  await expect.poll(() => param(page, 'category')).toBeNull()

  // `S` opens the menu, `3` picks 加入時間 and closes it.
  await page.keyboard.press('S')
  await expect(page.getByRole('menu', { name: '排序' })).toBeVisible()
  await page.keyboard.press('3')
  await expect(page.getByRole('menu', { name: '排序' })).toHaveCount(0)
  await expect(sortPill(page)).toHaveAttribute(
    'aria-label',
    /^排序：加入時間，新的在前，列表$/,
  )
  await expect.poll(() => param(page, 'sort')).toBe('added_on')

  // `↓`: the next row is viewed, written to the URL (replaced), focused.
  await expect(rowButton(page, 0)).toHaveAttribute('aria-current', 'true')
  const entries = await historyLength(page)
  await page.keyboard.press('ArrowDown')
  await expect(rowButton(page, 1)).toHaveAttribute('aria-current', 'true')
  await expect(rowButton(page, 0)).toHaveAttribute('aria-current', 'false')
  await expect(rowButton(page, 1)).toBeFocused()
  await expect.poll(() => param(page, 'hash')).not.toBeNull()
  const secondHash = param(page, 'hash')
  // `↑`: back to the top row.
  await page.keyboard.press('ArrowUp')
  await expect(rowButton(page, 0)).toHaveAttribute('aria-current', 'true')
  await expect(rowButton(page, 0)).toBeFocused()
  await expect.poll(() => param(page, 'hash')).not.toBe(secondHash)
  const topHash = param(page, 'hash')
  // Another `↑` at the top: no move, no scroll.
  const top = await listScrollTop(page)
  await page.keyboard.press('ArrowUp')
  await stays(page, () => param(page, 'hash'), topHash)
  await expect(rowButton(page, 0)).toHaveAttribute('aria-current', 'true')
  expect(await listScrollTop(page)).toBe(top)
  expect(await historyLength(page)).toBe(entries)
})

test('desktop: with the ⋯ menu open, digits, [ ], / and ? do nothing behind it', async ({
  page,
}) => {
  await page.setViewportSize(DESKTOP)
  await login(page)
  await openList(page)
  await expect(rowButton(page, 0)).toHaveAttribute('aria-current', 'true')
  const hash = param(page, 'hash')
  await panel(page).getByRole('button', { name: '更多動作' }).click()
  const menu = page.getByRole('menu')
  await expect(menu).toBeVisible()
  for (const key of ['2', ']', '/', '?', 'S']) await page.keyboard.press(key)
  await stays(page, () => param(page, 'category'), null)
  expect(param(page, 'hash')).toBe(hash)
  await expect(menu).toBeVisible()
  await expect(helpDialog(page)).toHaveCount(0)
  await expect(
    page.getByRole('searchbox', { name: '找名字' }).filter({ visible: true }),
  ).toHaveCount(0)
  // Esc closes the menu (Radix), not the detail.
  await page.keyboard.press('Escape')
  await expect(menu).toHaveCount(0)
  await expect(panel(page)).toBeVisible()
})

test('desktop: a held ↓ steps row by row and the URL ends on the last row', async ({
  page,
}) => {
  await page.setViewportSize(DESKTOP)
  await login(page)
  await openList(page)
  await expect(rowButton(page, 0)).toHaveAttribute('aria-current', 'true')
  // A second `down` of a pressed key is an auto-repeat (sample: 4 rows).
  for (let count = 0; count < 3; count += 1) {
    await page.keyboard.down('ArrowDown')
  }
  await page.keyboard.up('ArrowDown')
  await expect(rowButton(page, 3)).toBeFocused()
  await expect(rowButton(page, 3)).toHaveAttribute('aria-current', 'true')
  const last = await page.getByRole('listitem').nth(3).getAttribute('data-hash')
  await expect.poll(() => param(page, 'hash')).toBe(last)
})

test('desktop board: with the detail open, ↑ ↓ stay in the card’s column', async ({
  page,
}) => {
  await page.setViewportSize(DESKTOP)
  await login(page)
  await page
    .getByRole('region', { name: '看板' })
    .getByRole('listitem')
    .locator(':scope > button')
    .filter({
      has: page.getByTitle('Fake.Show.S01E04.1080p', { exact: true }),
    })
    .click()
  await expect(positionText(page)).toHaveText('要處理　第 2 個／共 2 個')
  await page.keyboard.press('ArrowUp')
  await expect(positionText(page)).toHaveText('要處理　第 1 個／共 2 個')
  // The column's first card: no jump to another column.
  await page.keyboard.press('ArrowUp')
  await stays(
    page,
    () => positionText(page).innerText(),
    '要處理　第 1 個／共 2 個',
  )
  await page.keyboard.press('ArrowDown')
  await expect(positionText(page)).toHaveText('要處理　第 2 個／共 2 個')
})

test('desktop: Tab onto another row shows the outline; the viewed row keeps its ring', async ({
  page,
}) => {
  await page.setViewportSize(DESKTOP)
  await login(page)
  await openList(page)
  await expect(rowButton(page, 0)).toHaveAttribute('aria-current', 'true')
  await page.keyboard.press('ArrowDown')
  await expect(rowButton(page, 1)).toBeFocused()
  await page.keyboard.press('Tab')
  await expect(rowButton(page, 2)).toBeFocused()
  const style = (index: number) =>
    rowButton(page, index).evaluate((element) => {
      const computed = getComputedStyle(element)
      return {
        outline: computed.outlineStyle,
        ring: computed.boxShadow.includes('inset'),
      }
    })
  expect(await style(2)).toEqual({ outline: 'solid', ring: false })
  expect(await style(1)).toEqual({ outline: 'none', ring: true })
})

test('desktop: ? opens the 快捷鍵 window with every group; Esc closes it; tooltips name keys', async ({
  page,
}) => {
  await page.setViewportSize(DESKTOP)
  await login(page)

  await expect(helpButton(page)).toBeEnabled()
  await expect(helpButton(page)).toHaveAttribute('title', '快捷鍵（?）')
  await expect(
    page.getByRole('button', { name: '搜尋', exact: true }).filter({
      visible: true,
    }),
  ).toHaveAttribute('title', '搜尋（/）')
  await expect(tabs(page).first()).toHaveAttribute('title', '快捷鍵 1')

  await page.keyboard.press('Shift+Slash')
  const dialog = helpDialog(page)
  await expect(dialog).toBeVisible()
  await expect(dialog.getByRole('heading', { level: 3 })).toHaveText([
    '換種子',
    '換分類',
    '排序',
    '搜尋和關閉',
    '說明',
  ])
  await expect(dialog.locator('kbd')).toContainText(['↑', '↓', '1', '9'])
  // While it is open, digits switch nothing.
  const category = param(page, 'category')
  await page.keyboard.press('2')
  await stays(page, () => param(page, 'category'), category)

  await page.keyboard.press('Escape')
  await expect(dialog).toHaveCount(0)

  // A click opens it too; ✕ closes it and focus goes back to the button.
  await helpButton(page).click()
  await expect(dialog).toBeVisible()
  await dialog.getByRole('button', { name: '關閉' }).click()
  await expect(dialog).toHaveCount(0)
  await expect(helpButton(page)).toBeFocused()
})

test('desktop: Esc closes the help before an open search box', async ({
  page,
}) => {
  await page.setViewportSize(DESKTOP)
  await login(page)
  const field = page
    .getByRole('searchbox', { name: '找名字' })
    .filter({ visible: true })
  await page.keyboard.press('/')
  await expect(field).toBeFocused()
  await helpButton(page).click()
  await expect(helpDialog(page)).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(helpDialog(page)).toHaveCount(0)
  await expect(field).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(field).toHaveCount(0)
})

test('phone: no 快捷鍵 button, and the new keys do nothing', async ({
  page,
}) => {
  await page.setViewportSize(PHONE)
  await login(page)
  await expect(helpButton(page)).toHaveCount(0)
  const before = page.url()
  await page.keyboard.press('2')
  await page.keyboard.press('Shift+Slash')
  await page.keyboard.press('s')
  await stays(page, () => page.url(), before)
  await expect(helpDialog(page)).toHaveCount(0)
  await expect(page.getByRole('menu', { name: '排序' })).toHaveCount(0)
})
