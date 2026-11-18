// @vitest-environment happy-dom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import type { Root } from 'react-dom/client'
import {
  QueryClientProvider,
  focusManager,
  notifyManager,
} from '@tanstack/react-query'
import type { QueryClient } from '@tanstack/react-query'
import {
  RouterProvider,
  createMemoryHistory,
  createRouter,
} from '@tanstack/react-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { AppError } from '#/lib/app-error'
import { PREF_KEYS } from '#/lib/prefs'
import { fakeHash, fakeResponse, t } from '#/lib/testing'
import { routeTree } from '#/routeTree.gen'
import type * as AppShellModule from '#/features/header/app-shell'
import { getSession } from '#/server/functions/get-session'
import { setCategoryOrder } from '#/server/functions/set-category-order'
import { setCategorySort } from '#/server/functions/set-category-sort'
import type { MaindataResponse } from '#/shared/maindata'
import { defaultSettings } from '#/shared/settings'
import type { Settings } from '#/shared/settings'
import { MAIN_ID } from '#/shared/ui/main-scroll'
import { clearConnectionErrors } from '#/state/connection'
import { clearLoginRequired } from '#/state/login-required'
import { createQueryClient } from '#/state/query-client'

// Story 3.3, the client half of the I/O matrix through the real `_authed`
// layout in a real router: the desktop header's 設定 button opens
// `/settings` with the list's search in its URL and the back button
// returns to that list (or `/` when opened directly); the category order list (every
// qBittorrent category, 「全部」 fixed first, first up and last down
// disabled), a press sending the whole new order with the pressed row's
// arrows waiting (every arrow while the settings are read) and nothing
// moving until the answer, the tabs following the answer, a failure toast
// keeping the order; the header on `/settings` showing the list Alex came
// from; the auto-collapse switch (default on, written at once, storage
// that fails reads on and reports nothing) and the phone line. Only
// the session and the settings writes are replaced; maindata and settings
// come from fakes. Fake data only (code names).
// https://tanstack.com/router/latest/docs/framework/react/guide/navigation

vi.mock('#/server/functions/get-session', () => ({ getSession: vi.fn() }))
vi.mock('#/server/functions/set-category-sort', () => ({
  setCategorySort: vi.fn(),
}))
vi.mock('#/server/functions/set-category-order', () => ({
  setCategoryOrder: vi.fn(),
}))
const toasts = vi.hoisted(
  () => [] as Array<{ text: string; onRetry: () => void }>,
)
vi.mock('#/lib/toast', () => ({
  toast: {
    failure: (text: string, options: { onRetry: () => void }) =>
      toasts.push({ text, onRetry: options.onRetry }),
    dismissFor: () => {},
  },
}))
// The real shell, plus a probe that hands the test the layout's `pickView`
// (the Radix sort menu spins in happy-dom: authed-settings.dom.test.tsx).
const probe = vi.hoisted(
  (): { pickView: (view: { sort: string; dir: string }) => void } => ({
    pickView: () => {},
  }),
)
vi.mock('#/features/header/app-shell', async (importOriginal) => {
  const actual = await importOriginal<typeof AppShellModule>()
  const { useListView } = await import('#/state/list-view')
  function Probe() {
    probe.pickView = useListView().pickView as never
    return null
  }
  return {
    ...actual,
    AppShell: ({ children }: { children: React.ReactNode }) => (
      <>
        <actual.AppShell>{children}</actual.AppShell>
        <Probe />
      </>
    ),
  }
})
const getSessionFn = vi.mocked(getSession)
const setCategoryOrderFn = vi.mocked(setCategoryOrder)
const setCategorySortFn = vi.mocked(setCategorySort)

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean | undefined
}

const HASH = fakeHash(1)

/** Categories a, b, c (torrents) and d (none), plus one mteam-X torrent. */
function data(): MaindataResponse {
  return fakeResponse({
    changed: [
      t({ hash: HASH, name: 'Fake.A', category: 'a' }),
      t({ hash: fakeHash(2), name: 'Fake.B', category: 'b' }),
      t({ hash: fakeHash(3), name: 'Fake.C', category: 'c' }),
      t({ hash: fakeHash(4), name: 'Fake.X', category: 'mteam-X' }),
    ],
    categories: Object.fromEntries(
      ['a', 'b', 'c', 'd', 'mteam-X'].map((name) => [
        name,
        { name, savePath: `/data/media/${name}` },
      ]),
    ),
  })
}

const ordered = (...categoryOrder: Array<string>): Settings => ({
  ...defaultSettings(),
  categoryOrder,
})

let root: Root
let container: HTMLElement
let client: QueryClient
let router: ReturnType<typeof createRouter>
let settingsAnswer: Settings
/** setCategoryOrder calls; each waits for `answer`. */
let saves: Array<{
  data: unknown
  resolve: (value: unknown) => void
}>
let desktop: boolean
let failSettings: boolean
/** Set: the next settings reads wait until the test releases them. */
let holdSettings: ((release: () => void) => void) | null
let holdMaindata: boolean
let failMaindata: boolean
let emptyData: boolean

async function mount(initial: string) {
  client = createQueryClient({
    currentPath: () => initial,
    fetchMaindata: () =>
      holdMaindata
        ? new Promise<never>(() => {})
        : failMaindata
          ? Promise.reject(new AppError('qbit_rejected'))
          : Promise.resolve(
              emptyData
                ? fakeResponse({ changed: [], categories: {} })
                : data(),
            ),
    fetchSettings: () => {
      if (failSettings) return Promise.reject(new AppError('qbit_rejected'))
      const hold = holdSettings
      if (hold === null) return Promise.resolve(settingsAnswer)
      return new Promise<Settings>((resolve) => {
        hold(() => resolve(settingsAnswer))
      })
    },
  })
  router = createRouter({
    routeTree,
    context: { queryClient: client },
    history: createMemoryHistory({ initialEntries: [initial] }),
    Wrap: ({ children }) => (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    ),
  })
  container = document.createElement('div')
  document.body.append(container)
  root = createRoot(container)
  await act(async () => {
    root.render(<RouterProvider router={router as never} />)
  })
  await act(async () => {
    await router.load()
  })
}

/** setCategoryOrder answers the whole new settings. */
async function answer(settings: Settings, index = saves.length - 1) {
  await act(async () => {
    saves[index].resolve({ ok: true, data: settings })
    await Promise.resolve()
  })
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0))
  })
}

const pathname = () => router.state.location.pathname
const search = () => router.state.location.search as Record<string, unknown>
/** The settings page: the region named by its 「設定」 heading. */
const page = () =>
  [...document.querySelectorAll<HTMLElement>('section[aria-labelledby]')].find(
    (section) =>
      document.getElementById(section.getAttribute('aria-labelledby') ?? '')
        ?.textContent === '設定',
  ) ?? null
const settingsButton = () =>
  [...document.querySelectorAll('header button')].find(
    (button) => button.getAttribute('aria-label') === '設定',
  ) as HTMLButtonElement
const backLink = () =>
  page()?.querySelector('a[aria-label="回到列表"]') as HTMLAnchorElement
const orderList = () => page()?.querySelector('ol') as HTMLOListElement
const rows = () =>
  [...orderList().querySelectorAll('li')].map(
    (row) => row.firstElementChild?.textContent,
  )
const arrow = (label: string) => {
  const found = page()?.querySelector(`button[aria-label="${label}"]`)
  if (!(found instanceof HTMLButtonElement)) throw new Error(`no ${label}`)
  return found
}
const waiting = (button: HTMLButtonElement) =>
  button.getAttribute('aria-disabled') === 'true'
const tabs = () =>
  [
    ...(document
      .querySelector('[role="group"][aria-label="分類"]')
      ?.querySelectorAll('button') ?? []),
  ].map((tab) => tab.firstElementChild?.textContent)
const switchButton = () =>
  page()?.querySelector('button[role="switch"]') as HTMLButtonElement

async function click(element: HTMLElement) {
  await act(async () => element.click())
}

function stubDesktop(matches: () => boolean) {
  vi.stubGlobal(
    'matchMedia',
    (query: string) =>
      ({
        get matches() {
          return matches()
        },
        media: query,
        addEventListener: () => {},
        removeEventListener: () => {},
      }) as unknown as MediaQueryList,
  )
}

beforeEach(() => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true
  notifyManager.setScheduler((callback) => callback())
  settingsAnswer = ordered('b')
  saves = []
  desktop = true
  failSettings = false
  holdSettings = null
  holdMaindata = false
  failMaindata = false
  emptyData = false
  stubDesktop(() => desktop)
  getSessionFn.mockReset()
  getSessionFn.mockResolvedValue({
    ok: true,
    data: { exp: Math.floor(Date.now() / 1000) + 3600 },
  } as never)
  setCategoryOrderFn.mockReset()
  setCategoryOrderFn.mockImplementation(
    (options: { data: unknown }) =>
      new Promise((resolve) => {
        saves.push({ data: options.data, resolve })
      }) as never,
  )
  setCategorySortFn.mockReset()
  setCategorySortFn.mockImplementation(() => new Promise(() => {}) as never)
  clearLoginRequired()
  clearConnectionErrors()
  localStorage.clear()
  toasts.length = 0
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

afterEach(async () => {
  await act(async () => root.unmount())
  container.remove()
  client.clear()
  focusManager.setFocused(undefined)
  clearLoginRequired()
  clearConnectionErrors()
  localStorage.clear()
  notifyManager.setScheduler((callback) => setTimeout(callback, 0))
  globalThis.IS_REACT_ACT_ENVIRONMENT = false
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('open and back', () => {
  it('from a category list: /settings with the header, back returns to the same URL', async () => {
    await mount(`/?category=mteam-X&sort=ratio&hash=${HASH}`)
    expect(page()).toBeNull()
    expect(settingsButton().disabled).toBe(false)
    await click(settingsButton())
    expect(pathname()).toBe('/settings')
    // The list's search rides along in the settings page's URL.
    expect(search()).toEqual({ category: 'mteam-X', sort: 'ratio', hash: HASH })
    expect(page()).not.toBeNull()
    expect(page()?.querySelector('h2')?.textContent).toBe('設定')
    // The header shows as usual.
    expect(document.querySelector('header h1')?.textContent).toBe('種子')
    expect(document.getElementById(MAIN_ID)?.contains(page())).toBe(true)
    // Back goes to the list URL with its category, sort and hash.
    const href = new URL(backLink().href, 'http://x')
    expect(href.pathname).toBe('/')
    expect(Object.fromEntries(href.searchParams)).toEqual({
      category: 'mteam-X',
      sort: 'ratio',
      hash: HASH,
    })
    await click(backLink())
    expect(pathname()).toBe('/')
    expect(search()).toEqual({ category: 'mteam-X', sort: 'ratio', hash: HASH })
  })

  it('opened with 設定: back goes back in the history (no second list entry)', async () => {
    await mount('/?sort=ratio')
    await click(settingsButton())
    expect(router.history.length).toBe(2)
    await click(backLink())
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0))
    })
    expect(pathname()).toBe('/')
    expect(search()).toEqual({ sort: 'ratio' })
    expect(router.history.length).toBe(2)
    expect(router.history.canGoBack()).toBe(false)
  })

  it('opened directly: back replaces the settings entry', async () => {
    await mount('/settings')
    await click(backLink())
    expect(pathname()).toBe('/')
    expect(router.history.length).toBe(1)
  })

  it('a typed /settings with bad list params is fixed like the list, staying there', async () => {
    // `dir` without `sort` is removed (fixListSearch).
    await mount('/settings?dir=asc')
    expect(pathname()).toBe('/settings')
    expect(search()).toEqual({})
  })

  it('back from a settings entry reached through history returns to the list entry before it', async () => {
    await mount('/?sort=ratio')
    await click(settingsButton())
    await act(async () => router.history.back())
    expect(pathname()).toBe('/')
    // A tab click on the list (not through the 設定 button).
    const tab = [
      ...(document
        .querySelector('[role="group"][aria-label="分類"]')
        ?.querySelectorAll('button') ?? []),
    ].find((button) => button.firstElementChild?.textContent === 'mteam-X')
    if (!tab) throw new Error('no mteam-X tab')
    await click(tab)
    await act(async () => router.history.forward())
    expect(pathname()).toBe('/settings')
    // The entry still says it came from the list: back pops to that entry,
    // which the tab click changed.
    await click(backLink())
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0))
    })
    expect(pathname()).toBe('/')
    expect(search()).toMatchObject({ category: 'mteam-X' })
  })

  it('opened directly: back goes to /', async () => {
    await mount('/settings')
    expect(page()).not.toBeNull()
    expect(new URL(backLink().href, 'http://x').pathname).toBe('/')
    expect(new URL(backLink().href, 'http://x').search).toBe('')
    await click(backLink())
    expect(pathname()).toBe('/')
    expect(search()).toEqual({})
  })

  it('the 設定 button on the settings page stays there', async () => {
    await mount('/?sort=ratio')
    await click(settingsButton())
    await click(settingsButton())
    expect(pathname()).toBe('/settings')
    expect(new URL(backLink().href, 'http://x').search).toBe('?sort=ratio')
  })

  it('a tab click on the settings page goes back to the list in that category', async () => {
    await mount('/settings')
    const tab = [
      ...(document
        .querySelector('[role="group"][aria-label="分類"]')
        ?.querySelectorAll('button') ?? []),
    ].find((button) => button.firstElementChild?.textContent === 'mteam-X')
    if (!tab) throw new Error('no mteam-X tab')
    await click(tab)
    expect(pathname()).toBe('/')
    expect(search()).toMatchObject({ category: 'mteam-X', sort: 'state' })
  })

  it('exactly two items: the order list and the switch', async () => {
    await mount('/settings')
    const items = page()?.querySelectorAll('h3')
    expect([...(items ?? [])].map((item) => item.textContent)).toEqual([
      '分類分頁順序',
      '捲動時自動收合其他欄',
    ])
  })
})

describe('the header on /settings', () => {
  const remembering: Settings = {
    ...ordered('b'),
    categorySort: { 'mteam-X': { sort: 'ratio', dir: 'desc' } },
  }
  const pressedTab = () =>
    document
      .querySelector('[role="group"][aria-label="分類"]')
      ?.querySelector<HTMLButtonElement>('button[aria-pressed="true"]')
  const pill = () =>
    document
      .querySelector('button[aria-haspopup="menu"][aria-label^="排序："]')
      ?.getAttribute('aria-label')

  it('shows the list Alex came from: its tab pressed and its sort', async () => {
    settingsAnswer = remembering
    await mount('/?category=mteam-X')
    await click(settingsButton())
    expect(pathname()).toBe('/settings')
    expect(pressedTab()?.firstElementChild?.textContent).toBe('mteam-X')
    expect(pill()).toBe('排序：分享率，高的在前，列表')
  })

  it('the 設定 button is current there and stays focusable', async () => {
    await mount('/')
    expect(settingsButton().hasAttribute('aria-current')).toBe(false)
    await click(settingsButton())
    expect(settingsButton().getAttribute('aria-current')).toBe('page')
    expect(settingsButton().disabled).toBe(false)
  })

  it('the pressed tab goes back to the list as it was, its sort too', async () => {
    settingsAnswer = remembering
    await mount('/?category=mteam-X&sort=added_on')
    await click(settingsButton())
    const tab = pressedTab()
    if (!tab) throw new Error('no pressed tab')
    await click(tab)
    expect(pathname()).toBe('/')
    // Not the remembered 'ratio': the list Alex left, unchanged.
    expect(search()).toEqual({ category: 'mteam-X', sort: 'added_on' })
    expect(pill()).not.toContain('這個分類記住的')
  })

  it('a sort pick saves under that category and lands on its list', async () => {
    await mount('/?category=mteam-X&sort=added_on')
    await click(settingsButton())
    await act(async () => probe.pickView({ sort: 'seeding_time', dir: 'desc' }))
    expect(pathname()).toBe('/')
    expect(search()).toEqual({
      category: 'mteam-X',
      sort: 'seeding_time',
      dir: 'desc',
    })
    expect(setCategorySortFn.mock.calls.map(([call]) => call.data)).toEqual([
      { category: 'mteam-X', sort: 'seeding_time', dir: 'desc' },
    ])
  })

  it('a change made while on /settings is followed once the list is back', async () => {
    settingsAnswer = remembering
    await mount('/?category=mteam-X&sort=ratio&dir=desc')
    await click(settingsButton())
    settingsAnswer = {
      ...remembering,
      categorySort: { 'mteam-X': { sort: 'seeding_time', dir: 'desc' } },
    }
    await act(async () => {
      focusManager.setFocused(false)
      focusManager.setFocused(true)
      await new Promise((resolve) => setTimeout(resolve, 0))
    })
    expect(pathname()).toBe('/settings')
    await click(backLink())
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0))
    })
    expect(pathname()).toBe('/')
    expect(search()).toMatchObject({
      category: 'mteam-X',
      sort: 'seeding_time',
      dir: 'desc',
    })
  })

  it('another device changing the remembered sort never navigates away from /settings', async () => {
    settingsAnswer = remembering
    await mount('/?category=mteam-X')
    await click(settingsButton())
    settingsAnswer = {
      ...remembering,
      categorySort: { 'mteam-X': { sort: 'seeding_time', dir: 'desc' } },
    }
    await act(async () => {
      focusManager.setFocused(false)
      focusManager.setFocused(true)
      await new Promise((resolve) => setTimeout(resolve, 0))
    })
    expect(pathname()).toBe('/settings')
    expect(search()).toEqual({ category: 'mteam-X' })
    expect(pill()).toBe('排序：做種時間，久的在前，列表')
  })
})

describe('the category order list', () => {
  it('「全部」 fixed first without arrows, then categoryOrder and the rest by name', async () => {
    await mount('/settings')
    // Matrix "List order": b first (categoryOrder), then a, c, d (no
    // torrents), mteam-X.
    expect(rows()).toEqual(['全部', 'b', 'a', 'c', 'd', 'mteam-X'])
    const all = orderList().querySelector('li') as HTMLElement
    expect(all.querySelectorAll('button')).toHaveLength(0)
  })

  it('the first row up and the last row down are disabled', async () => {
    await mount('/settings')
    expect(arrow('把 b 往上移').disabled).toBe(true)
    expect(arrow('把 b 往下移').disabled).toBe(false)
    expect(arrow('把 mteam-X 往下移').disabled).toBe(true)
    expect(arrow('把 mteam-X 往上移').disabled).toBe(false)
  })

  it('a press sends the whole new order; arrows wait; the list and tabs move only after the answer', async () => {
    await mount('/settings')
    expect(tabs()).toEqual(['全部', 'b', 'a', 'c', 'mteam-X'])
    await click(arrow('把 c 往上移'))
    expect(saves.map((save) => save.data)).toEqual([
      { order: ['b', 'c', 'a', 'd', 'mteam-X'] },
    ])
    // No optimistic move.
    expect(rows()).toEqual(['全部', 'b', 'a', 'c', 'd', 'mteam-X'])
    // That row's arrows wait; the others do not.
    expect(waiting(arrow('把 c 往上移'))).toBe(true)
    expect(waiting(arrow('把 c 往下移'))).toBe(true)
    expect(waiting(arrow('把 a 往下移'))).toBe(false)
    await click(arrow('把 c 往上移'))
    expect(saves).toHaveLength(1)
    // Another row's press queues behind the first and moves from its answer.
    await click(arrow('把 d 往上移'))
    expect(saves).toHaveLength(1)
    await answer(ordered('b', 'c', 'a', 'd', 'mteam-X'))
    expect(rows()).toEqual(['全部', 'b', 'c', 'a', 'd', 'mteam-X'])
    expect(tabs()).toEqual(['全部', 'b', 'c', 'a', 'mteam-X'])
    expect(waiting(arrow('把 c 往上移'))).toBe(false)
    expect(saves.map((save) => save.data)).toEqual([
      { order: ['b', 'c', 'a', 'd', 'mteam-X'] },
      { order: ['b', 'c', 'd', 'a', 'mteam-X'] },
    ])
    await answer(ordered('b', 'c', 'd', 'a', 'mteam-X'))
    expect(rows()).toEqual(['全部', 'b', 'c', 'd', 'a', 'mteam-X'])
  })

  it('a polite live region says where the row went after the answer', async () => {
    await mount('/settings')
    const status = page()?.querySelector('[role="status"]')
    expect(status?.getAttribute('aria-live')).toBe('polite')
    expect(status?.textContent).toBe('')
    await click(arrow('把 c 往上移'))
    expect(status?.textContent).toBe('')
    await answer(ordered('b', 'c', 'a', 'd', 'mteam-X'))
    expect(status?.textContent).toBe('c 移到第 3 個')
  })

  it('reads the settings again on mount (a newer order saved elsewhere)', async () => {
    await mount('/?sort=ratio')
    expect(tabs()).toEqual(['全部', 'b', 'a', 'c', 'mteam-X'])
    settingsAnswer = ordered('c')
    await click(settingsButton())
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0))
    })
    expect(rows()).toEqual(['全部', 'c', 'a', 'b', 'd', 'mteam-X'])
  })

  it('every arrow waits while the settings are read again (the mount refresh)', async () => {
    await mount('/?sort=ratio')
    const releases: Array<() => void> = []
    holdSettings = (release) => releases.push(release)
    await click(settingsButton())
    expect(releases).toHaveLength(1)
    expect(waiting(arrow('把 c 往上移'))).toBe(true)
    expect(waiting(arrow('把 b 往下移'))).toBe(true)
    await click(arrow('把 c 往上移'))
    expect(saves).toEqual([])
    await act(async () => {
      releases[0]()
      await new Promise((resolve) => setTimeout(resolve, 0))
    })
    expect(waiting(arrow('把 c 往上移'))).toBe(false)
    await click(arrow('把 c 往上移'))
    expect(saves).toHaveLength(1)
  })

  it('settings unknown (the read failed): read-only with a note, no press', async () => {
    failSettings = true
    await mount('/settings')
    expect(rows()).toEqual(['全部', 'a', 'b', 'c', 'd', 'mteam-X'])
    expect(page()?.querySelectorAll('button[aria-label$="移"]')).toHaveLength(0)
    const note = [...(page()?.querySelectorAll('p') ?? [])].find(
      (element) => element.textContent === '讀不到設定，暫時不能排順序',
    )
    expect(note?.className).toContain('text-text-muted')
    expect(saves).toEqual([])
  })

  it('the mount refresh failed after an earlier answer: read-only, the saved order kept', async () => {
    settingsAnswer = ordered('d', 'b')
    await mount('/')
    failSettings = true
    await click(settingsButton())
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0))
    })
    // The older answer's order, but no arrow can send an order built on it.
    expect(rows()).toEqual(['全部', 'd', 'b', 'a', 'c', 'mteam-X'])
    expect(page()?.querySelectorAll('button[aria-label$="移"]')).toHaveLength(0)
    expect(page()?.textContent).toContain('讀不到設定，暫時不能排順序')
    // A later read that answers brings the arrows back.
    failSettings = false
    await act(async () => {
      focusManager.setFocused(false)
      focusManager.setFocused(true)
      await new Promise((resolve) => setTimeout(resolve, 0))
    })
    expect(
      page()?.querySelectorAll('button[aria-label$="移"]').length,
    ).toBeGreaterThan(0)
  })

  it('loading: a busy skeleton until maindata answers', async () => {
    holdMaindata = true
    await mount('/settings')
    expect(page()?.querySelector('[aria-busy="true"]')).not.toBeNull()
    expect(page()?.querySelector('ol')).toBeNull()
  })

  it('maindata failed: 「讀不到分類清單」', async () => {
    failMaindata = true
    await mount('/settings')
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0))
    })
    expect(page()?.textContent).toContain('讀不到分類清單')
    expect(page()?.querySelector('ol')).toBeNull()
  })

  it('no category at all: 「還沒有其他分類」 under 全部', async () => {
    emptyData = true
    await mount('/settings')
    const items = [...orderList().querySelectorAll('li')]
    expect(items.map((item) => item.textContent)).toEqual([
      '全部固定第一個',
      '還沒有其他分類',
    ])
  })

  it('focus follows the moved row once the answer arrives', async () => {
    await mount('/settings')
    arrow('把 a 往上移').focus()
    await click(arrow('把 a 往上移'))
    expect(document.activeElement).toBe(arrow('把 a 往上移'))
    await answer(ordered('a', 'b', 'c', 'd', 'mteam-X'))
    // a is first now: its up is disabled, so focus is on its down.
    expect(arrow('把 a 往上移').disabled).toBe(true)
    expect(document.activeElement).toBe(arrow('把 a 往下移'))
  })

  it.each([
    ['settings_write_failed', '順序沒存到：設定檔寫不進去'],
    ['timeout', '順序沒存到：容器沒有回應，請再試一次'],
    ['invalid_input', '順序沒存到：送出的資料格式不對'],
  ] as const)(
    '%s: the retry toast and the order unchanged',
    async (code, text) => {
      setCategoryOrderFn.mockImplementationOnce(() =>
        Promise.reject(new AppError(code)),
      )
      await mount('/settings')
      await click(arrow('把 c 往上移'))
      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 0))
      })
      expect(toasts.map((toast) => toast.text)).toEqual([text])
      expect(rows()).toEqual(['全部', 'b', 'a', 'c', 'd', 'mteam-X'])
      expect(tabs()).toEqual(['全部', 'b', 'a', 'c', 'mteam-X'])
      expect(waiting(arrow('把 c 往上移'))).toBe(false)
      // 重試 sends the same whole order.
      await act(async () => toasts[0].onRetry())
      expect(saves.map((save) => save.data)).toEqual([
        { order: ['b', 'c', 'a', 'd', 'mteam-X'] },
      ])
    },
  )

  it('a connection failure has no toast here (the global handler)', async () => {
    setCategoryOrderFn.mockImplementationOnce(() =>
      Promise.reject(new AppError('home_unreachable')),
    )
    await mount('/settings')
    await click(arrow('把 c 往上移'))
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0))
    })
    expect(toasts).toEqual([])
    expect(rows()).toEqual(['全部', 'b', 'a', 'c', 'd', 'mteam-X'])
  })

  it('names are plain text and labels name the category', async () => {
    settingsAnswer = ordered()
    await mount('/settings')
    expect(arrow('把 a 往上移').getAttribute('aria-label')).toBe('把 a 往上移')
    expect(page()?.innerHTML).not.toContain('<script')
  })
})

describe('the auto-collapse switch', () => {
  it('default on; a click turns it off at once and stores it on this device', async () => {
    await mount('/settings')
    const toggle = switchButton()
    expect(toggle.tagName).toBe('BUTTON')
    expect(toggle.getAttribute('aria-checked')).toBe('true')
    expect(toggle.getAttribute('aria-labelledby')).toBeTruthy()
    const label = document.getElementById(
      toggle.getAttribute('aria-labelledby') ?? '',
    )
    expect(label?.textContent).toBe('捲動時自動收合其他欄')
    await click(toggle)
    expect(toggle.getAttribute('aria-checked')).toBe('false')
    expect(localStorage.getItem(PREF_KEYS.autoCollapse)).toBe('off')
    await click(toggle)
    expect(toggle.getAttribute('aria-checked')).toBe('true')
    expect(localStorage.getItem(PREF_KEYS.autoCollapse)).toBe('on')
  })

  it('reads a stored off', async () => {
    localStorage.setItem(PREF_KEYS.autoCollapse, 'off')
    await mount('/settings')
    expect(switchButton().getAttribute('aria-checked')).toBe('false')
  })

  it('storage that throws: shows on and toggling never throws', async () => {
    // Blocked site data: reading `localStorage` itself throws.
    const blocked = vi
      .spyOn(window, 'localStorage', 'get')
      .mockImplementation(() => {
        throw new Error('blocked')
      })
    await mount('/settings')
    expect(switchButton().getAttribute('aria-checked')).toBe('true')
    await click(switchButton())
    // Nothing was stored, so it still reads on; nothing is reported.
    expect(switchButton().getAttribute('aria-checked')).toBe('true')
    expect(page()?.textContent).not.toContain('存不了')
    blocked.mockRestore()
  })

  it('storage refuses the write (getItem works): shows on, no throw, no note', async () => {
    const refuse = vi.spyOn(localStorage, 'setItem').mockImplementation(() => {
      throw new Error('quota')
    })
    await mount('/settings')
    expect(switchButton().getAttribute('aria-checked')).toBe('true')
    await click(switchButton())
    // Nothing was stored, so it still reads on; nothing is reported.
    expect(switchButton().getAttribute('aria-checked')).toBe('true')
    expect(page()?.textContent).not.toContain('存不了')
    expect(switchButton().hasAttribute('aria-describedby')).toBe(false)
    refuse.mockRestore()
  })

  it('desktop: no phone line', async () => {
    await mount('/settings')
    expect(page()?.textContent).not.toContain('只在電腦版有用')
    expect(switchButton().hasAttribute('aria-describedby')).toBe(false)
  })

  it('phone: the switch shows with 「只在電腦版有用」', async () => {
    desktop = false
    await mount('/settings')
    const note = [...(page()?.querySelectorAll('p') ?? [])].find(
      (element) => element.textContent === '只在電腦版有用',
    )
    expect(note).toBeDefined()
    expect(note?.className).toContain('text-text-muted')
    expect(switchButton().getAttribute('aria-describedby')).toBe(note?.id)
  })
})
