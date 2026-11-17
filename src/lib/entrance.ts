// Story 2.9, EXPERIENCE 〔動態〕「驚艷的那一下：進度環轉進來」: the entrance
// rules, pure. When data first replaces the skeleton (and again on
// `replayEntrance()` from src/state/entrance.ts), the rows and cards in view
// rise 10px and fade in, 60ms apart per row, and the progress rings in view
// turn from empty to their value. The DOM side is
// src/shared/entrance-motion.ts; the store and the hook are
// src/state/entrance.ts.

/** The ring turns from empty to its value (Claude 代決, epic 2). */
export const RING_MS = 900
/** Rows and cards rise and fade in. */
export const RISE_MS = 500
/** How far a row rises from, px. */
export const RISE_PX = 10
/** Delay between one row and the next, per surface. */
export const STAGGER_MS = 60
/** The easing of every entrance animation (DESIGN motion). */
export const ENTRANCE_EASING = 'cubic-bezier(.2,.8,.2,1)'
/**
 * Surfaces ready this soon after the first one join its entrance, their
 * delays shifted by the time since (Claude 代決).
 */
export const JOIN_MS = 150
/** Elements whose tops differ by at most this much are one row, px. */
export const ROW_TOLERANCE_PX = 1

export interface Box {
  top: number
  right: number
  bottom: number
  left: number
}

export interface Viewport {
  width: number
  height: number
}

/**
 * Each top's row number (0-based, top to bottom): tops within
 * `ROW_TOLERANCE_PX` of a row's first top are that row, so the cards of one
 * grid row rise together. Same order as `tops`.
 */
export function rowOrdinals(tops: ReadonlyArray<number>): Array<number> {
  const order = tops.map((top, index) => ({ top, index }))
  order.sort((a, b) => a.top - b.top || a.index - b.index)
  const out = new Array<number>(tops.length)
  let row = -1
  let rowTop = Number.NEGATIVE_INFINITY
  for (const { top, index } of order) {
    if (top - rowTop > ROW_TOLERANCE_PX) {
      row += 1
      rowTop = top
    }
    out[index] = row
  }
  return out
}

function overlaps(a: Box, b: Box): boolean {
  return (
    a.bottom > b.top && a.top < b.bottom && a.right > b.left && a.left < b.right
  )
}

/**
 * The element shows: its box overlaps both its scroll container's box and
 * the window. An empty box (not laid out) never shows.
 */
export function isVisible(
  rect: Box,
  container: Box,
  viewport: Viewport,
): boolean {
  if (rect.bottom <= rect.top || rect.right <= rect.left) return false
  return (
    overlaps(rect, container) &&
    overlaps(rect, {
      top: 0,
      left: 0,
      bottom: viewport.height,
      right: viewport.width,
    })
  )
}

/** One element's delay: its row's place in the stagger, minus the late start. */
export function entranceDelay(row: number, elapsed: number): number {
  return row * STAGGER_MS - elapsed
}

export type SweepDecision =
  /** Not ready yet (no data, not measured): ask again next commit. */
  | { kind: 'wait' }
  /** Already handled, or too late: draw as is, never sweep this generation. */
  | { kind: 'skip' }
  /** The first ready surface: start the generation's clock and sweep. */
  | { kind: 'claim' }
  /** Ready soon after the first: sweep, delays shifted by `elapsed`. */
  | { kind: 'join'; elapsed: number }

export interface SweepInput {
  /** The store's current generation. */
  generation: number
  /** The last generation this surface handled (0 for none). */
  played: number
  /** The surface has data and its scroll box is measured. */
  ready: boolean
  /** When the generation's first sweep started; `null` before one did. */
  startedAt: number | null
  /** `performance.now()`. */
  now: number
}

/** What a surface does with the current generation on this commit. */
export function sweepDecision({
  generation,
  played,
  ready,
  startedAt,
  now,
}: SweepInput): SweepDecision {
  if (played >= generation) return { kind: 'skip' }
  if (!ready) return { kind: 'wait' }
  if (startedAt === null) return { kind: 'claim' }
  const elapsed = Math.max(0, now - startedAt)
  return elapsed <= JOIN_MS ? { kind: 'join', elapsed } : { kind: 'skip' }
}
