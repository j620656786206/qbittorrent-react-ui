import type { Browser, Locator, Page } from '@playwright/test'
import {
  DEFAULT_MODES,
  expect,
  login,
  moveElsewhere,
  opCalls,
  releaseMoves,
  seedSettings,
  setModes,
  test,
  watchExtraPage,
} from './fixtures'

// Story 5.3: moving and move finished, in Chromium against the built server
// and scripts/fake-qbit.mjs (fake data only, AD-15). `data=sample&
// paths=library` with the `library` seed: E01 (downloading, 下載中) sits in
// /data/torrents/tv (下載區（影集）), E02 (uploading, 做種中) in
// /data/torrent/mteam-seed (PT 做種). `move=hold` keeps a move `moving`
// until releaseMoves lands it; `move=fail` ends it back at the old path;
// moveElsewhere is another client's move (no `movingTo`). Screenshots for
// the PR in screenshots/5-3, desktop 1440 and phone 390, light and dark:
// the detail summary with the four disabled buttons, the done toast, the
// list and the board while moving.

const SCREENSHOT_DIR = '_bmad-output/implementation-artifacts/screenshots/5-3'
const DESKTOP = { width: 1440, height: 900 }
const PHONE = { width: 390, height: 844 }
const SCHEMES = ['light', 'dark'] as const
const hashOf = (n: number) => n.toString(16).padStart(40, '0')
const nameOf = (n: number) => `Fake.Show.S01E0${n}.1080p`
const TV = '/data/media/tv'
const DONE = '已搬到 影集媒體庫'
const FAILED = `沒有搬到 ${TV}`
/** A poll (5 s) plus the fake's 3 s move, with room to spare. */
const MOVE_SETTLES_MS = 20_000

test.beforeEach(async ({ request }) => {
  await setModes(request, { ...DEFAULT_MODES, paths: 'library' })
  await seedSettings(request, 'library')
})

test.afterEach(async ({ request }) => {
  await releaseMoves(request)
  await setModes(request, DEFAULT_MODES)
})

const panel = (page: Page) => page.getByRole('complementary', { name: '詳情' })
const detailSheet = (page: Page) =>
  page.locator('[data-slot="bottom-sheet"]').filter({
    has: page.locator('section[aria-label="儲存位置"]'),
  })
const savePathBlock = (scope: Locator) =>
  scope.locator('section[aria-label="儲存位置"]')
const pills = (scope: Locator) =>
  savePathBlock(scope).locator(':scope > div:last-child > button')
const summaryOf = (scope: Locator) =>
  scope
    .locator('[role="tabpanel"] p')
    .first()
    .locator('xpath=following-sibling::p[1]')
const screen = (page: Page) => page.getByRole('dialog', { name: '改路徑' })
const radio = (page: Page, name: string) =>
  screen(page).getByRole('radio', { name: new RegExp(`^${name}`) })
const moveButton = (page: Page) =>
  screen(page).getByRole('button', { name: /^(搬過去|搬移中…)$/ })
const toastCard = (page: Page) => page.locator('[data-slot="toast"]')
const FOLDER_ICON = 'svg path[d="M3 7h6l2 2h10v10H3z"]'
const tagIn = (scope: Locator) => scope.locator(`span:has(> ${FOLDER_ICON})`)
const rowButton = (page: Page, n: number) =>
  page
    .getByRole('listitem')
    .locator(':scope > button[data-entrance]')
    .filter({ has: page.getByTitle(nameOf(n), { exact: true }) })
const board = (page: Page) => page.getByRole('region', { name: '看板' })
const column = (page: Page, name: RegExp) =>
  board(page).getByRole('region', { name })

/** Waits until no animation or transition runs. */
async function settled(page: Page) {
  await page.waitForFunction(() =>
    document
      .getAnimations()
      .every((animation) => animation.playState !== 'running'),
  )
}

/** Opens E0n's detail in the list (or the board) and moves it to `to`. */
async function moveFromDetail(
  page: Page,
  { n = 1, to = '影集媒體庫', phone = false, onBoard = false } = {},
) {
  await page.goto(
    onBoard ? `/?hash=${hashOf(n)}` : `/?sort=added_on&hash=${hashOf(n)}`,
  )
  const scope = phone ? detailSheet(page) : panel(page)
  await expect(savePathBlock(scope)).toBeVisible()
  await pills(scope).filter({ hasText: '改路徑' }).click()
  await expect(screen(page)).toBeVisible()
  await radio(page, to).click()
  await moveButton(page).click()
  await expect(screen(page)).toHaveCount(0)
  return scope
}

/** The detail reads moving to TV: summary prefix, four disabled pills. */
async function expectMovingDetail(scope: Locator, target: string | null) {
  await expect(summaryOf(scope)).toHaveText(
    target === null
      ? /^搬移中 · (?!正在搬到)/
      : new RegExp(`^搬移中 · 正在搬到 ${target} · `),
  )
  await expect(pills(scope)).toHaveCount(4)
  for (const pill of await pills(scope).all()) await expect(pill).toBeDisabled()
  await expect(pills(scope).first()).toHaveCSS('opacity', '0.5')
}

/**
 * No toast shows now, nor across the next two polls: the count is read at
 * once at each sample (a retrying `toHaveCount(0)` would wait out a 4 s
 * toast and pass).
 */
async function expectNoToastFor(page: Page, ms = 11_000) {
  const deadline = Date.now() + ms
  while (Date.now() < deadline) {
    expect(await toastCard(page).count()).toBe(0)
    await page.waitForTimeout(250)
  }
}

test.describe('desktop', () => {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize(DESKTOP)
    await login(page)
  })

  test('M1 list and detail while moving; O1 the move lands: one 「已搬到 影集媒體庫」, the tag turns purple', async ({
    page,
    request,
  }) => {
    test.setTimeout(60_000)
    await setModes(request, { move: 'hold' })
    const scope = await moveFromDetail(page)
    expect(await opCalls(request)).toEqual([
      { op: 'setLocation', hashes: [hashOf(1)], location: TV },
    ])
    await expect(rowButton(page, 1)).toContainText('搬移中')
    await expectMovingDetail(scope, TV)
    // Still the old place until it lands.
    await expect(tagIn(savePathBlock(scope))).toHaveText('下載區（影集）')
    // Past the 30 s pending window is the O6 vitest; here, past a poll.
    // Sampled across a poll, so a short-lived toast cannot slip by.
    await expectNoToastFor(page, 6000)
    await expectMovingDetail(scope, TV)

    await releaseMoves(request)
    await expect(toastCard(page)).toHaveText(new RegExp(`^${DONE}`), {
      timeout: MOVE_SETTLES_MS,
    })
    await expect(tagIn(savePathBlock(scope))).toHaveText('影集媒體庫，媒體庫')
    await expect(tagIn(savePathBlock(scope))).toHaveAttribute(
      'data-media-library',
      '',
    )
    await expect(rowButton(page, 1)).not.toContainText('搬移中')
    for (const pill of await pills(scope).all()) {
      const text = await pill.textContent()
      if (text === '複製' || text === '改路徑') await expect(pill).toBeEnabled()
    }
    // The plain toast goes after 4 s and never comes back.
    await expect(toastCard(page)).toHaveCount(0, { timeout: 8000 })
    await expectNoToastFor(page)
  })

  test('M1 on the board: 搬移中 on the card, the column stays 下載中; a reload keeps moving and the target, no toast after', async ({
    page,
    request,
  }) => {
    test.setTimeout(90_000)
    await setModes(request, { move: 'hold' })
    await moveFromDetail(page, { onBoard: true })
    const downloading = column(page, /^下載中/)
    await expect(
      downloading.getByRole('listitem').filter({ hasText: nameOf(1) }),
    ).toContainText('搬移中')

    await page.reload()
    await expect(savePathBlock(panel(page))).toBeVisible()
    await expectMovingDetail(panel(page), TV)
    await expect(
      column(page, /^下載中/)
        .getByRole('listitem')
        .filter({ hasText: nameOf(1) }),
    ).toContainText('搬移中')

    // The reloaded tab lost the record: the move lands with no toast.
    await releaseMoves(request)
    await expect(tagIn(savePathBlock(panel(page)))).toHaveText(
      '影集媒體庫，媒體庫',
      { timeout: MOVE_SETTLES_MS },
    )
    await expectNoToastFor(page)
  })

  test('O2 the move ends back at the old path: 「沒有搬到 /data/media/tv」, 重試 sends one setLocation with the same hash and target', async ({
    page,
    request,
  }) => {
    test.setTimeout(90_000)
    await setModes(request, { move: 'fail' })
    await moveFromDetail(page)
    await expect(toastCard(page)).toContainText(FAILED, {
      timeout: MOVE_SETTLES_MS,
    })
    await expect(tagIn(savePathBlock(panel(page)))).toHaveText('下載區（影集）')
    await setModes(request, { move: 'normal' })
    await toastCard(page).getByRole('button', { name: '重試' }).click()
    await expect
      .poll(() => opCalls(request))
      .toEqual([
        { op: 'setLocation', hashes: [hashOf(1)], location: TV },
        { op: 'setLocation', hashes: [hashOf(1)], location: TV },
      ])
    await expect(toastCard(page)).toHaveText(new RegExp(`^${DONE}`), {
      timeout: MOVE_SETTLES_MS,
    })
  })

  test('M2 another client moves a torrent: 搬移中 with no target, its column stays, no toast when it lands', async ({
    page,
    request,
  }) => {
    test.setTimeout(60_000)
    await setModes(request, { move: 'hold' })
    await page.goto(`/?hash=${hashOf(2)}`)
    await expect(savePathBlock(panel(page))).toBeVisible()
    await moveElsewhere(request, hashOf(2), TV)
    await expect(
      column(page, /^做種中/)
        .getByRole('listitem')
        .filter({ hasText: nameOf(2) }),
    ).toContainText('搬移中', { timeout: MOVE_SETTLES_MS })
    await expectMovingDetail(panel(page), null)
    await releaseMoves(request)
    await expect(tagIn(savePathBlock(panel(page)))).toHaveText(
      '影集媒體庫，媒體庫',
      { timeout: MOVE_SETTLES_MS },
    )
    await expectNoToastFor(page)
  })
})

test('O5 a second browser context sees the move and its target, and no toast; only the starting tab toasts', async ({
  browser,
  page,
  request,
}) => {
  test.setTimeout(90_000)
  await page.setViewportSize(DESKTOP)
  await login(page)
  const other = await browser.newContext({ viewport: DESKTOP })
  const otherPage = await other.newPage()
  const otherWatch = await watchExtraPage(otherPage)
  await login(otherPage)
  await otherPage.goto(`/?sort=added_on&hash=${hashOf(1)}`)
  await expect(savePathBlock(panel(otherPage))).toBeVisible()

  await setModes(request, { move: 'hold' })
  await moveFromDetail(page)
  await expect(rowButton(otherPage, 1)).toContainText('搬移中', {
    timeout: MOVE_SETTLES_MS,
  })
  await expectMovingDetail(panel(otherPage), TV)

  await releaseMoves(request)
  await expect(toastCard(page)).toHaveText(new RegExp(`^${DONE}`), {
    timeout: MOVE_SETTLES_MS,
  })
  await expect(tagIn(savePathBlock(panel(otherPage)))).toHaveText(
    '影集媒體庫，媒體庫',
    { timeout: MOVE_SETTLES_MS },
  )
  await expectNoToastFor(otherPage)
  otherWatch.expectClean()
  await other.close()
})

async function screenshots(
  browser: Browser,
  desktop: boolean,
  request: Parameters<typeof setModes>[0],
) {
  const context = await browser.newContext({
    viewport: desktop ? DESKTOP : PHONE,
    hasTouch: !desktop,
  })
  const page = await context.newPage()
  const watch = await watchExtraPage(page)
  const width = desktop ? 'desktop' : 'phone'
  await login(page)
  const shot = (name: string, scheme: string) =>
    page.screenshot({
      path: `${SCREENSHOT_DIR}/${name}-${width}-${scheme}.png`,
      animations: 'disabled',
    })
  for (const scheme of SCHEMES) {
    await page.emulateMedia({ colorScheme: scheme })
    await setModes(request, {
      ...DEFAULT_MODES,
      paths: 'library',
      move: 'hold',
    })
    await seedSettings(request, 'library')

    // The detail while moving (on desktop the list beside it too).
    const scope = await moveFromDetail(page, { phone: !desktop })
    await expectMovingDetail(scope, TV)
    await settled(page)
    await shot('detail-moving', scheme)

    // The move lands: the done toast, the tag purple.
    await releaseMoves(request)
    await expect(toastCard(page)).toHaveText(new RegExp(`^${DONE}`), {
      timeout: MOVE_SETTLES_MS,
    })
    await expect(tagIn(savePathBlock(scope))).toHaveText('影集媒體庫，媒體庫')
    await settled(page)
    await shot('done-toast', scheme)

    // Moving again (back), for the list and the board.
    await moveFromDetail(page, { phone: !desktop, to: '下載區（影集）' })
    await page.goto('/?sort=added_on')
    await expect(rowButton(page, 1)).toContainText('搬移中')
    // Still where the first move landed until this one does.
    await expect(tagIn(rowButton(page, 1))).toHaveText('影集媒體庫，媒體庫')
    await settled(page)
    await shot('list-moving', scheme)

    await page.goto('/')
    if (!desktop) {
      await page.getByRole('tab', { name: /^下載中/ }).click()
      await expect(
        page.getByRole('tabpanel', { name: '下載中' }),
      ).toBeInViewport({
        ratio: 1,
      })
    }
    await expect(
      page
        .locator('#rt-main')
        .getByRole('listitem')
        .filter({ hasText: nameOf(1) }),
    ).toContainText('搬移中')
    await settled(page)
    await shot('board-moving', scheme)
    await releaseMoves(request)
  }
  watch.expectClean()
  await context.close()
}

test('screenshots desktop: detail while moving, done toast, list and board moving; light and dark', async ({
  browser,
  request,
}) => {
  test.setTimeout(180_000)
  await screenshots(browser, true, request)
})

test('screenshots phone: detail while moving, done toast, list and board moving; light and dark', async ({
  browser,
  request,
}) => {
  test.setTimeout(180_000)
  await screenshots(browser, false, request)
})
