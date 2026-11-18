// Story 2.4, AR-50, AD-13: where the viewed torrent stands in the order the
// screen shows (the list's frozen order, or one board column), and who takes
// its place when it vanishes. Pure: the detail header's 「第 N 個／共 M 個」
// and ‹ ›, and the list's "deleted or archived, show the next one", read
// these, never their own copy of the order.

export interface DetailPosition {
  /** 0-based; the header shows `index + 1`. */
  index: number
  /** M: how many the order holds. */
  total: number
  /** The one before, `null` at the first. */
  prev: string | null
  /** The one after, `null` at the last. */
  next: string | null
}

/** `hash`'s place in `order`, or `null` when the order does not hold it. */
export function detailPosition(
  order: ReadonlyArray<string>,
  hash: string | null,
): DetailPosition | null {
  if (hash === null) return null
  const index = order.indexOf(hash)
  if (index === -1) return null
  return {
    index,
    total: order.length,
    prev: index > 0 ? order[index - 1] : null,
    next: index < order.length - 1 ? order[index + 1] : null,
  }
}

/**
 * EXPERIENCE 「正在看的種子不見了」: who takes `hash`'s place when it left
 * `previousOrder` for `nextOrder`. Still there: itself. Gone: the first one
 * after it in the old order that is still there (the row that moved into
 * its place), else the nearest one before it that is still there, else
 * `null` (none left, or it was never in the old order).
 */
export function successorOf(
  previousOrder: ReadonlyArray<string>,
  nextOrder: ReadonlyArray<string>,
  hash: string,
): string | null {
  const present = new Set(nextOrder)
  if (present.has(hash)) return hash
  const index = previousOrder.indexOf(hash)
  if (index === -1) return null
  for (let i = index + 1; i < previousOrder.length; i += 1) {
    if (present.has(previousOrder[i])) return previousOrder[i]
  }
  for (let i = index - 1; i >= 0; i -= 1) {
    if (present.has(previousOrder[i])) return previousOrder[i]
  }
  return null
}

/** What the list showed as viewed last time, with its order. */
export interface LastViewed {
  order: ReadonlyArray<string>
  viewed: string | null
}

export interface ListViewedInput {
  /** The order shown; `undefined` before the first data. */
  order: ReadonlyArray<string> | undefined
  /** The URL's `hash`. */
  hash: string | null
  previous: LastViewed | null
  /**
   * Desktop list mode: with no usable `hash` the first row is viewed, and a
   * vanished one is replaced by its successor. Phone: nothing is viewed
   * unless `hash` is in the order, and a vanished one closes the sheet.
   */
  fallbackFirst: boolean
  /**
   * Story 3.6: the category's last viewed torrent on this device. With
   * `fallbackFirst` and no usable `hash`, it is viewed instead of the first
   * row when the order holds it.
   */
  preferred?: string | null
}

export interface ListViewed {
  viewed: string | null
  /** A new URL `hash` to write (`null` removes it); `undefined`: none. */
  write: string | null | undefined
}

/**
 * Story 2.4 rows D1, D3, D9, D11: which row the list's detail shows, and
 * whether the URL must follow. Without a usable `hash` (none, or one the
 * list does not hold: D3, the URL left alone) the first row is shown on the
 * first load, and stays shown while it is in the order. The viewed row
 * leaving the order (deleted, archived) is told apart from a `hash` that
 * never was in it. Story 3.6: where the first row would be shown, the
 * category's `preferred` row is, when the order holds it.
 */
export function resolveListViewed({
  order,
  hash,
  previous,
  fallbackFirst,
  preferred = null,
}: ListViewedInput): ListViewed {
  if (order === undefined) return { viewed: null, write: undefined }
  if (hash !== null && order.includes(hash)) {
    return { viewed: hash, write: undefined }
  }
  const lost = previous?.viewed ?? null
  const vanished =
    previous !== null &&
    lost !== null &&
    previous.order.includes(lost) &&
    !order.includes(lost)
  const close = hash === null ? undefined : null
  if (!fallbackFirst) return { viewed: null, write: close }
  if (vanished) {
    const next = successorOf(previous.order, order, lost)
    // Without a hash and none of the old rows left (the order replaced
    // wholesale): the first row, never a blank panel.
    if (next === null && hash === null) {
      return { viewed: fallbackRow(order, preferred), write: undefined }
    }
    return { viewed: next, write: next ?? close }
  }
  // Without a usable hash the row shown stays while it is in the order: a
  // torrent landing on top, or the order moving, never swaps what Alex
  // reads. A stale `hash` (an archived torrent opened on the board, then a
  // list sort) counts as none here.
  if (lost !== null && order.includes(lost)) {
    return { viewed: lost, write: undefined }
  }
  return { viewed: fallbackRow(order, preferred), write: undefined }
}

/** Story 3.6: `preferred` when the order holds it, else the first row. */
function fallbackRow(
  order: ReadonlyArray<string>,
  preferred: string | null,
): string | null {
  if (preferred !== null && order.includes(preferred)) return preferred
  return order[0] ?? null
}
