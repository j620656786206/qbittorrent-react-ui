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
import { PREF_KEYS, readPref, withViewedHash, writePref } from '#/lib/prefs'
import { fakeHash, fakeResponse, t } from '#/lib/testing'
import { routeTree } from '#/routeTree.gen'
import type * as AppShellModule from '#/features/header/app-shell'
import { getSession } from '#/server/functions/get-session'
import { setCategorySort } from '#/server/functions/set-category-sort'
import { ALL } from '#/shared/categories'
import type { MaindataResponse } from '#/shared/maindata'
import { defaultSettings } from '#/shared/settings'
import type { Settings } from '#/shared/settings'
import type { SortFieldId } from '#/shared/sort-fields'
import { MAIN_ID } from '#/shared/ui/main-scroll'
import { clearConnectionErrors } from '#/state/connection'
import { entranceStore, resetEntrance } from '#/state/entrance'
import { clearLoginRequired } from '#/state/login-required'
import { clearMaindataFailure } from '#/state/maindata-failure'
import { createQueryClient } from '#/state/query-client'

// Story 3.6, the client half of the I/O matrix through the real `_authed`
// layout in a real router: recording the category and the viewed torrent
// per device, the open-time restore of a bare URL (its remembered sort,
// `replace`, no hint, no extra entrance), a URL with a place followed as
// is, a vanished category staying 「全部」, the desktop list panel preferring
// the category's last viewed torrent (on open, on a tab switch, on a sort
// change), the board and the phone never opening a detail by themselves,
// and bad or blocked storage. Only the session and setCategorySort server
// functions are replaced. Fake data only (code names).

vi.mock('#/server/functions/get-session', () => ({ getSession: vi.fn() }))
vi.mock('#/server/functions/set-category-sort', () => ({
  setCategorySort: vi.fn(),
}))
vi.mock('#/lib/toast', () => ({
  toast: { failure: () => {}, dismissFor: () => {} },
}))
const probe = vi.hoisted(
  (): {
    pickView: (view: { sort: string; dir: string }) => void
    /** Every category rendered while the view counted as ready. */
    readyCategories: Array<string>
  } => ({
    pickView: () => {},
    readyCategories: [],
  }),
)
vi.mock('#/features/header/app-shell', async (importOriginal) => {
  const actual = await importOriginal<typeof AppShellModule>()
  const { useListView } = await import('#/state/list-view')
  function Probe() {
    const control = useListView()
    probe.pickView = control.pickView as never
    if (control.viewReady) probe.readyCategories.push(control.view.category)
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
const setCategorySortFn = vi.mocked(setCategorySort)

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean | undefined
}

const archived = { state: 'missingFiles', private: false } as const

/**
 * mteam-X: A, B, C (newest first; A and C named `keep`) and an archived H;
 * X: D, E (newest first); uncategorized: F, I (newest first); mteam-tv
 * only an archived G. Added times decide the list order under 加入時間.
 */
function torrents() {
  return [
    t({
      hash: fakeHash(1),
      name: 'Fake.A.keep',
      category: 'mteam-X',
      added_on: 30,
    }),
    t({ hash: fakeHash(2), name: 'Fake.B', category: 'mteam-X', added_on: 20 }),
    t({
      hash: fakeHash(3),
      name: 'Fake.C.keep',
      category: 'mteam-X',
      added_on: 10,
    }),
    t({
      hash: fakeHash(8),
      name: 'Fake.H',
      category: 'mteam-X',
      added_on: 90,
      ...archived,
    }),
    t({ hash: fakeHash(4), name: 'Fake.D', category: 'X', added_on: 50 }),
    t({ hash: fakeHash(5), name: 'Fake.E', category: 'X', added_on: 40 }),
    t({
      hash: fakeHash(7),
      name: 'Fake.G',
      category: 'mteam-tv',
      added_on: 60,
      ...archived,
    }),
    t({ hash: fakeHash(6), name: 'Fake.F', category: '', added_on: 6 }),
    t({ hash: fakeHash(9), name: 'Fake.I', category: '', added_on: 4 }),
  ]
}

const A = fakeHash(1)
const B = fakeHash(2)
const C = fakeHash(3)
const E = fakeHash(5)
const G = fakeHash(7)
const H = fakeHash(8)
const I = fakeHash(9)

const remembering = (
  entries: Record<string, { sort: SortFieldId; dir: 'asc' | 'desc' }>,
): Settings => ({ ...defaultSettings(), categorySort: entries })

let root: Root
let container: HTMLElement
let client: QueryClient
let router: ReturnType<typeof createRouter>
let maindata: MaindataResponse
let settingsAnswer: Settings
let fetchMaindata: () => Promise<MaindataResponse>
let fetchSettings: () => Promise<Settings>

async function mount(
  initial: string,
  history = createMemoryHistory({ initialEntries: [initial] }),
) {
  client = createQueryClient({
    currentPath: () => initial,
    fetchMaindata: () => fetchMaindata(),
    fetchSettings: () => fetchSettings(),
  })
  router = createRouter({
    routeTree,
    context: { queryClient: client },
    history,
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

const search = () => router.state.location.search as Record<string, unknown>
const main = () => document.getElementById(MAIN_ID) as HTMLElement
/** The detail panel's text, `null` without one. */
const panel = () =>
  document.querySelector('aside[aria-label="詳情"]')?.textContent ?? null
const tablist = () =>
  document.querySelector('[role="group"][aria-label="分類"]') as HTMLElement
const tab = (label: string) => {
  const found = [...tablist().querySelectorAll('button')].find(
    (element) => element.firstElementChild?.textContent === label,
  )
  if (!(found instanceof HTMLButtonElement)) throw new Error(`no tab ${label}`)
  return found
}
const selectedTab = () =>
  tablist().querySelector('[aria-pressed="true"]')?.firstElementChild
    ?.textContent
const pillText = () =>
  document.querySelector('button[aria-haspopup="menu"][aria-label^="排序："]')
    ?.textContent ?? ''

const pathname = () => router.state.location.pathname

/** Holds the settings answer until `release()`. */
function deferSettings() {
  let resolve: (settings: Settings) => void = () => {}
  fetchSettings = () =>
    new Promise<Settings>((done) => {
      resolve = done
    })
  return {
    release: async () => {
      await act(async () => resolve(settingsAnswer))
    },
  }
}

/** Every value written to `lastCategory` from now on. */
function watchLastCategory() {
  const written: Array<string> = []
  const setItem = localStorage.setItem.bind(localStorage)
  vi.spyOn(localStorage, 'setItem').mockImplementation((key, value) => {
    if (key === PREF_KEYS.lastCategory) written.push(String(value))
    setItem(key, value)
  })
  return written
}

async function go(to: string, params: Record<string, unknown> = {}) {
  await act(async () => {
    await router.navigate({ to, search: params, replace: true } as never)
  })
}

async function click(element: HTMLElement) {
  await act(async () => element.click())
}

/** Writes the URL's `hash` as a row click does. */
async function view(hash: string) {
  await act(async () => {
    await router.navigate({
      to: '/',
      search: (previous: Record<string, unknown>) => ({ ...previous, hash }),
      replace: true,
    } as never)
  })
}

function remember(category: string, hashes: Record<string, string> = {}) {
  writePref('lastCategory', category)
  let map = readPref('lastViewedHash')
  for (const [key, hash] of Object.entries(hashes)) {
    map = withViewedHash(map, key, hash)
  }
  writePref('lastViewedHash', map)
}

function phoneWidth() {
  vi.spyOn(window, 'matchMedia').mockImplementation(
    (query: string) =>
      ({
        matches: false,
        media: query,
        addEventListener: () => {},
        removeEventListener: () => {},
      }) as unknown as MediaQueryList,
  )
}

beforeEach(() => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true
  localStorage.clear()
  probe.readyCategories = []
  notifyManager.setScheduler((callback) => callback())
  maindata = fakeResponse({ changed: torrents() })
  settingsAnswer = defaultSettings()
  fetchMaindata = () => Promise.resolve(maindata)
  fetchSettings = () => Promise.resolve(settingsAnswer)
  clearMaindataFailure()
  getSessionFn.mockReset()
  getSessionFn.mockResolvedValue({
    ok: true,
    data: { exp: Math.floor(Date.now() / 1000) + 3600 },
  } as never)
  setCategorySortFn.mockReset()
  setCategorySortFn.mockImplementation(() => new Promise(() => {}) as never)
  clearLoginRequired()
  clearConnectionErrors()
  resetEntrance()
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

afterEach(async () => {
  await act(async () => root.unmount())
  container.remove()
  client.clear()
  focusManager.setFocused(undefined)
  clearLoginRequired()
  clearConnectionErrors()
  clearMaindataFailure()
  notifyManager.setScheduler((callback) => setTimeout(callback, 0))
  globalThis.IS_REACT_ACT_ENVIRONMENT = false
  vi.restoreAllMocks()
  localStorage.clear()
})

describe('recording', () => {
  it('a tab switch stores the category; a viewed torrent is stored under it', async () => {
    settingsAnswer = remembering({ X: { sort: 'added_on', dir: 'desc' } })
    await mount('/')
    expect(readPref('lastCategory')).toBe(ALL)
    await click(tab('X'))
    expect(readPref('lastCategory')).toBe('X')
    await view(E)
    expect(readPref('lastViewedHash').get('X')).toBe(E)
    // Back to 「全部」 is stored too.
    await click(tab('全部'))
    expect(readPref('lastCategory')).toBe(ALL)
    expect(readPref('lastViewedHash').get('X')).toBe(E)
  })

  it('the board records the torrent it shows too', async () => {
    await mount('/?category=mteam-X')
    await view(B)
    expect(readPref('lastViewedHash').get('mteam-X')).toBe(B)
  })

  it('the settings page records nothing', async () => {
    await mount(`/settings?category=X&hash=${E}`)
    expect(localStorage.getItem(PREF_KEYS.lastCategory)).toBeNull()
    expect(localStorage.getItem(PREF_KEYS.lastViewedHash)).toBeNull()
  })

  it('a URL that is followed is recorded as the place', async () => {
    await mount(`/?category=X&sort=added_on&hash=${E}`)
    expect(readPref('lastCategory')).toBe('X')
    expect(readPref('lastViewedHash').get('X')).toBe(E)
  })

  it('a hash whose torrent arrives in a later answer is recorded then', async () => {
    remember(ALL, { X: E })
    const later = fakeHash(10)
    await mount(`/?category=X&sort=added_on&hash=${later}`)
    expect(readPref('lastViewedHash').get('X')).toBe(E)
    maindata = fakeResponse({
      changed: [
        ...torrents(),
        t({ hash: later, name: 'Fake.Late', category: 'X', added_on: 70 }),
      ],
    })
    await act(async () => {
      await client.refetchQueries({ queryKey: ['maindata'] })
    })
    expect(readPref('lastViewedHash').get('X')).toBe(later)
  })

  it('a row the app moved to by itself is not stored (a keyword hid the viewed one)', async () => {
    await mount('/?category=mteam-X&sort=added_on&dir=desc')
    await view(B)
    expect(readPref('lastViewedHash').get('mteam-X')).toBe(B)
    // `keep` matches A and C, not B: the panel follows to the next match.
    await go('/', {
      category: 'mteam-X',
      sort: 'added_on',
      dir: 'desc',
      hash: B,
      q: 'keep',
    })
    expect(search()).toMatchObject({ hash: C })
    expect(readPref('lastViewedHash').get('mteam-X')).toBe(B)
    // The keyword goes: still B remembered, until Alex picks a row.
    await go('/', {
      category: 'mteam-X',
      sort: 'added_on',
      dir: 'desc',
      hash: C,
    })
    expect(readPref('lastViewedHash').get('mteam-X')).toBe(B)
    await view(A)
    expect(readPref('lastViewedHash').get('mteam-X')).toBe(A)
  })

  it('a stale or foreign hash never replaces the category’s entry', async () => {
    remember(ALL, { X: E, 'mteam-X': B })
    // Another category's torrent.
    await mount(`/?category=X&sort=added_on&hash=${A}`)
    expect(readPref('lastViewedHash').get('X')).toBe(E)
    // An archived one of the category.
    await go('/', { category: 'mteam-X', sort: 'added_on', hash: H })
    expect(readPref('lastViewedHash').get('mteam-X')).toBe(B)
    // One maindata does not have.
    await go('/', { category: 'mteam-X', sort: 'added_on', hash: fakeHash(99) })
    expect(readPref('lastViewedHash').get('mteam-X')).toBe(B)
    // A row of the category is stored.
    await go('/', { category: 'mteam-X', sort: 'added_on', hash: C })
    expect(readPref('lastViewedHash').get('mteam-X')).toBe(C)
  })
})

describe('opening on a bare URL', () => {
  it('goes back to the last category with its sort (replace), the panel on its torrent', async () => {
    settingsAnswer = remembering({
      'mteam-X': { sort: 'added_on', dir: 'desc' },
    })
    remember('mteam-X', { 'mteam-X': B })
    const generation = entranceStore.state.generation
    await mount('/')
    expect(search()).toEqual({
      category: 'mteam-X',
      sort: 'added_on',
      dir: 'desc',
    })
    expect(router.history.length).toBe(1)
    expect(selectedTab()).toBe('mteam-X')
    // B, not the first row A; the URL gets no `hash`.
    expect(panel()).toContain('Fake.B')
    expect(panel()).not.toContain('Fake.A')
    // Not a tab switch: no hint, no entrance replay.
    expect(pillText()).not.toContain('記住的')
    expect(entranceStore.state.generation).toBe(generation)
    // The list and the board waited: 「全部」 was never shown in between.
    expect(new Set(probe.readyCategories)).toEqual(new Set(['mteam-X']))
  })

  it('uncategorized: category= in the URL, its tab, its torrent', async () => {
    settingsAnswer = remembering({ '': { sort: 'added_on', dir: 'desc' } })
    remember('', { '': I })
    await mount('/')
    expect(search()).toEqual({ category: '', sort: 'added_on', dir: 'desc' })
    expect(router.state.location.href).toMatch(/[?&]category=(&|$)/)
    expect(selectedTab()).toBe('未分類')
    // I, not the first row F.
    expect(panel()).toContain('Fake.I')
    expect(panel()).not.toContain('Fake.F')
  })

  it('no remembered sort: 「狀態」 (the board), no detail opens', async () => {
    remember('X', { X: E })
    await mount('/')
    expect(search()).toMatchObject({ category: 'X', sort: 'state' })
    expect(main().querySelector('[aria-label="看板"]')).not.toBeNull()
    expect(panel()).toBeNull()
    expect('hash' in search()).toBe(false)
  })

  it('q alone is still bare: the keyword stays', async () => {
    settingsAnswer = remembering({ X: { sort: 'added_on', dir: 'desc' } })
    remember('X')
    await mount('/?q=Fake')
    expect(search()).toMatchObject({
      category: 'X',
      sort: 'added_on',
      q: 'Fake',
    })
  })

  it('a category no torrent has any more: 「全部」 with its remembered sort', async () => {
    settingsAnswer = remembering({ [ALL]: { sort: 'added_on', dir: 'desc' } })
    remember('mteam-gone')
    await mount('/')
    expect(selectedTab()).toBe('全部')
    expect('category' in search()).toBe(false)
    expect(pillText()).toContain('加入時間')
    // The screen is 「全部」 now, and that is what is stored.
    expect(readPref('lastCategory')).toBe(ALL)
  })

  it('a category holding only archived torrents still exists (3.2 rule)', async () => {
    remember('mteam-tv')
    await mount('/')
    expect(search()).toMatchObject({ category: 'mteam-tv' })
  })

  describe('the remembered torrent not in the list: the first row', () => {
    beforeEach(() => {
      settingsAnswer = remembering({
        'mteam-X': { sort: 'added_on', dir: 'desc' },
      })
    })

    it('gone', async () => {
      remember('mteam-X', { 'mteam-X': fakeHash(99) })
      await mount('/')
      expect(panel()).toContain('Fake.A')
    })

    it('archived', async () => {
      remember('mteam-X', { 'mteam-X': H })
      await mount('/')
      expect(panel()).toContain('Fake.A')
      expect(panel()).not.toContain('Fake.H')
    })

    it('filtered out by the keyword: the first match', async () => {
      remember('mteam-X', { 'mteam-X': B })
      // `keep` matches A and C, not B.
      await mount('/?q=keep')
      expect(search()).toMatchObject({ category: 'mteam-X', q: 'keep' })
      expect(panel()).toContain('Fake.A')
      expect(panel()).not.toContain('Fake.B')
    })
  })

  it('a category whose only torrent is archived: the empty list, no panel', async () => {
    settingsAnswer = remembering({
      'mteam-tv': { sort: 'added_on', dir: 'desc' },
    })
    remember('mteam-tv', { 'mteam-tv': G })
    await mount('/')
    expect(search()).toMatchObject({ category: 'mteam-tv' })
    expect(main().textContent).toContain('這個分類沒有種子')
    expect(panel()).toBeNull()
  })

  it('phone: the category comes back, no sheet opens', async () => {
    phoneWidth()
    settingsAnswer = remembering({
      'mteam-X': { sort: 'added_on', dir: 'desc' },
    })
    remember('mteam-X', { 'mteam-X': B })
    await mount('/')
    expect(search()).toMatchObject({ category: 'mteam-X', sort: 'added_on' })
    expect('hash' in search()).toBe(false)
    expect(document.querySelector('[role="dialog"]')).toBeNull()
    expect(document.body.textContent).not.toContain('Fake.B')
  })
})

describe('a URL with a place wins', () => {
  beforeEach(() => {
    settingsAnswer = remembering({
      'mteam-X': { sort: 'added_on', dir: 'desc' },
    })
    remember('mteam-X', { 'mteam-X': B })
  })

  it('sort', async () => {
    await mount('/?sort=ratio')
    expect(search()).toEqual({ sort: 'ratio' })
    expect(selectedTab()).toBe('全部')
  })

  it('hash', async () => {
    await mount(`/?hash=${E}`)
    expect(search()).toEqual({ hash: E })
  })

  it('category', async () => {
    await mount('/?category=X')
    expect(search()).toEqual({ category: 'X' })
    expect(selectedTab()).toBe('X')
  })

  it('sort without hash in list mode: the panel shows the category’s torrent', async () => {
    await mount('/?category=mteam-X&sort=added_on')
    expect(search()).toEqual({ category: 'mteam-X', sort: 'added_on' })
    expect(panel()).toContain('Fake.B')
    expect(panel()).not.toContain('Fake.A')
  })
})

describe('a URL whose only place params are invalid', () => {
  beforeEach(() => {
    settingsAnswer = remembering({
      'mteam-X': { sort: 'added_on', dir: 'desc' },
    })
    remember('mteam-X', { 'mteam-X': B })
  })

  // Claude 代決: such a URL ends up bare and is restored. Start's server
  // redirects it to the cleaned URL before the app runs (and the router
  // cleans it again before any route renders), so the app cannot tell it
  // from a bare one.
  it.each(['/?sort=bogus', '/?hash=NOT-A-HASH', '/?category=%01'])(
    '%s restores the remembered category',
    async (url) => {
      await mount(url)
      expect(search()).toEqual({
        category: 'mteam-X',
        sort: 'added_on',
        dir: 'desc',
      })
      expect(selectedTab()).toBe('mteam-X')
      expect(panel()).toContain('Fake.B')
    },
  )
})

describe('the restore waits, gives way, or gives up', () => {
  beforeEach(() => {
    settingsAnswer = remembering({
      'mteam-X': { sort: 'added_on', dir: 'desc' },
    })
    remember('mteam-X', { 'mteam-X': B })
  })

  it('the settings page meanwhile: nothing changes there; back on the list it runs', async () => {
    const written = watchLastCategory()
    const settings = deferSettings()
    await mount('/')
    await go('/settings')
    await settings.release()
    expect(pathname()).toBe('/settings')
    expect('category' in search()).toBe(false)
    expect(readPref('lastCategory')).toBe('mteam-X')
    await go('/')
    expect(search()).toEqual({
      category: 'mteam-X',
      sort: 'added_on',
      dir: 'desc',
    })
    expect(panel()).toContain('Fake.B')
    expect(written).not.toContain(JSON.stringify(ALL))
  })

  it('a sort written meanwhile wins', async () => {
    const settings = deferSettings()
    await mount('/')
    await go('/', { sort: 'ratio' })
    await settings.release()
    expect(search()).toEqual({ sort: 'ratio' })
    expect(selectedTab()).toBe('全部')
  })

  it('opening on the settings page: the restore runs once back on the list', async () => {
    const written = watchLastCategory()
    await mount('/settings')
    expect(pathname()).toBe('/settings')
    expect('category' in search()).toBe(false)
    expect(readPref('lastCategory')).toBe('mteam-X')
    await go('/')
    expect(search()).toEqual({
      category: 'mteam-X',
      sort: 'added_on',
      dir: 'desc',
    })
    expect(panel()).toContain('Fake.B')
    expect(written).not.toContain(JSON.stringify(ALL))
  })

  it('opening on the settings page, then the 「全部」 tab: 「全部」 stays', async () => {
    await mount('/settings')
    await click(tab('全部'))
    expect(pathname()).toBe('/')
    expect('category' in search()).toBe(false)
    expect(selectedTab()).toBe('全部')
    expect(readPref('lastCategory')).toBe(ALL)
  })

  it('opening on the settings page, then a list URL with a place: no restore', async () => {
    await mount('/settings')
    await go('/', { sort: 'ratio' })
    expect(search()).toEqual({ sort: 'ratio' })
    expect(selectedTab()).toBe('全部')
  })

  it('「全部」 is never written while a restore runs', async () => {
    const written = watchLastCategory()
    await mount('/')
    expect(search()).toMatchObject({ category: 'mteam-X' })
    expect(written).not.toContain(JSON.stringify(ALL))
  })

  it('「狀態」 is written once, without dir', async () => {
    settingsAnswer = defaultSettings()
    const history = createMemoryHistory({ initialEntries: ['/'] })
    const replace = vi.spyOn(history, 'replace')
    await mount('/', history)
    expect(search()).toEqual({ category: 'mteam-X', sort: 'state' })
    const written = replace.mock.calls.map(([path]) => String(path))
    expect(written.filter((path) => path.includes('category='))).toHaveLength(1)
    expect(written.some((path) => path.includes('dir='))).toBe(false)
  })

  it('the first maindata request failed: the error shows, a late answer never jumps', async () => {
    const written = watchLastCategory()
    fetchMaindata = () => Promise.reject(new Error('unreachable'))
    await mount('/')
    expect(main().textContent).toContain('讀不到種子清單')
    expect(written).toEqual([])
    fetchMaindata = () => Promise.resolve(maindata)
    await act(async () => {
      await client.refetchQueries({ queryKey: ['maindata'] })
    })
    expect('category' in search()).toBe(false)
    expect(selectedTab()).toBe('全部')
    // One blip at open never erases the remembered place.
    expect(readPref('lastCategory')).toBe('mteam-X')
    expect(written).toEqual([])
    // Alex moving is recorded again, back to 「全部」 too.
    await click(tab('X'))
    expect(readPref('lastCategory')).toBe('X')
    await click(tab('全部'))
    expect(readPref('lastCategory')).toBe(ALL)
  })
})

describe('list mode prefers the category’s last viewed torrent', () => {
  it('on a tab switch, without moving to it', async () => {
    settingsAnswer = remembering({
      [ALL]: { sort: 'added_on', dir: 'desc' },
      X: { sort: 'added_on', dir: 'desc' },
      'mteam-X': { sort: 'added_on', dir: 'desc' },
    })
    remember(ALL, { X: E, 'mteam-X': C })
    await mount('/')
    // 「全部」 remembers nothing: the first row (D is the newest listed).
    expect(panel()).toContain('Fake.D')
    await click(tab('X'))
    expect(panel()).toContain('Fake.E')
    expect('hash' in search()).toBe(false)
    await click(tab('mteam-X'))
    expect(panel()).toContain('Fake.C')
  })

  it('on a sort change from the board to the list', async () => {
    remember(ALL, { X: E })
    await mount('/?category=X')
    expect(panel()).toBeNull()
    await act(async () => probe.pickView({ sort: 'added_on', dir: 'desc' }))
    expect(panel()).toContain('Fake.E')
  })

  it('a torrent viewed in this session is preferred after leaving and coming back', async () => {
    settingsAnswer = remembering({
      [ALL]: { sort: 'added_on', dir: 'desc' },
      X: { sort: 'added_on', dir: 'desc' },
      'mteam-X': { sort: 'added_on', dir: 'desc' },
    })
    await mount('/')
    await click(tab('X'))
    expect(panel()).toContain('Fake.D')
    await view(E)
    // mteam-X does not hold E: the URL drops it.
    await click(tab('mteam-X'))
    expect('hash' in search()).toBe(false)
    await click(tab('X'))
    expect('hash' in search()).toBe(false)
    expect(panel()).toContain('Fake.E')
  })

  it('the board never opens the detail on a switch', async () => {
    remember(ALL, { X: E })
    await mount('/')
    await click(tab('X'))
    expect(main().querySelector('[aria-label="看板"]')).not.toBeNull()
    expect(panel()).toBeNull()
  })
})

describe('stored values that cannot be used', () => {
  it('garbage reads as absent: 「全部」, the first row', async () => {
    settingsAnswer = remembering({ X: { sort: 'added_on', dir: 'desc' } })
    localStorage.setItem(PREF_KEYS.lastCategory, '{garbage')
    localStorage.setItem(
      PREF_KEYS.lastViewedHash,
      JSON.stringify([['X', 'not-a-hash']]),
    )
    await mount('/?category=X')
    expect(panel()).toContain('Fake.D')
    await act(async () => root.unmount())
    container.remove()
    client.clear()
    localStorage.setItem(PREF_KEYS.lastCategory, '{garbage')
    await mount('/')
    expect(search()).toEqual({})
    expect(selectedTab()).toBe('全部')
  })

  it('blocked storage: behaves as before, no error', async () => {
    vi.spyOn(window, 'localStorage', 'get').mockImplementation(() => {
      throw new Error('blocked')
    })
    settingsAnswer = remembering({ X: { sort: 'added_on', dir: 'desc' } })
    await mount('/')
    expect(search()).toEqual({})
    expect(selectedTab()).toBe('全部')
    await click(tab('X'))
    expect(search()).toMatchObject({ category: 'X' })
    expect(panel()).toContain('Fake.D')
  })
})
