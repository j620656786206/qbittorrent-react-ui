// @vitest-environment happy-dom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import type { Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { CategoryTab } from '#/lib/category-tabs'
import { ALL } from '#/shared/categories'
import { DEFAULT_SORT_VIEW } from '#/shared/list-search'
import { DESKTOP_QUERY } from '#/shared/ui/breakpoint'
import { CategoryTabsContext, ListViewContext } from '#/state/list-view'
import {
  pushEscapeLayer,
  resetShortcuts,
  setShortcutAction,
} from '#/state/shortcuts'
import { DesktopCategoryTabs } from '#/features/header/category-tabs'
import { HeaderContext } from '#/features/header/header-context'
import { headerModel } from '#/features/header/header-model'
import { fakeServerState } from '#/lib/testing'

// Story 3.2 (UX-DR18, DESIGN category-tabs): the desktop tab row in a DOM:
// pills with the name then the count, the selected one in the accent with
// its count at 75%, plain-text names, the right-edge fade only while tabs
// are cut off, the selected tab scrolled into view, a click switching.
// Layout and colors are checked in Chromium (e2e/category-tabs.spec.ts).

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean | undefined
}

let root: Root
let container: HTMLElement
let selected: string
let tabs: ReadonlyArray<CategoryTab> | undefined
const selectCategory = vi.fn((next: string) => {
  selected = next
  render()
})
let scrollIntoView: ReturnType<typeof vi.fn>
/** The scroller's geometry (happy-dom lays nothing out). */
let geometry = { scrollWidth: 400, clientWidth: 400, scrollLeft: 0 }

const model = (loaded: boolean) =>
  headerModel({
    serverState: loaded ? fakeServerState() : undefined,
    alert: null,
    allCount: loaded ? 7 : undefined,
  })

function render(loaded = true) {
  root.render(
    <HeaderContext
      value={{ model: model(loaded), retrying: false, onBarAction: () => {} }}
    >
      <ListViewContext
        value={{
          view: { ...DEFAULT_SORT_VIEW, category: selected, query: '' },
          viewReady: true,
          setView: () => {},
          pickView: () => {},
          selectCategory,
          rememberedHint: false,
          openSettings: () => {},
          settingsOpen: false,
          searchOpen: false,
          openSearch: () => {},
          setQuery: () => {},
          closeSearch: () => {},
        }}
      >
        <CategoryTabsContext value={tabs}>
          <DesktopCategoryTabs />
        </CategoryTabsContext>
      </ListViewContext>
    </HeaderContext>,
  )
}

const tablist = () =>
  container.querySelector('[role="group"][aria-label="分類"]') as HTMLElement
const tabButtons = () => [
  ...container.querySelectorAll<HTMLButtonElement>(
    '[role="group"][aria-label="分類"] button',
  ),
]
const tabNamed = (label: string) =>
  tabButtons().find(
    (button) => button.firstElementChild?.textContent === label,
  ) as HTMLButtonElement
const fade = () => container.querySelector('[data-testid="category-tabs-fade"]')

const TABS: ReadonlyArray<CategoryTab> = [
  { key: ALL, label: '全部', count: 7 },
  { key: 'mteam-X', label: 'mteam-X', count: 3 },
  { key: '', label: '未分類', count: 1 },
  { key: '<b>x</b>', label: '<b>x</b>', count: 2 },
  { key: 'mteam-tv', label: 'mteam-tv', count: 0 },
]

beforeEach(() => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true
  selected = ALL
  tabs = TABS
  geometry = { scrollWidth: 400, clientWidth: 400, scrollLeft: 0 }
  selectCategory.mockClear()
  scrollIntoView = vi.fn()
  HTMLElement.prototype.scrollIntoView =
    scrollIntoView as unknown as HTMLElement['scrollIntoView']
  vi.spyOn(HTMLElement.prototype, 'scrollWidth', 'get').mockImplementation(
    () => geometry.scrollWidth,
  )
  vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockImplementation(
    () => geometry.clientWidth,
  )
  vi.spyOn(HTMLElement.prototype, 'scrollLeft', 'get').mockImplementation(
    () => geometry.scrollLeft,
  )
  container = document.createElement('div')
  document.body.append(container)
  root = createRoot(container)
})

afterEach(async () => {
  await act(async () => root.unmount())
  container.remove()
  globalThis.IS_REACT_ACT_ENVIRONMENT = false
  vi.restoreAllMocks()
})

describe('the desktop category tabs', () => {
  it('pills in order: name then a lighter count, plain buttons in a labelled group', async () => {
    await act(async () => render())
    expect(tablist().getAttribute('aria-label')).toBe('分類')
    expect(tabButtons().map((button) => button.textContent)).toEqual([
      '全部7',
      'mteam-X3',
      '未分類1',
      '<b>x</b>2',
      'mteam-tv0',
    ])
    for (const button of tabButtons()) {
      expect(button.className).toContain('rounded-full')
      expect(button.type).toBe('button')
      expect(button.getAttribute('role')).toBeNull()
      expect(button.hasAttribute('aria-selected')).toBe(false)
    }
  })

  it('selected: accent, count at 75%; unselected: surface with a border, muted count', async () => {
    selected = 'mteam-X'
    await act(async () => render())
    const on = tabNamed('mteam-X')
    expect(on.getAttribute('aria-pressed')).toBe('true')
    expect(on.className).toContain('bg-primary')
    expect(on.className).toContain('text-primary-foreground')
    expect(on.lastElementChild?.className).toContain('opacity-75')
    const off = tabNamed('全部')
    expect(off.getAttribute('aria-pressed')).toBe('false')
    expect(off.className).toContain('bg-surface')
    expect(off.className).toContain('border')
    expect(off.lastElementChild?.className).toContain('text-text-muted')
  })

  it('names are plain text', async () => {
    await act(async () => render())
    expect(tabNamed('<b>x</b>').querySelector('b')).toBeNull()
  })

  it('a click switches; the selected tab also reports (the layout decides, story 3.3)', async () => {
    await act(async () => render())
    await act(async () => tabNamed('未分類').click())
    expect(selectCategory).toHaveBeenCalledWith('')
    await act(async () => tabNamed('未分類').click())
    expect(selectCategory).toHaveBeenCalledTimes(2)
    expect(selectCategory).toHaveBeenLastCalledWith('')
  })

  it('the selected tab scrolls into view on change, inline nearest', async () => {
    await act(async () => render())
    scrollIntoView.mockClear()
    await act(async () => tabNamed('mteam-tv').click())
    expect(scrollIntoView).toHaveBeenCalledTimes(1)
    expect(scrollIntoView).toHaveBeenCalledWith({
      block: 'nearest',
      inline: 'nearest',
    })
    expect(scrollIntoView.mock.contexts[0]).toBe(tabNamed('mteam-tv'))
  })

  it('a reload on a far-right category scrolls it into view once the tabs arrive', async () => {
    selected = 'mteam-tv'
    tabs = undefined
    await act(async () => render())
    expect(scrollIntoView).not.toHaveBeenCalled()
    tabs = TABS
    await act(async () => render())
    expect(scrollIntoView).toHaveBeenCalledTimes(1)
    expect(scrollIntoView).toHaveBeenCalledWith({
      block: 'nearest',
      inline: 'nearest',
    })
    expect(scrollIntoView.mock.contexts[0]).toBe(tabNamed('mteam-tv'))
  })

  it('the scroller hides its scrollbar, never wraps, keeps the selected clear of the fade', async () => {
    await act(async () => render())
    const className = tablist().className
    expect(className).toContain('overflow-x-auto')
    expect(className).toContain('[scrollbar-width:none]')
    expect(className).not.toContain('flex-wrap')
    expect(className).toContain('scroll-pe-6')
  })

  it('the right-edge fade shows only while tabs are cut off on the right', async () => {
    await act(async () => render())
    expect(fade()).toBeNull()
    geometry = { scrollWidth: 900, clientWidth: 400, scrollLeft: 0 }
    await act(async () => {
      tablist().dispatchEvent(new Event('scroll'))
    })
    expect(fade()?.className).toContain('w-6')
    expect(fade()?.className).toContain('from-surface-page')
    expect(fade()?.getAttribute('aria-hidden')).toBe('true')
    // Scrolled to the end: nothing is cut off any more.
    geometry = { scrollWidth: 900, clientWidth: 400, scrollLeft: 500 }
    await act(async () => {
      tablist().dispatchEvent(new Event('scroll'))
    })
    expect(fade()).toBeNull()
  })

  it('before the tabs are known: 「全部」 alone, its count a skeleton while loading', async () => {
    tabs = undefined
    await act(async () => render(false))
    expect(tabButtons()).toHaveLength(1)
    expect(tabButtons()[0].getAttribute('aria-busy')).toBe('true')
    expect(tabButtons()[0].textContent).toBe('全部')
    // Maindata answered, settings not yet: 「全部」 with its count.
    await act(async () => render(true))
    expect(tabButtons()[0].textContent).toBe('全部7')
    expect(tabButtons()[0].getAttribute('aria-busy')).toBeNull()
  })

  it('before the tabs are known on another category: that one alone, pressed, no 全部 count', async () => {
    tabs = undefined
    selected = 'mteam-X'
    await act(async () => render(true))
    expect(tabButtons()).toHaveLength(1)
    expect(tabButtons()[0].textContent).toBe('mteam-X')
    expect(tabButtons()[0].getAttribute('aria-pressed')).toBe('true')
  })
})

describe('shortcuts and tooltips (story 3.7)', () => {
  let desktop = true

  beforeEach(() => {
    desktop = true
    vi.spyOn(window, 'matchMedia').mockImplementation(
      (query: string) =>
        ({
          matches: query === DESKTOP_QUERY ? desktop : false,
          media: query,
          addEventListener: () => {},
          removeEventListener: () => {},
        }) as unknown as MediaQueryList,
    )
  })

  afterEach(() => resetShortcuts())

  const press = (key: string, target: EventTarget = document.body) =>
    act(async () => {
      target.dispatchEvent(
        new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }),
      )
    })

  const TEN: ReadonlyArray<CategoryTab> = [
    { key: ALL, label: '全部', count: 20 },
    ...Array.from({ length: 9 }, (_, i) => ({
      key: `c${i + 2}`,
      label: `c${i + 2}`,
      count: 2,
    })),
  ]

  it('the first nine tabs name their digit; the 10th has no tooltip', async () => {
    tabs = TEN
    await act(async () => render())
    expect(tabButtons().map((button) => button.getAttribute('title'))).toEqual([
      '快捷鍵 1',
      '快捷鍵 2',
      '快捷鍵 3',
      '快捷鍵 4',
      '快捷鍵 5',
      '快捷鍵 6',
      '快捷鍵 7',
      '快捷鍵 8',
      '快捷鍵 9',
      null,
    ])
  })

  it('a digit switches like a click; past the last tab nothing', async () => {
    await act(async () => render())
    await press('3')
    expect(selectCategory).toHaveBeenLastCalledWith('')
    await press('1')
    expect(selectCategory).toHaveBeenLastCalledWith(ALL)
    selectCategory.mockClear()
    await press('6')
    expect(selectCategory).not.toHaveBeenCalled()
  })

  it('before the tabs are known a digit does nothing', async () => {
    tabs = undefined
    await act(async () => render())
    await press('1')
    await press(']')
    expect(selectCategory).not.toHaveBeenCalled()
  })

  it('[ ] step from the selected tab, without wrapping at either end', async () => {
    await act(async () => render())
    await press('[')
    expect(selectCategory).not.toHaveBeenCalled()
    await press(']')
    expect(selectCategory).toHaveBeenLastCalledWith('mteam-X')
    await press(']')
    expect(selectCategory).toHaveBeenLastCalledWith('')
    await press('[')
    expect(selectCategory).toHaveBeenLastCalledWith('mteam-X')
    selected = 'mteam-tv'
    await act(async () => render())
    selectCategory.mockClear()
    await press(']')
    expect(selectCategory).not.toHaveBeenCalled()
  })

  it('a digit pressed in an open menu is not a tab', async () => {
    await act(async () => render())
    const menu = document.createElement('div')
    menu.setAttribute('role', 'menu')
    document.body.append(menu)
    // Another menu (⋯): nothing switches behind it.
    await press('2', menu)
    await press(']', menu)
    expect(selectCategory).not.toHaveBeenCalled()
    // The sort menu: the digit is its pick.
    const pick = vi.fn(() => true)
    const off = setShortcutAction('pickTopSort', pick)
    await press('2', menu)
    expect(pick).toHaveBeenCalledWith(1)
    expect(selectCategory).not.toHaveBeenCalled()
    off()
    menu.remove()
  })

  it('while a dialog is open nothing switches', async () => {
    await act(async () => render())
    const off = pushEscapeLayer(() => {}, 'dialog')
    await press('2')
    await press(']')
    expect(selectCategory).not.toHaveBeenCalled()
    off()
  })

  it('phone width: no key switches', async () => {
    desktop = false
    await act(async () => render())
    await press('2')
    await press(']')
    expect(selectCategory).not.toHaveBeenCalled()
  })
})
