// @vitest-environment happy-dom
import { act, useState } from 'react'
import { createRoot } from 'react-dom/client'
import type { Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ALL } from '#/shared/categories'
import { DEFAULT_SORT_VIEW } from '#/shared/list-search'
import { DESKTOP_QUERY } from '#/shared/ui/breakpoint'
import { ListViewContext } from '#/state/list-view'
import { pushEscapeLayer, resetShortcuts } from '#/state/shortcuts'
import { DesktopSearch, PhoneSearchHeader } from '#/features/header/search-box'

// Story 3.5 (DESIGN search-box, mockups S03-search-desktop and
// S02-no-result-phone): the header's search box in a DOM, both trees
// mounted like the shell does. The magnifier and `/` (desktop only) open
// it with focus in the field; typing writes the keyword (not while an IME
// composes); ✕, 「取消」 and `Esc` (after a dialog, before the detail) close
// it and focus goes back to the magnifier. The layout's half (the URL's
// `q`) is tested in src/routes/authed-search.dom.test.tsx; layout and
// colors in Chromium (e2e/search.spec.ts).

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean | undefined
}

let root: Root
let container: HTMLElement
let desktop = true
/** What `setQuery` received, as typed. */
let written: Array<string>
let closes: number
/** The keyword the layout would put in the URL (trimmed). */
let initialQuery: string
/** Echoes wait until the test releases them (the router is slow). */
let deferEchoes: boolean
/** Puts a keyword in the "URL", as a late echo would. */
let applyQuery: (query: string) => void = () => {}

/** Stands in for the `_authed` layout: open state and the trimmed keyword. */
function Harness() {
  const [query, setQueryState] = useState(initialQuery)
  const [opened, setOpened] = useState(false)
  const searchOpen = opened || query !== ''
  applyQuery = setQueryState
  return (
    <ListViewContext
      value={{
        view: { ...DEFAULT_SORT_VIEW, category: ALL, query },
        viewReady: true,
        setView: () => {},
        pickView: () => {},
        selectCategory: () => {},
        rememberedHint: false,
        openSettings: () => {},
        settingsOpen: false,
        searchOpen,
        openSearch: () => setOpened(true),
        setQuery: (text) => {
          written.push(text)
          setOpened(true)
          if (!deferEchoes) setQueryState(text.trim())
        },
        closeSearch: () => {
          closes += 1
          setOpened(false)
          setQueryState('')
        },
      }}
    >
      <div data-tree="desktop">
        <DesktopSearch />
      </div>
      <div data-tree="phone">
        <PhoneSearchHeader add={<button type="button">新增種子</button>} />
      </div>
      <input aria-label="其他欄位" />
    </ListViewContext>
  )
}

async function mount() {
  container = document.createElement('div')
  document.body.append(container)
  root = createRoot(container)
  await act(async () => root.render(<Harness />))
}

const tree = (name: 'desktop' | 'phone') =>
  container.querySelector(`[data-tree="${name}"]`) as HTMLElement
const magnifier = (name: 'desktop' | 'phone') =>
  tree(name).querySelector('button[aria-label="搜尋"]') as HTMLButtonElement
const field = (name: 'desktop' | 'phone') =>
  tree(name).querySelector<HTMLInputElement>('input')

function press(key: string, target: EventTarget, init: KeyboardEventInit = {}) {
  const event = new KeyboardEvent('keydown', {
    key,
    bubbles: true,
    cancelable: true,
    ...init,
  })
  target.dispatchEvent(event)
  return event
}

/** Types `value` into `input` as the browser would (React's onChange). */
async function type(input: HTMLInputElement, value: string, composing = false) {
  await act(async () => {
    const setter = Object.getOwnPropertyDescriptor(
      HTMLInputElement.prototype,
      'value',
    )?.set
    setter?.call(input, value)
    input.dispatchEvent(
      new InputEvent('input', { bubbles: true, isComposing: composing }),
    )
  })
}

beforeEach(() => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true
  desktop = true
  written = []
  closes = 0
  initialQuery = ''
  deferEchoes = false
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

afterEach(async () => {
  await act(async () => root.unmount())
  container.remove()
  resetShortcuts()
  vi.restoreAllMocks()
  globalThis.IS_REACT_ACT_ENVIRONMENT = false
})

describe('closed', () => {
  it('only the magnifiers, enabled and labelled 「搜尋」', async () => {
    await mount()
    for (const name of ['desktop', 'phone'] as const) {
      expect(magnifier(name).disabled).toBe(false)
      expect(field(name)).toBeNull()
    }
    expect(tree('phone').querySelector('h1')?.textContent).toBe('種子')
  })
})

describe('opening', () => {
  it('desktop: the magnifier turns into the 240 x 36px pill, focus in the field', async () => {
    await mount()
    await act(async () => magnifier('desktop').click())
    const input = field('desktop')
    if (!input) throw new Error('no field')
    expect(document.activeElement).toBe(input)
    expect(input.type).toBe('search')
    expect(input.getAttribute('aria-label')).toBe('找名字')
    expect(input.placeholder).toBe('找名字')
    const pill = tree('desktop').querySelector('[role="search"]') as HTMLElement
    expect(pill.className).toContain('w-60')
    expect(pill.className).toContain('h-9')
    expect(pill.className).toContain('bg-surface')
    expect(pill.className).toContain('border')
    expect(magnifier('desktop')).toBeNull()
    expect(pill.querySelector('button[aria-label="清除搜尋"]')).not.toBeNull()
  })

  it('phone: the field covers the first row, 16px text, 「取消」; focus in it', async () => {
    desktop = false
    await mount()
    await act(async () => magnifier('phone').click())
    const input = field('phone')
    if (!input) throw new Error('no field')
    expect(document.activeElement).toBe(input)
    expect(input.className).toContain('text-[16px]')
    // The title stays for screen readers only.
    expect(tree('phone').querySelector('h1')?.className).toBe('sr-only')
    expect(tree('phone').querySelector('h1')?.textContent).toBe('種子')
    const box = input.closest('.h-11')
    expect(box).not.toBeNull()
    expect(
      [...tree('phone').querySelectorAll('button')].map(
        (button) => button.textContent,
      ),
    ).toEqual(['取消'])
  })

  it('/ opens it on desktop with focus in the field; the / is not typed', async () => {
    await mount()
    const event = press('/', document.body)
    await act(async () => {})
    expect(event.defaultPrevented).toBe(true)
    expect(document.activeElement).toBe(field('desktop'))
    expect(field('desktop')?.value).toBe('')
  })

  it('/ while typing in another field types normally', async () => {
    await mount()
    const other = container.querySelector(
      'input[aria-label="其他欄位"]',
    ) as HTMLInputElement
    other.focus()
    expect(press('/', other).defaultPrevented).toBe(false)
    await act(async () => {})
    expect(field('desktop')).toBeNull()
  })

  it('/ when open but focus elsewhere moves focus back into the field', async () => {
    await mount()
    await act(async () => magnifier('desktop').click())
    ;(document.activeElement as HTMLElement).blur()
    press('/', document.body)
    await act(async () => {})
    expect(document.activeElement).toBe(field('desktop'))
  })

  it('/ does nothing on the phone', async () => {
    desktop = false
    await mount()
    expect(press('/', document.body).defaultPrevented).toBe(false)
    await act(async () => {})
    expect(field('phone')).toBeNull()
  })

  it('a keyword already set (a reload with q) shows it, without taking focus', async () => {
    initialQuery = 'show'
    await mount()
    expect(field('desktop')?.value).toBe('show')
    expect(document.activeElement).not.toBe(field('desktop'))
  })
})

describe('typing', () => {
  it('writes each keystroke as typed; the field keeps the spaces', async () => {
    await mount()
    await act(async () => magnifier('desktop').click())
    const input = field('desktop') as HTMLInputElement
    await type(input, '  Show')
    await type(input, '  Show.S01 ')
    expect(written).toEqual(['  Show', '  Show.S01 '])
    expect(input.value).toBe('  Show.S01 ')
    // The other width's field follows the keyword.
    expect(field('phone')?.value).toBe('Show.S01')
  })

  it('while an IME composes nothing is written; the end of the composition is', async () => {
    await mount()
    await act(async () => magnifier('desktop').click())
    const input = field('desktop') as HTMLInputElement
    await type(input, 'ㄇㄨ', true)
    expect(written).toEqual([])
    expect(input.value).toBe('ㄇㄨ')
    await act(async () => {
      const setter = Object.getOwnPropertyDescriptor(
        HTMLInputElement.prototype,
        'value',
      )?.set
      setter?.call(input, '牧')
      input.dispatchEvent(
        new CompositionEvent('compositionend', { bubbles: true }),
      )
    })
    expect(written).toEqual(['牧'])
  })

  it('a late echo of an older keyword never overwrites what was typed since', async () => {
    await mount()
    await act(async () => magnifier('desktop').click())
    deferEchoes = true
    const input = field('desktop') as HTMLInputElement
    await type(input, 'ab')
    await type(input, 'abc')
    await act(async () => applyQuery('ab'))
    expect(input.value).toBe('abc')
    await act(async () => applyQuery('abc'))
    expect(input.value).toBe('abc')
  })

  it('a, ab, a: the last echo clears the queue, so a later outside change shows', async () => {
    await mount()
    await act(async () => magnifier('desktop').click())
    deferEchoes = true
    const input = field('desktop') as HTMLInputElement
    await type(input, 'a')
    await type(input, 'ab')
    await type(input, 'a')
    // The router skipped `ab`: only the last `a` comes back.
    await act(async () => applyQuery('a'))
    expect(input.value).toBe('a')
    // A real change from elsewhere (the other width's field) to `ab`.
    await act(async () => applyQuery('ab'))
    expect(input.value).toBe('ab')
  })

  it('Enter leaves the field (the phone keyboard goes away); not while composing', async () => {
    desktop = false
    await mount()
    await act(async () => magnifier('phone').click())
    const input = field('phone') as HTMLInputElement
    expect(document.activeElement).toBe(input)
    press('Enter', input, { isComposing: true })
    expect(document.activeElement).toBe(input)
    const event = press('Enter', input)
    expect(event.defaultPrevented).toBe(true)
    expect(document.activeElement).not.toBe(input)
    // Still open, the keyword kept.
    expect(field('phone')).not.toBeNull()
  })

  it('the field stops at 200 characters', async () => {
    await mount()
    await act(async () => magnifier('desktop').click())
    expect(field('desktop')?.maxLength).toBe(200)
  })

  it('Esc or Enter while composing does nothing', async () => {
    await mount()
    await act(async () => magnifier('desktop').click())
    const input = field('desktop') as HTMLInputElement
    press('Escape', input, { isComposing: true })
    press('Enter', input, { isComposing: true })
    await act(async () => {})
    expect(closes).toBe(0)
    expect(field('desktop')).not.toBeNull()
  })
})

describe('closing', () => {
  it('✕ clears and closes; focus goes back to the magnifier', async () => {
    await mount()
    await act(async () => magnifier('desktop').click())
    await type(field('desktop') as HTMLInputElement, 'show')
    const clear = tree('desktop').querySelector(
      'button[aria-label="清除搜尋"]',
    ) as HTMLButtonElement
    clear.focus()
    await act(async () => clear.click())
    expect(closes).toBe(1)
    expect(field('desktop')).toBeNull()
    expect(document.activeElement).toBe(magnifier('desktop'))
  })

  it('「取消」 on the phone clears and closes', async () => {
    desktop = false
    await mount()
    await act(async () => magnifier('phone').click())
    await type(field('phone') as HTMLInputElement, 'show')
    const cancel = [...tree('phone').querySelectorAll('button')].find(
      (button) => button.textContent === '取消',
    ) as HTMLButtonElement
    cancel.focus()
    await act(async () => cancel.click())
    expect(closes).toBe(1)
    expect(field('phone')).toBeNull()
    expect(document.activeElement).toBe(magnifier('phone'))
  })

  it('Esc from inside the field clears and closes', async () => {
    await mount()
    await act(async () => magnifier('desktop').click())
    const input = field('desktop') as HTMLInputElement
    await type(input, 'show')
    const event = press('Escape', input)
    await act(async () => {})
    expect(event.defaultPrevented).toBe(true)
    expect(closes).toBe(1)
    expect(document.activeElement).toBe(magnifier('desktop'))
  })

  it('Esc order: a dialog first, then the search, then the detail', async () => {
    const calls: Array<string> = []
    const offDetail = pushEscapeLayer(() => {
      calls.push('detail')
      offDetail()
    }, 'detail')
    await mount()
    await act(async () => magnifier('desktop').click())
    const offDialog = pushEscapeLayer(() => {
      calls.push('dialog')
      offDialog()
    }, 'dialog')
    const input = field('desktop') as HTMLInputElement
    press('Escape', input)
    await act(async () => {})
    expect(calls).toEqual(['dialog'])
    expect(field('desktop')).not.toBeNull()
    press('Escape', input)
    await act(async () => {})
    expect(closes).toBe(1)
    expect(field('desktop')).toBeNull()
    expect(calls).toEqual(['dialog'])
    press('Escape', document.body)
    expect(calls).toEqual(['dialog', 'detail'])
  })
})
