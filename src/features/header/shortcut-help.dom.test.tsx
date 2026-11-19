// @vitest-environment happy-dom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import type { Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { DESKTOP_QUERY } from '#/shared/ui/breakpoint'
import {
  helpGroups,
  openLayerCount,
  resetShortcuts,
  setShortcutAction,
  shortcutKeysText,
} from '#/state/shortcuts'
import { ShortcutHelp } from '#/features/header/shortcut-help'

// Story 3.7 (DESIGN shortcut-help): the desktop 快捷鍵 button and its help
// window in a DOM. The button and `?` open it; it lists every group of the
// registry with keys in <kbd>; `Esc` and ✕ close it with focus back; while
// it is open no other shortcut runs; at phone width `?` does nothing.

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean | undefined
}

let root: Root
let container: HTMLElement
let desktop = true
/** The breakpoint query's listeners, to cross 1024px. */
const widthListeners = new Set<() => void>()

async function setDesktop(next: boolean) {
  desktop = next
  await act(async () => {
    for (const listener of widthListeners) listener()
  })
}

const button = () =>
  container.querySelector<HTMLButtonElement>('button[aria-label="快捷鍵"]')
const dialog = () => document.querySelector<HTMLElement>('[role="dialog"]')
const closeButton = () =>
  [...(dialog()?.querySelectorAll('button') ?? [])].find(
    (element) => element.textContent === '關閉',
  ) as HTMLButtonElement

const press = (key: string, target?: Element) =>
  act(async () => {
    const at = target ?? document.activeElement ?? document.body
    at.dispatchEvent(
      new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }),
    )
  })

/** Radix moves focus back on a 0 ms timeout after the window unmounts. */
const settle = () =>
  act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0))
  })

async function mount() {
  await act(async () => root.render(<ShortcutHelp />))
}

beforeEach(() => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true
  desktop = true
  vi.spyOn(window, 'matchMedia').mockImplementation(
    (query: string) =>
      ({
        get matches() {
          return query === DESKTOP_QUERY ? desktop : false
        },
        media: query,
        addEventListener: (_: string, listener: () => void) =>
          widthListeners.add(listener),
        removeEventListener: (_: string, listener: () => void) =>
          widthListeners.delete(listener),
      }) as unknown as MediaQueryList,
  )
  widthListeners.clear()
  container = document.createElement('div')
  document.body.append(container)
  root = createRoot(container)
})

afterEach(async () => {
  await act(async () => root.unmount())
  document.body.replaceChildren()
  resetShortcuts()
  vi.restoreAllMocks()
  globalThis.IS_REACT_ACT_ENVIRONMENT = false
})

describe('the 快捷鍵 button', () => {
  it('is enabled, labelled 快捷鍵, its tooltip names ?', async () => {
    await mount()
    expect(button()?.disabled).toBe(false)
    expect(button()?.title).toBe('快捷鍵（?）')
    expect(button()?.title).toContain(shortcutKeysText('help'))
    expect(dialog()).toBeNull()
  })
})

describe('the help window', () => {
  it('a click opens 「快捷鍵」 with every registry group, keys in <kbd>', async () => {
    await mount()
    await act(async () => button()?.click())
    const open = dialog() as HTMLElement
    expect(open).not.toBeNull()
    expect(open.querySelector('h2')?.textContent).toBe('快捷鍵')
    const sections = [...open.querySelectorAll('section')]
    const groups = helpGroups()
    expect(
      sections.map((section) => section.querySelector('h3')?.textContent),
    ).toEqual(groups.map((entry) => entry.group))
    // Each row: its keys and words as the registry shows them, then the text.
    groups.forEach(({ rows }, index) => {
      const terms = [...sections[index].querySelectorAll('dt')]
      const details = [...sections[index].querySelectorAll('dd')]
      expect(terms.map((term) => term.textContent)).toEqual(
        rows.map((row) =>
          row.display
            .map((part) => ('key' in part ? part.key : part.word))
            .join(''),
        ),
      )
      expect(
        terms.map((term) =>
          [...term.querySelectorAll('kbd')].map((kbd) => kbd.textContent),
        ),
      ).toEqual(
        rows.map((row) =>
          row.display.flatMap((part) => ('key' in part ? [part.key] : [])),
        ),
      )
      expect(details.map((detail) => detail.textContent)).toEqual(
        rows.map((row) => `${row.description}${row.note ?? ''}`),
      )
    })
    expect(open.textContent).toContain('看板打開詳情時換同一欄')
  })

  it('? opens it; Esc closes it and focus goes back where it was', async () => {
    const elsewhere = document.createElement('button')
    document.body.append(elsewhere)
    await mount()
    elsewhere.focus()
    await press('?')
    expect(dialog()).not.toBeNull()
    expect(openLayerCount()).toBe(1)
    await press('Escape')
    expect(dialog()).toBeNull()
    expect(openLayerCount()).toBe(0)
    await settle()
    expect(document.activeElement).toBe(elsewhere)
  })

  it('✕ closes it and focus goes back to the 快捷鍵 button', async () => {
    await mount()
    await act(async () => button()?.click())
    await act(async () => closeButton().click())
    expect(dialog()).toBeNull()
    await settle()
    expect(document.activeElement).toBe(button())
  })

  it('while it is open, /, digits, arrows, S and ? do nothing', async () => {
    const calls: Array<string> = []
    for (const name of [
      'openSearch',
      'selectTab',
      'nextItem',
      'openSortMenu',
    ] as const) {
      setShortcutAction(name, () => {
        calls.push(name)
        return true
      })
    }
    await mount()
    await press('?')
    for (const key of ['/', '1', 'ArrowDown', 's', '?']) {
      await press(key)
    }
    expect(calls).toEqual([])
    expect(dialog()).not.toBeNull()
    await press('Escape')
    await press('1', document.body)
    expect(calls).toEqual(['selectTab'])
  })

  it('phone width: ? opens nothing', async () => {
    desktop = false
    await mount()
    await press('?', document.body)
    expect(dialog()).toBeNull()
    expect(openLayerCount()).toBe(0)
  })
})

describe('modal behaviour (non-modal Radix plus the sheet session)', () => {
  /** The page behind: a sibling of the app root. */
  function addPage() {
    const page = document.createElement('div')
    page.id = 'page'
    page.append(document.createElement('button'))
    document.body.append(page)
    return page
  }

  const tab = (shiftKey: boolean) =>
    act(async () => {
      const event = new KeyboardEvent('keydown', {
        key: 'Tab',
        shiftKey,
        bubbles: true,
        cancelable: true,
      })
      document.activeElement?.dispatchEvent(event)
    })

  it('the page behind is inert and scroll-locked; Esc gives both back', async () => {
    const page = addPage()
    await mount()
    await act(async () => button()?.click())
    await settle()
    expect(page.hasAttribute('inert')).toBe(true)
    expect(container.hasAttribute('inert')).toBe(true)
    expect(document.documentElement.style.overflow).toBe('hidden')
    expect(dialog()?.getAttribute('aria-modal')).toBe('true')
    await press('Escape')
    await settle()
    expect(dialog()).toBeNull()
    expect(page.hasAttribute('inert')).toBe(false)
    expect(container.hasAttribute('inert')).toBe(false)
    expect(document.documentElement.style.overflow).toBe('')
  })

  it('Tab and Shift+Tab stay inside', async () => {
    addPage()
    await mount()
    await act(async () => button()?.click())
    await settle()
    closeButton().focus()
    await tab(false)
    expect(dialog()?.contains(document.activeElement)).toBe(true)
    await tab(true)
    expect(dialog()?.contains(document.activeElement)).toBe(true)
  })

  it('a press on the scrim closes it', async () => {
    const page = addPage()
    await mount()
    await act(async () => button()?.click())
    await settle()
    const scrim = document.querySelector(
      '[data-slot="dialog-overlay"]',
    ) as HTMLElement
    expect(scrim.className).toContain('bg-scrim-dialog')
    await act(async () => {
      // Radix's dialog waits for the click that ends the press.
      scrim.dispatchEvent(
        new PointerEvent('pointerdown', { bubbles: true, button: 0 }),
      )
      scrim.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })
    await settle()
    expect(dialog()).toBeNull()
    expect(page.hasAttribute('inert')).toBe(false)
    expect(openLayerCount()).toBe(0)
  })

  it('narrowing below 1024px closes it; widening again does not reopen it', async () => {
    await mount()
    await act(async () => button()?.click())
    expect(dialog()).not.toBeNull()
    await setDesktop(false)
    await settle()
    expect(dialog()).toBeNull()
    await setDesktop(true)
    await settle()
    expect(dialog()).toBeNull()
  })
})
