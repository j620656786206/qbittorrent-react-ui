import { useEffect, useRef } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { rememberedSortSwitch } from '#/lib/remembered-sort'
import { ALL } from '#/shared/categories'
import type { SortView } from '#/shared/list-search'
import { isSavingSort } from '#/state/settings'

// Story 3.1: a settings answer that changes the sort on screen. Another
// device changed the remembered sort (story 3.2: the current category's),
// or (with no `sort` in the URL) the screen follows the remembered value:
// either way `follow` runs with the sort to show, and the `_authed` layout
// writes it to the URL with `replace` and scrolls to the top. Never on a
// mismatch alone, never while this tab still saves a pick
// (rememberedSortSwitch in src/lib/remembered-sort.ts), and not on the
// first load (the skeleton was showing, nothing was on screen yet).

export function useFollowRememberedSort(
  /** The current category's remembered sort; `undefined` without an answer. */
  remembered: SortView | null | undefined,
  /** The sort on screen now. */
  view: SortView,
  /** The first settings read has answered (or failed). */
  ready: boolean,
  follow: (next: SortView) => void,
  /**
   * Story 3.2: the category on screen. The rule watches that category's
   * remembered value; switching category is not a change of it (the
   * switch itself puts the new category's sort on screen).
   */
  category = ALL,
  /**
   * Story 3.3: the list is on screen. Off the list (the settings page) the
   * rule neither follows nor moves its last-seen value, so a change made
   * meanwhile is judged when the list is back.
   */
  active = true,
): void {
  const client = useQueryClient()
  const lastRef = useRef<{
    remembered: SortView | null | undefined
    view: SortView
    ready: boolean
    category: string
  } | null>(null)

  useEffect(() => {
    if (!active) return
    const last = lastRef.current
    lastRef.current = { remembered, view, ready, category }
    if (last === null || !last.ready || last.category !== category) return
    const next = rememberedSortSwitch({
      before: last.remembered,
      after: remembered,
      shown: last.view,
      next: view,
      saving: isSavingSort(client, category),
    })
    if (next !== null) follow(next)
  }, [client, remembered, view, ready, follow, category, active])
}
