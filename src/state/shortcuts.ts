import { useLayoutEffect, useRef } from 'react'

// AR-52, AD-13: the one shortcut registry. Every key the app answers is in
// SHORTCUTS below (Epic 3 adds `/`, `↑` `↓`, `1` to `9` and the help
// window, which lists this table); no component listens to the keyboard on
// its own for a shortcut. Story 2.4 registers `Esc` only.
//
// `Esc` closes the topmost open layer. Layers stack in the order they
// opened (this story: the board's detail panel and any bottom sheet, so a
// sheet opened over the panel closes first). While focus is in an
// `input`, `textarea`, `select` or contenteditable, only shortcuts marked
// `inInputs` (only `Esc`) are handled. A key another handler already took
// (`defaultPrevented`, e.g. a Radix menu closing on Esc) is left alone,
// and so is a key pressed while an IME is composing.
//
// One `keydown` listener on `document`, there only while a layer is open.

export interface ShortcutEvent {
  key: string
  target: EventTarget | null
  defaultPrevented: boolean
  isComposing?: boolean
  preventDefault: () => void
}

export interface Shortcut {
  /** `KeyboardEvent.key`. */
  key: string
  /** Also handled while focus is in a text field. */
  inInputs: boolean
  /** What it does; `false` when there was nothing to do. */
  run: () => boolean
}

interface Layer {
  id: number
  close: () => void
}

const layers: Array<Layer> = []
let nextLayerId = 1

/** Closes the topmost layer; `false` when none is open. */
function closeTopLayer(): boolean {
  const top = layers.at(-1)
  if (!top) return false
  top.close()
  return true
}

export const SHORTCUTS: ReadonlyArray<Shortcut> = [
  { key: 'Escape', inInputs: true, run: closeTopLayer },
]

/** Focus is somewhere text is typed. */
export function isTypingTarget(target: EventTarget | null): boolean {
  if (typeof Element === 'undefined' || !(target instanceof Element)) {
    return false
  }
  if (target.closest('input, textarea, select')) return true
  return target instanceof HTMLElement && target.isContentEditable
}

/**
 * Runs the shortcut for `event`, if any applies. Returns whether it acted
 * (and then the default is prevented).
 */
export function handleShortcut(event: ShortcutEvent): boolean {
  if (event.defaultPrevented || event.isComposing) return false
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

/**
 * Adds a layer `Esc` closes, on top of the open ones. Returns its removal
 * (once; later calls do nothing).
 */
export function pushEscapeLayer(close: () => void): () => void {
  const layer = { id: nextLayerId, close }
  nextLayerId += 1
  if (layers.length === 0 && typeof document !== 'undefined') {
    document.addEventListener('keydown', onKeyDown)
  }
  layers.push(layer)
  return () => {
    const index = layers.findIndex((entry) => entry.id === layer.id)
    if (index === -1) return
    layers.splice(index, 1)
    if (layers.length === 0 && typeof document !== 'undefined') {
      document.removeEventListener('keydown', onKeyDown)
    }
  }
}

/** How many layers are open (tests). */
export function openLayerCount(): number {
  return layers.length
}

/** Drops every layer and the listener (tests). */
export function resetShortcuts(): void {
  layers.length = 0
  if (typeof document !== 'undefined') {
    document.removeEventListener('keydown', onKeyDown)
  }
}

/**
 * While `open`, `Esc` calls `close` when this is the topmost layer. The
 * layer joins the stack when `open` turns true (a layout effect, so it is in
 * place in the same commit) and keeps its place across re-renders; `close`
 * may change between renders.
 */
export function useEscapeLayer(open: boolean, close: () => void): void {
  const closeRef = useRef(close)
  useLayoutEffect(() => {
    closeRef.current = close
  })
  useLayoutEffect(
    () => (open ? pushEscapeLayer(() => closeRef.current()) : undefined),
    [open],
  )
}
