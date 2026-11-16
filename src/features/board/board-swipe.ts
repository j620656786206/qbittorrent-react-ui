// Story 2.3: the phone board's swipe between its four columns, pure. The
// track (status-tabs.tsx) reads pointer events and moves with `transform`;
// these decide. Same ideas as the bottom sheet's drag (a slop before the
// gesture counts, a flick by velocity), its own numbers (Claude 代決, spec
// 2.3 Design Notes):
// - The swipe is horizontal only once the finger moved past the slop more
//   sideways than up or down; vertical first is a scroll and never a swipe
//   (the panels are `touch-action: pan-y`, so the browser scrolls them and
//   cancels the pointer).
// - Released past 25% of the width, or flicked faster than 0.5 px/ms, it
//   moves one column that way; a flick back the other way keeps the column; never past the first or last column, where
//   the track only stretches (a third of the finger's distance) and comes
//   back.

/** px the finger moves before the gesture is decided. */
export const SWIPE_SLOP = 10
/** Share of the width a release must pass to change column. */
export const SWIPE_DISTANCE_SHARE = 0.25
/** px/ms; a release faster than this counts as a flick. */
export const SWIPE_FLICK_VELOCITY = 0.5
/** Velocity is measured over the last samples within this window, ms. */
export const SWIPE_VELOCITY_WINDOW_MS = 100
/** How much of the finger's distance the track follows past an end. */
export const RUBBER_BAND = 1 / 3

export type SwipeIntent = 'pending' | 'horizontal' | 'vertical'

/** What a finger that moved `dx`, `dy` from its start is doing. */
export function swipeIntent(dx: number, dy: number): SwipeIntent {
  const x = Math.abs(dx)
  const y = Math.abs(dy)
  if (x < SWIPE_SLOP && y < SWIPE_SLOP) return 'pending'
  return x > y ? 'horizontal' : 'vertical'
}

/** How far the track follows a finger at `dx`, px; resisted past an end. */
export function swipeOffset({
  dx,
  index,
  count,
}: {
  dx: number
  index: number
  count: number
}): number {
  const pastStart = index === 0 && dx > 0
  const pastEnd = index === count - 1 && dx < 0
  return pastStart || pastEnd ? dx * RUBBER_BAND : dx
}

/** The column a released swipe settles on. */
export function settleSwipe({
  index,
  count,
  dx,
  velocity,
  width,
}: {
  index: number
  count: number
  /** The finger's distance, px; negative is to the left (next column). */
  dx: number
  /** px/ms at release; negative is to the left. */
  velocity: number
  width: number
}): number {
  const far = width > 0 && Math.abs(dx) > width * SWIPE_DISTANCE_SHARE
  const fast = Math.abs(velocity) > SWIPE_FLICK_VELOCITY
  // A flick back against the drag cancels it, however far it went.
  if (fast && Math.sign(velocity) !== Math.sign(dx)) return index
  // A flick counts only in the direction the finger went.
  const flick = fast && Math.sign(velocity) === Math.sign(dx)
  if (dx === 0 || !(far || flick)) return index
  const next = dx < 0 ? index + 1 : index - 1
  return Math.min(count - 1, Math.max(0, next))
}

/** One pointer position during a swipe. */
export interface SwipeSample {
  /** `event.timeStamp`, ms. */
  time: number
  /** `event.clientX`, px. */
  x: number
}

/** px/ms over the samples in the last window; 0 without two of them. */
export function swipeVelocity(samples: ReadonlyArray<SwipeSample>): number {
  if (samples.length < 2) return 0
  const last = samples[samples.length - 1]
  let first = last
  for (let i = samples.length - 2; i >= 0; i -= 1) {
    if (last.time - samples[i].time > SWIPE_VELOCITY_WINDOW_MS) break
    first = samples[i]
  }
  const elapsed = last.time - first.time
  if (elapsed <= 0) return 0
  return (last.x - first.x) / elapsed
}

/**
 * The track's transform: column `index` in view, moved by `offset` px.
 * React and the drag both write this exact form, so a release that keeps
 * the column puts back the string React rendered.
 */
export function trackTransform(index: number, offset = 0): string {
  return `translateX(calc(${-index * 100}% + ${offset}px))`
}
