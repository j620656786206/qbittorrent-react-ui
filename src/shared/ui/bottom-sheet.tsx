import {
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
} from 'react'
import type { ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { X } from 'lucide-react'
import { cn } from '#/shared/ui/cn'
import {
  bodyTouchAction,
  supportsPanDown,
  useSheetDrag,
} from '#/shared/ui/sheet-drag'
import type { DragRelease } from '#/shared/ui/sheet-drag'
import { useModalSession } from '#/shared/ui/sheet-session'
import {
  releaseVelocity,
  settleSheet,
  sheetRestHeight,
} from '#/shared/ui/sheet-snap'
import type { SheetMode } from '#/shared/ui/sheet-snap'

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
// This file owns the open, close and settle motion and the measuring. The
// gesture is src/shared/ui/sheet-drag.ts, the page around an open sheet
// (scroll lock, inert, focus, Esc) src/shared/ui/sheet-session.ts, and
// where a release settles src/shared/ui/sheet-snap.ts. Holding the torrent
// list's order while a sheet is open is the caller's job
// (`useSheetOrderHold` in src/state/order-freeze.ts).
//
// CSP (AD-10, no style-src): no `<style>` element is ever added. Inline
// styles are set through the CSSOM (React `style`, `element.style`,
// `element.animate`), which the policy does not cover; this route renders
// only in the browser (`ssr: false`), so no `style=` attribute is served.

/** Mockup `sheet`: 0.55 s from translateY(60%). Release and close reuse it. */
export const SHEET_MOTION_MS = 550
export const SHEET_EASING = 'cubic-bezier(.2,.85,.25,1)'
/** The share of the sheet's height it starts below its rest position. */
export const SHEET_START_SHARE = 0.6
/** Mockup `fade` on the scrim: 0.2 s ease-out. */
export const SCRIM_FADE_MS = 200

function prefersReducedMotion(): boolean {
  return (
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches
  )
}

const translate = (px: number) => `translate3d(0, ${px}px, 0)`

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
  const titleId = useId()
  const [present, setPresent] = useState(open)
  const [closing, setClosing] = useState(false)
  const [expanded, setExpanded] = useState(false)
  const [restOffset, setRestOffset] = useState(0)
  const [openedSeq, setOpenedSeq] = useState(0)

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
  /** Drawn since the last close finished: a new open is then a reopen. */
  const shownRef = useRef(false)
  const pendingOpenedRef = useRef(false)
  const panDownRef = useRef<boolean | null>(null)

  // The latest props for effects that must not re-run when they change.
  const propsRef = useRef({ onOpenChange, initialFocus, onOpened })
  useLayoutEffect(() => {
    propsRef.current = { onOpenChange, initialFocus, onOpened }
  })

  const close = () => propsRef.current.onOpenChange(false)

  const session = useModalSession({
    sheetRef,
    scrimRef,
    onEscape: close,
    returnFocus,
  })

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
    panDownRef.current ??= supportsPanDown()
    body.style.touchAction = bodyTouchAction({
      scrollTop: body.scrollTop,
      canScroll: body.scrollHeight > body.clientHeight + 1,
      panDown: panDownRef.current,
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
    const rest = sheetRestHeight(mode, content, viewport)
    metricsRef.current = { viewport, rest }
    const offset = Math.max(0, Math.round(viewport - rest))
    setRestOffset(offset)
    return offset
  }, [mode])

  const setFullScreen = (on: boolean) => {
    expandedRef.current = on
    setExpanded(on)
  }

  const onRelease = ({
    base,
    expandedAtStart,
    samples,
    cancelled,
  }: DragRelease) => {
    const { viewport, rest } = metricsRef.current
    const restAt = Math.max(0, Math.round(viewport - rest))
    const from = offsetRef.current
    const snap = settleSheet({
      mode,
      expanded: expandedAtStart,
      restHeight: rest,
      viewportHeight: viewport,
      // A drag caught mid slide (still below its rest) counts from where it
      // was caught, not from the rest position.
      distance: from - (expandedAtStart ? 0 : Math.max(base, restAt)),
      velocity: cancelled ? 0 : releaseVelocity(samples),
    })
    if (snap === 'close') {
      close()
      return
    }
    const toFull = snap === 'full' && mode !== 'full'
    setFullScreen(toFull)
    animate(from, toFull ? 0 : restAt)
  }

  const drag = useSheetDrag({
    sheetRef,
    bodyRef,
    disabled: closing,
    isExpanded: () => expandedRef.current,
    begin: () => {
      const base = currentOffset()
      stopAnimation()
      setOffset(base)
      return base
    },
    move: setOffset,
    release: onRelease,
  })

  // Open (first time or while closing) and close. Only `open` and `present`
  // drive it; a `mode` change while open is picked up by the size observer
  // below, which re-subscribes and measures again.
  useLayoutEffect(() => {
    if (!present) return
    const sheet = sheetRef.current
    if (!sheet) return
    if (open) {
      setClosing(false)
      session.begin()
      const offset = measure()
      const rest = metricsRef.current.rest
      // A fresh open rests at the mode's height, even if it closed from
      // full screen.
      setFullScreen(false)
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
    drag.cancel()
    session.end(true)
    fadeScrim(false)
    animate(currentOffset(), metricsRef.current.viewport, () => {
      shownRef.current = false
      setPresent(false)
      setClosing(false)
      setFullScreen(false)
    })
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
      if (!open || drag.isDragging()) return
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

  // Unmounted: no motion left running, and a later mount opens fresh (React
  // StrictMode remounts once in development).
  useEffect(
    () => () => {
      stopAnimation()
      shownRef.current = false
    },
    [stopAnimation],
  )

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
          drag.dragging && 'select-none',
          fullScreen
            ? 'rounded-none pt-[env(safe-area-inset-top)]'
            : 'rounded-t-sheet',
        )}
        style={{ paddingBottom: fullScreen ? 0 : restOffset }}
        onKeyDown={session.onKeyDown}
        onPointerDown={drag.onPointerDown}
        onClickCapture={drag.onClickCapture}
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
