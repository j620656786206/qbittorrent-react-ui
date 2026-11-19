import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import type { RefObject } from 'react'
import { detailPosition } from '#/lib/detail-position'
import { focusedElement, useShortcutAction } from '#/state/shortcuts'

// Story 3.7: on desktop `↑` `↓` (the shortcut registry) view the row before
// or after the viewed one in the order shown, as Alex's own pick
// (`setHash`, remembered as last viewed). The row is brought into view
// only when it is off screen (`scrollToIndex`, `align: 'auto'`) and its
// button takes focus, so focus follows the viewed row. At the first or
// last row nothing changes and the key is still taken, so the list does
// not scroll instead. The restored row on open is never scrolled to
// (story 3.6); only these keys scroll. Focus in the detail's tabs or body
// keeps the arrows for them (the registry's `OWN_ARROWS`); from its ‹ ›
// they still step.
//
// A held key repeats about 30 times a second. Focus and scroll follow
// every step at once, but while the key auto-repeats the URL is written at
// most once per `HASH_WRITE_GAP_MS` (the newest row when the gap ends; a
// new press always writes at once): each write is a router navigation and a `history.replaceState`,
// which Safari refuses past a rate, and each viewed row loads its detail.
// The waiting write goes out before any other key acts (so `[` `]` or a
// digit never act on an old hash), on a press, and when the window loses
// focus or is hidden (the keyup may never come).
// https://tanstack.com/virtual/v3/docs/api/virtualizer#scrolltoindex

export const HASH_WRITE_GAP_MS = 200

export interface ThrottledWrite {
  /** Writes now if no gap is open, else keeps `hash` for the gap's end. */
  write: (hash: string) => void
  /** Writes the kept hash now, if any, and closes the gap. */
  flush: () => void
  /** Drops the kept hash and closes the gap. */
  cancel: () => void
}

/** At most one write per `gapMs`: the first at once, the newest at the end. */
export function throttleWrites(
  write: (hash: string) => void,
  gapMs: number,
): ThrottledWrite {
  let timer: ReturnType<typeof setTimeout> | null = null
  let kept: string | null = null
  const openGap = () => {
    timer = setTimeout(() => {
      timer = null
      if (kept === null) return
      const next = kept
      kept = null
      write(next)
      openGap()
    }, gapMs)
  }
  const close = () => {
    if (timer !== null) clearTimeout(timer)
    timer = null
  }
  return {
    write: (hash) => {
      if (timer !== null) {
        kept = hash
        return
      }
      write(hash)
      openGap()
    },
    flush: () => {
      close()
      if (kept === null) return
      const next = kept
      kept = null
      write(next)
    },
    cancel: () => {
      close()
      kept = null
    },
  }
}

/** Provides `prevItem` and `nextItem` for the list while `enabled`. */
export function useArrowStepping({
  enabled,
  shown,
  viewed,
  setHash,
  scrollToIndex,
  listRef,
}: {
  enabled: boolean
  /** The order shown (frozen while the mouse rests on the list). */
  shown: ReadonlyArray<string>
  viewed: string | null
  setHash: (hash: string) => void
  scrollToIndex: (index: number) => void
  /** Holds the rows; each row's wrapper carries `data-hash`. */
  listRef: RefObject<HTMLElement | null>
}): void {
  const setHashRef = useRef(setHash)
  useLayoutEffect(() => {
    setHashRef.current = setHash
  })
  const [writes] = useState(() =>
    throttleWrites((hash) => setHashRef.current(hash), HASH_WRITE_GAP_MS),
  )
  /**
   * The row to focus once it is rendered (it may only appear after the
   * scroll), and what had focus at the press: focus moved anywhere else
   * since (`/` into the search box) cancels it.
   */
  const focusNextRef = useRef<{
    hash: string
    from: HTMLElement | null
  } | null>(null)
  /** The row last stepped to: the next step starts there until `viewed` catches up. */
  const steppedRef = useRef<string | null>(null)

  const focusPending = () => {
    const pending = focusNextRef.current
    if (pending === null) return
    const active = focusedElement()
    const focusStayed =
      active === null ||
      active === pending.from ||
      listRef.current?.contains(active) === true
    if (!focusStayed || !shown.includes(pending.hash)) {
      focusNextRef.current = null
      return
    }
    // The row's own button (`aria-current`), not story 4.1's checkbox
    // before it in the same wrapper.
    const button = listRef.current?.querySelector<HTMLButtonElement>(
      `[data-hash="${pending.hash}"] button[aria-current]`,
    )
    if (!button) return
    focusNextRef.current = null
    button.focus({ preventScroll: true })
  }

  const step = (by: -1 | 1) => {
    const stepped = steppedRef.current
    const from = stepped !== null && shown.includes(stepped) ? stepped : viewed
    const position = detailPosition(shown, from)
    if (position === null) return false
    const target = by < 0 ? position.prev : position.next
    if (target === null) return true
    focusNextRef.current = { hash: target, from: focusedElement() }
    steppedRef.current = target
    writes.write(target)
    scrollToIndex(position.index + by)
    // A row already rendered takes focus now; the URL may not move yet.
    focusPending()
    return true
  }
  useShortcutAction('prevItem', enabled ? () => step(-1) : null)
  useShortcutAction('nextItem', enabled ? () => step(1) : null)

  useLayoutEffect(() => {
    if (viewed === steppedRef.current) steppedRef.current = null
  }, [viewed])

  useEffect(() => {
    if (!enabled) return
    // Capture: the waiting write goes out before the registry's listener
    // runs the key's action.
    const forget = (event: Event) => {
      const keyboard = event instanceof KeyboardEvent ? event : null
      if (keyboard?.key === 'ArrowUp' || keyboard?.key === 'ArrowDown') {
        // A new press writes at once; only a held key's repeats wait.
        if (!keyboard.repeat) writes.flush()
        return
      }
      writes.flush()
      focusNextRef.current = null
      steppedRef.current = null
    }
    const onBlur = () => writes.flush()
    const onVisibility = () => {
      if (document.visibilityState === 'hidden') writes.flush()
    }
    document.addEventListener('keydown', forget, true)
    document.addEventListener('pointerdown', forget, true)
    window.addEventListener('blur', onBlur)
    document.addEventListener('visibilitychange', onVisibility)
    return () => {
      document.removeEventListener('keydown', forget, true)
      document.removeEventListener('pointerdown', forget, true)
      window.removeEventListener('blur', onBlur)
      document.removeEventListener('visibilitychange', onVisibility)
      // Not written: leaving the list (or the page) must not navigate back.
      writes.cancel()
    }
  }, [enabled, writes])

  useLayoutEffect(() => {
    focusPending()
  })
}
