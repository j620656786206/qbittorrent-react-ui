import { slimSortValue, sortKeyOf } from '#/lib/sort-values'
import { statusOf } from '#/lib/torrent-status'
import type { Maindata } from '#/lib/maindata-merge'
import type { SlimTorrent } from '#/shared/maindata'
import { isExtraSortField } from '#/shared/sort-fields'
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

/** What the visible list depends on; category and search join in Epic 3. */
export type TorrentView = SortView

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

function compareKeys(a: number | string, b: number | string): number {
  if (typeof a === 'number' && typeof b === 'number') {
    // Larger first for `desc`; Infinity - Infinity would be NaN.
    return a === b ? 0 : a > b ? -1 : 1
  }
  if (typeof a === 'string' && typeof b === 'string') {
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

export function selectVisibleTorrents(
  maindata: Maindata,
  view: TorrentView,
  sortKeys?: SortKeys,
): Array<string> {
  const { torrents, stateBeforeMove } = maindata
  const { sort, dir } = view
  const extra = isExtraSortField(sort)
  const sign = dir === 'desc' ? 1 : -1
  const entries: Array<Entry> = []
  for (const torrent of Object.values(torrents)) {
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
  entries.sort((a, b) => {
    if (a.key === null || b.key === null) {
      if (a.key !== b.key) return a.key === null ? 1 : -1
      return tieBreak(a, b)
    }
    return sign * compareKeys(a.key, b.key) || tieBreak(a, b)
  })
  return entries.map((entry) => entry.hash)
}

/** The 「全部」 count: every torrent except archived ones. */
export function countAll(maindata: Maindata): number {
  let count = 0
  for (const torrent of Object.values(maindata.torrents)) {
    if (isVisible(torrent, maindata.stateBeforeMove)) count += 1
  }
  return count
}
