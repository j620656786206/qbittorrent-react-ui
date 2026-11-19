// Story 4.2 (epic 4 「手機長按 0.5 秒進入選取」): when a finger held on a
// phone row or card becomes a long press. It fires once the press has
// lasted 500 ms; before then, moving more than 10px (straight-line
// distance) from where it started cancels it, because that finger is
// scrolling. The pointer handling around it is src/state/long-press.ts.

/** How long a press must last to fire. */
export const LONG_PRESS_MS = 500

/** How far the pointer may wander before the press counts as a scroll. */
export const LONG_PRESS_SLOP_PX = 10

export type LongPressStep = 'wait' | 'fire' | 'cancel'

/** The press `elapsedMs` after it started, `dx` `dy` px from its start. */
export function longPressStep({
  elapsedMs,
  dx,
  dy,
}: {
  elapsedMs: number
  dx: number
  dy: number
}): LongPressStep {
  if (elapsedMs >= LONG_PRESS_MS) return 'fire'
  if (Math.hypot(dx, dy) > LONG_PRESS_SLOP_PX) return 'cancel'
  return 'wait'
}
