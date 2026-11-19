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

const SCREENSHOT_DIR = '_bmad-output/implementation-artifacts/screenshots/4-1'
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

test('below 1024px: no checkbox and no selection bar', async ({ page }) => {
  await page.setViewportSize(PHONE)
  await login(page)
  await expect(page.getByRole('listitem').first()).toBeVisible()
  await expect(page.locator('button[role="checkbox"]')).toHaveCount(0)
  await openList(page)
  await expect(page.locator('button[role="checkbox"]')).toHaveCount(0)
  await expect(bar(page)).toHaveCount(0)
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
