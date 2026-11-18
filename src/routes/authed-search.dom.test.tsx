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
import { getSession } from '#/server/functions/get-session'
import { setCategorySort } from '#/server/functions/set-category-sort'
import type { MaindataResponse } from '#/shared/maindata'
import { defaultSettings } from '#/shared/settings'
import type { Settings } from '#/shared/settings'
import { DESKTOP_QUERY } from '#/shared/ui/breakpoint'
import { LIST_SCROLL_ID, MAIN_ID } from '#/shared/ui/main-scroll'
import { clearConnectionErrors } from '#/state/connection'
import { resetEntrance } from '#/state/entrance'
import { clearLoginRequired } from '#/state/login-required'
import { createQueryClient } from '#/state/query-client'
import { resetShortcuts } from '#/state/shortcuts'
import { SEARCH_STATUS_DELAY_MS } from '#/features/header/search-box'

// Story 3.5, the layout's half through the real `_authed` layout in a real
// router: typing writes `q` trimmed with `replace` (removed when empty),
// the list and the board filter by it, a reload with `q` opens the box with
// it, a category switch keeps the keyword (and the box) and goes back to
// the top, 「在全部裡找」 switches to 「全部」 with its sort keeping the
// keyword, ✕ and `Esc` remove `q`, a `q` with spaces is fixed with
// `replace`, and the settings page round trip keeps `q`. Only the session
// and setCategorySort are replaced; maindata and settings come from fakes.
// Fake data only (code names).
// https://tanstack.com/router/latest/docs/framework/react/guide/search-params

vi.mock('#/server/functions/get-session', () => ({ getSession: vi.fn() }))
vi.mock('#/server/functions/set-category-sort', () => ({
  setCategorySort: vi.fn(),
}))
vi.mock('#/lib/toast', () => ({
  toast: { failure: () => {}, dismissFor: () => {} },
}))
const getSessionFn = vi.mocked(getSession)
const setCategorySortFn = vi.mocked(setCategorySort)

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean | undefined
}

/** mteam-tv 2 (one Show), X 2 (one Show), mteam-X 1. */
function torrents() {
  return [
    t({
      hash: fakeHash(1),
      name: 'Fake.Show.S01E01',
      category: 'mteam-tv',
      added_on: 1_790_000_500,
    }),
    t({
      hash: fakeHash(2),
      name: 'Fake.Other.S02E01',
      category: 'mteam-tv',
      added_on: 1_790_000_400,
    }),
    t({
      hash: fakeHash(3),
      name: 'Fake.SHOW.S01E02',
      category: 'X',
      added_on: 1_790_000_300,
    }),
    t({
      hash: fakeHash(4),
      name: 'Fake.Movie',
      category: 'X',
      added_on: 1_790_000_200,
    }),
    t({
      hash: fakeHash(5),
      name: 'Fake.Clip',
      category: 'mteam-X',
      added_on: 1_790_000_100,
    }),
  ]
}

const listSorts = (): Settings => ({
  ...defaultSettings(),
  categorySort: {
    __all__: { sort: 'added_on', dir: 'desc' },
    'mteam-tv': { sort: 'added_on', dir: 'desc' },
    X: { sort: 'name', dir: 'asc' },
  },
})

let root: Root
let container: HTMLElement
let client: QueryClient
let router: ReturnType<typeof createRouter>
let maindata: MaindataResponse
let settingsAnswer: Settings

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

const search = () => router.state.location.search as Record<string, unknown>
const pathname = () => router.state.location.pathname
const main = () => document.getElementById(MAIN_ID) as HTMLElement
/** The desktop header (the shell renders both; happy-dom hides neither). */
const desktopHeader = () =>
  document.querySelector('header.lg\\:flex') as HTMLElement
const magnifier = () =>
  desktopHeader().querySelector<HTMLButtonElement>('button[aria-label="搜尋"]')
const field = () =>
  desktopHeader().querySelector<HTMLInputElement>('input[type="search"]')
const tab = (label: string) => {
  const found = [
    ...document.querySelectorAll('[role="group"][aria-label="分類"] button'),
  ].find((element) => element.firstElementChild?.textContent === label)
  if (!(found instanceof HTMLButtonElement)) throw new Error(`no tab ${label}`)
  return found
}
const listCount = () =>
  /共 (\d+) 個/.exec(
    main()
      .querySelector('section[aria-label^="種子列表"]')
      ?.getAttribute('aria-label') ?? '',
  )?.[1]
const noResult = () =>
  main().querySelector<HTMLElement>('section[aria-label="搜尋結果"]')

async function click(element: HTMLElement) {
  await act(async () => element.click())
}

async function type(input: HTMLInputElement, value: string) {
  await act(async () => {
    Object.getOwnPropertyDescriptor(
      HTMLInputElement.prototype,
      'value',
    )?.set?.call(input, value)
    input.dispatchEvent(new InputEvent('input', { bubbles: true }))
  })
  // The navigation commits.
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0))
  })
}

function press(key: string, target: EventTarget) {
  const event = new KeyboardEvent('keydown', {
    key,
    bubbles: true,
    cancelable: true,
  })
  target.dispatchEvent(event)
  return event
}

async function settle() {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0))
  })
}

beforeEach(() => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true
  notifyManager.setScheduler((callback) => callback())
  maindata = fakeResponse({ changed: torrents() })
  settingsAnswer = listSorts()
  vi.stubGlobal(
    'matchMedia',
    (query: string) =>
      ({
        matches: query === DESKTOP_QUERY,
        media: query,
        addEventListener: () => {},
        removeEventListener: () => {},
      }) as unknown as MediaQueryList,
  )
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
  resetShortcuts()
  focusManager.setFocused(undefined)
  clearLoginRequired()
  clearConnectionErrors()
  notifyManager.setScheduler((callback) => setTimeout(callback, 0))
  globalThis.IS_REACT_ACT_ENVIRONMENT = false
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('typing', () => {
  it('writes q trimmed with replace; the list filters; empty removes q', async () => {
    await mount('/')
    expect(listCount()).toBe('5')
    await click(magnifier() as HTMLButtonElement)
    const input = field()
    if (!input) throw new Error('no field')
    expect(document.activeElement).toBe(input)
    const historyLength = router.history.length
    await type(input, '  Show ')
    expect(search().q).toBe('Show')
    expect(router.history.length).toBe(historyLength)
    expect(listCount()).toBe('2')
    // The field keeps what was typed.
    expect(input.value).toBe('  Show ')
    await type(input, '   ')
    expect('q' in search()).toBe(false)
    expect(listCount()).toBe('5')
    // The box stays open with nothing in it.
    expect(field()).not.toBeNull()
  })

  it('each keystroke puts the list back at the top', async () => {
    await mount('/')
    await click(magnifier() as HTMLButtonElement)
    const scroller = document.getElementById(LIST_SCROLL_ID) as HTMLElement
    scroller.scrollTop = 300
    await type(field() as HTMLInputElement, 'fake')
    expect(scroller.scrollTop).toBe(0)
  })

  it('the board filters too (all four columns stay)', async () => {
    settingsAnswer = defaultSettings()
    await mount('/')
    await click(magnifier() as HTMLButtonElement)
    await type(field() as HTMLInputElement, 'show')
    const board = main().querySelector('[role="region"][aria-label="看板"]')
    expect(board).not.toBeNull()
    expect(
      [...(board?.querySelectorAll(':scope > section') ?? [])].map((section) =>
        section.getAttribute('aria-label'),
      ),
    ).toEqual([
      '要處理，0 個',
      '下載中，2 個',
      '做種中，0 個',
      '完成，0 個',
      '已整理欄',
    ])
  })
})

describe('reload', () => {
  it('?q=show opens the box with 「show」, filtered', async () => {
    await mount('/?q=show')
    expect(field()?.value).toBe('show')
    expect(magnifier()).toBeNull()
    expect(listCount()).toBe('2')
  })

  it('a q with spaces is fixed with replace; only spaces is removed', async () => {
    await mount('/?q=%20%20show%20')
    await settle()
    expect(search().q).toBe('show')
    expect(listCount()).toBe('2')
    await act(async () => root.unmount())
    container.remove()
    client.clear()
    await mount('/?q=%20%20&sort=ratio')
    await settle()
    expect(search()).toEqual({ sort: 'ratio' })
    expect(field()).toBeNull()
  })
})

describe('category switch', () => {
  it('keeps the keyword and the box, goes back to the top', async () => {
    await mount('/?q=show')
    const scroller = document.getElementById(LIST_SCROLL_ID) as HTMLElement
    scroller.scrollTop = 200
    await click(tab('X'))
    expect(search()).toMatchObject({ category: 'X', q: 'show' })
    expect(field()?.value).toBe('show')
    expect(listCount()).toBe('1')
    // The same scroller (the list stayed mounted), back at the top.
    expect(document.getElementById(LIST_SCROLL_ID)).toBe(scroller)
    expect(scroller.scrollTop).toBe(0)
  })

  it('tab counts and the phone category button do not follow the keyword', async () => {
    await mount('/?q=show')
    expect(tab('全部').textContent).toBe('全部5')
    expect(tab('mteam-tv').textContent).toBe('mteam-tv2')
    const phoneButton = document.querySelector(
      'button[aria-label="分類：全部"]',
    )
    expect(phoneButton?.textContent).toBe('全部5')
  })

  it('no result in a category, then 「在全部裡找」: 全部 with its sort, the keyword kept', async () => {
    await mount('/?category=mteam-X&sort=name&dir=asc&q=show')
    const block = noResult()
    if (!block) throw new Error('no no-result block')
    expect(block.querySelector('[role="status"]')?.textContent).toBe(
      '『show』在 mteam-X 找不到',
    )
    const button = block.querySelector('button') as HTMLButtonElement
    expect(button.textContent).toBe('在全部裡找')
    await click(button)
    expect(search()).toEqual({ q: 'show', sort: 'added_on', dir: 'desc' })
    expect(listCount()).toBe('2')
    expect(field()?.value).toBe('show')
  })

  it('no result in 「全部」: only 「找不到『…』」', async () => {
    await mount('/?q=%E7%89%A7%E7%A5%9E%E8%A8%98')
    const block = noResult()
    expect(block?.textContent).toBe('找不到『牧神記』')
    expect(block?.querySelector('button')).toBeNull()
  })

  it('the viewed torrent stays on a switch when the category holds it and it matches', async () => {
    await mount(`/?q=show&hash=${fakeHash(3)}`)
    await click(tab('X'))
    expect(search()).toMatchObject({ category: 'X', hash: fakeHash(3) })
    await click(tab('mteam-tv'))
    expect('hash' in search()).toBe(false)
  })

  it('a viewed row the keyword filters out: the row that took its place (2.4)', async () => {
    await mount(`/?hash=${fakeHash(2)}`)
    await click(magnifier() as HTMLButtonElement)
    await type(field() as HTMLInputElement, 'show')
    await settle()
    // Fake.Other (2) is gone; Fake.SHOW.S01E02 (3) took its place.
    expect(search().hash).toBe(fakeHash(3))
  })
})

describe('closing', () => {
  it('✕ removes q (replace) and collapses the box', async () => {
    await mount('/?q=show&sort=added_on')
    const historyLength = router.history.length
    const clear = desktopHeader().querySelector(
      'button[aria-label="清除搜尋"]',
    ) as HTMLButtonElement
    await click(clear)
    await settle()
    expect(search()).toEqual({ sort: 'added_on' })
    expect(router.history.length).toBe(historyLength)
    expect(field()).toBeNull()
    expect(magnifier()).not.toBeNull()
    expect(listCount()).toBe('5')
  })

  it('Esc from the field removes q and collapses the box', async () => {
    await mount('/')
    await click(magnifier() as HTMLButtonElement)
    await type(field() as HTMLInputElement, 'show')
    await act(async () => {
      press('Escape', field() as HTMLInputElement)
    })
    await settle()
    expect('q' in search()).toBe(false)
    expect(field()).toBeNull()
    expect(document.activeElement).toBe(magnifier())
  })

  it('/ opens the box on desktop', async () => {
    await mount('/')
    await act(async () => {
      press('/', document.body)
    })
    expect(document.activeElement).toBe(field())
  })
})

describe('the settings page round trip', () => {
  it('keeps q there and back', async () => {
    await mount('/?q=show&sort=added_on')
    const settings = desktopHeader().querySelector(
      'button[aria-label="設定"]',
    ) as HTMLButtonElement
    await click(settings)
    expect(pathname()).toBe('/settings')
    expect(search()).toMatchObject({ q: 'show' })
    expect(field()?.value).toBe('show')
    const back = main().querySelector(
      'a[aria-label="回到列表"]',
    ) as HTMLAnchorElement
    await click(back)
    await settle()
    expect(pathname()).toBe('/')
    expect(search()).toMatchObject({ q: 'show', sort: 'added_on' })
    expect(listCount()).toBe('2')
  })
})

describe('the board detail (story 2.4 under a keyword)', () => {
  const positionLine = () =>
    [...document.querySelectorAll('aside[aria-label="詳情"] span')].find(
      (span) => span.textContent.includes('個／共'),
    )?.textContent ?? ''

  it('N of M counts only matches; a keyword the viewed torrent lacks closes it', async () => {
    settingsAnswer = defaultSettings()
    await mount(`/?hash=${fakeHash(1)}`)
    expect(document.querySelector('aside[aria-label="詳情"]')).not.toBeNull()
    expect(positionLine()).toContain('共 5 個')
    await click(magnifier() as HTMLButtonElement)
    await type(field() as HTMLInputElement, 'show')
    expect(positionLine()).toContain('共 2 個')
    await type(field() as HTMLInputElement, 'movie')
    await settle()
    expect('hash' in search()).toBe(false)
    expect(document.querySelector('aside[aria-label="詳情"]')).toBeNull()
  })
})

describe('closing on the settings page', () => {
  it('/settings?q=show: ✕ removes q and stays on /settings', async () => {
    await mount('/settings?q=show')
    expect(field()?.value).toBe('show')
    const clear = desktopHeader().querySelector(
      'button[aria-label="清除搜尋"]',
    ) as HTMLButtonElement
    await click(clear)
    await settle()
    expect(pathname()).toBe('/settings')
    expect('q' in search()).toBe(false)
    expect(field()).toBeNull()
  })
})

describe('the screen reader status', () => {
  const status = () =>
    document.querySelector('p.sr-only[role="status"]') as HTMLElement

  async function rest() {
    await act(async () => {
      await new Promise((resolve) =>
        setTimeout(resolve, SEARCH_STATUS_DELAY_MS + 50),
      )
    })
  }

  it('always there; says the count, or the no-result line, once the keyword rests', async () => {
    await mount('/')
    expect(status()).not.toBeNull()
    expect(status().textContent).toBe('')
    await click(magnifier() as HTMLButtonElement)
    await type(field() as HTMLInputElement, 'show')
    expect(status().textContent).toBe('')
    await rest()
    expect(status().textContent).toBe('找到 2 個')
    await type(field() as HTMLInputElement, '牧神記')
    await rest()
    expect(status().textContent).toBe('找不到『牧神記』')
    await type(field() as HTMLInputElement, '')
    expect(status().textContent).toBe('')
  })
})
