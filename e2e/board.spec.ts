import type { Locator, Page } from '@playwright/test'
import {
  DEFAULT_MODES,
  LIST_SCROLL_ID,
  MAIN_ID,
  expect,
  listScrollTop,
  login,
  setModes,
  test,
} from './fixtures'

// Story 2.3 rows K1 to K14: the board (the default 「狀態」 sort) in Chromium
// against the built server and scripts/fake-qbit.mjs, with the same CSP and
// console watch as every test. Only the fake qBittorrent is reached
// (AD-15). Sample data: 要處理 2 (stalled, private missingFiles), 下載中 1,
// 做種中 1, 完成 0, 已整理 2.

const SCREENSHOT_DIR = 'e2e-output/screenshots'
const DESKTOP = { width: 1440, height: 900 }
const PHONE = { width: 390, height: 844 }
const SCHEMES = ['light', 'dark'] as const
const MAX_CARDS_PER_COLUMN = 60
/** Polls run every 5 s; a slow CI adds a little. */
const POLL_WAIT = 30_000

test.beforeEach(async ({ request }) => {
  await setModes(request, DEFAULT_MODES)
})

test.afterEach(async ({ request }) => {
  await setModes(request, DEFAULT_MODES)
})

const board = (page: Page) => page.getByRole('region', { name: '看板' })
const column = (page: Page, name: RegExp | string) =>
  board(page).getByRole('region', { name })
const cardsIn = (scope: Locator) => scope.getByRole('listitem')
const cardNames = (scope: Locator) =>
  scope.evaluate((element) =>
    [...element.querySelectorAll('[role="listitem"]')]
      .sort(
        (a, b) =>
          Number(a.getAttribute('aria-posinset')) -
          Number(b.getAttribute('aria-posinset')),
      )
      .map((item) => item.querySelector('[title]')?.getAttribute('title')),
  )
const sortPill = (page: Page) =>
  page
    .getByRole('button', { name: /^排序：.*，(列表|看板)$/ })
    .filter({ visible: true })
const mainScrollTop = listScrollTop

async function hasNoHorizontalScroll(page: Page, selector = ':root') {
  const { scrollWidth, clientWidth } = await page
    .locator(selector)
    .evaluate((element) => ({
      scrollWidth: element.scrollWidth,
      clientWidth: element.clientWidth,
    }))
  expect(scrollWidth, selector).toBeLessThanOrEqual(clientWidth)
}

/** Waits until no animation or transition runs. */
async function settled(page: Page) {
  await page.waitForFunction(() =>
    document
      .getAnimations()
      .every((animation) => animation.playState !== 'running'),
  )
}

async function waitForPolls(page: Page, count: number) {
  for (let poll = 0; poll < count; poll += 1) {
    await page.waitForResponse(
      async (response) =>
        response.url().includes('/_serverFn/') &&
        (await response.text()).includes('serverState'),
      { timeout: POLL_WAIT },
    )
  }
}

async function shot(page: Page, name: string) {
  await page.mouse.move(0, 0)
  await page.screenshot({
    path: `${SCREENSHOT_DIR}/${name}.png`,
    animations: 'disabled',
  })
}

test('K1 K3 K4 the default is the board: 4 columns in order, 已整理 collapsed', async ({
  page,
}) => {
  await page.setViewportSize(DESKTOP)
  await login(page)
  await expect(sortPill(page)).toHaveAccessibleName('排序：狀態，看板')
  await expect(sortPill(page)).toHaveAttribute('title', '排序：狀態')
  await expect(sortPill(page)).toHaveText(/^看板排序：狀態$/)

  const names = await board(page)
    .locator(':scope > section')
    .evaluateAll((sections) =>
      sections.map((section) => section.getAttribute('aria-label')),
    )
  expect(names).toEqual([
    '要處理，2 個',
    '下載中，1 個',
    '做種中，1 個',
    '完成，0 個',
    '已整理欄',
  ])
  const titles = await board(page)
    .locator('h2')
    .evaluateAll((headers) => headers.map((h) => h.getAttribute('title')))
  expect(titles).toEqual([
    '最新出問題的在前',
    '新加入的在前',
    '做種最久的在前',
    '剛完成的在前',
  ])
  // K4: newest activity first (the stalled one, then the private missing).
  expect(await cardNames(column(page, /^要處理/))).toEqual([
    'Fake.Show.S01E03.1080p',
    'Fake.Show.S01E04.1080p',
  ])
  // An empty column stays and says 沒有.
  await expect(column(page, /^完成/)).toContainText('沒有')
  // Four equal work columns and the 64px strip, 14px apart.
  const widths = await board(page)
    .locator(':scope > section')
    .evaluateAll((sections) =>
      sections.map((section) => section.getBoundingClientRect().width),
    )
  expect(widths[4]).toBe(64)
  for (const width of widths.slice(1, 4)) {
    expect(Math.abs(width - widths[0])).toBeLessThan(1)
  }
  // The board fills main; main itself does not scroll.
  const main = await page.locator(`#${MAIN_ID}`).evaluate((element) => ({
    scroll: element.scrollHeight,
    client: element.clientHeight,
  }))
  expect(main.scroll).toBeLessThanOrEqual(main.client)
  // A card: 32px circle labelled, percent for the stalled one.
  const stalled = cardsIn(column(page, /^要處理/)).first()
  await expect(stalled.getByRole('img', { name: '停滯，42%' })).toBeVisible()
  await expect(stalled).toContainText('卡在 42%，沒有來源')
  await expect(stalled).toContainText('42%')
  await expect(stalled).toContainText('mteam-X')
})

test('K8 已整理 expands by click and Enter, its header collapses it', async ({
  page,
}) => {
  await page.setViewportSize(DESKTOP)
  await login(page)
  const expand = page.getByRole('button', { name: '展開已整理欄，2 個' })
  await expect(expand).toHaveAttribute('aria-expanded', 'false')
  await expect(expand).toHaveAttribute('title', '完成時間新的在前')
  await expand.click()

  const archived = column(page, '已整理，2 個')
  await expect(archived).toBeVisible()
  await expect(cardsIn(archived)).toHaveCount(2)
  const collapse = page.getByRole('button', { name: '收合已整理欄，2 個' })
  await expect(collapse).toBeFocused()
  await expect(collapse).toHaveAttribute('aria-expanded', 'true')
  // Expanded: as wide as the other four.
  const widths = await board(page)
    .locator(':scope > section')
    .evaluateAll((sections) =>
      sections.map((section) => section.getBoundingClientRect().width),
    )
  expect(widths).toHaveLength(5)
  for (const width of widths) {
    expect(Math.abs(width - widths[0])).toBeLessThan(1)
  }
  await shot(page, 'board-archived-expanded-desktop-light')

  await collapse.click()
  await expect(expand).toBeFocused()
  await page.keyboard.press('Enter')
  await expect(collapse).toBeFocused()
  await page.keyboard.press('Enter')
  await expect(expand).toBeFocused()
})

test('K2 switching board and list starts at the top', async ({
  page,
  request,
}) => {
  await setModes(request, { data: 'many' })
  await page.setViewportSize(DESKTOP)
  await login(page)
  await page.goto('/?sort=added_on')
  await expect(
    page.getByRole('region', { name: /^種子列表，共 4165 個/ }),
  ).toBeVisible({
    timeout: POLL_WAIT,
  })
  // Story 2.4: the list scrolls itself; the board scrolls neither.
  const scrollMainTo = (top: number) =>
    page.evaluate(
      ([value, ids]) => {
        for (const id of ids) {
          const element = document.getElementById(id)
          if (element) element.scrollTop = value
        }
      },
      [top, [LIST_SCROLL_ID, MAIN_ID]] as const,
    )
  await scrollMainTo(600)
  expect(await mainScrollTop(page)).toBeGreaterThan(0)

  // List to board.
  await sortPill(page).click()
  const menu = page.getByRole('menu', { name: '排序' })
  await menu.getByRole('menuitemradio', { name: '狀態' }).click()
  await expect(board(page)).toBeVisible()
  await expect(sortPill(page)).toHaveAccessibleName('排序：狀態，看板')
  expect(await mainScrollTop(page)).toBe(0)
  await expect(page).toHaveURL(/[?&]sort=state/)

  // Board to list. The board never scrolls `main`; try anyway.
  await scrollMainTo(600)
  await sortPill(page).click()
  await menu.getByRole('menuitemradio', { name: '做種時間' }).click()
  await expect(board(page)).toHaveCount(0)
  await expect(page.getByRole('region', { name: /^種子列表/ })).toBeVisible()
  await expect(sortPill(page)).toHaveAccessibleName(
    '排序：做種時間，久的在前，列表',
  )
  expect(await mainScrollTop(page)).toBe(0)

  // And once more from a scrolled list.
  await scrollMainTo(600)
  expect(await mainScrollTop(page)).toBeGreaterThan(0)
  await sortPill(page).click()
  await menu.getByRole('menuitemradio', { name: '狀態' }).click()
  await expect(board(page)).toBeVisible()
  expect(await mainScrollTop(page)).toBe(0)
})

test('crossing 1024px switches between the desktop board and the phone tabs', async ({
  page,
}) => {
  await page.setViewportSize(DESKTOP)
  await login(page)
  const tablist = page.getByRole('tablist', { name: '狀態' })
  await expect(board(page)).toBeVisible()
  await expect(tablist).toHaveCount(0)
  await page.setViewportSize(PHONE)
  await expect(tablist).toBeVisible()
  await expect(board(page)).toHaveCount(0)
  await page.setViewportSize(DESKTOP)
  await expect(board(page)).toBeVisible()
  await expect(tablist).toHaveCount(0)
})

test('K6 only archived: 全部 0, the four columns say 沒有, 已整理 works', async ({
  page,
  request,
}) => {
  await setModes(request, { data: 'archived' })
  await page.setViewportSize(DESKTOP)
  await login(page)
  // The container picks up the new mode on its next pull.
  await expect(column(page, '下載中，0 個')).toBeVisible({ timeout: POLL_WAIT })
  await expect(
    page.getByRole('tab', { name: /^全部/ }).filter({ visible: true }),
  ).toHaveText(/^全部\s*0$/)
  for (const name of ['要處理', '下載中', '做種中', '完成']) {
    const section = column(page, `${name}，0 個`)
    await expect(section).toContainText('沒有')
    await expect(section).not.toContainText('都沒問題')
  }
  await page.getByRole('button', { name: '展開已整理欄，6 個' }).click()
  await expect(cardsIn(column(page, '已整理，6 個'))).toHaveCount(6)
})

test('K7 nothing to handle: 要處理 says 都沒問題', async ({
  page,
  request,
}) => {
  await setModes(request, { data: 'calm' })
  await page.setViewportSize(DESKTOP)
  await login(page)
  await expect(column(page, '完成，1 個')).toBeVisible({ timeout: POLL_WAIT })
  await expect(column(page, '要處理，0 個')).toContainText('都沒問題')
  await expect(column(page, '完成，1 個')).toContainText('下載好了')
})

test('K9 4165 torrents: each column keeps under 60 cards and scrolls itself', async ({
  page,
  request,
}) => {
  await setModes(request, { data: 'many' })
  await page.setViewportSize(DESKTOP)
  await login(page)
  await expect(column(page, /^做種中，[\d,]{5} 個$/)).toBeVisible({
    timeout: POLL_WAIT,
  })
  for (const name of [/^要處理/, /^下載中/, /^做種中/, /^完成/]) {
    expect(await cardsIn(column(page, name)).count()).toBeLessThan(
      MAX_CARDS_PER_COLUMN,
    )
  }
  const seeding = column(page, /^做種中/)
  const total = Number(
    await cardsIn(seeding).first().getAttribute('aria-setsize'),
  )
  expect(total).toBeGreaterThan(1000)
  // K3 in a real column: longest seeding first.
  const body = seeding.locator('[role="list"]').locator('xpath=..')
  await body.evaluate((element) => {
    element.scrollTop = element.scrollHeight
  })
  await expect
    .poll(() => cardsIn(seeding).last().getAttribute('aria-posinset'))
    .toBe(String(total))
  expect(await cardsIn(seeding).count()).toBeLessThan(MAX_CARDS_PER_COLUMN)
  expect(await mainScrollTop(page)).toBe(0)
  // The other columns stay at their top.
  await expect(cardsIn(column(page, /^下載中/)).first()).toHaveAttribute(
    'aria-posinset',
    '1',
  )
})

test('K10 the board is live while the mouse rests on it', async ({
  page,
  request,
}) => {
  await page.setViewportSize(DESKTOP)
  await login(page)
  const downloading = column(page, /^下載中/)
  await expect(downloading).toHaveAccessibleName('下載中，1 個')
  const box = await downloading.boundingBox()
  if (!box) throw new Error('no column')
  await page.mouse.move(box.x + box.width / 2, box.y + 80)
  // Each poll now adds a newer downloading torrent; nothing holds it back.
  await setModes(request, { grow: '1' })
  await waitForPolls(page, 2)
  await expect(downloading).not.toHaveAccessibleName('下載中，1 個')
  const first = await cardNames(downloading)
  expect(first[0]).toMatch(/^Fake\.New\./)
})

test('K11 first load: card skeletons, no spinner; then the board', async ({
  page,
}) => {
  await login(page)
  for (const scheme of SCHEMES) {
    await page.emulateMedia({ colorScheme: scheme })
    for (const [name, size] of [
      ['desktop', DESKTOP],
      ['phone', PHONE],
    ] as const) {
      await page.setViewportSize(size)
      // Hold the maindata answers (the session check goes through) until
      // the screenshot is taken.
      const held: Array<() => Promise<void>> = []
      await page.route('**/_serverFn/**', async (route) => {
        const response = await route.fetch()
        const body = await response.text()
        // A call from the page before the reload is gone already.
        const fulfill = () =>
          route.fulfill({ response, body }).catch(() => undefined)
        if (body.includes('serverState')) held.push(fulfill)
        else await fulfill()
      })
      await page.reload()
      const busy = page.locator(`#${MAIN_ID} [aria-busy="true"]`)
      await expect(busy).toBeVisible()
      await expect(page.getByText('載入中…')).toHaveCount(0)
      if (name === 'desktop') {
        await expect(
          page.getByRole('region', { name: '看板，載入中' }),
        ).toBeVisible()
      } else {
        await expect(
          page.getByRole('tab', { name: '要處理，載入中' }),
        ).toBeVisible()
        await hasNoHorizontalScroll(page)
      }
      await shot(page, `board-skeleton-${name}-${scheme}`)
      await page.unroute('**/_serverFn/**')
      for (const release of held) await release()
      await expect(busy).toHaveCount(0)
    }
  }
})

test('K12 K13 phone: status tabs, tap, keys and swipe change the column', async ({
  page,
}) => {
  await page.setViewportSize(PHONE)
  await login(page)
  await expect(sortPill(page)).toHaveAccessibleName('排序：狀態，看板')
  await expect(sortPill(page)).toHaveText('狀態')
  const tablist = page.getByRole('tablist', { name: '狀態' })
  const tabs = tablist.getByRole('tab')
  await expect(tabs).toHaveCount(4)
  expect(
    await tabs.evaluateAll((all) =>
      all.map((t) => t.getAttribute('aria-label')),
    ),
  ).toEqual(['要處理，2 個', '下載中，1 個', '做種中，1 個', '完成，0 個'])
  await expect(tabs.first()).toHaveAttribute('aria-selected', 'true')
  expect((await tabs.first().boundingBox())?.height).toBe(56)
  await hasNoHorizontalScroll(page)
  await hasNoHorizontalScroll(page, `#${MAIN_ID}`)

  const panel = (name: string) => page.getByRole('tabpanel', { name })
  await expect(panel('要處理')).toBeInViewport()

  await tabs.nth(2).click()
  await expect(tabs.nth(2)).toHaveAttribute('aria-selected', 'true')
  await settled(page)
  await expect(panel('做種中')).toBeInViewport({ ratio: 1 })
  await expect(panel('做種中')).toContainText('Fake.Show.S01E02.1080p')

  await tabs.nth(2).focus()
  await page.keyboard.press('ArrowRight')
  await expect(tabs.nth(3)).toBeFocused()
  await expect(tabs.nth(3)).toHaveAttribute('aria-selected', 'true')
  await settled(page)
  await expect(panel('完成')).toContainText('沒有')
  await page.keyboard.press('ArrowRight')
  await expect(tabs.nth(0)).toHaveAttribute('aria-selected', 'true')
  await page.keyboard.press('End')
  await expect(tabs.nth(3)).toHaveAttribute('aria-selected', 'true')
  await page.keyboard.press('Home')
  await expect(tabs.nth(0)).toHaveAttribute('aria-selected', 'true')
  await settled(page)
  await hasNoHorizontalScroll(page)
})

/** A finger drag through the DevTools protocol (Chromium's real touch path). */
async function touchDrag(
  page: Page,
  from: { x: number; y: number },
  by: { dx: number; dy: number },
) {
  const cdp = await page.context().newCDPSession(page)
  const steps = 12
  await cdp.send('Input.dispatchTouchEvent', {
    type: 'touchStart',
    touchPoints: [from],
  })
  for (let step = 1; step <= steps; step += 1) {
    await cdp.send('Input.dispatchTouchEvent', {
      type: 'touchMove',
      touchPoints: [
        {
          x: from.x + (by.dx * step) / steps,
          y: from.y + (by.dy * step) / steps,
        },
      ],
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

  test('K12 a sideways finger swipes columns; a vertical one only scrolls', async ({
    page,
    request,
  }) => {
    await setModes(request, { data: 'many' })
    await page.setViewportSize(PHONE)
    await login(page)
    const tabs = page.getByRole('tablist', { name: '狀態' }).getByRole('tab')
    await expect(
      page.getByRole('tab', { name: /^做種中，[\d,]{5} 個$/ }),
    ).toBeVisible({ timeout: POLL_WAIT })
    const swipe = page.locator('[data-slot="board-swipe"]')
    const box = await swipe.boundingBox()
    if (!box) throw new Error('no swipe area')
    const middle = { x: box.x + box.width / 2, y: box.y + box.height / 2 }

    await touchDrag(page, middle, { dx: -200, dy: 0 })
    await expect(tabs.nth(1)).toHaveAttribute('aria-selected', 'true')
    await settled(page)
    await expect(page.getByRole('tabpanel', { name: '下載中' })).toBeInViewport(
      { ratio: 1 },
    )

    // At the last column a swipe further left stretches and comes back.
    await tabs.nth(3).click()
    await settled(page)
    await touchDrag(page, middle, { dx: -200, dy: 0 })
    await settled(page)
    await expect(tabs.nth(3)).toHaveAttribute('aria-selected', 'true')

    await touchDrag(page, middle, { dx: 200, dy: 0 })
    await expect(tabs.nth(2)).toHaveAttribute('aria-selected', 'true')
    await settled(page)

    // Vertical: the 做種中 panel scrolls, the column stays.
    const seeding = page.getByRole('tabpanel', { name: '做種中' })
    const scrollTop = () => seeding.evaluate((element) => element.scrollTop)
    await touchDrag(
      page,
      { x: middle.x, y: box.y + box.height - 40 },
      { dx: 12, dy: -300 },
    )
    await expect.poll(scrollTop).toBeGreaterThan(0)
    await expect(tabs.nth(2)).toHaveAttribute('aria-selected', 'true')
    expect(await cardsIn(seeding).count()).toBeLessThan(MAX_CARDS_PER_COLUMN)
    await hasNoHorizontalScroll(page)
  })
})

test('K13 reduced motion: a tab change jumps without a transition', async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.setViewportSize(PHONE)
  await login(page)
  const tabs = page.getByRole('tablist', { name: '狀態' }).getByRole('tab')
  await tabs.nth(2).click()
  expect(await page.evaluate(() => document.getAnimations().length)).toBe(0)
  await expect(page.getByRole('tabpanel', { name: '做種中' })).toBeInViewport({
    ratio: 1,
  })
})

/** [file name, data mode, the 已整理 button (desktop), a tab (phone)]. */
const SCREENSHOT_MODES = [
  ['board', 'sample', '展開已整理欄，2 個', '要處理，2 個'],
  ['board-only-archived', 'archived', '展開已整理欄，6 個', '下載中，0 個'],
  ['board-calm', 'calm', '展開已整理欄，1 個', '要處理，0 個'],
  ['board-many', 'many', '展開已整理欄，50 個', /^做種中，[\d,]{5} 個$/],
] as const

test('board screenshots at 1440 and 390, light and dark', async ({
  page,
  request,
}) => {
  await login(page)
  for (const [name, data, archivedButton, phoneTab] of SCREENSHOT_MODES) {
    await setModes(request, { data })
    for (const scheme of SCHEMES) {
      await page.emulateMedia({ colorScheme: scheme })
      await page.setViewportSize(DESKTOP)
      await page.goto('/')
      // The container picks up the new mode on its next pull.
      await expect(
        page.getByRole('button', { name: archivedButton }),
      ).toBeVisible({ timeout: POLL_WAIT })
      await shot(page, `${name}-desktop-${scheme}`)
      if (data === 'sample' && scheme === 'dark') {
        await page.getByRole('button', { name: /^展開已整理欄/ }).click()
        await shot(page, 'board-archived-expanded-desktop-dark')
      }

      await page.setViewportSize(PHONE)
      await page.goto('/')
      const tabs = page.getByRole('tablist', { name: '狀態' }).getByRole('tab')
      await expect(page.getByRole('tab', { name: phoneTab })).toBeVisible({
        timeout: POLL_WAIT,
      })
      await hasNoHorizontalScroll(page)
      await hasNoHorizontalScroll(page, `#${MAIN_ID}`)
      await shot(page, `${name}-phone-${scheme}`)
      if (data === 'sample') {
        // The empty 完成 column on the phone.
        await tabs.nth(3).click()
        await settled(page)
        await shot(page, `board-empty-column-phone-${scheme}`)
      }
    }
  }
})
