import type { Page } from '@playwright/test'
import { singleFileInfo, torrentBytes } from '../src/lib/bencode-testing'
import {
  DEFAULT_MODES,
  MAIN_ID,
  addElsewhere,
  expect,
  login,
  opCalls,
  setModes,
  test,
} from './fixtures'
import type { Modes } from './fixtures'

// Story 4.7: submitting the add screen in Chromium against the built server
// and scripts/fake-qbit.mjs, whose torrents/add records each call and adds
// a downloading torrent with the newest `added_on` (AD-15: never a real
// qBittorrent). C1 to C11 on desktop; C3, C4 and C6 on the phone, with no
// sideways scroll at 390px. Test torrents are generated with bencode (fake
// names). Screenshots for the PR in screenshots/4-7, desktop 1440 and
// phone 390, light and dark: 新增中, the all-ok toast, a partial failure,
// the whole-failure toast and the no-categories line.

const SCREENSHOT_DIR = '_bmad-output/implementation-artifacts/screenshots/4-7'
const DESKTOP = { width: 1440, height: 900 }
const PHONE = { width: 390, height: 844 }
const SCHEMES = ['light', 'dark'] as const
const fakeHex = (seed: string) => seed.repeat(40).slice(0, 40)
const magnet = (hash: string, name: string) =>
  `magnet:?xt=urn:btih:${hash}&dn=${encodeURIComponent(name)}`
const HEX_A = fakeHex('a')
const HEX_B = fakeHex('b')
const NAME_A = 'Fake.Add.S01E01.1080p'
const NAME_B = 'Fake.Add.S01E02.1080p'

interface FilePayload {
  name: string
  mimeType: string
  buffer: Buffer
}

function torrentPayload(name: string): FilePayload {
  return {
    name: `${name}.torrent`,
    mimeType: 'application/x-bittorrent',
    buffer: Buffer.from(torrentBytes(singleFileInfo({ name }))),
  }
}

async function useModes(request: Parameters<typeof setModes>[0], modes: Modes) {
  await setModes(request, { ...DEFAULT_MODES, ...modes })
}

test.beforeEach(async ({ request }) => {
  await setModes(request, { ...DEFAULT_MODES })
})

test.afterEach(async ({ request }) => {
  await setModes(request, DEFAULT_MODES)
})

const addScreen = (page: Page) => page.getByRole('dialog', { name: '新增種子' })
const rows = (page: Page) => addScreen(page).locator('[data-add-row]')
const submit = (page: Page) => addScreen(page).locator('[data-add-submit]')
const resultLine = (page: Page) => addScreen(page).locator('[data-add-result]')
const waiting = (page: Page) => addScreen(page).locator('[data-add-waiting]')
const toastCard = (page: Page) => page.locator('[data-slot="toast"]')
const board = (page: Page) => page.locator(`#${MAIN_ID}`)

async function openAddDesktop(page: Page) {
  await page
    .locator('header')
    .getByRole('button', { name: '新增', exact: true })
    .click()
  await expect(addScreen(page)).toBeVisible()
}

async function openAddPhone(page: Page) {
  await page
    .getByRole('button', { name: '新增種子', exact: true })
    .first()
    .click()
  await expect(addScreen(page)).toBeVisible()
}

async function pasteText(page: Page, text: string) {
  await addScreen(page)
    .locator('[data-add-paste]')
    .evaluate((element, value) => {
      const data = new DataTransfer()
      data.setData('text/plain', value)
      element.dispatchEvent(
        new ClipboardEvent('paste', {
          clipboardData: data,
          bubbles: true,
          cancelable: true,
        }),
      )
    }, text)
}

async function pickFiles(page: Page, files: Array<FilePayload>) {
  await addScreen(page).locator('[data-add-file-input]').setInputFiles(files)
}

async function chooseX(page: Page) {
  await addScreen(page)
    .getByRole('combobox', { name: '分類' })
    .selectOption('X')
}

async function settled(page: Page) {
  await page.waitForFunction(() =>
    document
      .getAnimations()
      .every((animation) => animation.playState !== 'running'),
  )
}

async function noSideScroll(page: Page) {
  const overflow = await page.evaluate(
    () =>
      document.documentElement.scrollWidth -
      document.documentElement.clientWidth,
  )
  expect(overflow).toBeLessThanOrEqual(0)
}

/** Answers the next multipart server function call (addTorrents) with a 413. */
async function failNextAdd(page: Page) {
  await page.route(
    '**/_serverFn/**',
    async (route) => {
      const type = route.request().headers()['content-type'] ?? ''
      if (!type.includes('multipart/form-data')) return route.fallback()
      await route.fulfill({
        status: 413,
        contentType: 'application/json',
        body: JSON.stringify({
          ok: false,
          error: { code: 'invalid_input', message: '送出的資料格式不對' },
        }),
      })
    },
    { times: 1 },
  )
}

const addCalls = async (request: Parameters<typeof opCalls>[0]) =>
  (await opCalls(request)).filter((call) => call.op === 'add')

test.describe('desktop', () => {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize(DESKTOP)
    await login(page)
  })

  test('C4 C11 all ok: one call per entry, the dialog closes, the toast with 去看, the new torrent first in 下載中; C5 去看 switches to X', async ({
    page,
    request,
  }) => {
    await openAddDesktop(page)
    await pasteText(page, magnet(HEX_A, NAME_A))
    await pickFiles(page, [torrentPayload('Fake.File.S01E01')])
    await expect(rows(page)).toHaveCount(2)
    await chooseX(page)
    await expect(submit(page)).toHaveText('新增 2 個')
    await submit(page).click()
    await expect(addScreen(page)).toHaveCount(0)
    await expect(toastCard(page)).toContainText('已新增 2 個種子')
    const go = toastCard(page).getByRole('button', { name: '去看' })
    await expect(go).toBeVisible()
    expect(await addCalls(request)).toEqual([
      {
        op: 'add',
        urls: magnet(HEX_A, NAME_A),
        category: 'X',
        autoTMM: true,
      },
      {
        op: 'add',
        file: 'Fake.File.S01E01.torrent',
        category: 'X',
        autoTMM: true,
      },
    ])
    // C11: the board (sort 狀態) shows the newest added first in 下載中.
    const downloading = board(page).getByRole('region', { name: /^下載中/ })
    await expect(downloading).toHaveAccessibleName('下載中，3 個')
    await expect(downloading.getByRole('listitem').first()).toContainText(
      'Fake.File.S01E01',
    )
    // The screen and its category did not change.
    expect(new URL(page.url()).searchParams.get('category')).toBeNull()
    await go.click()
    await expect(page).toHaveURL(/category=X/)
    await expect(toastCard(page)).toHaveCount(0)
  })

  test('C5 去看 with one torrent opens its detail once it is there', async ({
    page,
  }) => {
    await openAddDesktop(page)
    await pasteText(page, magnet(HEX_B, NAME_B))
    await chooseX(page)
    await submit(page).click()
    await expect(toastCard(page)).toContainText('已新增 1 個種子')
    await toastCard(page).getByRole('button', { name: '去看' }).click()
    await expect(page).toHaveURL(/category=X/)
    await expect(page).toHaveURL(new RegExp(`hash=${HEX_B}`))
  })

  test('C1 a pasted torrent added elsewhere meanwhile turns 以前下載過 and is not sent', async ({
    page,
    request,
  }) => {
    await openAddDesktop(page)
    await pasteText(
      page,
      [magnet(HEX_A, NAME_A), magnet(HEX_B, NAME_B)].join('\n'),
    )
    await chooseX(page)
    await expect(submit(page)).toHaveText('新增 2 個')
    await addElsewhere(request, HEX_A, NAME_A)
    await expect(rows(page).first()).toContainText('以前下載過，已整理好', {
      timeout: 15_000,
    })
    await expect(submit(page)).toHaveText('新增 1 個')
    await submit(page).click()
    await expect(addScreen(page)).toHaveCount(0)
    expect((await addCalls(request)).map((call) => call.urls)).toEqual([
      magnet(HEX_B, NAME_B),
    ])
  })

  test('C3 sending: 新增中…, 還在等 NAS 回應 after 10 s, Esc, 取消 and ✕ do nothing until it ends', async ({
    page,
    request,
  }) => {
    await useModes(request, { ops: 'slow' })
    await openAddDesktop(page)
    await pasteText(page, magnet(HEX_A, NAME_A))
    await chooseX(page)
    await submit(page).click()
    await expect(submit(page)).toHaveText('新增中…')
    await expect(submit(page)).toHaveAttribute('aria-disabled', 'true')
    // aria-disabled buttons: a real click event, which Playwright's
    // actionability check would refuse to send.
    await page.keyboard.press('Escape')
    await addScreen(page)
      .getByRole('button', { name: '取消' })
      .dispatchEvent('click')
    await addScreen(page)
      .getByRole('button', { name: '關閉' })
      .dispatchEvent('click')
    await expect(addScreen(page)).toBeVisible()
    await expect(waiting(page)).toHaveText('還在等 NAS 回應', {
      timeout: 11_000,
    })
    await expect(addScreen(page)).toHaveCount(0, { timeout: 15_000 })
    await expect(toastCard(page)).toContainText('已新增 1 個種子')
  })

  test('C6 two of four rejected: they stay with reasons, the top line, 新增 2 個 sends only them', async ({
    page,
    request,
  }) => {
    await useModes(request, { ops: 'reject-files' })
    await openAddDesktop(page)
    await pasteText(
      page,
      [magnet(HEX_A, NAME_A), magnet(HEX_B, NAME_B)].join('\n'),
    )
    await pickFiles(page, [
      torrentPayload('Fake.Bad.S01E01'),
      torrentPayload('Fake.Bad.S01E02'),
    ])
    await expect(rows(page)).toHaveCount(4)
    await chooseX(page)
    await submit(page).click()
    await expect(resultLine(page)).toHaveText('2 個加好了，2 個失敗')
    await expect(rows(page)).toHaveCount(2)
    await expect(rows(page).nth(0)).toContainText('Fake.Bad.S01E01')
    await expect(rows(page).nth(0)).toContainText('qBittorrent 讀不了這個檔案')
    await expect(rows(page).nth(1)).toContainText('qBittorrent 讀不了這個檔案')
    await expect(submit(page)).toHaveText('新增 2 個')
    await expect(toastCard(page)).toHaveCount(0)

    // Not `data`: that would also drop the two added torrents.
    await setModes(request, { ops: 'normal' })
    await submit(page).click()
    await expect(addScreen(page)).toHaveCount(0)
    await expect(toastCard(page)).toContainText('已新增 2 個種子')
    const calls = await addCalls(request)
    expect(
      calls.map((call) => [call.file ?? call.urls, call.rejected]),
    ).toEqual([
      [magnet(HEX_A, NAME_A), undefined],
      [magnet(HEX_B, NAME_B), undefined],
      ['Fake.Bad.S01E01.torrent', true],
      ['Fake.Bad.S01E02.torrent', true],
      ['Fake.Bad.S01E01.torrent', undefined],
      ['Fake.Bad.S01E02.torrent', undefined],
    ])
  })

  test('C7 a whole failure: the toast with 重試, list and category stay; 重試 resends the same', async ({
    page,
    request,
    watch,
  }) => {
    watch.allowForcedStatus(413, '/_serverFn')
    await openAddDesktop(page)
    await pasteText(page, magnet(HEX_A, NAME_A))
    await chooseX(page)
    await failNextAdd(page)
    await submit(page).click()
    await expect(toastCard(page)).toContainText('新增失敗：送出的資料格式不對')
    await expect(addScreen(page)).toBeVisible()
    await expect(rows(page)).toHaveCount(1)
    await expect(
      addScreen(page).getByRole('combobox', { name: '分類' }),
    ).toHaveValue('X')
    await expect(submit(page)).toHaveText('新增 1 個')
    expect(await addCalls(request)).toEqual([])
    await toastCard(page).getByRole('button', { name: '重試' }).click()
    await expect(addScreen(page)).toHaveCount(0)
    await expect(toastCard(page)).toContainText('已新增 1 個種子')
    expect((await addCalls(request)).map((call) => call.urls)).toEqual([
      magnet(HEX_A, NAME_A),
    ])
  })

  test('C8 qBittorrent unreachable: only the global handler, the list stays, the button works', async ({
    page,
    request,
  }) => {
    await useModes(request, { ops: 'drop' })
    await openAddDesktop(page)
    await pasteText(page, magnet(HEX_A, NAME_A))
    await chooseX(page)
    await submit(page).click()
    await expect(submit(page)).toHaveText('新增 1 個')
    await expect(submit(page)).not.toHaveAttribute('aria-disabled', 'true')
    await expect(addScreen(page)).toBeVisible()
    await expect(rows(page)).toHaveCount(1)
    await expect(toastCard(page)).toHaveCount(0)
    await setModes(request, { ops: 'normal' })
    await submit(page).click()
    await expect(addScreen(page)).toHaveCount(0)
  })

  test('C9 logged out: not_logged_in goes to login and the list is gone', async ({
    page,
  }) => {
    await openAddDesktop(page)
    await pasteText(page, magnet(HEX_A, NAME_A))
    await chooseX(page)
    await page.context().clearCookies()
    await submit(page).click()
    await expect(page.getByLabel('帳號')).toBeVisible()
    await expect(addScreen(page)).toHaveCount(0)
    // Back in, the add screen starts empty.
    await login(page)
    await openAddDesktop(page)
    await expect(addScreen(page).locator('[data-add-box]')).toBeVisible()
    await expect(rows(page)).toHaveCount(0)
  })

  test('C10 no categories: the line under the menu, 新增 disabled', async ({
    page,
    request,
  }) => {
    await useModes(request, { cats: 'none' })
    await page.reload()
    await openAddDesktop(page)
    await pasteText(page, magnet(HEX_A, NAME_A))
    await expect(addScreen(page).locator('[data-add-path]')).toHaveText(
      'qBittorrent 還沒有分類',
    )
    await expect(submit(page)).toHaveAttribute('aria-disabled', 'true')
    await submit(page).dispatchEvent('click')
    expect(await addCalls(request)).toEqual([])
  })
})

test.describe('phone', () => {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize(PHONE)
    await login(page)
  })

  test('C3 sending: the ✕ and a drag down do nothing until it ends; C4 then it closes with the toast', async ({
    page,
    request,
  }) => {
    await useModes(request, { ops: 'slow' })
    await openAddPhone(page)
    await pasteText(page, magnet(HEX_A, NAME_A))
    await chooseX(page)
    await settled(page)
    await submit(page).click()
    await expect(submit(page)).toHaveText('新增中…')
    const close = addScreen(page).getByRole('button', { name: '關閉' })
    await expect(close).toHaveAttribute('aria-disabled', 'true')
    await close.dispatchEvent('click')
    // Drag the sheet's top edge far down.
    const top = await addScreen(page).evaluate(
      (element) => element.getBoundingClientRect().top,
    )
    await page.mouse.move(PHONE.width / 2, top + 10)
    await page.mouse.down()
    await page.mouse.move(PHONE.width / 2, top + 600, { steps: 12 })
    await page.mouse.up()
    await settled(page)
    await expect(addScreen(page)).toBeVisible()
    await noSideScroll(page)
    await expect(addScreen(page)).toHaveCount(0, { timeout: 15_000 })
    await expect(toastCard(page)).toContainText('已新增 1 個種子')
  })

  test('C6 a partial failure on the phone: reasons under the names, the top line, no sideways scroll', async ({
    page,
    request,
  }) => {
    await useModes(request, { ops: 'reject-files' })
    await openAddPhone(page)
    await pasteText(page, magnet(HEX_A, NAME_A))
    await pickFiles(page, [torrentPayload('Fake.Bad.S01E01')])
    await expect(rows(page)).toHaveCount(2)
    await chooseX(page)
    await submit(page).click()
    await expect(resultLine(page)).toHaveText('1 個加好了，1 個失敗')
    await expect(rows(page)).toHaveCount(1)
    await expect(rows(page).first()).toContainText('qBittorrent 讀不了這個檔案')
    await expect(submit(page)).toHaveText('新增 1 個')
    await noSideScroll(page)
  })
})

test('screenshots: 新增中, all ok, partial failure, whole failure, no categories; desktop and phone, light and dark', async ({
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
    const openAdd = () => (desktop ? openAddDesktop(page) : openAddPhone(page))
    const home = async () => {
      await page.goto('/')
      await expect(page.locator(`#${MAIN_ID} > *`).first()).toBeVisible()
    }
    for (const scheme of SCHEMES) {
      await page.emulateMedia({ colorScheme: scheme })

      // 新增中 (ops=slow answers each add after 12 s).
      await useModes(request, { ops: 'slow' })
      await home()
      await openAdd()
      await pasteText(
        page,
        [magnet(HEX_A, NAME_A), magnet(HEX_B, NAME_B)].join('\n'),
      )
      await chooseX(page)
      await submit(page).click()
      await expect(submit(page)).toHaveText('新增中…')
      await settled(page)
      await shot('sending', scheme)
      // Two entries, 12 s each, one after the other.
      await expect(addScreen(page)).toHaveCount(0, { timeout: 30_000 })

      // All ok: the toast with 去看.
      await expect(toastCard(page)).toContainText('已新增 2 個種子')
      await settled(page)
      await shot('all-ok-toast', scheme)

      // Partial failure.
      await useModes(request, { ops: 'reject-files' })
      await home()
      await openAdd()
      await pasteText(
        page,
        [magnet(HEX_A, NAME_A), magnet(HEX_B, NAME_B)].join('\n'),
      )
      await pickFiles(page, [
        torrentPayload('Fake.Bad.S01E01'),
        torrentPayload('Fake.Bad.S01E02'),
      ])
      await expect(rows(page)).toHaveCount(4)
      await chooseX(page)
      await submit(page).click()
      await expect(resultLine(page)).toHaveText('2 個加好了，2 個失敗')
      await settled(page)
      await shot('partial-failure', scheme)

      // Whole failure: the toast with 重試 over the dialog that stays.
      await useModes(request, {})
      await home()
      await openAdd()
      await pasteText(page, magnet(HEX_A, NAME_A))
      await chooseX(page)
      await failNextAdd(page)
      await submit(page).click()
      await expect(toastCard(page)).toContainText('新增失敗')
      await settled(page)
      await shot('whole-failure-toast', scheme)

      // No categories.
      await useModes(request, { cats: 'none' })
      await home()
      await openAdd()
      await pasteText(page, magnet(HEX_A, NAME_A))
      await expect(addScreen(page).locator('[data-add-path]')).toHaveText(
        'qBittorrent 還沒有分類',
      )
      await settled(page)
      await shot('no-categories', scheme)
      if (!desktop) await noSideScroll(page)
    }
    await context.close()
  }
})
