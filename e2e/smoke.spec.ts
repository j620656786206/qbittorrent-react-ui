import type { Page } from '@playwright/test'
import {
  DEFAULT_MODES,
  FAKE_PASS,
  FAKE_USER,
  MAIN_ID,
  expect,
  login,
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

async function scrollMain(page: Page, to: 'bottom' | 'middle') {
  await page.locator(`#${MAIN_ID}`).evaluate((main, where) => {
    const max = main.scrollHeight - main.clientHeight
    main.scrollTop = where === 'bottom' ? max : Math.round(max / 2)
  }, to)
  // Let the virtualizer render the new window.
  await page.evaluate(
    () => new Promise((resolve) => requestAnimationFrame(() => resolve(null))),
  )
}

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

test('P1 login with the fake credentials lands on the list', async ({
  page,
}) => {
  await page.goto('/login')
  await page.getByLabel('帳號').fill(FAKE_USER)
  await page.getByLabel('密碼', { exact: true }).fill(FAKE_PASS)
  await page.getByRole('button', { name: '登入', exact: true }).click()
  await page.waitForURL('/')
  await expect(rows(page).first()).toBeVisible()
})

test('P2 4165 torrents keep the DOM virtualized', async ({ page, request }) => {
  await setModes(request, { data: 'many' })
  await login(page)
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

      await page.goto('/')
      await expect(rows(page).first()).toBeVisible()
      if (size.name === 'phone') {
        await hasNoHorizontalScroll(page)
        // `main` scrolls on its own: a too-wide row would scroll in there.
        await hasNoHorizontalScroll(page, `#${MAIN_ID}`)
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
    .getByRole('button', { name: /^排序：.*，列表$/ })
    .filter({ visible: true })
const sortMenu = (page: Page) => page.getByRole('menu', { name: '排序' })

/** The big numbers of the first `count` rows, in list order, without the label. */
async function bigValues(page: Page, count: number): Promise<Array<string>> {
  return page.evaluate((max) => {
    const items = [...document.querySelectorAll('[role="listitem"]')]
      .map((item) => ({
        index: Number(item.getAttribute('aria-posinset')),
        cell: item.querySelector(':scope > div > div > span:last-child'),
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
  await expect(items.first()).toHaveAttribute('aria-disabled', 'true')
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
  expect(
    await page.locator(`#${MAIN_ID}`).evaluate((main) => main.scrollTop),
  ).toBe(0)
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
  expect(
    await page.locator(`#${MAIN_ID}`).evaluate((main) => main.scrollTop),
  ).toBe(0)
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
  await expect(sortPill(page)).toHaveAccessibleName(
    '排序：加入時間，新的在前，列表',
  )
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
