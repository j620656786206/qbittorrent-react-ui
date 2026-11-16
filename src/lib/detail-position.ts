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
 * The torrent the desktop list shows: the URL's `hash` when the order holds
 * it, otherwise the first one (EXPERIENCE detail-panel: no hash, or a hash
 * not in the list, shows the first row); `null` for an empty order.
 */
export function viewedInOrder(
  order: ReadonlyArray<string>,
  hash: string | null,
): string | null {
  if (hash !== null && order.includes(hash)) return hash
  return order[0] ?? null
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
}

export interface ListViewed {
  viewed: string | null
  /** A new URL `hash` to write (`null` removes it); `undefined`: none. */
  write: string | null | undefined
}

/**
 * Story 2.4 rows D1, D3, D9, D11: which row the list's detail shows, and
 * whether the URL must follow. The viewed row leaving the order (deleted,
 * archived) is told apart from a `hash` that never was in it (D3: the first
 * row, the URL left alone).
 */
export function resolveListViewed({
  order,
  hash,
  previous,
  fallbackFirst,
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
    return { viewed: next, write: next ?? close }
  }
  return { viewed: order[0] ?? null, write: undefined }
}
