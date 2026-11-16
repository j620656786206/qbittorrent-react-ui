import { dirArrow, sortField } from '#/shared/sort-fields'
import type { SortFieldDef, SortFieldId } from '#/shared/sort-fields'
import type { SortView } from '#/shared/list-search'

// EXPERIENCE 排序方向, DESIGN sort-pill and sort-menu: the pill shows only the
// arrow (「排序：做種時間 ↓」); its `aria-label` and tooltip spell out the
// words (「排序：做種時間，久的在前」). 「狀態」 has no direction and no arrow.
// Story 2.3: 「狀態」 is the board (EXPERIENCE 「排序決定長相」), so the pill's
// view word is 「看板」 there and 「列表」 for every other sort.

/** The view a sort shows: 「狀態」 is the board, every other sort the list. */
export type ViewKind = 'board' | 'list'

export function viewKindOf(view: SortView): ViewKind {
  return view.sort === 'state' ? 'board' : 'list'
}

export interface SortPillModel {
  /** Which icon and capsule word the pill shows. */
  kind: ViewKind
  /** The capsule: 「看板」 or 「列表」. */
  viewWord: string
  /** Desktop pill: 「排序：做種時間 ↓」. */
  text: string
  /** Phone pill: 「做種時間 ↓」. */
  shortText: string
  /** Tooltip: 「排序：做種時間，久的在前」. */
  title: string
  /**
   * 「排序：做種時間，久的在前，列表」 or 「排序：狀態，看板」 (the view word
   * last, as the mockups).
   */
  ariaLabel: string
}

/** The direction in words, or `null` for a field without one. */
export function directionWords(view: SortView): string | null {
  const field = sortField(view.sort)
  return field.directional ? field.words[view.dir] : null
}

export function sortPillModel(view: SortView): SortPillModel {
  const field = sortField(view.sort)
  const words = directionWords(view)
  const arrow = field.directional ? ` ${dirArrow(view.dir)}` : ''
  const title = `排序：${field.label}${words ? `，${words}` : ''}`
  const kind = viewKindOf(view)
  const viewWord = kind === 'board' ? '看板' : '列表'
  return {
    kind,
    viewWord,
    text: `排序：${field.label}${arrow}`,
    shortText: `${field.label}${arrow}`,
    title,
    ariaLabel: `${title}，${viewWord}`,
  }
}

/**
 * What a click on a menu item does: the selected one flips the direction
 * and keeps the menu open; another one takes its default direction, closes
 * the menu. Both scroll the list to the top (sort-menu.tsx). The selected
 * field without a direction changes nothing (`null`).
 */
export function pickSort(
  current: SortView,
  id: SortFieldId,
): { view: SortView; keepOpen: boolean } | null {
  const field: SortFieldDef = sortField(id)
  // The selected field without a direction (狀態): nothing to flip.
  if (id === current.sort && !field.directional) return null
  if (id === current.sort) {
    return {
      view: { sort: id, dir: current.dir === 'desc' ? 'asc' : 'desc' },
      keepOpen: true,
    }
  }
  return { view: { sort: id, dir: field.defaultDir }, keepOpen: false }
}
