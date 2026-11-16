// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  SHORTCUTS,
  handleShortcut,
  isTypingTarget,
  openLayerCount,
  pushEscapeLayer,
  resetShortcuts,
} from '#/state/shortcuts'

// Spec 2.4 row D13, AR-52: the registry holds Esc only; Esc closes the
// topmost layer; in a text field only Esc is handled.

function press(key: string, target: EventTarget = document.body) {
  const event = new KeyboardEvent('keydown', {
    key,
    bubbles: true,
    cancelable: true,
  })
  target.dispatchEvent(event)
  return event
}

afterEach(() => {
  resetShortcuts()
  document.body.replaceChildren()
})

describe('registration', () => {
  it('registers Esc only, handled in text fields too', () => {
    expect(SHORTCUTS.map((entry) => [entry.key, entry.inInputs])).toEqual([
      ['Escape', true],
    ])
  })

  it('listens on document only while a layer is open', () => {
    const add = vi.spyOn(document, 'addEventListener')
    const remove = vi.spyOn(document, 'removeEventListener')
    const offA = pushEscapeLayer(() => {})
    const offB = pushEscapeLayer(() => {})
    expect(add.mock.calls.filter(([type]) => type === 'keydown')).toHaveLength(
      1,
    )
    offA()
    offA()
    expect(openLayerCount()).toBe(1)
    expect(remove).not.toHaveBeenCalledWith('keydown', expect.anything())
    offB()
    expect(openLayerCount()).toBe(0)
    expect(
      remove.mock.calls.filter(([type]) => type === 'keydown'),
    ).toHaveLength(1)
  })

  it('other keys do nothing', () => {
    const close = vi.fn()
    pushEscapeLayer(close)
    expect(press('a').defaultPrevented).toBe(false)
    expect(press('ArrowDown').defaultPrevented).toBe(false)
    expect(close).not.toHaveBeenCalled()
  })
})

describe('ordering', () => {
  it('Esc closes the topmost layer only; a sheet over the panel closes first', () => {
    const calls: Array<string> = []
    let offSheet = () => {}
    const offPanel = pushEscapeLayer(() => {
      calls.push('panel')
      offPanel()
    })
    offSheet = pushEscapeLayer(() => {
      calls.push('sheet')
      offSheet()
    })
    expect(press('Escape').defaultPrevented).toBe(true)
    expect(calls).toEqual(['sheet'])
    press('Escape')
    expect(calls).toEqual(['sheet', 'panel'])
    expect(openLayerCount()).toBe(0)
  })

  it('a layer removed from the middle keeps the others in order', () => {
    const calls: Array<string> = []
    pushEscapeLayer(() => calls.push('a'))
    const offB = pushEscapeLayer(() => calls.push('b'))
    pushEscapeLayer(() => calls.push('c'))
    offB()
    press('Escape')
    expect(calls).toEqual(['c'])
  })

  it('nothing open: Esc is not taken', () => {
    expect(
      handleShortcut({
        key: 'Escape',
        target: document.body,
        defaultPrevented: false,
        preventDefault: () => {},
      }),
    ).toBe(false)
  })

  it('an Esc another handler took (a menu) is left alone', () => {
    const close = vi.fn()
    pushEscapeLayer(close)
    document.body.addEventListener(
      'keydown',
      (event) => event.preventDefault(),
      { once: true },
    )
    press('Escape')
    expect(close).not.toHaveBeenCalled()
  })
})

describe('the input rule', () => {
  it.each([
    ['input', () => document.createElement('input')],
    ['textarea', () => document.createElement('textarea')],
    ['select', () => document.createElement('select')],
  ])('focus in a %s counts as typing', (_, make) => {
    expect(isTypingTarget(make())).toBe(true)
  })

  it('contenteditable counts; buttons and body do not', () => {
    const editable = document.createElement('div')
    editable.contentEditable = 'true'
    document.body.append(editable)
    // happy-dom does not compute isContentEditable from the attribute.
    Object.defineProperty(editable, 'isContentEditable', { value: true })
    expect(isTypingTarget(editable)).toBe(true)
    expect(isTypingTarget(document.createElement('button'))).toBe(false)
    expect(isTypingTarget(document.body)).toBe(false)
    expect(isTypingTarget(null)).toBe(false)
  })

  it('Esc still closes from a text field', () => {
    const close = vi.fn()
    pushEscapeLayer(close)
    const field = document.createElement('input')
    document.body.append(field)
    press('Escape', field)
    expect(close).toHaveBeenCalledTimes(1)
  })

  it('a shortcut not marked for fields is skipped while typing', () => {
    const run = vi.fn(() => true)
    const field = document.createElement('textarea')
    const shortcuts = SHORTCUTS as Array<(typeof SHORTCUTS)[number]>
    shortcuts.push({ key: '/', inInputs: false, run })
    try {
      const event = {
        key: '/',
        target: field,
        defaultPrevented: false,
        preventDefault: vi.fn(),
      }
      expect(handleShortcut(event)).toBe(false)
      expect(run).not.toHaveBeenCalled()
      expect(handleShortcut({ ...event, target: document.body })).toBe(true)
      expect(run).toHaveBeenCalledTimes(1)
    } finally {
      shortcuts.pop()
    }
  })
})
