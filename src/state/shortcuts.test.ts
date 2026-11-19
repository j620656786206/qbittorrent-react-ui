// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  OWN_ARROWS,
  SHORTCUTS,
  SHORTCUT_GROUPS,
  focusedElement,
  handleShortcut,
  helpGroups,
  isTypingTarget,
  openLayerCount,
  pushEscapeLayer,
  resetShortcuts,
  setShortcutAction,
  shortcutKeysText,
  sortMenuDigit,
  tabShortcutTitle,
  titleWithShortcut,
} from '#/state/shortcuts'
import type { ShortcutAction } from '#/state/shortcuts'
import { TOP_SORT_FIELDS } from '#/shared/sort-fields'

// Spec 2.4 row D13, AR-52: Esc closes the top layer; in a text field only
// Esc is handled. Story 3.5: `/` opens the search box (an action the
// desktop search box provides); layers have a rank (dialog, then search,
// then detail, whatever order they opened in); IME keys are ignored; the
// listener is there while a layer is open or an action is provided.
// Story 3.7: the full table (`↑` `↓`, `1` to `9`, `[` `]`, `S`, `?`) with
// groups; inside an open menu only the digits act, and they go to the sort
// menu's top five; the help window's rows and every tooltip come from the
// same table.

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

/** An open Radix menu's content, as Radix renders it, with focus in it. */
function openMenu() {
  const menu = document.createElement('div')
  menu.setAttribute('role', 'menu')
  menu.tabIndex = -1
  const item = document.createElement('div')
  item.setAttribute('role', 'menuitem')
  item.tabIndex = -1
  menu.append(item)
  document.body.append(menu)
  return item
}

afterEach(() => {
  resetShortcuts()
  document.body.replaceChildren()
})

describe('registration', () => {
  it('every shortcut with its keys, group and description; only Esc in text fields', () => {
    expect(
      SHORTCUTS.map((entry) => [
        entry.group,
        entry.keys,
        shortcutKeysText(entry.id),
        entry.description,
        entry.inInputs,
      ]),
    ).toEqual([
      ['換種子', ['ArrowUp', 'ArrowDown'], '↑ ↓', '上一個、下一個', false],
      [
        '換分類',
        ['1', '2', '3', '4', '5', '6', '7', '8', '9'],
        '1 到 9',
        '跳到分類，照分頁順序，1 是「全部」',
        false,
      ],
      ['換分類', ['[', ']'], '[ ]', '上一個、下一個分類', false],
      [
        '排序',
        ['s', 'S'],
        'S 再按 1 到 5',
        '打開排序選單，再按 1 到 5 選常用排序',
        false,
      ],
      ['搜尋和關閉', ['/'], '/', '打開搜尋框找名字', false],
      ['搜尋和關閉', ['Escape'], 'Esc', '清除搜尋、關掉視窗或詳情', true],
      ['說明', ['?'], '?', '打開快捷鍵說明', false],
    ])
    expect(SHORTCUTS[0].note).toBe('看板打開詳情時換同一欄')
    // No key answers two entries.
    const keys = SHORTCUTS.flatMap((entry) => entry.keys)
    expect(new Set(keys).size).toBe(keys.length)
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

/** Provides every action with a spy that records `name(index)`. */
function provideAll(result = true) {
  const calls: Array<string> = []
  const names: Array<ShortcutAction> = [
    'openSearch',
    'prevItem',
    'nextItem',
    'selectTab',
    'prevTab',
    'nextTab',
    'openSortMenu',
    'openHelp',
  ]
  for (const name of names) {
    setShortcutAction(name, (index) => {
      calls.push(`${name}(${index})`)
      return result
    })
  }
  return calls
}

describe('story 3.7 keys', () => {
  it.each([
    ['ArrowUp', 'prevItem(0)'],
    ['ArrowDown', 'nextItem(0)'],
    ['1', 'selectTab(0)'],
    ['3', 'selectTab(2)'],
    ['9', 'selectTab(8)'],
    ['[', 'prevTab(0)'],
    [']', 'nextTab(0)'],
    ['s', 'openSortMenu(0)'],
    ['S', 'openSortMenu(0)'],
    ['?', 'openHelp(0)'],
    ['/', 'openSearch(0)'],
  ])('%s runs %s and is taken', (key, call) => {
    const calls = provideAll()
    expect(press(key).defaultPrevented).toBe(true)
    expect(calls).toEqual([call])
  })

  it('Shift is allowed (? and S are typed with it)', () => {
    const calls = provideAll()
    press('?', document.body, { shiftKey: true })
    press('S', document.body, { shiftKey: true })
    expect(calls).toEqual(['openHelp(0)', 'openSortMenu(0)'])
  })

  it('an action with nothing to do leaves the key alone', () => {
    provideAll(false)
    expect(press('ArrowDown').defaultPrevented).toBe(false)
    expect(press('5').defaultPrevented).toBe(false)
  })

  it('without providers (the phone) no key is taken', () => {
    pushEscapeLayer(() => {}, 'detail')
    for (const key of ['ArrowUp', 'ArrowDown', '1', '[', ']', 's', '?']) {
      expect(press(key).defaultPrevented).toBe(false)
    }
  })

  it('in a text field 1, ?, S and ↓ are typed, not run', () => {
    const calls = provideAll()
    const field = document.createElement('input')
    document.body.append(field)
    for (const key of ['1', '?', 'S', 's', 'ArrowDown', '[']) {
      expect(press(key, field).defaultPrevented).toBe(false)
    }
    expect(calls).toEqual([])
  })

  it('Cmd+1, Ctrl+[, Alt+S are left to the browser', () => {
    const calls = provideAll()
    press('1', document.body, { metaKey: true })
    press('[', document.body, { ctrlKey: true })
    expect(
      handleShortcut({
        key: 'S',
        target: document.body,
        defaultPrevented: false,
        altKey: true,
        getModifierState: () => false,
        preventDefault: () => {},
      }),
    ).toBe(false)
    expect(calls).toEqual([])
  })

  it('AltGr still types [ into the shortcut', () => {
    const calls = provideAll()
    expect(
      handleShortcut({
        key: '[',
        target: document.body,
        defaultPrevented: false,
        ctrlKey: true,
        altKey: true,
        getModifierState: (key: string) => key === 'AltGraph',
        preventDefault: () => {},
      }),
    ).toBe(true)
    expect(calls).toEqual(['prevTab(0)'])
  })

  it.each(['1', 'S', 'ArrowDown', '?'])(
    '%s while an IME is composing does nothing',
    (key) => {
      const calls = provideAll()
      expect(press(key, document.body, { isComposing: true })).toMatchObject({
        defaultPrevented: false,
      })
      expect(calls).toEqual([])
    },
  )

  it('a held ↓ keeps stepping; other held keys run once', () => {
    const calls = provideAll()
    press('ArrowDown')
    press('ArrowDown', document.body, { repeat: true })
    press('ArrowUp', document.body, { repeat: true })
    press(']')
    press(']', document.body, { repeat: true })
    press('s', document.body, { repeat: true })
    expect(calls).toEqual([
      'nextItem(0)',
      'nextItem(0)',
      'prevItem(0)',
      'nextTab(0)',
    ])
  })

  it('Shift+↑ ↓ are left alone; printable keys typed with Shift act (German /, AZERTY digits)', () => {
    const calls = provideAll()
    for (const key of ['ArrowDown', 'ArrowUp']) {
      expect(
        press(key, document.body, { shiftKey: true }).defaultPrevented,
      ).toBe(false)
    }
    expect(calls).toEqual([])
    for (const key of ['/', '1', '[', '?', 'S']) {
      expect(
        press(key, document.body, { shiftKey: true }).defaultPrevented,
      ).toBe(true)
    }
    expect(calls).toEqual([
      'openSearch(0)',
      'selectTab(0)',
      'prevTab(0)',
      'openHelp(0)',
      'openSortMenu(0)',
    ])
    expect(
      SHORTCUTS.filter((entry) => entry.noShift === true).map((e) => e.id),
    ).toEqual(['item'])
  })

  it('↑ ↓ are left to an element marked OWN_ARROWS (the detail panel)', () => {
    const calls = provideAll()
    const panel = document.createElement('aside')
    for (const [name, value] of Object.entries(OWN_ARROWS)) {
      panel.setAttribute(name, value)
    }
    const inside = document.createElement('button')
    panel.append(inside)
    document.body.append(panel)
    expect(press('ArrowDown', inside).defaultPrevented).toBe(false)
    expect(press('ArrowUp', panel).defaultPrevented).toBe(false)
    // Other keys still act from there.
    expect(press(']', inside).defaultPrevented).toBe(true)
    expect(calls).toEqual(['nextTab(0)'])
  })

  it('inside any open menu only the digits act: /, [ ], S, ? and the arrows are refused', () => {
    const calls = provideAll()
    // The ⋯ menu: no pickTopSort, so the digits do nothing there either
    // (no category switch behind it, its item stays on the same torrent).
    const item = openMenu()
    for (const key of ['?', '/', '[', ']', 's', 'S', 'ArrowDown', '2']) {
      expect(press(key, item).defaultPrevented).toBe(false)
    }
    expect(calls).toEqual([])
    // Out of the menu (it closed), the same keys act again.
    press('?')
    press(']')
    press('2')
    expect(calls).toEqual(['openHelp(0)', 'nextTab(0)', 'selectTab(1)'])
  })

  it('the digit descriptions name the keys of the table', () => {
    const digits = SHORTCUTS.find((entry) => entry.id === 'tabDigit')
    const sort = SHORTCUTS.find((entry) => entry.id === 'sort')
    expect(digits?.description).toBe(
      `跳到分類，照分頁順序，${digits?.keys[0]} 是「全部」`,
    )
    expect(sort?.description).toBe(
      `打開排序選單，再按 ${sortMenuDigit(1)} 到 ${sortMenuDigit(5)} 選常用排序`,
    )
  })

  it('focusedElement: what has focus, null for body', () => {
    const button = document.createElement('button')
    document.body.append(button)
    expect(focusedElement()).toBeNull()
    button.focus()
    expect(focusedElement()).toBe(button)
  })

  it('a key another handler took (a Radix menu moving on ↓) is left alone', () => {
    const calls = provideAll()
    document.body.addEventListener(
      'keydown',
      (event) => event.preventDefault(),
      { once: true },
    )
    press('ArrowDown')
    expect(calls).toEqual([])
  })

  it('while a dialog-rank layer is open no action runs; Esc still closes it', () => {
    const calls = provideAll()
    const close = vi.fn()
    const off = pushEscapeLayer(close, 'dialog')
    for (const key of ['/', '1', '[', 'ArrowDown', 's', '?']) {
      expect(press(key).defaultPrevented).toBe(false)
    }
    expect(calls).toEqual([])
    press('Escape')
    expect(close).toHaveBeenCalledTimes(1)
    off()
    press('1')
    expect(calls).toEqual(['selectTab(0)'])
  })
})

describe('digits: the open sort menu first (story 3.7)', () => {
  it('inside the open sort menu, 1 to 5 go to pickTopSort and not to the tabs', () => {
    const calls = provideAll()
    const off = setShortcutAction('pickTopSort', (index) => {
      calls.push(`pickTopSort(${index})`)
      return true
    })
    const item = openMenu()
    expect(press('3', item).defaultPrevented).toBe(true)
    expect(press('1', item).defaultPrevented).toBe(true)
    // 6 to 9 are no sort: nothing, and no tab behind the open menu either.
    expect(press('7', item).defaultPrevented).toBe(false)
    expect(calls).toEqual(['pickTopSort(2)', 'pickTopSort(0)'])
    off()
    item.parentElement?.remove()
    press('3')
    expect(calls.at(-1)).toBe('selectTab(2)')
  })

  it('a pick with nothing to do (狀態 selected, 1) leaves the key alone', () => {
    const select = vi.fn(() => true)
    setShortcutAction('selectTab', select)
    setShortcutAction('pickTopSort', () => false)
    expect(press('1', openMenu()).defaultPrevented).toBe(false)
    expect(select).not.toHaveBeenCalled()
  })

  it('each top sort field has its digit after S, and no digit is left over', () => {
    expect(
      TOP_SORT_FIELDS.map((field) => sortMenuDigit(field.top ?? 0)),
    ).toEqual(TOP_SORT_FIELDS.map((_, index) => String(index + 1)))
    expect(sortMenuDigit(TOP_SORT_FIELDS.length + 1)).toBeUndefined()
  })
})

describe('help rows and tooltips come from the table (story 3.7)', () => {
  it('the help lists every entry once, by group in the table order', () => {
    const groups = helpGroups()
    expect(groups.map((entry) => entry.group)).toEqual([...SHORTCUT_GROUPS])
    expect(groups.flatMap((entry) => entry.rows)).toEqual(
      [...SHORTCUTS].sort(
        (a, b) =>
          SHORTCUT_GROUPS.indexOf(a.group) - SHORTCUT_GROUPS.indexOf(b.group),
      ),
    )
    for (const { rows } of groups) {
      for (const row of rows) expect(SHORTCUTS).toContain(row)
    }
  })

  it('header tooltips name the keys of their entry', () => {
    const search = SHORTCUTS.find((entry) => entry.id === 'search')
    const help = SHORTCUTS.find((entry) => entry.id === 'help')
    expect(titleWithShortcut('搜尋', 'search')).toBe('搜尋（/）')
    expect(titleWithShortcut('快捷鍵', 'help')).toBe('快捷鍵（?）')
    expect(search?.keys).toEqual(['/'])
    expect(help?.keys).toEqual(['?'])
  })

  it('tab tooltips are the digit entry’s keys; none from the 10th tab', () => {
    const digits = SHORTCUTS.find((entry) => entry.id === 'tabDigit')?.keys
    expect(
      Array.from({ length: 10 }, (_, index) => tabShortcutTitle(index)),
    ).toEqual([...(digits ?? []).map((key) => `快捷鍵 ${key}`), undefined])
    expect(tabShortcutTitle(1)).toBe('快捷鍵 2')
  })

  it('the sort menu digits are the keys after S, the same the digits run', () => {
    expect([1, 2, 3, 4, 5].map(sortMenuDigit)).toEqual([
      '1',
      '2',
      '3',
      '4',
      '5',
    ])
    expect(shortcutKeysText('sort')).toBe(
      `S 再按 ${sortMenuDigit(1)} 到 ${sortMenuDigit(5)}`,
    )
    const calls: Array<number> = []
    setShortcutAction('pickTopSort', (index) => {
      calls.push(index)
      return true
    })
    const item = openMenu()
    for (const top of [1, 2, 3, 4, 5]) press(sortMenuDigit(top) ?? '', item)
    expect(calls).toEqual([0, 1, 2, 3, 4])
  })
})
