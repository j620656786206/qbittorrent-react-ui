import { useLayoutEffect, useRef } from 'react'
import { resolveListViewed } from '#/lib/detail-position'
import type { LastViewed } from '#/lib/detail-position'
import { useViewedHash } from '#/state/viewed-hash'

// Story 2.4: the row the list's detail shows, from the URL's `hash` and the
// order on screen (resolveListViewed in src/lib). When the viewed row leaves
// the order (deleted, archived) the URL follows with `replace`: desktop to
// the row that took its place, phone to no `hash` (the sheet closes). Until
// the router answers, the row already written keeps showing, so the panel
// never blinks to the first row in between.

export function useListViewed(
  order: ReadonlyArray<string> | undefined,
  { fallbackFirst }: { fallbackFirst: boolean },
): string | null {
  const { hash, setHash } = useViewedHash()
  const lastRef = useRef<LastViewed | null>(null)
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
  const { viewed, write } = resolveListViewed({
    order,
    hash: effectiveHash,
    previous: lastRef.current,
    fallbackFirst,
  })

  useLayoutEffect(() => {
    if (order !== undefined) lastRef.current = { order, viewed }
    if (write === undefined) return
    pendingRef.current = { hash: write, from: hash }
    setHash(write)
  })

  return viewed
}
