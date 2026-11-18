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
import { fakeHash, fakeResponse, t } from '#/lib/testing'
import { routeTree } from '#/routeTree.gen'
import type * as AppShellModule from '#/features/header/app-shell'
import { getSession } from '#/server/functions/get-session'
import { setCategorySort } from '#/server/functions/set-category-sort'
import { ALL } from '#/shared/categories'
import { defaultSettings } from '#/shared/settings'
import type { Settings } from '#/shared/settings'
import { LIST_SCROLL_ID, MAIN_ID } from '#/shared/ui/main-scroll'
import { clearConnectionErrors } from '#/state/connection'
import { clearLoginRequired } from '#/state/login-required'
import { createQueryClient } from '#/state/query-client'

// Story 3.1, the client half of the I/O matrix through the real `_authed`
// layout in a real router: the remembered sort of 「全部」, a manual pick
// saving it, another device's change on focus, a write in flight or
// failed, and the first-load skeleton waiting for the settings. Only the
// session and setCategorySort server functions are replaced; maindata and
// settings come from fakes passed to createQueryClient. Fake data only.
// https://tanstack.com/router/latest/docs/framework/react/guide/search-params

vi.mock('#/server/functions/get-session', () => ({ getSession: vi.fn() }))
vi.mock('#/server/functions/set-category-sort', () => ({
  setCategorySort: vi.fn(),
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
// (what the header's menu and sheet call: sort-menu.dom.test.tsx and
// sort-sheet.dom.test.tsx). Closing the Radix menu after a sort change
// here spins forever in happy-dom (a CPU profile shows React's
// dispatchEventForPluginEventSystem looping); e2e/settings-sort.spec.ts
// picks through the real menu in Chromium.
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

type Answer = Settings | AppError

const remembering = (sort: 'seeding_time' | 'ratio' | 'added_on' | 'state') =>
  ({
    ...defaultSettings(),
    categorySort: { [ALL]: { sort, dir: 'desc' } },
  }) satisfies Settings

const rememberingAsc = (sort: 'ratio') =>
  ({
    ...defaultSettings(),
    categorySort: { [ALL]: { sort, dir: 'asc' } },
  }) satisfies Settings

const maindata = fakeResponse({
  changed: Array.from({ length: 8 }, (_, i) =>
    t({
      hash: fakeHash(i + 1),
      name: `Fake.Show.S01E0${i + 1}`,
      state: 'uploading',
      progress: 1,
      seeding_time: 1000 * i,
    }),
  ),
})

let root: Root
let container: HTMLElement
let client: QueryClient
let router: ReturnType<typeof createRouter>
/** The settings reads, oldest first; each waits for `answerSettings`. */
let settingsReads: Array<(answer: Answer) => void>
/** setCategorySort calls; each waits for `answerSave`. */
let saves: Array<{
  data: unknown
  resolve: (value: unknown) => void
}>

async function answerSettings(
  answer: Answer,
  index = settingsReads.length - 1,
) {
  await act(async () => {
    settingsReads[index](answer)
    await Promise.resolve()
  })
}

async function answerSave(value: unknown, index = saves.length - 1) {
  await act(async () => {
    saves[index].resolve(value)
    await Promise.resolve()
  })
}

async function mount(initial: string) {
  client = createQueryClient({
    currentPath: () => initial,
    fetchMaindata: () => Promise.resolve(maindata),
    fetchSettings: () =>
      new Promise<Settings>((resolve, reject) => {
        settingsReads.push((answer) =>
          answer instanceof AppError ? reject(answer) : resolve(answer),
        )
      }),
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

const search = () => router.state.location.search as Record<string, unknown>
const main = () => document.getElementById(MAIN_ID) as HTMLElement
const busy = () => main().querySelector('[aria-busy="true"]')
/** The desktop pill's label, e.g. 「排序：做種時間，久的在前，列表」. */
const pill = () =>
  document
    .querySelector('button[aria-haspopup="menu"][aria-label^="排序："]')
    ?.getAttribute('aria-label') ?? ''

/** Alex picks `sort` (default direction ↓) or flips to `dir`. */
async function pick(sort: string, dir = 'desc') {
  await act(async () => probe.pickView({ sort, dir }))
}

async function refocus() {
  await act(async () => {
    focusManager.setFocused(false)
    focusManager.setFocused(true)
    await Promise.resolve()
  })
}

beforeEach(() => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true
  notifyManager.setScheduler((callback) => callback())
  settingsReads = []
  saves = []
  getSessionFn.mockReset()
  getSessionFn.mockResolvedValue({
    ok: true,
    data: { exp: Math.floor(Date.now() / 1000) + 3600 },
  } as never)
  setCategorySortFn.mockReset()
  setCategorySortFn.mockImplementation(
    (options: { data: unknown }) =>
      new Promise((resolve) => {
        saves.push({ data: options.data, resolve })
      }) as never,
  )
  clearLoginRequired()
  clearConnectionErrors()
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
  notifyManager.setScheduler((callback) => setTimeout(callback, 0))
  globalThis.IS_REACT_ACT_ENVIRONMENT = false
  vi.restoreAllMocks()
})

describe('first load waits for the settings', () => {
  it('settings slow: the skeleton stays after maindata until settings answer', async () => {
    await mount('/')
    expect(client.getQueryData(['maindata'])).toBeDefined()
    expect(busy()).not.toBeNull()
    await answerSettings(remembering('seeding_time'))
    expect(busy()).toBeNull()
    expect(pill()).toBe('排序：做種時間，久的在前，列表')
  })

  it('settings read fails: the defaults (狀態) and the data show', async () => {
    await mount('/')
    expect(busy()).not.toBeNull()
    await answerSettings(new AppError('qbit_rejected'))
    expect(busy()).toBeNull()
    expect(pill()).toBe('排序：狀態，看板')
  })
})

describe('the remembered sort of 全部', () => {
  it('URL without sort: the remembered sort (做種時間 ↓)', async () => {
    await mount('/')
    await answerSettings(remembering('seeding_time'))
    expect(pill()).toBe('排序：做種時間，久的在前，列表')
    expect(search().sort).toBeUndefined()
  })

  it('URL with sort: the URL wins', async () => {
    await mount('/?sort=ratio')
    await answerSettings(remembering('seeding_time'))
    expect(pill()).toBe('排序：分享率，高的在前，列表')
  })

  it('nothing remembered: 狀態', async () => {
    await mount('/')
    await answerSettings(defaultSettings())
    expect(pill()).toBe('排序：狀態，看板')
  })
})

describe('a manual pick', () => {
  it('pick 分享率: the URL changes and setCategorySort(ALL, ratio, desc) is sent once', async () => {
    await mount('/?sort=added_on')
    await answerSettings(defaultSettings())
    await pick('ratio')
    expect(search()).toMatchObject({ sort: 'ratio', dir: 'desc' })
    expect(saves.map((save) => save.data)).toEqual([
      { category: ALL, sort: 'ratio', dir: 'desc' },
    ])
    // The answer becomes ['settings'] and the screen stays.
    await answerSave({ ok: true, data: remembering('ratio') })
    expect(client.getQueryData(['settings'])).toEqual(remembering('ratio'))
    expect(pill()).toBe('排序：分享率，高的在前，列表')
  })

  it('a reload without sort then shows the pick', async () => {
    await mount('/?sort=added_on')
    await answerSettings(defaultSettings())
    await pick('ratio')
    await answerSave({ ok: true, data: remembering('ratio') })
    await act(async () => root.unmount())
    container.remove()
    client.clear()
    await mount('/')
    await answerSettings(remembering('ratio'))
    expect(pill()).toBe('排序：分享率，高的在前，列表')
  })

  it('write in flight: a focus read with the old settings keeps the pick', async () => {
    await mount('/?sort=ratio')
    await answerSettings(remembering('seeding_time'))
    await pick('ratio', 'asc')
    await refocus()
    await answerSettings(remembering('seeding_time'))
    expect(search()).toMatchObject({ sort: 'ratio', dir: 'asc' })
    expect(pill()).toBe('排序：分享率，低的在前，列表')
  })

  it('a newer read landing after the save answered never reverts the pick', async () => {
    await mount('/?sort=ratio')
    await answerSettings(remembering('seeding_time'))
    await pick('ratio', 'asc')
    // A focus read starts before the save answers...
    await refocus()
    await answerSave({ ok: true, data: rememberingAsc('ratio') })
    // ...and was cancelled by the save's answer: its old value never lands.
    await answerSettings(remembering('seeding_time'))
    expect(client.getQueryData(['settings'])).toEqual(rememberingAsc('ratio'))
    expect(pill()).toBe('排序：分享率，低的在前，列表')
  })

  it('write fails: the toast with 重試, the screen keeps the pick, 重試 sends the same call', async () => {
    await mount('/?sort=ratio')
    await answerSettings(remembering('seeding_time'))
    await pick('ratio', 'asc')
    await act(async () => {
      saves[0].resolve({
        ok: false,
        error: { code: 'settings_write_failed', message: '設定檔寫不進去' },
      })
      await new Promise((resolve) => setTimeout(resolve, 0))
    })
    expect(toasts.map((toast) => toast.text)).toEqual([
      '排序沒記住：設定檔寫不進去',
    ])
    expect(pill()).toBe('排序：分享率，低的在前，列表')
    // A later focus read still has the old value: nothing moves.
    await refocus()
    await answerSettings(remembering('seeding_time'))
    expect(pill()).toBe('排序：分享率，低的在前，列表')
    await act(async () => toasts[0].onRetry())
    expect(saves.map((save) => save.data)).toEqual([
      { category: ALL, sort: 'ratio', dir: 'asc' },
      { category: ALL, sort: 'ratio', dir: 'asc' },
    ])
  })
})

describe('another device', () => {
  it('a focus read with a new remembered sort: the screen switches, at the top', async () => {
    await mount('/?sort=added_on')
    await answerSettings(remembering('ratio'))
    expect(pill()).toBe('排序：加入時間，新的在前，列表')
    const scroller = document.getElementById(LIST_SCROLL_ID)
    if (scroller) scroller.scrollTop = 500
    main().scrollTop = 500
    await refocus()
    await answerSettings(remembering('seeding_time'))
    expect(search()).toMatchObject({ sort: 'seeding_time', dir: 'desc' })
    expect(pill()).toBe('排序：做種時間，久的在前，列表')
    expect(main().scrollTop).toBe(0)
    if (scroller) expect(scroller.scrollTop).toBe(0)
  })

  it('a focus read with the same remembered sort leaves a different screen alone', async () => {
    await mount('/?sort=added_on')
    await answerSettings(remembering('ratio'))
    await refocus()
    await answerSettings(remembering('ratio'))
    expect(search()).toMatchObject({ sort: 'added_on' })
  })

  it('URL without sort: the new remembered sort shows', async () => {
    await mount('/')
    await answerSettings(remembering('ratio'))
    expect(pill()).toBe('排序：分享率，高的在前，列表')
    main().scrollTop = 500
    await refocus()
    await answerSettings(remembering('seeding_time'))
    expect(pill()).toBe('排序：做種時間，久的在前，列表')
    // The same path as a URL sort: written with replace, back to the top.
    expect(search()).toMatchObject({ sort: 'seeding_time', dir: 'desc' })
    expect(main().scrollTop).toBe(0)
  })

  it('URL without sort, first read failed: a later read with a value switches the board to it', async () => {
    await mount('/')
    await answerSettings(new AppError('qbit_rejected'))
    expect(pill()).toBe('排序：狀態，看板')
    main().scrollTop = 500
    await refocus()
    await answerSettings(remembering('ratio'))
    expect(search()).toMatchObject({ sort: 'ratio', dir: 'desc' })
    expect(pill()).toBe('排序：分享率，高的在前，列表')
    expect(main().scrollTop).toBe(0)
  })

  it('URL without sort, the remembered value gone: back to 狀態 the same way', async () => {
    await mount('/')
    await answerSettings(remembering('ratio'))
    const scroller = document.getElementById(LIST_SCROLL_ID)
    if (scroller) scroller.scrollTop = 500
    main().scrollTop = 500
    await refocus()
    await answerSettings(defaultSettings())
    expect(search()).toMatchObject({ sort: 'state' })
    expect(pill()).toBe('排序：狀態，看板')
    expect(main().scrollTop).toBe(0)
  })
})

describe('saves in a row and in flight', () => {
  it('two picks in a row: the saves run in order and everything ends on the second pick', async () => {
    await mount('/?sort=added_on')
    await answerSettings(defaultSettings())
    await pick('ratio')
    await pick('seeding_time')
    expect(search()).toMatchObject({ sort: 'seeding_time', dir: 'desc' })
    // The second save waits for the first: its answer can never land first.
    expect(saves.map((save) => save.data)).toEqual([
      { category: ALL, sort: 'ratio', dir: 'desc' },
    ])
    await answerSave({ ok: true, data: remembering('ratio') }, 0)
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0))
    })
    expect(saves.map((save) => save.data)).toEqual([
      { category: ALL, sort: 'ratio', dir: 'desc' },
      { category: ALL, sort: 'seeding_time', dir: 'desc' },
    ])
    // The first answer did not move the screen back.
    expect(pill()).toBe('排序：做種時間，久的在前，列表')
    await answerSave({ ok: true, data: remembering('seeding_time') }, 1)
    expect(client.getQueryData(['settings'])).toEqual(
      remembering('seeding_time'),
    )
    expect(search()).toMatchObject({ sort: 'seeding_time', dir: 'desc' })
    expect(pill()).toBe('排序：做種時間，久的在前，列表')
  })

  it('a focus read with another remembered sort while a save is pending keeps the pick', async () => {
    await mount('/?sort=added_on')
    await answerSettings(remembering('seeding_time'))
    await pick('ratio', 'asc')
    await refocus()
    // Another device wrote meanwhile; this tab is still saving.
    await answerSettings(remembering('added_on'))
    expect(search()).toMatchObject({ sort: 'ratio', dir: 'asc' })
    expect(pill()).toBe('排序：分享率，低的在前，列表')
    await answerSave({ ok: true, data: rememberingAsc('ratio') })
    expect(search()).toMatchObject({ sort: 'ratio', dir: 'asc' })
    expect(pill()).toBe('排序：分享率，低的在前，列表')
  })
})
