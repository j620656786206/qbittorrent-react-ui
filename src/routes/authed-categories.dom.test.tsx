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
import { LIST_SCROLL_ID, MAIN_ID } from '#/shared/ui/main-scroll'
import { clearConnectionErrors } from '#/state/connection'
import { entranceStore, resetEntrance } from '#/state/entrance'
import { clearLoginRequired } from '#/state/login-required'
import { createQueryClient } from '#/state/query-client'

// Story 3.2, the client half of the I/O matrix through the real `_authed`
// layout in a real router: a tab click (URL with `replace`, the category's
// remembered sort or 「狀態」, back to the top, the entrance replayed, the
// 「（這個分類記住的）」 hint), a manual pick saving per category, a reload
// on a category, a bad or vanished category falling back to 「全部」 with
// the URL fixed, the selected category emptying on screen, and the tab
// row (order, counts, plain-text names). Only the session and
// setCategorySort server functions are replaced; maindata and settings
// come from fakes passed to createQueryClient. Fake data only (code names).
// https://tanstack.com/router/latest/docs/framework/react/guide/search-params

vi.mock('#/server/functions/get-session', () => ({ getSession: vi.fn() }))
vi.mock('#/server/functions/set-category-sort', () => ({
  setCategorySort: vi.fn(),
}))
vi.mock('#/lib/toast', () => ({
  toast: { failure: () => {}, dismissFor: () => {} },
}))
// The real shell, plus a probe that hands the test the layout's `pickView`
// (the sort menu's own clicks are tested in sort-menu.dom.test.tsx and in
// Chromium: closing the Radix menu spins in happy-dom, see
// authed-settings.dom.test.tsx).
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
const setCategorySortFn = vi.mocked(setCategorySort)

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean | undefined
}

const archived = { state: 'missingFiles', private: false } as const

/** mteam-X 3, X 2, uncategorized 1, mteam-tv only archived, one markup name. */
function torrents() {
  return [
    t({
      hash: fakeHash(1),
      name: 'Fake.A',
      category: 'mteam-X',
      seeding_time: 30,
    }),
    t({
      hash: fakeHash(2),
      name: 'Fake.B',
      category: 'mteam-X',
      seeding_time: 20,
    }),
    t({
      hash: fakeHash(3),
      name: 'Fake.C',
      category: 'mteam-X',
      seeding_time: 10,
    }),
    t({ hash: fakeHash(4), name: 'Fake.D', category: 'X' }),
    t({ hash: fakeHash(5), name: 'Fake.E', category: 'X' }),
    t({ hash: fakeHash(6), name: 'Fake.F', category: '' }),
    t({ hash: fakeHash(7), name: 'Fake.G', category: 'mteam-tv', ...archived }),
    t({
      hash: fakeHash(8),
      name: 'Fake.H',
      category: '<script>alert(1)</script>',
    }),
  ]
}

const remembering = (
  entries: Record<string, { sort: SortFieldId; dir: 'asc' | 'desc' }>,
  categoryOrder: Array<string> = [],
): Settings => ({
  ...defaultSettings(),
  categorySort: entries,
  categoryOrder,
})

let root: Root
let container: HTMLElement
let client: QueryClient
let router: ReturnType<typeof createRouter>
let maindata: MaindataResponse
let settingsAnswer: Settings
let saves: Array<unknown>

async function mount(initial: string) {
  client = createQueryClient({
    currentPath: () => initial,
    fetchMaindata: () => Promise.resolve(maindata),
    fetchSettings: () => Promise.resolve(settingsAnswer),
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

/** A new maindata answer, fetched now (as the next poll would). */
async function poll(next: MaindataResponse) {
  maindata = next
  await act(async () => {
    await client.refetchQueries({ queryKey: ['maindata'] })
  })
}

const search = () => router.state.location.search as Record<string, unknown>
const main = () => document.getElementById(MAIN_ID) as HTMLElement
const tablist = () =>
  document.querySelector('[role="group"][aria-label="分類"]') as HTMLElement
const tabs = () =>
  [...tablist().querySelectorAll('button')].map((tab) => tab.textContent.trim())
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
const pill = () =>
  document
    .querySelector('button[aria-haspopup="menu"][aria-label^="排序："]')
    ?.getAttribute('aria-label') ?? ''
const pillText = () =>
  document.querySelector('button[aria-haspopup="menu"][aria-label^="排序："]')
    ?.textContent ?? ''
/** The list section's count (happy-dom lays out no virtual rows). */
const listCount = () =>
  /共 (\d+) 個/.exec(
    main()
      .querySelector('section[aria-label^="種子列表"]')
      ?.getAttribute('aria-label') ?? '',
  )?.[1]

async function click(element: HTMLElement) {
  await act(async () => element.click())
}

async function pick(sort: string, dir = 'desc') {
  await act(async () => probe.pickView({ sort, dir }))
}

beforeEach(() => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true
  // Story 3.6: the last category and torrent are remembered per device.
  localStorage.clear()
  notifyManager.setScheduler((callback) => callback())
  maindata = fakeResponse({ changed: torrents() })
  settingsAnswer = defaultSettings()
  saves = []
  getSessionFn.mockReset()
  getSessionFn.mockResolvedValue({
    ok: true,
    data: { exp: Math.floor(Date.now() / 1000) + 3600 },
  } as never)
  setCategorySortFn.mockReset()
  setCategorySortFn.mockImplementation((options: { data: unknown }) => {
    saves.push(options.data)
    return new Promise(() => {}) as never
  })
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
  notifyManager.setScheduler((callback) => setTimeout(callback, 0))
  globalThis.IS_REACT_ACT_ENVIRONMENT = false
  vi.restoreAllMocks()
})

describe('the tab row', () => {
  it('「全部」 first, then categoryOrder, then the rest by name; counts without archived', async () => {
    settingsAnswer = remembering({}, ['X'])
    await mount('/')
    // Pinned: zh-Hant puts the markup name, then 未分類 (by its label),
    // then the Latin names.
    expect(tabs().map((text) => text.replace(/\d+$/, ''))).toEqual([
      '全部',
      'X',
      '<script>alert(1)</script>',
      '未分類',
      'mteam-tv',
      'mteam-X',
    ])
    expect(tab('全部').textContent).toBe('全部7')
    expect(tab('mteam-X').textContent).toBe('mteam-X3')
    expect(tab('未分類').textContent).toBe('未分類1')
    // Only archived torrents: the tab stays, with 0.
    expect(tab('mteam-tv').textContent).toBe('mteam-tv0')
    expect(selectedTab()).toBe('全部')
  })

  it('a markup category name is plain text', async () => {
    await mount('/')
    const markup = tab('<script>alert(1)</script>')
    expect(markup.querySelector('script')).toBeNull()
    expect(document.querySelector('[role="group"] script')).toBeNull()
  })

  it('tabs are buttons in a labelled group; only the selected one is aria-pressed', async () => {
    await mount('/')
    const all = [...tablist().querySelectorAll('button')]
    expect(all.every((element) => element.tagName === 'BUTTON')).toBe(true)
    expect(
      all.filter((element) => element.getAttribute('aria-pressed') === 'true'),
    ).toHaveLength(1)
  })
})

describe('a tab click', () => {
  it('to a remembered sort: URL with replace, its sort, top, entrance, hint', async () => {
    settingsAnswer = remembering({
      'mteam-X': { sort: 'seeding_time', dir: 'desc' },
    })
    await mount('/')
    expect(pill()).toBe('排序：狀態，看板')
    const historyLength = router.history.length
    const generation = entranceStore.state.generation
    main().scrollTop = 500
    await click(tab('mteam-X'))
    expect(search()).toMatchObject({
      category: 'mteam-X',
      sort: 'seeding_time',
      dir: 'desc',
    })
    expect(router.history.length).toBe(historyLength)
    expect(selectedTab()).toBe('mteam-X')
    expect(main().scrollTop).toBe(0)
    expect(entranceStore.state.generation).toBe(generation + 1)
    expect(listCount()).toBe('3')
    expect(pill()).toBe('排序：做種時間，久的在前（這個分類記住的），列表')
    expect(pillText()).toContain('（這個分類記住的）')
    // An app-driven change never writes the remembered sort.
    expect(saves).toEqual([])
  })

  it('the list scroller goes back to the top too', async () => {
    settingsAnswer = remembering({
      [ALL]: { sort: 'added_on', dir: 'desc' },
      X: { sort: 'name', dir: 'desc' },
    })
    await mount('/')
    const scroller = document.getElementById(LIST_SCROLL_ID)
    if (scroller === null) throw new Error('no list scroller')
    scroller.scrollTop = 300
    await click(tab('X'))
    // The same scroller (the list stayed mounted), back at the top.
    expect(document.getElementById(LIST_SCROLL_ID)).toBe(scroller)
    expect(scroller.scrollTop).toBe(0)
  })

  it('no remembered sort: 狀態; no hint when the sort before was 狀態 too', async () => {
    await mount('/')
    await click(tab('X'))
    expect(search()).toMatchObject({ category: 'X', sort: 'state' })
    expect(pill()).toBe('排序：狀態，看板')
    expect(pillText()).not.toContain('記住的')
  })

  it('no remembered sort from a list sort: 狀態, no hint (nothing was remembered)', async () => {
    await mount('/?sort=ratio')
    await click(tab('X'))
    expect(search()).toMatchObject({ category: 'X', sort: 'state' })
    expect(pill()).toBe('排序：狀態，看板')
    expect(pillText()).not.toContain('記住的')
  })

  it('same sort as before: no hint', async () => {
    settingsAnswer = remembering({ X: { sort: 'ratio', dir: 'desc' } })
    await mount('/?sort=ratio&dir=desc')
    await click(tab('X'))
    expect(search()).toMatchObject({ category: 'X', sort: 'ratio' })
    expect(pillText()).not.toContain('記住的')
  })

  it('uncategorized: category= (empty) in the URL', async () => {
    await mount('/')
    await click(tab('未分類'))
    expect(search().category).toBe('')
    expect(router.state.location.href).toMatch(/[?&]category=(&|$)/)
    expect(selectedTab()).toBe('未分類')
  })

  it('「全部」 removes category from the URL', async () => {
    await mount('/?category=X')
    await click(tab('全部'))
    expect('category' in search()).toBe(false)
    expect(selectedTab()).toBe('全部')
  })

  it('clicking the selected tab does nothing', async () => {
    await mount('/?category=X&sort=ratio')
    const before = router.state.location.href
    const generation = entranceStore.state.generation
    await click(tab('X'))
    expect(router.state.location.href).toBe(before)
    expect(entranceStore.state.generation).toBe(generation)
  })

  it('the viewed torrent stays only when the new category holds it', async () => {
    await mount(`/?sort=added_on&hash=${fakeHash(1)}`)
    await click(tab('mteam-X'))
    expect(search().hash).toBe(fakeHash(1))
    await click(tab('X'))
    expect('hash' in search()).toBe(false)
  })

  it('the next switch decides the hint again; the app opening shows none', async () => {
    settingsAnswer = remembering({
      'mteam-X': { sort: 'seeding_time', dir: 'desc' },
      X: { sort: 'seeding_time', dir: 'desc' },
      '': { sort: 'ratio', dir: 'desc' },
    })
    await mount('/?category=mteam-X')
    // Opening on a category with its remembered sort: no hint.
    expect(pill()).toBe('排序：做種時間，久的在前，列表')
    await click(tab('X'))
    expect(pillText()).not.toContain('記住的')
    await click(tab('未分類'))
    expect(pillText()).toContain('（這個分類記住的）')
  })

  it('the entrance replays once per click, never on a later fallback', async () => {
    await mount('/')
    const generation = entranceStore.state.generation
    await click(tab('X'))
    expect(entranceStore.state.generation).toBe(generation + 1)
    // A bad link afterwards falls back to 「全部」: no replay.
    await act(async () => {
      await router.navigate({
        to: '/',
        search: { category: 'nope' } as never,
        replace: true,
      })
    })
    expect(selectedTab()).toBe('全部')
    expect(entranceStore.state.generation).toBe(generation + 1)
  })
})

describe('the hint after a change no click made', () => {
  it('a fallback to 「全部」 with the same sort shows no hint', async () => {
    settingsAnswer = remembering({
      'mteam-X': { sort: 'seeding_time', dir: 'desc' },
    })
    await mount('/')
    await click(tab('mteam-X'))
    expect(pillText()).toContain('記住的')
    await act(async () => {
      await router.navigate({
        to: '/',
        search: {
          category: 'nope',
          sort: 'seeding_time',
          dir: 'desc',
        } as never,
        replace: true,
      })
    })
    expect(selectedTab()).toBe('全部')
    expect(search()).toMatchObject({ sort: 'seeding_time' })
    expect(pillText()).not.toContain('記住的')
  })

  it('another category reached without a click shows no hint', async () => {
    settingsAnswer = remembering({
      'mteam-X': { sort: 'seeding_time', dir: 'desc' },
    })
    await mount('/')
    await click(tab('mteam-X'))
    await act(async () => {
      await router.navigate({
        to: '/',
        search: { category: 'X', sort: 'seeding_time', dir: 'desc' } as never,
        replace: true,
      })
    })
    expect(selectedTab()).toBe('X')
    expect(pillText()).not.toContain('記住的')
  })
})

describe('a manual pick inside a category', () => {
  it('saves that category and hides the hint', async () => {
    settingsAnswer = remembering({
      'mteam-X': { sort: 'seeding_time', dir: 'desc' },
    })
    await mount('/')
    await click(tab('mteam-X'))
    expect(pillText()).toContain('記住的')
    await pick('ratio')
    expect(saves).toEqual([{ category: 'mteam-X', sort: 'ratio', dir: 'desc' }])
    expect(search()).toMatchObject({ category: 'mteam-X', sort: 'ratio' })
    expect(pillText()).not.toContain('記住的')
  })

  it('in uncategorized: the key is the empty string', async () => {
    await mount('/?category=')
    await pick('ratio')
    expect(saves).toEqual([{ category: '', sort: 'ratio', dir: 'desc' }])
  })
})

describe('the URL', () => {
  it('a reload on a category shows it with its remembered sort', async () => {
    settingsAnswer = remembering({
      [ALL]: { sort: 'ratio', dir: 'desc' },
      'mteam-X': { sort: 'seeding_time', dir: 'desc' },
    })
    await mount('/?category=mteam-X')
    expect(selectedTab()).toBe('mteam-X')
    expect(pill()).toBe('排序：做種時間，久的在前，列表')
    expect(listCount()).toBe('3')
  })

  it('a category no torrent has: 「全部」, URL fixed with replace', async () => {
    await mount('/?category=nope&sort=ratio')
    const historyLength = router.history.length
    expect(selectedTab()).toBe('全部')
    expect('category' in search()).toBe(false)
    expect(search().sort).toBe('ratio')
    expect(router.history.length).toBe(historyLength)
    expect(listCount()).toBe('7')
  })

  it('a bad value (the 「全部」 key) is removed', async () => {
    await mount(`/?category=${ALL}`)
    expect('category' in search()).toBe(false)
    expect(selectedTab()).toBe('全部')
  })
})

describe('the selected category emptied while selected', () => {
  it('keeps its tab with 「這個分類沒有種子」 until Alex leaves', async () => {
    await mount('/?category=X&sort=added_on')
    expect(listCount()).toBe('2')
    await poll(
      fakeResponse({
        changed: torrents().filter((torrent) => torrent.category !== 'X'),
      }),
    )
    expect(search().category).toBe('X')
    expect(selectedTab()).toBe('X')
    expect(tab('X').textContent).toBe('X0')
    expect(main().textContent).toContain('這個分類沒有種子')
    const add = [...main().querySelectorAll('button')].find(
      (button) => button.textContent === '新增種子',
    )
    expect(add?.disabled).toBe(true)
    await click(tab('全部'))
    expect(tabs().some((text) => text.startsWith('X'))).toBe(false)
  })

  it('the board shows the same empty block', async () => {
    await mount('/?category=X')
    expect(main().querySelector('[aria-label="看板"]')).not.toBeNull()
    await poll(
      fakeResponse({
        changed: torrents().filter((torrent) => torrent.category !== 'X'),
      }),
    )
    expect(main().textContent).toContain('這個分類沒有種子')
  })

  it('only archived torrents: the list is empty, the board keeps 4 columns of 沒有', async () => {
    await mount('/?category=mteam-tv&sort=added_on')
    expect(main().textContent).toContain('這個分類沒有種子')
    await act(async () => {
      await router.navigate({
        to: '/',
        search: { category: 'mteam-tv' } as never,
        replace: true,
      })
    })
    const board = main().querySelector('[aria-label="看板"]')
    expect(board).not.toBeNull()
    expect(main().textContent).not.toContain('這個分類沒有種子')
    const columns = [...(board?.querySelectorAll('section') ?? [])]
    const nones = columns.filter((column) =>
      column.textContent.includes('沒有'),
    )
    expect(nones.length).toBeGreaterThanOrEqual(4)
  })
})

describe('another device (story 3.1 follow rule, per category)', () => {
  async function refocus() {
    await act(async () => {
      focusManager.setFocused(false)
      focusManager.setFocused(true)
      await Promise.resolve()
    })
  }

  it('a new remembered sort of the current category is followed', async () => {
    settingsAnswer = remembering({
      'mteam-X': { sort: 'seeding_time', dir: 'desc' },
    })
    await mount('/?category=mteam-X&sort=seeding_time&dir=desc')
    settingsAnswer = remembering({ 'mteam-X': { sort: 'ratio', dir: 'desc' } })
    await refocus()
    expect(search()).toMatchObject({ category: 'mteam-X', sort: 'ratio' })
  })

  it('following another device clears the hint; it never comes back by itself', async () => {
    settingsAnswer = remembering({
      'mteam-X': { sort: 'seeding_time', dir: 'desc' },
    })
    await mount('/')
    await click(tab('mteam-X'))
    expect(pillText()).toContain('記住的')
    settingsAnswer = remembering({ 'mteam-X': { sort: 'ratio', dir: 'desc' } })
    await refocus()
    expect(search()).toMatchObject({ sort: 'ratio' })
    expect(pillText()).not.toContain('記住的')
    // Back to the sort the switch had applied: still no hint.
    settingsAnswer = remembering({
      'mteam-X': { sort: 'seeding_time', dir: 'desc' },
    })
    await refocus()
    expect(search()).toMatchObject({ sort: 'seeding_time' })
    expect(pillText()).not.toContain('記住的')
  })

  it('a save in flight for another category never holds this one', async () => {
    settingsAnswer = remembering({ X: { sort: 'seeding_time', dir: 'desc' } })
    await mount('/?category=mteam-X&sort=added_on')
    // mteam-X's save never answers (the mock keeps it pending).
    await pick('ratio')
    expect(saves).toEqual([{ category: 'mteam-X', sort: 'ratio', dir: 'desc' }])
    await click(tab('X'))
    expect(search()).toMatchObject({ category: 'X', sort: 'seeding_time' })
    settingsAnswer = remembering({ X: { sort: 'name', dir: 'desc' } })
    await refocus()
    expect(search()).toMatchObject({ category: 'X', sort: 'name' })
  })

  it('another category changing leaves the screen alone', async () => {
    settingsAnswer = remembering({
      'mteam-X': { sort: 'seeding_time', dir: 'desc' },
    })
    await mount('/?category=mteam-X&sort=seeding_time&dir=desc')
    settingsAnswer = remembering({
      'mteam-X': { sort: 'seeding_time', dir: 'desc' },
      [ALL]: { sort: 'ratio', dir: 'desc' },
    })
    await refocus()
    expect(search()).toMatchObject({ sort: 'seeding_time' })
  })
})

// A `hash` from another category on load: the detail never shows a torrent
// outside the category on screen.
describe('a viewed torrent outside the category on load', () => {
  it('list (desktop): the detail falls back to the category first row', async () => {
    await mount(`/?category=X&sort=added_on&hash=${fakeHash(1)}`)
    expect(selectedTab()).toBe('X')
    // The panel shows one of X's torrents (the first row), never mteam-X's.
    const body = document.body.textContent
    expect(body.includes('Fake.D') || body.includes('Fake.E')).toBe(true)
    expect(body).not.toContain('Fake.A')
    // Story 2.4 row D3: a hash the list does not hold is left in the URL.
    expect(search().hash).toBe(fakeHash(1))
  })

  it('list (phone): a detail from another category never opens', async () => {
    vi.spyOn(window, 'matchMedia').mockImplementation(
      (query: string) =>
        ({
          matches: false,
          media: query,
          addEventListener: () => {},
          removeEventListener: () => {},
        }) as unknown as MediaQueryList,
    )
    await mount(`/?category=X&sort=added_on&hash=${fakeHash(1)}`)
    expect(selectedTab()).toBe('X')
    expect('hash' in search()).toBe(false)
    expect(document.body.textContent).not.toContain('Fake.A')
    expect(document.querySelector('[role="dialog"]')).toBeNull()
  })

  it('board: the detail closes', async () => {
    await mount(`/?category=X&hash=${fakeHash(1)}`)
    expect(main().querySelector('[aria-label="看板"]')).not.toBeNull()
    expect('hash' in search()).toBe(false)
    expect(document.body.textContent).not.toContain('Fake.A')
  })
})
