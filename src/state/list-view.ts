import { createContext, useContext } from 'react'
import type { CategoryTab } from '#/lib/category-tabs'
import { ALL } from '#/shared/categories'
import { DEFAULT_SORT_VIEW } from '#/shared/list-search'
import type { SortView } from '#/shared/list-search'

// AD-13: the URL owns the sort on screen (`sort`, `dir`) and, since story
// 3.2, the category (`category`). The `_authed` layout reads the validated
// search and provides it here, with setters that write the URL with
// `replace`; the header's sort menu, the category tabs and the list read it
// without touching the router. Story 3.1: a URL without `sort` shows the
// remembered sort of the category (settings.json), so the view is only
// final once the settings answered (`viewReady`); a manual pick
// (`pickView`) also saves the category's remembered sort, an app-driven
// change (`setView`) never does. Story 3.2: `selectCategory` is a tab
// click, and the tabs (order, counts) come through `CategoryTabsContext`,
// apart from the view, so a count changing re-renders only the tab row.
// Story 3.3: the settings page sits under the same layout (header as
// usual) and shows the list Alex came from, so the setters always write
// the list's URL (`/`): a tab click or a sort pick there goes back to it.
// Story 3.5: the search keyword is the URL's `q` (`view.query`, trimmed,
// `''` for none) and filters inside the selectors; whether the header's
// search box is open is the layout's (open while a keyword is set, and
// from the magnifier or `/` until it is closed).
// Without a provider (node tests) it is the default view in 「全部」,
// ready, and setting does nothing.

/**
 * The view on screen: the sort, the category (`ALL` for 「全部」) and, since
 * story 3.5, the search keyword (trimmed; `''` for none).
 */
export interface ListView extends SortView {
  category: string
  query: string
}

export interface ListViewControl {
  /** Stable while the sort, direction and category stay the same. */
  view: ListView
  /**
   * The settings answered (or failed), so `view` will not change by itself
   * on first load: until then the list and the board show their skeleton.
   */
  viewReady: boolean
  /** An app-driven change: writes the URL only. */
  setView: (view: SortView) => void
  /**
   * Alex picked the sort (menu, sheet, tapping the selected item to flip):
   * writes the URL and remembers it for the category.
   */
  pickView: (view: SortView) => void
  /**
   * Story 3.2: a category tab click. Switches to the category's remembered
   * sort (else 「狀態」), back to the top, and replays the entrance; the
   * selected category does nothing.
   */
  selectCategory: (category: string) => void
  /**
   * Story 3.2: the app switched the sort to the category's remembered one
   * (showsRememberedHint): the desktop pill adds 「（這個分類記住的）」;
   * story 3.4: the phone shows a line under the third row.
   */
  rememberedHint: boolean
  /**
   * Story 3.3: the desktop header's 設定 button (story 3.4: and the phone
   * category sheet's 「設定」 row). Opens `/settings` with
   * the list's search in its URL and `fromList` in the history entry; on
   * the settings page it does nothing.
   */
  openSettings: () => void
  /** Story 3.3: the settings page is on screen (the 設定 button is current). */
  settingsOpen: boolean
  /** Story 3.5: the header's search box is open. */
  searchOpen: boolean
  /** Story 3.5: opens the search box (the magnifier, or `/` on desktop). */
  openSearch: () => void
  /**
   * Story 3.5: the keyword as typed. Writes `q` trimmed with `replace`
   * (removed when that is empty) and puts the list back at the top.
   */
  setQuery: (text: string) => void
  /** Story 3.5: ✕, 「取消」 or `Esc`: clears the keyword and closes the box. */
  closeSearch: () => void
}

const DEFAULT_VIEW: ListView = Object.freeze({
  ...DEFAULT_SORT_VIEW,
  category: ALL,
  query: '',
})

export const ListViewContext = createContext<ListViewControl>({
  view: DEFAULT_VIEW,
  viewReady: true,
  setView: () => {},
  pickView: () => {},
  selectCategory: () => {},
  rememberedHint: false,
  openSettings: () => {},
  settingsOpen: false,
  searchOpen: false,
  openSearch: () => {},
  setQuery: () => {},
  closeSearch: () => {},
})

export function useListView(): ListViewControl {
  return useContext(ListViewContext)
}

/**
 * Changes when the sort, the direction, the category or (story 3.5) the
 * keyword does: Alex's own change, applied at once even while the order
 * is frozen.
 */
export function viewKeyOf(
  view: SortView & { category?: string; query?: string },
): string {
  return JSON.stringify([
    view.sort,
    view.dir,
    view.category ?? ALL,
    view.query ?? '',
  ])
}

/**
 * Story 3.2: the desktop category tabs in order, or `undefined` before the
 * first maindata answer (the row shows 「全部」 with a skeleton count).
 */
export const CategoryTabsContext = createContext<
  ReadonlyArray<CategoryTab> | undefined
>(undefined)

export function useCategoryTabs(): ReadonlyArray<CategoryTab> | undefined {
  return useContext(CategoryTabsContext)
}
