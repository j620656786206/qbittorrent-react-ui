import { useLayoutEffect, useRef } from 'react'

// AR-52, AD-13: the one shortcut registry. Every key the app answers is in
// SHORTCUTS below (Epic 3 adds `↑` `↓`, `1` to `9` and the help window,
// which lists this table); no component listens to the keyboard on its own
// for a shortcut. Story 2.4 registered `Esc`; story 3.5 adds `/` (open the
// search box, desktop only: only the desktop search box registers it).
//
// `Esc` closes one open layer: the highest-ranked one (story 3.5, AD-13:
// a dialog or bottom sheet first, then the search box, then the detail,
// whatever order they opened in), the most recent within a rank. While
// focus is in an `input`, `textarea`, `select` or contenteditable, only
// shortcuts marked `inInputs` (only `Esc`) are handled. A key another
// handler already took (`defaultPrevented`, e.g. a Radix menu closing on
// Esc), a key pressed while an IME is composing (`isComposing`, or Safari's
// `keyCode` 229 for the key that ends a composition), an auto-repeat, and
// a combination with Cmd, Ctrl or Alt are left alone (except AltGr, which
// some layouts report as Ctrl and Alt and need to type `/`).
// https://developer.mozilla.org/en-US/docs/Web/API/KeyboardEvent/isComposing
//
// One `keydown` listener on `document`, there whenever a registered key can
// act: while a layer is open or an action (`/`) is registered.

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
  /** `KeyboardEvent.getModifierState`, for AltGr. */
  getModifierState?: (key: string) => boolean
  preventDefault: () => void
}

export interface Shortcut {
  /** `KeyboardEvent.key`. */
  key: string
  /** Also handled while focus is in a text field. */
  inInputs: boolean
  /** What it does, for the help window (story 3.7). */
  description: string
  /** What it does; `false` when there was nothing to do. */
  run: () => boolean
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

/** Keys whose action a mounted component provides. */
export type ShortcutAction = 'openSearch'

/** Each action's providers in mount order; the newest one runs. */
const actions = new Map<ShortcutAction, Array<{ run: () => boolean }>>()

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
function runAction(name: ShortcutAction): boolean {
  if (layers.some((layer) => layer.rank >= DIALOG_RANK)) return false
  const provider = actions.get(name)?.at(-1)
  return provider ? provider.run() : false
}

export const SHORTCUTS: ReadonlyArray<Shortcut> = [
  {
    key: 'Escape',
    inInputs: true,
    description: '清除搜尋、關掉視窗或詳情',
    run: closeTopLayer,
  },
  {
    key: '/',
    inInputs: false,
    description: '打開搜尋框找名字',
    run: () => runAction('openSearch'),
  },
]

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
  // A held Esc repeats: one press closes one layer, not the ones below.
  if (event.defaultPrevented || composing(event) || event.repeat) return false
  // AltGr (Ctrl and Alt on Windows) types characters; Cmd never does.
  const altGraph = event.getModifierState?.('AltGraph') === true
  if (event.metaKey) return false
  if (!altGraph && (event.ctrlKey || event.altKey)) return false
  const shortcut = SHORTCUTS.find((entry) => entry.key === event.key)
  if (!shortcut) return false
  if (!shortcut.inInputs && isTypingTarget(event.target)) return false
  if (!shortcut.run()) return false
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
 * provider runs; removing it gives the key back to the one before. Returns
 * its removal (once; later calls do nothing).
 */
export function setShortcutAction(
  name: ShortcutAction,
  run: () => boolean,
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
  run: (() => boolean) | null,
): void {
  const runRef = useRef(run)
  useLayoutEffect(() => {
    runRef.current = run
  })
  const enabled = run !== null
  useLayoutEffect(
    () =>
      enabled
        ? setShortcutAction(name, () => runRef.current?.() ?? false)
        : undefined,
    [name, enabled],
  )
}
