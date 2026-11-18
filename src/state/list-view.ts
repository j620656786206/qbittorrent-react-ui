import { createContext, useContext } from 'react'
import { DEFAULT_SORT_VIEW } from '#/shared/list-search'
import type { SortView } from '#/shared/list-search'

// AD-13: the URL owns the sort on screen (`sort`, `dir`). The `_authed`
// layout reads the validated search and provides it here, with setters that
// write the URL with `replace`; the header's sort menu and the list read it
// without touching the router. Story 3.1: a URL without `sort` shows the
// remembered sort of 「全部」 (settings.json), so the view is only final
// once the settings answered (`viewReady`); a manual pick (`pickView`) also
// saves the remembered sort, an app-driven change (`setView`) never does.
// Without a provider (node tests) it is the default view, ready, and
// setting does nothing.

export interface ListViewControl {
  /** Stable while the sort and direction stay the same. */
  view: SortView
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
}

export const ListViewContext = createContext<ListViewControl>({
  view: DEFAULT_SORT_VIEW,
  viewReady: true,
  setView: () => {},
  pickView: () => {},
})

export function useListView(): ListViewControl {
  return useContext(ListViewContext)
}

/** Changes when the sort or the direction does. */
export function viewKeyOf(view: SortView): string {
  return `${view.sort}:${view.dir}`
}
