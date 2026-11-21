import type { Locator, Page } from '@playwright/test'
import {
  DEFAULT_MODES,
  expect,
  login,
  moveElsewhere,
  opCalls,
  openList,
  releaseMoves,
  seedSettings,
  setModes,
  test,
} from './fixtures'

// Story 5.5: the selection bar's 「改路徑」 for several torrents, in
// Chromium against the built server and scripts/fake-qbit.mjs (fake data
// only, AD-15: the fake logs each torrents/setLocation call; `move=hold`
// keeps moves `moving` until released). `data=states&paths=batch` with the
// `library` seed: Fake.State.01 to 03 sit in /data/torrents/tv
// (下載區（影集）), 04 and 05 in /data/downloads (no common path). An
// "already moving" torrent is another client's held move (moveElsewhere),
// which the container's pre-check refuses. Desktop at 1440px, phone at
// 390x844 with a touch screen. Screenshots for the PR in screenshots/5-5,
// desktop and phone, light and dark: 搬 5 個種子 with 「目前 3 個」, and the
// partial-failure view with 「重試 2 個」.

const SCREENSHOT_DIR = '_bmad-output/implementation-artifacts/screenshots/5-5'
const DESKTOP = { width: 1440, height: 900 }
const PHONE = { width: 390, height: 844 }
const SCHEMES = ['light', 'dark'] as const
const KINDS = ['Downloading', 'Meta', 'Queued', 'Checking', 'Paused']
const hashOf = (n: number) => (0x3000 + n).toString(16).padStart(40, '0')
const nameOf = (n: number) =>
  `Fake.State.${String(n).padStart(2, '0')}.${KINDS[n - 1]}.1080p`
const FAILURE = '改路徑失敗：qBittorrent 拒絕這個操作'
const MOVING = '這個種子正在搬'

test.beforeEach(async ({ request }) => {
  await setModes(request, { ...DEFAULT_MODES, data: 'states', paths: 'batch' })
  await seedSettings(request, 'library')
})

test.afterEach(async ({ request }) => {
  await setModes(request, DEFAULT_MODES)
})

const bar = (page: Page) => page.locator('[data-selection-bar]')
const barMove = (page: Page) =>
  bar(page).getByRole('button', { name: '改路徑', exact: true })
const screen = (page: Page) =>
  page.getByRole('dialog', { name: /^搬 \d+ 個種子$/ })
const radio = (page: Page, name: string) =>
  screen(page).getByRole('radio', { name: new RegExp(`^${name}`) })
const box = (page: Page) => screen(page).getByLabel('會搬到')
const primary = (page: Page) =>
  screen(page).getByRole('button', {
    name: /^(搬過去|搬移中…|重試 \d+ 個)$/,
  })
const resultLine = (page: Page) => screen(page).locator('[data-move-result]')
const failureRows = (page: Page) => screen(page).locator('[data-move-failure]')
const item = (page: Page, n: number) =>
  page.locator(`[role="listitem"][data-hash="${hashOf(n)}"]`)
const rowButton = (page: Page, n: number) =>
  item(page, n).locator('button[aria-current]')
const toastCard = (page: Page) => page.locator('[data-slot="toast"]')

/** Waits until no animation or transition runs. */
async function settled(page: Page) {
  await page.waitForFunction(() =>
    document
      .getAnimations()
      .every((animation) => animation.playState !== 'running'),
  )
}

/** A finger held still on `target` for `ms`, then lifted (DevTools protocol). */
async function longPress(page: Page, target: Locator, ms = 650) {
  await target.scrollIntoViewIfNeeded()
  const rect = await target.boundingBox()
  if (!rect) throw new Error('nothing to press')
  const point = { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 }
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

/** Ticks torrents `ns` (a hover and a click; on the phone a long press, then taps). */
async function select(page: Page, desktop: boolean, ns: Array<number>) {
  if (desktop) {
    for (const n of ns) {
      await item(page, n).hover()
      await item(page, n).getByRole('checkbox').click()
    }
    await page.mouse.move(0, 0)
  } else {
    await longPress(page, rowButton(page, ns[0]))
    for (const n of ns.slice(1)) await rowButton(page, n).tap()
  }
  await expect(bar(page)).toContainText(`已選 ${ns.length} 個`)
}

/** Opens the change-path screen from the selection bar. */
async function openFromBar(page: Page) {
  await barMove(page).click()
  await expect(screen(page)).toBeVisible()
  await settled(page)
}

async function currentTags(page: Page) {
  return screen(page)
    .locator('[role="radio"]:has([data-current-tag])')
    .evaluateAll((rows) =>
      rows.map((row) => [
        row.querySelector('[data-path-name]')?.textContent,
        row.querySelector('[data-current-tag]')?.textContent,
      ]),
    )
}

/** Makes `ns` already moving: another client's held moves, seen by the app. */
async function movingElsewhere(
  page: Page,
  request: Parameters<typeof setModes>[0],
  ns: Array<number>,
) {
  await setModes(request, { move: 'hold' })
  for (const n of ns) {
    await moveElsewhere(request, hashOf(n), '/data/media/movies')
  }
  // Once the rows read 搬移中, the container has pulled it too.
  for (const n of ns) {
    await expect(item(page, n)).toContainText('搬移中', { timeout: 15_000 })
  }
}

for (const desktop of [true, false]) {
  const layout = desktop ? 'desktop' : 'phone'

  test.describe(layout, () => {
    test.use({ hasTouch: !desktop })

    test.beforeEach(async ({ page }) => {
      await page.setViewportSize(desktop ? DESKTOP : PHONE)
      await login(page)
      await openList(page, 'added_on&dir=asc')
    })

    test('N1 + N3 + N8: 搬 5 個種子 with 「目前 3 個」; only the two not there are sent; 「已開始搬 2 個種子」, the selection cleared, no done toast', async ({
      page,
      request,
    }) => {
      await select(page, desktop, [1, 2, 3, 4, 5])
      await openFromBar(page)
      if (desktop) {
        expect((await screen(page).boundingBox())?.width).toBeCloseTo(560, 0)
      } else {
        await expect(screen(page)).toHaveAttribute('data-slot', 'bottom-sheet')
      }
      await expect(screen(page)).toContainText('5 個種子現在在 2 個位置')
      expect(await currentTags(page)).toEqual([['下載區（影集）', '目前 3 個']])
      await expect(box(page)).toHaveValue('')
      await expect(primary(page)).toHaveText('搬過去')
      await expect(primary(page)).toHaveAttribute('aria-disabled', 'true')

      await radio(page, '下載區（影集）').click()
      await expect(box(page)).toHaveValue('/data/torrents/tv')
      await expect(primary(page)).not.toHaveAttribute('aria-disabled', 'true')
      await primary(page).click()
      await expect(screen(page)).toHaveCount(0)
      await expect(toastCard(page)).toContainText('已開始搬 2 個種子')
      await expect(bar(page)).toHaveAttribute('inert', '')
      expect(await opCalls(request)).toEqual([
        {
          op: 'setLocation',
          hashes: [hashOf(4), hashOf(5)],
          location: '/data/torrents/tv',
        },
      ])
      // N8: the rows move, then land; no 「已搬到」 toast for a many move.
      await expect(item(page, 4)).toContainText('搬移中', { timeout: 15_000 })
      await expect(item(page, 4)).not.toContainText('搬移中', {
        timeout: 15_000,
      })
      await page.waitForTimeout(2000)
      await expect(page.getByText(/已搬到/)).toHaveCount(0)
    })

    test('N4 + N5: two already moving fail with their reason; 「重試 2 個」 sends only them and closes with 「已開始搬 2 個種子」', async ({
      page,
      request,
    }) => {
      await movingElsewhere(page, request, [2, 3])
      await select(page, desktop, [1, 2, 3, 4])
      await openFromBar(page)
      await expect(screen(page)).toHaveAccessibleName('搬 4 個種子')
      await radio(page, '影集媒體庫').click()
      await primary(page).click()
      await expect(resultLine(page)).toHaveText('2 個開始搬了，2 個失敗')
      await expect(failureRows(page)).toHaveText([
        `${nameOf(2)}${MOVING}`,
        `${nameOf(3)}${MOVING}`,
      ])
      await expect(primary(page)).toHaveText('重試 2 個')
      await expect(screen(page).getByLabel('會搬到')).toHaveCount(0)
      await expect(bar(page)).toContainText('已選 2 個')
      // The container's pre-check keeps the two moving ones back.
      expect(await opCalls(request)).toEqual([
        {
          op: 'setLocation',
          hashes: [hashOf(1), hashOf(4)],
          location: '/data/media/tv',
        },
      ])

      // The other client's moves end; once the rows say so, retry.
      await releaseMoves(request)
      for (const n of [2, 3]) {
        await expect(item(page, n)).not.toContainText('搬移中', {
          timeout: 15_000,
        })
      }
      await primary(page).click()
      await expect(screen(page)).toHaveCount(0)
      await expect(toastCard(page)).toContainText('已開始搬 2 個種子')
      await expect(bar(page)).toHaveAttribute('inert', '')
      expect((await opCalls(request)).at(-1)).toEqual({
        op: 'setLocation',
        hashes: [hashOf(2), hashOf(3)],
        location: '/data/media/tv',
      })
    })

    test('N6: a whole failure shows the toast with 重試; the screen stays with the box kept', async ({
      page,
      request,
    }) => {
      await setModes(request, { ops: 'reject' })
      await select(page, desktop, [1, 4])
      await openFromBar(page)
      await box(page).fill('/data/media/tv/')
      await primary(page).click()
      await expect(toastCard(page)).toContainText(FAILURE)
      await expect(screen(page)).toBeVisible()
      await expect(box(page)).toHaveValue('/data/media/tv/')
      await expect(primary(page)).toHaveText('搬過去')
      await expect(bar(page)).toContainText('已選 2 個')
      expect(await opCalls(request)).toEqual([
        {
          op: 'setLocation',
          hashes: [hashOf(1), hashOf(4)],
          location: '/data/media/tv',
          rejected: true,
        },
      ])
    })
  })
}

test('screenshots: 搬 5 個種子 with 「目前 3 個」, the partial failure with 「重試 2 個」; desktop and phone, light and dark', async ({
  browser,
  request,
}) => {
  test.setTimeout(480_000)
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
      await setModes(request, {
        ...DEFAULT_MODES,
        data: 'states',
        paths: 'batch',
      })
      await openList(page, 'added_on&dir=asc')

      await select(page, desktop, [1, 2, 3, 4, 5])
      await openFromBar(page)
      await expect(screen(page)).toContainText('目前 3 個')
      await shot('many', scheme)

      // The partial failure: two moving elsewhere, four sent.
      // Esc closes the dialog and the phone sheet alike.
      await page.keyboard.press('Escape')
      await expect(screen(page)).toHaveCount(0)
      await bar(page).getByRole('button', { name: '取消' }).click()
      await expect(bar(page)).toHaveAttribute('inert', '')
      await movingElsewhere(page, request, [2, 3])
      await select(page, desktop, [1, 2, 3, 4])
      await openFromBar(page)
      await radio(page, '影集媒體庫').click()
      await primary(page).click()
      await expect(primary(page)).toHaveText('重試 2 個')
      await settled(page)
      await shot('partial-failure', scheme)
      // Esc closes the dialog and the phone sheet alike.
      await page.keyboard.press('Escape')
      await expect(screen(page)).toHaveCount(0)
    }
    await context.close()
  }
})
