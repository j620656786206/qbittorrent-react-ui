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

// Story 5.4: managing common paths inside the change-path screen (edit
// mode: rename, 「媒體庫」, ✕), the inline rename right after 「加到常用」,
// and the detail's 「☆ 加到常用」 with its 「改名」 toast. Chromium against
// the built server and scripts/fake-qbit.mjs; the settings file lives in
// fake-qbit's temporary CONFIG_DIR and qBittorrent is never written to
// (AD-15). `data=sample&paths=library` with the `library` seed: E01 sits
// in /data/torrents/tv (下載區（影集）), E03 in /data/downloads (not
// listed). Screenshots in screenshots/5-4, desktop 1440 and phone 390,
// light and dark: edit mode, renaming, the inline rename after 加到常用,
// the 「已加到常用」 toast, ☆ disabled.

const SCREENSHOT_DIR = '_bmad-output/implementation-artifacts/screenshots/5-4'
const DESKTOP = { width: 1440, height: 900 }
const PHONE = { width: 390, height: 844 }
const SCHEMES = ['light', 'dark'] as const
const hashOf = (n: number) => n.toString(16).padStart(40, '0')
const LIBRARY_NAMES = [
  '下載區（影集）',
  '下載區（電影）',
  'PT 做種',
  '影集媒體庫',
  '電影媒體庫',
]
const REMOVE_TOOLTIP = '從常用拿掉（不動檔案）'
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
const detailSheet = (page: Page) =>
  page.locator('[data-slot="bottom-sheet"]').filter({
    has: page.locator('section[aria-label="儲存位置"]'),
  })
const savePathBlock = (scope: Locator) =>
  scope.locator('section[aria-label="儲存位置"]')
const screen = (page: Page) => page.getByRole('dialog', { name: '改路徑' })
const radios = (page: Page) => screen(page).getByRole('radio')
const radio = (page: Page, name: string) =>
  screen(page).getByRole('radio', { name: new RegExp(`^${name}`) })
const box = (page: Page) => screen(page).getByLabel('會搬到')
const editPill = (page: Page) =>
  screen(page).getByRole('button', { name: /^(編輯|完成)$/ })
const addRow = (page: Page) =>
  screen(page).getByRole('button', { name: /^加到常用/ })
const editRows = (page: Page) => screen(page).locator('[data-edit-row]')
const nameButton = (page: Page, name: string) =>
  screen(page).getByRole('button', { name: `改名：${name}` })
const checkbox = (page: Page, name: string) =>
  screen(page).getByRole('checkbox', { name: `媒體庫：${name}` })
const removeButton = (page: Page, name: string) =>
  screen(page).getByRole('button', { name: `從常用拿掉：${name}` })
const renameInput = (page: Page) => screen(page).locator('[data-rename-input]')
const star = (scope: Locator) =>
  savePathBlock(scope).getByRole('button', { name: '☆ 加到常用' })
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

/** Opens E0n's detail (panel or phone sheet). */
async function openDetail(page: Page, n: number, phone = false) {
  await page.goto(`/?sort=added_on&hash=${hashOf(n)}`)
  const scope = phone ? detailSheet(page) : panel(page)
  await expect(savePathBlock(scope)).toBeVisible()
  return scope
}

/** Opens E0n's detail and its change-path screen. */
async function openScreen(page: Page, n = 1, phone = false) {
  const scope = await openDetail(page, n, phone)
  await savePathBlock(scope).getByRole('button', { name: '改路徑' }).click()
  await expect(screen(page)).toBeVisible()
  await settled(page)
}

async function selectedNames(page: Page) {
  return screen(page)
    .locator('[role="radio"][aria-checked="true"] [data-path-name]')
    .allTextContents()
}

async function selection(input: Locator) {
  return input.evaluate((element) => {
    const field = element as HTMLInputElement
    return [field.selectionStart, field.selectionEnd, field.value.length]
  })
}

test.describe('desktop', () => {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize(DESKTOP)
    await login(page)
  })

  test('E1 編輯: 完成, no radios, dotted names, 媒體庫 and ✕ per row, 加到常用 hidden; 完成 brings the radios back', async ({
    page,
    request,
  }) => {
    await openScreen(page)
    await expect(editPill(page)).toHaveText('編輯')
    expect(Math.round((await editPill(page).boundingBox())?.height ?? 0)).toBe(
      28,
    )
    await editPill(page).click()
    await expect(editPill(page)).toHaveText('完成')
    expect(
      await editPill(page).evaluate((el) => getComputedStyle(el).fontWeight),
    ).toBe('700')
    await expect(radios(page)).toHaveCount(0)
    await expect(editRows(page)).toHaveCount(5)
    await expect(addRow(page)).toHaveCount(0)
    for (const name of LIBRARY_NAMES) {
      await expect(nameButton(page, name)).toBeVisible()
      expect(
        await nameButton(page, name).evaluate(
          (el) => getComputedStyle(el).textDecorationStyle,
        ),
      ).toBe('dotted')
      expect(
        Math.round((await checkbox(page, name).boundingBox())?.width ?? 0),
      ).toBe(20)
      const remove = removeButton(page, name)
      await expect(remove).toHaveAttribute('title', REMOVE_TOOLTIP)
      expect(Math.round((await remove.boundingBox())?.width ?? 0)).toBe(32)
    }
    await expect(checkbox(page, '影集媒體庫')).toHaveAttribute(
      'aria-checked',
      'true',
    )
    await expect(checkbox(page, '下載區（影集）')).toHaveAttribute(
      'aria-checked',
      'false',
    )
    // A row click fills nothing in edit mode.
    await editRows(page).nth(3).locator('[title="/data/media/tv"]').click()
    await expect(box(page)).toHaveValue('/data/torrents/tv')
    await editPill(page).click()
    await expect(editPill(page)).toHaveText('編輯')
    await expect(radios(page)).toHaveCount(5)
    await expect(addRow(page)).toBeVisible()
    expect(await selectedNames(page)).toEqual(['下載區（影集）'])
    expect(await opCalls(request)).toEqual([])
  })

  test('E2 rename: Enter saves (kept after a reload), Esc cancels only the rename, a blank name gets the delete border', async ({
    page,
    request,
  }) => {
    await openScreen(page)
    await editPill(page).click()
    await nameButton(page, '影集媒體庫').click()
    await expect(renameInput(page)).toBeFocused()
    await expect(renameInput(page)).toHaveValue('影集媒體庫')
    expect(await selection(renameInput(page))).toEqual([0, 5, 5])
    expect(
      Math.round((await renameInput(page).boundingBox())?.height ?? 0),
    ).toBe(36)
    await renameInput(page).fill('   ')
    await expect(renameInput(page)).toHaveAttribute('aria-invalid', 'true')
    await expect
      .poll(() =>
        renameInput(page).evaluate((el) => getComputedStyle(el).borderTopColor),
      )
      .toBe(DELETE_RED)
    await renameInput(page).press('Enter')
    await expect(renameInput(page)).toBeVisible()
    await renameInput(page).fill('  影集  ')
    await renameInput(page).press('Enter')
    await expect(nameButton(page, '影集')).toBeVisible()
    await expect(nameButton(page, '影集')).toBeFocused()
    await expect(renameInput(page)).toHaveCount(0)

    await nameButton(page, '電影媒體庫').click()
    await renameInput(page).fill('不要這個名字')
    await renameInput(page).press('Escape')
    await expect(screen(page)).toBeVisible()
    await expect(nameButton(page, '電影媒體庫')).toBeVisible()
    await expect(renameInput(page)).toHaveCount(0)

    // The name is the file's: still there after a reload.
    await openScreen(page)
    await expect(radio(page, '影集')).toBeVisible()
    await expect(radio(page, '電影媒體庫')).toBeVisible()
    expect(await opCalls(request)).toEqual([])
  })

  test('ticking 媒體庫 saves at once; the location tag follows', async ({
    page,
  }) => {
    await openScreen(page)
    await expect(tagIn(savePathBlock(panel(page)))).toHaveText('下載區（影集）')
    await editPill(page).click()
    await checkbox(page, '下載區（影集）').click()
    await expect(checkbox(page, '下載區（影集）')).toHaveAttribute(
      'aria-checked',
      'true',
    )
    await page.keyboard.press('Escape')
    await expect(screen(page)).toHaveCount(0)
    await expect(tagIn(savePathBlock(panel(page)))).toHaveText(
      '下載區（影集），媒體庫',
    )
  })

  test('E3 ✕ on the selected row: gone at once, the box keeps its path, no row selected', async ({
    page,
    request,
  }) => {
    await openScreen(page)
    expect(await selectedNames(page)).toEqual(['下載區（影集）'])
    await editPill(page).click()
    await removeButton(page, '下載區（影集）').click()
    await expect(editRows(page)).toHaveCount(4)
    // The ✕ that had focus is gone: focus lands on 完成, inside the screen.
    await expect(editPill(page)).toBeFocused()
    await expect(page.getByRole('alertdialog')).toHaveCount(0)
    await expect(box(page)).toHaveValue('/data/torrents/tv')
    await editPill(page).click()
    await expect(radios(page)).toHaveCount(4)
    expect(await selectedNames(page)).toEqual([])
    await expect(addRow(page)).toBeEnabled()
    // Only the shortcut went: the torrent is where it was.
    expect(await opCalls(request)).toEqual([])
    await expect(savePathBlock(panel(page)).locator('bdi')).toHaveText(
      '/data/torrents/tv',
    )
  })

  test('A1 加到常用: the new row opens its name with the text selected; Enter saves a new name', async ({
    page,
  }) => {
    await openScreen(page)
    await box(page).fill('/data/media/anime/')
    await addRow(page).click()
    await expect(renameInput(page)).toBeFocused()
    await expect(renameInput(page)).toHaveValue('media/anime')
    expect(await selection(renameInput(page))).toEqual([0, 11, 11])
    await renameInput(page).fill('動畫媒體庫')
    await renameInput(page).press('Enter')
    await expect(radio(page, '動畫媒體庫')).toBeVisible()
    expect(await selectedNames(page)).toEqual(['動畫媒體庫'])
  })

  test('A1 leaving the new name unchanged keeps the last two folders', async ({
    page,
  }) => {
    await openScreen(page)
    await box(page).fill('/data/media/anime')
    await addRow(page).click()
    await expect(renameInput(page)).toBeFocused()
    await renameInput(page).press('Enter')
    await expect(radio(page, 'media/anime')).toBeVisible()
    expect(await selectedNames(page)).toEqual(['media/anime'])
  })

  test('D1 D2 ☆ on an unlisted path: the toast 「已加到常用」 with 改名, ☆ disabled; 改名 opens edit mode on that row', async ({
    page,
    request,
  }) => {
    const scope = await openDetail(page, 3)
    await expect(star(scope)).toBeEnabled()
    await star(scope).click()
    await expect(toastCard(page)).toContainText('已加到常用：data/downloads')
    await expect(star(scope)).toBeDisabled()
    await expect(
      savePathBlock(scope).locator('[data-slot="add-common"]'),
    ).toHaveAttribute('title', '已經在常用路徑裡')
    await expect(tagIn(savePathBlock(scope))).toHaveText('data/downloads')
    await toastCard(page).getByRole('button', { name: '改名' }).click()
    await expect(screen(page)).toBeVisible()
    await expect(editPill(page)).toHaveText('完成')
    await expect(renameInput(page)).toBeFocused()
    await expect(renameInput(page)).toHaveValue('data/downloads')
    await renameInput(page).fill('一般下載')
    await renameInput(page).press('Enter')
    await expect(nameButton(page, '一般下載')).toBeVisible()
    await page.keyboard.press('Escape')
    await expect(screen(page)).toHaveCount(0)
    await expect(tagIn(savePathBlock(scope))).toHaveText('一般下載')
    expect(await opCalls(request)).toEqual([])
  })

  test('D3 ☆ on a listed path: disabled with the tooltip', async ({ page }) => {
    const scope = await openDetail(page, 1)
    await expect(star(scope)).toBeDisabled()
    await expect(
      savePathBlock(scope).locator('[data-slot="add-common"]'),
    ).toHaveAttribute('title', '已經在常用路徑裡')
  })
})

test.describe('phone', () => {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize(PHONE)
    await login(page)
  })

  test('edit mode on the phone: a 44px pill, 56px rows, a 44px name input; Esc-free rename by Enter', async ({
    page,
  }) => {
    await openScreen(page, 1, true)
    expect(Math.round((await editPill(page).boundingBox())?.height ?? 0)).toBe(
      44,
    )
    await editPill(page).click()
    await expect(editRows(page)).toHaveCount(5)
    expect(
      Math.round((await editRows(page).first().boundingBox())?.height ?? 0),
    ).toBeGreaterThanOrEqual(56)
    await nameButton(page, 'PT 做種').click()
    expect(
      Math.round((await renameInput(page).boundingBox())?.height ?? 0),
    ).toBe(44)
    expect(
      await renameInput(page).evaluate((el) => getComputedStyle(el).fontSize),
    ).toBe('16px')
    await renameInput(page).fill('保種')
    await renameInput(page).press('Enter')
    await expect(nameButton(page, '保種')).toBeVisible()
  })

  test('☆ in the phone detail sheet: the toast, then 改名 opens the sheet in edit mode', async ({
    page,
  }) => {
    const scope = await openDetail(page, 3, true)
    await star(scope).click()
    await expect(toastCard(page)).toContainText('已加到常用：data/downloads')
    await toastCard(page).getByRole('button', { name: '改名' }).click()
    await expect(screen(page)).toBeVisible()
    await expect(editPill(page)).toHaveText('完成')
    await expect(renameInput(page)).toHaveValue('data/downloads')
    await expect(renameInput(page)).toBeFocused()
  })
})

test('screenshots: edit mode, renaming, inline rename after 加到常用, the 已加到常用 toast, ☆ disabled; desktop and phone, light and dark', async ({
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
      await editPill(page).click()
      await expect(editRows(page)).toHaveCount(5)
      await settled(page)
      await shot('edit-mode', scheme)

      await nameButton(page, '影集媒體庫').click()
      await renameInput(page).fill('影集')
      await settled(page)
      await shot('renaming', scheme)
      await renameInput(page).press('Escape')
      await editPill(page).click()

      await box(page).fill('/data/media/anime')
      await addRow(page).click()
      await expect(renameInput(page)).toBeFocused()
      await settled(page)
      await shot('add-inline-rename', scheme)
      await renameInput(page).press('Enter')

      const scope = await openDetail(page, 3, !desktop)
      await star(scope).click()
      await expect(toastCard(page)).toContainText('已加到常用：data/downloads')
      await expect(star(scope)).toBeDisabled()
      await settled(page)
      await shot('added-toast', scheme)
      await toastCard(page).getByRole('button', { name: '關閉' }).click()
      await expect(toastCard(page)).toHaveCount(0)

      await openDetail(page, 1, !desktop)
      await expect(
        star(desktop ? panel(page) : detailSheet(page)),
      ).toBeDisabled()
      await savePathBlock(
        desktop ? panel(page) : detailSheet(page),
      ).scrollIntoViewIfNeeded()
      await settled(page)
      await shot('star-disabled', scheme)
    }
    await context.close()
  }
})
