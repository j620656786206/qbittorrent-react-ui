// @vitest-environment happy-dom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import type { Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ALL } from '#/shared/categories'
import type { SortView } from '#/shared/list-search'
import { DESKTOP_QUERY } from '#/shared/ui/breakpoint'
import { MAIN_ID } from '#/shared/ui/main-scroll'
import { ListViewContext } from '#/state/list-view'
import { SHORTCUTS, resetShortcuts, setShortcutAction } from '#/state/shortcuts'
import { DesktopSortMenu } from '#/features/header/sort-menu'

// Spec 2.1 rows S6 to S8: the desktop sort menu's wiring in a DOM.

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean | undefined
}

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
        view: { ...view, category: ALL, query: '' },
        viewReady: true,
        setView: appSetView,
        pickView,
        selectCategory: () => {},
        rememberedHint,
        openSettings: () => {},
        settingsOpen: false,
        searchOpen: false,
        openSearch: () => {},
        setQuery: () => {},
        closeSearch: () => {},
      }}
    >
      <DesktopSortMenu />
    </ListViewContext>,
  )
}

async function mount(initial: SortView) {
  view = initial
  await act(async () => render())
}

const trigger = () =>
  container.querySelector('button[aria-haspopup="menu"]') as HTMLButtonElement
const menu = () => document.querySelector('[role="menu"]')
const radios = () => [
  ...document.querySelectorAll<HTMLElement>('[role="menuitemradio"]'),
]
const radio = (label: string) =>
  radios().find((item) => item.textContent.startsWith(label)) as HTMLElement
const more = () =>
  [...document.querySelectorAll<HTMLElement>('[role="menuitem"]')].find(
    (item) => item.textContent === '更多',
  ) as HTMLElement

async function open() {
  await act(async () => {
    trigger().dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }),
    )
  })
}

async function click(element: HTMLElement) {
  await act(async () => element.click())
}

beforeEach(() => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true
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
  globalThis.IS_REACT_ACT_ENVIRONMENT = false
})

describe('the desktop sort menu', () => {
  it('the pill: enabled, the arrow in the text, the words in label and tooltip', async () => {
    await mount({ sort: 'seeding_time', dir: 'desc' })
    expect(trigger().disabled).toBe(false)
    expect(trigger().textContent).toContain('排序：做種時間 ↓')
    expect(trigger().getAttribute('aria-label')).toBe(
      '排序：做種時間，久的在前，列表',
    )
    expect(trigger().title).toBe('排序：做種時間，久的在前')
  })

  it('opens collapsed: five with 1 to 5, 狀態 enabled, then 更多', async () => {
    await mount({ sort: 'seeding_time', dir: 'desc' })
    await open()
    expect(menu()?.getAttribute('aria-label')).toBe('排序')
    expect(radios().map((item) => item.textContent)).toEqual([
      '狀態1',
      '做種時間\u3000久的在前 ↓2',
      '加入時間3',
      '分享率4',
      '完成時間5',
    ])
    expect(radio('狀態').getAttribute('aria-disabled')).toBeNull()
    expect(radio('做種時間').getAttribute('aria-checked')).toBe('true')
    // Announced as 「做種時間，久的在前」, without the arrow and the digit.
    expect(radio('做種時間').getAttribute('aria-label')).toBe(
      '做種時間，久的在前',
    )
    expect(radio('加入時間').getAttribute('aria-label')).toBe('加入時間')
    const hidden = [
      ...radio('做種時間').querySelectorAll('[aria-hidden="true"]'),
    ].map((element) => element.textContent)
    expect(hidden).toEqual(['', '\u3000', ' ↓', '2'])
    expect(more().getAttribute('aria-expanded')).toBe('false')
  })

  it('更多 opens the 46 grouped items in the same menu', async () => {
    await mount({ sort: 'seeding_time', dir: 'desc' })
    await open()
    await click(more())
    expect(menu()).not.toBeNull()
    expect(more().getAttribute('aria-expanded')).toBe('true')
    expect(radios()).toHaveLength(51)
    expect(
      document.querySelectorAll('[role="menu"] [role="menu"]'),
    ).toHaveLength(0)
    expect(document.body.textContent).toContain('技術資訊')
    // Each group is named by its header.
    const groups = [
      ...document.querySelectorAll('[role="group"][aria-labelledby]'),
    ]
    expect(groups).toHaveLength(10)
    for (const group of groups) {
      const id = group.getAttribute('aria-labelledby') ?? ''
      expect(document.getElementById(id)?.textContent).toBeTruthy()
    }
    expect(
      document.getElementById(groups[9].getAttribute('aria-labelledby') ?? '')
        ?.textContent,
    ).toBe('技術資訊')
  })

  it('S6 the selected item flips the direction, the menu stays open, the list goes to the top', async () => {
    await mount({ sort: 'ratio', dir: 'desc' })
    main.scrollTop = 500
    await open()
    await click(radio('分享率'))
    expect(pickView).toHaveBeenLastCalledWith({ sort: 'ratio', dir: 'asc' })
    expect(menu()).not.toBeNull()
    expect(radio('分享率').textContent).toBe('分享率\u3000低的在前 ↑4')
    expect(main.scrollTop).toBe(0)
  })

  it('S7 another item: its default direction, the menu closes, the list goes to the top', async () => {
    await mount({ sort: 'ratio', dir: 'asc' })
    main.scrollTop = 500
    await open()
    await click(radio('完成時間'))
    expect(pickView).toHaveBeenLastCalledWith({
      sort: 'completion_on',
      dir: 'desc',
    })
    expect(menu()).toBeNull()
    expect(main.scrollTop).toBe(0)
  })

  it('S8 a current sort under 更多 opens expanded', async () => {
    await mount({ sort: 'num_seeds', dir: 'asc' })
    await open()
    expect(more().getAttribute('aria-expanded')).toBe('true')
    expect(radios()).toHaveLength(51)
    expect(radio('做種人數（連上的）').getAttribute('aria-checked')).toBe(
      'true',
    )
    expect(radio('做種人數（連上的）').textContent).toBe(
      '做種人數（連上的）\u3000小的在前 ↑',
    )
  })

  it('K2 狀態 picks the board, closes the menu and scrolls to the top', async () => {
    await mount({ sort: 'added_on', dir: 'desc' })
    main.scrollTop = 120
    await open()
    await click(radio('狀態'))
    expect(pickView).toHaveBeenCalledWith({ sort: 'state', dir: 'desc' })
    expect(menu()).toBeNull()
    expect(main.scrollTop).toBe(0)
    expect(trigger().getAttribute('aria-label')).toBe('排序：狀態，看板')
    expect(trigger().textContent).toContain('看板')
    expect(trigger().textContent).not.toMatch(/[↑↓]/)
    expect(trigger().querySelector('[data-icon="board"]')).not.toBeNull()
  })

  it('the selected 狀態 does nothing (no direction to flip)', async () => {
    await mount({ sort: 'state', dir: 'desc' })
    await open()
    await click(radio('狀態'))
    expect(pickView).not.toHaveBeenCalled()
    expect(menu()).not.toBeNull()
  })
})

// Story 3.2: 「（這個分類記住的）」 after the app switched to the category's
// remembered sort; the tooltip stays the sort in words.
describe('the remembered hint (story 3.2)', () => {
  it('shows muted after the bold sort, also in the label; never in the tooltip', async () => {
    rememberedHint = true
    await mount({ sort: 'seeding_time', dir: 'desc' })
    const hint = [...trigger().querySelectorAll('span')].find(
      (span) => span.textContent === '（這個分類記住的）',
    )
    expect(hint?.className).toContain('text-text-muted')
    expect(trigger().getAttribute('aria-label')).toBe(
      '排序：做種時間，久的在前（這個分類記住的），列表',
    )
    expect(trigger().title).toBe('排序：做種時間，久的在前')
  })

  it('absent without the hint', async () => {
    await mount({ sort: 'seeding_time', dir: 'desc' })
    expect(trigger().textContent).not.toContain('記住的')
    expect(trigger().getAttribute('aria-label')).toBe(
      '排序：做種時間，久的在前，列表',
    )
  })
})

// Story 3.7: `S` opens the menu on desktop; while it is open `1` to `5`
// pick the top five through the same path as a click.
describe('S then 1 to 5 (story 3.7)', () => {
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

  afterEach(() => {
    resetShortcuts()
    vi.restoreAllMocks()
  })

  /** A key where focus is (a menu item once the menu is open). */
  const press = (key: string, init: KeyboardEventInit = {}) =>
    act(async () => {
      const target = document.activeElement ?? document.body
      target.dispatchEvent(
        new KeyboardEvent('keydown', {
          key,
          bubbles: true,
          cancelable: true,
          ...init,
        }),
      )
    })

  it('the menu digits are the registry’s keys after S', async () => {
    await mount({ sort: 'seeding_time', dir: 'desc' })
    await open()
    const digits = radios().map(
      (item) => item.querySelector(':scope > span:last-child')?.textContent,
    )
    const sort = SHORTCUTS.find((entry) => entry.id === 'sort')
    expect(digits).toEqual(['1', '2', '3', '4', '5'])
    expect(sort?.display).toContainEqual({ key: '1' })
    expect(sort?.display).toContainEqual({ key: '5' })
  })

  it.each(['s', 'S'])(
    '%s opens the menu, 3 picks 加入時間 like a click and closes it',
    async (key) => {
      const selectTab = vi.fn(() => true)
      setShortcutAction('selectTab', selectTab)
      await mount({ sort: 'ratio', dir: 'asc' })
      main.scrollTop = 500
      await press(key, { shiftKey: key === 'S' })
      expect(menu()).not.toBeNull()
      await press('3')
      expect(pickView).toHaveBeenLastCalledWith({
        sort: 'added_on',
        dir: 'desc',
      })
      expect(menu()).toBeNull()
      expect(main.scrollTop).toBe(0)
      expect(selectTab).not.toHaveBeenCalled()
      // Closed: digits are the tabs' again.
      await press('3')
      expect(selectTab).toHaveBeenCalledWith(2)
    },
  )

  it("the selected sort's digit flips the direction and keeps the menu open", async () => {
    await mount({ sort: 'ratio', dir: 'desc' })
    await press('s')
    await press('4')
    expect(pickView).toHaveBeenLastCalledWith({ sort: 'ratio', dir: 'asc' })
    expect(menu()).not.toBeNull()
    expect(radio('分享率').textContent).toBe('分享率　低的在前 ↑4')
  })

  it('狀態 selected, 1 does nothing; the menu stays', async () => {
    await mount({ sort: 'state', dir: 'desc' })
    await press('s')
    await press('1')
    expect(pickView).not.toHaveBeenCalled()
    expect(menu()).not.toBeNull()
  })

  it('6 to 9 with the menu open pick nothing and switch no tab', async () => {
    const selectTab = vi.fn(() => true)
    setShortcutAction('selectTab', selectTab)
    await mount({ sort: 'ratio', dir: 'desc' })
    await press('s')
    await press('7')
    expect(pickView).not.toHaveBeenCalled()
    expect(selectTab).not.toHaveBeenCalled()
    expect(menu()).not.toBeNull()
  })

  it('a menu S opened gives focus back where it was, not to the pill', async () => {
    const row = document.createElement('button')
    document.body.append(row)
    await mount({ sort: 'ratio', dir: 'asc' })
    row.focus()
    await press('s')
    await press('3')
    expect(menu()).toBeNull()
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0))
    })
    expect(document.activeElement).toBe(row)
    row.remove()
  })

  it('a menu S opened, closed by a press on the pill, keeps focus on the pill', async () => {
    const row = document.createElement('button')
    document.body.append(row)
    await mount({ sort: 'ratio', dir: 'asc' })
    row.focus()
    await press('s')
    expect(menu()).not.toBeNull()
    await act(async () => {
      trigger().dispatchEvent(
        new PointerEvent('pointerdown', { bubbles: true, button: 0 }),
      )
    })
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0))
    })
    expect(menu()).toBeNull()
    expect(document.activeElement).toBe(trigger())
    row.remove()
  })

  it('a menu the pill opened still gives focus back to the pill', async () => {
    await mount({ sort: 'ratio', dir: 'asc' })
    trigger().focus()
    await open()
    await press('Escape')
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0))
    })
    expect(menu()).toBeNull()
    expect(document.activeElement).toBe(trigger())
  })

  it('phone width: S opens nothing', async () => {
    desktop = false
    await mount({ sort: 'ratio', dir: 'desc' })
    await press('s')
    expect(menu()).toBeNull()
  })
})
