import { slimSortValue, sortKeyOf } from '#/lib/sort-values'
import { columnOf, statusOf } from '#/lib/torrent-status'
import { nameMatches, searchNeedle } from '#/lib/name-search'
import type { Maindata } from '#/lib/maindata-merge'
import type { BoardColumn } from '#/lib/torrent-status'
import { ALL } from '#/shared/categories'
import type { SlimTorrent } from '#/shared/maindata'
import { isExtraSortField, sortField } from '#/shared/sort-fields'
import type { SortView } from '#/shared/list-search'
import type { SortValue } from '#/shared/sort-keys'

// AR-41, AD-13: the only place torrents are ordered. Every screen that needs
// "the torrents you can see, in order" (list, board, detail's "N of M",
// arrow keys) takes this hash array. Archived torrents (non-private
// `missingFiles`) are never visible and never counted.
//
// Order: the view's field in its direction; no value last in both
// directions; ties by `added_on` newest first, then `hash` ascending, never
// reversed. `desc` puts the field's first direction word first (large, new,
// long, high, A to Z, yes); see src/shared/sort-fields.ts.

/**
 * What the visible list depends on. Story 3.2: `category`, `ALL` (the
 * default) for every torrent, `''` for uncategorized ones. Story 3.5:
 * `query`, the search keyword (src/lib/name-search.ts); empty or absent is
 * no filter.
 */
export type TorrentView = SortView & { category?: string; query?: string }

/** Story 3.2: the torrent is in `category` (`ALL` holds every torrent). */
export function inCategory(
  torrent: Pick<SlimTorrent, 'category'>,
  category: string,
): boolean {
  return category === ALL || torrent.category === category
}

/** An extra sort's values by hash (getSortKeys, merged). */
export type SortKeys = Readonly<Record<string, SortValue>>

function isVisible(
  torrent: SlimTorrent,
  stateBeforeMove: Maindata['stateBeforeMove'],
): boolean {
  return statusOf(torrent, stateBeforeMove) !== 'archived'
}

interface Entry {
  hash: string
  key: number | string | null
  added: number
}

// Text compares like a person reads it: case and accents aside, numbers by
// value (`S01E2` before `S01E10`).
const collator = new Intl.Collator('en', { numeric: true, sensitivity: 'base' })

function compareKeys(
  a: number | string,
  b: number | string,
  plain: boolean,
): number {
  if (typeof a === 'number' && typeof b === 'number') {
    // Larger first for `desc`; Infinity - Infinity would be NaN.
    return a === b ? 0 : a > b ? -1 : 1
  }
  if (typeof a === 'string' && typeof b === 'string') {
    // Hashes are hex: code units, not numbers or letters as a person reads.
    if (plain) return a === b ? 0 : a < b ? -1 : 1
    return collator.compare(a, b)
  }
  // Mixed types never happen for one field; keep the order total anyway.
  return typeof a === 'number' ? -1 : 1
}

function tieBreak(a: Entry, b: Entry): number {
  if (a.added !== b.added) return b.added - a.added
  if (a.hash === b.hash) return 0
  return a.hash < b.hash ? -1 : 1
}

/** No value last in both directions, then the field, then the tie rule. */
function compareEntries(
  a: Entry,
  b: Entry,
  sign: 1 | -1,
  plain: boolean,
): number {
  if (a.key === null || b.key === null) {
    if (a.key !== b.key) return a.key === null ? 1 : -1
    return tieBreak(a, b)
  }
  return sign * compareKeys(a.key, b.key, plain) || tieBreak(a, b)
}

export function selectVisibleTorrents(
  maindata: Maindata,
  view: TorrentView,
  sortKeys?: SortKeys,
): Array<string> {
  const { torrents, stateBeforeMove } = maindata
  const { sort, dir, category = ALL, query } = view
  const needle = searchNeedle(query)
  const extra = isExtraSortField(sort)
  const plain = sortField(sort).kind === 'hash'
  const sign = dir === 'desc' ? 1 : -1
  const entries: Array<Entry> = []
  for (const torrent of Object.values(torrents)) {
    if (!inCategory(torrent, category)) continue
    if (!nameMatches(torrent, needle)) continue
    if (!isVisible(torrent, stateBeforeMove)) continue
    const value: SortValue | undefined = extra
      ? sortKeys && Object.hasOwn(sortKeys, torrent.hash)
        ? sortKeys[torrent.hash]
        : undefined
      : slimSortValue(sort, torrent, stateBeforeMove)
    entries.push({
      hash: torrent.hash,
      key: sortKeyOf(sort, value),
      added: torrent.added_on,
    })
  }
  entries.sort((a, b) => compareEntries(a, b, sign, plain))
  return entries.map((entry) => entry.hash)
}

/** The board's five columns, each a hash array in its fixed order. */
export type BoardColumns = Readonly<Record<BoardColumn, ReadonlyArray<string>>>

/**
 * EXPERIENCE 排序和檢視 (memlog #116, #125): each column's fixed order, a
 * time field newest (or longest) first. Not user-editable.
 */
export const BOARD_COLUMN_ORDER = {
  attention: 'last_activity',
  downloading: 'added_on',
  seeding: 'seeding_time',
  done: 'completion_on',
  archived: 'completion_on',
} as const satisfies Record<BoardColumn, keyof SlimTorrent>

/** A time or duration: 0 or negative (qBittorrent's "never") is no value. */
function boardKey(value: number): number | null {
  return value > 0 && Number.isFinite(value) ? value : null
}

/**
 * Story 2.3, AR-41: the board's columns. A torrent's column is classify()'s
 * (`statusOf` + `columnOf`, never `torrent.state`); inside a column the
 * column's field orders it, newest or longest first, no value last, ties
 * like `selectVisibleTorrents` (`added_on` newest, then `hash`). Archived
 * torrents get their own column here: only the desktop board shows them.
 * Story 3.2: only `category`'s torrents (`ALL`, the default: every one), in
 * the 已整理 column too. Story 3.5: only names holding `query` (empty is
 * every name), the 已整理 column too.
 */
export function selectBoardColumns(
  maindata: Maindata,
  category: string = ALL,
  query = '',
): BoardColumns {
  const { torrents, stateBeforeMove } = maindata
  const needle = searchNeedle(query)
  const entries: Record<BoardColumn, Array<Entry>> = {
    attention: [],
    downloading: [],
    seeding: [],
    done: [],
    archived: [],
  }
  for (const torrent of Object.values(torrents)) {
    if (!inCategory(torrent, category)) continue
    if (!nameMatches(torrent, needle)) continue
    const column = columnOf(statusOf(torrent, stateBeforeMove))
    entries[column].push({
      hash: torrent.hash,
      key: boardKey(torrent[BOARD_COLUMN_ORDER[column]]),
      added: torrent.added_on,
    })
  }
  const ordered = (column: BoardColumn) =>
    entries[column]
      .sort((a, b) => compareEntries(a, b, 1, false))
      .map((entry) => entry.hash)
  return {
    attention: ordered('attention'),
    downloading: ordered('downloading'),
    seeding: ordered('seeding'),
    done: ordered('done'),
    archived: ordered('archived'),
  }
}

/**
 * Story 2.4: the board column that holds `hash` right now (the detail's
 * range for 「第 N 個」 and ‹ ›), or `null` when no column does (deleted).
 */
export function boardColumnOf(
  columns: BoardColumns,
  hash: string,
): BoardColumn | null {
  for (const column of BOARD_COLUMNS) {
    if (columns[column].includes(hash)) return column
  }
  return null
}

const BOARD_COLUMNS = [
  'attention',
  'downloading',
  'seeding',
  'done',
  'archived',
] as const satisfies ReadonlyArray<BoardColumn>

/** The 「全部」 count: every torrent except archived ones. */
export function countAll(maindata: Maindata): number {
  let count = 0
  for (const torrent of Object.values(maindata.torrents)) {
    if (isVisible(torrent, maindata.stateBeforeMove)) count += 1
  }
  return count
}

/**
 * Story 3.5: how many of `category`'s torrents hold `query` in their name
 * (empty: every one), archived ones only with `withArchived` (the desktop
 * board shows them). No sorting: the header's count and the "is this
 * category empty at all" check.
 */
export function countMatches(
  maindata: Maindata,
  category: string,
  query: string,
  withArchived: boolean,
): number {
  const needle = searchNeedle(query)
  let count = 0
  for (const torrent of Object.values(maindata.torrents)) {
    if (!inCategory(torrent, category)) continue
    if (!nameMatches(torrent, needle)) continue
    if (!withArchived && !isVisible(torrent, maindata.stateBeforeMove)) continue
    count += 1
  }
  return count
}
