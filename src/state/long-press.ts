import { useEffect, useLayoutEffect, useState } from 'react'
import type {
  MouseEvent as ReactMouseEvent,
  PointerEvent as ReactPointerEvent,
} from 'react'
import { LONG_PRESS_MS, longPressStep } from '#/lib/long-press'

// Story 4.2 (EXPERIENCE 手機選取模式): the long press that starts phone
// selection, hand-written on pointer events (AR-7, no gesture library).
// A primary press (a touch, a pen, or a mouse's main button, so a narrow
// desktop window can try it too) arms a 500 ms timer and captures the
// pointer. It is cancelled by the release or `pointercancel` before then,
// by losing the capture (the phone board's swipe takes it), by any scroll
// (the browser took the finger), by moving more than 10px
// (src/lib/long-press.ts) and by unmounting. When it fires it calls
// `onFire`, buzzes once where `navigator.vibrate` exists, and swallows the
// `click` the release sends, so that click neither opens the row nor
// toggles it again. The system callout stays away: `contextmenu` is
// prevented while a press is pending or has just fired (the rows also use
// `-webkit-touch-callout: none` and `user-select: none`).
// Docs: https://developer.mozilla.org/en-US/docs/Web/API/Pointer_events,
// https://developer.mozilla.org/en-US/docs/Web/API/Element/setPointerCapture,
// https://developer.mozilla.org/en-US/docs/Web/API/Navigator/vibrate.

/** The buzz when a press fires, ms. */
export const LONG_PRESS_VIBRATE_MS = 10

/**
 * How long after the release the swallowed `click` may still come. The
 * browser sends it right after the release; a later one is a new tap
 * (every new press ends the swallow anyway).
 */
const CLICK_WINDOW_MS = 400

const CAPTURE = { capture: true } as const
const PASSIVE_CAPTURE = { capture: true, passive: true } as const

export interface LongPressHandlers {
  onPointerDown: (event: ReactPointerEvent<HTMLElement>) => void
  onPointerMove: (event: ReactPointerEvent<HTMLElement>) => void
  onPointerUp: (event: ReactPointerEvent<HTMLElement>) => void
  onPointerCancel: (event: ReactPointerEvent<HTMLElement>) => void
  onLostPointerCapture: (event: ReactPointerEvent<HTMLElement>) => void
  onContextMenu: (event: ReactMouseEvent<HTMLElement>) => void
}

interface Press {
  pointerId: number
  x: number
  y: number
  /** `performance.now()` at the press. */
  start: number
  timer: ReturnType<typeof setTimeout>
}

interface Swallow {
  pointerId: number
  end: () => void
  timer: ReturnType<typeof setTimeout> | undefined
}

function buzz(): void {
  try {
    if (typeof (navigator as Partial<Navigator>).vibrate === 'function') {
      navigator.vibrate(LONG_PRESS_VIBRATE_MS)
    }
  } catch {
    // A browser that refuses (no user gesture yet, a policy) changes nothing.
  }
}

/** One target's press. Browser only. */
class LongPress {
  enabled = false
  onFire: () => void = () => {}
  private press: Press | null = null
  private swallow: Swallow | null = null

  readonly handlers: LongPressHandlers = {
    onPointerDown: (event) => this.down(event),
    onPointerMove: (event) => this.move(event),
    onPointerUp: (event) => this.up(event),
    onPointerCancel: (event) => {
      if (this.press?.pointerId === event.pointerId) this.cancel()
      // The browser took the pointer: no click follows.
      if (this.swallow?.pointerId === event.pointerId) this.swallow.end()
    },
    onLostPointerCapture: (event) => {
      if (this.press?.pointerId === event.pointerId) this.cancel()
      // After firing, another element (the board's swipe) took the pointer:
      // this target never sees the release, so end the swallow as if it had.
      this.endSwallowSoon(event.pointerId)
    },
    onContextMenu: (event) => {
      if (this.press !== null || this.swallow !== null) event.preventDefault()
    },
  }

  private readonly onScroll = () => this.cancel()

  setEnabled(enabled: boolean): void {
    this.enabled = enabled
    // A press that already fired keeps swallowing its click.
    if (!enabled) this.cancel()
  }

  dispose(): void {
    this.cancel()
    this.swallow?.end()
  }

  private down(event: ReactPointerEvent<HTMLElement>): void {
    if (!this.enabled || !event.isPrimary) return
    if (event.pointerType === 'mouse' && event.button !== 0) return
    this.cancel()
    const target = event.currentTarget
    try {
      target.setPointerCapture(event.pointerId)
    } catch {
      // No capture (an old browser, a test DOM): the release still ends it.
    }
    this.press = {
      pointerId: event.pointerId,
      x: event.clientX,
      y: event.clientY,
      start: performance.now(),
      timer: setTimeout(() => this.fire(), LONG_PRESS_MS),
    }
    window.addEventListener('scroll', this.onScroll, PASSIVE_CAPTURE)
  }

  private move(event: ReactPointerEvent<HTMLElement>): void {
    const press = this.press
    if (!press || press.pointerId !== event.pointerId) return
    const step = longPressStep({
      elapsedMs: performance.now() - press.start,
      dx: event.clientX - press.x,
      dy: event.clientY - press.y,
    })
    if (step === 'cancel') this.cancel()
    // The timer is late (a busy main thread): the time is up all the same.
    else if (step === 'fire') this.fire()
  }

  private up(event: ReactPointerEvent<HTMLElement>): void {
    if (this.press?.pointerId === event.pointerId) this.cancel()
    this.endSwallowSoon(event.pointerId)
  }

  /** The fired press's pointer let go here: its click may still come, briefly. */
  private endSwallowSoon(pointerId: number): void {
    const swallow = this.swallow
    if (swallow?.pointerId === pointerId && swallow.timer === undefined) {
      swallow.timer = setTimeout(swallow.end, CLICK_WINDOW_MS)
    }
  }

  /** Drops a pending press; one that fired is already gone. */
  private cancel(): void {
    const press = this.press
    if (!press) return
    this.press = null
    clearTimeout(press.timer)
    window.removeEventListener('scroll', this.onScroll, PASSIVE_CAPTURE)
  }

  private fire(): void {
    const press = this.press
    if (!press) return
    this.cancel()
    this.swallowClick(press.pointerId)
    this.onFire()
    buzz()
  }

  /**
   * Swallows the next `click` anywhere, in the capture phase on `window`
   * (before React's root listener). It ends with that click, with the
   * next press anywhere, or a short while after the release.
   */
  private swallowClick(pointerId: number): void {
    this.swallow?.end()
    function onClick(event: MouseEvent) {
      event.preventDefault()
      event.stopPropagation()
      swallow.end()
    }
    const swallow: Swallow = {
      pointerId,
      timer: undefined,
      end: () => {
        window.removeEventListener('click', onClick, CAPTURE)
        window.removeEventListener('pointerdown', swallow.end, CAPTURE)
        clearTimeout(swallow.timer)
        if (this.swallow === swallow) this.swallow = null
      },
    }
    this.swallow = swallow
    window.addEventListener('click', onClick, CAPTURE)
    window.addEventListener('pointerdown', swallow.end, CAPTURE)
  }
}

/**
 * Pointer handlers for one target (stable across renders). A press fires
 * `onFire` (the latest one) after 500 ms; only while `enabled`.
 */
export function useLongPress({
  enabled,
  onFire,
}: {
  enabled: boolean
  onFire: () => void
}): LongPressHandlers {
  const [press] = useState(() => new LongPress())
  useLayoutEffect(() => {
    press.onFire = onFire
  })
  useLayoutEffect(() => {
    press.setEnabled(enabled)
  }, [press, enabled])
  useEffect(() => () => press.dispose(), [press])
  return press.handlers
}
