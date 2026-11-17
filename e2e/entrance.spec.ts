import type { Page } from '@playwright/test'
import {
  DEFAULT_MODES,
  LIST_SCROLL_ID,
  expect,
  login,
  scrollList,
  setModes,
  test,
} from './fixtures'

// Story 2.9: the entrance in Chromium against the built server and
// scripts/fake-qbit.mjs (fake data only, AD-15), with the fixture's CSP and
// console watch. An init script wraps `Element.prototype.animate` (calling
// the real one) to log every entrance animation and, where a test reads the
// animations themselves, pauses each at creation and keeps it, so no check
// races the 0.5 s rise and 0.9 s ring on a slow runner. Sample data: 要處理 2 (one stalled), 下載中
// 1, 做種中 1, 已整理 2; the list shows 4 rows, 2 of them with an arc.

const DESKTOP = { width: 1440, height: 900 }

interface Logged {
  kind: 'rise' | 'spin' | 'grow'
  delay: number
  duration: number
}

declare global {
  interface Window {
    __rtEntrance?: Array<Logged>
    /** The entrance animations themselves (only with `pause`). */
    __rtAnimations?: Array<{ kind: Logged['kind']; animation: Animation }>
  }
}

async function recordEntrance(page: Page, { pause = false } = {}) {
  await page.addInitScript((pauseAtCreation) => {
    const original = Element.prototype.animate
    window.__rtEntrance = []
    window.__rtAnimations = []
    Element.prototype.animate = function (
      this: Element,
      keyframes: Keyframe[] | PropertyIndexedKeyframes | null,
      options?: number | KeyframeAnimationOptions,
    ) {
      const kind = this.hasAttribute('data-entrance')
        ? 'rise'
        : this.hasAttribute('data-progress-arc')
          ? 'spin'
          : this.hasAttribute('data-progress-bar')
            ? 'grow'
            : null
      const animation = original.call(this, keyframes, options)
      if (kind && typeof options === 'object') {
        window.__rtEntrance?.push({
          kind,
          delay: Number(options.delay ?? 0),
          duration: Number(options.duration ?? 0),
        })
        if (pauseAtCreation) {
          animation.pause()
          window.__rtAnimations?.push({ kind, animation })
        }
      }
      return animation
    }
  }, pause)
}

/** Finishes the paused entrance animations (their order hold ends). */
const finishPaused = (page: Page) =>
  page.evaluate(() => {
    for (const { animation } of window.__rtAnimations ?? []) animation.finish()
  })

const logged = (page: Page) => page.evaluate(() => window.__rtEntrance ?? [])

const count = (entries: Array<Logged>, kind: Logged['kind']) =>
  entries.filter((entry) => entry.kind === kind).length

/** The paused entrance animations in the document, by what they move. */
const pausedTargets = (page: Page) =>
  page.evaluate(() =>
    document
      .getAnimations()
      .filter((animation) => animation.playState === 'paused')
      .map((animation) => {
        const target = (animation.effect as KeyframeEffect | null)?.target
        if (!target) return null
        if (target.hasAttribute('data-entrance')) return target.tagName
        if (target.hasAttribute('data-progress-arc')) return 'arc'
        return null
      })
      .filter((kind) => kind !== null),
  )

async function settled(page: Page) {
  await page.waitForFunction(() =>
    document
      .getAnimations()
      .every((animation) => animation.playState !== 'running'),
  )
}

test.beforeEach(async ({ page, request }) => {
  await setModes(request, DEFAULT_MODES)
  await page.setViewportSize(DESKTOP)
})

test.afterEach(async ({ request }) => {
  await setModes(request, DEFAULT_MODES)
})

test('list: rows rise 60 ms apart and the arcs turn; a sort change adds nothing', async ({
  page,
}) => {
  await login(page)
  await recordEntrance(page, { pause: true })
  await page.goto('/?sort=added_on')
  await expect(page.getByRole('listitem').first()).toBeVisible()
  // The entrance is on the rows' buttons and their arcs (held paused).
  const targets = await pausedTargets(page)
  expect(targets).toContain('BUTTON')
  expect(targets).toContain('arc')
  await finishPaused(page)

  const entries = await logged(page)
  expect(count(entries, 'rise')).toBe(4)
  expect(count(entries, 'spin')).toBe(2)
  const delays = entries
    .filter((entry) => entry.kind === 'rise')
    .map((entry) => Math.round(entry.delay))
  expect(delays).toEqual([0, 60, 120, 180])
  expect(entries.find((entry) => entry.kind === 'spin')?.duration).toBe(900)

  await settled(page)
  const before = (await logged(page)).length
  await page
    .getByRole('button', { name: /^排序：.*，列表$/ })
    .filter({ visible: true })
    .click()
  await page
    .getByRole('menu', { name: '排序' })
    .getByRole('menuitemradio', { name: '做種時間' })
    .click()
  await expect(page).toHaveURL(/[?&]sort=seeding_time/)
  await page.waitForTimeout(300)
  expect((await logged(page)).length).toBe(before)
})

test('a ring whose progress changes mid-turn lands on the new value without restarting', async ({
  page,
}) => {
  await login(page)
  await recordEntrance(page, { pause: true })
  await page.goto('/?sort=added_on')
  await expect(page.getByRole('listitem').first()).toBeVisible()
  // Stand in for React writing a newer poll's offset while the arc turns:
  // the one from-keyframe leaves the end to the live attribute. The spin is
  // paused and stepped by `currentTime`, so nothing races the clock.
  const result = await page.evaluate(() => {
    const spin = window.__rtAnimations?.find(
      (entry) => entry.kind === 'spin',
    )?.animation
    if (!spin) return null
    const effect = spin.effect as KeyframeEffect
    const arc = effect.target as SVGElement
    const delay = Number(effect.getTiming().delay ?? 0)
    const duration = Number(effect.getTiming().duration)
    const keyframes = effect.getKeyframes().length
    const full = Number(arc.getAttribute('stroke-dasharray'))
    const offset = () =>
      Number.parseFloat(getComputedStyle(arc).strokeDashoffset)
    spin.currentTime = delay + duration / 2
    const next = full * 0.25
    arc.setAttribute('stroke-dashoffset', String(next))
    const middle = offset()
    const sameRun = document.getAnimations().includes(spin)
    spin.currentTime = delay + duration - 1
    const nearEnd = offset()
    spin.finish()
    return { keyframes, sameRun, full, next, middle, nearEnd, final: offset() }
  })
  expect(result).not.toBeNull()
  if (!result) return
  expect(result.keyframes).toBe(1)
  expect(result.sameRun).toBe(true)
  // Mid-turn it heads for the new value from the empty ring.
  expect(result.middle).toBeLessThan(result.full)
  expect(result.middle).toBeGreaterThan(result.next)
  expect(result.nearEnd).toBeCloseTo(result.next, 1)
  expect(result.final).toBeCloseTo(result.next, 1)
})

test('board: cards rise per column; rings and bars grow', async ({ page }) => {
  await login(page)
  await recordEntrance(page)
  await page.goto('/')
  await expect(page.getByRole('region', { name: '看板' })).toBeVisible()
  await settled(page)
  const entries = await logged(page)
  // 要處理 2, 下載中 1, 做種中 1 cards; the stalled and downloading cards
  // carry a ring and a bar.
  expect(count(entries, 'rise')).toBe(4)
  expect(count(entries, 'spin')).toBe(2)
  expect(count(entries, 'grow')).toBe(2)
  expect(
    entries
      .filter((entry) => entry.kind === 'rise')
      .map((entry) => Math.round(entry.delay / 60) || 0),
  ).toEqual([0, 1, 0, 0])
})

test('many torrents: only what shows animates; scrolling adds nothing', async ({
  page,
  request,
}) => {
  await setModes(request, { data: 'many' })
  await login(page)
  await recordEntrance(page)
  await page.goto('/?sort=added_on')
  await expect(page.getByRole('listitem').first()).toBeVisible()
  await settled(page)
  const entries = await logged(page)
  const visibleRows = await page
    .locator(`#${LIST_SCROLL_ID}`)
    .evaluate((scroller) => {
      const box = scroller.getBoundingClientRect()
      return [...scroller.querySelectorAll('[data-entrance]')].filter((row) => {
        const rect = row.getBoundingClientRect()
        return rect.bottom > box.top && rect.top < box.bottom
      }).length
    })
  const rendered = await page.locator('[data-entrance]').count()
  expect(count(entries, 'rise')).toBe(visibleRows)
  expect(rendered).toBeGreaterThan(visibleRows)
  expect(count(entries, 'spin')).toBeLessThanOrEqual(visibleRows)

  await scrollList(page, 'middle')
  await page.waitForTimeout(300)
  expect((await logged(page)).length).toBe(entries.length)
})

test.describe('reduced motion', () => {
  test.use({ reducedMotion: 'reduce' })

  test('no entrance animation, list or board', async ({ page }) => {
    await login(page)
    await recordEntrance(page)
    const entranceTargets = () => page.locator('[data-entrance]').count()
    await page.goto('/?sort=added_on')
    await expect.poll(entranceTargets).toBeGreaterThan(0)
    await page.waitForTimeout(300)
    expect(await logged(page)).toEqual([])
    // A new document: the log starts over.
    await page.goto('/')
    await expect(page.getByRole('region', { name: '看板' })).toBeVisible()
    await expect.poll(entranceTargets).toBeGreaterThan(0)
    await page.waitForTimeout(300)
    expect(await logged(page)).toEqual([])
  })
})
