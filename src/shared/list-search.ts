import { z } from '#/shared/zod'
import {
  SORT_DIRS,
  SORT_FIELD_IDS,
  isSortFieldId,
  sortField,
} from '#/shared/sort-fields'
import type { SortDir, SortFieldId } from '#/shared/sort-fields'

// AD-13, AR-49: the list's `sort` and `dir` search params. The `_authed`
// layout validates with this schema (a bad value reads as missing), and
// `fixListSearch` says how to correct the address bar with `replace`.
// https://tanstack.com/router/latest/docs/framework/react/guide/search-params

export interface SortView {
  sort: SortFieldId
  dir: SortDir
}

/**
 * No `sort` in the URL: added time, newest first (Story 2.3 changes this to
 * `state`, Epic 3 to the category's remembered sort).
 */
export const DEFAULT_SORT_VIEW: SortView = Object.freeze({
  sort: 'added_on',
  dir: 'desc',
})

export const listSearchSchema = z.object({
  sort: z.enum(SORT_FIELD_IDS).optional().catch(undefined),
  dir: z.enum(SORT_DIRS).optional().catch(undefined),
})

export type ListSearch = z.infer<typeof listSearchSchema>

/**
 * The view a validated search means; `dir` missing, or on a field without
 * a direction, is the field's default.
 */
export function sortViewOf(search: ListSearch): SortView {
  if (search.sort === undefined) {
    return search.dir === undefined
      ? DEFAULT_SORT_VIEW
      : { sort: DEFAULT_SORT_VIEW.sort, dir: search.dir }
  }
  const field = sortField(search.sort)
  // A field without a direction (狀態) always takes its default.
  return {
    sort: search.sort,
    dir: field.directional
      ? (search.dir ?? field.defaultDir)
      : field.defaultDir,
  }
}

const isDir = (value: unknown): value is SortDir =>
  value === 'asc' || value === 'desc'

/**
 * The raw (unvalidated) search with the bad params removed, or `null` when
 * nothing needs fixing. A bad `sort` falls back to the default, so its `dir`
 * goes too; a bad `dir`, or any `dir` on a field without a direction, goes
 * alone. Other params stay.
 */
export function fixListSearch(
  raw: Readonly<Record<string, unknown>>,
): Record<string, unknown> | null {
  const badSort = 'sort' in raw && !isSortFieldId(raw.sort)
  // A field without a direction (狀態) ignores `dir`, so it goes too.
  const badDir =
    'dir' in raw &&
    (!isDir(raw.dir) ||
      (isSortFieldId(raw.sort) && !sortField(raw.sort).directional))
  if (!badSort && !badDir) return null
  const { sort: _sort, dir: _dir, ...rest } = raw
  return {
    ...rest,
    ...(badSort ? {} : { sort: raw.sort }),
    ...(badSort || badDir ? {} : { dir: raw.dir }),
  }
}
