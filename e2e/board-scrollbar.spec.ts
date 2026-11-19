import {
  DEFAULT_MODES,
  autoCollapseOff,
  expect,
  login,
  setModes,
  test,
} from './fixtures'

// Spec 2.4 deferred row, settled in Chromium: a click on a board column's
// scrollbar is not empty board space, so the floating detail panel stays.
// Headless Chromium hides scrollbars, and macOS draws overlay ones that take
// no width, so this file shows them and gives the column a classic 12px
// scrollbar through a test-only style (the app's CSP is bypassed for this
// file only: the style is the test's, not the app's). Top level: these
// options need their own browser.
// https://playwright.dev/docs/api/class-testoptions#test-options-launch-options
// https://playwright.dev/docs/api/class-testoptions#test-options-bypass-csp
test.use({
  launchOptions: { ignoreDefaultArgs: ['--hide-scrollbars'] },
  bypassCSP: true,
})

const CLASSIC_SCROLLBAR = `
  [role="group"] { scrollbar-width: auto !important; scrollbar-color: auto !important; }
  [role="group"]::-webkit-scrollbar { width: 12px; }
  [role="group"]::-webkit-scrollbar-track { background: #ddd; }
  [role="group"]::-webkit-scrollbar-thumb { background: #888; }
`

const DESKTOP = { width: 1440, height: 900 }

test.afterEach(async ({ request }) => {
  await setModes(request, DEFAULT_MODES)
})

test('a click on a board column scrollbar keeps the board panel', async ({
  page,
  request,
}) => {
  // A page down stays under one column height, but the click is the
  // subject here, not story 2.8's auto-collapse.
  await autoCollapseOff(page)
  await setModes(request, { data: 'many' })
  await page.setViewportSize(DESKTOP)
  await login(page)
  await page.addStyleTag({ content: CLASSIC_SCROLLBAR })
  const board = page.getByRole('region', { name: '看板' })
  const panel = page.getByRole('complementary', { name: '詳情' })
  const seeding = board
    .getByRole('region', { name: /^做種中/ })
    .getByRole('group', { name: '做種中' })
  await seeding
    .getByRole('listitem')
    .first()
    .locator(':scope > button[data-entrance]')
    .click()
  await expect(panel).toBeVisible()

  const bar = await seeding.evaluate((element) => {
    if (!(element instanceof HTMLElement)) throw new Error('not an element')
    const box = element.getBoundingClientRect()
    return {
      width: element.offsetWidth - element.clientWidth,
      x: box.right - 3,
      y: box.top + box.height / 2,
    }
  })
  expect(bar.width).toBeGreaterThan(0)
  const before = await seeding.evaluate((element) => element.scrollTop)
  await page.mouse.click(bar.x, bar.y)
  // The click hit the scrollbar track: the column paged down.
  await expect
    .poll(() => seeding.evaluate((element) => element.scrollTop))
    .toBeGreaterThan(before)
  await expect(panel).toBeVisible()
  await expect(page).toHaveURL(/[?&]hash=/)
})
