import { useLayoutEffect, useRef } from 'react'

// AR-52, AD-13: the one shortcut registry. Every key the app answers is in
// SHORTCUTS below; no component listens to the keyboard on its own for a
// shortcut. Story 2.4 registered `Esc`, story 3.5 `/`; story 3.7 completes
// the table (EXPERIENCE Interaction Primitives 快捷鍵): `↑` `↓`, `1` to `9`,
// `[` `]`, `S` then `1` to `5`, `?`. Each entry has its keys, how the help
// shows them, a description and a group: the help window, the tab and
// header button tooltips and the sort menu's digits all read their text
// from this table (`helpGroups`, `shortcutKeysText`, `titleWithShortcut`,
// `tabShortcutTitle`, `sortMenuDigit`), never their own copy.
//
// Keys other than `Esc` only run an action a mounted component provides
// (`useShortcutAction`), and only the desktop components provide them
// (1024px and up), so the phone answers none. While a `dialog`-rank layer
// is open (the help window, a bottom sheet) no action runs. A key pressed
// inside an open menu (any Radix menu: sort, ⋯, file priority) runs only
// the entries marked `inMenus`: the digits, which go to the sort menu's
// `pickTopSort` when it provides one and do nothing in other menus.
//
// `Esc` closes one open layer: the highest-ranked one (story 3.5, AD-13:
// a dialog or bottom sheet first, then the search box, then the detail,
// whatever order they opened in), the most recent within a rank. While
// focus is in an `input`, `textarea`, `select` or contenteditable, only
// shortcuts marked `inInputs` (only `Esc`) are handled. A key another
// handler already took (`defaultPrevented`, e.g. a Radix menu closing on
// Esc or moving on an arrow), a key pressed while an IME is composing
// (`isComposing`, or Safari's `keyCode` 229 for the key that ends a
// composition), an auto-repeat (except `↑` `↓`: holding one keeps
// stepping, so the list does not scroll on its own instead), and a
// combination with Cmd, Ctrl or Alt are left alone (except AltGr, which
// some layouts report as Ctrl and Alt and need to type `/` or `[`). Shift
// is allowed with every printable key (`event.key` already says what it
// typed: `?`, `S`, a German `/`, AZERTY digits); only Shift+`↑` `↓` are
// left alone. Radix moves focus into a menu when it opens and closes a
// non-modal menu when focus leaves, so a key pressed while one is open
// lands inside it; there `/`, `[` `]`, `S` and `?` are refused (the
// menu's close would pull focus back, or the category and torrent would
// change behind the menu and its items would act on another torrent),
// and Radix takes `Esc` and the arrows itself. `↑` `↓` are left to
// whatever has focus inside an element marked `OWN_ARROWS` (the detail's
// tab list and its scrolling body with the file list; not its header, so
// they still step from ‹ › and ✕).
// https://developer.mozilla.org/en-US/docs/Web/API/KeyboardEvent/key
// https://developer.mozilla.org/en-US/docs/Web/API/KeyboardEvent/isComposing
//
// One `keydown` listener on `document`, there whenever a registered key can
// act: while a layer is open or an action is provided.

export interface ShortcutEvent {
  key: string
  target: EventTarget | null
  defaultPrevented: boolean
  isComposing?: boolean
  /** Safari reports 229 for the key that ends an IME composition. */
  keyCode?: number
  /** A held key auto-repeating. */
  repeat?: boolean
  ctrlKey?: boolean
  metaKey?: boolean
  altKey?: boolean
  shiftKey?: boolean
  /** `KeyboardEvent.getModifierState`, for AltGr. */
  getModifierState?: (key: string) => boolean
  preventDefault: () => void
}

/** The help window's groups, in the order it lists them. */
export const SHORTCUT_GROUPS = [
  '換種子',
  '換分類',
  '排序',
  '搜尋和關閉',
  '說明',
] as const
export type ShortcutGroup = (typeof SHORTCUT_GROUPS)[number]

/** One piece of how the help shows a shortcut: a key, or a word between. */
export type ShortcutKeyPart = { key: string } | { word: string }

export type ShortcutId =
  'item' | 'tabDigit' | 'tabStep' | 'sort' | 'search' | 'escape' | 'help'

export interface Shortcut {
  id: ShortcutId
  /** The `KeyboardEvent.key` values it answers. */
  keys: ReadonlyArray<string>
  /** How the help window and tooltips show it: keys in `<kbd>`, words as text. */
  display: ReadonlyArray<ShortcutKeyPart>
  /** Also handled while focus is in a text field. */
  inInputs: boolean
  /** Also handled from inside an open menu (`run` gets `inMenu`). */
  inMenus?: boolean
  /** A Shift combination is left alone (`↑` `↓`; printable keys allow it). */
  noShift?: boolean
  /** A held key keeps acting (`↑` `↓`). */
  repeats?: boolean
  /** Left alone while focus is inside this selector. */
  notInside?: string
  /** What it does, for the help window. */
  description: string
  /** A muted line under the description, or none. */
  note?: string
  group: ShortcutGroup
  /**
   * Does it for the key pressed (`inMenu`: pressed inside an open menu);
   * `false` when there was nothing to do.
   */
  run: (key: string, inMenu: boolean) => boolean
}

/**
 * What an `Esc` layer is, lowest first: `Esc` closes a dialog (or bottom
 * sheet) before the search box, and the search box before the detail.
 */
export const ESCAPE_RANKS = ['detail', 'search', 'dialog'] as const
export type EscapeRank = (typeof ESCAPE_RANKS)[number]

interface Layer {
  id: number
  rank: number
  close: () => void
}

const layers: Array<Layer> = []
let nextLayerId = 1

/**
 * Keys whose action a mounted component provides. `selectTab` and
 * `pickTopSort` get the digit's position (`0` for `1`); the others ignore it.
 */
export type ShortcutAction =
  | 'openSearch'
  | 'prevItem'
  | 'nextItem'
  | 'selectTab'
  | 'prevTab'
  | 'nextTab'
  | 'openSortMenu'
  | 'pickTopSort'
  | 'openHelp'

type ActionRun = (index: number) => boolean

/** Each action's providers in mount order; the newest one runs. */
const actions = new Map<ShortcutAction, Array<{ run: ActionRun }>>()

/** The layer `Esc` closes: highest rank, then the most recent. */
function topLayer(): Layer | undefined {
  let top: Layer | undefined
  for (const layer of layers) {
    if (top === undefined || layer.rank >= top.rank) top = layer
  }
  return top
}

/** Closes the top layer; `false` when none is open. */
function closeTopLayer(): boolean {
  const top = topLayer()
  if (!top) return false
  top.close()
  return true
}

const DIALOG_RANK = ESCAPE_RANKS.indexOf('dialog')

/** Runs a registered action; `false` when none is, or a dialog is open. */
function runAction(name: ShortcutAction, index = 0): boolean {
  if (layers.some((layer) => layer.rank >= DIALOG_RANK)) return false
  const provider = actions.get(name)?.at(-1)
  return provider ? provider.run(index) : false
}

/**
 * Spread on an element whose own keyboard keeps `↑` `↓` (the detail's tab
 * list and body): focus inside it, the arrows do not change the torrent.
 */
export const OWN_ARROWS = { 'data-own-arrows': '' } as const

/** What has focus, or `null` for nothing (`body`). */
export function focusedElement(): HTMLElement | null {
  if (typeof document === 'undefined') return null
  const active = document.activeElement
  return active instanceof HTMLElement && active !== document.body
    ? active
    : null
}

/** `1` to `9`: the tabs in order, `1` is 「全部」. */
const TAB_DIGITS = ['1', '2', '3', '4', '5', '6', '7', '8', '9'] as const
/** After `S`: `1` to `5`, the sort menu's top five. */
const SORT_DIGITS = TAB_DIGITS.slice(0, 5)

const key = (name: string): ShortcutKeyPart => ({ key: name })
const word = (text: string): ShortcutKeyPart => ({ word: text })

/** Radix menu content; focus stays inside one while it is open. */
const MENU_SELECTOR = '[role="menu"]'

/**
 * A digit: in a menu, the sort menu's top five (`pickTopSort` is provided
 * only while it is open; nothing in another menu), else the tab at that
 * position.
 */
function runDigit(pressed: string, inMenu: boolean): boolean {
  const index = TAB_DIGITS.indexOf(pressed as (typeof TAB_DIGITS)[number])
  if (inMenu) {
    return index < SORT_DIGITS.length && runAction('pickTopSort', index)
  }
  return runAction('selectTab', index)
}

export const SHORTCUTS: ReadonlyArray<Shortcut> = [
  {
    id: 'item',
    keys: ['ArrowUp', 'ArrowDown'],
    display: [key('↑'), key('↓')],
    inInputs: false,
    repeats: true,
    noShift: true,
    notInside: '[data-own-arrows]',
    description: '上一個、下一個',
    note: '看板打開詳情時換同一欄',
    group: '換種子',
    run: (pressed) =>
      runAction(pressed === 'ArrowUp' ? 'prevItem' : 'nextItem'),
  },
  {
    id: 'tabDigit',
    keys: TAB_DIGITS,
    display: [key(TAB_DIGITS[0]), word('到'), key(TAB_DIGITS.at(-1) ?? '')],
    inInputs: false,
    inMenus: true,
    description: `跳到分類，照分頁順序，${TAB_DIGITS[0]} 是「全部」`,
    group: '換分類',
    run: runDigit,
  },
  {
    id: 'tabStep',
    keys: ['[', ']'],
    display: [key('['), key(']')],
    inInputs: false,
    description: '上一個、下一個分類',
    group: '換分類',
    run: (pressed) => runAction(pressed === '[' ? 'prevTab' : 'nextTab'),
  },
  {
    id: 'sort',
    keys: ['s', 'S'],
    display: [
      key('S'),
      word('再按'),
      key(SORT_DIGITS[0]),
      word('到'),
      key(SORT_DIGITS.at(-1) ?? ''),
    ],
    inInputs: false,
    description: `打開排序選單，再按 ${SORT_DIGITS[0]} 到 ${SORT_DIGITS.at(-1) ?? ''} 選常用排序`,
    group: '排序',
    run: () => runAction('openSortMenu'),
  },
  {
    id: 'search',
    keys: ['/'],
    display: [key('/')],
    inInputs: false,
    description: '打開搜尋框找名字',
    group: '搜尋和關閉',
    run: () => runAction('openSearch'),
  },
  {
    id: 'escape',
    keys: ['Escape'],
    display: [key('Esc')],
    inInputs: true,
    inMenus: true,
    description: '清除搜尋、關掉視窗或詳情',
    group: '搜尋和關閉',
    run: closeTopLayer,
  },
  {
    id: 'help',
    keys: ['?'],
    display: [key('?')],
    inInputs: false,
    description: '打開快捷鍵說明',
    group: '說明',
    run: () => runAction('openHelp'),
  },
]

function shortcutById(id: ShortcutId): Shortcut {
  const found = SHORTCUTS.find((entry) => entry.id === id)
  if (!found) throw new Error(`no shortcut ${id}`)
  return found
}

/** The shortcut's keys as plain text: 「/」, 「S 再按 1 到 5」. */
export function shortcutKeysText(id: ShortcutId): string {
  return shortcutById(id)
    .display.map((part) => ('key' in part ? part.key : part.word))
    .join(' ')
}

/** A header button's tooltip: 「搜尋（/）」, 「快捷鍵（?）」. */
export function titleWithShortcut(label: string, id: ShortcutId): string {
  return `${label}（${shortcutKeysText(id)}）`
}

/**
 * The tooltip of the tab at `index` (0 is 「全部」): 「快捷鍵 2」, or
 * `undefined` from the 10th tab on (no digit left).
 */
export function tabShortcutTitle(index: number): string | undefined {
  const digit = shortcutById('tabDigit').keys[index] as string | undefined
  return digit === undefined ? undefined : `快捷鍵 ${digit}`
}

/** The digit the sort menu shows next to its `top`-th item (1 to 5). */
export function sortMenuDigit(top: number): string | undefined {
  return SORT_DIGITS[top - 1]
}

export interface HelpGroup {
  group: ShortcutGroup
  rows: ReadonlyArray<Shortcut>
}

/** The help window's content: every entry, by group in table order. */
export function helpGroups(): ReadonlyArray<HelpGroup> {
  return SHORTCUT_GROUPS.map((group) => ({
    group,
    rows: SHORTCUTS.filter((entry) => entry.group === group),
  })).filter((entry) => entry.rows.length > 0)
}

/** Focus is somewhere text is typed. */
export function isTypingTarget(target: EventTarget | null): boolean {
  if (typeof Element === 'undefined' || !(target instanceof Element)) {
    return false
  }
  if (target.closest('input, textarea, select')) return true
  return target instanceof HTMLElement && target.isContentEditable
}

/** The keystroke belongs to an IME composition. */
function composing(event: ShortcutEvent): boolean {
  return event.isComposing === true || event.keyCode === 229
}

/**
 * Runs the shortcut for `event`, if any applies. Returns whether it acted
 * (and then the default is prevented).
 */
export function handleShortcut(event: ShortcutEvent): boolean {
  if (event.defaultPrevented || composing(event)) return false
  // AltGr (Ctrl and Alt on Windows) types characters; Cmd never does.
  const altGraph = event.getModifierState?.('AltGraph') === true
  if (event.metaKey) return false
  if (!altGraph && (event.ctrlKey || event.altKey)) return false
  const shortcut = SHORTCUTS.find((entry) => entry.keys.includes(event.key))
  if (!shortcut) return false
  // A held Esc repeats: one press closes one layer, not the ones below.
  if (event.repeat && shortcut.repeats !== true) return false
  if (event.shiftKey && shortcut.noShift === true) return false
  if (!shortcut.inInputs && isTypingTarget(event.target)) return false
  const target =
    typeof Element !== 'undefined' && event.target instanceof Element
      ? event.target
      : null
  if (shortcut.notInside !== undefined && target?.closest(shortcut.notInside)) {
    return false
  }
  const inMenu = target?.closest(MENU_SELECTOR) != null
  if (inMenu && shortcut.inMenus !== true) return false
  if (!shortcut.run(event.key, inMenu)) return false
  event.preventDefault()
  return true
}

const onKeyDown = (event: KeyboardEvent) => {
  handleShortcut(event)
}

let listening = false

/** The listener is there exactly while a layer is open or an action set. */
function syncListener(): void {
  if (typeof document === 'undefined') return
  const wanted = layers.length > 0 || actions.size > 0
  if (wanted === listening) return
  listening = wanted
  if (wanted) document.addEventListener('keydown', onKeyDown)
  else document.removeEventListener('keydown', onKeyDown)
}

/**
 * Adds a layer `Esc` closes (`rank` decides before the others, then the
 * most recent). Returns its removal (once; later calls do nothing).
 */
export function pushEscapeLayer(
  close: () => void,
  rank: EscapeRank = 'dialog',
): () => void {
  const layer = { id: nextLayerId, rank: ESCAPE_RANKS.indexOf(rank), close }
  nextLayerId += 1
  layers.push(layer)
  syncListener()
  return () => {
    const index = layers.findIndex((entry) => entry.id === layer.id)
    if (index === -1) return
    layers.splice(index, 1)
    syncListener()
  }
}

/**
 * Provides the action behind a key (`openSearch` for `/`). The newest
 * provider runs; removing it gives the key back to the one before. `run`
 * gets the digit's position for `selectTab` and `pickTopSort`. Returns its
 * removal (once; later calls do nothing).
 */
export function setShortcutAction(
  name: ShortcutAction,
  run: ActionRun,
): () => void {
  const provider = { run }
  const stack = actions.get(name) ?? []
  stack.push(provider)
  actions.set(name, stack)
  syncListener()
  return () => {
    const current = actions.get(name)
    const index = current?.indexOf(provider) ?? -1
    if (current === undefined || index === -1) return
    current.splice(index, 1)
    if (current.length === 0) actions.delete(name)
    syncListener()
  }
}

/** How many layers are open (tests). */
export function openLayerCount(): number {
  return layers.length
}

/** Drops every layer, action and the listener (tests). */
export function resetShortcuts(): void {
  layers.length = 0
  actions.clear()
  syncListener()
}

/**
 * While `open`, `Esc` calls `close` when this is the top layer (`rank`,
 * then open order). The layer joins when `open` turns true (a layout
 * effect, so it is in place in the same commit) and keeps its place across
 * re-renders; `close` may change between renders.
 */
export function useEscapeLayer(
  open: boolean,
  close: () => void,
  rank: EscapeRank,
): void {
  const closeRef = useRef(close)
  useLayoutEffect(() => {
    closeRef.current = close
  })
  useLayoutEffect(
    () => (open ? pushEscapeLayer(() => closeRef.current(), rank) : undefined),
    [open, rank],
  )
}

/**
 * Provides `name`'s action while `run` is not `null`; `run` may change
 * between renders.
 */
export function useShortcutAction(
  name: ShortcutAction,
  run: ActionRun | null,
): void {
  const runRef = useRef(run)
  useLayoutEffect(() => {
    runRef.current = run
  })
  const enabled = run !== null
  useLayoutEffect(
    () =>
      enabled
        ? setShortcutAction(name, (index) => runRef.current?.(index) ?? false)
        : undefined,
    [name, enabled],
  )
}
