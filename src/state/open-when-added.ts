import { useCallback, useEffect } from 'react'
import { createStore, useSelector } from '@tanstack/react-store'
import type { Maindata } from '#/lib/maindata-merge'
import { openDetailOutside } from '#/state/detail-outside'
import { useMaindata } from '#/state/maindata'

// Story 4.7 (EXPERIENCE add results, Claude 代決): 「去看」 after adding
// exactly one torrent switches to the add category and opens that
// torrent's detail as soon as it shows up in maindata (the app never edits
// maindata, so it may take a poll or two). The wish lasts 30 s; it also
// ends when Alex makes another choice once the category is on screen (another
// category, another row, the detail closed), or when a new add is sent.
// The add screen calls `openWhenAdded` right after `selectCategory`; the
// upkeep (mounted once, by the `_authed` layout, which owns the URL's
// category and `hash`) waits for the category to be on screen, then writes
// the URL's `hash` once the torrent exists, through detail-outside so a
// search that hides it still shows the detail.

export const OPEN_WHEN_ADDED_MS = 30_000

interface Pending {
  hash: string
  category: string
  /** The category has been on screen since the wish was made. */
  reached: boolean
  /** The URL's `hash` when the category got there. */
  viewedAtReach: string | null
}

// Browser only, like the other stores in src/state.
export const openWhenAddedStore = createStore<Pending | null>(null)

let timer: ReturnType<typeof setTimeout> | undefined

/** Opens `hash`'s detail once it exists, within 30 s, in `category`. */
export function openWhenAdded(hash: string, category: string): void {
  clearTimeout(timer)
  openWhenAddedStore.setState(() => ({
    hash,
    category,
    reached: false,
    viewedAtReach: null,
  }))
  timer = setTimeout(cancelOpenWhenAdded, OPEN_WHEN_ADDED_MS)
}

export function cancelOpenWhenAdded(): void {
  clearTimeout(timer)
  timer = undefined
  if (openWhenAddedStore.state !== null) openWhenAddedStore.setState(() => null)
}

/** Whether maindata has `hash`; `undefined` before the first poll. */
function useHas(hash: string | null): boolean | undefined {
  const select = useCallback(
    (data: Maindata) => hash !== null && Object.hasOwn(data.torrents, hash),
    [hash],
  )
  return useMaindata(select).data
}

/**
 * Mounted once by the `_authed` layout with the category on screen, the
 * URL's `hash` and its setter: carries out the wish (see the top).
 */
export function useOpenWhenAddedUpkeep(
  category: string,
  viewed: string | null,
  setHash: (hash: string) => void,
): void {
  const pending = useSelector(openWhenAddedStore, (state) => state)
  const has = useHas(pending?.hash ?? null)
  useEffect(() => {
    if (pending === null) return
    const here = category === pending.category
    if (!pending.reached) {
      if (!here) return
      openWhenAddedStore.setState((current) =>
        current === pending
          ? { ...current, reached: true, viewedAtReach: viewed }
          : current,
      )
      return
    }
    if (!here || viewed !== pending.viewedAtReach) {
      cancelOpenWhenAdded()
      return
    }
    if (has !== true) return
    cancelOpenWhenAdded()
    openDetailOutside(pending.hash)
    setHash(pending.hash)
  }, [pending, category, viewed, has, setHash])
}

/** Tests: no wish, no timer. */
export function resetOpenWhenAdded(): void {
  cancelOpenWhenAdded()
}
