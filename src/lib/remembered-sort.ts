import { normalizeSortView } from '#/shared/list-search'
import type { SortView } from '#/shared/list-search'
import type { Settings } from '#/shared/settings'

// Story 3.1 (AD-8, AD-13): the remembered sort of a category and when an
// answer of `['settings']` should move the screen.

/**
 * The category's remembered sort; `null` when the settings hold none,
 * `undefined` before the first settings answer.
 */
export function rememberedSortOf(
  settings: Settings | undefined,
  category: string,
): SortView | null | undefined {
  if (settings === undefined) return undefined
  return Object.hasOwn(settings.categorySort, category)
    ? settings.categorySort[category]
    : null
}

/** Same sort and direction (or both absent). */
export function sameSort(
  a: SortView | null | undefined,
  b: SortView | null | undefined,
): boolean {
  if (a == null || b == null) return a === b
  return a.sort === b.sort && a.dir === b.dir
}

export interface RememberedChange {
  /** The remembered sort in the previous answer (`undefined`: none). */
  before: SortView | null | undefined
  /** The remembered sort in this answer (`undefined`: none). */
  after: SortView | null | undefined
  /** The sort on screen before this answer. */
  shown: SortView
  /**
   * The sort on screen with this answer: differs from `shown` only when the
   * URL has no `sort`, so the view comes from the remembered one.
   */
  next: SortView
  /** One of this tab's own sort saves is still in flight. */
  saving: boolean
}

/**
 * The sort to switch to (URL `replace` and back to the top) after a
 * settings answer, or `null` to leave the screen alone.
 * - Only a change of the remembered value between two answers counts,
 *   never a mismatch with the screen alone.
 * - A URL without `sort` shows the remembered sort, so any such change that
 *   changes the screen (a value after a failed first read, another value,
 *   back to nothing and so 「狀態」) switches to what it now shows.
 * - A URL with `sort`: another device's new value switches to it, unless it
 *   is what the screen shows already. A pending write (the answer still has
 *   the old value), a failed write (the value never changes) and this tab's
 *   own successful write (the value is the screen's) all leave the pick on
 *   screen; while this tab still saves, no answer moves the screen.
 */
export function rememberedSortSwitch({
  before,
  after,
  shown,
  next,
  saving,
}: RememberedChange): SortView | null {
  if (sameSort(before, after)) return null
  if (!sameSort(next, shown)) return next
  if (before === undefined || after == null || saving) return null
  const target = normalizeSortView(after)
  return sameSort(target, shown) ? null : target
}
