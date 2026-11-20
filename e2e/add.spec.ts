import type { Page } from '@playwright/test'
import {
  singleFileInfo,
  torrentBytes,
} from '../src/lib/bencode-testing'
import {
  DEFAULT_MODES,
  MAIN_ID,
  expect,
  login,
  openList,
  setModes,
  test,
} from './fixtures'

// Story 4.6: the add screen (paste, pick, drag) in Chromium against the
// built server and scripts/fake-qbit.mjs. Nothing is sent: submitting is
// story 4.7, and AD-15 keeps every write away from a real qBittorrent.
// Sample data: E01 to E06 (hashes 1 to 6), E05 and E06 archived. Pastes are
// `paste` events with a DataTransfer (the app never reads the clipboard
// API), files go through the hidden input (`setInputFiles`) or a synthetic
// drag with a DataTransfer of Files. Test torrents are generated with
// bencode (fake names, a tracker that resolves nowhere). Screenshots for
// the PR in screenshots/4-6, desktop 1440 and phone 390, light and dark.

const SCREENSHOT_DIR = '_bmad-output/implementation-artifacts/screenshots/4-6'
const DESKTOP = { width: 1440, height: 900 }
const PHONE = { width: 390, height: 844 }
const SCHEMES = ['light', 'dark'] as const
const hashOf = (n: number) => n.toString(16).padStart(40, '0')
const nameOf = (n: number) => `Fake.Show.S01E0${n}.1080p`
const fakeHex = (seed: string) => seed.repeat(40).slice(0, 40)
const magnet = (hash: string, name?: string) =>
  name === undefined
    ? `magnet:?xt=urn:btih:${hash}`
    : `magnet:?xt=urn:btih:${hash}&dn=${encodeURIComponent(name)}`

/** 40 hex to the 32-char base32 btih (the same torrent). */
function base32(hex: string): string {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'
  let bits = ''
  for (const char of hex) bits += parseInt(char, 16).toString(2).padStart(4, '0')
  let out = ''
  for (let i = 0; i < bits.length; i += 5) {
    out += alphabet[parseInt(bits.slice(i, i + 5), 2)]
  }
  return out
}

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
const TEXT_FILE: FilePayload = {
  name: 'notes.txt',
  mimeType: 'text/plain',
  buffer: Buffer.from('not a torrent'),
}
const HUGE_FILE: FilePayload = {
  name: 'huge.torrent',
  mimeType: 'application/x-bittorrent',
  buffer: Buffer.alloc(11 * 1024 * 1024),
}

/** The ten lines of A2: magnets in every form, a link, junk, a repeat. */
const TEN_LINES = [
  magnet(fakeHex('a'), 'Fake.Add.S01E01.1080p'),
  magnet(base32(fakeHex('a'))),
  magnet(fakeHex('b')),
  'https://example.invalid/fake.torrent',
  'junk',
  magnet(hashOf(5), nameOf(5)),
  magnet(fakeHex('c'), 'Fake.Add.S01E03.1080p'),
  magnet(fakeHex('b')),
  magnet(fakeHex('d').toUpperCase(), 'Fake.Add.S01E04.1080p'),
  magnet(hashOf(1)),
].join('\n')

test.beforeEach(async ({ request }) => {
  await setModes(request, { ...DEFAULT_MODES })
})

test.afterEach(async ({ request }) => {
  await setModes(request, DEFAULT_MODES)
})

const addScreen = (page: Page) =>
  page.getByRole('dialog', { name: '新增種子' })
const rows = (page: Page) => addScreen(page).locator('[data-add-row]')
const submit = (page: Page) => addScreen(page).locator('[data-add-submit]')
const skipped = (page: Page) => addScreen(page).locator('[data-add-skipped]')
const categoryMenu = (page: Page) =>
  addScreen(page).getByRole('combobox', { name: '分類' })
const pathLine = (page: Page) => addScreen(page).locator('[data-add-path]')
const box = (page: Page) => addScreen(page).locator('[data-add-box]')
const overlay = (page: Page) => page.locator('[data-drop-overlay]')

async function openAddDesktop(page: Page) {
  await page
    .locator('header')
    .getByRole('button', { name: '新增', exact: true })
    .click()
  await expect(addScreen(page)).toBeVisible()
}

async function openAddPhone(page: Page) {
  await page.getByRole('button', { name: '新增種子', exact: true }).first().click()
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

/** Fires a drag of `files` (or of text) at the page, then optionally drops. */
async function dragFiles(
  page: Page,
  files: Array<{ name: string; text: string }>,
  { drop = false, text = false } = {},
) {
  await page.evaluate(
    ({ files: list, drop: dropIt, text: asText }) => {
      const data = new DataTransfer()
      if (asText) data.setData('text/plain', 'some selected text')
      for (const file of list) data.items.add(new File([file.text], file.name))
      const fire = (type: string) =>
        document.body.dispatchEvent(
          new DragEvent(type, {
            dataTransfer: data,
            bubbles: true,
            cancelable: true,
          }),
        )
      fire('dragenter')
      fire('dragover')
      if (dropIt) fire('drop')
    },
    { files, drop, text },
  )
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

test.describe('desktop', () => {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize(DESKTOP)
    await login(page)
  })

  test('A1 opens the 640px dialog empty with 新增 disabled; A7 in 全部 the menu is empty', async ({
    page,
  }) => {
    await openAddDesktop(page)
    await settled(page)
    const size = await addScreen(page).boundingBox()
    expect(Math.round(size?.width ?? 0)).toBe(640)
    await expect(box(page)).toBeVisible()
    await expect(box(page)).toContainText(
      '貼上磁力連結，或把 .torrent 檔拖進來',
    )
    await expect(submit(page)).toHaveText('新增')
    await expect(submit(page)).toHaveAttribute('aria-disabled', 'true')
    await expect(categoryMenu(page)).toHaveValue('')
    await expect(addScreen(page).locator('[data-add-paste]')).toBeFocused()
    // The dialog layer: `/` does not open the search box.
    await addScreen(page).getByRole('button', { name: '取消' }).focus()
    await page.keyboard.press('/')
    await expect(page.getByPlaceholder('找名字')).toHaveCount(0)
    await expect(addScreen(page)).toBeVisible()
  })

  test('A2 A4 A9 paste ten lines: problems first, a repeat merged, the footer counts', async ({
    page,
  }) => {
    await openAddDesktop(page)
    await pasteText(page, TEN_LINES)
    await expect(rows(page)).toHaveCount(8)
    expect(
      await rows(page).evaluateAll((items) =>
        items.map((item) => (item as HTMLElement).dataset.addRow),
      ),
    ).toEqual([
      'unreadable',
      'unreadable',
      'existing',
      'existing',
      'addable',
      'addable',
      'addable',
      'addable',
    ])
    await expect(rows(page).nth(0)).toContainText('看不懂這個連結')
    await expect(rows(page).nth(0)).toContainText('拿掉')
    await expect(rows(page).nth(2)).toContainText(nameOf(5))
    await expect(rows(page).nth(2)).toContainText('以前下載過，已整理好')
    await expect(rows(page).nth(2)).toContainText('打開')
    await expect(skipped(page)).toHaveText('有 4 個不會加')
    await expect(submit(page)).toHaveText('新增 4 個')
    // Disabled until a category is chosen.
    await expect(submit(page)).toHaveAttribute('aria-disabled', 'true')
    await categoryMenu(page).selectOption('X')
    await expect(submit(page)).not.toHaveAttribute('aria-disabled', 'true')
    // Pressing it sends nothing yet (4.7): the screen stays.
    await submit(page).click()
    await expect(addScreen(page)).toBeVisible()
  })

  test('the list scrolls inside its frame and the footer stays on screen', async ({
    page,
  }) => {
    await openAddDesktop(page)
    await pasteText(
      page,
      [
        'junk',
        ...Array.from({ length: 40 }, (_, index) =>
          magnet(
            (index + 0x100).toString(16).padStart(40, '0'),
            `Fake.Many.S01E${index}`,
          ),
        ),
      ].join('\n'),
    )
    await expect(rows(page)).toHaveCount(41)
    const list = addScreen(page).locator('[data-add-list]')
    const scrolls = await list.evaluate(
      (element) => element.scrollHeight > element.clientHeight,
    )
    expect(scrolls).toBe(true)
    const dialogBox = await addScreen(page).boundingBox()
    expect((dialogBox?.y ?? 0) + (dialogBox?.height ?? 0)).toBeLessThanOrEqual(
      DESKTOP.height,
    )
    await expect(submit(page)).toBeInViewport()
    await list.evaluate((element) => {
      element.scrollTop = element.scrollHeight
    })
    await expect(submit(page)).toBeInViewport()
    await expect(addScreen(page).locator('[data-add-strip]')).toBeInViewport()
  })

  test('A3 pick files: a torrent, a non-torrent, an 11 MB file; A10 they join the pasted rows', async ({
    page,
  }) => {
    await openAddDesktop(page)
    await pasteText(page, magnet(fakeHex('a'), 'Fake.Add.S01E01.1080p'))
    await expect(rows(page)).toHaveCount(1)
    await pickFiles(page, [
      torrentPayload('Fake.File.S01'),
      TEXT_FILE,
      HUGE_FILE,
    ])
    await expect(rows(page)).toHaveCount(4)
    await expect(rows(page).nth(0)).toContainText('notes.txt')
    await expect(rows(page).nth(0)).toContainText('看不懂這個檔案')
    await expect(rows(page).nth(1)).toContainText('huge.torrent')
    await expect(rows(page).nth(1)).toContainText('檔案超過 10 MB')
    await expect(rows(page).nth(2)).toContainText('Fake.Add.S01E01.1080p')
    await expect(rows(page).nth(3)).toContainText('Fake.File.S01')
    // A10: a magnet of the same hash pasted again merges into its row.
    await pasteText(page, magnet(base32(fakeHex('a'))))
    await expect(rows(page)).toHaveCount(4)
  })

  test('A5 ✕ and 拿掉 remove rows; with none left the box comes back', async ({
    page,
  }) => {
    await openAddDesktop(page)
    await pasteText(page, `junk\n${magnet(fakeHex('a'), 'Fake.Add.A')}`)
    await expect(rows(page)).toHaveCount(2)
    await rows(page).nth(0).getByRole('button', { name: '拿掉 junk' }).first().click()
    await expect(rows(page)).toHaveCount(1)
    await expect(skipped(page)).toHaveText('')
    await expect(submit(page)).toHaveText('新增 1 個')
    await rows(page).nth(0).locator('[data-add-remove]').click()
    await expect(rows(page)).toHaveCount(0)
    await expect(box(page)).toBeVisible()
    await expect(submit(page)).toHaveText('新增')
  })

  test('A6 打開 on an archived torrent: the list detail shows it with no position', async ({
    page,
  }) => {
    await openList(page)
    await openAddDesktop(page)
    await pasteText(page, magnet(hashOf(5)))
    await addScreen(page)
      .getByRole('button', { name: `打開 ${magnet(hashOf(5))}` })
      .click()
    await expect(addScreen(page)).toHaveCount(0)
    await expect(page).toHaveURL(new RegExp(`hash=${hashOf(5)}`))
    const panel = page.locator('aside[aria-label="詳情"]')
    await expect(panel.getByRole('heading', { name: nameOf(5) })).toBeVisible()
    await expect(panel).not.toContainText('個／共')
    await expect(panel.getByRole('button', { name: '上一個' })).toHaveCount(0)
    // Choosing a row ends it: N of M is back.
    await page
      .locator(`[role="listitem"][data-hash="${hashOf(1)}"] button[aria-current]`)
      .first()
      .click()
    await expect(panel).toContainText('個／共')
  })

  test('A7 opened in mteam-X the menu is preset; A8 the path line follows the choice', async ({
    page,
    request,
  }) => {
    await setModes(request, { cats: 'default-path' })
    await page.goto('/?category=mteam-X')
    await expect(page.locator(`#${MAIN_ID} > *`).first()).toBeVisible()
    await openAddDesktop(page)
    await expect(categoryMenu(page)).toHaveValue('mteam-X')
    await expect(pathLine(page)).toHaveText('會存到 /data/torrent/mteam-seed')
    await expect(pathLine(page).locator('.font-mono')).toHaveText(
      '/data/torrent/mteam-seed',
    )
    await categoryMenu(page).selectOption('X-default')
    await expect(pathLine(page)).toHaveText('會存到 qBittorrent 的預設位置')
    await categoryMenu(page).selectOption('X')
    await expect(pathLine(page)).toHaveText('會存到 /data/media/X')
  })

  test('D1 a file drag shows 放開就新增; the drop opens add with the files, and appends when open', async ({
    page,
  }) => {
    const torrent = torrentBytes(singleFileInfo({ name: 'Fake.Dropped.S01' }))
    await dragFiles(page, [{ name: 'a.torrent', text: 'x' }])
    await expect(overlay(page)).toBeVisible()
    await expect(overlay(page)).toContainText('放開就新增')
    await page.evaluate((bytes) => {
      const data = new DataTransfer()
      data.items.add(
        new File([new Uint8Array(bytes)], 'Fake.Dropped.S01.torrent'),
      )
      const fire = (type: string) =>
        document.body.dispatchEvent(
          new DragEvent(type, {
            dataTransfer: data,
            bubbles: true,
            cancelable: true,
          }),
        )
      fire('dragover')
      fire('drop')
    }, Array.from(torrent))
    await expect(overlay(page)).toHaveCount(0)
    await expect(addScreen(page)).toBeVisible()
    await expect(rows(page)).toHaveCount(1)
    await expect(rows(page).nth(0)).toContainText('Fake.Dropped.S01')
    // Open: another drop appends.
    await dragFiles(page, [{ name: 'notes.txt', text: 'hello' }], {
      drop: true,
    })
    await expect(rows(page)).toHaveCount(2)
    await expect(rows(page).nth(0)).toContainText('看不懂這個檔案')
  })

  test('D2 leaving the window or Esc hides the overlay; D3 a text drag shows nothing', async ({
    page,
  }) => {
    await dragFiles(page, [{ name: 'a.torrent', text: 'x' }])
    await expect(overlay(page)).toBeVisible()
    await page.evaluate(() => {
      const data = new DataTransfer()
      data.items.add(new File(['x'], 'a.torrent'))
      document.body.dispatchEvent(
        new DragEvent('dragleave', { dataTransfer: data, bubbles: true }),
      )
    })
    await expect(overlay(page)).toHaveCount(0)
    await dragFiles(page, [{ name: 'a.torrent', text: 'x' }])
    await expect(overlay(page)).toBeVisible()
    await page.keyboard.press('Escape')
    await expect(overlay(page)).toHaveCount(0)
    await dragFiles(page, [], { text: true })
    await expect(overlay(page)).toHaveCount(0)
    await expect(addScreen(page)).toHaveCount(0)
  })

  for (const how of ['取消', '關閉', 'Escape'] as const) {
    test(`C1 ${how} closes with rows and the next open is empty`, async ({
      page,
    }) => {
      await openAddDesktop(page)
      await pasteText(page, magnet(fakeHex('a'), 'Fake.Add.A'))
      await expect(rows(page)).toHaveCount(1)
      if (how === 'Escape') await page.keyboard.press('Escape')
      else
        await addScreen(page)
          .getByRole('button', { name: how, exact: true })
          .click()
      await expect(addScreen(page)).toHaveCount(0)
      await openAddDesktop(page)
      await expect(rows(page)).toHaveCount(0)
      await expect(box(page)).toBeVisible()
    })
  }
})

test.describe('phone', () => {
  test.use({ hasTouch: true })

  test.beforeEach(async ({ page }) => {
    await page.setViewportSize(PHONE)
    await login(page)
  })

  test('A1 the round button opens the 90% sheet; A5 remove; C1 ✕ closes and the next open is empty', async ({
    page,
  }) => {
    await openAddPhone(page)
    await settled(page)
    const sheet = page.locator('[data-slot="bottom-sheet"]')
    const box90 = await sheet.evaluate(
      (element) => window.innerHeight - element.getBoundingClientRect().top,
    )
    expect(Math.abs(box90 - PHONE.height * 0.9)).toBeLessThan(2)
    await expect(box(page)).toContainText('貼上磁力連結')
    await expect(box(page)).not.toContainText('拖')
    await expect(addScreen(page).getByRole('button', { name: '取消' })).toHaveCount(0)
    await expect(submit(page)).toHaveText('新增')
    await pasteText(page, TEN_LINES)
    await expect(rows(page)).toHaveCount(8)
    await noSideScroll(page)
    await rows(page).nth(0).locator('[data-add-remove]').click()
    await expect(rows(page)).toHaveCount(7)
    await addScreen(page).getByRole('button', { name: '關閉', exact: true }).click()
    await expect(addScreen(page)).toHaveCount(0)
    await openAddPhone(page)
    await expect(rows(page)).toHaveCount(0)
  })

  test('the footer stays visible with many rows; no overlay below 1024px (D4)', async ({
    page,
  }) => {
    await dragFiles(page, [{ name: 'a.torrent', text: 'x' }])
    await expect(overlay(page)).toHaveCount(0)
    await openAddPhone(page)
    await pasteText(
      page,
      Array.from({ length: 30 }, (_, index) =>
        magnet((index + 0x200).toString(16).padStart(40, '0')),
      ).join('\n'),
    )
    await expect(rows(page)).toHaveCount(30)
    await settled(page)
    await expect(submit(page)).toBeInViewport()
    await page
      .locator('[data-slot="bottom-sheet-content"]')
      .evaluate((element) => {
        element.scrollTop = element.scrollHeight
      })
    await expect(submit(page)).toBeInViewport()
    await noSideScroll(page)
  })

  test('A6 打開 on an archived torrent opens the sheet with no position', async ({
    page,
  }) => {
    await openList(page)
    await openAddPhone(page)
    await pasteText(page, magnet(hashOf(5), nameOf(5)))
    await addScreen(page)
      .getByRole('button', { name: `打開 ${nameOf(5)}` })
      .click()
    const detail = page.getByRole('dialog', { name: nameOf(5) })
    await expect(detail).toBeVisible()
    await expect(detail).not.toContainText('個／共')
    await expect(detail.getByRole('button', { name: '上一個' })).toHaveCount(0)
  })
})

test('screenshots: empty in 全部, ten entries, drop overlay; desktop and phone, light and dark', async ({
  browser,
}) => {
  test.setTimeout(240_000)
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
      await page.goto('/')
      await expect(page.locator(`#${MAIN_ID} > *`).first()).toBeVisible()
      if (desktop) await openAddDesktop(page)
      else await openAddPhone(page)
      await settled(page)
      await shot('empty-all', scheme)

      // Ten entries: unreadable link and file, too large, existing, addable.
      await pasteText(
        page,
        [
          'https://example.invalid/fake.torrent',
          magnet(hashOf(5), nameOf(5)),
          magnet(fakeHex('a'), 'Fake.Add.S01E01.1080p'),
          magnet(fakeHex('b'), 'Fake.Add.S01E02.1080p'),
          magnet(fakeHex('c'), 'Fake.Add.S01E03.1080p'),
          magnet(base32(fakeHex('c'))),
          magnet(fakeHex('d')),
        ].join('\n'),
      )
      await pickFiles(page, [
        torrentPayload('Fake.File.S01'),
        TEXT_FILE,
        HUGE_FILE,
      ])
      await expect(rows(page)).toHaveCount(9)
      await addScreen(page)
        .getByRole('combobox', { name: '分類' })
        .selectOption('X')
      await settled(page)
      await shot('ten-entries', scheme)
      if (!desktop) await noSideScroll(page)

      if (desktop) {
        await page.keyboard.press('Escape')
        await expect(addScreen(page)).toHaveCount(0)
        await dragFiles(page, [{ name: 'a.torrent', text: 'x' }])
        await expect(overlay(page)).toBeVisible()
        await settled(page)
        await shot('drop-overlay', scheme)
        // A real Esc also cancels the drag (`dragend`); the synthetic one
        // ends here so the next scheme's drag shows the overlay again.
        await page.keyboard.press('Escape')
        await page.evaluate(() => window.dispatchEvent(new Event('dragend')))
      } else {
        await addScreen(page)
          .getByRole('button', { name: '關閉', exact: true })
          .click()
        await expect(addScreen(page)).toHaveCount(0)
      }
    }
    await context.close()
  }
})
