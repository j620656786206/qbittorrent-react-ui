import { z } from '#/shared/zod'
import {
  ALL,
  categoryOrderEntrySchema,
  hasControlChar,
} from '#/shared/categories'
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
// how to correct the address bar with `replace`. Story 3.2: `category`, the
// selected category tab. Absent is 「全部」 (`ALL` never appears in the URL);
// uncategorized is `category=` with an empty value (Claude 代決; the
// router's default serializer keeps an empty string as `category=` and
// reads it back as `''`). The router also JSON-parses values, so a typed
// or shared `?category=2024` (or `true`, `null`) arrives as a number,
// boolean or null: `category` turns those back into the text typed (the
// router writes such a name quoted, `category=%222024%22`, which reads back
// as text). Absent is the key missing, never `null`. Story 3.5: `q`, the
// in-list search keyword, read back to text the same way and trimmed; a
// keyword that trims to nothing is no keyword (the URL drops it). It is
// matched as plain text, never as a pattern (src/lib/name-search.ts).
// https://tanstack.com/router/latest/docs/framework/react/guide/search-params
// https://zod.dev/api

export interface SortView {
  sort: SortFieldId
  dir: SortDir
}

/**
 * No `sort` in the URL and nothing remembered: 「狀態」, the board (story
 * 2.3). Story 3.1: a URL without `sort` shows the category's remembered
 * sort first. 「狀態」 has no direction: `dir` is its default.
 */
export const DEFAULT_SORT_VIEW: SortView = Object.freeze({
  sort: 'state',
  dir: sortField('state').defaultDir,
})

/**
 * A `category` value as the router parsed it, back to the text in the
 * address bar: a number, boolean or `null` from JSON parsing becomes its
 * text; anything else stays as is.
 */
export function categoryText(value: unknown): unknown {
  if (value === null) return 'null'
  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value)
  }
  return value
}

const categorySchema = z.preprocess(categoryText, categoryOrderEntrySchema)

/** A `q` value as the router parsed it, back to text and trimmed. */
function queryText(value: unknown): unknown {
  const text = categoryText(value)
  return typeof text === 'string' ? text.trim() : text
}

/** Story 3.5: the longest keyword the URL keeps (the field stops there too). */
export const MAX_QUERY_LENGTH = 200

/**
 * Story 3.5: the keyword, trimmed; empty (or only spaces), longer than
 * MAX_QUERY_LENGTH or holding a control character is invalid.
 */
const querySchema = z.preprocess(
  queryText,
  z
    .string()
    .min(1)
    .max(MAX_QUERY_LENGTH)
    .refine((text) => !hasControlChar(text), 'control character'),
)

export const listSearchSchema = z.object({
  sort: z.enum(SORT_FIELD_IDS).optional().catch(undefined),
  dir: z.enum(SORT_DIRS).optional().catch(undefined),
  /** The viewed torrent (story 2.4); 40 or 64 lowercase hex. */
  hash: z.string().regex(TORRENT_HASH_PATTERN).optional().catch(undefined),
  /**
   * Story 3.2: the selected category, a name or `''` (uncategorized);
   * absent is 「全部」.
   */
  category: categorySchema.optional().catch(undefined),
  /**
   * Story 3.5: the search keyword, trimmed; absent (or only spaces) is no
   * search.
   */
  q: querySchema.optional().catch(undefined),
})

export type ListSearch = z.infer<typeof listSearchSchema>

/**
 * Story 3.6: the params that name a place in the list (a category, a sort,
 * a viewed torrent). A URL without any of them is bare; `q` alone is not a
 * place.
 */
export const PLACE_KEYS = [
  'category',
  'sort',
  'hash',
] as const satisfies ReadonlyArray<keyof ListSearch>

/** `choice` as a view: a field without a direction (狀態) takes its default. */
export function normalizeSortView(choice: SortView): SortView {
  const field = sortField(choice.sort)
  return field.directional || choice.dir === field.defaultDir
    ? choice
    : { sort: choice.sort, dir: field.defaultDir }
}

/**
 * The view a validated search means (story 3.1): the URL's `sort` when it
 * has one (`dir` missing, or on a field without a direction, is the field's
 * default); otherwise `remembered`, the category's remembered sort;
 * otherwise 「狀態」. A `dir` without a `sort` means nothing.
 */
export function sortViewOf(
  search: ListSearch,
  remembered?: SortView | null,
): SortView {
  if (search.sort === undefined) {
    return remembered ? normalizeSortView(remembered) : DEFAULT_SORT_VIEW
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

const isCategory = (value: unknown): boolean =>
  categorySchema.safeParse(value).success

/** The keyword already reads as itself: text, trimmed, not empty. */
const isCleanQuery = (value: unknown): boolean => {
  const parsed = querySchema.safeParse(value)
  return parsed.success && parsed.data === categoryText(value)
}

/**
 * The raw (unvalidated) search with the bad params removed, or `null` when
 * nothing needs fixing. A bad `sort` falls back to the remembered sort or
 * 「狀態」, so its `dir` goes too; a `dir` without a `sort` means nothing
 * (story 3.1: the whole view then comes from the remembered sort) and goes;
 * a bad `dir`, or any `dir` on a field without a direction, goes alone; a
 * `hash` that is not 40 or 64 lowercase hex goes alone; a `category` that
 * is no category name (story 3.2: a control character, too long, `ALL`'s
 * key, not a string) goes alone, so the screen is 「全部」; a `q` with
 * spaces around it is trimmed, one that is only spaces, too long, holds a
 * control character or is not text goes (story 3.5). Other params stay.
 */
export function fixListSearch(
  raw: Readonly<Record<string, unknown>>,
): Record<string, unknown> | null {
  const badSort = 'sort' in raw && !isSortFieldId(raw.sort)
  // The field `dir` applies to, if any.
  const sortId = isSortFieldId(raw.sort) ? raw.sort : null
  // No field, or one without a direction (狀態): `dir` goes too.
  const badDir =
    'dir' in raw &&
    (!isDir(raw.dir) || sortId === null || !sortField(sortId).directional)
  const badHash = 'hash' in raw && !isHash(raw.hash)
  const badCategory = 'category' in raw && !isCategory(raw.category)
  const badQuery = 'q' in raw && !isCleanQuery(raw.q)
  if (!badSort && !badDir && !badHash && !badCategory && !badQuery) {
    return null
  }
  const {
    sort: _sort,
    dir: _dir,
    hash: _hash,
    category: _c,
    q: _q,
    ...rest
  } = raw
  const query = querySchema.safeParse(raw.q)
  return {
    ...rest,
    ...('sort' in raw && !badSort ? { sort: raw.sort } : {}),
    ...('dir' in raw && !badSort && !badDir ? { dir: raw.dir } : {}),
    ...('hash' in raw && !badHash ? { hash: raw.hash } : {}),
    ...('category' in raw && !badCategory ? { category: raw.category } : {}),
    ...('q' in raw && query.success
      ? { q: badQuery ? query.data : raw.q }
      : {}),
  }
}

/** Story 3.2: the selected category of a validated search (`ALL` if none). */
export function categoryOfSearch(search: Pick<ListSearch, 'category'>): string {
  return search.category ?? ALL
}

/**
 * Story 3.2: the search with `category` set, or removed for 「全部」. Every
 * other param stays.
 */
export function searchWithCategory(
  previous: Readonly<Record<string, unknown>>,
  category: string,
): Record<string, unknown> {
  const { category: _category, ...rest } = previous
  return category === ALL ? rest : { ...rest, category }
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

/**
 * Story 3.5: the search with `q` set to `text` trimmed, or removed when
 * that is empty. Every other param stays.
 */
export function searchWithQuery(
  previous: Readonly<Record<string, unknown>>,
  text: string,
): Record<string, unknown> {
  const { q: _q, ...rest } = previous
  const query = text.trim()
  return query === '' ? rest : { ...rest, q: query }
}
