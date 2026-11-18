import { statusOf } from '#/lib/torrent-status'
import type { Maindata } from '#/lib/maindata-merge'
import {
  ALL,
  UNCATEGORIZED,
  categoryOrderEntrySchema,
} from '#/shared/categories'

// Story 3.2 (AD-8, AD-13, AR-46): the desktop category tabs, pure. Which
// categories have a tab, in what order, with what count, and which category
// the screen shows for the URL's `category`. Tabs come from the torrents
// present (archived ones included), never from qBittorrent's category map:
// a category without any torrent has no tab. Counts leave archived torrents
// out, so a category holding only archived ones keeps its tab with 0. 3.3
// (order list), 3.4 (phone sheet) and 3.7 (number keys) reuse these.

/** One category that has torrents: its key and its count without archived. */
export interface CategoryCount {
  /** The category name, `''` for uncategorized. */
  key: string
  /** Torrents in it, archived ones left out (0 when only archived). */
  count: number
}

/**
 * A category key the URL can carry (`category=`): uncategorized or a name
 * the schema accepts. `ALL`'s key, `__proto__`, a name over 255 characters
 * or one with a control character gets no tab: its tab could never filter.
 */
export function isTabCategory(key: string): boolean {
  return categoryOrderEntrySchema.safeParse(key).success
}

export interface CategoryCounts {
  /** Every torrent without archived ones: the 「全部」 count. */
  all: number
  /**
   * Every category some torrent has (archived torrents included) that can
   * have a tab, with its count without archived torrents; sorted by key
   * (code units). Torrents of other keys count only in `all`.
   */
  categories: ReadonlyArray<CategoryCount>
}

/**
 * The counts behind the tabs. Plain arrays and objects, so an unchanged
 * result stays equal from poll to poll (Query keeps its reference).
 */
export function selectCategoryCounts(maindata: Maindata): CategoryCounts {
  const { torrents, stateBeforeMove } = maindata
  const counts = new Map<string, number>()
  let all = 0
  for (const torrent of Object.values(torrents)) {
    const visible = statusOf(torrent, stateBeforeMove) !== 'archived'
    if (visible) all += 1
    const key = torrent.category
    if (!isTabCategory(key)) continue
    counts.set(key, (counts.get(key) ?? 0) + (visible ? 1 : 0))
  }
  const categories = [...counts.keys()]
    .sort((a, b) => (a < b ? -1 : a > b ? 1 : 0))
    .map((key) => ({ key, count: counts.get(key) ?? 0 }))
  return { all, categories }
}

/** What a tab reads: 「全部」, 「未分類」 or the category name as is. */
export function categoryLabel(key: string): string {
  if (key === ALL) return '全部'
  if (key === UNCATEGORIZED) return '未分類'
  return key
}

export interface CategoryTab {
  /** `ALL`, `''` (uncategorized) or a category name. */
  key: string
  /** Plain text (AD-10): 「全部」, 「未分類」 or the name. */
  label: string
  /** Without archived torrents. */
  count: number
}

// Claude 代決: names not in `categoryOrder` sort like a person reads them
// in Traditional Chinese.
const collator = new Intl.Collator('zh-Hant')

/**
 * `keys` (no `ALL`) in tab order: those in `categoryOrder` first, in its
 * order, then the rest by the name shown (「未分類」 for uncategorized;
 * zh-Hant collation, then code units). Entries of `categoryOrder` not in
 * `keys` are skipped. Story 3.3's settings list orders the same way.
 */
export function orderCategoryKeys(
  keys: Iterable<string>,
  categoryOrder: ReadonlyArray<string>,
): Array<string> {
  const present = new Set(keys)
  const ordered: Array<string> = []
  const placed = new Set<string>()
  for (const key of categoryOrder) {
    if (present.has(key) && !placed.has(key)) {
      ordered.push(key)
      placed.add(key)
    }
  }
  const rest = [...present]
    .filter((key) => !placed.has(key))
    .sort(
      (a, b) =>
        collator.compare(categoryLabel(a), categoryLabel(b)) ||
        (a < b ? -1 : a > b ? 1 : 0),
    )
  return [...ordered, ...rest]
}

/**
 * The tabs in order: 「全部」 first (`counts.all`), then the categories in
 * `categoryOrder` (settings), then the rest by the name shown (「未分類」
 * for uncategorized; `localeCompare` in zh-Hant). A category without any
 * torrent has no tab, except `selected`: the category on screen keeps its
 * tab, with 0, after its last torrent is deleted or moved, until Alex
 * leaves it.
 */
export function categoryTabs({
  counts,
  categoryOrder,
  selected,
}: {
  counts: CategoryCounts
  categoryOrder: ReadonlyArray<string>
  selected: string
}): Array<CategoryTab> {
  const byKey = new Map(
    counts.categories.map((entry) => [entry.key, entry.count]),
  )
  if (selected !== ALL && isTabCategory(selected) && !byKey.has(selected)) {
    byKey.set(selected, 0)
  }
  return [
    { key: ALL, label: categoryLabel(ALL), count: counts.all },
    ...orderCategoryKeys(byKey.keys(), categoryOrder).map((key) => ({
      key,
      label: categoryLabel(key),
      count: byKey.get(key) ?? 0,
    })),
  ]
}

function hasCategory(counts: CategoryCounts, key: string): boolean {
  return counts.categories.some((entry) => entry.key === key)
}

export interface ResolvedCategory {
  /** The category the screen shows. */
  category: string
  /**
   * The URL names a category no torrent has: the screen shows 「全部」 and
   * the URL is corrected with `replace`.
   */
  invalid: boolean
  /**
   * The category confirmed on screen, to pass back as `confirmed` next
   * time: it keeps its tab when it empties while selected.
   */
  confirmed: string | null
}

/**
 * Which category the screen shows for the URL's `requested` (ALL when the
 * URL has none). While maindata has not answered (`counts` undefined) the
 * URL is kept. A category some torrent has is shown and becomes
 * `confirmed`; one that has none is shown only when it was confirmed while
 * selected (its last torrent went away on screen), otherwise the screen
 * falls back to 「全部」 (a bad link, or a reload after it emptied).
 */
export function resolveCategory({
  requested,
  counts,
  confirmed,
}: {
  requested: string
  counts: CategoryCounts | undefined
  confirmed: string | null
}): ResolvedCategory {
  if (counts === undefined) {
    return { category: requested, invalid: false, confirmed }
  }
  if (requested === ALL || hasCategory(counts, requested)) {
    return { category: requested, invalid: false, confirmed: requested }
  }
  if (confirmed === requested) {
    return { category: requested, invalid: false, confirmed }
  }
  return { category: ALL, invalid: true, confirmed: null }
}
