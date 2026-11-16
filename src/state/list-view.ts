import { createContext, useContext } from 'react'
import { DEFAULT_SORT_VIEW } from '#/shared/list-search'
import type { SortView } from '#/shared/list-search'

// AD-13: the URL owns the sort (`sort`, `dir`). The `_authed` layout reads
// the validated search and provides it here, with a setter that writes the
// URL with `replace`; the header's sort menu and the list read it without
// touching the router. Without a provider (node tests) it is the default
// view and setting does nothing.

export interface ListViewControl {
  /** Stable while the sort and direction stay the same. */
  view: SortView
  setView: (view: SortView) => void
}

export const ListViewContext = createContext<ListViewControl>({
  view: DEFAULT_SORT_VIEW,
  setView: () => {},
})

export function useListView(): ListViewControl {
  return useContext(ListViewContext)
}

/** Changes when the sort or the direction does. */
export function viewKeyOf(view: SortView): string {
  return `${view.sort}:${view.dir}`
}
