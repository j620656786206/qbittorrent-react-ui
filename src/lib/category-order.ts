import {
  categoryLabel,
  isTabCategory,
  orderCategoryKeys,
  selectCategoryCounts,
} from '#/lib/category-tabs'
import type { CategoryCounts } from '#/lib/category-tabs'
import type { Maindata } from '#/lib/maindata-merge'

// Story 3.3 (AD-8): the settings page's category order list, pure. Unlike
// the tabs (only categories some torrent has), the list holds every
// category qBittorrent knows (maindata's `categories` map) plus any
// category a torrent uses that the map lacks; uncategorized (`''`, 「未分類」)
// only when some torrent is uncategorized (Claude 代決). Keys the URL
// cannot carry (`isTabCategory`) are left out, like the tabs. The order is
// the tabs' (orderCategoryKeys): `categoryOrder` first, then the rest by
// the name shown. 「全部」 is not in the list: it is always first and never
// moves.

export interface OrderRow {
  /** `''` (uncategorized) or a category name. */
  key: string
  /** Plain text (AD-10): 「未分類」 or the name. */
  label: string
}

/** The categories the settings page lists, in tab order. */
export function categoryOrderRows({
  categories,
  counts,
  categoryOrder,
}: {
  /** Maindata's `categories` map (qBittorrent's categories by name). */
  categories: Readonly<Record<string, unknown>>
  /** The categories torrents use (`selectCategoryCounts`). */
  counts: CategoryCounts
  categoryOrder: ReadonlyArray<string>
}): Array<OrderRow> {
  const keys = new Set<string>()
  for (const name of Object.keys(categories)) {
    // A map entry named '' would be no category; uncategorized comes only
    // from torrents.
    if (name !== '' && isTabCategory(name)) keys.add(name)
  }
  // Already filtered by isTabCategory (selectCategoryCounts).
  for (const { key } of counts.categories) keys.add(key)
  return orderCategoryKeys(keys, categoryOrder).map((key) => ({
    key,
    label: categoryLabel(key),
  }))
}

/** categoryOrderRows from a maindata snapshot (its map and its torrents). */
export function categoryOrderRowsOf(
  maindata: Maindata,
  categoryOrder: ReadonlyArray<string>,
): Array<OrderRow> {
  return categoryOrderRows({
    categories: maindata.categories,
    counts: selectCategoryCounts(maindata),
    categoryOrder,
  })
}

/**
 * The whole order to save after moving `key` one listed place up (`-1`)
 * or down (`1`), or `null` when it cannot move that way. `listed` is the
 * list on screen (categoryOrderRows); `stored` is the saved
 * `categoryOrder`. Stored entries not listed now (uncategorized while no
 * torrent is, a category briefly missing) keep their place, so a move
 * never erases them: the order is `stored` (each name once) followed by
 * the listed names it lacks, and `key` trades places with its listed
 * neighbour.
 */
export function orderAfterMove({
  stored,
  listed,
  key,
  delta,
}: {
  stored: ReadonlyArray<string>
  listed: ReadonlyArray<string>
  key: string
  delta: -1 | 1
}): Array<string> | null {
  const at = listed.indexOf(key)
  const next = at + delta
  if (at < 0 || next < 0 || next >= listed.length) return null
  const neighbour = listed[next]
  const merged = [...new Set([...stored, ...listed])]
  const from = merged.indexOf(key)
  const to = merged.indexOf(neighbour)
  merged[from] = neighbour
  merged[to] = key
  return merged
}
