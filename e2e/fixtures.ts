import { test as base, expect } from '@playwright/test'
import type { APIRequestContext, Page } from '@playwright/test'
import { fromCrossJSON, fromJSON } from 'seroval'
import { PREF_KEYS } from '../src/lib/prefs'

// Story 2.0 row P3: every test records CSP violations, console errors and
// requests that leave loopback, and fails on any of them. A test that forces
// an HTTP status (P5 401, P6 502) allows only Chromium's own "Failed to load
// resource" line for that status.

export const FAKE_USER = 'fake-user'
export const FAKE_PASS = 'fake-pass'
export const MAIN_ID = 'rt-main'
/** The list's own scroller (story 2.4: the list scrolls itself, not `main`). */
export const LIST_SCROLL_ID = 'rt-list-scroll'

const LOOPBACK_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]'])

declare global {
  interface Window {
    __rtCspViolation?: (text: string) => void
  }
}

export interface Watch {
  /**
   * Allow Chromium's "Failed to load resource" line for this status, and
   * only for a resource whose path starts with `pathPrefix`.
   */
  allowForcedStatus: (status: number, pathPrefix: string) => void
}

export const test = base.extend<{ watch: Watch; freshSettings: void }>({
  // Story 3.1: a picked sort is remembered in settings.json on the server,
  // which every test shares. Each test starts from the defaults (a URL
  // without `sort` shows the board).
  freshSettings: [
    async ({ request }, use) => {
      await resetSettings(request)
      await use()
    },
    { auto: true },
  ],
  watch: [
    async ({ page }, use, testInfo) => {
      const violations: Array<string> = []
      const consoleErrors: Array<string> = []
      const consoleLog: Array<string> = []
      const offLoopback: Array<string> = []
      const allowed: Array<{ status: number; pathPrefix: string }> = []

      // The binding is added over the DevTools protocol, and the init script
      // is injected by the browser, so the page's CSP never blocks either.
      await page.exposeFunction('__rtCspViolation', (text: string) => {
        violations.push(text)
      })
      await page.addInitScript(() => {
        document.addEventListener('securitypolicyviolation', (event) => {
          window.__rtCspViolation?.(
            `${event.effectiveDirective} blocked ${event.blockedURI || '(inline)'}`,
          )
        })
      })

      page.on('console', (message) => {
        const text = message.text()
        consoleLog.push(`[${message.type()}] ${text}`)
        if (message.type() !== 'error') return
        if (text.includes('Content Security Policy')) {
          violations.push(text)
          return
        }
        const forced =
          /^Failed to load resource: the server responded with a status of (\d{3})\b/.exec(
            text,
          )
        if (forced) {
          const status = Number(forced[1])
          const path = new URL(message.location().url, 'http://x').pathname
          const isAllowed = allowed.some(
            (rule) =>
              rule.status === status && path.startsWith(rule.pathPrefix),
          )
          if (isAllowed) return
        }
        consoleErrors.push(text)
      })
      page.on('pageerror', (error) => {
        consoleLog.push(`[pageerror] ${error.message}`)
        consoleErrors.push(`pageerror: ${error.message}`)
      })
      page.on('request', (request) => {
        const url = new URL(request.url())
        if (!['http:', 'https:', 'ws:', 'wss:'].includes(url.protocol)) return
        if (!LOOPBACK_HOSTS.has(url.hostname)) offLoopback.push(url.origin)
      })

      await use({
        allowForcedStatus: (status, pathPrefix) =>
          allowed.push({ status, pathPrefix }),
      })

      if (consoleLog.length > 0) {
        await testInfo.attach('console', {
          body: consoleLog.join('\n'),
          contentType: 'text/plain',
        })
      }
      expect(violations, 'CSP violations').toEqual([])
      expect(consoleErrors, 'console errors').toEqual([])
      expect(offLoopback, 'requests that left loopback').toEqual([])
    },
    { auto: true },
  ],
})

export { expect }

/**
 * Story 3.1: the fixture's watch for a second page of the test (from
 * `context.newPage()`), which the auto fixture does not see: CSP
 * violations, console errors, page errors and requests that leave
 * loopback. Call it before the page loads anything; `expectClean()` at
 * the end.
 */
export async function watchExtraPage(page: Page) {
  const problems: Array<string> = []
  await page.exposeFunction('__rtCspViolation', (text: string) => {
    problems.push(`csp: ${text}`)
  })
  await page.addInitScript(() => {
    document.addEventListener('securitypolicyviolation', (event) => {
      window.__rtCspViolation?.(
        `${event.effectiveDirective} blocked ${event.blockedURI || '(inline)'}`,
      )
    })
  })
  page.on('console', (message) => {
    if (message.type() === 'error') problems.push(`console: ${message.text()}`)
  })
  page.on('pageerror', (error) => problems.push(`pageerror: ${error.message}`))
  page.on('request', (request) => {
    const url = new URL(request.url())
    if (!['http:', 'https:', 'ws:', 'wss:'].includes(url.protocol)) return
    if (!LOOPBACK_HOSTS.has(url.hostname)) problems.push(`left: ${url.origin}`)
  })
  return {
    expectClean: () => expect(problems, 'second page problems').toEqual([]),
  }
}

/** Story 3.1: removes the app's settings.json (the defaults come back). */
export async function resetSettings(request: APIRequestContext) {
  const response = await request.post('/__fake/settings?reset=1')
  expect(response.ok(), await response.text()).toBe(true)
}

/**
 * Story 5.1: writes settings.json with one of fake-qbit's common-path seeds
 * (`library` is EXPERIENCE.md's example table; `library-long` gives PT 做種
 * a name near the 50-character limit; `library-renamed` renames and
 * unticks 影集媒體庫; `fifty`, `fifty-renamed` cover the 50 parents).
 */
export async function seedSettings(
  request: APIRequestContext,
  seed:
    'library' | 'library-long' | 'library-renamed' | 'fifty' | 'fifty-renamed',
) {
  const response = await request.post(`/__fake/settings?seed=${seed}`)
  expect(response.ok(), await response.text()).toBe(true)
}

export interface Modes {
  qbit?: 'normal' | 'down' | 'slow' | 'rejected'
  front?: 'normal' | 'down' | 'cloudflare'
  data?:
    | 'sample'
    | 'many'
    | 'empty'
    | 'archived'
    | 'calm'
    | 'states'
    | 'categories'
    | 'categories-emptied'
  grow?: '0' | '1'
  /**
   * Story 2.6: `reject` answers torrents/stop and /start with HTTP 400
   * (story 2.7: torrents/filePrio too; story 4.3: torrents/delete too).
   * Story 4.3: `slow` answers stop, start and delete after 12 s.
   * `reject-files` rejects only a delete with deleteFiles=true.
   * Story 4.7, torrents/add: `reject` rejects every add, `reject-files`
   * only file adds, `slow` answers after 12 s, `drop` closes the
   * connection (qbit_unreachable). Story 5.2, torrents/setLocation:
   * `reject` answers 400, `slow` answers after 12 s.
   */
  ops?: 'normal' | 'reject' | 'slow' | 'reject-files' | 'drop'
  /** Story 2.7: torrents/files delayed 25 s, or answered HTTP 500. */
  files?: 'normal' | 'slow' | 'fail'
  /**
   * Story 4.6: `default-path` adds X-default, whose savePath is ''.
   * Story 4.7: `none` answers no categories at all.
   */
  cats?: 'normal' | 'default-path' | 'none'
  /**
   * Story 5.1: `varied` gives every torrent its own folder under one of 50
   * parents (sample: E01 /data/media/tv, E02 /data/torrent/mteam-seed, E03
   * /data/downloads, E04 /data/media/movies). Story 5.2: `library` puts
   * each torrent right in a folder, no subfolder (sample: E01
   * /data/torrents/tv, E02 /data/torrent/mteam-seed, E03 /data/downloads,
   * E04 /data/media/movies). Story 5.5: `batch` puts the first three
   * torrents in /data/torrents/tv, the next two in /data/downloads, the
   * rest in /data/torrent/mteam-seed.
   */
  paths?: 'normal' | 'varied' | 'library' | 'batch'
  /**
   * Story 5.3, how a move ends (torrents/setLocation and moveElsewhere):
   * `hold` keeps it `moving` until releaseMoves lands it at its target,
   * `fail` reads `moving` for 3 s, then the torrent is back at its old path.
   */
  move?: 'normal' | 'hold' | 'fail'
}

export const DEFAULT_MODES: Required<Modes> = {
  qbit: 'normal',
  front: 'normal',
  data: 'sample',
  grow: '0',
  ops: 'normal',
  files: 'normal',
  cats: 'normal',
  paths: 'normal',
  move: 'normal',
}

/** A filePrio call as fake-qbit logs it (story 2.7). */
export interface FilePrioCall {
  op: 'filePrio'
  hash: string
  ids: Array<number>
  priority: number
  rejected?: true
}

/** A delete call as fake-qbit logs it (story 4.3). */
export interface DeleteCall {
  op: 'delete'
  hashes: Array<string>
  deleteFiles: boolean
  rejected?: true
}

/** An add call as fake-qbit logs it (story 4.7): `urls` or `file`. */
export interface AddCall {
  op: 'add'
  urls?: string
  file?: string
  category: string
  autoTMM: boolean
  rejected?: true
}

/** A setLocation call as fake-qbit logs it (story 5.2). */
export interface SetLocationCall {
  op: 'setLocation'
  hashes: Array<string>
  location: string
  rejected?: true
}

/** Stories 2.6, 2.7, 4.3, 4.7, 5.2: the stop/start, filePrio, delete, add and setLocation calls the fake received. */
export async function opCalls(
  request: APIRequestContext,
): Promise<
  Array<
    | { op: 'stop' | 'start'; hashes: Array<string>; rejected?: true }
    | FilePrioCall
    | DeleteCall
    | AddCall
    | SetLocationCall
  >
> {
  const response = await request.get('/__fake/ops')
  expect(response.ok(), await response.text()).toBe(true)
  return ((await response.json()) as { calls: never }).calls
}

/** Story 4.3: another device deletes these torrents (no call logged). */
export async function removeElsewhere(
  request: APIRequestContext,
  hashes: ReadonlyArray<string>,
) {
  const query = new URLSearchParams({ hashes: hashes.join('|') }).toString()
  const response = await request.post(`/__fake/remove?${query}`)
  expect(response.ok(), await response.text()).toBe(true)
}

/** Story 4.7: another device adds this torrent (no call logged). */
export async function addElsewhere(
  request: APIRequestContext,
  hash: string,
  name: string,
  category = 'X',
) {
  const query = new URLSearchParams({ hash, name, category }).toString()
  const response = await request.post(`/__fake/added?${query}`)
  expect(response.ok(), await response.text()).toBe(true)
}

/**
 * Story 5.3: another client moves this torrent (no call logged, so the
 * container records no `movingTo`: the app sees qBittorrent's `moving`
 * alone). It ends as the `move` mode says.
 */
export async function moveElsewhere(
  request: APIRequestContext,
  hash: string,
  location: string,
) {
  const query = new URLSearchParams({ hash, location }).toString()
  const response = await request.post(`/__fake/move?${query}`)
  expect(response.ok(), await response.text()).toBe(true)
}

/** Story 5.3: every move held by `move=hold` lands at its target now. */
export async function releaseMoves(request: APIRequestContext) {
  const response = await request.post('/__fake/move?release=1')
  expect(response.ok(), await response.text()).toBe(true)
}

/** Story 2.7: the hashes the fake's torrents/files was asked for. */
export async function filesRequests(
  request: APIRequestContext,
): Promise<Array<string>> {
  const response = await request.get('/__fake/files')
  expect(response.ok(), await response.text()).toBe(true)
  return ((await response.json()) as { requests: Array<string> }).requests
}

/** Switches the fake server through its loopback-only control route. */
/**
 * The container reuses a qBittorrent pull for 1 s (syncer
 * MIN_PULL_INTERVAL_MS), so a page loaded right after a data change can
 * still get the old torrents. Wait that window out after changing data.
 */
const PULL_REUSE_WAIT_MS = 1100

export async function setModes(request: APIRequestContext, modes: Modes) {
  const query = new URLSearchParams(Object.entries(modes)).toString()
  const response = await request.post(`/__fake/mode?${query}`)
  expect(response.ok(), await response.text()).toBe(true)
  if (modes.data !== undefined || modes.paths !== undefined) {
    await new Promise((resolve) => setTimeout(resolve, PULL_REUSE_WAIT_MS))
  }
}

export async function login(page: Page) {
  await page.goto('/login')
  await page.getByLabel('帳號').fill(FAKE_USER)
  await page.getByLabel('密碼', { exact: true }).fill(FAKE_PASS)
  await page.getByRole('button', { name: '登入', exact: true }).click()
  await page.waitForURL('/')
  // The default page is the board (story 2.3): wait until the first load
  // is done (no skeleton), whatever the data mode shows.
  await expect(page.locator(`#${MAIN_ID} > *`).first()).toBeVisible()
  await expect(page.locator(`#${MAIN_ID} [aria-busy="true"]`)).toHaveCount(0)
}

/** The list: any sort but 狀態 (the board). Waits for the first row. */
export async function openList(page: Page, sort = 'added_on') {
  await page.goto(`/?sort=${sort}`)
  await expect(page.getByRole('listitem').first()).toBeVisible()
}

/**
 * Where the list is scrolled: its own scroller when a list is shown,
 * otherwise `main` (the board never scrolls it).
 */
export function listScrollTop(page: Page) {
  return page.evaluate(
    ([listId, mainId]) =>
      (document.getElementById(listId) ?? document.getElementById(mainId))
        ?.scrollTop ?? 0,
    [LIST_SCROLL_ID, MAIN_ID],
  )
}

/** Scrolls the list's own scroller and waits a frame for the virtualizer. */
export async function scrollList(page: Page, to: 'bottom' | 'middle' | number) {
  await page.locator(`#${LIST_SCROLL_ID}`).evaluate((scroller, where) => {
    const max = scroller.scrollHeight - scroller.clientHeight
    scroller.scrollTop =
      where === 'bottom'
        ? max
        : where === 'middle'
          ? Math.round(max / 2)
          : where
  }, to)
  await page.evaluate(
    () => new Promise((resolve) => requestAnimationFrame(() => resolve(null))),
  )
}

/**
 * Story 2.8: turns the desktop board's auto-collapse off for this page
 * (before any script of the app runs), for tests about plain column
 * scrolling from stories 2.3 and 2.4.
 */
export async function autoCollapseOff(page: Page) {
  await page.addInitScript((key) => {
    try {
      localStorage.setItem(key, 'off')
    } catch {
      // No storage: the test then sees the default.
    }
  }, PREF_KEYS.autoCollapse)
}

// Stories 3.2 and 3.4: a sort pick saves the category's sort.
/**
 * The `category` field of a server function call's input, decoded (Start
 * sends it with seroval's `toJSONAsync`), or `undefined` when it has none.
 */
function savedCategory(body: string | null): unknown {
  if (body === null) return undefined
  let decoded: unknown
  try {
    decoded = fromJSON(JSON.parse(body) as never)
  } catch {
    return undefined
  }
  const find = (value: unknown, depth: number): unknown => {
    if (value === null || typeof value !== 'object' || depth > 4) {
      return undefined
    }
    if (Object.hasOwn(value, 'category') && Object.hasOwn(value, 'sort')) {
      return (value as { category: unknown }).category
    }
    for (const child of Object.values(value)) {
      const found = find(child, depth + 1)
      if (found !== undefined) return found
    }
    return undefined
  }
  return find(decoded, 0)
}

/** The next setCategorySort answer for exactly `category`; asserts `ok: true`. */
export async function expectSaveOf(
  page: Page,
  category: string,
  act: () => Promise<void>,
) {
  const saved = page.waitForResponse(
    (response) =>
      response.request().method() === 'POST' &&
      response.url().includes('/_serverFn/') &&
      savedCategory(response.request().postData()) === category,
  )
  await act()
  const response = await saved
  expect(response.ok()).toBe(true)
  const body: unknown = JSON.parse(await response.text())
  const decoded = response.headers()['x-tss-serialized']
    ? fromCrossJSON<{ result: unknown }>(body as never, { refs: new Map() })
        .result
    : body
  expect(decoded).toMatchObject({ ok: true })
}
