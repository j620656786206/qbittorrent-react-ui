import type { Locator, Page } from '@playwright/test'
import {
  DEFAULT_MODES,
  expect,
  login,
  opCalls,
  seedSettings,
  setModes,
  test,
} from './fixtures'

// Story 5.2: the change-path screen for one torrent, in Chromium against the
// built server and scripts/fake-qbit.mjs (fake data only, AD-15: the fake
// logs each torrents/setLocation call, shows the torrent `moving` for 3 s,
// then in its new folder). `data=sample&paths=library` with the `library`
// seed (EXPERIENCE.md's example table, fake folders): E01 sits right in
// /data/torrents/tv (下載區（影集）). Desktop at 1440px, phone at 390x844.
// Screenshots for the PR in screenshots/5-2, desktop and phone, light and
// dark: open with 「目前」 and the media library selected, bad format,
// already listed, 「搬移中…」, the failure toast.

const SCREENSHOT_DIR = '_bmad-output/implementation-artifacts/screenshots/5-2'
const DESKTOP = { width: 1440, height: 900 }
const PHONE = { width: 390, height: 844 }
const SCHEMES = ['light', 'dark'] as const
const hashOf = (n: number) => n.toString(16).padStart(40, '0')
const nameOf = (n: number) => `Fake.Show.S01E0${n}.1080p`
const FAILURE = '改路徑失敗：qBittorrent 拒絕這個操作'
const WAITING = '還在等 NAS 回應'
/** fake-qbit's `ops=slow` delay. */
const SLOW_OP_MS = 12_000
/** `--rt-delete` (#d93a3a) as computed. */
const DELETE_RED = 'rgb(217, 58, 58)'

test.beforeEach(async ({ request }) => {
  await setModes(request, { ...DEFAULT_MODES, paths: 'library' })
  await seedSettings(request, 'library')
})

test.afterEach(async ({ request }) => {
  await setModes(request, DEFAULT_MODES)
})

const panel = (page: Page) => page.getByRole('complementary', { name: '詳情' })
const savePathBlock = (scope: Locator) =>
  scope.locator('section[aria-label="儲存位置"]')
const screen = (page: Page) => page.getByRole('dialog', { name: '改路徑' })
const detailSheet = (page: Page) =>
  page.locator('[data-slot="bottom-sheet"]').filter({
    has: page.locator('section[aria-label="儲存位置"]'),
  })
const radio = (page: Page, name: string) =>
  screen(page).getByRole('radio', { name: new RegExp(`^${name}`) })
const box = (page: Page) => screen(page).getByLabel('會搬到')
const moveButton = (page: Page) =>
  screen(page).getByRole('button', { name: /^(搬過去|搬移中…)$/ })
const addRow = (page: Page) =>
  screen(page).getByRole('button', { name: /^加到常用/ })
const toastCard = (page: Page) => page.locator('[data-slot="toast"]')
const FOLDER_ICON = 'svg path[d="M3 7h6l2 2h10v10H3z"]'
const tagIn = (scope: Locator) => scope.locator(`span:has(> ${FOLDER_ICON})`)

/** Waits until no animation or transition runs. */
async function settled(page: Page) {
  await page.waitForFunction(() =>
    document
      .getAnimations()
      .every((animation) => animation.playState !== 'running'),
  )
}

/** Opens E0n's detail and its change-path screen. */
async function openScreen(page: Page, n = 1, phone = false) {
  await page.goto(`/?sort=added_on&hash=${hashOf(n)}`)
  const scope = phone ? detailSheet(page) : panel(page)
  await expect(savePathBlock(scope)).toBeVisible()
  await savePathBlock(scope).getByRole('button', { name: '改路徑' }).click()
  await expect(screen(page)).toBeVisible()
  await settled(page)
}

async function selectedNames(page: Page) {
  return screen(page)
    .locator('[role="radio"][aria-checked="true"] [data-path-name]')
    .allTextContents()
}

async function currentNames(page: Page) {
  return screen(page)
    .locator('[role="radio"]:has([data-current-tag]) [data-path-name]')
    .allTextContents()
}

test.describe('desktop', () => {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize(DESKTOP)
    await login(page)
  })

  test('U1 open from the detail: 560px, the name, the box at the save path, its row 「目前」 and selected; Esc closes', async ({
    page,
    request,
  }) => {
    await openScreen(page)
    expect((await screen(page).boundingBox())?.width).toBeCloseTo(560, 0)
    await expect(screen(page)).toContainText(nameOf(1))
    await expect(box(page)).toHaveValue('/data/torrents/tv')
    expect(await currentNames(page)).toEqual(['下載區（影集）'])
    expect(await selectedNames(page)).toEqual(['下載區（影集）'])
    await expect(moveButton(page)).toHaveAttribute('aria-disabled', 'true')
    await expect(addRow(page)).toBeDisabled()
    await expect(addRow(page)).toContainText('框裡的路徑已經在清單裡')
    // Story 5.4: the 編輯 pill (edit mode is e2e/common-paths.spec.ts).
    await expect(
      screen(page).getByRole('button', { name: '編輯' }),
    ).toBeVisible()
    // Two media libraries, each tagged once.
    await expect(screen(page).locator('[data-media-library]')).toHaveText([
      '媒體庫',
      '媒體庫',
    ])
    await page.keyboard.press('Escape')
    await expect(screen(page)).toHaveCount(0)
    expect(await opCalls(request)).toEqual([])
  })

  test('U2 pick the library and move: one call with the normalized path, closed, the detail follows the move', async ({
    page,
    request,
  }) => {
    await openScreen(page)
    await radio(page, '影集媒體庫').click()
    await expect(box(page)).toHaveValue('/data/media/tv')
    expect(await selectedNames(page)).toEqual(['影集媒體庫'])
    expect(await currentNames(page)).toEqual(['下載區（影集）'])
    await expect(addRow(page)).toBeDisabled()
    await expect(addRow(page)).toContainText('框裡的路徑已經在清單裡')
    await expect(moveButton(page)).not.toHaveAttribute('aria-disabled')
    // A trailing slash is normalized before it is sent.
    await box(page).fill('/data/media/tv/')
    await moveButton(page).click()
    await expect(screen(page)).toHaveCount(0)
    expect(await opCalls(request)).toEqual([
      { op: 'setLocation', hashes: [hashOf(1)], location: '/data/media/tv' },
    ])
    // The fake moves it in 3 s; the next polls show the new folder.
    await expect(tagIn(savePathBlock(panel(page)))).toHaveText(
      '影集媒體庫，媒體庫',
      { timeout: 15_000 },
    )
  })

  test('arrow keys step through the rows and fill the box', async ({
    page,
  }) => {
    await openScreen(page)
    await radio(page, '下載區（影集）').focus()
    await page.keyboard.press('ArrowDown')
    await expect(box(page)).toHaveValue('/data/torrents/movies')
    await expect(radio(page, '下載區（電影）')).toBeFocused()
  })

  test('U3 bad format: the delete border, the reason, 搬過去 disabled', async ({
    page,
    request,
  }) => {
    await openScreen(page)
    for (const [text, reason] of [
      ['data/tv', '路徑要從 / 開頭'],
      ['/data/../x', '路徑不能有 ..'],
      [`/${'x'.repeat(1025)}`, '路徑太長'],
    ] as const) {
      await box(page).fill(text)
      await expect(box(page)).toHaveAttribute('aria-invalid', 'true')
      await expect(
        screen(page).getByText(reason, { exact: true }),
      ).toBeVisible()
      // The border colour eases in (a transition): poll until it lands.
      await expect
        .poll(() =>
          box(page).evaluate((el) => getComputedStyle(el).borderTopColor),
        )
        .toBe(DELETE_RED)
      await expect(moveButton(page)).toHaveAttribute('aria-disabled', 'true')
      await expect(addRow(page)).toBeDisabled()
    }
    await box(page).press('Enter')
    expect(await opCalls(request)).toEqual([])
  })

  test('sending (ops=slow): 「搬移中…」, no second send, Esc locked, 「還在等 NAS 回應」 after 10 s', async ({
    page,
    request,
  }) => {
    test.setTimeout(60_000)
    await setModes(request, { ops: 'slow' })
    await openScreen(page)
    await radio(page, '影集媒體庫').click()
    await moveButton(page).click()
    await expect(moveButton(page)).toHaveText('搬移中…')
    // aria-disabled while sending: a second press does nothing.
    await moveButton(page).click({ force: true })
    await page.keyboard.press('Escape')
    await expect(screen(page)).toBeVisible()
    await expect(screen(page).getByText(WAITING)).toBeVisible({
      timeout: 11_000,
    })
    await expect(screen(page)).toHaveCount(0, { timeout: SLOW_OP_MS })
    expect(await opCalls(request)).toEqual([
      { op: 'setLocation', hashes: [hashOf(1)], location: '/data/media/tv' },
    ])
  })

  test('U4 ops=reject: the failure toast with 重試, the screen open with the box kept; 重試 sends the same body', async ({
    page,
    request,
  }) => {
    await setModes(request, { ops: 'reject' })
    await openScreen(page)
    await box(page).fill('/data/media/movies')
    await moveButton(page).click()
    await expect(toastCard(page)).toContainText(FAILURE)
    await expect(screen(page)).toBeVisible()
    await expect(box(page)).toHaveValue('/data/media/movies')
    await expect(moveButton(page)).toHaveText('搬過去')
    await setModes(request, { ops: 'normal' })
    await toastCard(page).getByRole('button', { name: '重試' }).click()
    await expect(screen(page)).toHaveCount(0)
    expect(await opCalls(request)).toEqual([
      {
        op: 'setLocation',
        hashes: [hashOf(1)],
        location: '/data/media/movies',
        rejected: true,
      },
      {
        op: 'setLocation',
        hashes: [hashOf(1)],
        location: '/data/media/movies',
      },
    ])
  })

  test('加到常用: the new row from the answer, last two folders, no media tag, selected; then 「已經在清單裡」', async ({
    page,
  }) => {
    await openScreen(page)
    await box(page).fill('/data/media/anime/')
    await expect(addRow(page)).toBeEnabled()
    await addRow(page).click()
    // Story 5.4: the new row's name opens for renaming; Enter keeps it.
    await screen(page).locator('[data-rename-input]').press('Enter')
    await expect(radio(page, 'media/anime')).toBeVisible()
    expect(await selectedNames(page)).toEqual(['media/anime'])
    await expect(
      radio(page, 'media/anime').locator('[data-media-library]'),
    ).toHaveCount(0)
    await expect(addRow(page)).toBeDisabled()
    await expect(addRow(page)).toContainText('框裡的路徑已經在清單裡')
    // The list is the file's: it is still there after a reload.
    await openScreen(page)
    await expect(radio(page, 'media/anime')).toBeVisible()
  })
})

test.describe('phone', () => {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize(PHONE)
    await login(page)
  })

  test('a content-height sheet over the detail sheet, no cancel; ✕ closes it and the detail comes back', async ({
    page,
  }) => {
    await openScreen(page, 1, true)
    await expect(
      screen(page).getByRole('button', { name: '取消' }),
    ).toHaveCount(0)
    await expect(screen(page)).toContainText(nameOf(1))
    expect((await box(page).boundingBox())?.height).toBeCloseTo(44, 0)
    await expect(addRow(page)).toContainText('已在清單裡')
    // Content height, at most 90%: the full-height sheet rests that far down.
    await settled(page)
    const sheetBox = await screen(page).boundingBox()
    expect(sheetBox?.y ?? 0).toBeGreaterThanOrEqual(PHONE.height * 0.1 - 1)
    await screen(page).getByRole('button', { name: '關閉' }).click()
    await expect(screen(page)).toHaveCount(0)
    await expect(detailSheet(page)).toBeVisible()
    await expect(detailSheet(page)).not.toHaveAttribute('inert')
    await expect(
      savePathBlock(detailSheet(page)).getByRole('button', { name: '改路徑' }),
    ).toBeFocused()
  })

  test('pick and move on the phone: one call, closed', async ({
    page,
    request,
  }) => {
    await openScreen(page, 1, true)
    await radio(page, '電影媒體庫').click()
    await moveButton(page).click()
    await expect(screen(page)).toHaveCount(0)
    expect(await opCalls(request)).toEqual([
      {
        op: 'setLocation',
        hashes: [hashOf(1)],
        location: '/data/media/movies',
      },
    ])
  })
})

test('screenshots: open with the library selected, bad format, already listed, 搬移中, failure toast; desktop and phone, light and dark', async ({
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
    for (const scheme of SCHEMES) {
      await page.emulateMedia({ colorScheme: scheme })
      await setModes(request, { ...DEFAULT_MODES, paths: 'library' })
      await seedSettings(request, 'library')

      await openScreen(page, 1, !desktop)
      await radio(page, '影集媒體庫').click()
      await settled(page)
      await shot('library-selected', scheme)

      await box(page).fill('/data/../x')
      await settled(page)
      await shot('bad-format', scheme)

      await box(page).fill('/data/media/anime')
      await addRow(page).click()
      // Story 5.4: the new row's name opens for renaming; Enter keeps it.
      await screen(page).locator('[data-rename-input]').press('Enter')
      await expect(addRow(page)).toContainText(
        desktop ? '框裡的路徑已經在清單裡' : '已在清單裡',
      )
      await settled(page)
      await shot('already-listed', scheme)

      await setModes(request, { ops: 'reject' })
      await box(page).fill('/data/media/movies')
      await moveButton(page).click()
      await expect(toastCard(page)).toContainText(FAILURE)
      await settled(page)
      await shot('failure-toast', scheme)
      await toastCard(page).getByRole('button', { name: '關閉' }).click()

      await setModes(request, { ops: 'slow' })
      await moveButton(page).click()
      await expect(moveButton(page)).toHaveText('搬移中…')
      await settled(page)
      await shot('moving', scheme)
      // Still sending when the picture was taken.
      await expect(moveButton(page)).toHaveText('搬移中…')
      // A new data set drops the slow move (it is not applied).
      await setModes(request, { ...DEFAULT_MODES, paths: 'library' })
      // Let it settle: while it is in flight the container refuses another
      // move of the same torrent, which the next scheme's failure toast needs.
      await expect(moveButton(page)).toHaveText('搬過去', { timeout: 20_000 })
    }
    await context.close()
  }
})
