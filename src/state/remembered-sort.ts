import { useEffect, useRef } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { rememberedSortSwitch } from '#/lib/remembered-sort'
import type { SortView } from '#/shared/list-search'
import { isSavingSort } from '#/state/settings'

// Story 3.1: a settings answer that changes the sort on screen. Another
// device changed the remembered sort, or (with no `sort` in the URL) the
// screen follows the remembered value: either way `follow` runs with the
// sort to show, and the `_authed` layout writes it to the URL with
// `replace` and scrolls to the top. Never on a mismatch alone, never while
// this tab still saves a pick (rememberedSortSwitch in
// src/lib/remembered-sort.ts), and not on the first load (the skeleton
// was showing, nothing was on screen yet).

export function useFollowRememberedSort(
  /** The remembered sort; `undefined` while there is no answer. */
  remembered: SortView | null | undefined,
  /** The sort on screen now. */
  view: SortView,
  /** The first settings read has answered (or failed). */
  ready: boolean,
  follow: (next: SortView) => void,
): void {
  const client = useQueryClient()
  const lastRef = useRef<{
    remembered: SortView | null | undefined
    view: SortView
    ready: boolean
  } | null>(null)

  useEffect(() => {
    const last = lastRef.current
    lastRef.current = { remembered, view, ready }
    if (last === null || !last.ready) return
    const next = rememberedSortSwitch({
      before: last.remembered,
      after: remembered,
      shown: last.view,
      next: view,
      saving: isSavingSort(client),
    })
    if (next !== null) follow(next)
  }, [client, remembered, view, ready, follow])
}
