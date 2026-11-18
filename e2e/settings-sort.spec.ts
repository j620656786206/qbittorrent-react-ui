import type { Page } from '@playwright/test'
import { fromCrossJSON } from 'seroval'
import {
  DEFAULT_MODES,
  LIST_SCROLL_ID,
  expect,
  listScrollTop,
  login,
  scrollList,
  setModes,
  test,
  watchExtraPage,
} from './fixtures'

// Story 3.1: 「全部」 remembers the sort Alex picks by hand, in settings.json
// on the server (the temporary CONFIG_DIR of scripts/fake-qbit.mjs; the
// fixtures reset it before every test). A reload without `sort` shows the
// pick; another page of the same browser follows the change when it
// regains focus, scrolled to the top. Fake data only.

const DESKTOP = { width: 1440, height: 900 }
const PHONE = { width: 390, height: 844 }

test.beforeEach(async ({ request }) => {
  await setModes(request, DEFAULT_MODES)
})

test.afterEach(async ({ request }) => {
  await setModes(request, DEFAULT_MODES)
})

const sortPill = (page: Page) =>
  page
    .getByRole('button', { name: /^排序：.*，(列表|看板)$/ })
    .filter({ visible: true })

/**
 * The next setCategorySort answer: a server function POST whose body holds
 * its input (`category` set to 「全部」's key, `__all__`). The function id in
 * the URL is a build hash, so the body is what names it.
 */
const saveAnswered = (page: Page) =>
  page.waitForResponse((response) => {
    const request = response.request()
    const body = request.postData() ?? ''
    return (
      request.method() === 'POST' &&
      response.url().includes('/_serverFn/') &&
      body.includes('category') &&
      body.includes('__all__')
    )
  })

/** The answer is `{ ok: true, ... }` (Start sends it seroval-encoded). */
async function expectSaved(saved: ReturnType<typeof saveAnswered>) {
  const response = await saved
  expect(response.ok()).toBe(true)
  const body: unknown = JSON.parse(await response.text())
  const decoded = response.headers()['x-tss-serialized']
    ? fromCrossJSON<{ result: unknown }>(body as never, { refs: new Map() })
        .result
    : body
  expect(decoded).toMatchObject({ ok: true })
}

/** Desktop: the sort menu. */
async function pick(page: Page, label: string) {
  const saved = saveAnswered(page)
  await sortPill(page).click()
  await page
    .getByRole('menu', { name: '排序' })
    .getByRole('menuitemradio', { name: label })
    .click()
  await expectSaved(saved)
}

/** Phone: the sort sheet. */
async function pickInSheet(page: Page, label: string) {
  const saved = saveAnswered(page)
  await sortPill(page).click()
  const sheet = page.getByRole('dialog', { name: '排序' })
  await sheet.getByRole('button', { name: label, exact: true }).click()
  await expectSaved(saved)
}

/** The page regains focus (TanStack Query listens to `visibilitychange`). */
async function refocus(page: Page) {
  await page.evaluate(() =>
    document.dispatchEvent(new Event('visibilitychange', { bubbles: true })),
  )
}

test('a picked sort comes back on a reload without sort', async ({ page }) => {
  await page.setViewportSize(DESKTOP)
  await login(page)
  // Nothing remembered yet: 狀態, the board.
  await expect(sortPill(page)).toHaveAccessibleName('排序：狀態，看板')

  await pick(page, '分享率')
  await expect(page).toHaveURL(/[?&]sort=ratio/)
  await expect(sortPill(page)).toHaveAccessibleName(
    '排序：分享率，高的在前，列表',
  )

  await page.goto('/')
  await expect(page.getByRole('listitem').first()).toBeVisible()
  await expect(sortPill(page)).toHaveAccessibleName(
    '排序：分享率，高的在前，列表',
  )
  expect(new URL(page.url()).searchParams.has('sort')).toBe(false)
})

test('another page follows a changed sort on focus, at the top', async ({
  page,
  context,
  request,
}) => {
  await setModes(request, { data: 'many' })
  await page.setViewportSize(DESKTOP)
  await login(page)
  await page.goto('/?sort=added_on')
  await expect(page.getByRole('listitem').first()).toBeVisible()

  // The other device is a phone.
  const other = await context.newPage()
  const otherWatch = await watchExtraPage(other)
  await other.setViewportSize(PHONE)
  await other.goto('/?sort=added_on')
  await expect(other.getByRole('listitem').first()).toBeVisible()
  await scrollList(other, 'middle')
  expect(await listScrollTop(other)).toBeGreaterThan(0)

  await pick(page, '做種時間')
  await expect(sortPill(page)).toHaveAccessibleName(
    '排序：做種時間，久的在前，列表',
  )

  await refocus(other)
  await expect(other).toHaveURL(/[?&]sort=seeding_time/)
  await expect(sortPill(other)).toHaveAccessibleName(
    '排序：做種時間，久的在前，列表',
  )
  await expect
    .poll(() =>
      other.evaluate(
        (id) => document.getElementById(id)?.scrollTop ?? -1,
        LIST_SCROLL_ID,
      ),
    )
    .toBe(0)

  // The first page refocusing sees its own pick: nothing moves.
  await refocus(page)
  await expect(sortPill(page)).toHaveAccessibleName(
    '排序：做種時間，久的在前，列表',
  )
  otherWatch.expectClean()
  await other.close()
})

test('phone: a sort picked in the sheet comes back on a reload without sort', async ({
  page,
}) => {
  await page.setViewportSize(PHONE)
  await login(page)
  await expect(sortPill(page)).toHaveAccessibleName('排序：狀態，看板')

  await pickInSheet(page, '分享率')
  await expect(page).toHaveURL(/[?&]sort=ratio/)
  await expect(sortPill(page)).toHaveAccessibleName(
    '排序：分享率，高的在前，列表',
  )

  await page.goto('/')
  await expect(page.getByRole('listitem').first()).toBeVisible()
  await expect(sortPill(page)).toHaveAccessibleName(
    '排序：分享率，高的在前，列表',
  )
  expect(new URL(page.url()).searchParams.has('sort')).toBe(false)
})
