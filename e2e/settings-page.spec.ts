import { mkdirSync } from 'node:fs'
import type { Locator, Page } from '@playwright/test'
import { fromCrossJSON, fromJSON } from 'seroval'
import { DEFAULT_MODES, expect, login, setModes, test } from './fixtures'

// Story 3.3: the settings page in Chromium against the built app and
// scripts/fake-qbit.mjs (fake data, code-name categories only; `X-empty`
// is a qBittorrent category no torrent uses). The desktop header's 設定
// opens it from a category list; an arrow press saves the whole new order
// and the tab row reorders only after the answer; back returns to the same
// list URL; the keyboard reaches back, every arrow and the switch, and
// Space turns auto-collapse off, after which the desktop board no longer
// collapses on scroll. The PR screenshots (desktop and phone 390px, light
// and dark) go to e2e-output/screenshots/3-3/. The fixtures fail the test
// on any CSP violation or console error.

const DESKTOP = { width: 1280, height: 800 }
const PHONE = { width: 390, height: 844 }
const SCREENSHOT_DIR = 'e2e-output/screenshots/3-3'

test.beforeEach(async ({ request }) => {
  await setModes(request, DEFAULT_MODES)
})

test.afterEach(async ({ request }) => {
  await setModes(request, DEFAULT_MODES)
})

const settingsPage = (page: Page) => page.getByRole('region', { name: '設定' })
const orderRows = (page: Page) =>
  settingsPage(page)
    .getByRole('list')
    .getByRole('listitem')
    .locator(':scope > span:first-child')
const tabNames = (page: Page) =>
  page
    .getByRole('group', { name: '分類' })
    .filter({ visible: true })
    .getByRole('button')
    .locator(':scope > span:first-child')
const settingsButton = (page: Page) =>
  page.getByRole('button', { name: '設定', exact: true })
const autoCollapse = (page: Page) =>
  settingsPage(page).getByRole('switch', { name: '捲動時自動收合其他欄' })

/** The decoded input of a server function call, or `undefined`. */
function decodedInput(body: string | null): unknown {
  if (body === null) return undefined
  try {
    return fromJSON(JSON.parse(body) as never)
  } catch {
    return undefined
  }
}

/** The `order` of a setCategoryOrder call's input, or `undefined`. */
function sentOrder(body: string | null): unknown {
  const find = (value: unknown, depth: number): unknown => {
    if (value === null || typeof value !== 'object' || depth > 4) {
      return undefined
    }
    if (Object.hasOwn(value, 'order'))
      return (value as { order: unknown }).order
    for (const child of Object.values(value)) {
      const found = find(child, depth + 1)
      if (found !== undefined) return found
    }
    return undefined
  }
  return find(decodedInput(body), 0)
}

/** Waits for the entrance and the switch's thumb, so a screenshot is final. */
async function settle(page: Page) {
  await page.evaluate(async () => {
    await new Promise((resolve) => requestAnimationFrame(resolve))
    // An endless one (the skeleton pulse) would never finish.
    await Promise.all(
      document
        .getAnimations()
        .filter(
          (animation) => animation.effect?.getTiming().iterations !== Infinity,
        )
        .map((animation) => animation.finished.catch(() => null)),
    )
  })
}

test('open from a category list, move a category up, tabs follow the answer, back to the same URL', async ({
  page,
}) => {
  await page.setViewportSize(DESKTOP)
  await login(page)
  await page.goto('/?category=mteam-X&sort=added_on')
  await expect(page.getByRole('listitem').first()).toBeVisible()
  const listUrl = page.url()
  const tabsBefore = await tabNames(page).allTextContents()
  expect(tabsBefore[0]).toBe('全部')

  await settingsButton(page).click()
  await expect(page).toHaveURL(/\/settings$/)
  await expect(settingsPage(page)).toBeVisible()
  // The header shows as usual.
  await expect(
    page.getByRole('heading', { name: '種子', level: 1 }).first(),
  ).toBeAttached()

  // 全部 first; every qBittorrent category, X-empty (no torrents) too.
  const rows = await orderRows(page).allTextContents()
  expect(rows[0]).toBe('全部')
  expect(rows).toContain('X-empty')
  expect(rows.slice(1).filter((row) => row !== 'X-empty')).toEqual(
    tabsBefore.slice(1),
  )
  // First up and last down are disabled.
  await expect(
    settingsPage(page).getByRole('button', { name: `把 ${rows[1]} 往上移` }),
  ).toBeDisabled()
  await expect(
    settingsPage(page).getByRole('button', {
      name: `把 ${rows[rows.length - 1]} 往下移`,
    }),
  ).toBeDisabled()

  // Move the third row up: the whole new order is sent.
  const moved = rows[3]
  const expected = [...rows.slice(1)]
  ;[expected[1], expected[2]] = [expected[2], expected[1]]
  const saved = page.waitForResponse(
    (response) =>
      response.request().method() === 'POST' &&
      response.url().includes('/_serverFn/') &&
      sentOrder(response.request().postData()) !== undefined,
  )
  await settingsPage(page)
    .getByRole('button', { name: `把 ${moved} 往上移` })
    .click()
  const response = await saved
  expect(sentOrder(response.request().postData())).toEqual(expected)
  expect(response.ok()).toBe(true)
  const body: unknown = JSON.parse(await response.text())
  const decoded = response.headers()['x-tss-serialized']
    ? fromCrossJSON<{ result: unknown }>(body as never, { refs: new Map() })
        .result
    : body
  expect(decoded).toMatchObject({ ok: true })

  // After the answer: the list and the tab row take the new order.
  await expect(orderRows(page)).toHaveText(['全部', ...expected])
  await expect(tabNames(page)).toHaveText([
    '全部',
    ...expected.filter((name) => name !== 'X-empty'),
  ])

  // Back returns to the list URL Alex came from.
  await settingsPage(page).getByRole('link', { name: '回到列表' }).click()
  // Same path and params (the router may write them in another order).
  const asParams = (url: string) => {
    const parsed = new URL(url)
    return {
      path: parsed.pathname,
      params: Object.fromEntries(parsed.searchParams),
    }
  }
  await expect.poll(() => asParams(page.url())).toEqual(asParams(listUrl))
  await expect(
    page
      .getByRole('group', { name: '分類' })
      .filter({ visible: true })
      .getByRole('button', { name: /^mteam-X/ }),
  ).toHaveAttribute('aria-pressed', 'true')

  // A reload keeps the order (it is in settings.json).
  await page.reload()
  await expect(tabNames(page)).toHaveText([
    '全部',
    ...expected.filter((name) => name !== 'X-empty'),
  ])
})

test('keyboard: back, every arrow and the switch by Tab; Space turns collapse off and the board stops collapsing', async ({
  page,
  request,
}) => {
  await setModes(request, { data: 'many' })
  await page.setViewportSize({ width: 1440, height: 900 })
  await login(page)
  // Positive control: with the switch on, the same scroll collapses.
  const board = page.getByRole('region', { name: '看板' })
  const seeding = board
    .getByRole('region', { name: /^做種中/ })
    .getByRole('group', { name: '做種中' })
  const strips = board.getByRole('button', { name: /^回到看板，/ })
  await expect(seeding).toBeVisible({ timeout: 30_000 })
  await scrollPastOneHeight(seeding)
  await expect(strips.first()).toBeVisible()
  // Endless animations (the skeleton pulse) never stop running.
  await page.waitForFunction(() =>
    document
      .getAnimations()
      .every(
        (animation) =>
          animation.playState !== 'running' ||
          animation.effect?.getTiming().iterations === Infinity,
      ),
  )

  await settingsButton(page).click()
  await expect(settingsPage(page)).toBeVisible()
  await expect(orderRows(page).nth(1)).toBeVisible()

  const back = settingsPage(page).getByRole('link', { name: '回到列表' })
  await back.focus()
  // Every enabled arrow, then the switch, in Tab order.
  const enabledArrows = await settingsPage(page)
    .getByRole('button', { name: /^把 .+ 往(上|下)移$/ })
    .evaluateAll((buttons) =>
      buttons
        .filter((button) => !(button as HTMLButtonElement).disabled)
        .map((button) => button.getAttribute('aria-label')),
    )
  expect(enabledArrows.length).toBeGreaterThan(0)
  const reached: Array<string | null> = []
  for (let i = 0; i < enabledArrows.length + 1; i += 1) {
    await page.keyboard.press('Tab')
    reached.push(
      await page.evaluate(
        () =>
          document.activeElement?.getAttribute('aria-label') ??
          document.activeElement?.getAttribute('role') ??
          null,
      ),
    )
  }
  expect(reached).toEqual([...enabledArrows, 'switch'])
  // The global focus ring shows on the keyboard-focused switch.
  const outline = await autoCollapse(page).evaluate(
    (element) => getComputedStyle(element).outlineStyle,
  )
  expect(outline).toBe('solid')

  await expect(autoCollapse(page)).toHaveAttribute('aria-checked', 'true')
  await page.keyboard.press('Space')
  await expect(autoCollapse(page)).toHaveAttribute('aria-checked', 'false')
  await page.keyboard.press('Space')
  await expect(autoCollapse(page)).toHaveAttribute('aria-checked', 'true')
  await page.keyboard.press('Space')
  await expect(autoCollapse(page)).toHaveAttribute('aria-checked', 'false')

  // Back to the board (no reload): scrolling a column no longer collapses.
  await back.click()
  await expect(page).toHaveURL(/\/$/)
  await expect(seeding).toBeVisible({ timeout: 30_000 })
  await expect(strips).toHaveCount(0)
  await scrollPastOneHeight(seeding)
  // The scroll really moved, and nothing collapsed.
  expect(
    await seeding.evaluate((element) => element.scrollTop),
  ).toBeGreaterThan(0)
  await page.waitForTimeout(800)
  await expect(strips).toHaveCount(0)
})

/** Scrolls a board column past one column height (story 2.8's trigger). */
async function scrollPastOneHeight(column: Locator) {
  await column.evaluate((element) => {
    element.scrollTop = element.clientHeight + 400
  })
}

test('screenshots: desktop and phone 390px, light and dark; the phone line and no sideways scroll', async ({
  page,
}) => {
  mkdirSync(SCREENSHOT_DIR, { recursive: true })
  await page.setViewportSize(DESKTOP)
  await login(page)
  for (const scheme of ['light', 'dark'] as const) {
    await page.emulateMedia({ colorScheme: scheme })
    for (const [name, size] of [
      ['desktop', DESKTOP],
      ['phone', PHONE],
    ] as const) {
      await page.setViewportSize(size)
      await page.goto('/settings')
      await expect(orderRows(page).nth(1)).toBeVisible()
      const note = settingsPage(page).getByText('只在電腦版有用')
      if (name === 'phone') {
        await expect(note).toBeVisible()
        await expect(autoCollapse(page)).toBeVisible()
        const overflow = await page.evaluate(
          () =>
            document.documentElement.scrollWidth -
            document.documentElement.clientWidth,
        )
        expect(overflow).toBe(0)
        // Phone touch targets: 44px arrows and switch.
        const arrowBox = await settingsPage(page)
          .getByRole('button', { name: /往下移$/ })
          .first()
          .boundingBox()
        expect(arrowBox?.height).toBe(44)
        expect((await autoCollapse(page).boundingBox())?.height).toBe(44)
      } else {
        await expect(note).toHaveCount(0)
      }
      await settle(page)
      await page.screenshot({
        path: `${SCREENSHOT_DIR}/settings-${name}-${scheme}.png`,
      })
    }
  }
})
