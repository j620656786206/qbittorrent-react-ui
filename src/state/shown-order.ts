import { useLayoutEffect } from 'react'
import { createStore, useSelector } from '@tanstack/react-store'

// Story 2.4, AR-50: the list's order as it is on screen (its one
// `useFrozenOrder` result) and the torrent it marks as viewed, published
// for the detail. The detail's 「第 N 個／共 M 個」, ‹ › and the vanished
// torrent's successor read this instead of running a second freeze hook,
// which could disagree with the rows (each holds its own last order).
// `undefined` while no list is mounted or before its first data.

export interface ShownList {
  /** The rows in the order shown. */
  order: ReadonlyArray<string> | undefined
  /** The row the detail shows (the ring); `null` for none. */
  viewed: string | null
}

const EMPTY: ShownList = Object.freeze({ order: undefined, viewed: null })

// Browser only, like the other stores in src/state.
export const shownListStore = createStore<ShownList>(EMPTY)

export function publishShownList(next: ShownList): void {
  const current = shownListStore.state
  if (current.order === next.order && current.viewed === next.viewed) return
  shownListStore.setState(() => next)
}

export function clearShownList(): void {
  shownListStore.setState(() => EMPTY)
}

/**
 * The list calls this with what it renders; cleared when it unmounts. A
 * layout effect, so the detail reads it in the same frame.
 */
export function usePublishShownList(
  order: ReadonlyArray<string> | undefined,
  viewed: string | null,
): void {
  useLayoutEffect(() => {
    publishShownList({ order, viewed })
  }, [order, viewed])
  useLayoutEffect(() => clearShownList, [])
}

export function useShownList(): ShownList {
  return useSelector(shownListStore, (state) => state)
}
