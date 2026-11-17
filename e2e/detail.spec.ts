import type { Locator, Page } from '@playwright/test'
import {
  DEFAULT_MODES,
  LIST_SCROLL_ID,
  MAIN_ID,
  expect,
  listScrollTop,
  login,
  openList,
  scrollList,
  setModes,
  test,
} from './fixtures'

// Story 2.4 rows D1 to D16: the detail in Chromium against the built server
// and scripts/fake-qbit.mjs (fake data only, AD-15), with the same CSP and
// console watch as every test. Sample data: the list (加入時間) shows four,
// E04 first; the board has 要處理 E03, E04, 下載中 E01, 做種中 E02, 完成
// empty, 已整理 E05, E06. Screenshots for the PR: the desktop list-mode
// panel, the desktop board panel and the phone sheet at 70%, full screen
// and with the name expanded, light and dark.

const SCREENSHOT_DIR = 'e2e-output/screenshots/2-4'
const DESKTOP = { width: 1440, height: 900 }
const PHONE = { width: 390, height: 844 }
const SCHEMES = ['light', 'dark'] as const
const name = (n: number) => `Fake.Show.S01E0${n}.1080p`
const hashOf = (n: number) => n.toString(16).padStart(40, '0')

test.beforeEach(async ({ request }) => {
  await setModes(request, DEFAULT_MODES)
})

test.afterEach(async ({ request }) => {
  await setModes(request, DEFAULT_MODES)
})

const panel = (page: Page) => page.getByRole('complementary', { name: '詳情' })
const rowButtons = (page: Page) =>
  page.getByRole('listitem').locator(':scope > button')
const rowButton = (page: Page, n: number) =>
  rowButtons(page).filter({ has: page.getByTitle(name(n), { exact: true }) })
const board = (page: Page) => page.getByRole('region', { name: '看板' })
const card = (page: Page, n: number) =>
  board(page)
    .getByRole('listitem')
    .locator(':scope > button')
    .filter({ has: page.getByTitle(name(n), { exact: true }) })
const detailSheet = (page: Page) => page.getByRole('dialog')
const positionText = (scope: Locator) => scope.getByText(/個／共/)

/**
 * Clicks, with the mouse at its centre, the first row or card button that
 * lies fully inside the scroller's visible box (the overscan ones are
 * rendered outside it).
 */
async function clickInside(page: Page, scroller: string) {
  const point = await page.evaluate((selector) => {
    const box = document.querySelector(selector)?.getBoundingClientRect()
    if (!box) return null
    const buttons = document.querySelectorAll<HTMLElement>(
      `${selector} [role="listitem"] > button`,
    )
    for (const button of buttons) {
      const rect = button.getBoundingClientRect()
      if (rect.top >= box.top + 40 && rect.bottom <= box.bottom - 40) {
        return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 }
      }
    }
    return null
  }, scroller)
  expect(point, scroller).not.toBeNull()
  await page.mouse.click(point?.x ?? 0, point?.y ?? 0)
}

/** Waits until no animation runs (slides, fades). */
async function settled(page: Page) {
  await page.waitForFunction(() =>
    document
      .getAnimations()
      .every((animation) => animation.playState !== 'running'),
  )
}

async function hasNoHorizontalScroll(page: Page, selector = ':root') {
  const { scrollWidth, clientWidth } = await page
    .locator(selector)
    .evaluate((element) => ({
      scrollWidth: element.scrollWidth,
      clientWidth: element.clientWidth,
    }))
  expect(scrollWidth, selector).toBeLessThanOrEqual(clientWidth)
}

async function sheetTop(page: Page) {
  return detailSheet(page).evaluate(
    (element) => element.getBoundingClientRect().top,
  )
}

/** Drags the sheet's handle by `dy` px with the mouse (pointer events). */
async function dragHandle(page: Page, dy: number) {
  const top = await sheetTop(page)
  const x = PHONE.width / 2
  await page.mouse.move(x, top + 10)
  await page.mouse.down()
  await page.mouse.move(x, top + 10 + dy, { steps: 12 })
  await page.mouse.up()
}

test('D1 D2 D7 D12 desktop list mode: the panel, the ring, N of M, prev and next, reload', async ({
  page,
}) => {
  await page.setViewportSize(DESKTOP)
  await login(page)
  await openList(page)

  // D1: no hash, the first row is viewed.
  await expect(panel(page)).toBeVisible()
  await expect(panel(page).getByRole('heading', { level: 2 })).toHaveText(
    name(4),
  )
  await expect(rowButton(page, 4)).toHaveAttribute('aria-current', 'true')
  await expect(page).not.toHaveURL(/[?&]hash=/)
  await expect(positionText(panel(page))).toHaveText('第 1 個／共 4 個')
  await expect(
    panel(page).getByRole('button', { name: '上一個' }),
  ).toBeDisabled()
  await expect(
    panel(page).getByRole('button', { name: '更多動作' }),
  ).toBeDisabled()
  await expect(panel(page).getByRole('tab', { name: '概覽' })).toHaveAttribute(
    'aria-selected',
    'true',
  )
  await expect(panel(page).getByRole('tab', { name: '檔案' })).toBeDisabled()
  await expect(panel(page).locator('dt')).toHaveText([
    '分類',
    '大小',
    '加入時間',
    '完成時間',
    '已下載',
    '已上傳',
  ])
  // 已下載 and 已上傳 arrive from getTorrentDetail (AD-6 detail exception).
  await expect(panel(page).locator('dd').nth(4)).toHaveText(
    /^[\d.,]+ (B|KB|MB|GB|TB)$/,
  )
  await expect(panel(page).locator('dd').nth(5)).toHaveText(
    /^[\d.,]+ (B|KB|MB|GB|TB)$/,
  )

  // Layout: 560px list, 16px gap, the panel takes the rest; neither the
  // page nor `main` scrolls, the list scrolls itself.
  const list = page.getByRole('region', { name: /^種子列表/ })
  const listBox = await list.boundingBox()
  const panelBox = await panel(page).boundingBox()
  expect(listBox?.width).toBe(560)
  expect(Math.round((panelBox?.x ?? 0) - (listBox?.x ?? 0) - 560)).toBe(16)
  expect(Math.round(panelBox?.height ?? 0)).toBe(
    Math.round(listBox?.height ?? 0),
  )
  const main = await page.locator(`#${MAIN_ID}`).evaluate((element) => ({
    scroll: element.scrollHeight,
    client: element.clientHeight,
  }))
  expect(main.scroll).toBeLessThanOrEqual(main.client)
  await expect(page.locator(`#${LIST_SCROLL_ID}`)).toHaveCSS(
    'overflow-y',
    'auto',
  )

  // D2: a click switches the panel; the URL's hash is replaced (no new
  // history entry), the ring moves.
  const entries = await page.evaluate(() => history.length)
  await rowButton(page, 2).click()
  await expect(page).toHaveURL(new RegExp(`[?&]hash=${hashOf(2)}`))
  await expect(panel(page).getByRole('heading', { level: 2 })).toHaveText(
    name(2),
  )
  await expect(rowButton(page, 2)).toHaveAttribute('aria-current', 'true')
  await expect(rowButton(page, 4)).toHaveAttribute('aria-current', 'false')
  expect(await page.evaluate(() => history.length)).toBe(entries)
  // The viewing ring is an inset box shadow, unlike the focus outline.
  expect(
    await rowButton(page, 2).evaluate(
      (element) => getComputedStyle(element).boxShadow,
    ),
  ).toMatch(/inset/)

  // D7: N of M follows the shown order; › and ‹.
  await expect(positionText(panel(page))).toHaveText('第 3 個／共 4 個')
  await panel(page).getByRole('button', { name: '下一個' }).click()
  await expect(positionText(panel(page))).toHaveText('第 4 個／共 4 個')
  await expect(
    panel(page).getByRole('button', { name: '下一個' }),
  ).toBeDisabled()
  await expect(page).toHaveURL(new RegExp(`[?&]hash=${hashOf(1)}`))
  await panel(page).getByRole('button', { name: '上一個' }).click()
  await expect(page).toHaveURL(new RegExp(`[?&]hash=${hashOf(2)}`))

  // Keyboard focus is the outline; the ring stays on the viewed row.
  await rowButton(page, 3).focus()
  await page.keyboard.press('Shift+Tab')
  await page.keyboard.press('Tab')
  await expect(rowButton(page, 3)).toBeFocused()
  expect(
    await rowButton(page, 3).evaluate(
      (element) => getComputedStyle(element).outlineStyle,
    ),
  ).toBe('solid')

  // D12: a reload with sort and hash comes back to the same torrent.
  await page.reload()
  await expect(panel(page).getByRole('heading', { level: 2 })).toHaveText(
    name(2),
  )
  await expect(page).toHaveURL(/[?&]sort=added_on/)
  await expect(rowButton(page, 2)).toHaveAttribute('aria-current', 'true')

  // A sort change from the menu (setView) keeps hash and the torrent.
  await page
    .getByRole('button', { name: /^排序：.*，列表$/ })
    .filter({ visible: true })
    .click()
  await page
    .getByRole('menu', { name: '排序' })
    .getByRole('menuitemradio', { name: '做種時間' })
    .click()
  await expect(page).toHaveURL(/[?&]sort=seeding_time/)
  await expect(page).toHaveURL(new RegExp(`[?&]hash=${hashOf(2)}`))
  await expect(panel(page).getByRole('heading', { level: 2 })).toHaveText(
    name(2),
  )
  await expect(rowButton(page, 2)).toHaveAttribute('aria-current', 'true')
})

test('D3 an invalid hash is dropped; an unknown one shows the first row', async ({
  page,
}) => {
  await page.setViewportSize(DESKTOP)
  await login(page)
  await page.goto('/?sort=added_on&hash=NOT-A-HASH')
  await expect(page).not.toHaveURL(/hash=/)
  await expect(panel(page).getByRole('heading', { level: 2 })).toHaveText(
    name(4),
  )
  // An archived torrent is not in the list: the first row.
  await page.goto(`/?sort=added_on&hash=${hashOf(5)}`)
  await expect(panel(page).getByRole('heading', { level: 2 })).toHaveText(
    name(4),
  )
})

test('D4 D5 D8 D12 desktop board: open, switch, close by Esc, ✕ and empty space', async ({
  page,
}) => {
  await page.setViewportSize(DESKTOP)
  await login(page)
  await expect(board(page)).toBeVisible()
  await expect(panel(page)).toHaveCount(0)

  await card(page, 2).click()
  await expect(panel(page)).toBeVisible()
  await expect(page).toHaveURL(new RegExp(`[?&]hash=${hashOf(2)}`))
  await expect(positionText(panel(page))).toHaveText('做種中　第 1 個／共 1 個')
  await settled(page)

  // Over the 完成 and 已整理 columns: right, top and bottom aligned.
  const boardBox = await board(page).boundingBox()
  const panelBox = await panel(page).boundingBox()
  const done = await board(page)
    .getByRole('region', { name: /^完成/ })
    .boundingBox()
  expect(Math.round((panelBox?.x ?? 0) + (panelBox?.width ?? 0))).toBe(
    Math.round((boardBox?.x ?? 0) + (boardBox?.width ?? 0)),
  )
  expect(Math.round(panelBox?.x ?? 0)).toBe(Math.round(done?.x ?? 0))
  expect(Math.round(panelBox?.y ?? 0)).toBe(Math.round(boardBox?.y ?? 0))
  expect(Math.round(panelBox?.height ?? 0)).toBe(
    Math.round(boardBox?.height ?? 0),
  )

  // D5: another card switches it; D8: the range is that card's column.
  await card(page, 4).click()
  await expect(panel(page).getByRole('heading', { level: 2 })).toHaveText(
    name(4),
  )
  await expect(positionText(panel(page))).toHaveText('要處理　第 2 個／共 2 個')
  await expect(
    panel(page).getByRole('button', { name: '下一個' }),
  ).toBeDisabled()
  await panel(page).getByRole('button', { name: '上一個' }).click()
  await expect(positionText(panel(page))).toHaveText('要處理　第 1 個／共 2 個')
  await expect(
    panel(page).getByRole('button', { name: '上一個' }),
  ).toBeDisabled()

  // D12: a reload opens it again.
  await page.reload()
  await expect(panel(page).getByRole('heading', { level: 2 })).toHaveText(
    name(3),
  )

  // D4: Esc closes and removes hash.
  await page.keyboard.press('Escape')
  await expect(panel(page)).toHaveCount(0)
  await expect(page).not.toHaveURL(/hash=/)

  // ✕ closes.
  await card(page, 1).click()
  await expect(panel(page)).toBeVisible()
  await panel(page).getByRole('button', { name: '關閉' }).click()
  await expect(panel(page)).toHaveCount(0)
  await expect(page).not.toHaveURL(/hash=/)

  // Esc with the real sort menu open over the panel closes the menu only;
  // a second Esc closes the panel.
  await card(page, 1).click()
  await expect(panel(page)).toBeVisible()
  await page
    .getByRole('button', { name: /^排序：.*，看板$/ })
    .filter({ visible: true })
    .click()
  const menu = page.getByRole('menu', { name: '排序' })
  await expect(menu).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(menu).toBeHidden()
  await expect(panel(page)).toBeVisible()
  await expect(page).toHaveURL(new RegExp(`[?&]hash=${hashOf(1)}`))
  await page.keyboard.press('Escape')
  await expect(panel(page)).toHaveCount(0)
  await expect(page).not.toHaveURL(/hash=/)

  // A click inside the panel (on text, not a control) keeps it; a click on
  // a column header (empty board space) closes it.
  await card(page, 1).click()
  await expect(panel(page)).toBeVisible()
  await panel(page).locator('dd').first().click()
  await expect(panel(page)).toBeVisible()
  await expect(page).toHaveURL(new RegExp(`[?&]hash=${hashOf(1)}`))
  await board(page)
    .getByRole('region', { name: /^下載中/ })
    .getByRole('heading')
    .click()
  await expect(panel(page)).toHaveCount(0)

  // Keyboard: Enter on a card opens it; ✕ gives focus back to that card,
  // also after switching to another card first.
  await card(page, 3).focus()
  await page.keyboard.press('Enter')
  await expect(panel(page).getByRole('heading', { level: 2 })).toHaveText(
    name(3),
  )
  await card(page, 1).focus()
  await page.keyboard.press('Enter')
  await expect(panel(page).getByRole('heading', { level: 2 })).toHaveText(
    name(1),
  )
  await panel(page).getByRole('button', { name: '關閉' }).focus()
  await page.keyboard.press('Enter')
  await expect(panel(page)).toHaveCount(0)
  await expect(card(page, 1)).toBeFocused()

  // 已整理 expanded (five equal columns): the panel still covers exactly
  // 完成 and 已整理.
  await board(page)
    .getByRole('button', { name: /^展開已整理欄/ })
    .click()
  await card(page, 2).click()
  await expect(panel(page)).toBeVisible()
  await settled(page)
  const wideBoard = await board(page).boundingBox()
  const widePanel = await panel(page).boundingBox()
  const wideDone = await board(page)
    .getByRole('region', { name: /^完成/ })
    .boundingBox()
  expect(
    Math.abs((widePanel?.x ?? 0) - (wideDone?.x ?? 0)),
  ).toBeLessThanOrEqual(1)
  expect(
    Math.abs(
      (widePanel?.x ?? 0) +
        (widePanel?.width ?? 0) -
        ((wideBoard?.x ?? 0) + (wideBoard?.width ?? 0)),
    ),
  ).toBeLessThanOrEqual(1)
})

test('opening and switching the detail never scrolls the list or a board column', async ({
  page,
  request,
}) => {
  await setModes(request, { data: 'many' })
  await page.setViewportSize(DESKTOP)
  await login(page)

  // List mode: scrolled partway, a click and ‹ › leave the scroll alone.
  await openList(page)
  await scrollList(page, 'middle')
  const listTop = await listScrollTop(page)
  expect(listTop).toBeGreaterThan(0)
  // A real mouse click on a row inside the scroller's view (Playwright's
  // own click would scroll an overscan row into view first).
  await clickInside(page, `#${LIST_SCROLL_ID}`)
  await expect(page).toHaveURL(/[?&]hash=/)
  await panel(page).getByRole('button', { name: '下一個' }).click()
  await panel(page).getByRole('button', { name: '上一個' }).click()
  await panel(page).getByRole('button', { name: '上一個' }).click()
  expect(await listScrollTop(page)).toBe(listTop)

  // Board: a column body scrolled partway stays where it is.
  await page.goto('/')
  const seeding = board(page)
    .getByRole('region', { name: /^做種中/ })
    .getByRole('group', { name: '做種中' })
  await seeding.evaluate((element) => {
    element.scrollTop = 600
  })
  const columnTop = await seeding.evaluate((element) => element.scrollTop)
  expect(columnTop).toBeGreaterThan(0)
  await clickInside(page, '[role="group"][aria-label="做種中"]')
  await expect(panel(page)).toBeVisible()
  await panel(page).getByRole('button', { name: '下一個' }).click()
  expect(await seeding.evaluate((element) => element.scrollTop)).toBe(columnTop)
})

test('D16 reduced motion: the board panel appears without the slide', async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.setViewportSize(DESKTOP)
  await login(page)
  await card(page, 2).click()
  await expect(panel(page)).toBeVisible()
  expect(await page.evaluate(() => document.getAnimations().length)).toBe(0)
})

test('D6 D11 phone: rows and cards open the 70% sheet; drag, full screen, name, close', async ({
  page,
}) => {
  await page.setViewportSize(PHONE)
  await login(page)
  await openList(page)
  await expect(detailSheet(page)).toHaveCount(0)

  await rowButton(page, 3).click()
  await expect(detailSheet(page)).toBeVisible()
  await settled(page)
  await expect(detailSheet(page)).toHaveAccessibleName(name(3))
  await expect(page).toHaveURL(new RegExp(`[?&]hash=${hashOf(3)}`))
  expect(Math.round(PHONE.height - (await sheetTop(page)))).toBe(
    Math.round(PHONE.height * 0.7),
  )
  await expect(positionText(detailSheet(page))).toHaveText('第 2 個／共 4 個')
  const nav = detailSheet(page).getByRole('button', { name: '下一個' })
  expect((await nav.boundingBox())?.height).toBe(44)
  await hasNoHorizontalScroll(page)

  await nav.click()
  await expect(detailSheet(page)).toHaveAccessibleName(name(2))

  // A short drag springs back; past half the height closes.
  await dragHandle(page, 60)
  await settled(page)
  await expect(detailSheet(page)).toBeVisible()
  await dragHandle(page, PHONE.height * 0.4)
  await expect(detailSheet(page)).toHaveCount(0)
  await expect(page).not.toHaveURL(/hash=/)

  // Up to full screen, then ✕.
  await rowButton(page, 1).click()
  await settled(page)
  await dragHandle(page, -300)
  await settled(page)
  await expect(detailSheet(page)).toHaveAttribute('data-full-screen', 'true')
  await detailSheet(page).getByRole('button', { name: '關閉' }).click()
  await expect(detailSheet(page)).toHaveCount(0)
  await expect(page).not.toHaveURL(/hash=/)

  // The phone board: a card in the current tab opens it, range is the tab.
  await page.goto('/')
  await page.getByRole('tab', { name: /^下載中/ }).click()
  await page
    .getByRole('tabpanel', { name: '下載中' })
    .getByTitle(name(1), { exact: true })
    .click()
  await expect(detailSheet(page)).toBeVisible()
  await expect(positionText(detailSheet(page))).toHaveText(
    '下載中　第 1 個／共 1 個',
  )

  // D12: a reload opens the sheet again; Esc closes it.
  await page.reload()
  await expect(detailSheet(page)).toHaveAccessibleName(name(1))
  await page.keyboard.press('Escape')
  await expect(detailSheet(page)).toHaveCount(0)
  await expect(page).not.toHaveURL(/hash=/)

  // D11: a hash the phone list does not have closes (removes) it.
  await page.goto(`/?sort=added_on&hash=${hashOf(5)}`)
  await expect(page).not.toHaveURL(/hash=/)
  await expect(detailSheet(page)).toHaveCount(0)
})

/** `data=many`: the third newest has a name over 200 characters. */
const LONG_HASH = hashOf(1002)

test('D14 phone: the long name expands, pushing the content down; › collapses it', async ({
  page,
  request,
}) => {
  await setModes(request, { data: 'many' })
  await page.setViewportSize(PHONE)
  await login(page)
  await page.goto(`/?sort=added_on&hash=${LONG_HASH}`)
  await expect(detailSheet(page)).toBeVisible()
  await settled(page)
  const sheet = detailSheet(page)
  await expect(sheet).toHaveAccessibleName(/^Fake\.Long\.Name\./)
  const tabs = sheet.getByRole('tablist')
  const tabsTop = (await tabs.boundingBox())?.y ?? 0
  await sheet.getByRole('button', { name: '展開完整名稱' }).click()
  await expect(sheet.getByRole('button', { name: '收起名稱' })).toHaveAttribute(
    'aria-expanded',
    'true',
  )
  expect((await tabs.boundingBox())?.y ?? 0).toBeGreaterThan(tabsTop + 40)
  await hasNoHorizontalScroll(page)
  await sheet.getByRole('button', { name: '收起名稱' }).click()
  expect(Math.round((await tabs.boundingBox())?.y ?? 0)).toBe(
    Math.round(tabsTop),
  )
  await sheet.getByRole('button', { name: '展開完整名稱' }).click()
  await sheet.getByRole('button', { name: '下一個' }).click()
  await expect(
    sheet.getByRole('button', { name: '展開完整名稱' }),
  ).toBeVisible()
  await expect(sheet).not.toHaveAccessibleName(/^Fake\.Long\.Name\./)
})

test('D13 Esc closes the phone sheet and removes hash (layers and the field rule: shortcuts.test.ts)', async ({
  page,
}) => {
  await page.setViewportSize(PHONE)
  await login(page)
  await openList(page)
  await rowButton(page, 4).click()
  await expect(detailSheet(page)).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(detailSheet(page)).toHaveCount(0)
  await expect(page).not.toHaveURL(/hash=/)
})

test('screenshots: list panel, board panel, phone sheet (70%, full, name), light and dark', async ({
  page,
  request,
}) => {
  await login(page)
  for (const scheme of SCHEMES) {
    await page.emulateMedia({ colorScheme: scheme })

    await page.setViewportSize(DESKTOP)
    await page.goto(`/?sort=added_on&hash=${hashOf(2)}`)
    await expect(panel(page)).toBeVisible()
    await page.screenshot({
      path: `${SCREENSHOT_DIR}/list-panel-desktop-${scheme}.png`,
      animations: 'disabled',
    })

    await page.goto(`/?hash=${hashOf(2)}`)
    await expect(panel(page)).toBeVisible()
    await settled(page)
    await page.screenshot({
      path: `${SCREENSHOT_DIR}/board-panel-desktop-${scheme}.png`,
      animations: 'disabled',
    })

    await page.setViewportSize(PHONE)
    await page.goto(`/?sort=added_on&hash=${hashOf(1)}`)
    await expect(detailSheet(page)).toBeVisible()
    await settled(page)
    await hasNoHorizontalScroll(page)
    await page.screenshot({
      path: `${SCREENSHOT_DIR}/sheet-70-phone-${scheme}.png`,
    })
    await dragHandle(page, -300)
    await settled(page)
    await expect(detailSheet(page)).toHaveAttribute('data-full-screen', 'true')
    await hasNoHorizontalScroll(page)
    await page.screenshot({
      path: `${SCREENSHOT_DIR}/sheet-full-phone-${scheme}.png`,
    })

    await page.goto(`/?hash=${hashOf(3)}`)
    await expect(detailSheet(page)).toBeVisible()
    await settled(page)
    await hasNoHorizontalScroll(page)
    await page.screenshot({
      path: `${SCREENSHOT_DIR}/sheet-board-phone-${scheme}.png`,
    })
  }

  // The name expanded needs a name too long for one line.
  await setModes(request, { data: 'many' })
  await page.setViewportSize(PHONE)
  for (const scheme of SCHEMES) {
    await page.emulateMedia({ colorScheme: scheme })
    await page.goto(`/?sort=added_on&hash=${LONG_HASH}`)
    await expect(detailSheet(page)).toBeVisible()
    await settled(page)
    await detailSheet(page)
      .getByRole('button', { name: '展開完整名稱' })
      .click()
    await hasNoHorizontalScroll(page)
    await page.screenshot({
      path: `${SCREENSHOT_DIR}/sheet-name-expanded-phone-${scheme}.png`,
    })
  }
})

// Story 2.5 rows H1, T1, P1, P2, C1, C2: the overview against
// `data=states` (one fake torrent per hero row, hashes 0x3001 to 0x300c).
// Screenshots: the 12 rows in the desktop list panel, light and dark (已整理
// is never in list mode, so it comes from the board panel), the board's
// narrow panel, and the phone sheet with the path expanded.

const SCREENSHOT_DIR_25 = 'e2e-output/screenshots/2-5'
const STATE_ROWS = [
  ['downloading', '下載中\u300087%', 'downloading'],
  ['meta', '抓種子資訊中', 'downloading'],
  ['queued', '排隊中\u300012%', 'downloading'],
  ['checking', '檢查檔案中\u300045%', 'downloading'],
  ['paused', '已暫停\u300087%', 'paused'],
  ['stalled', '停滯\u300087%', 'stalled'],
  ['seeding', '做種 41 天', 'seeding'],
  ['done', '已完成', 'done'],
  ['missing-files', '找不到檔案', 'error'],
  ['error', '錯誤', 'error'],
  ['unknown', '狀態不明', 'error'],
  ['archived', '已整理', 'archived'],
] as const
/** The summary line of some rows (the fake rows' own numbers). */
const SUMMARIES: Partial<Record<(typeof STATE_ROWS)[number][0], string>> = {
  downloading: '剩 34 分 · ↓ 6.21 MB/s · 85 GB · mteam-tv',
  seeding: '分享率 3.12 · 已上傳 265.2 GB · 85 GB · mteam-tv',
  archived: '留著當紀錄 · 2025/07/18 下載好了 · 85 GB · X',
}
const stateHash = (index: number) => hashOf(0x3001 + index)
const ARCHIVED_INDEX = 11
const LONG_SAVE_PATH =
  '/data/media/tv/假影集.第一季.Fake.Show.Season.Pack.2160p.WEB-DL'

const overview = (scope: Locator) => scope.getByRole('tabpanel')
const savePath = (scope: Locator) =>
  scope.getByRole('region', { name: '儲存位置' })
const copyButton = (scope: Locator) =>
  savePath(scope).getByRole('button', { name: /^(複製|已複製|複製失敗)$/ })

/** The overview's four blocks, top to bottom, by what they are. */
async function blockKinds(scope: Locator) {
  return overview(scope)
    .locator(':scope > div > *')
    .evaluateAll((blocks) =>
      blocks.map((block) =>
        block.tagName === 'DL'
          ? 'info'
          : block.getAttribute('aria-label') === '儲存位置'
            ? 'path'
            : block.getAttribute('data-slot') === 'stat-tiles'
              ? `tiles:${block.children.length}`
              : block.querySelector('svg[width="64"]')
                ? 'hero'
                : 'other',
      ),
    )
}

/** The three tiles sit on one row (same top). */
async function tilesInOneRow(scope: Locator) {
  const tops = await overview(scope)
    .locator('[data-slot="stat-tiles"] > *')
    .evaluateAll((tiles) =>
      tiles.map((tile) => Math.round(tile.getBoundingClientRect().top)),
    )
  expect(tops).toHaveLength(3)
  expect(new Set(tops).size).toBe(1)
}

/** The path box is one line tall. */
async function expectOneLine(cut: Locator) {
  const { height, lineHeight } = await cut.evaluate((element) => ({
    height: element.getBoundingClientRect().height,
    lineHeight: parseFloat(getComputedStyle(element).lineHeight),
  }))
  expect(Math.round(height)).toBe(Math.round(lineHeight))
}

/**
 * P1: a path too long for the box overflows at its start (off to the left,
 * under the 「…」) while its end lines up with the box's right edge.
 */
async function expectFrontCut(cut: Locator) {
  await expectOneLine(cut)
  const box = await cut.evaluate((element) => {
    const range = document.createRange()
    range.selectNodeContents(element)
    const text = range.getBoundingClientRect()
    const own = element.getBoundingClientRect()
    return {
      overflowing: element.scrollWidth > element.clientWidth,
      textRight: Math.round(text.right),
      boxRight: Math.round(own.right),
      textLeft: text.left,
      boxLeft: own.left,
      ellipsis: getComputedStyle(element).textOverflow,
    }
  })
  expect(box.overflowing).toBe(true)
  expect(box.ellipsis).toBe('ellipsis')
  expect(box.textLeft).toBeLessThan(box.boxLeft)
  expect(Math.abs(box.textRight - box.boxRight)).toBeLessThanOrEqual(1)
}

test.describe('story 2.5 overview', () => {
  test.beforeEach(async ({ request }) => {
    await setModes(request, { ...DEFAULT_MODES, data: 'states' })
  })

  test('H1 T1 P1 the 12 hero rows in the list panel, order, tiles; screenshots light and dark', async ({
    page,
  }) => {
    await page.setViewportSize(DESKTOP)
    await login(page)
    for (const scheme of SCHEMES) {
      await page.emulateMedia({ colorScheme: scheme })
      for (const [index, [slug, headline, status]] of STATE_ROWS.entries()) {
        const archived = index === ARCHIVED_INDEX
        await page.goto(
          archived
            ? `/?hash=${stateHash(index)}`
            : `/?sort=added_on&hash=${stateHash(index)}`,
        )
        await expect(panel(page)).toBeVisible()
        const heroText = overview(panel(page)).locator('p')
        await expect(heroText.first()).toHaveText(headline)
        await expect(heroText.first()).toHaveClass(
          new RegExp(`(^| )text-status-${status}( |$)`),
        )
        const summary = SUMMARIES[slug]
        if (summary !== undefined) {
          await expect(heroText.nth(1)).toHaveText(summary)
        }
        expect(await blockKinds(panel(page))).toEqual([
          'hero',
          'tiles:3',
          'path',
          'info',
        ])
        await tilesInOneRow(panel(page))
        await hasNoHorizontalScroll(page, '[role="tabpanel"]')
        await settled(page)
        await page.screenshot({
          path: `${SCREENSHOT_DIR_25}/${String(index + 1).padStart(2, '0')}-${slug}-${archived ? 'board' : 'list'}-desktop-${scheme}.png`,
          animations: 'disabled',
        })
      }
    }

    // T1: the tiles of each group, with the detail counts.
    await page.emulateMedia({ colorScheme: 'light' })
    const tileTitles = (scope: Locator) =>
      overview(scope).locator('[data-slot="stat-tiles"] > * > span:first-child')
    await page.goto(`/?sort=added_on&hash=${stateHash(0)}`)
    await expect(tileTitles(panel(page))).toHaveText([
      '下載速度',
      '剩餘時間',
      '來源數',
    ])
    await expect(
      overview(panel(page)).locator('[data-slot="stat-tiles"] > *').nth(1),
    ).toHaveText('剩餘時間34 分')
    await expect(
      overview(panel(page)).locator('[data-slot="stat-tiles"] > *').nth(2),
    ).toHaveText('來源數12')
    await page.goto(`/?sort=added_on&hash=${stateHash(6)}`)
    await expect(tileTitles(panel(page))).toHaveText([
      '現在上傳',
      '在抓的人',
      '最後有人抓',
    ])
    await expect(
      overview(panel(page)).locator('[data-slot="stat-tiles"] > *').nth(1),
    ).toHaveText('在抓的人3')
    await page.goto(`/?sort=added_on&hash=${stateHash(9)}`)
    await expect(tileTitles(panel(page))).toHaveText([
      '大小',
      '完成時間',
      '分享率',
    ])

    // P1: the long path keeps its end on one line, cut at the front.
    await page.goto(`/?sort=added_on&hash=${stateHash(0)}`)
    const cut = savePath(panel(page)).locator('[dir="rtl"]')
    await expect(cut).toHaveText(LONG_SAVE_PATH)
    await expect(cut.locator('..')).toHaveAttribute('title', LONG_SAVE_PATH)
    await expectOneLine(cut)
    await expect(
      savePath(panel(page)).getByRole('button', { name: '改路徑' }),
    ).toBeDisabled()
  })

  test('board narrow panel and phone 390: same order, no horizontal scroll; phone path expand; screenshots', async ({
    page,
  }) => {
    await login(page)
    for (const scheme of SCHEMES) {
      await page.emulateMedia({ colorScheme: scheme })
      // The narrowest desktop board (1024px) and the usual one (1440px).
      for (const width of [1024, DESKTOP.width]) {
        await page.setViewportSize({ width, height: DESKTOP.height })
        for (const index of [0, 6]) {
          await page.goto(`/?hash=${stateHash(index)}`)
          await expect(panel(page)).toBeVisible()
          await settled(page)
          expect(await blockKinds(panel(page))).toEqual([
            'hero',
            'tiles:3',
            'path',
            'info',
          ])
          await tilesInOneRow(panel(page))
          await hasNoHorizontalScroll(page, '[role="tabpanel"]')
          await hasNoHorizontalScroll(page)
          if (index === 0) {
            await expectFrontCut(savePath(panel(page)).locator('[dir="rtl"]'))
          }
          if (width === DESKTOP.width) {
            await page.screenshot({
              path: `${SCREENSHOT_DIR_25}/board-panel-${STATE_ROWS[index][0]}-desktop-${scheme}.png`,
              animations: 'disabled',
            })
          }
        }
      }

      await page.setViewportSize(PHONE)
      await page.goto(`/?sort=added_on&hash=${stateHash(0)}`)
      await expect(detailSheet(page)).toBeVisible()
      await settled(page)
      expect(await blockKinds(detailSheet(page))).toEqual([
        'hero',
        'tiles:3',
        'path',
        'info',
      ])
      await tilesInOneRow(detailSheet(page))
      await hasNoHorizontalScroll(page)
      await hasNoHorizontalScroll(page, '[role="tabpanel"]')
      // P2: tap the path, it wraps; 2 x 2 pills, 44px.
      const pathButton = savePath(detailSheet(page)).getByRole('button', {
        name: LONG_SAVE_PATH,
      })
      await expect(pathButton).toHaveAttribute('aria-expanded', 'false')
      const pathText = pathButton.locator(':scope > span')
      const collapsed = (await pathButton.boundingBox())?.height ?? 0
      expect(Math.round(collapsed)).toBe(44)
      expect(Math.round((await pathText.boundingBox())?.height ?? 0)).toBe(18)
      await pathButton.click()
      await expect(pathButton).toHaveAttribute('aria-expanded', 'true')
      // Wrapped over several 18px lines, the whole path visible.
      expect((await pathText.boundingBox())?.height ?? 0).toBeGreaterThan(30)
      await expect(pathText).toHaveText(LONG_SAVE_PATH)
      await hasNoHorizontalScroll(page)
      const copy = copyButton(detailSheet(page))
      expect(Math.round((await copy.boundingBox())?.height ?? 0)).toBe(44)
      // Bring the block into view for the picture.
      await savePath(detailSheet(page)).scrollIntoViewIfNeeded()
      await page.screenshot({
        path: `${SCREENSHOT_DIR_25}/sheet-path-expanded-phone-${scheme}.png`,
        animations: 'disabled',
      })
      await pathButton.click()
      await expect(pathButton).toHaveAttribute('aria-expanded', 'false')
      expect(Math.round((await pathButton.boundingBox())?.height ?? 0)).toBe(
        Math.round(collapsed),
      )
    }
  })

  test('C1 複製 copies the full path: 「已複製」 for 1.5 s', async ({
    page,
    context,
  }) => {
    await context.grantPermissions(['clipboard-read', 'clipboard-write'])
    await page.setViewportSize(DESKTOP)
    await login(page)
    await page.goto(`/?sort=added_on&hash=${stateHash(0)}`)
    const copy = copyButton(panel(page))
    await expect(copy).toHaveText('複製')
    await copy.click()
    await expect(copy).toHaveText('已複製')
    expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(
      LONG_SAVE_PATH,
    )
    await expect(copy).toHaveText('複製', { timeout: 3000 })
  })

  test('C2 without navigator.clipboard (plain http) the textarea fallback copies', async ({
    page,
  }) => {
    await page.addInitScript(() => {
      Object.defineProperty(Navigator.prototype, 'clipboard', {
        get: () => undefined,
        configurable: true,
      })
      // What `copy` really took: Chromium's execCommand('copy') returns
      // true even with nothing selected, so the label alone proves nothing.
      document.addEventListener(
        'copy',
        () => {
          const active = document.activeElement
          const copied =
            active instanceof HTMLTextAreaElement
              ? active.value.slice(active.selectionStart, active.selectionEnd)
              : (document.getSelection()?.toString() ?? '')
          document.documentElement.dataset.rtCopied = copied
        },
        true,
      )
    })
    await page.setViewportSize(PHONE)
    await login(page)
    await page.goto(`/?sort=added_on&hash=${stateHash(0)}`)
    await expect(detailSheet(page)).toBeVisible()
    await settled(page)
    // The textarea goes inside the sheet: the focus trap keeps it.
    const copy = copyButton(detailSheet(page))
    await copy.click()
    await expect(copy).toHaveText('已複製')
    // The whole long path was selected when the copy ran.
    await expect(page.locator('html')).toHaveAttribute(
      'data-rt-copied',
      LONG_SAVE_PATH,
    )
    await expect(detailSheet(page).locator('textarea')).toHaveCount(0)
    await expect(copy).toBeFocused()
    await expect(copy).toHaveText('複製', { timeout: 3000 })
  })
})
