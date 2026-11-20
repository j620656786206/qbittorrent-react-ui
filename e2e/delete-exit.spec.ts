import { mkdirSync, renameSync } from 'node:fs'
import type { Browser, Locator, Page } from '@playwright/test'
import {
  DEFAULT_MODES,
  expect,
  login,
  openList,
  removeElsewhere,
  setModes,
  test,
} from './fixtures'

// Story 4.4: the delete fade-out in Chromium against the built server and
// scripts/fake-qbit.mjs (fake data only, AD-15: the fake drops deleted
// torrents from later maindata). An init script wraps
// `Element.prototype.animate` (calling the real one) and logs every
// animation on a row or card wrapper (`data-hash`): its kind (fade or
// slide), keyframe properties, first keyframe, duration, when it started,
// and what the detail showed when it started and when it finished (the
// finish callback runs before the app reacts to the fade's end). Sample
// data: E01 to E03 normal (4 GB each), E04 找不到檔案; the list shows E04,
// E03, E02, E01 (newest first). Recordings for the PR (`.webm`, fake data
// only) go to screenshots/4-4, only when asked for (they overwrite the
// committed files):
//   npm run build && RECORD_DELETE_EXIT=1 npx playwright test e2e/delete-exit.spec.ts -g recordings

const VIDEO_DIR = '_bmad-output/implementation-artifacts/screenshots/4-4'
const DESKTOP = { width: 1440, height: 900 }
const PHONE = { width: 390, height: 844 }
const hashOf = (n: number) => n.toString(16).padStart(40, '0')
const nameOf = (n: number) => `Fake.Show.S01E0${n}.1080p`
const EMPTY_TEXT = '這個分類沒有種子'
/** A list row is 59px with a 2px gap; a card with a bar 101px, gap 10. */
const ROW_STEP = 61
const CARD_WITH_BAR_STEP = 111

interface ExitLog {
  hash: string
  kind: 'fade' | 'slide'
  props: Array<string>
  first: Record<string, unknown>
  duration: number
  easing: string
  at: number
  /** The detail's name, whether a sheet or panel is open, the empty text. */
  startDetail: string | null
  startPanel: boolean
  endDetail?: string | null
  endPanel?: boolean
  endEmpty?: boolean
  endConnected?: boolean
}

declare global {
  interface Window {
    __rtExit?: Array<ExitLog>
  }
}

async function recordExit(page: Page) {
  await page.addInitScript((emptyText) => {
    const original = Element.prototype.animate
    window.__rtExit = []
    const detail = () =>
      document.querySelector('aside[aria-label="詳情"] h2, [role="dialog"] h2')
        ?.textContent ?? null
    const panel = () =>
      document.querySelector('aside[aria-label="詳情"], [role="dialog"]') !==
      null
    Element.prototype.animate = function (
      this: Element,
      keyframes: Keyframe[] | PropertyIndexedKeyframes | null,
      options?: number | KeyframeAnimationOptions,
    ) {
      const animation = original.call(this, keyframes, options)
      const hash = this instanceof HTMLElement ? this.dataset.hash : undefined
      if (hash === undefined || !Array.isArray(keyframes)) return animation
      const first = keyframes[0] as Record<string, unknown>
      const kind =
        'opacity' in first ? 'fade' : 'translate' in first ? 'slide' : null
      if (kind === null) return animation
      const entry: ExitLog = {
        hash,
        kind,
        props: [
          ...new Set(
            keyframes.flatMap((frame) =>
              Object.keys(frame).filter((key) => key !== 'offset'),
            ),
          ),
        ],
        first,
        duration: typeof options === 'object' ? Number(options.duration) : 0,
        easing: typeof options === 'object' ? String(options.easing) : '',
        at: performance.now(),
        startDetail: detail(),
        startPanel: panel(),
      }
      window.__rtExit?.push(entry)
      animation.finished.then(
        () => {
          entry.endDetail = detail()
          entry.endPanel = panel()
          entry.endEmpty = document.body.textContent.includes(emptyText)
          entry.endConnected = this.isConnected
        },
        () => {},
      )
      return animation
    }
  }, EMPTY_TEXT)
}

const exits = (page: Page) => page.evaluate(() => window.__rtExit ?? [])

const bar = (page: Page) => page.locator('[data-selection-bar]')
const barDelete = (page: Page) =>
  bar(page).getByRole('button', { name: '刪除（含檔案）', exact: true })
const confirm = (page: Page) => page.getByRole('alertdialog')
const primary = (page: Page) =>
  confirm(page)
    .getByRole('button')
    .filter({ hasText: /刪除|只刪/ })
    .last()
const item = (page: Page, n: number) =>
  page.locator(`[role="listitem"][data-hash="${hashOf(n)}"]`)
const rowButton = (page: Page, n: number) =>
  item(page, n).locator('button').last()
const checkbox = (page: Page, n: number) =>
  page.getByRole('checkbox', { name: `選取 ${nameOf(n)}`, exact: true })

async function settled(page: Page) {
  await page.waitForFunction(() =>
    document
      .getAnimations()
      .every((animation) => animation.playState !== 'running'),
  )
}

/** Desktop: ticks each row or card with the mouse, then deletes them. */
async function deleteOnDesktop(page: Page, ...ns: Array<number>) {
  for (const n of ns) {
    await item(page, n).hover()
    await checkbox(page, n).click()
  }
  await page.mouse.move(0, 0)
  await expect(bar(page)).toContainText(`已選 ${ns.length} 個`)
  await settled(page)
  await barDelete(page).click()
  await expect(confirm(page)).toBeVisible()
  await settled(page)
  await primary(page).click()
}

/** A finger held still on `target`, then lifted (DevTools protocol). */
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

/** Phone: a long press on the first row, taps on the rest, then delete. */
async function deleteOnPhone(
  page: Page,
  first: number,
  ...rest: Array<number>
) {
  await longPress(page, rowButton(page, first))
  for (const n of rest) await rowButton(page, n).tap()
  await expect(bar(page)).toContainText(`已選 ${rest.length + 1} 個`)
  await settled(page)
  await barDelete(page).tap()
  await expect(confirm(page)).toBeVisible()
  await settled(page)
  await primary(page).tap()
}

/** The whole exit is over: rows gone, nothing animating. */
async function exitDone(page: Page, ...ns: Array<number>) {
  for (const n of ns) await expect(item(page, n)).toHaveCount(0)
  await settled(page)
}

function expectOnlyOpacityAndTranslate(log: Array<ExitLog>) {
  for (const entry of log) {
    expect(entry.props).toEqual([
      entry.kind === 'fade' ? 'opacity' : 'translate',
    ])
    expect(entry.duration).toBe(200)
    expect(entry.easing).toBe('cubic-bezier(.2,.8,.2,1)')
  }
}

test.beforeEach(async ({ request }) => {
  await setModes(request, { ...DEFAULT_MODES })
})

test.afterEach(async ({ request }) => {
  await setModes(request, DEFAULT_MODES)
})

test.describe('desktop', () => {
  test.use({ viewport: DESKTOP })

  test('list: the deleted rows fade together, then the row below slides up two rows', async ({
    page,
  }) => {
    await recordExit(page)
    await login(page)
    await openList(page)
    await settled(page)
    await deleteOnDesktop(page, 3, 2)
    await exitDone(page, 3, 2)
    const log = await exits(page)
    expectOnlyOpacityAndTranslate(log)
    const fades = log.filter((entry) => entry.kind === 'fade')
    const slides = log.filter((entry) => entry.kind === 'slide')
    expect(fades.map((entry) => entry.hash).sort()).toEqual(
      [hashOf(3), hashOf(2)].sort(),
    )
    expect(fades.every((entry) => entry.endConnected)).toBe(true)
    // Together: one start for both.
    expect(Math.abs(fades[0].at - fades[1].at)).toBeLessThan(5)
    expect(slides.map((entry) => entry.hash)).toEqual([hashOf(1)])
    expect(slides[0].first).toEqual({ translate: `0px ${2 * ROW_STEP}px` })
    // The slide starts once the fade is over.
    expect(slides[0].at - fades[0].at).toBeGreaterThanOrEqual(180)
    await expect(item(page, 4)).toBeVisible()
    await expect(item(page, 1)).toBeVisible()
  })

  test('L8: the detail keeps a deleted viewed row until its fade ends, then shows the next one', async ({
    page,
  }) => {
    await recordExit(page)
    await login(page)
    await openList(page)
    await rowButton(page, 3).click()
    await expect(page.locator('aside[aria-label="詳情"] h2')).toHaveText(
      nameOf(3),
    )
    await settled(page)
    await deleteOnDesktop(page, 3)
    await exitDone(page, 3)
    const [fade] = (await exits(page)).filter((entry) => entry.kind === 'fade')
    expect(fade.startDetail).toBe(nameOf(3))
    expect(fade.endDetail).toBe(nameOf(3))
    await expect(page.locator('aside[aria-label="詳情"] h2')).toHaveText(
      nameOf(2),
    )
  })

  test('board: the deleted card fades, then the card below slides up by its height', async ({
    page,
  }) => {
    await recordExit(page)
    await login(page)
    await settled(page)
    // 要處理: E03 (stalled, with a bar) above E04.
    await deleteOnDesktop(page, 3)
    await exitDone(page, 3)
    const log = await exits(page)
    expectOnlyOpacityAndTranslate(log)
    expect(log.map((entry) => [entry.kind, entry.hash, entry.first])).toEqual([
      ['fade', hashOf(3), { opacity: 1 }],
      ['slide', hashOf(4), { translate: `0px ${CARD_WITH_BAR_STEP}px` }],
    ])
    await expect(item(page, 4)).toBeVisible()
  })

  test('L9: the board panel showing a deleted card closes at the fade end, not before', async ({
    page,
  }) => {
    await recordExit(page)
    await login(page)
    await rowButton(page, 3).click()
    await expect(page.locator('aside[aria-label="詳情"] h2')).toHaveText(
      nameOf(3),
    )
    await settled(page)
    await deleteOnDesktop(page, 3)
    await exitDone(page, 3)
    const [fade] = (await exits(page)).filter((entry) => entry.kind === 'fade')
    expect(fade.startPanel).toBe(true)
    expect(fade.endPanel).toBe(true)
    expect(fade.endDetail).toBe(nameOf(3))
    await expect(page.locator('aside[aria-label="詳情"]')).toHaveCount(0)
  })

  test('L10: a category emptied this way fades first, then says 「這個分類沒有種子」', async ({
    page,
  }) => {
    await recordExit(page)
    await login(page)
    // mteam-tv holds E02 only in the list (E06 is 已整理).
    await page.goto('/?category=mteam-tv&sort=added_on')
    await expect(item(page, 2)).toBeVisible()
    await settled(page)
    await deleteOnDesktop(page, 2)
    await exitDone(page, 2)
    const [fade] = (await exits(page)).filter((entry) => entry.kind === 'fade')
    expect(fade.hash).toBe(hashOf(2))
    expect(fade.endEmpty).toBe(false)
    await expect(page.getByText(EMPTY_TEXT)).toBeVisible()
  })

  test('L4: a torrent deleted elsewhere drops without a fade', async ({
    page,
    request,
  }) => {
    await recordExit(page)
    await login(page)
    await openList(page)
    await settled(page)
    await removeElsewhere(request, [hashOf(3)])
    await expect(item(page, 3)).toHaveCount(0, { timeout: 15_000 })
    expect(await exits(page)).toEqual([])
  })

  test('anchoring: rows deleted above the view leave the rows in view where they are, in every frame', async ({
    page,
    request,
  }) => {
    // More rows above than the list draws beyond the view (overscan 10),
    // so the rows in view must be drawn in the removal commit itself.
    const ABOVE = 20
    await setModes(request, { data: 'many' })
    await login(page)
    await openList(page)
    await settled(page)
    const first = page.getByRole('listitem').first()
    await first.hover()
    await first.getByRole('checkbox').click()
    await page.mouse.move(0, 0)
    await page.evaluate((want) => {
      let total = 1
      for (const box of document.querySelectorAll<HTMLButtonElement>(
        '[role="listitem"] button[role="checkbox"][aria-checked="false"]',
      )) {
        if (total >= want) break
        box.click()
        total += 1
      }
    }, ABOVE)
    await expect(bar(page)).toContainText(`已選 ${ABOVE} 個`)
    const scroller = page.locator('#rt-list-scroll')
    await scroller.evaluate(
      (element, top) => {
        element.scrollTop = top
      },
      (ABOVE + 5) * ROW_STEP,
    )
    await settled(page)
    await barDelete(page).click()
    await expect(confirm(page)).toBeVisible()
    await settled(page)

    // The first row wholly in view, then its top in every frame.
    const anchor = await page.evaluate(() => {
      const box = document.getElementById('rt-list-scroll') as HTMLElement
      const top = box.getBoundingClientRect().top
      const row = [
        ...document.querySelectorAll<HTMLElement>('[role="listitem"]'),
      ].find((each) => each.getBoundingClientRect().top >= top)
      if (!row) throw new Error('no row in view')
      const tops: Array<number | null> = []
      const state = { tops, stop: false }
      ;(window as unknown as { __rtAnchor: typeof state }).__rtAnchor = state
      const sample = () => {
        const now = document.querySelector(
          `[role="listitem"][data-hash="${row.dataset.hash}"]`,
        )
        tops.push(now ? now.getBoundingClientRect().top : null)
        if (!state.stop) requestAnimationFrame(sample)
      }
      requestAnimationFrame(sample)
      return {
        hash: row.dataset.hash,
        top: row.getBoundingClientRect().top,
        scrollTop: box.scrollTop,
      }
    })
    await primary(page).click()
    await expect(confirm(page)).toHaveCount(0)
    await expect(bar(page)).toHaveAttribute('inert', '')
    await expect
      .poll(() => scroller.evaluate((element) => element.scrollTop))
      .toBe(anchor.scrollTop - ABOVE * ROW_STEP)
    await settled(page)
    await page.waitForTimeout(300)
    const tops = await page.evaluate(() => {
      const state = (
        window as unknown as {
          __rtAnchor: { tops: Array<number | null>; stop: boolean }
        }
      ).__rtAnchor
      state.stop = true
      return state.tops
    })
    expect(tops.length).toBeGreaterThan(10)
    // Drawn in every frame, never moved by more than a pixel.
    expect(tops.filter((top) => top === null)).toEqual([])
    expect(tops.filter((top) => Math.abs((top ?? 0) - anchor.top) > 1)).toEqual(
      [],
    )
    // Focus goes to the main area after a delete (Alex, after 4.4).
    await expect(page.locator('#rt-main')).toBeFocused()
  })
})

test.describe('phone', () => {
  test.use({ viewport: PHONE, hasTouch: true })

  test('list: the deleted rows fade, then the row below slides up', async ({
    page,
  }) => {
    await recordExit(page)
    await login(page)
    await openList(page)
    await settled(page)
    await deleteOnPhone(page, 3, 2)
    await exitDone(page, 3, 2)
    const log = await exits(page)
    expectOnlyOpacityAndTranslate(log)
    expect(
      log
        .filter((entry) => entry.kind === 'fade')
        .map((entry) => entry.hash)
        .sort(),
    ).toEqual([hashOf(3), hashOf(2)].sort())
    const slides = log.filter((entry) => entry.kind === 'slide')
    expect(slides.map((entry) => entry.hash)).toEqual([hashOf(1)])
    expect(slides[0].first).toEqual({ translate: `0px ${2 * ROW_STEP}px` })
  })
})

test.describe('reduced motion', () => {
  test.use({ viewport: DESKTOP, reducedMotion: 'reduce' })

  test('L11: no animation; the rows still drop with the refresh', async ({
    page,
  }) => {
    await recordExit(page)
    await login(page)
    await openList(page)
    await deleteOnDesktop(page, 3, 2)
    await expect(item(page, 3)).toHaveCount(0)
    await expect(item(page, 2)).toHaveCount(0)
    await expect(item(page, 1)).toBeVisible()
    expect(await exits(page)).toEqual([])
  })
})

/** One recording: a fresh context with video, `run`, then the .webm saved. */
async function record(
  browser: Browser,
  name: string,
  desktop: boolean,
  run: (page: Page) => Promise<void>,
) {
  const viewport = desktop ? DESKTOP : PHONE
  const context = await browser.newContext({
    viewport,
    hasTouch: !desktop,
    recordVideo: { dir: 'test-results/delete-exit-videos', size: viewport },
  })
  const page = await context.newPage()
  await login(page)
  await run(page)
  // Let the exit finish on video.
  await page.waitForTimeout(800)
  const video = page.video()
  await context.close()
  const path = await video?.path()
  if (!path) throw new Error('no video')
  mkdirSync(VIDEO_DIR, { recursive: true })
  renameSync(path, `${VIDEO_DIR}/${name}.webm`)
}

test('recordings: desktop list, desktop board and phone list delete exits', async ({
  browser,
  request,
}) => {
  test.skip(
    !process.env.RECORD_DELETE_EXIT,
    'set RECORD_DELETE_EXIT=1 to record the .webm files (see the top)',
  )
  test.setTimeout(180_000)
  await record(browser, 'delete-exit-desktop-list', true, async (page) => {
    await openList(page)
    await settled(page)
    await deleteOnDesktop(page, 3, 2)
    await exitDone(page, 3, 2)
  })
  await setModes(request, { ...DEFAULT_MODES })
  await record(browser, 'delete-exit-desktop-board', true, async (page) => {
    await settled(page)
    await deleteOnDesktop(page, 3)
    await exitDone(page, 3)
  })
  await setModes(request, { ...DEFAULT_MODES })
  await record(browser, 'delete-exit-phone-list', false, async (page) => {
    await openList(page)
    await settled(page)
    await deleteOnPhone(page, 3, 2)
    await exitDone(page, 3, 2)
  })
})
