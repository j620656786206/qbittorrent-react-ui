import type { Locator, Page } from '@playwright/test'
import {
  DEFAULT_MODES,
  expect,
  login,
  openList,
  seedSettings,
  setModes,
  test,
} from './fixtures'

// Story 5.1: location tags in Chromium against the built server and
// scripts/fake-qbit.mjs (fake data only, AD-15). `data=sample&paths=varied`
// with the `library` seed (EXPERIENCE.md's example table, fake folders):
// E01 sits in /data/media/tv/… (影集媒體庫, media library), E02 in
// /data/torrent/mteam-seed/… (PT 做種), E03 in /data/downloads/… (no
// common path: 「downloads/Fake.Folder.3」), E04 in /data/media/movies/…
// (電影媒體庫, media library). A media tag's text ends with the visually
// hidden 「，媒體庫」. Screenshots for the PR: desktop 1440 and phone 390,
// light and dark: the list, the board and the detail's 儲存位置 for a
// media-library, a normal and a no-match torrent.

const SCREENSHOT_DIR = 'e2e-output/screenshots/5-1'
const DESKTOP = { width: 1440, height: 900 }
const PHONE = { width: 390, height: 844 }
const SCHEMES = ['light', 'dark'] as const
const name = (n: number) => `Fake.Show.S01E0${n}.1080p`
const hashOf = (n: number) => n.toString(16).padStart(40, '0')

const MEDIA = {
  light: 'rgb(106, 69, 200)',
  dark: 'rgb(164, 143, 224)',
} as const
const TRANSPARENT = 'rgba(0, 0, 0, 0)'
/** `--rt-media-library-tint` (#6A45C81F) as computed. */
const TINT =
  /^(rgba\(106, 69, 200, 0\.12\d*\)|color\(srgb 0\.41\d* 0\.27\d* 0\.78\d* \/ 0\.12\d*\))$/

/** `library-long` names PT 做種 with LONG_NAME (scripts/fake-settings-seeds.mjs). */
const LONG_NAME_START = /^PT 做種：長期保種/

const FOLDER_ICON = 'svg path[d="M3 7h6l2 2h10v10H3z"]'

/** The location tag inside `scope`: the folder icon's box. */
const tagIn = (scope: Locator) => scope.locator(`span:has(> ${FOLDER_ICON})`)

const rowButton = (page: Page, n: number) =>
  page
    .getByRole('listitem')
    .locator(':scope > button[data-entrance]')
    .filter({ has: page.getByTitle(name(n), { exact: true }) })
/** A board card (desktop region 看板, phone tab panels). */
const card = (page: Page, n: number) =>
  page
    .locator('#rt-main')
    .getByRole('listitem')
    .locator(':scope > button[data-entrance]')
    .filter({ has: page.getByTitle(name(n), { exact: true }) })
const panel = (page: Page) => page.getByRole('complementary', { name: '詳情' })
const savePathBlock = (scope: Locator) =>
  scope.locator('section[aria-label="儲存位置"]')

test.beforeEach(async ({ request }) => {
  await setModes(request, { ...DEFAULT_MODES, paths: 'varied' })
  await seedSettings(request, 'library')
})

test.afterEach(async ({ request }) => {
  await setModes(request, DEFAULT_MODES)
})

interface TagStyle {
  color: string
  background: string
  border: string
  weight: string
  height: number
}

function styleOf(tag: Locator): Promise<TagStyle> {
  return tag.evaluate((element) => {
    const style = getComputedStyle(element)
    return {
      color: style.color,
      background: style.backgroundColor,
      border: style.borderTopColor,
      weight: style.fontWeight,
      height: element.getBoundingClientRect().height,
    }
  })
}

async function expectMediaLook(tag: Locator, scheme: 'light' | 'dark') {
  await expect(tag).toHaveAttribute('data-media-library', '')
  const style = await styleOf(tag)
  expect(style.color).toBe(MEDIA[scheme])
  expect(style.weight).toBe('600')
  expect(style.border).toBe(TRANSPARENT)
  if (scheme === 'light') expect(style.background).toMatch(TINT)
  else expect(style.background).toBe(TRANSPARENT)
}

async function expectNormalLook(tag: Locator) {
  await expect(tag).not.toHaveAttribute('data-media-library')
  const style = await styleOf(tag)
  expect(Object.values(MEDIA)).not.toContain(style.color)
  expect(style.background).toBe(TRANSPARENT)
  expect(style.border).not.toBe(TRANSPARENT)
  expect(style.weight).toBe('400')
}

/**
 * Every element whose text, background or border is the media-library
 * purple (either mode) or its tint, outside a media-library tag.
 */
function purpleOutsideTags(page: Page) {
  return page.evaluate(() => {
    const purple = ['106, 69, 200', '164, 143, 224', 'srgb 0.415', 'srgb 0.643']
    const isPurple = (value: string) =>
      purple.some((needle) => value.includes(needle))
    const hits: Array<string> = []
    for (const element of document.querySelectorAll('body *')) {
      if (element.closest('[data-media-library]')) continue
      const style = getComputedStyle(element)
      const values = [
        style.color,
        style.backgroundColor,
        style.borderTopColor,
        style.borderBottomColor,
        style.outlineColor,
        style.fill,
        style.stroke,
      ]
      if (values.some(isPurple)) {
        hits.push(
          `${element.tagName.toLowerCase()}.${element.getAttribute('class') ?? ''}`,
        )
      }
    }
    return hits
  })
}

async function hasNoHorizontalScroll(page: Page) {
  const { scrollWidth, clientWidth } = await page
    .locator(':root')
    .evaluate((element) => ({
      scrollWidth: element.scrollWidth,
      clientWidth: element.clientWidth,
    }))
  expect(scrollWidth).toBeLessThanOrEqual(clientWidth)
}

/** Waits until no animation runs (entrance, sheet). */
async function settled(page: Page) {
  await page.waitForFunction(() =>
    document
      .getAnimations()
      .every((animation) => animation.playState !== 'running'),
  )
}

/** The tag's name is cut with 「…」 (its text is wider than its box). */
function isCut(tag: Locator) {
  return tag
    .locator('span.truncate')
    .evaluate((element) => element.scrollWidth > element.clientWidth)
}

/** The page regains focus (TanStack Query listens to `visibilitychange`). */
async function refocus(page: Page) {
  await page.evaluate(() =>
    document.dispatchEvent(new Event('visibilitychange', { bubbles: true })),
  )
}

test('list, board and detail: media library, normal and no-match tags, purple only on media tags', async ({
  page,
}) => {
  await page.setViewportSize(DESKTOP)
  await login(page)
  for (const scheme of SCHEMES) {
    await page.emulateMedia({ colorScheme: scheme })

    // The list, with the detail's 儲存位置 for E01.
    await page.goto(`/?sort=added_on&hash=${hashOf(1)}`)
    await expect(panel(page)).toBeVisible()
    await expect(tagIn(rowButton(page, 1))).toHaveText('影集媒體庫，媒體庫')
    await expect(tagIn(rowButton(page, 2))).toHaveText('PT 做種')
    await expect(tagIn(rowButton(page, 3))).toHaveText(
      'downloads/Fake.Folder.3',
    )
    await expect(tagIn(rowButton(page, 4))).toHaveText('電影媒體庫，媒體庫')
    await expectMediaLook(tagIn(rowButton(page, 1)), scheme)
    await expectMediaLook(tagIn(rowButton(page, 4)), scheme)
    await expectNormalLook(tagIn(rowButton(page, 2)))
    await expectNormalLook(tagIn(rowButton(page, 3)))
    // Both looks have the same size; a row never grows.
    const heights = await Promise.all(
      [1, 2].map(
        async (n) => (await styleOf(tagIn(rowButton(page, n)))).height,
      ),
    )
    expect(heights[0]).toBe(heights[1])
    for (const n of [1, 2, 3, 4]) {
      const box = await rowButton(page, n).boundingBox()
      expect(box?.height ?? 0).toBeCloseTo(59, 1)
    }
    const detailTag = tagIn(savePathBlock(panel(page)))
    await expect(detailTag).toHaveText('影集媒體庫，媒體庫')
    await expectMediaLook(detailTag, scheme)
    expect(await purpleOutsideTags(page)).toEqual([])

    // The board.
    await page.goto(`/?hash=${hashOf(2)}`)
    await expect(panel(page)).toBeVisible()
    await expect(tagIn(card(page, 1))).toHaveText('影集媒體庫，媒體庫')
    await expectMediaLook(tagIn(card(page, 1)), scheme)
    await expect(tagIn(card(page, 2))).toHaveText('PT 做種')
    await expectNormalLook(tagIn(card(page, 2)))
    await expect(tagIn(card(page, 3))).toHaveText('downloads/Fake.Folder.3')
    await expect(tagIn(savePathBlock(panel(page)))).toHaveText('PT 做種')
    await expectNormalLook(tagIn(savePathBlock(panel(page))))
    expect(await purpleOutsideTags(page)).toEqual([])
  }
})

test('the 儲存路徑 big value shows the same name, the full path as its title', async ({
  page,
}) => {
  await page.setViewportSize(DESKTOP)
  await login(page)
  await openList(page, 'save_path')
  const value = rowButton(page, 1).getByTitle('/data/media/tv/Fake.Folder.1', {
    exact: true,
  })
  await expect(value).toHaveText('儲存路徑 影集媒體庫')
  await expect(value).toHaveClass(/text-text-muted/)
  await expect(
    rowButton(page, 3).getByTitle('/data/downloads/Fake.Folder.3', {
      exact: true,
    }),
  ).toHaveText('儲存路徑 downloads/Fake.Folder.3')
})

test('R1: common paths edited elsewhere update the tags on focus, without a reload', async ({
  page,
  request,
}) => {
  await page.setViewportSize(DESKTOP)
  await login(page)
  await page.goto(`/?sort=added_on&hash=${hashOf(1)}`)
  await expect(tagIn(rowButton(page, 1))).toHaveText('影集媒體庫，媒體庫')
  await expectMediaLook(tagIn(rowButton(page, 1)), 'light')

  await seedSettings(request, 'library-renamed')
  await refocus(page)
  await expect(tagIn(rowButton(page, 1))).toHaveText('影集（暫放）')
  await expectNormalLook(tagIn(rowButton(page, 1)))
  await expect(tagIn(savePathBlock(panel(page)))).toHaveText('影集（暫放）')
  // Untouched paths keep theirs.
  await expect(tagIn(rowButton(page, 4))).toHaveText('電影媒體庫，媒體庫')
  await expectMediaLook(tagIn(rowButton(page, 4)), 'light')
})

test('phone 390: no horizontal overflow; tags stay on one line', async ({
  page,
}) => {
  await page.setViewportSize(PHONE)
  await login(page)
  for (const scheme of SCHEMES) {
    await page.emulateMedia({ colorScheme: scheme })
    await openList(page)
    await expect(tagIn(rowButton(page, 1))).toHaveText('影集媒體庫，媒體庫')
    await expectMediaLook(tagIn(rowButton(page, 1)), scheme)
    await hasNoHorizontalScroll(page)
    for (const n of [1, 2, 3, 4]) {
      const box = await rowButton(page, n).boundingBox()
      expect(box?.height ?? 0).toBeCloseTo(59, 1)
    }

    await page.goto('/')
    // The phone board opens on 要處理: E03 (no match), E04 (media library).
    await expect(tagIn(card(page, 4))).toHaveText('電影媒體庫，媒體庫')
    await expectMediaLook(tagIn(card(page, 4)), scheme)
    await expect(tagIn(card(page, 3))).toHaveText('downloads/Fake.Folder.3')
    await hasNoHorizontalScroll(page)
    expect(await purpleOutsideTags(page)).toEqual([])
  }
})

test('a long common-path name is cut inside the tag: rows stay 59px, the card tag row one line', async ({
  page,
  request,
}) => {
  await page.setViewportSize(DESKTOP)
  await login(page)
  await page.goto('/')
  const cardHeight = (await card(page, 2).boundingBox())?.height ?? 0
  expect(cardHeight).toBeGreaterThan(0)

  await seedSettings(request, 'library-long')
  for (const viewport of [DESKTOP, PHONE]) {
    await page.setViewportSize(viewport)
    await openList(page)
    const rowTag = tagIn(rowButton(page, 2))
    await expect(rowTag).toHaveAttribute('title', LONG_NAME_START)
    // The title is the whole name: the same text the tag holds.
    const title = (await rowTag.getAttribute('title')) ?? ''
    expect(title.length).toBeGreaterThan(30)
    await expect(rowTag).toHaveText(title)
    expect(await isCut(rowTag)).toBe(true)
    const row = await rowButton(page, 2).boundingBox()
    expect(row?.height ?? 0).toBeCloseTo(59, 1)
    await hasNoHorizontalScroll(page)
  }

  await page.setViewportSize(DESKTOP)
  await page.goto('/')
  const cardTag = tagIn(card(page, 2))
  await expect(cardTag).toHaveAttribute('title', LONG_NAME_START)
  expect(await isCut(cardTag)).toBe(true)
  // One line: the tag keeps the 20px tag height and the card its height.
  expect((await cardTag.boundingBox())?.height ?? 0).toBeCloseTo(20, 1)
  expect((await card(page, 2).boundingBox())?.height ?? 0).toBeCloseTo(
    cardHeight,
    1,
  )
})

test('screenshots: list, board and 儲存位置, desktop and phone, light and dark', async ({
  page,
}) => {
  await login(page)
  for (const scheme of SCHEMES) {
    await page.emulateMedia({ colorScheme: scheme })

    await page.setViewportSize(DESKTOP)
    await page.goto(`/?sort=added_on&hash=${hashOf(1)}`)
    await expect(savePathBlock(panel(page))).toBeVisible()
    await settled(page)
    await page.screenshot({
      path: `${SCREENSHOT_DIR}/list-detail-desktop-${scheme}.png`,
      animations: 'disabled',
    })

    await page.goto(`/?hash=${hashOf(4)}`)
    await expect(savePathBlock(panel(page))).toBeVisible()
    await settled(page)
    await page.screenshot({
      path: `${SCREENSHOT_DIR}/board-detail-desktop-${scheme}.png`,
      animations: 'disabled',
    })

    await page.setViewportSize(PHONE)
    await openList(page)
    await settled(page)
    await page.screenshot({
      path: `${SCREENSHOT_DIR}/list-phone-${scheme}.png`,
    })

    await page.goto('/')
    await expect(tagIn(card(page, 4))).toBeVisible()
    await settled(page)
    await page.screenshot({
      path: `${SCREENSHOT_DIR}/board-phone-${scheme}.png`,
    })

    await page.goto(`/?sort=added_on&hash=${hashOf(1)}`)
    const sheet = page.getByRole('dialog')
    await expect(sheet).toBeVisible()
    await settled(page)
    await savePathBlock(sheet).scrollIntoViewIfNeeded()
    await hasNoHorizontalScroll(page)
    await page.screenshot({
      path: `${SCREENSHOT_DIR}/detail-phone-${scheme}.png`,
    })

    // 儲存位置 for a normal location (E02, PT 做種) and no match (E03).
    for (const [n, kind, text] of [
      [2, 'normal', 'PT 做種'],
      [3, 'no-match', 'downloads/Fake.Folder.3'],
    ] as const) {
      await page.setViewportSize(DESKTOP)
      await page.goto(`/?sort=added_on&hash=${hashOf(n)}`)
      await expect(tagIn(savePathBlock(panel(page)))).toHaveText(text)
      await settled(page)
      await page.screenshot({
        path: `${SCREENSHOT_DIR}/detail-${kind}-desktop-${scheme}.png`,
        animations: 'disabled',
      })

      await page.setViewportSize(PHONE)
      await page.goto(`/?sort=added_on&hash=${hashOf(n)}`)
      const phoneSheet = page.getByRole('dialog')
      await expect(tagIn(savePathBlock(phoneSheet))).toHaveText(text)
      await settled(page)
      await savePathBlock(phoneSheet).scrollIntoViewIfNeeded()
      await hasNoHorizontalScroll(page)
      await page.screenshot({
        path: `${SCREENSHOT_DIR}/detail-${kind}-phone-${scheme}.png`,
      })
    }
  }
})
