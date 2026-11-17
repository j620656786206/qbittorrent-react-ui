import type { Page } from '@playwright/test'
import {
  DEFAULT_MODES,
  FAKE_PASS,
  FAKE_USER,
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

// Story 2.0 rows P1 to P7: the built server behind scripts/fake-qbit.mjs in
// Chromium. Only the fake qBittorrent is ever reached (AD-15).

const SCREENSHOT_DIR = 'e2e-output/screenshots'
const MAX_ROWS_IN_DOM = 80
const NOT_FOUND = '找不到這個頁面'
const BACK_TO_LIST = '回到種子列表'
/** Polls run every 5 s; connection retries add a few seconds on top. */
const POLL_WAIT = 30_000

const WIDTHS = [
  { name: 'desktop', width: 1440, height: 900 },
  { name: 'phone', width: 390, height: 844 },
] as const
const SCHEMES = ['light', 'dark'] as const

test.beforeEach(async ({ request }) => {
  await setModes(request, DEFAULT_MODES)
})

test.afterEach(async ({ request }) => {
  await setModes(request, DEFAULT_MODES)
})

const rows = (page: Page) => page.getByRole('listitem')

// Story 2.4: the list scrolls itself, not `main`.
const scrollMain = scrollList

/**
 * Opens the unknown URL. The server answers it with a 404 document (the
 * not-found page), so Chromium logs "Failed to load resource ... 404": the
 * test forced that status, and the caller allows it.
 */
async function openUnknownUrl(page: Page) {
  const response = await page.goto('/no-such-page')
  expect(response?.status()).toBe(404)
  await expect(page.getByRole('heading', { name: NOT_FOUND })).toBeVisible()
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

test('P1 login with the fake credentials lands on the board', async ({
  page,
}) => {
  await page.goto('/login')
  await page.getByLabel('帳號').fill(FAKE_USER)
  await page.getByLabel('密碼', { exact: true }).fill(FAKE_PASS)
  await page.getByRole('button', { name: '登入', exact: true }).click()
  await page.waitForURL('/')
  // No sort in the URL: 狀態, the board (story 2.3); its cards are listitems.
  await expect(rows(page).first()).toBeVisible()
})

test('P2 4165 torrents keep the DOM virtualized', async ({ page, request }) => {
  await setModes(request, { data: 'many' })
  await login(page)
  await openList(page)
  await expect(rows(page).first()).toHaveAttribute('aria-setsize', '4165')
  expect(await rows(page).count()).toBeLessThan(MAX_ROWS_IN_DOM)

  await scrollMain(page, 'bottom')
  await expect(rows(page).last()).toHaveAttribute('aria-posinset', '4165')
  expect(await rows(page).count()).toBeLessThan(MAX_ROWS_IN_DOM)

  await scrollMain(page, 'middle')
  // Rows near the middle are drawn: not the top, not the bottom, not none.
  await expect(rows(page).first()).toBeVisible()
  const middle = Number(await rows(page).first().getAttribute('aria-posinset'))
  expect(middle).toBeGreaterThan(1500)
  expect(middle).toBeLessThan(2700)
  expect(await rows(page).count()).toBeLessThan(MAX_ROWS_IN_DOM)
})

test('P4 no horizontal scroll at 390px; light and dark screenshots', async ({
  page,
  watch,
}) => {
  watch.allowForcedStatus(404, '/no-such-page')
  await page.setViewportSize(WIDTHS[0])
  await login(page)
  for (const scheme of SCHEMES) {
    await page.emulateMedia({ colorScheme: scheme })
    for (const size of WIDTHS) {
      await page.setViewportSize(size)
      const suffix = `${size.name}-${scheme}`

      await openList(page)
      if (size.name === 'phone') {
        await hasNoHorizontalScroll(page)
        // The list scrolls on its own: a too-wide row would scroll in there.
        await hasNoHorizontalScroll(page, `#${MAIN_ID}`)
        await hasNoHorizontalScroll(page, `#${LIST_SCROLL_ID}`)
      }
      await page.screenshot({
        path: `${SCREENSHOT_DIR}/list-${suffix}.png`,
        animations: 'disabled',
      })

      await openUnknownUrl(page)
      if (size.name === 'phone') await hasNoHorizontalScroll(page)
      await page.screenshot({
        path: `${SCREENSHOT_DIR}/not-found-${suffix}.png`,
        animations: 'disabled',
      })
    }
  }
})

test('P4 login screen screenshots', async ({ page }) => {
  for (const scheme of SCHEMES) {
    await page.emulateMedia({ colorScheme: scheme })
    for (const size of WIDTHS) {
      await page.setViewportSize(size)
      await page.goto('/login')
      await expect(page.getByLabel('帳號')).toBeVisible()
      if (size.name === 'phone') await hasNoHorizontalScroll(page)
      await page.screenshot({
        path: `${SCREENSHOT_DIR}/login-${size.name}-${scheme}.png`,
        animations: 'disabled',
      })
    }
  }
})

test('P5 an expired Cloudflare login shows its bar', async ({
  page,
  request,
  watch,
}) => {
  await login(page)
  watch.allowForcedStatus(401, '/_serverFn/')
  await setModes(request, { front: 'cloudflare' })
  // The shell renders a desktop and a phone bar; one is display: none.
  const bar = page
    .getByRole('alert')
    .filter({ hasText: 'Cloudflare 登入過期了', visible: true })
  await expect(bar).toBeVisible({ timeout: POLL_WAIT })
})

test('P6 重試 clears the bar and leaves focus on main', async ({
  page,
  request,
  watch,
}) => {
  await login(page)
  watch.allowForcedStatus(502, '/_serverFn/')
  await setModes(request, { front: 'down' })
  // The shell renders a desktop and a phone bar; one is display: none.
  const retry = page
    .getByRole('button', { name: '重試', exact: true })
    .filter({ visible: true })
  await expect(retry).toBeVisible({ timeout: POLL_WAIT })

  await setModes(request, { front: 'normal' })
  await retry.click()
  await expect(retry).toBeHidden({ timeout: POLL_WAIT })
  await expect
    .poll(() => page.evaluate(() => document.activeElement?.id))
    .toBe(MAIN_ID)
})

test('P7 an unknown URL logged out: the link goes through login', async ({
  page,
  watch,
}) => {
  watch.allowForcedStatus(404, '/no-such-page')
  await openUnknownUrl(page)
  await page.getByRole('link', { name: BACK_TO_LIST }).click()
  await page.waitForURL('/login?redirect=%2F')
})

test('P7 an unknown URL logged in: the link reaches the list', async ({
  page,
  watch,
}) => {
  watch.allowForcedStatus(404, '/no-such-page')
  await login(page)
  await openUnknownUrl(page)
  await page.getByRole('link', { name: BACK_TO_LIST }).click()
  await page.waitForURL('/')
  await expect(rows(page).first()).toBeVisible()
})

// Story 2.1: the desktop sort menu, an extra sort, the URL and the big
// numbers, with the same CSP and console watch as every test.

const DESKTOP = WIDTHS[0]

const sortPill = (page: Page) =>
  page
    .getByRole('button', { name: /^排序：.*，(列表|看板)$/ })
    .filter({ visible: true })
const sortMenu = (page: Page) => page.getByRole('menu', { name: '排序' })

/** The big numbers of the first `count` rows, in list order, without the label. */
async function bigValues(page: Page, count: number): Promise<Array<string>> {
  return page.evaluate((max) => {
    const items = [...document.querySelectorAll('[role="listitem"]')]
      .map((item) => ({
        index: Number(item.getAttribute('aria-posinset')),
        cell: item.querySelector(':scope > button > span > span:last-child'),
      }))
      .sort((a, b) => a.index - b.index)
      .slice(0, max)
    return items.map(({ cell }) => {
      const label = cell?.querySelector('.sr-only')?.textContent ?? ''
      return (cell?.textContent ?? '').slice(label.length).trim()
    })
  }, count)
}

test('S1 the sort menu: 更多, an extra sort, flip, reopen at the item', async ({
  page,
  request,
}) => {
  await setModes(request, { data: 'many' })
  await page.setViewportSize(DESKTOP)
  await login(page)
  await openList(page)
  // Every sort change uses `replace`: no new history entries.
  const historyLength = () => page.evaluate(() => history.length)
  const entries = await historyLength()
  await expect(sortPill(page)).toHaveAccessibleName(
    '排序：加入時間，新的在前，列表',
  )
  await expect(sortPill(page)).toHaveAttribute(
    'title',
    '排序：加入時間，新的在前',
  )

  await sortPill(page).click()
  const menu = sortMenu(page)
  await expect(menu).toBeVisible()
  const items = menu.getByRole('menuitemradio')
  await expect(items).toHaveCount(5)
  // 狀態 (the board) is enabled since story 2.3.
  await expect(items.first()).not.toHaveAttribute('aria-disabled', 'true')
  // Announced without the arrow and the shortcut digit.
  await expect(
    menu.getByRole('menuitemradio', { checked: true }),
  ).toHaveAccessibleName('加入時間，新的在前')
  const width = await menu.evaluate(
    (element) => element.getBoundingClientRect().width,
  )
  expect(width).toBe(260)
  await page.screenshot({ path: `${SCREENSHOT_DIR}/sort-menu-light.png` })

  await menu.getByRole('menuitem', { name: '更多' }).click()
  await expect(menu).toBeVisible()
  await expect(items).toHaveCount(51)
  await page.screenshot({ path: `${SCREENSHOT_DIR}/sort-menu-more-light.png` })

  // A switch scrolls the list back to the top.
  await scrollMain(page, 'middle')
  await menu.getByRole('menuitemradio', { name: /^做種人數（連上的）/ }).click()
  await expect(menu).toBeHidden()
  await expect(sortPill(page)).toHaveAccessibleName(
    '排序：做種人數（連上的），大的在前，列表',
  )
  await expect(page).toHaveURL(/[?&]sort=num_seeds/)
  await expect(page).toHaveURL(/[?&]dir=desc/)
  expect(await listScrollTop(page)).toBe(0)
  // The keys arrive from getSortKeys; then the list is sorted large first.
  await expect.poll(async () => (await bigValues(page, 1))[0]).toBe('8')
  const desc = (await bigValues(page, 20)).map(Number)
  expect(desc).toEqual([...desc].sort((a, b) => b - a))

  // Reopened: 更多 already open, the current sort checked and in view.
  await sortPill(page).click()
  await expect(items).toHaveCount(51)
  const current = menu.getByRole('menuitemradio', { checked: true })
  await expect(current).toHaveAccessibleName('做種人數（連上的），大的在前')
  await expect(current).toHaveText(/^做種人數（連上的）\u3000大的在前 ↓$/)
  await expect(current).toBeInViewport()
  await page.screenshot({
    path: `${SCREENSHOT_DIR}/sort-menu-selected-light.png`,
  })

  // Clicking the selected one flips the direction, keeps the menu open and
  // goes back to the top of the list.
  await scrollMain(page, 'middle')
  await current.click()
  await expect(menu).toBeVisible()
  await expect(page).toHaveURL(/[?&]dir=asc/)
  await expect(current).toHaveText(/^做種人數（連上的）\u3000小的在前 ↑$/)
  expect(await listScrollTop(page)).toBe(0)
  expect(await historyLength()).toBe(entries)
  await page.keyboard.press('Escape')
  await expect(menu).toBeHidden()
  await expect.poll(async () => (await bigValues(page, 1))[0]).toBe('0')
  const asc = (await bigValues(page, 20)).map(Number)
  expect(asc).toEqual([...asc].sort((a, b) => a - b))
})

test('S2 a bad sort in the URL falls back and the URL is fixed', async ({
  page,
}) => {
  await page.setViewportSize(DESKTOP)
  await login(page)
  await page.goto('/?sort=nope&dir=up')
  await page.waitForURL('/')
  // Back to the default: 狀態, the board (story 2.3).
  await expect(sortPill(page)).toHaveAccessibleName('排序：狀態，看板')
  await page.goto('/?sort=ratio&dir=sideways')
  await page.waitForURL('/?sort=ratio')
  await expect(sortPill(page)).toHaveAccessibleName(
    '排序：分享率，高的在前，列表',
  )
  // The fixes replaced the bad entries: going back never meets them.
  await page.goBack()
  expect(page.url()).not.toContain('sort=nope')
  expect(page.url()).not.toContain('sideways')
})

const SCREENSHOT_SORTS = [
  'seeding_time',
  'ratio',
  'name',
  'save_path',
  'hash',
] as const

test('S3 sorted lists and the menu in light and dark', async ({
  page,
  request,
}) => {
  await setModes(request, { data: 'many' })
  await page.setViewportSize(DESKTOP)
  await login(page)
  for (const scheme of SCHEMES) {
    await page.emulateMedia({ colorScheme: scheme })
    for (const sort of SCREENSHOT_SORTS) {
      await page.goto(`/?sort=${sort}`)
      await expect(rows(page).first()).toBeVisible()
      // Sorting by ratio hides the ratio column.
      await expect(page.getByText(/^分享率\s/).first()).toBeVisible({
        visible: sort !== 'ratio',
      })
      await page.screenshot({
        path: `${SCREENSHOT_DIR}/sort-${sort}-${scheme}.png`,
        animations: 'disabled',
      })
    }
    if (scheme === 'dark') {
      await page.goto('/?sort=num_seeds')
      await sortPill(page).click()
      await expect(sortMenu(page).getByRole('menuitemradio')).toHaveCount(51)
      await page.screenshot({
        path: `${SCREENSHOT_DIR}/sort-menu-selected-dark.png`,
        animations: 'disabled',
      })
      await page.keyboard.press('Escape')
      await sortPill(page).click()
      await sortMenu(page).getByRole('menuitem', { name: '更多' }).click()
      await expect(sortMenu(page).getByRole('menuitemradio')).toHaveCount(5)
      await page.screenshot({
        path: `${SCREENSHOT_DIR}/sort-menu-dark.png`,
        animations: 'disabled',
      })
      await page.keyboard.press('Escape')
    }
  }
})

// Story 2.2: the phone sort pill, the shared bottom sheet and its sort
// content at 390px, with the same CSP and console watch as every test.

const PHONE = WIDTHS[1]

const phonePill = (page: Page) =>
  page
    .getByRole('button', { name: /^排序：.*，(列表|看板)$/ })
    .filter({ visible: true })
const sortSheet = (page: Page) => page.getByRole('dialog', { name: '排序' })
/** The sheet's sort rows: plain buttons in lists (no menu roles). */
const sheetRows = (page: Page) => sortSheet(page).locator('li > button')
const currentRow = (page: Page) =>
  sortSheet(page).locator('li > button[aria-current="true"]')

/** The sheet's visible height and its content's natural height. */
async function fitHeights(page: Page) {
  return sortSheet(page).evaluate((element) => {
    const head = element.firstElementChild as HTMLElement
    const content = element.querySelector('[data-slot="bottom-sheet-content"]')
      ?.firstElementChild as HTMLElement
    return {
      visible: window.innerHeight - element.getBoundingClientRect().top,
      content: head.offsetHeight + content.offsetHeight,
    }
  })
}
const mainScrollTop = listScrollTop

/** Waits until no animation runs (the sheet's slide, the scrim's fade). */
async function settled(page: Page) {
  await page.waitForFunction(() =>
    document
      .getAnimations()
      .every((animation) => animation.playState !== 'running'),
  )
}

async function openPhoneSheet(page: Page) {
  await phonePill(page).click()
  await expect(sortSheet(page)).toBeVisible()
  await settled(page)
}

async function sheetBox(page: Page) {
  const box = await sortSheet(page).evaluate((element) => {
    const rect = element.getBoundingClientRect()
    return { top: rect.top, bottom: rect.bottom }
  })
  return box
}

/** Drags the sheet's handle by `dy` px with the mouse (pointer events). */
async function dragHandle(page: Page, dy: number) {
  const { top } = await sheetBox(page)
  const x = PHONE.width / 2
  await page.mouse.move(x, top + 10)
  await page.mouse.down()
  await page.mouse.move(x, top + 10 + dy, { steps: 12 })
  await page.mouse.up()
}

test('B1 the phone sort sheet: open, 更多, flip, switch, every way to close', async ({
  page,
  request,
}) => {
  await setModes(request, { data: 'many' })
  await page.setViewportSize(PHONE)
  await login(page)
  await openList(page)
  const historyLength = () => page.evaluate(() => history.length)
  const entries = await historyLength()
  const pill = phonePill(page)
  await expect(pill).toHaveText('加入時間 ↓')
  await expect(pill).toHaveAccessibleName('排序：加入時間，新的在前，列表')
  expect((await pill.boundingBox())?.height).toBe(44)

  await openPhoneSheet(page)
  const sheet = sortSheet(page)
  await expect(sheet).toHaveAttribute('aria-modal', 'true')
  const items = sheetRows(page)
  await expect(items).toHaveCount(5)
  await expect(items.first()).toBeEnabled()
  await expect(sheet.getByRole('menu')).toHaveCount(0)
  const checked = currentRow(page)
  await expect(checked).toHaveAccessibleName('加入時間，新的在前')
  await expect(checked).toBeFocused()
  expect((await checked.boundingBox())?.height).toBe(52)
  // Fit: what shows is the content's own height (under 90%).
  const fit = await fitHeights(page)
  expect(fit.content).toBeLessThan(PHONE.height * 0.9)
  expect(Math.abs(fit.visible - fit.content)).toBeLessThanOrEqual(1)
  await hasNoHorizontalScroll(page)

  // B14: the page behind cannot scroll: `main` and, since story 2.4, the
  // list's own scroller.
  const overflowOf = (id: string) =>
    page
      .locator(`#${id}`)
      .evaluate((element) => getComputedStyle(element).overflowY)
  expect(await overflowOf(MAIN_ID)).toBe('hidden')
  expect(await overflowOf(LIST_SCROLL_ID)).toBe('hidden')

  await sheet.getByRole('button', { name: '更多' }).click()
  await expect(items).toHaveCount(51)
  // Fit grows with the content up to 90% of the screen.
  await expect
    .poll(async () => (await sheetBox(page)).top)
    .toBeLessThan(PHONE.height * 0.11)
  await settled(page)
  await hasNoHorizontalScroll(page)

  // ✕, Esc and the scrim each close it and give focus back to the pill.
  await sheet.getByRole('button', { name: '關閉' }).click()
  await expect(sheet).toBeHidden()
  await expect(pill).toBeFocused()
  // The lock is undone: the list scrolls again.
  expect(await overflowOf(LIST_SCROLL_ID)).toBe('auto')
  await openPhoneSheet(page)
  await page.keyboard.press('Escape')
  await expect(sheet).toBeHidden()
  await expect(pill).toBeFocused()
  await openPhoneSheet(page)
  await page.mouse.click(PHONE.width / 2, 30)
  await expect(sheet).toBeHidden()
  await expect(pill).toBeFocused()

  // B11 the selected row flips the direction; the sheet stays.
  await openPhoneSheet(page)
  await checked.click()
  await expect(page).toHaveURL(/[?&]dir=asc/)
  await expect(sheet).toBeVisible()
  await expect(checked).toHaveText(/^加入時間\u3000舊的在前 ↑$/)
  await page.keyboard.press('Escape')
  await expect(sheet).toBeHidden()

  // B12 another row: default direction, closes, the list at the top.
  await scrollMain(page, 'middle')
  expect(await mainScrollTop(page)).toBeGreaterThan(0)
  await openPhoneSheet(page)
  await sheet.getByRole('button', { name: '做種時間', exact: true }).click()
  await expect(sheet).toBeHidden()
  await expect(page).toHaveURL(/[?&]sort=seeding_time/)
  await expect(page).toHaveURL(/[?&]dir=desc/)
  await expect(pill).toHaveText('做種時間 ↓')
  await expect(pill).toBeFocused()
  expect(await mainScrollTop(page)).toBe(0)

  // B13 a sort under 更多: opens expanded with it in view.
  await page.goto('/?sort=num_seeds&dir=asc')
  await expect(rows(page).first()).toBeVisible()
  await openPhoneSheet(page)
  await expect(items).toHaveCount(51)
  const current = currentRow(page)
  await expect(current).toHaveAccessibleName('做種人數（連上的），小的在前')
  await expect(current).toBeInViewport({ ratio: 1 })
  await expect(current).toBeFocused()
  await page.keyboard.press('Escape')
  await expect(sheet).toBeHidden()
  expect(await historyLength()).toBe(entries + 1)
})

test('B3 B5 dragging: down closes, a short drag springs back, up goes full screen', async ({
  page,
}) => {
  await page.setViewportSize(PHONE)
  await login(page)
  await openPhoneSheet(page)
  const sheet = sortSheet(page)
  const rest = await sheetBox(page)

  await dragHandle(page, 30)
  await settled(page)
  expect(Math.round((await sheetBox(page)).top)).toBe(Math.round(rest.top))
  await expect(sheet).toBeVisible()

  await dragHandle(page, -250)
  await settled(page)
  await expect(sheet).toHaveAttribute('data-full-screen', 'true')
  const full = await sheetBox(page)
  expect(full.top).toBe(0)
  expect(
    await sheet.evaluate(
      (element) => getComputedStyle(element).borderTopLeftRadius,
    ),
  ).toBe('0px')

  await dragHandle(page, 300)
  await settled(page)
  await expect(sheet).not.toHaveAttribute('data-full-screen', 'true')
  expect(Math.round((await sheetBox(page)).top)).toBe(Math.round(rest.top))

  await dragHandle(page, 250)
  await expect(sheet).toBeHidden()
  await expect(phonePill(page)).toBeFocused()
})

test('B9 the list keeps its order while the sheet is open', async ({
  page,
  request,
}) => {
  await page.setViewportSize(PHONE)
  await login(page)
  await openList(page)
  const setSize = () => rows(page).first().getAttribute('aria-setsize')
  const before = await setSize()
  await openPhoneSheet(page)
  // Each poll now adds a newer torrent; the sheet holds them back. Wait for
  // two maindata answers (the only server function polled on this sort).
  await setModes(request, { grow: '1' })
  for (let poll = 0; poll < 2; poll += 1) {
    await page.waitForResponse(
      async (response) =>
        response.url().includes('/_serverFn/') &&
        (await response.text()).includes('serverState'),
      { timeout: POLL_WAIT },
    )
  }
  expect(await setSize()).toBe(before)
  await page.keyboard.press('Escape')
  await expect(sortSheet(page)).toBeHidden()
  await expect.poll(setSize).not.toBe(before)
})

test('B10 reduced motion: the sheet opens and closes without animations', async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.setViewportSize(PHONE)
  await login(page)
  await phonePill(page).click()
  await expect(sortSheet(page)).toBeVisible()
  expect(await page.evaluate(() => document.getAnimations().length)).toBe(0)
  await dragHandle(page, 30)
  expect(await page.evaluate(() => document.getAnimations().length)).toBe(0)
  await page.keyboard.press('Escape')
  await expect(sortSheet(page)).toHaveCount(0)
})

/**
 * A finger drag of `dy` px from `(x, y)` through the DevTools protocol, so
 * Chromium runs its real touch pipeline: `touch-action`, native scrolling
 * and the pointer events it sends instead.
 * https://chromedevtools.github.io/devtools-protocol/tot/Input/#method-dispatchTouchEvent
 */
async function touchDrag(page: Page, x: number, y: number, dy: number) {
  const cdp = await page.context().newCDPSession(page)
  const steps = 12
  await cdp.send('Input.dispatchTouchEvent', {
    type: 'touchStart',
    touchPoints: [{ x, y }],
  })
  for (let step = 1; step <= steps; step += 1) {
    await cdp.send('Input.dispatchTouchEvent', {
      type: 'touchMove',
      touchPoints: [{ x, y: y + (dy * step) / steps }],
    })
  }
  await cdp.send('Input.dispatchTouchEvent', {
    type: 'touchEnd',
    touchPoints: [],
  })
  await cdp.detach()
}

test.describe('with a touch screen', () => {
  test.use({ hasTouch: true })

  test('B4 touch: the expanded 更多 list scrolls by finger; from its top a finger drags the sheet', async ({
    page,
  }) => {
    await page.setViewportSize(PHONE)
    await login(page)
    await openPhoneSheet(page)
    const sheet = sortSheet(page)
    await sheet.getByRole('button', { name: '更多' }).click()
    // The taller content moves the sheet up to its 90% cap.
    const top = async () => Math.round((await sheetBox(page)).top)
    await expect.poll(top).toBe(Math.round(PHONE.height * 0.1))
    await settled(page)
    const content = sheet.locator('[data-slot="bottom-sheet-content"]')
    const scrollTop = () => content.evaluate((element) => element.scrollTop)
    const rest = await top()
    const box = await content.boundingBox()
    if (!box) throw new Error('no sheet content')
    const x = PHONE.width / 2

    // A finger moving up scrolls the list; the sheet stays where it rests.
    await touchDrag(page, x, box.y + box.height - 40, -300)
    await expect.poll(scrollTop).toBeGreaterThan(0)
    // Let the fling's momentum run out.
    let last = -1
    await expect
      .poll(async () => {
        const now = await scrollTop()
        const still = now === last
        last = now
        return still
      })
      .toBe(true)
    await settled(page)
    await expect(sheet).not.toHaveAttribute('data-full-screen', 'true')
    expect(await top()).toBe(rest)

    // Back at the top, a finger moving down drags the sheet closed.
    await content.evaluate((element) => {
      element.scrollTop = 0
    })
    const touchAction = () =>
      content.evaluate((element) => element.style.touchAction)
    await expect.poll(touchAction).toBe('pan-down')
    await touchDrag(page, x, box.y + 40, 400)
    await expect(sheet).toBeHidden()
  })
})

test('B1 sheet screenshots at 390px, light and dark', async ({
  page,
  request,
}) => {
  await setModes(request, { data: 'many' })
  await page.setViewportSize(PHONE)
  await login(page)
  for (const scheme of SCHEMES) {
    await page.emulateMedia({ colorScheme: scheme })
    await page.goto('/?sort=seeding_time')
    await expect(rows(page).first()).toBeVisible()
    await openPhoneSheet(page)
    await hasNoHorizontalScroll(page)
    await page.screenshot({
      path: `${SCREENSHOT_DIR}/sort-sheet-phone-${scheme}.png`,
      animations: 'disabled',
    })
    await sortSheet(page).getByRole('button', { name: '更多' }).click()
    await expect
      .poll(async () => (await sheetBox(page)).top)
      .toBeLessThan(PHONE.height * 0.11)
    await settled(page)
    // No hover look on the row the mouse clicked.
    await page.mouse.move(0, 0)
    await hasNoHorizontalScroll(page)
    await page.screenshot({
      path: `${SCREENSHOT_DIR}/sort-sheet-more-phone-${scheme}.png`,
      animations: 'disabled',
    })
    await dragHandle(page, -200)
    await settled(page)
    await expect(sortSheet(page)).toHaveAttribute('data-full-screen', 'true')
    await hasNoHorizontalScroll(page)
    await page.screenshot({
      path: `${SCREENSHOT_DIR}/sort-sheet-full-phone-${scheme}.png`,
      animations: 'disabled',
    })
    await page.keyboard.press('Escape')
    await expect(sortSheet(page)).toBeHidden()
  }
})
