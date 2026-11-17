import type { Locator, Page } from '@playwright/test'
import {
  DEFAULT_MODES,
  expect,
  filesRequests,
  login,
  opCalls,
  setModes,
  test,
} from './fixtures'
import type { Modes } from './fixtures'

// Story 2.7: the detail's 檔案 tab in Chromium against the built server and
// scripts/fake-qbit.mjs (fake data only, AD-15: the fake records filePrio
// calls and applies them to its next files answer). Sample data: E01
// (downloading) has four files: E01, E02 (高), E03 and an unticked
// trailer; E03 (stalled) has 1000 files. States data: 0x3002 still
// fetches its metadata. Screenshots for the PR: desktop list mode, the
// board's narrow panel and the phone sheet, each with data, loading,
// failed and meta, light and dark.

const SCREENSHOT_DIR = 'e2e-output/screenshots/2-7'
const DESKTOP = { width: 1440, height: 900 }
const PHONE = { width: 390, height: 844 }
const SCHEMES = ['light', 'dark'] as const
const hashOf = (n: number) => n.toString(16).padStart(40, '0')
const E01 = hashOf(1)
const ROOT = 'Fake.Show.S01E01.1080p'
const fileName = (episode: string) => `${ROOT}/${ROOT}.E${episode}.mkv`
const META = hashOf(0x3002)
const FAILURE = '改檔案設定失敗：qBittorrent 拒絕這個操作'

test.beforeEach(async ({ request }) => {
  await setModes(request, DEFAULT_MODES)
})

test.afterEach(async ({ request }) => {
  await setModes(request, DEFAULT_MODES)
})

const panel = (page: Page) => page.getByRole('complementary', { name: '詳情' })
const sheet = (page: Page) => page.getByRole('dialog')
const toastCard = (page: Page) => page.locator('[data-slot="toast"]')
const fileList = (page: Page) =>
  page.getByRole('list', { name: '檔案清單', exact: true })
const checkbox = (page: Page, name: string) =>
  page.getByRole('checkbox', { name: `下載這個檔案：${name}`, exact: true })
const pill = (page: Page, name: string) =>
  page.locator(`button[aria-label^="優先順序："][aria-label$="，${name}"]`)

/**
 * Waits until no finite animation runs (slides, fades, the toast's rise).
 * The skeleton's pulse repeats forever, so it is not waited for.
 */
async function settled(page: Page) {
  await page.waitForFunction(() =>
    document
      .getAnimations()
      .every(
        (animation) =>
          animation.playState !== 'running' ||
          animation.effect?.getTiming().iterations === Infinity,
      ),
  )
}

async function openFilesTab(scope: Locator) {
  await scope.getByRole('tab', { name: '檔案' }).click()
  await expect(scope.getByRole('tab', { name: '檔案' })).toHaveAttribute(
    'aria-selected',
    'true',
  )
}

test('untick and re-tick a file and change a priority: one filePrio call each, no toast, the row follows the refetch', async ({
  page,
  request,
}) => {
  await page.setViewportSize(DESKTOP)
  await login(page)
  await page.goto(`/?sort=added_on&hash=${E01}`)
  await expect(panel(page)).toBeVisible()
  await openFilesTab(panel(page))
  await expect(fileList(page).getByRole('listitem')).toHaveCount(4)
  await expect(checkbox(page, fileName('01'))).toHaveAttribute(
    'aria-checked',
    'true',
  )
  await expect(pill(page, fileName('02'))).toHaveText('高')
  // The trailer is unticked: 不下載, its pill disabled.
  const trailer = `${ROOT}/Extras/${ROOT}.Extras.Trailer.mkv`
  await expect(pill(page, trailer)).toHaveText('不下載')
  await expect(pill(page, trailer)).toBeDisabled()

  await checkbox(page, fileName('01')).click()
  await expect(checkbox(page, fileName('01'))).toHaveAttribute(
    'aria-checked',
    'false',
  )
  await expect(pill(page, fileName('01'))).toHaveText('不下載')
  await expect(pill(page, fileName('01'))).toBeDisabled()
  expect(await opCalls(request)).toEqual([
    { op: 'filePrio', hash: E01, ids: [0], priority: 0 },
  ])
  await expect(toastCard(page)).toHaveCount(0)

  await checkbox(page, fileName('01')).click()
  await expect(checkbox(page, fileName('01'))).toHaveAttribute(
    'aria-checked',
    'true',
  )
  await expect(pill(page, fileName('01'))).toHaveText('一般')

  await pill(page, fileName('03')).click()
  await expect(page.getByRole('menuitemradio')).toHaveText([
    '一般',
    '高',
    '最高',
  ])
  await page.getByRole('menuitemradio', { name: '最高' }).click()
  await expect(pill(page, fileName('03'))).toHaveText('最高')
  // Choosing the current level sends nothing.
  await pill(page, fileName('03')).click()
  await page.getByRole('menuitemradio', { name: '最高' }).click()
  await page.waitForTimeout(500)
  expect(await opCalls(request)).toEqual([
    { op: 'filePrio', hash: E01, ids: [0], priority: 0 },
    { op: 'filePrio', hash: E01, ids: [0], priority: 1 },
    { op: 'filePrio', hash: E01, ids: [2], priority: 7 },
  ])
  await expect(toastCard(page)).toHaveCount(0)
  // The panel stays open after a click in the portaled menu.
  await expect(panel(page)).toBeVisible()
})

test('rejected: the failure toast with 重試; 重試 resends; the row is usable again', async ({
  page,
  request,
}) => {
  await setModes(request, { ops: 'reject' })
  await page.setViewportSize(DESKTOP)
  await login(page)
  await page.goto(`/?hash=${E01}`)
  await expect(panel(page)).toBeVisible()
  await openFilesTab(panel(page))

  await checkbox(page, fileName('01')).click()
  await expect(toastCard(page)).toContainText(FAILURE)
  await expect(checkbox(page, fileName('01'))).toBeEnabled()
  await expect(checkbox(page, fileName('01'))).toHaveAttribute(
    'aria-checked',
    'true',
  )
  const rejected = {
    op: 'filePrio',
    hash: E01,
    ids: [0],
    priority: 0,
    rejected: true,
  }
  expect(await opCalls(request)).toEqual([rejected])

  await setModes(request, { ops: 'normal' })
  await toastCard(page).getByRole('button', { name: '重試' }).click()
  await expect(toastCard(page)).toHaveCount(0)
  await expect(checkbox(page, fileName('01'))).toHaveAttribute(
    'aria-checked',
    'false',
  )
  expect(await opCalls(request)).toEqual([
    rejected,
    { op: 'filePrio', hash: E01, ids: [0], priority: 0 },
  ])
})

const LAST_OF_1000 = 'Fake.Show.S01E03.1080p/Fake.Show.S01E03.1080p.E1000.mkv'

test('1000 files: under 60 rows in the DOM; the last one scrolls into view', async ({
  page,
}) => {
  await page.setViewportSize(DESKTOP)
  await login(page)
  await page.goto(`/?sort=added_on&hash=${hashOf(3)}`)
  await expect(panel(page)).toBeVisible()
  await openFilesTab(panel(page))
  const rows = fileList(page).getByRole('listitem')
  await expect(rows.first()).toBeVisible()
  expect(await rows.count()).toBeLessThan(60)
  await expect(rows.first()).toHaveAttribute('aria-setsize', '1000')
  await page.getByRole('tabpanel').evaluate((scroller) => {
    scroller.scrollTop = scroller.scrollHeight
  })
  await expect(checkbox(page, LAST_OF_1000)).toBeInViewport()
  expect(await rows.count()).toBeLessThan(60)
})

test('phone 390, 1000 files: the sheet content scrolls the rows; under 60 in the DOM', async ({
  page,
}) => {
  await page.setViewportSize(PHONE)
  await login(page)
  await page.goto(`/?hash=${hashOf(3)}`)
  await expect(sheet(page)).toBeVisible()
  await settled(page)
  await openFilesTab(sheet(page))
  const rows = fileList(page).getByRole('listitem')
  await expect(rows.first()).toBeVisible()
  expect(await rows.count()).toBeLessThan(60)
  await sheet(page)
    .locator('[data-slot="bottom-sheet-content"]')
    .evaluate((scroller) => {
      scroller.scrollTop = scroller.scrollHeight
    })
  await expect(checkbox(page, LAST_OF_1000)).toBeInViewport()
  expect(await rows.count()).toBeLessThan(60)
})

test('switching tabs starts the panel at the top', async ({ page }) => {
  // Short enough that the overview scrolls; E03's 1000 files keep the
  // files tab taller than the panel, so a 0 is the reset, not a clamp.
  await page.setViewportSize({ width: 1440, height: 520 })
  await login(page)
  await page.goto(`/?sort=added_on&hash=${hashOf(3)}`)
  await expect(panel(page)).toBeVisible()
  const scroller = page.getByRole('tabpanel')
  const scrolled = await scroller.evaluate((element) => {
    element.scrollTop = 200
    return element.scrollTop
  })
  expect(scrolled).toBeGreaterThan(0)
  await openFilesTab(panel(page))
  await expect(fileList(page).getByRole('listitem').first()).toBeVisible()
  expect(await scroller.evaluate((element) => element.scrollTop)).toBe(0)
  expect(
    await scroller.evaluate(
      (element) => element.scrollHeight > element.clientHeight + 200,
    ),
  ).toBe(true)
})

test('a torrent still fetching its metadata: the wait text, no files request', async ({
  page,
  request,
}) => {
  await setModes(request, { data: 'states' })
  await page.setViewportSize(DESKTOP)
  await login(page)
  await page.goto(`/?hash=${META}`)
  await expect(panel(page)).toBeVisible()
  await openFilesTab(panel(page))
  await expect(
    panel(page).getByText('還在抓種子資訊，檔案清單等一下才有'),
  ).toBeVisible()
  // The fake logs every torrents/files request by hash: none for it, even
  // after a poll interval.
  await page.waitForTimeout(5500)
  expect(await filesRequests(request)).not.toContain(META)
  // The log does see a real one: another torrent's files tab.
  const downloading = hashOf(0x3001)
  await page.goto(`/?hash=${downloading}`)
  await openFilesTab(panel(page))
  await expect(fileList(page).getByRole('listitem').first()).toBeVisible()
  const seen = await filesRequests(request)
  expect(seen).toContain(downloading)
  expect(seen).not.toContain(META)
})

type Shot = 'data' | 'loading' | 'failed' | 'meta'

const SHOT_MODES: Record<Shot, Modes> = {
  data: { data: 'sample', files: 'normal' },
  loading: { data: 'sample', files: 'slow' },
  failed: { data: 'sample', files: 'fail' },
  meta: { data: 'states', files: 'normal' },
}

async function waitForShot(scope: Locator, shot: Shot) {
  if (shot === 'data') {
    await expect(scope.getByRole('listitem').first()).toBeVisible()
  } else if (shot === 'loading') {
    await expect(
      scope.locator('[aria-busy="true"][aria-label="檔案清單"]'),
    ).toBeVisible()
  } else if (shot === 'failed') {
    await expect(scope.getByText('讀不到檔案清單')).toBeVisible()
  } else {
    await expect(
      scope.getByText('還在抓種子資訊，檔案清單等一下才有'),
    ).toBeVisible()
  }
}

test('screenshots: list panel, board panel and phone sheet; data, loading, failed, meta; light and dark', async ({
  page,
  request,
}) => {
  test.setTimeout(180_000)
  await login(page)
  for (const scheme of SCHEMES) {
    await page.emulateMedia({ colorScheme: scheme })
    for (const shot of ['data', 'loading', 'failed', 'meta'] as const) {
      await setModes(request, SHOT_MODES[shot])
      const hash = shot === 'meta' ? META : E01
      for (const container of ['list', 'board', 'phone'] as const) {
        const phone = container === 'phone'
        await page.setViewportSize(phone ? PHONE : DESKTOP)
        await page.goto(
          container === 'list'
            ? `/?sort=added_on&hash=${hash}`
            : `/?hash=${hash}`,
        )
        const scope = phone ? sheet(page) : panel(page)
        await expect(scope).toBeVisible()
        await settled(page)
        await openFilesTab(scope)
        await waitForShot(scope, shot)
        await settled(page)
        await page.screenshot({
          path: `${SCREENSHOT_DIR}/files-${container}-${shot}-${scheme}.png`,
          animations: 'disabled',
        })
      }
    }
    await setModes(request, { files: 'normal' })
  }
})
