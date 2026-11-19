import type { Locator, Page } from '@playwright/test'
import {
  DEFAULT_MODES,
  LIST_SCROLL_ID,
  expect,
  login,
  openList,
  setModes,
  test,
} from './fixtures'

// Story 4.1: desktop checkboxes and the selection bar, in Chromium against
// the built server and scripts/fake-qbit.mjs (fake data only, AD-15;
// nothing here sends an operation that succeeds). Sample data: every
// torrent is 4 GB; E01 to E03 normal, E04 private missingFiles (找不到檔案),
// E05 and E06 non-private missingFiles (已整理, only in the board's
// expanded 已整理 column). Screenshots for the PR, 1440px, light and dark:
// the hover checkbox, three ticked in the list and on the board, the bar
// with a failure toast, and the 已整理 / 找不到檔案 total.
// Story 4.2: phone selection mode with a touch screen at 390x844 (fingers
// through the DevTools protocol, Chromium's real touch path): a long press
// enters it, a drag only scrolls, a tap toggles, the last untick or 取消
// leaves it, the board's swipe keeps it, nothing scrolls sideways, and a
// desktop selection survives the crossing. Screenshots at 390px, light and
// dark: the list and the board while selecting.

const SCREENSHOT_DIR = '_bmad-output/implementation-artifacts/screenshots/4-1'
const PHONE_SCREENSHOT_DIR =
  '_bmad-output/implementation-artifacts/screenshots/4-2'
const DESKTOP = { width: 1440, height: 900 }
const PHONE = { width: 390, height: 844 }
const SCHEMES = ['light', 'dark'] as const
const POLL_WAIT = 30_000
const hashOf = (n: number) => n.toString(16).padStart(40, '0')
const nameOf = (n: number) => `Fake.Show.S01E0${n}.1080p`

test.beforeEach(async ({ request }) => {
  await setModes(request, DEFAULT_MODES)
})

test.afterEach(async ({ request }) => {
  await setModes(request, DEFAULT_MODES)
})

const bar = (page: Page) => page.locator('[data-selection-bar]')
const checkbox = (page: Page, n: number) =>
  page.getByRole('checkbox', { name: `選取 ${nameOf(n)}`, exact: true })
const item = (page: Page, n: number) =>
  page.locator(`[role="listitem"][data-hash="${hashOf(n)}"]`)
const rowButton = (page: Page, n: number) =>
  item(page, n).locator('button[aria-current]')
const panel = (page: Page) => page.getByRole('complementary', { name: '詳情' })
/**
 * Ticks row or card `n` the way a mouse does: over the row first (a hidden
 * checkbox takes no pointer events until its row is hovered), then the box.
 */
async function tick(page: Page, n: number) {
  await item(page, n).hover()
  await checkbox(page, n).click()
}
const toastCard = (page: Page) => page.locator('[data-slot="toast"]')

/** Waits until no animation or transition runs. */
async function settled(page: Page) {
  await page.waitForFunction(() =>
    document
      .getAnimations()
      .every((animation) => animation.playState !== 'running'),
  )
}

async function expectShown(box: Locator, shown: boolean) {
  await expect(box).toHaveCSS('opacity', shown ? '1' : '0')
}

async function expectBarShown(page: Page) {
  await expect(bar(page)).not.toHaveAttribute('inert', '')
  await settled(page)
  const box = await bar(page).boundingBox()
  expect(Math.round((box?.y ?? 0) + (box?.height ?? 0))).toBe(
    DESKTOP.height - 24,
  )
  expect(Math.round(box?.height ?? 0)).toBe(52)
}

async function expectBarHidden(page: Page) {
  await expect(bar(page)).toHaveAttribute('inert', '')
  await settled(page)
  const box = await bar(page).boundingBox()
  expect(box?.y ?? 0).toBeGreaterThanOrEqual(DESKTOP.height)
}

/** The board's 已整理 strip, expanded. */
async function expandArchived(page: Page) {
  await page.getByRole('button', { name: /^展開已整理欄/ }).click()
  await expect(checkbox(page, 5)).toBeAttached()
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

test('list: hover shows one checkbox; ticking 3 shows the bar and the total without 找不到檔案; the row body still opens the detail', async ({
  page,
}) => {
  await page.setViewportSize(DESKTOP)
  await login(page)
  await openList(page)
  await expectBarHidden(page)

  await page.mouse.move(0, 0)
  await expectShown(checkbox(page, 1), false)
  await rowButton(page, 2).hover()
  await expectShown(checkbox(page, 2), true)
  await expectShown(checkbox(page, 1), false)
  // No row shifts: the name starts where it did.
  const before = await rowButton(page, 2).locator('[title]').boundingBox()

  await tick(page, 2)
  await tick(page, 1)
  await tick(page, 4)
  expect(await rowButton(page, 2).locator('[title]').boundingBox()).toEqual(
    before,
  )
  // After the first tick every row shows its checkbox.
  await page.mouse.move(0, 0)
  await expectShown(checkbox(page, 3), true)
  await expect(checkbox(page, 2)).toHaveAttribute('aria-checked', 'true')
  await expect(bar(page)).toHaveAccessibleName('選取的種子')
  // E04 is 找不到檔案: counted, its 4 GB not.
  await expect(bar(page)).toContainText('已選 3 個')
  await expect(bar(page)).toContainText('共 8 GB')
  await expect(bar(page).getByRole('button', { name: '改路徑' })).toBeDisabled()
  await expect(
    bar(page).getByRole('button', { name: '刪除（含檔案）' }),
  ).toBeDisabled()
  await expectBarShown(page)
  // A ticked row: the selection-row background (hover does not change it).
  const ticked = await rowButton(page, 2).evaluate(
    (element) => getComputedStyle(element).backgroundColor,
  )
  await rowButton(page, 2).hover()
  expect(
    await rowButton(page, 2).evaluate(
      (element) => getComputedStyle(element).backgroundColor,
    ),
  ).toBe(ticked)

  // The checkbox only toggles; the rest of the row opens the detail.
  await expect(page).not.toHaveURL(/[?&]hash=/)
  await rowButton(page, 3).click()
  await expect(page).toHaveURL(new RegExp(`[?&]hash=${hashOf(3)}`))
  await expect(panel(page)).toBeVisible()
  await expect(bar(page)).toContainText('已選 3 個')

  // Untick to none: every checkbox hides again, the bar slides out.
  for (const n of [2, 1, 4]) await tick(page, n)
  await page.mouse.move(0, 0)
  await expectShown(checkbox(page, 3), false)
  await expectBarHidden(page)
})

test('keyboard: Tab reaches a row checkbox before its row, Space ticks it', async ({
  page,
}) => {
  await page.setViewportSize(DESKTOP)
  await login(page)
  await openList(page)
  await checkbox(page, 3).focus()
  await expectShown(checkbox(page, 3), true)
  await expectShown(checkbox(page, 2), false)
  await page.keyboard.press('Space')
  await expect(checkbox(page, 3)).toHaveAttribute('aria-checked', 'true')
  await page.keyboard.press('Tab')
  await expect(rowButton(page, 3)).toBeFocused()
  await expect(page).not.toHaveURL(/[?&]hash=/)
})

test('board: the card checkbox, 已整理 cards too; ticking 已整理 adds nothing to the size', async ({
  page,
}) => {
  await page.setViewportSize(DESKTOP)
  await login(page)
  await page.mouse.move(0, 0)
  await expectShown(checkbox(page, 1), false)
  await item(page, 1).locator('button[data-entrance]').hover()
  await expectShown(checkbox(page, 1), true)
  // 6px out of the card's top-left corner, not clipped.
  const card = await item(page, 1).boundingBox()
  const box = await checkbox(page, 1).boundingBox()
  expect(Math.round((box?.x ?? 0) - (card?.x ?? 0))).toBe(-6)
  expect(Math.round((box?.y ?? 0) - (card?.y ?? 0))).toBe(-6)
  const hit = await checkbox(page, 1).evaluate((element) => {
    const rect = element.getBoundingClientRect()
    const top = document.elementFromPoint(rect.left + 2, rect.top + 2)
    return top === element || element.contains(top)
  })
  expect(hit).toBe(true)

  await expandArchived(page)
  await tick(page, 1)
  await tick(page, 5)
  await tick(page, 6)
  await expect(bar(page)).toContainText('已選 3 個')
  await expect(bar(page)).toContainText('共 4 GB')
  await expectShown(checkbox(page, 2), true)

  await bar(page).getByRole('button', { name: '取消' }).click()
  await expectBarHidden(page)
  await expect(checkbox(page, 1)).toHaveAttribute('aria-checked', 'false')
})

test('a category change clears the selection; a settings round trip keeps it', async ({
  page,
}) => {
  await page.setViewportSize(DESKTOP)
  await login(page)
  await openList(page)
  await tick(page, 1)
  await expect(bar(page)).toContainText('已選 1 個')

  await page.getByRole('button', { name: '設定', exact: true }).click()
  await expect(page).toHaveURL(/\/settings/)
  await page.goBack()
  await expect(checkbox(page, 1)).toHaveAttribute('aria-checked', 'true')
  await expect(bar(page)).toContainText('已選 1 個')

  // A digit switches the category (story 3.7).
  await page.keyboard.press('2')
  await expect(page).toHaveURL(/[?&]category=/)
  await expectBarHidden(page)
  await page.keyboard.press('1')
  await expect(page).not.toHaveURL(/[?&]category=/)
  await expect(checkbox(page, 1)).toHaveAttribute('aria-checked', 'false')
})

test('a selection holds the list order through polls; clearing it reorders once', async ({
  page,
  request,
}) => {
  await page.setViewportSize(DESKTOP)
  await login(page)
  await openList(page)
  const setSize = () =>
    page.getByRole('listitem').first().getAttribute('aria-setsize')
  const before = await setSize()
  await tick(page, 1)
  // The mouse leaves the list, so only the selection holds it.
  await page.mouse.move(DESKTOP.width - 5, DESKTOP.height - 5)
  await setModes(request, { grow: '1' })
  await waitForPolls(page, 2)
  expect(await setSize()).toBe(before)
  await bar(page).getByRole('button', { name: '取消' }).click()
  await expect.poll(setSize).not.toBe(before)
})

test('with the bar visible the last row scrolls fully above it', async ({
  page,
  request,
}) => {
  await setModes(request, { data: 'many' })
  await page.setViewportSize(DESKTOP)
  await login(page)
  await openList(page)
  const first = page.locator('[role="listitem"]').first()
  await first.hover()
  await first.getByRole('checkbox').click()
  await expectBarShown(page)
  const scroller = page.locator(`#${LIST_SCROLL_ID}`)
  await scroller.evaluate((element) => {
    element.scrollTop = element.scrollHeight
  })
  const total = await page
    .getByRole('listitem')
    .first()
    .getAttribute('aria-setsize')
  const last = page.locator(`[role="listitem"][aria-posinset="${total}"]`)
  await expect(last).toBeVisible()
  const barBox = await bar(page).boundingBox()
  const lastBox = await last.boundingBox()
  expect((lastBox?.y ?? 0) + (lastBox?.height ?? 0)).toBeLessThanOrEqual(
    barBox?.y ?? 0,
  )
})

test('a failure toast with a selection sits 16px above the bar', async ({
  page,
  request,
}) => {
  await setModes(request, { ops: 'reject' })
  await page.setViewportSize(DESKTOP)
  await login(page)
  await openList(page)
  await tick(page, 2)
  await rowButton(page, 1).click()
  await expect(panel(page)).toBeVisible()
  await page.getByRole('button', { name: '更多動作' }).click()
  await page.getByRole('menuitem', { name: '暫停' }).click()
  await expect(toastCard(page)).toBeVisible()
  await settled(page)
  const toastBox = await toastCard(page).boundingBox()
  expect(Math.round((toastBox?.y ?? 0) + (toastBox?.height ?? 0))).toBe(
    DESKTOP.height - 24 - 52 - 16,
  )
  await bar(page).getByRole('button', { name: '取消' }).click()
  await settled(page)
  const lowered = await toastCard(page).boundingBox()
  expect(Math.round((lowered?.y ?? 0) + (lowered?.height ?? 0))).toBe(
    DESKTOP.height - 24,
  )
})

test('reduced motion: the bar and the toast move without a transition', async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.setViewportSize(DESKTOP)
  await login(page)
  await openList(page)
  expect(
    await bar(page).evaluate(
      (element) => getComputedStyle(element).transitionProperty,
    ),
  ).toBe('none')
  expect(
    await page
      .locator('[data-toast-region]')
      .evaluate((element) => getComputedStyle(element).transitionProperty),
  ).toBe('none')
  await tick(page, 1)
  expect(await page.evaluate(() => document.getAnimations().length)).toBe(0)
  const box = await bar(page).boundingBox()
  expect(Math.round((box?.y ?? 0) + (box?.height ?? 0))).toBe(
    DESKTOP.height - 24,
  )
})

test('crossing from desktop to phone keeps the selection: phone checkboxes and bar at once, rows already shifted, nothing slides', async ({
  page,
}) => {
  await page.setViewportSize(DESKTOP)
  await login(page)
  await openList(page)
  await tick(page, 1)
  await tick(page, 2)
  await expectBarShown(page)
  await page.setViewportSize(PHONE)
  await expect(phoneRow(page, 1)).toHaveCSS('padding-left', '38px')
  await expect(checkbox(page, 1)).toHaveAttribute('aria-checked', 'true')
  await expect(checkbox(page, 2)).toHaveAttribute('aria-checked', 'true')
  await expect(checkbox(page, 3)).toHaveAttribute('aria-checked', 'false')
  await expect(checkbox(page, 3)).toBeVisible()
  await expect(bar(page)).toContainText('已選 2 個')
  // Nothing on the rows or the bar animates at the crossing.
  expect(
    await page.evaluate(() =>
      [
        ...document.querySelectorAll(
          '[data-selection-bar], [role="listitem"] *',
        ),
      ].reduce((count, element) => count + element.getAnimations().length, 0),
    ),
  ).toBe(0)
  await expectPhoneBarShown(page)
  await hasNoHorizontalScroll(page)
  await page.setViewportSize(DESKTOP)
  // The desktop pill again (the width change reaches React a moment later).
  await expect(bar(page)).toHaveClass(/rounded-full/)
  await expect(bar(page)).toContainText('已選 2 個')
  await expectBarShown(page)
})

/** Row `n`'s button (the row box; its padding makes the checkbox room). */
const phoneRow = (page: Page, n: number) => rowButton(page, n)
const anySheet = (page: Page) => page.getByRole('dialog')

async function hasNoHorizontalScroll(page: Page) {
  for (const selector of [':root', `#${LIST_SCROLL_ID}`]) {
    const element = page.locator(selector)
    if ((await element.count()) === 0) continue
    const { scrollWidth, clientWidth } = await element.evaluate((each) => ({
      scrollWidth: each.scrollWidth,
      clientWidth: each.clientWidth,
    }))
    expect(scrollWidth, selector).toBeLessThanOrEqual(clientWidth)
  }
}

/** The phone bar: 16px from the sides and the bottom, two rows. */
async function expectPhoneBarShown(page: Page) {
  await expect(bar(page)).not.toHaveAttribute('inert', '')
  await settled(page)
  const box = await bar(page).boundingBox()
  expect(Math.round(box?.x ?? 0)).toBe(16)
  expect(Math.round(box?.width ?? 0)).toBe(PHONE.width - 32)
  expect(Math.round((box?.y ?? 0) + (box?.height ?? 0))).toBe(PHONE.height - 16)
  for (const name of ['取消', '改路徑', '刪除（含檔案）']) {
    const button = await bar(page)
      .getByRole('button', { name, exact: true })
      .boundingBox()
    expect(Math.round(button?.height ?? 0), name).toBe(44)
  }
}

async function expectPhoneBarHidden(page: Page) {
  await expect(bar(page)).toHaveAttribute('inert', '')
  await settled(page)
  const box = await bar(page).boundingBox()
  expect(box?.y ?? 0).toBeGreaterThanOrEqual(PHONE.height)
}

/** A finger held still on `target` for `ms`, then lifted (DevTools protocol). */
async function longPress(page: Page, target: Locator, ms = 650) {
  const box = await target.boundingBox()
  if (!box) throw new Error('nothing to press')
  const point = { x: box.x + box.width / 2, y: box.y + box.height / 2 }
  const cdp = await page.context().newCDPSession(page)
  await cdp.send('Input.dispatchTouchEvent', {
    type: 'touchStart',
    touchPoints: [point],
  })
  await page.waitForTimeout(ms)
  await cdp.send('Input.dispatchTouchEvent', {
    type: 'touchEnd',
    touchPoints: [],
  })
  await cdp.detach()
}

/**
 * A finger drag of `dx`, `dy` from the middle of `target`, quickly. With
 * `holdMs` the finger rests that long at the end before lifting, so the
 * release has no speed. The 12 protocol moves arrive within a few ms, a
 * flick no finger makes: Chromium (Linux) then starts a fling and takes
 * the next quick tap as "stop the fling", sending no `click` at all.
 */
async function touchDrag(
  page: Page,
  target: Locator,
  { dx, dy, holdMs = 0 }: { dx: number; dy: number; holdMs?: number },
) {
  const box = await target.boundingBox()
  if (!box) throw new Error('nothing to drag')
  const from = { x: box.x + box.width / 2, y: box.y + box.height / 2 }
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
        { x: from.x + (dx * step) / steps, y: from.y + (dy * step) / steps },
      ],
    })
  }
  if (holdMs > 0) {
    await page.waitForTimeout(holdMs)
    await cdp.send('Input.dispatchTouchEvent', {
      type: 'touchMove',
      touchPoints: [{ x: from.x + dx, y: from.y + dy }],
    })
  }
  await cdp.send('Input.dispatchTouchEvent', {
    type: 'touchEnd',
    touchPoints: [],
  })
  await cdp.detach()
}

test.describe('phone selection mode (story 4.2)', () => {
  test.use({ hasTouch: true })

  test('list: no checkbox until a long press; it ticks the row, slides the rows 28px and the bar up, opens no sheet; a tap toggles; the last untick leaves', async ({
    page,
  }) => {
    await page.setViewportSize(PHONE)
    await login(page)
    await openList(page)
    await expect(page.locator('button[role="checkbox"]')).toHaveCount(0)
    await expectPhoneBarHidden(page)
    const name = rowButton(page, 2).locator('[title]')
    const before = await name.boundingBox()

    await longPress(page, rowButton(page, 2))
    await expect(checkbox(page, 2)).toHaveAttribute('aria-checked', 'true')
    await expect(bar(page)).toContainText('已選 1 個')
    await expectPhoneBarShown(page)
    await expect(anySheet(page)).toHaveCount(0)
    await expect(page).not.toHaveURL(/[?&]hash=/)
    // Every row shows its checkbox and makes 28px of room for it.
    await expect(checkbox(page, 1)).toBeVisible()
    expect(
      Math.round(((await name.boundingBox())?.x ?? 0) - (before?.x ?? 0)),
    ).toBe(28)
    const row = await item(page, 2).boundingBox()
    const box = await checkbox(page, 2).boundingBox()
    expect(Math.round((box?.x ?? 0) - (row?.x ?? 0))).toBe(10)
    await hasNoHorizontalScroll(page)

    await rowButton(page, 1).tap()
    await expect(bar(page)).toContainText('已選 2 個')
    await expect(checkbox(page, 1)).toHaveAttribute('aria-checked', 'true')
    await expect(anySheet(page)).toHaveCount(0)
    await rowButton(page, 1).tap()
    await expect(bar(page)).toContainText('已選 1 個')

    // Unticking the last: the mode ends, rows shift back, the bar goes.
    await rowButton(page, 2).tap()
    await expectPhoneBarHidden(page)
    await expect(page.locator('button[role="checkbox"]')).toHaveCount(0)
    expect(await name.boundingBox()).toEqual(before)
    await expect(anySheet(page)).toHaveCount(0)
    await hasNoHorizontalScroll(page)

    // Out of the mode a tap opens the sheet again.
    await rowButton(page, 3).tap()
    await expect(anySheet(page)).toBeVisible()
  })

  test('list: a finger dragging more than 10px within 500 ms only scrolls; no callout styles missing', async ({
    page,
    request,
  }) => {
    await setModes(request, { data: 'many' })
    await page.setViewportSize(PHONE)
    await login(page)
    await openList(page)
    const first = page.getByRole('listitem').nth(2)
    await expect(first).toHaveCSS('user-select', 'none')
    // Only iOS Safari knows the property (Chromium drops it), so check the
    // class that sets it.
    await expect(first).toHaveClass(/\[-webkit-touch-callout:none\]/)
    const scroller = page.locator(`#${LIST_SCROLL_ID}`)
    await touchDrag(page, first, { dx: 0, dy: -250 })
    await page.waitForTimeout(700)
    await expect
      .poll(() => scroller.evaluate((element) => element.scrollTop))
      .toBeGreaterThan(0)
    await expect(page.locator('button[role="checkbox"]')).toHaveCount(0)
    await expect(bar(page)).toHaveAttribute('inert', '')
    await expect(anySheet(page)).toHaveCount(0)
  })

  test('list: 取消 leaves the mode; a sheet covers the bar and keeps the selection; the last row clears the bar', async ({
    page,
  }) => {
    await page.setViewportSize(PHONE)
    await login(page)
    await openList(page)
    await longPress(page, rowButton(page, 1))
    await expectPhoneBarShown(page)

    // The sort sheet sits over the bar; closing it changes nothing.
    await page
      .getByRole('button', { name: /^排序：.*，(列表|看板)$/ })
      .filter({ visible: true })
      .click()
    const sheet = page.getByRole('dialog', { name: '排序' })
    await expect(sheet).toBeVisible()
    await settled(page)
    const barBox = await bar(page).boundingBox()
    const covered = await page.evaluate(
      ({ x, y }) =>
        document.elementFromPoint(x, y)?.closest('[role="dialog"]') !== null,
      {
        x: (barBox?.x ?? 0) + (barBox?.width ?? 0) / 2,
        y: (barBox?.y ?? 0) + (barBox?.height ?? 0) / 2,
      },
    )
    expect(covered).toBe(true)
    await page.keyboard.press('Escape')
    await expect(sheet).toHaveCount(0)
    await expect(bar(page)).toContainText('已選 1 個')
    await expect(checkbox(page, 1)).toHaveAttribute('aria-checked', 'true')

    // The last row scrolls fully above the bar.
    const scroller = page.locator(`#${LIST_SCROLL_ID}`)
    await scroller.evaluate((element) => {
      element.scrollTop = element.scrollHeight
    })
    await settled(page)
    const lastBox = await page.getByRole('listitem').last().boundingBox()
    const shown = await bar(page).boundingBox()
    expect((lastBox?.y ?? 0) + (lastBox?.height ?? 0)).toBeLessThanOrEqual(
      shown?.y ?? 0,
    )

    await bar(page).getByRole('button', { name: '取消' }).tap()
    await expectPhoneBarHidden(page)
    await expect(page.locator('button[role="checkbox"]')).toHaveCount(0)
    await hasNoHorizontalScroll(page)
  })

  test('board: a long press on a card ticks it; a swipe to the next tab keeps the selection; a tap there toggles', async ({
    page,
  }) => {
    await page.setViewportSize(PHONE)
    await login(page)
    const tabs = page.getByRole('tablist', { name: '狀態' }).getByRole('tab')
    const card = (n: number) => item(page, n).locator('button[data-entrance]')
    await expect(card(3)).toBeVisible()
    await expect(page.locator('button[role="checkbox"]')).toHaveCount(0)

    await longPress(page, card(3))
    await expect(checkbox(page, 3)).toHaveAttribute('aria-checked', 'true')
    await expect(bar(page)).toContainText('已選 1 個')
    await expectPhoneBarShown(page)
    await expect(anySheet(page)).toHaveCount(0)
    // The corner checkbox is not clipped by the panel.
    const hit = await checkbox(page, 4).evaluate((element) => {
      const rect = element.getBoundingClientRect()
      const top = document.elementFromPoint(rect.left + 2, rect.top + 2)
      return top === element || element.contains(top)
    })
    expect(hit).toBe(true)

    // Released at rest: the tap below must not land in a fling.
    await touchDrag(page, page.locator('[data-slot="board-swipe"]'), {
      dx: -200,
      dy: 0,
      holdMs: 300,
    })
    await expect(tabs.nth(1)).toHaveAttribute('aria-selected', 'true')
    await settled(page)
    await expect(bar(page)).toContainText('已選 1 個')
    await expect(checkbox(page, 1)).toHaveAttribute('aria-checked', 'false')
    await card(1).tap()
    await expect(bar(page)).toContainText('已選 2 個')
    await expect(anySheet(page)).toHaveCount(0)
    await hasNoHorizontalScroll(page)
  })

  test('reduced motion: entering and leaving the mode plays no shift and no slide', async ({
    page,
  }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' })
    await page.setViewportSize(PHONE)
    await login(page)
    await openList(page)
    expect(
      await bar(page).evaluate(
        (element) => getComputedStyle(element).transitionProperty,
      ),
    ).toBe('none')
    await longPress(page, rowButton(page, 2))
    await expect(checkbox(page, 2)).toHaveAttribute('aria-checked', 'true')
    expect(await page.evaluate(() => document.getAnimations().length)).toBe(0)
    const box = await bar(page).boundingBox()
    expect(Math.round((box?.y ?? 0) + (box?.height ?? 0))).toBe(
      PHONE.height - 16,
    )
    await rowButton(page, 2).tap()
    await expect(bar(page)).toHaveAttribute('inert', '')
    expect(await page.evaluate(() => document.getAnimations().length)).toBe(0)
    await expect(page.locator('button[role="checkbox"]:visible')).toHaveCount(0)
  })

  test('screenshots: the list and the board while selecting at 390px; light and dark', async ({
    page,
  }) => {
    await page.setViewportSize(PHONE)
    await login(page)
    const shot = (name: string) =>
      page.screenshot({
        path: `${PHONE_SCREENSHOT_DIR}/${name}.png`,
        animations: 'disabled',
      })
    for (const scheme of SCHEMES) {
      await page.emulateMedia({ colorScheme: scheme })

      await openList(page)
      await longPress(page, rowButton(page, 2))
      await rowButton(page, 1).tap()
      await expect(bar(page)).toContainText('已選 2 個')
      await expectPhoneBarShown(page)
      await shot(`list-selecting-${scheme}`)
      await bar(page).getByRole('button', { name: '取消' }).tap()
      await expectPhoneBarHidden(page)

      await page.goto('/')
      const card = item(page, 3).locator('button[data-entrance]')
      await expect(card).toBeVisible()
      await longPress(page, card)
      await expect(bar(page)).toContainText('已選 1 個')
      await expectPhoneBarShown(page)
      await shot(`board-selecting-${scheme}`)
      await bar(page).getByRole('button', { name: '取消' }).tap()
      await expectPhoneBarHidden(page)
    }
  })
})

test('screenshots: hover checkbox, 3 ticked in list and board, bar with toast, the 已整理 / 找不到檔案 total; light and dark', async ({
  page,
  request,
}) => {
  await page.setViewportSize(DESKTOP)
  await login(page)
  const shot = (name: string) =>
    page.screenshot({
      path: `${SCREENSHOT_DIR}/${name}.png`,
      animations: 'disabled',
    })
  for (const scheme of SCHEMES) {
    await page.emulateMedia({ colorScheme: scheme })

    await openList(page)
    await rowButton(page, 2).hover()
    await expectShown(checkbox(page, 2), true)
    await settled(page)
    await shot(`hover-checkbox-list-${scheme}`)

    await tick(page, 2)
    await tick(page, 1)
    await tick(page, 3)
    await page.mouse.move(0, 0)
    await expectBarShown(page)
    await shot(`list-3-ticked-${scheme}`)
    await bar(page).getByRole('button', { name: '取消' }).click()
    await expectBarHidden(page)

    await page.goto('/')
    await expect(item(page, 1)).toBeVisible()
    await expandArchived(page)
    await tick(page, 1)
    await tick(page, 2)
    await tick(page, 3)
    await page.mouse.move(0, 0)
    await expectBarShown(page)
    await shot(`board-3-ticked-${scheme}`)
    await bar(page).getByRole('button', { name: '取消' }).click()

    // 已整理 (E05, E06) and 找不到檔案 (E04) count, their size does not.
    await tick(page, 4)
    await tick(page, 5)
    await tick(page, 6)
    await page.mouse.move(0, 0)
    await expect(bar(page)).toContainText('已選 3 個')
    await expect(bar(page)).toContainText('共 0 B')
    await expectBarShown(page)
    await shot(`board-missing-total-${scheme}`)
    await bar(page).getByRole('button', { name: '取消' }).click()

    await setModes(request, { ops: 'reject' })
    await openList(page)
    await tick(page, 2)
    await rowButton(page, 1).click()
    await page.getByRole('button', { name: '更多動作' }).click()
    await page.getByRole('menuitem', { name: '暫停' }).click()
    await expect(toastCard(page)).toBeVisible()
    await page.mouse.move(0, 0)
    await settled(page)
    await shot(`bar-with-toast-${scheme}`)
    await toastCard(page).getByRole('button', { name: '關閉' }).click()
    await bar(page).getByRole('button', { name: '取消' }).click()
    await setModes(request, { ops: 'normal' })
  }
})
