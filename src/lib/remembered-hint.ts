import { sameSort } from '#/lib/remembered-sort'
import type { SortView } from '#/shared/list-search'

// Story 3.2, EXPERIENCE sort-pill (UX-DR20): when the desktop sort pill
// adds 「（這個分類記住的）」. The `_authed` layout owns who changed the sort
// last and passes it in with the sort before and after that change.

/**
 * Who changed the sort on screen last: the app opening (first load or a
 * reload, and another device's change followed), a category tab switching
 * to that category's remembered sort (`category-switch`), a category tab
 * falling back to 「狀態」 because that category remembers none
 * (`category-default`), or Alex picking one by hand.
 */
export type SortChangeCause =
  'open' | 'category-switch' | 'category-default' | 'manual'

export interface SortChange {
  /** The sort on screen before the change; `null` on open. */
  before: SortView | null
  /** The sort the change put on screen; `null` on open. */
  after: SortView | null
  cause: SortChangeCause
}

/**
 * Shows only after a category switch to the category's remembered sort
 * that differs from the sort before (never for the 「狀態」 fallback of a
 * category that remembers none); a manual pick hides it, the next switch decides again, and the
 * app opening or a switch to the same sort shows nothing.
 */
export function showsRememberedHint({
  before,
  after,
  cause,
}: SortChange): boolean {
  return (
    cause === 'category-switch' &&
    before !== null &&
    after !== null &&
    !sameSort(before, after)
  )
}
