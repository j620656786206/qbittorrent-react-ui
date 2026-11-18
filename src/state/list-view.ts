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
// Without a provider (node tests) it is the default view in 「全部」,
// ready, and setting does nothing.

/** The view on screen: the sort, and the category (`ALL` for 「全部」). */
export interface ListView extends SortView {
  category: string
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
   * (showsRememberedHint): the desktop pill adds 「（這個分類記住的）」.
   */
  rememberedHint: boolean
  /**
   * Story 3.3: the desktop header's 設定 button. Opens `/settings` with
   * the list's search in its URL and `fromList` in the history entry; on
   * the settings page it does nothing.
   */
  openSettings: () => void
  /** Story 3.3: the settings page is on screen (the 設定 button is current). */
  settingsOpen: boolean
}

const DEFAULT_VIEW: ListView = Object.freeze({
  ...DEFAULT_SORT_VIEW,
  category: ALL,
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
})

export function useListView(): ListViewControl {
  return useContext(ListViewContext)
}

/** Changes when the sort, the direction or the category does. */
export function viewKeyOf(view: SortView & { category?: string }): string {
  return `${view.sort}:${view.dir}:${view.category ?? ALL}`
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
