import { useCallback, useEffect, useLayoutEffect, useRef } from 'react'
import type { KeyboardEvent as ReactKeyboardEvent, RefObject } from 'react'
import { getMain } from '#/shared/ui/main-scroll'

// Story 2.2: what an open bottom sheet does to the page around it
// (APG dialog-modal): the page scroll is locked, everything outside the
// sheet is `inert`, focus stays inside (a `focusin` pull-back and Tab
// wrapping), Esc closes it wherever focus is, and on close focus goes back
// to the opener. One session per open; `end` undoes all of it at once, its
// listeners first, so giving focus back is not pulled into the sheet.
//
// Docs (AD-11): https://www.w3.org/WAI/ARIA/apg/patterns/dialog-modal/

const FOCUSABLE =
  'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'

/** Sets `overflow: hidden` through the CSSOM; returns the undo. */
function lockScroll(): () => void {
  const targets = [document.documentElement, document.body, getMain()].filter(
    (element): element is HTMLElement => element !== null,
  )
  const saved = targets.map((element) => element.style.overflow)
  for (const element of targets) element.style.overflow = 'hidden'
  return () => {
    targets.forEach((element, index) => {
      element.style.overflow = saved[index]
    })
  }
}

/**
 * Makes the page outside the sheet `inert` (hidden from screen readers and
 * focus): every top-level body child except `keep`, skipping ones that
 * already were. Returns the undo.
 */
function inertOthers(keep: ReadonlyArray<Element | null>): () => void {
  const changed = [...document.body.children].filter(
    (element) => !keep.includes(element) && !element.hasAttribute('inert'),
  )
  for (const element of changed) element.setAttribute('inert', '')
  return () => {
    for (const element of changed) element.removeAttribute('inert')
  }
}

/** Visible and in the document: a pill hidden at desktop width is not. */
function canTakeFocus(element: HTMLElement | null): element is HTMLElement {
  return (
    element !== null &&
    element.isConnected &&
    element.getClientRects().length > 0
  )
}

function focusables(root: HTMLElement): Array<HTMLElement> {
  return [...root.querySelectorAll<HTMLElement>(FOCUSABLE)]
}

export interface ModalSessionOptions {
  sheetRef: RefObject<HTMLElement | null>
  scrimRef: RefObject<HTMLElement | null>
  /** Esc was pressed. */
  onEscape: () => void
  /** Focused on close; by default what had focus when the session began. */
  returnFocus?: () => HTMLElement | null
}

export function useModalSession({
  sheetRef,
  scrimRef,
  onEscape,
  returnFocus,
}: ModalSessionOptions) {
  const latest = useRef({ onEscape, returnFocus })
  useLayoutEffect(() => {
    latest.current = { onEscape, returnFocus }
  })
  const undoRef = useRef<((restoreFocus: boolean) => void) | null>(null)

  /** Ends the session; `restoreFocus` gives focus back to the opener. */
  const end = useCallback((restoreFocus: boolean) => {
    const undo = undoRef.current
    undoRef.current = null
    undo?.(restoreFocus)
  }, [])

  /** Starts a session, unless one is on. */
  const begin = useCallback(() => {
    const sheet = sheetRef.current
    if (undoRef.current || !sheet) return
    const active = document.activeElement
    const returnTo = active instanceof HTMLElement ? active : null
    const unlockScroll = lockScroll()
    const restorePage = inertOthers([scrimRef.current, sheet])

    const onFocusIn = (event: FocusEvent) => {
      if (!(event.target instanceof Node) || sheet.contains(event.target)) {
        return
      }
      focusables(sheet)[0]?.focus({ preventScroll: true })
    }
    // On the document: a press on the handle leaves focus on the dialog
    // itself, or on body in some browsers.
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || event.defaultPrevented) return
      event.preventDefault()
      latest.current.onEscape()
    }
    document.addEventListener('focusin', onFocusIn)
    document.addEventListener('keydown', onKey)

    undoRef.current = (restoreFocus) => {
      document.removeEventListener('focusin', onFocusIn)
      document.removeEventListener('keydown', onKey)
      unlockScroll()
      restorePage()
      if (!restoreFocus) return
      const opener = latest.current.returnFocus?.() ?? returnTo
      const target = canTakeFocus(opener) ? opener : getMain()
      target?.focus({ preventScroll: true })
    }
  }, [sheetRef, scrimRef])

  // Unmounted while open: undo the lock without moving focus.
  useEffect(() => () => end(false), [end])

  /** Tab and Shift+Tab wrap inside the sheet. */
  const onKeyDown = (event: ReactKeyboardEvent<HTMLElement>) => {
    const sheet = sheetRef.current
    if (event.key !== 'Tab' || !sheet) return
    const list = focusables(sheet)
    if (list.length === 0) return
    const first = list[0]
    const last = list[list.length - 1]
    const active = document.activeElement
    if (event.shiftKey && (active === first || active === sheet)) {
      event.preventDefault()
      last.focus()
    } else if (!event.shiftKey && active === last) {
      event.preventDefault()
      first.focus()
    }
  }

  return { begin, end, onKeyDown }
}
