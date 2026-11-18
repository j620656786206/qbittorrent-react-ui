// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  SHORTCUTS,
  handleShortcut,
  isTypingTarget,
  openLayerCount,
  pushEscapeLayer,
  resetShortcuts,
  setShortcutAction,
} from '#/state/shortcuts'

// Spec 2.4 row D13, AR-52: Esc closes the top layer; in a text field only
// Esc is handled. Story 3.5: `/` opens the search box (an action the
// desktop search box provides); layers have a rank (dialog, then search,
// then detail, whatever order they opened in); IME keys are ignored; the
// listener is there while a layer is open or an action is provided.

function press(
  key: string,
  target: EventTarget = document.body,
  init: KeyboardEventInit = {},
) {
  const event = new KeyboardEvent('keydown', {
    key,
    bubbles: true,
    cancelable: true,
    ...init,
  })
  target.dispatchEvent(event)
  return event
}

afterEach(() => {
  resetShortcuts()
  document.body.replaceChildren()
})

describe('registration', () => {
  it('registers Esc (in text fields too) and / (not while typing)', () => {
    expect(SHORTCUTS.map((entry) => [entry.key, entry.inInputs])).toEqual([
      ['Escape', true],
      ['/', false],
    ])
    expect(SHORTCUTS.every((entry) => entry.description !== '')).toBe(true)
  })

  it('listens on document while an action is provided, too', () => {
    const add = vi.spyOn(document, 'addEventListener')
    const remove = vi.spyOn(document, 'removeEventListener')
    const off = setShortcutAction('openSearch', () => true)
    const offLayer = pushEscapeLayer(() => {})
    expect(add.mock.calls.filter(([type]) => type === 'keydown')).toHaveLength(
      1,
    )
    offLayer()
    expect(remove).not.toHaveBeenCalledWith('keydown', expect.anything())
    off()
    off()
    expect(
      remove.mock.calls.filter(([type]) => type === 'keydown'),
    ).toHaveLength(1)
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

  it('a held Esc (auto-repeat) closes one layer only', () => {
    const calls: Array<string> = []
    let offTop = () => {}
    pushEscapeLayer(() => calls.push('below'))
    offTop = pushEscapeLayer(() => {
      calls.push('top')
      offTop()
    })
    press('Escape')
    const repeat = new KeyboardEvent('keydown', {
      key: 'Escape',
      repeat: true,
      bubbles: true,
      cancelable: true,
    })
    document.body.dispatchEvent(repeat)
    expect(repeat.defaultPrevented).toBe(false)
    expect(calls).toEqual(['top'])
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

  it('/ is skipped while typing and acts elsewhere', () => {
    const run = vi.fn(() => true)
    setShortcutAction('openSearch', run)
    const field = document.createElement('textarea')
    document.body.append(field)
    expect(press('/', field).defaultPrevented).toBe(false)
    expect(run).not.toHaveBeenCalled()
    expect(press('/').defaultPrevented).toBe(true)
    expect(run).toHaveBeenCalledTimes(1)
  })
})

describe('/ (story 3.5)', () => {
  it('without a provider (the phone) / is not taken', () => {
    pushEscapeLayer(() => {}, 'detail')
    expect(press('/').defaultPrevented).toBe(false)
  })

  it('the newest provider runs; removing an older one keeps it', () => {
    const first = vi.fn(() => true)
    const second = vi.fn(() => true)
    const offFirst = setShortcutAction('openSearch', first)
    setShortcutAction('openSearch', second)
    offFirst()
    press('/')
    expect(first).not.toHaveBeenCalled()
    expect(second).toHaveBeenCalledTimes(1)
  })

  it('removing the newest provider gives / back to the older one', () => {
    const older = vi.fn(() => true)
    const newer = vi.fn(() => true)
    setShortcutAction('openSearch', older)
    const offNewer = setShortcutAction('openSearch', newer)
    offNewer()
    offNewer()
    expect(press('/').defaultPrevented).toBe(true)
    expect(older).toHaveBeenCalledTimes(1)
    expect(newer).not.toHaveBeenCalled()
  })

  it('AltGr (reported as Ctrl and Alt) still types / into the shortcut', () => {
    const run = vi.fn(() => true)
    setShortcutAction('openSearch', run)
    const altGr = {
      key: '/',
      target: document.body,
      defaultPrevented: false,
      ctrlKey: true,
      altKey: true,
      getModifierState: (key: string) => key === 'AltGraph',
      preventDefault: () => {},
    }
    expect(handleShortcut(altGr)).toBe(true)
    expect(handleShortcut({ ...altGr, getModifierState: () => false })).toBe(
      false,
    )
    expect(run).toHaveBeenCalledTimes(1)
  })

  it('with Cmd, Ctrl or Alt, or while a dialog is open, / does nothing', () => {
    const run = vi.fn(() => true)
    setShortcutAction('openSearch', run)
    press('/', document.body, { metaKey: true })
    press('/', document.body, { ctrlKey: true })
    // happy-dom reports any Alt as AltGraph; a real Alt alone is not.
    expect(
      handleShortcut({
        key: '/',
        target: document.body,
        defaultPrevented: false,
        altKey: true,
        getModifierState: () => false,
        preventDefault: () => {},
      }),
    ).toBe(false)
    expect(run).not.toHaveBeenCalled()
    const offDialog = pushEscapeLayer(() => {}, 'dialog')
    expect(press('/').defaultPrevented).toBe(false)
    offDialog()
    // The detail or the search box open: / still works.
    pushEscapeLayer(() => {}, 'detail')
    expect(press('/').defaultPrevented).toBe(true)
    expect(run).toHaveBeenCalledTimes(1)
  })
})

describe('Esc order by rank (story 3.5)', () => {
  /** Opens a layer that removes itself when Esc closes it. */
  function open(
    name: string,
    rank: 'detail' | 'search' | 'dialog',
    calls: Array<string>,
  ) {
    const off = pushEscapeLayer(() => {
      calls.push(name)
      off()
    }, rank)
    return off
  }

  it('dialog over detail over search: dialog, then search, then detail', () => {
    const calls: Array<string> = []
    open('search', 'search', calls)
    open('detail', 'detail', calls)
    open('dialog', 'dialog', calls)
    press('Escape')
    press('Escape')
    press('Escape')
    expect(calls).toEqual(['dialog', 'search', 'detail'])
    expect(openLayerCount()).toBe(0)
  })

  it.each([
    [['detail', 'search', 'dialog']],
    [['dialog', 'search', 'detail']],
    [['search', 'dialog', 'detail']],
    [['detail', 'dialog', 'search']],
  ] as const)(
    'opened in the order %j, Esc still closes dialog, search, detail',
    (order) => {
      const calls: Array<string> = []
      for (const name of order) open(name, name, calls)
      for (let i = 0; i < 3; i += 1) press('Escape')
      expect(calls).toEqual(['dialog', 'search', 'detail'])
    },
  )

  it('within a rank the most recent closes first', () => {
    const calls: Array<string> = []
    open('first sheet', 'dialog', calls)
    open('detail', 'detail', calls)
    open('second sheet', 'dialog', calls)
    press('Escape')
    press('Escape')
    expect(calls).toEqual(['second sheet', 'first sheet'])
  })

  it('Esc closes the search from inside its box', () => {
    const calls: Array<string> = []
    open('detail', 'detail', calls)
    open('search', 'search', calls)
    const field = document.createElement('input')
    field.type = 'search'
    document.body.append(field)
    expect(press('Escape', field).defaultPrevented).toBe(true)
    expect(calls).toEqual(['search'])
  })
})

describe('IME (story 3.5)', () => {
  it.each(['Escape', 'Enter', '/'])(
    '%s while composing does nothing',
    (key) => {
      const close = vi.fn()
      const run = vi.fn(() => true)
      pushEscapeLayer(close, 'search')
      setShortcutAction('openSearch', run)
      const field = document.createElement('input')
      document.body.append(field)
      expect(press(key, field, { isComposing: true }).defaultPrevented).toBe(
        false,
      )
      // Safari: the key that ends a composition reports keyCode 229.
      expect(
        handleShortcut({
          key,
          target: field,
          defaultPrevented: false,
          keyCode: 229,
          preventDefault: () => {},
        }),
      ).toBe(false)
      expect(close).not.toHaveBeenCalled()
      expect(run).not.toHaveBeenCalled()
    },
  )
})
