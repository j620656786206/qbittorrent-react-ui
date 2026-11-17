import { z } from '#/shared/zod'
import {
  SORT_DIRS,
  SORT_FIELD_IDS,
  isSortFieldId,
  sortField,
} from '#/shared/sort-fields'
import type { SortDir, SortFieldId } from '#/shared/sort-fields'
import { TORRENT_HASH_PATTERN } from '#/shared/torrent-hash'

// AD-13, AR-49: the list's `sort` and `dir` search params, and since story
// 2.4 `hash`, the torrent the detail shows. The `_authed` layout validates
// with this schema (a bad value reads as missing), and `fixListSearch` says
// how to correct the address bar with `replace`.
// https://tanstack.com/router/latest/docs/framework/react/guide/search-params

export interface SortView {
  sort: SortFieldId
  dir: SortDir
}

/**
 * No `sort` in the URL: 「狀態」, the board (story 2.3; Epic 3 changes this to
 * the category's remembered sort). 「狀態」 has no direction: `dir` is its
 * default and a `dir` in the URL is ignored and removed.
 */
export const DEFAULT_SORT_VIEW: SortView = Object.freeze({
  sort: 'state',
  dir: sortField('state').defaultDir,
})

export const listSearchSchema = z.object({
  sort: z.enum(SORT_FIELD_IDS).optional().catch(undefined),
  dir: z.enum(SORT_DIRS).optional().catch(undefined),
  /** The viewed torrent (story 2.4); 40 or 64 lowercase hex. */
  hash: z.string().regex(TORRENT_HASH_PATTERN).optional().catch(undefined),
})

export type ListSearch = z.infer<typeof listSearchSchema>

/**
 * The view a validated search means; `dir` missing, or on a field without
 * a direction, is the field's default.
 */
export function sortViewOf(search: ListSearch): SortView {
  if (search.sort === undefined) {
    return search.dir === undefined ||
      !sortField(DEFAULT_SORT_VIEW.sort).directional
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

const isHash = (value: unknown): value is string =>
  typeof value === 'string' && TORRENT_HASH_PATTERN.test(value)

/**
 * The raw (unvalidated) search with the bad params removed, or `null` when
 * nothing needs fixing. A bad `sort` falls back to the default, so its `dir`
 * goes too; a bad `dir`, or any `dir` on a field without a direction, goes
 * alone; a `hash` that is not 40 or 64 lowercase hex goes alone. Other
 * params stay.
 */
export function fixListSearch(
  raw: Readonly<Record<string, unknown>>,
): Record<string, unknown> | null {
  const badSort = 'sort' in raw && !isSortFieldId(raw.sort)
  // The field `dir` applies to: the URL's, or the default when it has none.
  const sortId = isSortFieldId(raw.sort)
    ? raw.sort
    : 'sort' in raw
      ? null
      : DEFAULT_SORT_VIEW.sort
  // A field without a direction (狀態) ignores `dir`, so it goes too.
  const badDir =
    'dir' in raw &&
    (!isDir(raw.dir) || (sortId !== null && !sortField(sortId).directional))
  const badHash = 'hash' in raw && !isHash(raw.hash)
  if (!badSort && !badDir && !badHash) return null
  const { sort: _sort, dir: _dir, hash: _hash, ...rest } = raw
  return {
    ...rest,
    ...('sort' in raw && !badSort ? { sort: raw.sort } : {}),
    ...('dir' in raw && !badSort && !badDir ? { dir: raw.dir } : {}),
    ...('hash' in raw && !badHash ? { hash: raw.hash } : {}),
  }
}

/**
 * The search with the viewed torrent set, or removed (`null`: the detail
 * closed). Every other param stays (a sort change keeps `hash`, a detail
 * change keeps the sort).
 */
export function searchWithHash(
  previous: Readonly<Record<string, unknown>>,
  hash: string | null,
): Record<string, unknown> {
  const { hash: _hash, ...rest } = previous
  return hash === null ? rest : { ...rest, hash }
}
