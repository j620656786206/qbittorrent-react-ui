import { categoryLabel } from '#/lib/category-tabs'
import { ALL } from '#/shared/categories'
import type { SlimTorrent } from '#/shared/maindata'

// Story 3.5 (EXPERIENCE search-box): the in-list search matches the
// torrent's name only, ignoring case and width (both sides NFKC-normalized,
// so a full-width IME `Ｓ０１` is `S01`, then `toLowerCase`, the same on
// every device locale) and the spaces around the keyword; an empty keyword is no filter. The
// keyword is plain text: `.`, `*`, `(` or `<script>` match themselves
// (`String.prototype.includes`, never a RegExp). Only
// src/lib/visible-torrents.ts filters with it; features never do.

/** Text as it is compared: NFKC (width and compatibility forms), lowercase. */
function foldText(text: string): string {
  return text.normalize('NFKC').toLowerCase()
}

/**
 * What a name is compared with: the keyword trimmed and folded, or `null`
 * when it is empty (no filter).
 */
export function searchNeedle(query: string | undefined): string | null {
  const trimmed = query?.trim() ?? ''
  return trimmed === '' ? null : foldText(trimmed)
}

// Each torrent's folded name, kept per torrent object: the merge keeps an
// unchanged torrent's object, so a keystroke folds no name twice.
const lowerNames = new WeakMap<object, { name: string; lower: string }>()

function lowerName(torrent: Pick<SlimTorrent, 'name'>): string {
  const cached = lowerNames.get(torrent)
  if (cached !== undefined && cached.name === torrent.name) return cached.lower
  const lower = foldText(torrent.name)
  lowerNames.set(torrent, { name: torrent.name, lower })
  return lower
}

/** The torrent's name holds `needle` (from `searchNeedle`); `null` matches all. */
export function nameMatches(
  torrent: Pick<SlimTorrent, 'name'>,
  needle: string | null,
): boolean {
  return needle === null || lowerName(torrent).includes(needle)
}

/**
 * EXPERIENCE 搜尋沒結果: 「『<keyword>』在 <category> 找不到」 in a category,
 * 「找不到『<keyword>』」 in 「全部」. The keyword is the trimmed one.
 */
export function noResultText(query: string, category: string): string {
  const keyword = query.trim()
  return category === ALL
    ? `找不到『${keyword}』`
    : `『${keyword}』在 ${categoryLabel(category)} 找不到`
}
