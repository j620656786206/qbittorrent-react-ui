import type { BoardColumn } from '#/lib/torrent-status'
import { CARD_GAP } from '#/features/board/board-model'

// Story 2.8: the pure parts of the desktop board's auto-collapse, ported
// from the approved demo (ux-react-torrent-2026-11-13/.working/demo-board,
// functions `check`, the wheel handler, `findAnchor`, `flip`'s `ripple`):
// when to collapse and expand, which card is the anchor, how many cards fit
// a row of the wide column, how rows group, and the ripple delay. Timings
// and sizes are the spec's.

/** Step 1: the other columns become 64px strips. */
export const COLLAPSE_MS = 380
/** Step 2: the wide column's cards spread to 2 to 3 per row. */
export const SPREAD_MS = 1300
/** Expand: cards back to one per row (demo `P2 * 0.75`). */
export const EXPAND_MS = Math.round(SPREAD_MS * 0.75)
/** After step 2, before the board takes scrolls again (demo `P2 + 300`). */
export const SPREAD_SETTLE_MS = 300
/** After the expand animation (demo `dur + 100`). */
export const EXPAND_SETTLE_MS = 100
/** How long the anchor frame stays after the animation (demo `--here`). */
export const FRAME_EXTRA_MS = 900
export const FLIP_EASING = 'cubic-bezier(.25,.8,.25,1)'
/** `grid-template-columns: repeat(auto-fill, minmax(270px, 1fr))`. */
export const MIN_CARD_WIDTH = 270
/** The spec's 2 to 3 per row, also on wide windows. */
export const MAX_CARDS_PER_ROW = 3
export const RIPPLE_STEP_MS = 35
export const RIPPLE_MAX_MS = 320
/** `scrollTop` under this counts as "at the top". */
export const TOP_SLOP_PX = 8
/** Wheeling up at the top past this much `deltaY` expands. */
export const WHEEL_UP_PX = 60
/** New cards rise in after this share of the spread (demo `fadeNew`). */
export const FADE_NEW_AT = 0.45
/** Reopening columns and new cards fade in at this share of the expand. */
export const REOPEN_AT = 0.4

/** The whole collapse, as the scroll hold lasts (demo `P1 + P2 + 300`). */
export function collapseTotalMs(reduced: boolean): number {
  return reduced ? 0 : COLLAPSE_MS + SPREAD_MS + SPREAD_SETTLE_MS
}

/** The whole expand (demo `round(P2 * 0.75)` plus its settle). */
export function expandTotalMs(reduced: boolean): number {
  return reduced ? 0 : EXPAND_MS + EXPAND_SETTLE_MS
}

export interface ScrollCheck {
  /** The wide column, or `null` in the normal board. */
  focus: BoardColumn | null
  /** The column a strip press restored, until it is back near its top. */
  suppressed: BoardColumn | null
  /** The column that scrolled. */
  column: BoardColumn
  top: number
  /** Its `scrollTop` at the previous check. */
  prevTop: number
  clientHeight: number
  /** The auto-collapse pref. */
  enabled: boolean
}

export interface ScrollDecision {
  action: 'collapse' | 'expand' | 'none'
  suppressed: BoardColumn | null
}

/**
 * Demo `check`: in the normal board a column scrolled past one visible
 * column height collapses the others (unless a strip press suppressed it
 * and it has not been back near its top); the wide column scrolled up to
 * its top expands. Never called while an animation runs.
 */
export function decideScroll({
  focus,
  suppressed,
  column,
  top,
  prevTop,
  clientHeight,
  enabled,
}: ScrollCheck): ScrollDecision {
  if (focus === null) {
    if (suppressed === column) {
      return {
        action: 'none',
        suppressed: top < TOP_SLOP_PX ? null : suppressed,
      }
    }
    const collapse = enabled && clientHeight > 0 && top > clientHeight
    return { action: collapse ? 'collapse' : 'none', suppressed }
  }
  const expand = focus === column && top < TOP_SLOP_PX && top < prevTop
  return { action: expand ? 'expand' : 'none', suppressed }
}

/**
 * Demo wheel handler: collapsed boards are often already at the top, where
 * scrolling up sends no `scroll` event, so wheeling up there counts too.
 * `acc` is the `deltaY` gathered so far (negative is up).
 */
export function wheelAtTop({
  acc,
  deltaY,
  focusedHere,
  atTop,
}: {
  acc: number
  deltaY: number
  focusedHere: boolean
  atTop: boolean
}): { acc: number; expand: boolean } {
  if (!focusedHere || !atTop || deltaY >= 0) return { acc: 0, expand: false }
  const next = acc + deltaY
  return next < -WHEEL_UP_PX
    ? { acc: 0, expand: true }
    : { acc: next, expand: false }
}

export interface Box {
  top: number
  bottom: number
  left: number
  right: number
}

export interface CardBox extends Box {
  key: string
}

/** Distance from a point to a box: 0 inside, else to its nearer edge. */
export function distanceToBox(box: Box, x: number, y: number): number {
  const dx = x < box.left ? box.left - x : x > box.right ? x - box.right : 0
  const dy = y < box.top ? box.top - y : y > box.bottom ? y - box.bottom : 0
  return Math.hypot(dx, dy)
}

/**
 * Demo `findAnchor`. `cards` in column order, `view` the column's scroll
 * box. Among the visible cards: the one nearest the pointer when it is
 * inside the column (gaps count: the nearer edge); without one the first
 * fully visible card; else the first visible; `null` when none shows.
 */
export function pickAnchor(
  cards: ReadonlyArray<CardBox>,
  view: Box,
  pointer: { x: number; y: number } | null,
): string | null {
  const visible = cards.filter(
    (card) => card.bottom > view.top && card.top < view.bottom,
  )
  if (visible.length === 0) return null
  const inside =
    pointer !== null &&
    pointer.x >= view.left &&
    pointer.x <= view.right &&
    pointer.y >= view.top &&
    pointer.y <= view.bottom
  if (inside) {
    let best = visible[0]
    let bestDistance = Infinity
    for (const card of visible) {
      const distance = distanceToBox(card, pointer.x, pointer.y)
      if (distance < bestDistance) {
        bestDistance = distance
        best = card
      }
    }
    return best.key
  }
  const full = visible.find(
    (card) => card.top >= view.top - 2 && card.bottom <= view.bottom,
  )
  return (full ?? visible[0]).key
}

/** Demo `ripple`: 35 ms per card away from the anchor, at most 320 ms. */
export function rippleDelay(index: number, anchorIndex: number): number {
  if (index < 0) return 0
  return Math.min(
    RIPPLE_MAX_MS,
    Math.abs(index - Math.max(0, anchorIndex)) * RIPPLE_STEP_MS,
  )
}

/**
 * How many cards `repeat(auto-fill, minmax(270px, 1fr))` puts in a row of
 * `width` px with `gap` between them; at least one, at most three (wider
 * windows widen the cards instead).
 */
export function cardsPerRow(width: number, gap: number = CARD_GAP): number {
  if (!(width > 0)) return 1
  const fits = Math.floor((width + gap) / (MIN_CARD_WIDTH + gap))
  return Math.min(MAX_CARDS_PER_ROW, Math.max(1, fits))
}

/** A card's width when `perRow` share `width` with `gap` between them. */
export function cardWidth(
  width: number,
  perRow: number,
  gap: number = CARD_GAP,
): number {
  return Math.max(0, (width - gap * (perRow - 1)) / perRow)
}

/** One row of the column: cards `from` to `to` (exclusive). */
export interface CardRow {
  from: number
  to: number
  /** The tallest card in the row. */
  size: number
}

/** Cards in order, `perRow` to a row; each row as tall as its tallest. */
export function groupRows(
  heights: ReadonlyArray<number>,
  perRow: number,
): Array<CardRow> {
  const rows: Array<CardRow> = []
  const step = Math.max(1, Math.floor(perRow))
  for (let from = 0; from < heights.length; from += step) {
    const to = Math.min(heights.length, from + step)
    let size = 0
    for (let index = from; index < to; index += 1) {
      size = Math.max(size, heights[index])
    }
    rows.push({ from, to, size })
  }
  return rows
}

/** Where each row starts, the virtualizer's way (padding, then gaps). */
export function rowStarts(
  rows: ReadonlyArray<CardRow>,
  paddingStart: number,
  gap: number = CARD_GAP,
): Array<number> {
  const starts: Array<number> = []
  let at = paddingStart
  for (const row of rows) {
    starts.push(at)
    at += row.size + gap
  }
  return starts
}

/**
 * The scroll position that puts the row holding card `index` at `offset`
 * px below the top of a `viewport` px tall scroller, within the scroll
 * range (demo `keepAnchor`, computed instead of measured).
 */
export function anchoredScrollTop({
  rows,
  starts,
  index,
  offset,
  viewport,
  paddingEnd,
}: {
  rows: ReadonlyArray<CardRow>
  starts: ReadonlyArray<number>
  index: number
  offset: number
  viewport: number
  paddingEnd: number
}): number {
  if (rows.length === 0) return 0
  const row = rows.findIndex((each) => index >= each.from && index < each.to)
  if (row < 0) return 0
  const last = rows.length - 1
  const total = starts[last] + rows[last].size + paddingEnd
  const max = Math.max(0, total - viewport)
  return Math.min(max, Math.max(0, starts[row] - offset))
}

/** Row indexes that overlap `[from, to]` px; `[]` when none. */
export function rowsBetween(
  rows: ReadonlyArray<CardRow>,
  starts: ReadonlyArray<number>,
  from: number,
  to: number,
): Array<number> {
  const out: Array<number> = []
  for (let row = 0; row < rows.length; row += 1) {
    const start = starts[row]
    if (start > to) break
    if (start + rows[row].size >= from) out.push(row)
  }
  return out
}
