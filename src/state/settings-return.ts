import { listSearchSchema } from '#/shared/list-search'
import type { ListSearch } from '#/shared/list-search'

// Story 3.3 (Claude 代決): the list URL Alex left for the settings page, so
// the page's back button returns to the same category, sort, direction and
// viewed torrent. Kept in memory only (not localStorage, AD-13): a reload
// or a typed `/settings` starts without it, and back goes to `/`. The
// `_authed` layout records it on every change of the list's search (so a
// tab or sort click on the settings page, or a later visit through the
// browser history, keeps it current), and once more when the header's 設定
// button leaves the list, which also notes that the history entry before
// the settings page is that list: the back button then goes back in the
// history instead of adding a second copy of the list.

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

let openedFromList = false

/** The 設定 button opened the settings page from the list (`true`). */
export function markOpenedFromList(fromList: boolean): void {
  openedFromList = fromList
}

/** The history entry before the settings page is the remembered list. */
export function wasOpenedFromList(): boolean {
  return openedFromList
}

/** The search of the list URL to go back to (`{}`: plain `/`). */
export function listReturnSearch(): ListSearch {
  return returnSearch
}

/** Tests only: forget the recorded list URL. */
export function clearListReturn(): void {
  returnSearch = {}
  openedFromList = false
}
