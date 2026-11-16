// Story 2.2: where the bottom sheet settles after a drag. Pure: the sheet
// (src/shared/ui/bottom-sheet.tsx) measures, this decides. It sits next to
// the sheet because it is the sheet's own geometry, not torrent logic
// (Claude 代決, epic 2 review: it was in src/lib, which src/shared may not
// import, and reaching it took a router-level context).
//
// Heights per DESIGN bottom-sheet: `fit` its content up to 90%, `fixed90`
// 90%, `detail` 70%, `full` the screen. Thresholds (Claude 代決, spec 2.2):
// - Down: closes past a quarter of the rest height, or on a flick faster
//   than 0.5 px/ms. `detail` follows EXPERIENCE literally: it closes only
//   when released past half its height, otherwise it springs back to 70%.
// - Up: full screen past a quarter (of the rest height or of the room left
//   above it, whichever is smaller, so a 90% sheet can reach it), or on an
//   upward flick.
// - From full screen: a flick down or a drag past a quarter of the screen
//   goes back to the rest height; below the rest height's close line it
//   closes.
// - A flick against the drag's direction goes back to where the drag
//   started (the rest height, or full screen when it started there).

/**
 * How tall the sheet rests (DESIGN bottom-sheet): `fit` its content, at most
 * 90% of the screen; `fixed90` 90% (add torrent); `detail` 70% (detail);
 * `full` the whole screen (rename). Any of them can be dragged up to full
 * screen.
 */
export type SheetMode = 'fit' | 'fixed90' | 'detail' | 'full'

/** Where a released drag ends: closed, the mode's rest height, or full screen. */
export type SheetSnap = 'close' | 'rest' | 'full'

export interface SheetRelease {
  mode: SheetMode
  /** The sheet was full screen when the drag started. */
  expanded: boolean
  /** The mode's rest height in px (`sheetRestHeight`). */
  restHeight: number
  viewportHeight: number
  /** How far the finger moved, px; positive is down. */
  distance: number
  /** Speed at release, px/ms; positive is down. */
  velocity: number
}

/** One pointer position during a drag. */
export interface DragSample {
  /** `event.timeStamp`, ms. */
  time: number
  /** `event.clientY`, px. */
  y: number
}

export const FIT_MAX_SHARE = 0.9
export const FIXED90_SHARE = 0.9
export const DETAIL_SHARE = 0.7
/** px/ms; a release faster than this counts as a flick. */
export const FLICK_VELOCITY = 0.5
/** Velocity is measured over the last samples within this window, ms. */
export const VELOCITY_WINDOW_MS = 100

/** The visible height the mode rests at, px. */
export function sheetRestHeight(
  mode: SheetMode,
  contentHeight: number,
  viewportHeight: number,
): number {
  switch (mode) {
    case 'fit':
      return Math.min(contentHeight, viewportHeight * FIT_MAX_SHARE)
    case 'fixed90':
      return viewportHeight * FIXED90_SHARE
    case 'detail':
      return viewportHeight * DETAIL_SHARE
    case 'full':
      return viewportHeight
  }
}

/** The visible height below which a release closes the sheet. */
function closeLine(mode: SheetMode, restHeight: number): number {
  return mode === 'detail' ? restHeight / 2 : (restHeight * 3) / 4
}

export function settleSheet({
  mode,
  expanded,
  restHeight,
  viewportHeight,
  distance,
  velocity,
}: SheetRelease): SheetSnap {
  const flickDown = velocity > FLICK_VELOCITY
  const flickUp = velocity < -FLICK_VELOCITY
  const restIsFull = mode === 'full' || restHeight >= viewportHeight

  // A flick back against the drag (dragged down, flicked up, or the other
  // way) returns to where the drag started, whatever the distance.
  if ((flickUp && distance > 0) || (flickDown && distance < 0)) {
    return expanded && !restIsFull ? 'full' : 'rest'
  }

  // Nothing above the rest height: down closes, anything else stays.
  if (restIsFull) {
    if (flickDown || distance > viewportHeight / 4) return 'close'
    return 'rest'
  }

  if (!expanded) {
    const height = restHeight - distance
    const upThreshold = Math.min(restHeight, viewportHeight - restHeight) / 4
    if (flickUp || -distance > upThreshold) return 'full'
    if (flickDown && mode !== 'detail') return 'close'
    if (height < closeLine(mode, restHeight)) return 'close'
    return 'rest'
  }

  const height = viewportHeight - distance
  if (flickUp) return 'full'
  if (height < closeLine(mode, restHeight)) return 'close'
  if (flickDown || distance > viewportHeight / 4) return 'rest'
  return 'full'
}

/**
 * px/ms over the samples in the last `VELOCITY_WINDOW_MS` before the last
 * one; 0 with fewer than two or no time between them.
 */
export function releaseVelocity(samples: ReadonlyArray<DragSample>): number {
  if (samples.length < 2) return 0
  const last = samples[samples.length - 1]
  let first = last
  for (let i = samples.length - 2; i >= 0; i -= 1) {
    if (last.time - samples[i].time > VELOCITY_WINDOW_MS) break
    first = samples[i]
  }
  const elapsed = last.time - first.time
  if (elapsed <= 0) return 0
  return (last.y - first.y) / elapsed
}
