import { useLayoutEffect, useMemo, useRef } from 'react'
import { resolveListViewed } from '#/lib/detail-position'
import type { LastViewed } from '#/lib/detail-position'
import { readPref } from '#/lib/prefs'
import { ALL } from '#/shared/categories'
import { useOutsideHash } from '#/state/detail-outside'
import { useViewedHash } from '#/state/viewed-hash'

// Story 2.4: the row the list's detail shows, from the URL's `hash` and the
// order on screen (resolveListViewed in src/lib). When the viewed row leaves
// the order (deleted, archived) the URL follows with `replace`: desktop to
// the row that took its place, phone to no `hash` (the sheet closes). Until
// the router answers, the row already written keeps showing, so the panel
// never blinks to the first row in between; that move is the app's own
// (`followHash`), never remembered as Alex's pick. Story 3.6: where the first row
// would be viewed (desktop list mode, `fallbackFirst`), the category's last
// viewed torrent on this device (`lastViewedHash` in src/lib/prefs.ts) is,
// when the order holds it. It is never scrolled into view (PRD FR-16).
// Story 4.6: a torrent opened from outside the list (the add screen's
// 「打開」, src/state/detail-outside.ts) that the order does not hold views
// no row and writes nothing: the detail shows it without a position.

export function useListViewed(
  order: ReadonlyArray<string> | undefined,
  {
    fallbackFirst,
    scope = ALL,
  }: {
    fallbackFirst: boolean
    /**
     * Story 3.2: the category. Another category's rows are a new list, not
     * the old one changing: the row viewed before is forgotten, so without
     * a usable `hash` the first row is viewed (never a "successor" picked
     * from the old category's order).
     */
    scope?: string
  },
): string | null {
  const { hash, followHash } = useViewedHash()
  const lastRef = useRef<(LastViewed & { scope: string }) | null>(null)
  /**
   * A `hash` written and not yet back from the router, with the URL's
   * `hash` when it was written. Any other URL change (the echo, or a row
   * Alex clicked meanwhile) ends it.
   */
  const pendingRef = useRef<{
    hash: string | null
    from: string | null
  } | null>(null)

  let effectiveHash = hash
  const pending = pendingRef.current
  if (pending !== null) {
    if (pending.hash === hash || pending.from !== hash)
      pendingRef.current = null
    else effectiveHash = pending.hash
  }
  // Read again when the category or the URL's `hash` changes: the layout
  // records each `hash` written, so by the next time no `hash` is usable
  // the stored value is current. The phone never views a row by itself.
  const preferred = useMemo(
    () =>
      fallbackFirst ? (readPref('lastViewedHash').get(scope) ?? null) : null,
    // `hash` only says when to read again.
    [fallbackFirst, scope, hash],
  )
  const outside = useOutsideHash()
  const last = lastRef.current
  const { viewed, write } =
    outside !== null &&
    outside === effectiveHash &&
    order !== undefined &&
    !order.includes(outside)
      ? { viewed: null, write: undefined }
      : resolveListViewed({
          order,
          hash: effectiveHash,
          previous: last !== null && last.scope === scope ? last : null,
          fallbackFirst,
          preferred,
        })

  useLayoutEffect(() => {
    if (order !== undefined) lastRef.current = { order, viewed, scope }
    if (write === undefined) return
    pendingRef.current = { hash: write, from: hash }
    followHash(write)
  })

  return viewed
}
