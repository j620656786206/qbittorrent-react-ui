import type { Locator, Page } from '@playwright/test'
import {
  DEFAULT_MODES,
  expect,
  login,
  opCalls,
  openList,
  removeElsewhere,
  setModes,
  test,
} from './fixtures'

// Story 4.3: the delete confirmation and the delete, in Chromium against
// the built server and scripts/fake-qbit.mjs (fake data only, AD-15: the
// fake logs each torrents/delete call and drops those torrents from later
// maindata). Sample data: every torrent is 4 GB; E01 to E03 normal, E04
// private missingFiles (找不到檔案), E05 and E06 non-private missingFiles
// (已整理, only in the board's expanded 已整理 column). Desktop at 1440px,
// phone at 390x844 with a touch screen. Screenshots for the PR in
// screenshots/4-3, desktop and phone, light and dark: 3 rows, expanded,
// with 找不到檔案, files unticked, 刪除中, 還在等 NAS 回應 and the failure
// toast.

const SCREENSHOT_DIR = '_bmad-output/implementation-artifacts/screenshots/4-3'
const DESKTOP = { width: 1440, height: 900 }
const PHONE = { width: 390, height: 844 }
const SCHEMES = ['light', 'dark'] as const
const hashOf = (n: number) => n.toString(16).padStart(40, '0')
const nameOf = (n: number) => `Fake.Show.S01E0${n}.1080p`
const FAILURE = '刪除失敗：qBittorrent 拒絕這個操作'
const WAITING = '還在等 NAS 回應'
/** fake-qbit's `ops=slow` delay, and a margin. */
const SLOW_OP_MS = 12_000

test.beforeEach(async ({ request }) => {
  await setModes(request, { ...DEFAULT_MODES })
})

test.afterEach(async ({ request }) => {
  await setModes(request, DEFAULT_MODES)
})

const bar = (page: Page) => page.locator('[data-selection-bar]')
const barDelete = (page: Page) =>
  bar(page).getByRole('button', { name: '刪除（含檔案）', exact: true })
const confirm = (page: Page) => page.getByRole('alertdialog')
const confirmRows = (page: Page) => confirm(page).locator('[data-delete-row]')
const primary = (page: Page) =>
  confirm(page)
    .getByRole('button')
    .filter({ hasText: /刪除|只刪/ })
    .last()
const filesBox = (page: Page) =>
  confirm(page).getByRole('checkbox', { name: '連檔案一起刪' })
const checkbox = (page: Page, n: number) =>
  page.getByRole('checkbox', { name: `選取 ${nameOf(n)}`, exact: true })
const item = (page: Page, n: number) =>
  page.locator(`[role="listitem"][data-hash="${hashOf(n)}"]`)
const rowButton = (page: Page, n: number) =>
  item(page, n).locator('button[aria-current]')
const toastCard = (page: Page) => page.locator('[data-slot="toast"]')

/** Ticks row or card `n` with the mouse: over the row first, then the box. */
async function tick(page: Page, n: number) {
  await item(page, n).hover()
  await checkbox(page, n).click()
}

/** Waits until no animation or transition runs. */
async function settled(page: Page) {
  await page.waitForFunction(() =>
    document
      .getAnimations()
      .every((animation) => animation.playState !== 'running'),
  )
}

async function openConfirm(page: Page) {
  await barDelete(page).click()
  await expect(confirm(page)).toBeVisible()
  await settled(page)
}

async function rowTexts(page: Page) {
  return confirmRows(page).evaluateAll((rows) =>
    rows.map((row) => [...row.children].map((child) => child.textContent)),
  )
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

/** A slow finger drag of `dy` from the middle of `target` (no fling). */
async function touchDrag(page: Page, target: Locator, dy: number) {
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
      touchPoints: [{ x: from.x, y: from.y + (dy * step) / steps }],
    })
  }
  await page.waitForTimeout(300)
  await cdp.send('Input.dispatchTouchEvent', {
    type: 'touchMove',
    touchPoints: [{ x: from.x, y: from.y + dy }],
  })
  await cdp.send('Input.dispatchTouchEvent', {
    type: 'touchEnd',
    touchPoints: [],
  })
  await cdp.detach()
}

/**
 * Ticks the first `count` list rows: the first by hand (a hover and a click
 * on desktop, a long press on phone), the rest by clicking their checkboxes
 * as they scroll in (every row shows one once anything is selected).
 */
async function tickFirst(page: Page, desktop: boolean, count: number) {
  const first = page.getByRole('listitem').first()
  if (desktop) {
    await first.hover()
    await first.getByRole('checkbox').click()
    await page.mouse.move(0, 0)
  } else {
    await longPress(page, first.locator('button[aria-current]'))
  }
  await expect(bar(page)).toContainText('已選 1 個')
  await page.evaluate(async (want) => {
    const scroller = document.getElementById('rt-list-scroll') as HTMLElement
    let total = 1
    while (total < want) {
      for (const box of document.querySelectorAll<HTMLButtonElement>(
        '[role="listitem"] button[role="checkbox"][aria-checked="false"]',
      )) {
        if (total >= want) break
        box.click()
        total += 1
      }
      scroller.scrollTop += scroller.clientHeight
      await new Promise((resolve) => setTimeout(resolve, 50))
    }
    scroller.scrollTop = 0
  }, count)
  await expect(bar(page)).toContainText(`已選 ${count} 個`)
}

/** The sheet's grab handle (the drag that closes it). */
const handle = (page: Page) =>
  confirm(page).locator('[aria-hidden="true"]').first()

test.describe('desktop', () => {
  test('3 rows in tick order: delete with files sends one call, toasts, clears the selection; the rows go after the refresh', async ({
    page,
    request,
  }) => {
    await page.setViewportSize(DESKTOP)
    await login(page)
    await openList(page)
    await tick(page, 2)
    await tick(page, 1)
    await tick(page, 3)
    await openConfirm(page)

    await expect(confirm(page).getByRole('heading')).toHaveText(
      '刪除 3 個種子？',
    )
    expect(await rowTexts(page)).toEqual([
      [nameOf(2), '4 GB'],
      [nameOf(1), '4 GB'],
      [nameOf(3), '4 GB'],
    ])
    await expect(filesBox(page)).toHaveAttribute('aria-checked', 'true')
    await expect(primary(page)).toHaveText('刪除 3 個種子和檔案（12 GB）')
    // DESIGN dialog: 512px, radius 22px, 24px padding, cancel then delete.
    const box = await confirm(page).boundingBox()
    expect(Math.round(box?.width ?? 0)).toBe(512)
    await expect(confirm(page)).toHaveCSS('border-top-left-radius', '22px')
    await expect(confirm(page)).toHaveCSS('padding-top', '24px')
    const names = await confirm(page)
      .getByRole('button')
      .evaluateAll((buttons) => buttons.map((each) => each.textContent))
    expect(names.slice(-2)).toEqual(['取消', '刪除 3 個種子和檔案（12 GB）'])
    await expect(primary(page)).toHaveCSS('height', '36px')
    await expect(
      confirm(page).locator('[data-slot="dialog-close"]'),
    ).toHaveCount(0)
    await expect(
      confirm(page).getByRole('button', { name: '取消' }),
    ).toBeFocused()

    await primary(page).click()
    await expect(confirm(page)).toHaveCount(0)
    await expect(toastCard(page)).toContainText(
      '已刪除 3 個種子和檔案（12 GB）',
    )
    await expect(
      toastCard(page).getByRole('button', { name: '重試' }),
    ).toHaveCount(0)
    expect(await opCalls(request)).toEqual([
      {
        op: 'delete',
        hashes: [hashOf(2), hashOf(1), hashOf(3)],
        deleteFiles: true,
      },
    ])
    await expect(bar(page)).toHaveAttribute('inert', '')
    for (const n of [1, 2, 3]) await expect(item(page, n)).toHaveCount(0)
    await expect(item(page, 4)).toBeVisible()
    // The plain toast goes on its own after 4 s.
    await expect(toastCard(page)).toHaveCount(0, { timeout: 6000 })
  })

  test('files unticked: 只刪 1 個種子，檔案留著, deleteFiles false', async ({
    page,
    request,
  }) => {
    await page.setViewportSize(DESKTOP)
    await login(page)
    await openList(page)
    await tick(page, 1)
    await openConfirm(page)
    await filesBox(page).click()
    await expect(primary(page)).toHaveText('只刪 1 個種子，檔案留著')
    await primary(page).click()
    await expect(toastCard(page)).toContainText('已刪除 1 個種子，檔案留著')
    expect(await opCalls(request)).toEqual([
      { op: 'delete', hashes: [hashOf(1)], deleteFiles: false },
    ])
    await expect(item(page, 1)).toHaveCount(0)
  })

  test('Esc and 取消 mean no delete: the selection stays and focus is back on 刪除（含檔案）; a press outside does nothing', async ({
    page,
    request,
  }) => {
    await page.setViewportSize(DESKTOP)
    await login(page)
    await openList(page)
    await tick(page, 1)
    await tick(page, 2)

    await openConfirm(page)
    await page.mouse.click(20, 20)
    await expect(confirm(page)).toBeVisible()
    await page.keyboard.press('Escape')
    await expect(confirm(page)).toHaveCount(0)
    await expect(barDelete(page)).toBeFocused()
    await expect(bar(page)).toContainText('已選 2 個')

    await openConfirm(page)
    await confirm(page).getByRole('button', { name: '取消' }).click()
    await expect(confirm(page)).toHaveCount(0)
    await expect(barDelete(page)).toBeFocused()
    await expect(bar(page)).toContainText('已選 2 個')
    expect(await opCalls(request)).toEqual([])
  })

  test('找不到檔案 and 已整理: their word in the size slot, one note per kind, no size', async ({
    page,
  }) => {
    await page.setViewportSize(DESKTOP)
    await login(page)
    await openList(page)
    await tick(page, 4)
    await tick(page, 1)
    await openConfirm(page)
    expect(await rowTexts(page)).toEqual([
      [nameOf(4), '找不到檔案'],
      [nameOf(1), '4 GB'],
    ])
    await expect(confirm(page)).toContainText('其中 1 個找不到檔案，只會刪種子')
    await expect(primary(page)).toHaveText('刪除 2 個種子和檔案（4 GB）')
    await page.keyboard.press('Escape')
    await bar(page).getByRole('button', { name: '取消' }).click()

    // The board's 已整理 column.
    await page.goto('/')
    await expect(item(page, 1)).toBeVisible()
    await page.getByRole('button', { name: /^展開已整理欄/ }).click()
    await tick(page, 5)
    await tick(page, 4)
    await openConfirm(page)
    expect(await rowTexts(page)).toEqual([
      [nameOf(5), '已整理'],
      [nameOf(4), '找不到檔案'],
    ])
    await expect(confirm(page)).toContainText('其中 1 個找不到檔案，只會刪種子')
    await expect(confirm(page)).toContainText('其中 1 個已整理，只會刪種子')
    await expect(primary(page)).toHaveText('刪除 2 個種子（檔案已經不在）')
  })

  test('找不到檔案 with files there: two calls, the 找不到檔案 one never deletes files; one toast for both', async ({
    page,
    request,
  }) => {
    await page.setViewportSize(DESKTOP)
    await login(page)
    await openList(page)
    await tick(page, 4)
    await tick(page, 1)
    await openConfirm(page)
    await primary(page).click()
    await expect(confirm(page)).toHaveCount(0)
    await expect(toastCard(page)).toContainText('已刪除 2 個種子和檔案（4 GB）')
    const calls = await opCalls(request)
    expect(calls).toHaveLength(2)
    expect(calls).toEqual(
      expect.arrayContaining([
        { op: 'delete', hashes: [hashOf(1)], deleteFiles: true },
        { op: 'delete', hashes: [hashOf(4)], deleteFiles: false },
      ]),
    )
    for (const n of [1, 4]) await expect(item(page, n)).toHaveCount(0)
  })

  test('one call of two fails (ops=reject-files): the 找不到檔案 one goes, the failed one stays with 重試 and goes on the next press', async ({
    page,
    request,
  }) => {
    await setModes(request, { ops: 'reject-files' })
    await page.setViewportSize(DESKTOP)
    await login(page)
    await openList(page)
    await tick(page, 4)
    await tick(page, 1)
    await openConfirm(page)
    await primary(page).click()
    await expect(toastCard(page)).toContainText(FAILURE)
    await expect(confirm(page)).toBeVisible()
    await expect(confirm(page).getByRole('heading')).toHaveText(
      '刪除 1 個種子？',
    )
    expect(await rowTexts(page)).toEqual([[nameOf(1), '4 GB']])
    await expect(primary(page)).toHaveText('刪除 1 個種子和檔案（4 GB）')
    await expect(bar(page)).toContainText('已選 1 個')
    const rejected = {
      op: 'delete',
      hashes: [hashOf(1)],
      deleteFiles: true,
      rejected: true,
    }
    const calls = await opCalls(request)
    expect(calls).toHaveLength(2)
    expect(calls).toEqual(
      expect.arrayContaining([
        rejected,
        { op: 'delete', hashes: [hashOf(4)], deleteFiles: false },
      ]),
    )
    await expect(item(page, 4)).toHaveCount(0)

    await toastCard(page).getByRole('button', { name: '重試' }).click()
    await expect.poll(async () => (await opCalls(request)).at(-1)).toEqual(
      rejected,
    )
    await expect(toastCard(page)).toContainText(FAILURE)

    await setModes(request, { ops: 'normal' })
    await primary(page).click()
    await expect(confirm(page)).toHaveCount(0)
    await expect(toastCard(page)).toContainText('已刪除 1 個種子和檔案（4 GB）')
    expect((await opCalls(request)).at(-1)).toEqual({
      op: 'delete',
      hashes: [hashOf(1)],
      deleteFiles: true,
    })
    await expect(item(page, 1)).toHaveCount(0)
  })

  test('300 selected: 5 rows, 「還有 295 個」 expands a list at most 320px tall that scrolls itself with under 60 rows in the DOM', async ({
    page,
    request,
  }) => {
    await setModes(request, { data: 'many' })
    await page.setViewportSize(DESKTOP)
    await login(page)
    await openList(page)
    await tickFirst(page, true, 300)
    await openConfirm(page)
    await expect(confirm(page).getByRole('heading')).toHaveText(
      '刪除 300 個種子？',
    )
    await expect(confirmRows(page)).toHaveCount(5)
    await confirm(page).getByRole('button', { name: '還有 295 個' }).click()
    const scroller = confirm(page).locator('[data-slot="delete-list-scroll"]')
    await expect(scroller).toBeFocused()
    const height = await scroller.evaluate((element) => element.clientHeight)
    expect(height).toBeLessThanOrEqual(320)
    expect(await confirmRows(page).count()).toBeLessThan(60)
    expect(await confirmRows(page).count()).toBeGreaterThan(5)
    // The dialog never grows past the viewport.
    const box = await confirm(page).boundingBox()
    expect((box?.y ?? 0) + (box?.height ?? 0)).toBeLessThanOrEqual(
      DESKTOP.height,
    )
    // Scrolled to the end: the last rows render, the DOM stays small.
    await scroller.evaluate((element) => {
      element.scrollTop = element.scrollHeight
    })
    await expect(confirmRows(page).last()).toHaveAttribute(
      'aria-posinset',
      '300',
    )
    expect(await confirmRows(page).count()).toBeLessThan(60)
  })

  test('sending (ops=slow): 刪除中…, every close path ignored, 「還在等 NAS 回應」 after 10 s, then closed and deleted', async ({
    page,
    request,
  }) => {
    test.setTimeout(60_000)
    await setModes(request, { ops: 'slow' })
    await page.setViewportSize(DESKTOP)
    await login(page)
    await openList(page)
    await tick(page, 1)
    await openConfirm(page)
    await primary(page).click()
    await expect(primary(page)).toHaveText('刪除中…')
    await expect(primary(page)).toHaveAttribute('aria-disabled', 'true')
    // `aria-disabled` keeps focus but Playwright counts it as disabled.
    await primary(page).click({ force: true })
    await page.keyboard.press('Escape')
    await confirm(page)
      .getByRole('button', { name: '取消' })
      .click({ force: true })
    await page.mouse.click(20, 20)
    await expect(confirm(page)).toBeVisible()
    await expect(confirm(page)).not.toContainText(WAITING)
    await expect(confirm(page).getByText(WAITING)).toBeVisible({
      timeout: 11_000,
    })
    await expect(confirm(page)).toHaveCount(0, { timeout: SLOW_OP_MS })
    expect(await opCalls(request)).toEqual([
      { op: 'delete', hashes: [hashOf(1)], deleteFiles: true },
    ])
  })

  test('ops=reject: the failure toast with 重試, the dialog stays as it was; 重試 sends the same body', async ({
    page,
    request,
  }) => {
    await setModes(request, { ops: 'reject' })
    await page.setViewportSize(DESKTOP)
    await login(page)
    await openList(page)
    await tick(page, 2)
    await tick(page, 3)
    await openConfirm(page)
    await filesBox(page).click()
    await primary(page).click()
    await expect(toastCard(page)).toContainText(FAILURE)
    await expect(confirm(page)).toBeVisible()
    await expect(filesBox(page)).toHaveAttribute('aria-checked', 'false')
    await expect(primary(page)).toHaveText('只刪 2 個種子，檔案留著')
    const rejected = {
      op: 'delete',
      hashes: [hashOf(2), hashOf(3)],
      deleteFiles: false,
      rejected: true,
    }
    expect(await opCalls(request)).toEqual([rejected])
    await toastCard(page).getByRole('button', { name: '重試' }).click()
    await expect.poll(() => opCalls(request)).toEqual([rejected, rejected])
    await expect(toastCard(page)).toContainText(FAILURE)
    await expect(confirm(page)).toBeVisible()
  })

  test('another device deletes everything selected: the dialog closes by itself', async ({
    page,
    request,
  }) => {
    await page.setViewportSize(DESKTOP)
    await login(page)
    await openList(page)
    await tick(page, 1)
    await tick(page, 2)
    await openConfirm(page)
    await removeElsewhere(request, [hashOf(1)])
    await expect(confirm(page).getByRole('heading')).toHaveText(
      '刪除 1 個種子？',
      { timeout: 30_000 },
    )
    await removeElsewhere(request, [hashOf(2)])
    await expect(confirm(page)).toHaveCount(0, { timeout: 30_000 })
    expect(await opCalls(request)).toEqual([])
  })
})

test.describe('phone', () => {
  test.use({ hasTouch: true })

  async function selectOnPhone(
    page: Page,
    first: number,
    ...rest: Array<number>
  ) {
    await longPress(page, rowButton(page, first))
    for (const n of rest) await rowButton(page, n).tap()
    await expect(bar(page)).toContainText(`已選 ${rest.length + 1} 個`)
  }

  test('the sheet: the list, a 44px checkbox row, one full-width 44px delete; delete sends one call and the rows go', async ({
    page,
    request,
  }) => {
    await page.setViewportSize(PHONE)
    await login(page)
    await openList(page)
    await selectOnPhone(page, 1, 2)
    await barDelete(page).tap()
    await expect(confirm(page)).toBeVisible()
    await settled(page)
    await expect(confirm(page)).toHaveAttribute('data-slot', 'bottom-sheet')
    expect(await rowTexts(page)).toEqual([
      [nameOf(1), '4 GB'],
      [nameOf(2), '4 GB'],
    ])
    await expect(
      confirm(page).getByRole('button', { name: '取消' }),
    ).toHaveCount(0)
    const label = confirm(page).locator('label')
    await expect(label).toHaveCSS('min-height', '44px')
    await expect(label).toHaveCSS('font-size', '15px')
    const button = await primary(page).boundingBox()
    expect(Math.round(button?.height ?? 0)).toBe(44)
    expect(Math.round(button?.width ?? 0)).toBe(PHONE.width - 32)
    await primary(page).tap()
    await expect(confirm(page)).toHaveCount(0)
    await expect(toastCard(page)).toContainText('已刪除 2 個種子和檔案（8 GB）')
    expect(await opCalls(request)).toEqual([
      { op: 'delete', hashes: [hashOf(1), hashOf(2)], deleteFiles: true },
    ])
    await expect(item(page, 1)).toHaveCount(0)
    await expect(item(page, 2)).toHaveCount(0)
  })

  test('without files: 只刪, deleteFiles false', async ({ page, request }) => {
    await page.setViewportSize(PHONE)
    await login(page)
    await openList(page)
    await selectOnPhone(page, 3)
    await barDelete(page).tap()
    await expect(confirm(page)).toBeVisible()
    await filesBox(page).tap()
    await expect(primary(page)).toHaveText('只刪 1 個種子，檔案留著')
    await primary(page).tap()
    await expect(toastCard(page)).toContainText('已刪除 1 個種子，檔案留著')
    expect(await opCalls(request)).toEqual([
      { op: 'delete', hashes: [hashOf(3)], deleteFiles: false },
    ])
  })

  test('✕ 「關閉，不刪」 and a drag down mean no delete; the selection stays', async ({
    page,
    request,
  }) => {
    await page.setViewportSize(PHONE)
    await login(page)
    await openList(page)
    await selectOnPhone(page, 1)
    await barDelete(page).tap()
    await expect(confirm(page)).toBeVisible()
    await settled(page)
    await confirm(page).getByRole('button', { name: '關閉，不刪' }).tap()
    await expect(confirm(page)).toHaveCount(0)
    await expect(bar(page)).toContainText('已選 1 個')

    await barDelete(page).tap()
    await expect(confirm(page)).toBeVisible()
    await settled(page)
    await touchDrag(page, handle(page), 300)
    await expect(confirm(page)).toHaveCount(0)
    await expect(bar(page)).toContainText('已選 1 個')
    expect(await opCalls(request)).toEqual([])
  })

  test('sending (ops=slow): ✕ and a drag down cannot close it; 「還在等 NAS 回應」 after 10 s', async ({
    page,
    request,
  }) => {
    test.setTimeout(60_000)
    await setModes(request, { ops: 'slow' })
    await page.setViewportSize(PHONE)
    await login(page)
    await openList(page)
    await selectOnPhone(page, 1)
    await barDelete(page).tap()
    await expect(confirm(page)).toBeVisible()
    await settled(page)
    await primary(page).tap()
    await expect(primary(page)).toHaveText('刪除中…')
    await confirm(page)
      .getByRole('button', { name: '關閉，不刪' })
      .tap({ force: true })
    await touchDrag(page, handle(page), 300)
    await settled(page)
    await expect(confirm(page)).toBeVisible()
    await expect(confirm(page).getByText(WAITING)).toBeVisible({
      timeout: 11_000,
    })
    await expect(confirm(page)).toHaveCount(0, { timeout: SLOW_OP_MS })
    expect(await opCalls(request)).toEqual([
      { op: 'delete', hashes: [hashOf(1)], deleteFiles: true },
    ])
  })
})

test('screenshots: 3 rows, expanded, 找不到檔案, files unticked, 刪除中, 還在等 NAS 回應, failure toast; desktop and phone, light and dark', async ({
  browser,
  request,
}) => {
  test.setTimeout(300_000)
  for (const desktop of [true, false]) {
    const context = await browser.newContext({
      viewport: desktop ? DESKTOP : PHONE,
      hasTouch: !desktop,
    })
    const page = await context.newPage()
    const width = desktop ? 'desktop' : 'phone'
    await login(page)
    const shot = (name: string, scheme: string) =>
      page.screenshot({
        path: `${SCREENSHOT_DIR}/${name}-${width}-${scheme}.png`,
        animations: 'disabled',
      })
    const select = async (...ns: Array<number>) => {
      if (desktop) {
        for (const n of ns) await tick(page, n)
        await page.mouse.move(0, 0)
      } else {
        await longPress(page, rowButton(page, ns[0]))
        for (const n of ns.slice(1)) await rowButton(page, n).tap()
      }
      await expect(bar(page)).toContainText(`已選 ${ns.length} 個`)
    }
    const open = async () => {
      await barDelete(page).click()
      await expect(confirm(page)).toBeVisible()
      await settled(page)
    }
    const close = async () => {
      if (desktop) await page.keyboard.press('Escape')
      else
        await confirm(page).getByRole('button', { name: '關閉，不刪' }).click()
      await expect(confirm(page)).toHaveCount(0)
      await bar(page).getByRole('button', { name: '取消' }).click()
      await expect(bar(page)).toHaveAttribute('inert', '')
    }
    for (const scheme of SCHEMES) {
      await page.emulateMedia({ colorScheme: scheme })
      await setModes(request, { ...DEFAULT_MODES })
      await openList(page)

      await select(2, 1, 3)
      await open()
      await shot('3-rows', scheme)
      await filesBox(page).click()
      await expect(primary(page)).toHaveText('只刪 3 個種子，檔案留著')
      await settled(page)
      await shot('files-unticked', scheme)
      await close()

      await select(4, 1)
      await open()
      await shot('missing-files', scheme)
      await close()

      // Failure toast (ops=reject), over the open dialog.
      await setModes(request, { ops: 'reject' })
      await select(1, 2)
      await open()
      await primary(page).click()
      await expect(toastCard(page)).toContainText(FAILURE)
      await settled(page)
      await shot('failure-toast', scheme)
      await toastCard(page).getByRole('button', { name: '關閉' }).click()
      await close()

      // 刪除中, then 還在等 NAS 回應 (ops=slow); the delete then goes through.
      await setModes(request, { ops: 'slow' })
      await select(1, 2, 3)
      await open()
      await primary(page).click()
      await expect(primary(page)).toHaveText('刪除中…')
      await settled(page)
      await shot('sending', scheme)
      await expect(confirm(page).getByText(WAITING)).toBeVisible({
        timeout: 11_000,
      })
      await settled(page)
      await shot('still-waiting', scheme)
      await expect(confirm(page)).toHaveCount(0, { timeout: SLOW_OP_MS })

      // Expanded: 12 of the many data set.
      await setModes(request, { ...DEFAULT_MODES, data: 'many' })
      await openList(page)
      await tickFirst(page, desktop, 12)
      await open()
      await confirm(page).getByRole('button', { name: '還有 7 個' }).click()
      await expect(confirmRows(page)).toHaveCount(12)
      await settled(page)
      await shot('expanded', scheme)
      await close()
    }
    await context.close()
  }
})
