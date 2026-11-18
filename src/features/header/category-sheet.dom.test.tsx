// @vitest-environment happy-dom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import type { Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { CategoryTab } from '#/lib/category-tabs'
import { fakeServerState } from '#/lib/testing'
import { ALL } from '#/shared/categories'
import { DESKTOP_QUERY } from '#/shared/ui/breakpoint'
import { MAIN_ID } from '#/shared/ui/main-scroll'
import { CategoryTabsContext, ListViewContext } from '#/state/list-view'
import { freezeStore, resetOrderFreeze } from '#/state/order-freeze'
import { openLayerCount, resetShortcuts } from '#/state/shortcuts'
import { PhoneCategoryButton } from '#/features/header/app-shell'
import { HeaderContext } from '#/features/header/header-context'
import { headerModel } from '#/features/header/header-model'

// Spec 3.4: the phone category button and its sheet. The layout's
// `selectCategory` and `openSettings` are spies here; what a switch does to
// the URL, the sort and the entrance is the layout's (authed-categories
// DOM test, e2e/category-sheet.spec.ts).

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean | undefined
}

const TABS: ReadonlyArray<CategoryTab> = [
  { key: ALL, label: '全部', count: 4 },
  { key: 'mteam-tv', label: 'mteam-tv', count: 203 },
  { key: 'X', label: 'X', count: 0 },
  { key: '', label: '未分類', count: 1 },
  { key: '<b>x</b>', label: '<b>x</b>', count: 2 },
]

let desktop = false
const desktopListeners = new Set<() => void>()
let root: Root
let container: HTMLElement
let main: HTMLElement
let category: string
let tabs: ReadonlyArray<CategoryTab> | undefined
let loaded: boolean
/** The first maindata load failed (spec 1.8). */
let loadFailed: boolean
let viewReady: boolean
let settingsOpen: boolean
const selectCategory = vi.fn()
const openSettings = vi.fn()

function render() {
  root.render(
    <ListViewContext
      value={{
        view: { sort: 'state', dir: 'desc', category, query: '' },
        viewReady,
        setView: () => {},
        pickView: () => {},
        selectCategory,
        rememberedHint: false,
        openSettings,
        settingsOpen,
        searchOpen: false,
        openSearch: () => {},
        setQuery: () => {},
        closeSearch: () => {},
      }}
    >
      <CategoryTabsContext value={tabs}>
        <HeaderContext
          value={{
            model: headerModel({
              serverState: loaded ? fakeServerState() : undefined,
              alert: null,
              allCount: loaded ? 4 : undefined,
              loadFailed,
            }),
            retrying: false,
            onBarAction: () => {},
          }}
        >
          <PhoneCategoryButton />
        </HeaderContext>
      </CategoryTabsContext>
    </ListViewContext>,
  )
}

async function mount() {
  await act(async () => render())
}

const button = () =>
  container.querySelector('button[aria-haspopup="dialog"]') as HTMLButtonElement
const sheet = () => document.querySelector<HTMLElement>('[role="dialog"]')
const rows = () => [
  ...document.querySelectorAll<HTMLButtonElement>(
    '[role="dialog"] li > button',
  ),
]
const names = () =>
  rows().map((row) => row.querySelector('span:nth-child(2)')?.textContent)
const row = (label: string) =>
  rows().find(
    (item) => item.querySelector('span:nth-child(2)')?.textContent === label,
  ) as HTMLButtonElement
const settingsRow = () =>
  [
    ...document.querySelectorAll<HTMLButtonElement>(
      '[role="dialog"] button:not([aria-label="關閉"])',
    ),
  ].find((item) => item.textContent === '設定') as HTMLButtonElement

async function open() {
  await act(async () => button().click())
}

async function click(element: HTMLElement) {
  await act(async () => element.click())
}

beforeEach(() => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true
  resetOrderFreeze()
  desktop = false
  desktopListeners.clear()
  vi.spyOn(window, 'matchMedia').mockImplementation(
    (query: string) =>
      ({
        get matches() {
          return query === DESKTOP_QUERY ? desktop : query.includes('reduce')
        },
        addEventListener: (_: string, listener: () => void) => {
          if (query === DESKTOP_QUERY) desktopListeners.add(listener)
        },
        removeEventListener: (_: string, listener: () => void) => {
          desktopListeners.delete(listener)
        },
      }) as unknown as MediaQueryList,
  )
  main = document.createElement('main')
  main.id = MAIN_ID
  document.body.append(main)
  container = document.createElement('div')
  document.body.append(container)
  root = createRoot(container)
  category = ALL
  tabs = TABS
  loaded = true
  loadFailed = false
  viewReady = true
  settingsOpen = false
  selectCategory.mockClear()
  openSettings.mockClear()
})

afterEach(async () => {
  await act(async () => root.unmount())
  container.remove()
  main.remove()
  resetOrderFreeze()
  resetShortcuts()
  vi.restoreAllMocks()
  globalThis.IS_REACT_ACT_ENVIRONMENT = false
})

describe('the phone category button', () => {
  it('enabled: 「<name> <count> ▾」, its label, a dialog, expanded while open', async () => {
    category = 'mteam-tv'
    await mount()
    expect(button().disabled).toBe(false)
    expect(button().textContent).toBe('mteam-tv203')
    expect(button().getAttribute('aria-label')).toBe('分類：mteam-tv')
    expect(button().className).toContain('h-11')
    expect(button().getAttribute('aria-expanded')).toBe('false')
    await open()
    expect(sheet()).not.toBeNull()
    expect(button().getAttribute('aria-expanded')).toBe('true')
  })

  it('loading: the URL category without a count', async () => {
    category = 'mteam-tv'
    tabs = undefined
    loaded = false
    await mount()
    expect(button().textContent).toBe('mteam-tv')
  })
})

describe('the phone category sheet', () => {
  it('「分類」: 全部 first, the tab order, 52px rows, current bold with a check, focus on it', async () => {
    await mount()
    await open()
    const titleId = sheet()?.getAttribute('aria-labelledby') ?? ''
    expect(document.getElementById(titleId)?.textContent).toBe('分類')
    expect(names()).toEqual(['全部', 'mteam-tv', 'X', '未分類', '<b>x</b>'])
    for (const item of rows()) {
      expect(item.className).toContain('h-[52px]')
      // Every row keeps the check's 16px space, so names line up.
      expect(item.firstElementChild?.className).toContain('size-4')
    }
    const current = row('全部')
    expect(current.getAttribute('aria-current')).toBe('true')
    expect(current.querySelector('svg')).not.toBeNull()
    expect(current.querySelector('span:nth-child(2)')?.className).toContain(
      'font-bold',
    )
    expect(row('mteam-tv').hasAttribute('aria-current')).toBe(false)
    expect(row('mteam-tv').querySelector('svg')).toBeNull()
    expect(
      row('mteam-tv').querySelector('span:nth-child(2)')?.className,
    ).not.toContain('font-bold')
    // Count right, muted, tabular; the label reads name then count.
    const count = row('mteam-tv').lastElementChild
    expect(count?.textContent).toBe('203')
    expect(count?.className).toContain('text-text-muted')
    expect(count?.className).toContain('tabular-nums')
    expect(row('mteam-tv').getAttribute('aria-label')).toBe('mteam-tv，203 個')
    expect(row('X').getAttribute('aria-label')).toBe('X，0 個')
    // Plain buttons, no menu roles; names are plain text.
    expect(document.querySelector('[role^="menu"]')).toBeNull()
    expect(document.querySelector('[role="dialog"] li b')).toBeNull()
    expect(document.activeElement).toBe(current)
    expect(freezeStore.state.sheetOpen).toBe(true)
  })

  it('a hairline, then 設定 with a gear, last', async () => {
    await mount()
    await open()
    const settings = settingsRow()
    expect(settings).toBeDefined()
    expect(settings.className).toContain('h-[52px]')
    expect(settings.querySelector('svg')).not.toBeNull()
    const hairline = settings.previousElementSibling
    expect(hairline?.getAttribute('aria-hidden')).toBe('true')
    expect(hairline?.className).toContain('bg-border')
    expect(hairline?.previousElementSibling?.tagName).toBe('UL')
    expect(settings.nextElementSibling).toBeNull()
    expect(settings.hasAttribute('aria-current')).toBe(false)
  })

  it('a category: the sheet closes, selectCategory runs, focus back on the button', async () => {
    await mount()
    await open()
    await click(row('mteam-tv'))
    expect(sheet()).toBeNull()
    expect(selectCategory).toHaveBeenCalledTimes(1)
    expect(selectCategory).toHaveBeenCalledWith('mteam-tv')
    expect(openSettings).not.toHaveBeenCalled()
    expect(document.activeElement).toBe(button())
    expect(button().getAttribute('aria-expanded')).toBe('false')
  })

  it('uncategorized picks the empty key', async () => {
    await mount()
    await open()
    await click(row('未分類'))
    expect(selectCategory).toHaveBeenCalledWith('')
  })

  it('the current category: the sheet closes; the layout ignores it on the list', async () => {
    category = 'mteam-tv'
    await mount()
    await open()
    expect(document.activeElement).toBe(row('mteam-tv'))
    await click(row('mteam-tv'))
    expect(sheet()).toBeNull()
    // Same call as the pressed desktop tab: a no-op on the list, back to
    // the list on the settings page (story 3.3).
    expect(selectCategory).toHaveBeenCalledWith('mteam-tv')
  })

  it('設定: the sheet closes and openSettings runs', async () => {
    await mount()
    await open()
    await click(settingsRow())
    expect(sheet()).toBeNull()
    expect(openSettings).toHaveBeenCalledTimes(1)
    expect(selectCategory).not.toHaveBeenCalled()
  })

  it('on the settings page 設定 is the current row: bold, checked, focused; no category row is marked', async () => {
    settingsOpen = true
    category = 'mteam-tv'
    await mount()
    await open()
    const settings = settingsRow()
    expect(settings.getAttribute('aria-current')).toBe('page')
    expect(document.activeElement).toBe(settings)
    expect(settings.lastElementChild?.className).toContain('font-bold')
    // The check in the first slot, the gear next to the name.
    expect(settings.querySelector('.lucide-check')).not.toBeNull()
    expect(settings.querySelector('.lucide-settings')).not.toBeNull()
    for (const item of rows()) {
      expect(item.hasAttribute('aria-current')).toBe(false)
      expect(item.querySelector('svg')).toBeNull()
      expect(item.querySelector('span:nth-child(2)')?.className).not.toContain(
        'font-bold',
      )
    }
  })

  it('on the list 設定 shows its gear, not bold, no check', async () => {
    await mount()
    await open()
    const settings = settingsRow()
    expect(settings.querySelector('.lucide-check')).toBeNull()
    expect(settings.querySelector('.lucide-settings')).not.toBeNull()
    expect(settings.lastElementChild?.className).not.toContain('font-bold')
  })

  it('Esc closes it through the shortcut registry; focus back on the button', async () => {
    await mount()
    await open()
    expect(openLayerCount()).toBe(1)
    await act(async () =>
      document.activeElement?.dispatchEvent(
        new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }),
      ),
    )
    expect(sheet()).toBeNull()
    expect(openLayerCount()).toBe(0)
    expect(selectCategory).not.toHaveBeenCalled()
    expect(document.activeElement).toBe(button())
  })

  it('loading: the URL category alone, focused, then a busy skeleton', async () => {
    category = 'mteam-tv'
    tabs = undefined
    loaded = false
    await mount()
    await open()
    expect(names()).toEqual(['mteam-tv'])
    expect(row('mteam-tv').getAttribute('aria-label')).toBe('mteam-tv')
    expect(document.activeElement).toBe(row('mteam-tv'))
    const busy = document.querySelector('[role="dialog"] [aria-busy="true"]')
    expect(busy).not.toBeNull()
    expect(settingsRow()).toBeDefined()
  })

  it('maindata answered, the settings still pending: 全部 with its count, then the busy skeleton', async () => {
    tabs = undefined
    viewReady = false
    await mount()
    await open()
    expect(names()).toEqual(['全部'])
    expect(row('全部').getAttribute('aria-label')).toBe('全部，4 個')
    expect(
      document.querySelector('[role="dialog"] [aria-busy="true"]'),
    ).not.toBeNull()
  })

  it('the first load failed: the URL category by name only, no skeleton', async () => {
    category = 'mteam-tv'
    tabs = undefined
    loaded = false
    loadFailed = true
    viewReady = false
    await mount()
    await open()
    expect(names()).toEqual(['mteam-tv'])
    expect(row('mteam-tv').getAttribute('aria-label')).toBe('mteam-tv')
    expect(row('mteam-tv').lastElementChild?.textContent).toBe('mteam-tv')
    expect(
      document.querySelector('[role="dialog"] [aria-busy="true"]'),
    ).toBeNull()
  })

  it('crossing to desktop width closes the sheet; focus falls back to main', async () => {
    await mount()
    await open()
    vi.spyOn(button(), 'getClientRects').mockReturnValue(
      [] as unknown as DOMRectList,
    )
    main.tabIndex = -1
    desktop = true
    await act(async () => {
      for (const listener of desktopListeners) listener()
    })
    expect(sheet()).toBeNull()
    expect(desktopListeners.size).toBe(0)
    expect(document.activeElement).toBe(main)
  })
})
