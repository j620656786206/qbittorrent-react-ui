// @vitest-environment happy-dom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import type { Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { SortView } from '#/shared/list-search'
import { MAIN_ID } from '#/shared/ui/main-scroll'
import { ListViewContext } from '#/state/list-view'
import { DesktopSortMenu } from '#/features/header/sort-menu'

// Spec 2.1 rows S6 to S8: the desktop sort menu's wiring in a DOM.

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean | undefined
}

let root: Root
let container: HTMLElement
let main: HTMLElement
let view: SortView
const setView = vi.fn((next: SortView) => {
  view = next
  render()
})

function render() {
  root.render(
    <ListViewContext value={{ view, setView }}>
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
  setView.mockClear()
})

afterEach(async () => {
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

  it('opens collapsed: five with 1 to 5, 狀態 disabled, then 更多', async () => {
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
    expect(radio('狀態').getAttribute('aria-disabled')).toBe('true')
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
  })

  it('S6 the selected item flips the direction, the menu stays open, the list goes to the top', async () => {
    await mount({ sort: 'ratio', dir: 'desc' })
    main.scrollTop = 500
    await open()
    await click(radio('分享率'))
    expect(setView).toHaveBeenLastCalledWith({ sort: 'ratio', dir: 'asc' })
    expect(menu()).not.toBeNull()
    expect(radio('分享率').textContent).toBe('分享率\u3000低的在前 ↑4')
    expect(main.scrollTop).toBe(0)
  })

  it('S7 another item: its default direction, the menu closes, the list goes to the top', async () => {
    await mount({ sort: 'ratio', dir: 'asc' })
    main.scrollTop = 500
    await open()
    await click(radio('完成時間'))
    expect(setView).toHaveBeenLastCalledWith({
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

  it('狀態 cannot be picked', async () => {
    await mount({ sort: 'added_on', dir: 'desc' })
    await open()
    await click(radio('狀態'))
    expect(setView).not.toHaveBeenCalled()
  })
})
