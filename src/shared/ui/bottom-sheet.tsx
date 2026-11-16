import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
} from 'react'
import type {
  KeyboardEvent as ReactKeyboardEvent,
  PointerEvent as ReactPointerEvent,
  ReactNode,
} from 'react'
import { createPortal } from 'react-dom'
import { X } from 'lucide-react'
import type { DragSample, SheetMode, SheetRuntime } from '#/shared/sheet'
import { cn } from '#/shared/ui/cn'
import { getMain } from '#/shared/ui/main-scroll'

// Story 2.2, UX-DR49, DESIGN bottom-sheet (mockup S03-sort-sheet-phone): the
// one phone container (sort now; detail, delete, add, path later). No shadcn
// `Sheet` and no gesture or animation package: pointer events and the Web
// Animations API, `transform` and `opacity` only.
//
// Layout: the sheet is a fixed box as tall as the screen (`h-dvh`), moved
// down with `translateY` so only its top `rest height` shows. Its bottom
// padding equals that offset, so the content's scrollport ends at the
// screen's bottom edge. A drag changes only the transform (no layout per
// frame); padding and corners change once, when the sheet settles. Dragged
// up it is the whole screen: offset 0, corners 0, the top safe area as
// padding, the handle stays.
//
// Where a release settles, the rest height and the release speed come from
// `SheetRuntime` (src/lib/sheet-snap.ts), and an open sheet holds the list
// order (src/state/order-freeze.ts): src/shared may not import those
// layers, so src/router.tsx provides them through `SheetRuntimeContext`.
//
// CSP (AD-10, no style-src): no `<style>` element is ever added. Inline
// styles are set through the CSSOM (React `style`, `element.style`,
// `element.animate`), which the policy does not cover; this route renders
// only in the browser (`ssr: false`), so no `style=` attribute is served.
//
// Docs (AD-11): https://developer.mozilla.org/en-US/docs/Web/API/Element/setPointerCapture,
// https://developer.mozilla.org/en-US/docs/Web/CSS/touch-action,
// https://www.w3.org/WAI/ARIA/apg/patterns/dialog-modal/

export const SheetRuntimeContext = createContext<SheetRuntime | null>(null)

/** Mockup `sheet`: 0.55 s from translateY(60%). Release and close reuse it. */
export const SHEET_MOTION_MS = 550
export const SHEET_EASING = 'cubic-bezier(.2,.85,.25,1)'
/** The share of the sheet's height it starts below its rest position. */
export const SHEET_START_SHARE = 0.6
/** Mockup `fade` on the scrim: 0.2 s ease-out. */
export const SCRIM_FADE_MS = 200
/** Movement before a press counts as a drag or a scroll, px. */
const DRAG_SLOP_PX = 6

const FOCUSABLE =
  'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'

export interface DragStart {
  /** The press began in the scrolling content (not the handle or title). */
  inBody: boolean
  /** px moved since the press; positive is down. */
  dy: number
  scrollTop: number
  /** The content is taller than its scrollport. */
  canScroll: boolean
  /** The sheet is full screen. */
  expanded: boolean
}

/**
 * Whether a press that moved past the slop drags the sheet. The handle and
 * title always do. In the content: down only from the top of the scroll (it
 * scrolls otherwise), up only while nothing scrolls and the sheet is not
 * full screen yet.
 */
export function shouldDragSheet({
  inBody,
  dy,
  scrollTop,
  canScroll,
  expanded,
}: DragStart): boolean {
  if (!inBody) return true
  if (dy > 0) return scrollTop <= 0
  return !canScroll && !expanded
}

/**
 * The content's `touch-action`, read by the browser when a touch starts:
 * where `shouldDragSheet` drags, the browser must not pan (it would send
 * `pointercancel`). At the top only scrolling down (a finger moving up)
 * stays native, so a finger moving down drags the sheet.
 */
export function bodyTouchAction({
  scrollTop,
  canScroll,
}: {
  scrollTop: number
  canScroll: boolean
}): 'none' | 'pan-down' | 'pan-y' {
  if (!canScroll) return 'none'
  return scrollTop <= 0 ? 'pan-down' : 'pan-y'
}

function prefersReducedMotion(): boolean {
  return (
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches
  )
}

const translate = (px: number) => `translate3d(0, ${px}px, 0)`

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

const missing = (): never => {
  throw new Error('BottomSheet needs SheetRuntimeContext (src/router.tsx)')
}

/** Throws on first use: a closed sheet renders nothing and needs none. */
const MISSING_RUNTIME: SheetRuntime = {
  restHeight: missing,
  settle: missing,
  releaseVelocity: missing,
  holdOrder: missing,
}

export interface BottomSheetProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** The visible title; it also names the dialog. */
  title: string
  mode?: SheetMode
  children: ReactNode
  /** Focused when the sheet opens; the ✕ when this returns `null`. */
  initialFocus?: () => HTMLElement | null
  /** Focused when it closes; by default what had focus when it opened. */
  returnFocus?: () => HTMLElement | null
  /** After the sheet is laid out on open, with its scrolling content. */
  onOpened?: (content: HTMLElement) => void
}

interface Drag {
  pointerId: number
  startY: number
  inBody: boolean
  /** `skip`: moved past the slop as a scroll; its click is not a tap. */
  state: 'pending' | 'drag' | 'skip'
  base: number
  expandedAtStart: boolean
  samples: Array<DragSample>
}

interface Session {
  releaseOrder: () => void
  unlockScroll: () => void
  restorePage: () => void
  returnTo: HTMLElement | null
}

export function BottomSheet({
  open,
  onOpenChange,
  title,
  mode = 'fit',
  children,
  initialFocus,
  returnFocus,
  onOpened,
}: BottomSheetProps) {
  const runtime = useContext(SheetRuntimeContext) ?? MISSING_RUNTIME
  const titleId = useId()
  const [present, setPresent] = useState(open)
  const [closing, setClosing] = useState(false)
  const [expanded, setExpanded] = useState(false)
  const [restOffset, setRestOffset] = useState(0)
  const [openedSeq, setOpenedSeq] = useState(0)
  const [dragging, setDragging] = useState(false)

  const scrimRef = useRef<HTMLDivElement>(null)
  const sheetRef = useRef<HTMLDivElement>(null)
  const headRef = useRef<HTMLDivElement>(null)
  const bodyRef = useRef<HTMLDivElement>(null)
  const innerRef = useRef<HTMLDivElement>(null)
  const closeRef = useRef<HTMLButtonElement>(null)

  const offsetRef = useRef(0)
  const metricsRef = useRef({ viewport: 0, rest: 0 })
  const expandedRef = useRef(false)
  const animationRef = useRef<Animation | null>(null)
  const scrimAnimationRef = useRef<Animation | null>(null)
  const dragRef = useRef<Drag | null>(null)
  const suppressClickRef = useRef(false)
  const sessionRef = useRef<Session | null>(null)
  const shownRef = useRef(false)
  const pendingOpenedRef = useRef(false)

  // The latest props for effects that must not re-run when they change.
  const propsRef = useRef({ onOpenChange, initialFocus, returnFocus, onOpened })
  useLayoutEffect(() => {
    propsRef.current = { onOpenChange, initialFocus, returnFocus, onOpened }
  })

  const trapRef = useRef(false)

  const fullScreen = expanded || mode === 'full'

  // Mounted from the render that opens it, kept through the close slide.
  if (open && !present) setPresent(true)

  const setOffset = useCallback((px: number) => {
    offsetRef.current = px
    const sheet = sheetRef.current
    if (sheet) sheet.style.transform = translate(px)
  }, [])

  /** Where the sheet is drawn now, mid-animation included. */
  const currentOffset = useCallback((): number => {
    const sheet = sheetRef.current
    const running = animationRef.current
    if (!sheet || !running || typeof DOMMatrixReadOnly === 'undefined') {
      return offsetRef.current
    }
    const transform = getComputedStyle(sheet).transform
    if (!transform || transform === 'none') return offsetRef.current
    return new DOMMatrixReadOnly(transform).m42
  }, [])

  const stopAnimation = useCallback(() => {
    const running = animationRef.current
    animationRef.current = null
    running?.cancel()
  }, [])

  /** Moves from `from` to `to` (jumps under reduced motion), then `done`. */
  const animate = useCallback(
    (from: number, to: number, done?: () => void) => {
      const sheet = sheetRef.current
      stopAnimation()
      setOffset(to)
      if (
        !sheet ||
        from === to ||
        prefersReducedMotion() ||
        typeof sheet.animate !== 'function'
      ) {
        done?.()
        return
      }
      const animation = sheet.animate(
        [{ transform: translate(from) }, { transform: translate(to) }],
        { duration: SHEET_MOTION_MS, easing: SHEET_EASING },
      )
      animationRef.current = animation
      animation.onfinish = () => {
        if (animationRef.current === animation) animationRef.current = null
        done?.()
      }
    },
    [setOffset, stopAnimation],
  )

  const fadeScrim = useCallback((show: boolean) => {
    const scrim = scrimRef.current
    // A fade-out still holding its end state must not outlive a reopen.
    scrimAnimationRef.current?.cancel()
    scrimAnimationRef.current = null
    if (!scrim || prefersReducedMotion() || typeof scrim.animate !== 'function')
      return
    // Fading out holds the end state until the sheet unmounts.
    scrimAnimationRef.current = scrim.animate(
      [{ opacity: show ? 0 : 1 }, { opacity: show ? 1 : 0 }],
      {
        duration: SCRIM_FADE_MS,
        easing: 'ease-out',
        fill: show ? 'none' : 'forwards',
      },
    )
  }, [])

  const updateTouchAction = useCallback(() => {
    const body = bodyRef.current
    if (!body) return
    body.style.touchAction = bodyTouchAction({
      scrollTop: body.scrollTop,
      canScroll: body.scrollHeight > body.clientHeight + 1,
    })
  }, [])

  /** Measures the rest height; returns the rest offset. */
  const measure = useCallback((): number => {
    const sheet = sheetRef.current
    const head = headRef.current
    const inner = innerRef.current
    if (!sheet || !head || !inner) return 0
    const viewport = sheet.offsetHeight
    const content = head.offsetHeight + inner.offsetHeight
    const rest = runtime.restHeight(mode, content, viewport)
    metricsRef.current = { viewport, rest }
    const offset = Math.max(0, Math.round(viewport - rest))
    setRestOffset(offset)
    return offset
  }, [runtime, mode])

  const endSession = useCallback((restore: boolean) => {
    const session = sessionRef.current
    if (!session) return
    sessionRef.current = null
    session.releaseOrder()
    session.unlockScroll()
    session.restorePage()
    if (!restore) return
    const opener = propsRef.current.returnFocus?.() ?? session.returnTo
    const target = canTakeFocus(opener) ? opener : getMain()
    target?.focus({ preventScroll: true })
  }, [])

  // Open (first time or while closing) and close.
  useLayoutEffect(() => {
    if (!present) return
    const sheet = sheetRef.current
    if (!sheet) return
    if (open) {
      setClosing(false)
      trapRef.current = true
      if (!sessionRef.current) {
        const active = document.activeElement
        sessionRef.current = {
          releaseOrder: runtime.holdOrder(),
          unlockScroll: lockScroll(),
          restorePage: inertOthers([scrimRef.current, sheet]),
          returnTo: active instanceof HTMLElement ? active : null,
        }
      }
      const offset = measure()
      const rest = metricsRef.current.rest
      // A fresh open rests at the mode's height, even if it closed from
      // full screen.
      expandedRef.current = false
      setExpanded(false)
      if (!shownRef.current) {
        shownRef.current = true
        animate(offset + rest * SHEET_START_SHARE, offset)
      } else {
        // Reopened during the close slide: back up from where it is.
        animate(currentOffset(), offset)
      }
      fadeScrim(true)
      // Either way a fresh open: the caller's scroll and the first focus.
      pendingOpenedRef.current = true
      setOpenedSeq((seq) => seq + 1)
      updateTouchAction()
      return
    }
    // Closing: give focus back at once, slide out, then unmount.
    setClosing(true)
    trapRef.current = false
    dragRef.current = null
    setDragging(false)
    endSession(true)
    fadeScrim(false)
    animate(currentOffset(), metricsRef.current.viewport, () => {
      shownRef.current = false
      setPresent(false)
      setClosing(false)
      expandedRef.current = false
      setExpanded(false)
    })
    // Only `open` and `present` drive it; the helpers are stable for one
    // mode and runtime.
  }, [open, present])

  // After the first layout on open (padding applied): the caller's scroll,
  // then the first focus.
  useLayoutEffect(() => {
    if (!pendingOpenedRef.current) return
    const body = bodyRef.current
    const sheet = sheetRef.current
    if (!body || !sheet) return
    pendingOpenedRef.current = false
    propsRef.current.onOpened?.(body)
    updateTouchAction()
    const first = propsRef.current.initialFocus?.() ?? closeRef.current
    first?.focus({ preventScroll: true })
  }, [openedSeq, updateTouchAction])

  // Content or screen size changes: new rest height (更多 expanding).
  useEffect(() => {
    if (!present) return
    const sheet = sheetRef.current
    const inner = innerRef.current
    if (!sheet || !inner || typeof ResizeObserver === 'undefined') return
    const observer = new ResizeObserver(() => {
      if (!open || dragRef.current?.state === 'drag') return
      // Compare with where the sheet is going, so the first callback (on
      // observe, mid open slide) does not restart the slide.
      const target = offsetRef.current
      const offset = measure()
      if (!expandedRef.current && Math.abs(target - offset) >= 1) {
        animate(currentOffset(), offset)
      }
      updateTouchAction()
    })
    observer.observe(sheet)
    observer.observe(inner)
    return () => observer.disconnect()
  }, [present, open, measure, animate, currentOffset, updateTouchAction])

  // Focus stays inside while open (APG dialog-modal).
  useEffect(() => {
    if (!present || closing) return
    const onFocusIn = (event: FocusEvent) => {
      const sheet = sheetRef.current
      if (!trapRef.current || !sheet || !(event.target instanceof Node)) return
      if (sheet.contains(event.target)) return
      const [first] = focusables(sheet) as Array<HTMLElement | undefined>
      ;(first ?? closeRef.current)?.focus({ preventScroll: true })
    }
    document.addEventListener('focusin', onFocusIn)
    return () => document.removeEventListener('focusin', onFocusIn)
  }, [present, closing])

  // Esc closes it wherever focus is (a press on the handle leaves focus on
  // the dialog itself, or on body in some browsers).
  useEffect(() => {
    if (!present || closing) return
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || event.defaultPrevented) return
      event.preventDefault()
      propsRef.current.onOpenChange(false)
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [present, closing])

  // Unmounted while open: undo the lock and the freeze.
  useEffect(
    () => () => {
      stopAnimation()
      endSession(false)
    },
    [stopAnimation, endSession],
  )

  const close = () => propsRef.current.onOpenChange(false)

  const onKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    if (event.key !== 'Tab' || !sheetRef.current) return
    const list = focusables(sheetRef.current)
    if (list.length === 0) return
    const first = list[0]
    const last = list[list.length - 1]
    const active = document.activeElement
    if (event.shiftKey && (active === first || active === sheetRef.current)) {
      event.preventDefault()
      last.focus()
    } else if (!event.shiftKey && active === last) {
      event.preventDefault()
      first.focus()
    }
  }

  // Moves and the release are read on `window` from the press on: dragged
  // up, the pointer leaves the sheet before the drag is decided (a mouse is
  // not captured until then; a touch is captured to its target anyway).
  const windowHandlersRef = useRef({
    move: (_event: PointerEvent) => {},
    end: (_event: PointerEvent) => {},
  })
  const windowListeners = useRef({
    move: (event: PointerEvent) => windowHandlersRef.current.move(event),
    end: (event: PointerEvent) => windowHandlersRef.current.end(event),
  }).current
  const listenOnWindow = useCallback(
    (on: boolean) => {
      if (on) {
        window.addEventListener('pointermove', windowListeners.move)
        window.addEventListener('pointerup', windowListeners.end)
        window.addEventListener('pointercancel', windowListeners.end)
      } else {
        window.removeEventListener('pointermove', windowListeners.move)
        window.removeEventListener('pointerup', windowListeners.end)
        window.removeEventListener('pointercancel', windowListeners.end)
      }
    },
    [windowListeners],
  )
  useEffect(() => () => listenOnWindow(false), [listenOnWindow])

  const onPointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (closing || !event.isPrimary) return
    if (event.pointerType === 'mouse' && event.button !== 0) return
    const target = event.target as Node
    suppressClickRef.current = false
    dragRef.current = {
      pointerId: event.pointerId,
      startY: event.clientY,
      inBody: bodyRef.current?.contains(target) ?? false,
      state: 'pending',
      base: 0,
      expandedAtStart: expandedRef.current,
      samples: [],
    }
    listenOnWindow(true)
  }

  const onPointerMove = (event: PointerEvent) => {
    const drag = dragRef.current
    if (!drag || drag.pointerId !== event.pointerId) return
    // The mouse button went up where we could not see it (window blur, a
    // context menu): the press is over.
    if (event.pointerType === 'mouse' && event.buttons === 0) {
      endDrag(event)
      return
    }
    if (drag.state === 'skip') return
    const dy = event.clientY - drag.startY
    if (drag.state === 'pending') {
      if (Math.abs(dy) < DRAG_SLOP_PX) return
      const body = bodyRef.current
      const drags = shouldDragSheet({
        inBody: drag.inBody,
        dy,
        scrollTop: body?.scrollTop ?? 0,
        canScroll: body ? body.scrollHeight > body.clientHeight + 1 : false,
        expanded: expandedRef.current,
      })
      if (!drags) {
        // A scroll, not a drag; keep listening so its click can be dropped.
        drag.state = 'skip'
        return
      }
      drag.state = 'drag'
      setDragging(true)
      drag.base = currentOffset()
      drag.startY = event.clientY
      stopAnimation()
      setOffset(drag.base)
      try {
        sheetRef.current?.setPointerCapture(event.pointerId)
      } catch {
        // The pointer is already gone; the next move or up ends the drag.
      }
    }
    setOffset(Math.max(0, drag.base + event.clientY - drag.startY))
    drag.samples.push({ time: event.timeStamp, y: event.clientY })
    if (drag.samples.length > 20) drag.samples.shift()
  }

  const endDrag = (event: PointerEvent) => {
    const drag = dragRef.current
    if (!drag) {
      listenOnWindow(false)
      return
    }
    if (drag.pointerId !== event.pointerId) return
    dragRef.current = null
    listenOnWindow(false)
    setDragging(false)
    if (drag.state === 'pending') return
    // The click that follows this release (same task) is not a tap.
    suppressClickRef.current = true
    setTimeout(() => (suppressClickRef.current = false), 0)
    if (drag.state === 'skip') return
    drag.samples.push({ time: event.timeStamp, y: event.clientY })
    const { viewport, rest } = metricsRef.current
    const restAt = Math.max(0, Math.round(viewport - rest))
    const from = offsetRef.current
    const snap = runtime.settle({
      mode,
      expanded: drag.expandedAtStart,
      restHeight: rest,
      viewportHeight: viewport,
      // A drag caught mid slide (still below its rest) counts from where it
      // was caught, not from the rest position.
      distance: from - (drag.expandedAtStart ? 0 : Math.max(drag.base, restAt)),
      velocity:
        event.type === 'pointercancel'
          ? 0
          : runtime.releaseVelocity(drag.samples),
    })
    if (snap === 'close') {
      close()
      return
    }
    const toFull = snap === 'full' && mode !== 'full'
    expandedRef.current = toFull
    setExpanded(toFull)
    animate(from, toFull ? 0 : restAt)
  }

  useLayoutEffect(() => {
    windowHandlersRef.current = { move: onPointerMove, end: endDrag }
  })

  if (!present) return null

  return createPortal(
    <>
      <div
        ref={scrimRef}
        aria-hidden="true"
        data-slot="bottom-sheet-scrim"
        className={cn(
          'fixed inset-0 z-50 touch-none bg-scrim-sheet',
          closing && 'pointer-events-none',
        )}
        onClick={close}
      />
      <div
        ref={sheetRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        inert={closing || undefined}
        data-slot="bottom-sheet"
        data-state={closing ? 'closing' : 'open'}
        data-full-screen={fullScreen || undefined}
        className={cn(
          'fixed inset-x-0 top-0 z-50 flex h-dvh flex-col bg-surface text-text shadow-sheet',
          dragging && 'select-none',
          fullScreen
            ? 'rounded-none pt-[env(safe-area-inset-top)]'
            : 'rounded-t-sheet',
        )}
        style={{ paddingBottom: fullScreen ? 0 : restOffset }}
        onKeyDown={onKeyDown}
        onPointerDown={onPointerDown}
        onClickCapture={(event) => {
          if (!suppressClickRef.current) return
          suppressClickRef.current = false
          event.preventDefault()
          event.stopPropagation()
        }}
      >
        <div ref={headRef} className="flex-none touch-none select-none">
          <div aria-hidden="true" className="flex h-5 justify-center pt-2">
            <span className="block h-[5px] w-11 rounded-full bg-border" />
          </div>
          <div className="flex items-center gap-2 pr-3 pb-1 pl-5">
            <h2
              id={titleId}
              className="m-0 flex-1 text-[16px] leading-[1.2] font-bold"
            >
              {title}
            </h2>
            <button
              ref={closeRef}
              type="button"
              aria-label="關閉"
              onClick={close}
              className="inline-flex size-11 flex-none items-center justify-center rounded-full border bg-surface text-text hover-outline"
            >
              <X size={18} strokeWidth={2.4} aria-hidden="true" />
            </button>
          </div>
        </div>
        <div
          ref={bodyRef}
          data-slot="bottom-sheet-content"
          className="min-h-0 flex-1 overflow-y-auto overscroll-contain"
          onScroll={updateTouchAction}
        >
          <div ref={innerRef} className="pb-[env(safe-area-inset-bottom)]">
            {children}
          </div>
        </div>
      </div>
    </>,
    document.body,
  )
}
