import type { Locator, Page } from '@playwright/test'
import { DEFAULT_MODES, expect, login, setModes, test } from './fixtures'

// Story 2.8 rows C1, E1, E2, P1, R1: the desktop board's auto-collapse in
// Chromium against the built server and scripts/fake-qbit.mjs (`many`:
// thousands of seeding torrents), with the same CSP and console watch as
// every test. Only the fake qBittorrent is reached (AD-15). Screenshots go
// to e2e-output/screenshots/2-8/: before, after step 1, after step 2, light
// and dark. The Layout and Paint counts are scripts/trace-board-collapse.mjs.

const SCREENSHOT_DIR = 'e2e-output/screenshots/2-8'
const DESKTOP = { width: 1440, height: 900 }
const SCHEMES = ['light', 'dark'] as const
const POLL_WAIT = 30_000
const COLLAPSE_MS = 380
const SPREAD_MS = 1300

test.beforeEach(async ({ request }) => {
  await setModes(request, { ...DEFAULT_MODES, data: 'many' })
})

test.afterEach(async ({ request }) => {
  await setModes(request, DEFAULT_MODES)
})

const board = (page: Page) => page.getByRole('region', { name: '看板' })
const seedingBody = (page: Page) =>
  board(page)
    .getByRole('region', { name: /^做種中/ })
    .getByRole('group', { name: '做種中' })
const strip = (page: Page, name: string) =>
  board(page).getByRole('button', { name: new RegExp(`^回到看板，${name}，`) })

async function openBoard(page: Page) {
  await page.setViewportSize(DESKTOP)
  await login(page)
  await expect(
    board(page).getByRole('region', { name: /^做種中，[\d,]{5} 個$/ }),
  ).toBeVisible({ timeout: POLL_WAIT })
}

/** Section widths left to right. */
function widths(page: Page) {
  return board(page)
    .locator(':scope > section')
    .evaluateAll((sections) =>
      sections.map((section) =>
        Math.round(section.getBoundingClientRect().width),
      ),
    )
}

/** Waits until no animation runs. */
async function settled(page: Page) {
  await page.waitForFunction(() =>
    document
      .getAnimations()
      .every((animation) => animation.playState !== 'running'),
  )
}

/** Scrolls a column body as a wheel would (a real `scroll` event). */
function scrollBody(body: Locator, top: number | 'past-one-height') {
  return body.evaluate((element, to) => {
    element.scrollTop =
      to === 'past-one-height' ? element.clientHeight + 40 : to
  }, top)
}

async function shot(
  page: Page,
  name: string,
  animations: 'allow' | 'disabled',
) {
  await page.screenshot({ path: `${SCREENSHOT_DIR}/${name}.png`, animations })
}

/** The wide column's cards: count, distinct x positions, the anchor in view. */
function wideColumnState(body: Locator, anchorHash: string | null = null) {
  return body.evaluate((element, hash) => {
    const box = element.getBoundingClientRect()
    const cards = [...element.querySelectorAll('[data-hash]')]
    const xs = new Set(
      cards.map((card) => Math.round(card.getBoundingClientRect().left)),
    )
    const anchor =
      hash === null ? null : element.querySelector(`[data-hash="${hash}"]`)
    const rect = anchor?.getBoundingClientRect()
    return {
      cards: cards.length,
      perRow: xs.size,
      anchorInView:
        rect !== undefined &&
        rect.top >= box.top - 1 &&
        rect.bottom <= box.bottom + 1,
    }
  }, anchorHash)
}

test('C1 scrolling a column past one height: frame, strips in 0.38 s, 2 to 3 per row in 1.3 s', async ({
  page,
}) => {
  await openBoard(page)
  const body = seedingBody(page)
  const columnHeight = await body.evaluate((element) => element.clientHeight)
  await scrollBody(body, columnHeight - 10)
  // Not past one height yet.
  await page.waitForTimeout(100)
  expect((await widths(page)).filter((width) => width === 64)).toHaveLength(1)

  await scrollBody(body, 'past-one-height')
  // The frame comes first, then the strips (step 1, 380 ms).
  await expect(body.locator('.anchor-frame')).toHaveCount(1)
  const anchorHash = await body
    .locator('.anchor-frame')
    .getAttribute('data-hash')
  const durations = await page.evaluate(() =>
    document
      .getAnimations()
      .map((animation) => animation.effect?.getTiming().duration),
  )
  expect(durations).toContain(COLLAPSE_MS)
  await expect
    .poll(async () => (await widths(page)).filter((w) => w === 64).length)
    .toBe(4)
  // Step 2: the cards spread over 1.3 s.
  await expect
    .poll(() =>
      page.evaluate(() =>
        document
          .getAnimations()
          .map((animation) => animation.effect?.getTiming().duration),
      ),
    )
    .toContain(SPREAD_MS)
  // The FLIP ends after 1.3 s (plus the ripple); the frame's own fade runs
  // longer, so wait for the cards, not for every animation.
  await page.waitForTimeout(SPREAD_MS + 400)
  const state = await wideColumnState(body, anchorHash)
  expect(state.perRow).toBeGreaterThanOrEqual(2)
  expect(state.perRow).toBeLessThanOrEqual(3)
  expect(state.cards).toBeLessThan(60)
  expect(state.anchorInView).toBe(true)
  // Names stay on one line, truncated.
  const name = body.locator('[data-hash] [title]').first()
  expect(
    await name.evaluate((element) => getComputedStyle(element).whiteSpace),
  ).toBe('nowrap')
  // The frame goes about 0.9 s after the animation.
  await expect(body.locator('.anchor-frame')).toHaveCount(0, { timeout: 3000 })
})

test('C4 a wheel during the animation does not scroll the column', async ({
  page,
}) => {
  await openBoard(page)
  const body = seedingBody(page)
  const box = await body.boundingBox()
  if (!box) throw new Error('no column')
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
  await scrollBody(body, 'past-one-height')
  await expect
    .poll(async () => (await widths(page)).filter((w) => w === 64).length)
    .toBe(4)
  const before = await body.evaluate((element) => element.scrollTop)
  await page.mouse.wheel(0, 400)
  await page.waitForTimeout(100)
  expect(await body.evaluate((element) => element.scrollTop)).toBe(before)
  await settled(page)
})

test('E1 scrolled back to the top: four columns at their top; a wheel up at the top too', async ({
  page,
}) => {
  await openBoard(page)
  const body = seedingBody(page)
  await scrollBody(body, 'past-one-height')
  await expect
    .poll(async () => (await widths(page)).filter((w) => w === 64).length)
    .toBe(4)
  await settled(page)
  // Alex scrolls up to the top.
  await scrollBody(body, 300)
  await page.waitForTimeout(50)
  await scrollBody(body, 0)
  await expect
    .poll(async () => (await widths(page)).filter((w) => w === 64).length)
    .toBe(1)
  await settled(page)
  expect(await body.evaluate((element) => element.scrollTop)).toBe(0)

  // Again, with the pointer low in the column: the anchor's row lands near
  // the top of the grid, so the collapsed column sits at scrollTop 0 and
  // only a wheel up (past 60px of deltaY) brings the board back.
  const box = await body.boundingBox()
  if (!box) throw new Error('no column')
  await page.mouse.move(box.x + box.width / 2, box.y + box.height - 30)
  await scrollBody(body, 'past-one-height')
  await expect
    .poll(async () => (await widths(page)).filter((w) => w === 64).length)
    .toBe(4)
  await settled(page)
  await page.waitForTimeout(400)
  expect(await body.evaluate((element) => element.scrollTop)).toBe(0)
  await page.mouse.wheel(0, -40)
  await page.waitForTimeout(50)
  expect((await widths(page)).filter((w) => w === 64)).toHaveLength(4)
  await page.mouse.wheel(0, -40)
  await expect
    .poll(async () => (await widths(page)).filter((w) => w === 64).length)
    .toBe(1)
})

test('E2 a strip press restores the board; that column waits until near its top', async ({
  page,
}) => {
  await openBoard(page)
  const body = seedingBody(page)
  await scrollBody(body, 'past-one-height')
  await expect(strip(page, '完成')).toBeVisible()
  await settled(page)
  await page.waitForTimeout(400)
  // The pointer will be on the strip, outside the column: the anchor is the
  // first card fully in view.
  const expected = await body.evaluate((element) => {
    const box = element.getBoundingClientRect()
    const cards = [...element.querySelectorAll<HTMLElement>('[data-hash]')]
      .filter((card) => {
        const rect = card.getBoundingClientRect()
        return rect.top >= box.top - 2 && rect.bottom <= box.bottom
      })
      .sort((a, b) => Number(a.dataset.index) - Number(b.dataset.index))
    return cards[0]?.dataset.hash ?? null
  })
  expect(expected).not.toBeNull()
  await strip(page, '完成').click()
  await expect(body.locator('.anchor-frame')).toHaveAttribute(
    'data-hash',
    expected ?? '',
  )
  await expect
    .poll(async () => (await widths(page)).filter((w) => w === 64).length)
    .toBe(1)
  await settled(page)
  // The anchor pin kept that card in view through the expand.
  expect((await wideColumnState(body, expected)).anchorInView).toBe(true)
  const top = await body.evaluate((element) => element.scrollTop)
  expect(top).toBeGreaterThan(0)
  // Scrolling the same column further does not collapse again.
  await scrollBody(body, top + 300)
  await page.waitForTimeout(150)
  expect((await widths(page)).filter((w) => w === 64)).toHaveLength(1)

  // Back near the top, then past one height: it collapses again; Enter on
  // a strip restores too.
  await scrollBody(body, 0)
  await page.waitForTimeout(50)
  await scrollBody(body, 'past-one-height')
  await expect(strip(page, '要處理')).toBeVisible()
  await settled(page)
  await page.waitForTimeout(400)
  await strip(page, '要處理').focus()
  await page.keyboard.press('Enter')
  await expect
    .poll(async () => (await widths(page)).filter((w) => w === 64).length)
    .toBe(1)
})

test('P1 the board detail panel keeps its place and width through a collapse', async ({
  page,
}) => {
  await openBoard(page)
  await board(page)
    .getByRole('group', { name: '下載中' })
    .getByRole('listitem')
    .first()
    .locator(':scope > button[data-entrance]')
    .click()
  const panel = page.getByRole('complementary', { name: '詳情' })
  await expect(panel).toBeVisible()
  await settled(page)
  const before = await panel.boundingBox()
  await scrollBody(seedingBody(page), 'past-one-height')
  await expect
    .poll(async () => (await widths(page)).filter((w) => w === 64).length)
    .toBe(4)
  expect(await panel.boundingBox()).toEqual(before)
  await settled(page)
  expect(await panel.boundingBox()).toEqual(before)
  await expect(panel).toBeVisible()
})

test('R1 reduced motion: the layout switches at once, no animation', async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await openBoard(page)
  const body = seedingBody(page)
  await scrollBody(body, 'past-one-height')
  await expect
    .poll(async () => (await widths(page)).filter((w) => w === 64).length)
    .toBe(4)
  expect(
    await page.evaluate(
      () =>
        document
          .getAnimations()
          .filter((animation) => animation.playState === 'running').length,
    ),
  ).toBe(0)
  const state = await wideColumnState(body)
  expect(state.perRow).toBeGreaterThanOrEqual(2)
})

test('board collapse screenshots: before, step 1, step 2, light and dark', async ({
  page,
}) => {
  await openBoard(page)
  for (const scheme of SCHEMES) {
    await page.emulateMedia({ colorScheme: scheme })
    await page.goto('/')
    await expect(
      board(page).getByRole('region', { name: /^做種中，[\d,]{5} 個$/ }),
    ).toBeVisible({ timeout: POLL_WAIT })
    await page.mouse.move(0, 0)
    await shot(page, `collapse-before-desktop-${scheme}`, 'disabled')
    const body = seedingBody(page)
    await scrollBody(body, 'past-one-height')
    // Step 1 nearly done: the strips, the cards still one per row.
    await page.waitForTimeout(COLLAPSE_MS - 30)
    await shot(page, `collapse-step1-desktop-${scheme}`, 'allow')
    await settled(page)
    await shot(page, `collapse-step2-desktop-${scheme}`, 'allow')
  }
})
