import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import type {
  MouseEvent as ReactMouseEvent,
  PointerEvent as ReactPointerEvent,
  RefObject,
} from 'react'
import type { DragSample } from '#/shared/ui/sheet-snap'

// Story 2.2: the bottom sheet's drag gesture (src/shared/ui/bottom-sheet.tsx),
// pointer events only. A press becomes a drag, a scroll (`skip`) or a tap
// once it moves past the slop. Moves and the release are read on `window`
// from the press on: dragged up, the pointer leaves the sheet before the
// drag is decided (a mouse is not captured until then; a touch is captured
// to its target anyway). Each press adds its own listeners and removes them
// when it ends, so nothing outlives the gesture.
//
// Docs (AD-11): https://developer.mozilla.org/en-US/docs/Web/API/Element/setPointerCapture,
// https://developer.mozilla.org/en-US/docs/Web/CSS/touch-action

/** Movement before a press counts as a drag or a scroll, px. */
const DRAG_SLOP_PX = 6
/** Samples kept for the release speed. */
const MAX_SAMPLES = 20

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
 *
 * Safari has no direction keywords (MDN compat data for `touch-action`:
 * `pan-down` is not supported) and drops the assignment, which kept the
 * previous `none` and left the content unscrollable (epic 2 review). Without
 * `pan-down` scrollable content gets `pan-y`: a finger moving down at the
 * top is the browser's overscroll there, and the handle and title still
 * drag the sheet.
 */
export function bodyTouchAction({
  scrollTop,
  canScroll,
  panDown,
}: {
  scrollTop: number
  canScroll: boolean
  /** The browser knows `touch-action: pan-down`. */
  panDown: boolean
}): 'none' | 'pan-down' | 'pan-y' {
  if (!canScroll) return 'none'
  return scrollTop <= 0 && panDown ? 'pan-down' : 'pan-y'
}

export function supportsPanDown(): boolean {
  return (
    typeof CSS !== 'undefined' &&
    typeof CSS.supports === 'function' &&
    CSS.supports('touch-action', 'pan-down')
  )
}

/** What a finished drag hands back to the sheet. */
export interface DragRelease {
  /** Where the sheet was drawn when the drag caught it, px. */
  base: number
  /** The sheet was full screen when the press began. */
  expandedAtStart: boolean
  /** The pointer's path, the release included. */
  samples: ReadonlyArray<DragSample>
  /** The browser took the pointer (`pointercancel`): no release speed. */
  cancelled: boolean
}

export interface SheetDragOptions {
  sheetRef: RefObject<HTMLElement | null>
  bodyRef: RefObject<HTMLElement | null>
  /** No new press starts (the sheet is closing). */
  disabled: boolean
  isExpanded: () => boolean
  /** A drag starts: stop any motion and return where the sheet is drawn. */
  begin: () => number
  /** The drag moved the sheet to this offset, px. */
  move: (offset: number) => void
  release: (drag: DragRelease) => void
}

interface Gesture {
  pointerId: number
  startY: number
  inBody: boolean
  /** `skip`: moved past the slop as a scroll; its click is not a tap. */
  state: 'pending' | 'drag' | 'skip'
  base: number
  expandedAtStart: boolean
  samples: Array<DragSample>
  /** Removes this press's window listeners. */
  stop: () => void
}

export function useSheetDrag(options: SheetDragOptions) {
  const [dragging, setDragging] = useState(false)
  const gestureRef = useRef<Gesture | null>(null)
  const suppressClickRef = useRef(false)
  // The window listeners outlive the render that added them.
  const latest = useRef(options)
  useLayoutEffect(() => {
    latest.current = options
  })

  const finish = (gesture: Gesture) => {
    gesture.stop()
    if (gestureRef.current === gesture) gestureRef.current = null
    setDragging(false)
  }

  /** Drops the press in progress (the sheet started closing). */
  const cancel = () => {
    const gesture = gestureRef.current
    if (gesture) finish(gesture)
  }

  useEffect(() => () => gestureRef.current?.stop(), [])

  const onPointerDown = (event: ReactPointerEvent<HTMLElement>) => {
    if (options.disabled || !event.isPrimary) return
    if (event.pointerType === 'mouse' && event.button !== 0) return
    gestureRef.current?.stop()
    suppressClickRef.current = false

    const onMove = (move: PointerEvent) => {
      if (move.pointerId !== gesture.pointerId) return
      // The mouse button went up where we could not see it (window blur, a
      // context menu): the press is over.
      if (move.pointerType === 'mouse' && move.buttons === 0) {
        onEnd(move)
        return
      }
      if (gesture.state === 'skip') return
      const dy = move.clientY - gesture.startY
      if (gesture.state === 'pending') {
        if (Math.abs(dy) < DRAG_SLOP_PX) return
        const body = latest.current.bodyRef.current
        const drags = shouldDragSheet({
          inBody: gesture.inBody,
          dy,
          scrollTop: body?.scrollTop ?? 0,
          canScroll: body ? body.scrollHeight > body.clientHeight + 1 : false,
          expanded: latest.current.isExpanded(),
        })
        if (!drags) {
          // A scroll, not a drag; keep listening so its click can be dropped.
          gesture.state = 'skip'
          return
        }
        gesture.state = 'drag'
        setDragging(true)
        gesture.base = latest.current.begin()
        gesture.startY = move.clientY
        try {
          latest.current.sheetRef.current?.setPointerCapture(move.pointerId)
        } catch {
          // The pointer is already gone; the next move or up ends the drag.
        }
      }
      latest.current.move(
        Math.max(0, gesture.base + move.clientY - gesture.startY),
      )
      gesture.samples.push({ time: move.timeStamp, y: move.clientY })
      if (gesture.samples.length > MAX_SAMPLES) gesture.samples.shift()
    }

    const onEnd = (end: PointerEvent) => {
      if (end.pointerId !== gesture.pointerId) return
      finish(gesture)
      if (gesture.state === 'pending') return
      // The click that follows this release (same task) is not a tap.
      suppressClickRef.current = true
      setTimeout(() => (suppressClickRef.current = false), 0)
      if (gesture.state === 'skip') return
      gesture.samples.push({ time: end.timeStamp, y: end.clientY })
      latest.current.release({
        base: gesture.base,
        expandedAtStart: gesture.expandedAtStart,
        samples: gesture.samples,
        cancelled: end.type === 'pointercancel',
      })
    }

    const gesture: Gesture = {
      pointerId: event.pointerId,
      startY: event.clientY,
      inBody: options.bodyRef.current?.contains(event.target as Node) ?? false,
      state: 'pending',
      base: 0,
      expandedAtStart: options.isExpanded(),
      samples: [],
      stop: () => {
        window.removeEventListener('pointermove', onMove)
        window.removeEventListener('pointerup', onEnd)
        window.removeEventListener('pointercancel', onEnd)
      },
    }
    gestureRef.current = gesture
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onEnd)
    window.addEventListener('pointercancel', onEnd)
  }

  const onClickCapture = (event: ReactMouseEvent) => {
    if (!suppressClickRef.current) return
    suppressClickRef.current = false
    event.preventDefault()
    event.stopPropagation()
  }

  return {
    dragging,
    /** A drag (not a pending press or a scroll) is moving the sheet. */
    isDragging: () => gestureRef.current?.state === 'drag',
    cancel,
    onPointerDown,
    onClickCapture,
  }
}
