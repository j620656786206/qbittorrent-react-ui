import { listSearchSchema } from '#/shared/list-search'
import type { ListSearch } from '#/shared/list-search'

// Story 3.3 (Claude 代決): the list URL Alex left for the settings page, so
// the page's back button returns to the same category, sort, direction and
// viewed torrent. Kept in memory only (not localStorage, AD-13): a reload
// or a typed `/settings` starts without it, and back goes to `/`. The
// `_authed` layout records it when the header's 設定 button leaves the list.

let returnSearch: ListSearch = {}

/** Records the list's search (validated; a bad param is dropped). */
export function rememberListSearch(search: Readonly<Record<string, unknown>>) {
  const parsed: ListSearch = listSearchSchema.parse(search)
  const kept: ListSearch = {}
  if (parsed.sort !== undefined) kept.sort = parsed.sort
  if (parsed.dir !== undefined) kept.dir = parsed.dir
  if (parsed.hash !== undefined) kept.hash = parsed.hash
  if (parsed.category !== undefined) kept.category = parsed.category
  returnSearch = kept
}

/** The search of the list URL to go back to (`{}`: plain `/`). */
export function listReturnSearch(): ListSearch {
  return returnSearch
}

/** Tests only: forget the recorded list URL. */
export function clearListReturn(): void {
  returnSearch = {}
}
