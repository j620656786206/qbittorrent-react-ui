// @vitest-environment happy-dom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import type { Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ALL } from '#/shared/categories'
import type { SortView } from '#/shared/list-search'
import { MAIN_ID } from '#/shared/ui/main-scroll'
import { ListViewContext } from '#/state/list-view'
import { freezeStore, resetOrderFreeze } from '#/state/order-freeze'
import { openLayerCount, resetShortcuts } from '#/state/shortcuts'
import { DESKTOP_QUERY } from '#/shared/ui/breakpoint'
import { PhoneSortPill } from '#/features/header/sort-sheet'

// Spec 2.2 rows B1, B2, B9, B11 to B13: the phone sort pill and its sheet,
// with the real snap functions and order freeze.

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean | undefined
}

let desktop = false
const desktopListeners = new Set<() => void>()
let root: Root
let container: HTMLElement
let main: HTMLElement
let view: SortView
/** Story 3.2: the app switched to the category's remembered sort. */
let rememberedHint = false
/** Story 3.1: a pick from the menu is never an app-driven change. */
const appSetView = vi.fn()
const pickView = vi.fn((next: SortView) => {
  view = next
  render()
})

function render() {
  root.render(
    <ListViewContext
      value={{
        view: { ...view, category: ALL },
        viewReady: true,
        setView: appSetView,
        pickView,
        selectCategory: () => {},
        rememberedHint,
        openSettings: () => {},
        settingsOpen: false,
      }}
    >
      <PhoneSortPill />
    </ListViewContext>,
  )
}

async function mount(initial: SortView) {
  view = initial
  await act(async () => render())
}

const pill = () =>
  container.querySelector('button[aria-haspopup="dialog"]') as HTMLButtonElement
const sheet = () => document.querySelector<HTMLElement>('[role="dialog"]')
const radios = () => [
  ...document.querySelectorAll<HTMLButtonElement>(
    '[role="dialog"] li > button[data-sort-id]',
  ),
]
const radio = (label: string) =>
  radios().find((item) =>
    item.textContent.startsWith(label),
  ) as HTMLButtonElement
const more = () =>
  document.querySelector<HTMLButtonElement>(
    '[role="dialog"] button[aria-expanded]',
  )
const frozen = () => freezeStore.state.sheetOpen

async function open() {
  await act(async () => pill().click())
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
  pickView.mockClear()
  appSetView.mockClear()
  rememberedHint = false
})

afterEach(async () => {
  expect(appSetView).not.toHaveBeenCalled()
  await act(async () => root.unmount())
  container.remove()
  main.remove()
  resetOrderFreeze()
  resetShortcuts()
  vi.restoreAllMocks()
  globalThis.IS_REACT_ACT_ENVIRONMENT = false
})

describe('the phone sort pill', () => {
  it('story 3.2: never shows 「（這個分類記住的）」 (the phone has its own line since 3.4)', async () => {
    rememberedHint = true
    await mount({ sort: 'seeding_time', dir: 'desc' })
    expect(pill().textContent).not.toContain('記住的')
    expect(pill().getAttribute('aria-label')).not.toContain('記住的')
  })

  it('enabled, 44px, only icon, name, arrow and ▾; the words in the label', async () => {
    await mount({ sort: 'seeding_time', dir: 'desc' })
    expect(pill().disabled).toBe(false)
    expect(pill().className).toContain('h-11')
    expect(pill().textContent).toBe('做種時間 ↓')
    expect(pill().getAttribute('aria-label')).toBe(
      '排序：做種時間，久的在前，列表',
    )
    expect(pill().querySelectorAll('svg')).toHaveLength(2)
    expect(pill().getAttribute('aria-expanded')).toBe('false')
  })

  it('狀態 has no arrow and shows the board icon', async () => {
    await mount({ sort: 'state', dir: 'desc' })
    expect(pill().textContent).toBe('狀態')
    expect(pill().getAttribute('aria-label')).toBe('排序：狀態，看板')
    expect(pill().querySelector('[data-icon="board"]')).not.toBeNull()
  })
})

describe('the phone sort sheet', () => {
  it('B1 opens 「排序」: five rows, 52px, no digits, 狀態 enabled, then 更多', async () => {
    await mount({ sort: 'seeding_time', dir: 'desc' })
    await open()
    expect(sheet()).not.toBeNull()
    const titleId = sheet()?.getAttribute('aria-labelledby') ?? ''
    expect(document.getElementById(titleId)?.textContent).toBe('排序')
    expect(pill().getAttribute('aria-expanded')).toBe('true')
    expect(radios().map((item) => item.textContent)).toEqual([
      '狀態',
      '做種時間　久的在前 ↓',
      '加入時間',
      '分享率',
      '完成時間',
    ])
    for (const item of radios()) expect(item.className).toContain('h-[52px]')
    expect(radio('狀態').disabled).toBe(false)
    expect(radio('做種時間').getAttribute('aria-current')).toBe('true')
    expect(radio('加入時間').hasAttribute('aria-current')).toBe(false)
    // Plain buttons in lists, no menu roles.
    expect(document.querySelector('[role^="menu"]')).toBeNull()
    expect(radio('做種時間').hasAttribute('role')).toBe(false)
    expect(radio('做種時間').getAttribute('aria-label')).toBe(
      '做種時間，久的在前',
    )
    expect(radio('做種時間').querySelector('svg')).not.toBeNull()
    expect(radio('加入時間').querySelector('svg')).toBeNull()
    expect(more()?.getAttribute('aria-expanded')).toBe('false')
    // Focus is on the current sort.
    expect(document.activeElement).toBe(radio('做種時間'))
  })

  it('B9 the list order is frozen while the sheet is open', async () => {
    await mount({ sort: 'seeding_time', dir: 'desc' })
    expect(frozen()).toBe(false)
    await open()
    expect(frozen()).toBe(true)
    await click(
      document.querySelector('button[aria-label="關閉"]') as HTMLElement,
    )
    expect(frozen()).toBe(false)
  })

  it('B2 Esc closes it through the shortcut registry, even from a field; focus back on the pill', async () => {
    await mount({ sort: 'seeding_time', dir: 'desc' })
    await open()
    expect(openLayerCount()).toBe(1)
    const field = document.createElement('input')
    sheet()?.append(field)
    field.focus()
    await act(async () =>
      field.dispatchEvent(
        new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }),
      ),
    )
    expect(sheet()).toBeNull()
    expect(openLayerCount()).toBe(0)
    expect(document.activeElement).toBe(pill())
  })

  it('更多 expands the 46 grouped rows in the sheet', async () => {
    await mount({ sort: 'seeding_time', dir: 'desc' })
    await open()
    await click(more() as HTMLElement)
    expect(more()?.getAttribute('aria-expanded')).toBe('true')
    expect(radios()).toHaveLength(51)
    const groups = [
      ...document.querySelectorAll('[role="dialog"] ul[aria-labelledby]'),
    ]
    expect(groups).toHaveLength(10)
    expect(
      document.getElementById(groups[9].getAttribute('aria-labelledby') ?? '')
        ?.textContent,
    ).toBe('技術資訊')
  })

  it('B11 the selected row flips the direction and the sheet stays; the list goes to the top', async () => {
    await mount({ sort: 'ratio', dir: 'desc' })
    main.scrollTop = 500
    await open()
    await click(radio('分享率'))
    expect(pickView).toHaveBeenLastCalledWith({ sort: 'ratio', dir: 'asc' })
    expect(sheet()).not.toBeNull()
    expect(radio('分享率').textContent).toBe('分享率　低的在前 ↑')
    expect(main.scrollTop).toBe(0)
  })

  it('B12 another row: its default direction, the sheet closes, the list goes to the top, focus on the pill', async () => {
    await mount({ sort: 'ratio', dir: 'asc' })
    main.scrollTop = 500
    await open()
    await click(radio('完成時間'))
    expect(pickView).toHaveBeenLastCalledWith({
      sort: 'completion_on',
      dir: 'desc',
    })
    expect(sheet()).toBeNull()
    expect(main.scrollTop).toBe(0)
    expect(document.activeElement).toBe(pill())
    expect(pill().textContent).toBe('完成時間 ↓')
  })

  it('B13 a current sort under 更多 opens expanded, focused on it', async () => {
    await mount({ sort: 'num_seeds', dir: 'asc' })
    await open()
    expect(more()?.getAttribute('aria-expanded')).toBe('true')
    expect(radios()).toHaveLength(51)
    const current = radio('做種人數（連上的）')
    expect(current.getAttribute('aria-current')).toBe('true')
    expect(current.textContent).toBe('做種人數（連上的）　小的在前 ↑')
    expect(document.activeElement).toBe(current)
  })

  it('reopened after a top-five pick: 更多 collapsed again', async () => {
    await mount({ sort: 'num_seeds', dir: 'asc' })
    await open()
    await click(radio('分享率'))
    expect(sheet()).toBeNull()
    await open()
    expect(more()?.getAttribute('aria-expanded')).toBe('false')
    expect(radios()).toHaveLength(5)
  })

  it('K2 狀態 picks the board and closes the sheet', async () => {
    await mount({ sort: 'added_on', dir: 'desc' })
    main.scrollTop = 500
    await open()
    await click(radio('狀態'))
    expect(pickView).toHaveBeenCalledWith({ sort: 'state', dir: 'desc' })
    expect(sheet()).toBeNull()
    expect(main.scrollTop).toBe(0)
    expect(pill().getAttribute('aria-label')).toBe('排序：狀態，看板')
  })

  it('the selected 狀態 does nothing and the sheet stays', async () => {
    await mount({ sort: 'state', dir: 'desc' })
    await open()
    await click(radio('狀態'))
    expect(pickView).not.toHaveBeenCalled()
    expect(sheet()).not.toBeNull()
  })

  it('crossing to desktop width closes the sheet; focus falls back to main', async () => {
    await mount({ sort: 'added_on', dir: 'desc' })
    await open()
    expect(sheet()).not.toBeNull()
    // At 1024px the pill is display: none (no client rects).
    vi.spyOn(pill(), 'getClientRects').mockReturnValue(
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
