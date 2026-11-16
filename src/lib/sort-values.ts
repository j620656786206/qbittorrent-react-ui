import {
  hasNoSortValue,
  seedingLimitSeconds,
  sortableRatio,
} from '#/lib/format'
import { statusOf } from '#/lib/torrent-status'
import type { TorrentStatusId } from '#/lib/torrent-status'
import type { SlimTorrent } from '#/shared/maindata'
import type { ExtraSortFieldId, SortFieldId } from '#/shared/sort-fields'
import type { SortExtras, SortValue } from '#/shared/sort-keys'

// Story 2.1, AR-46: the value each of the 51 sorts compares, pure. Slim
// fields read the slim torrent; extra fields read the container's extras
// record (the server calls `extraSortValue` when it answers getSortKeys).
// Derived values follow VueTorrent v2.37.0
// (https://github.com/VueTorrent/VueTorrent/blob/v2.37.0/src/composables/TorrentBuilder.ts):
//   avg_dlspeed   = downloaded / (time_active - seeding_time)
//   avg_upspeed   = uploaded / time_active
//   global_speed  = dlspeed + upspeed
//   global_volume = downloaded + uploaded
//   *_basename    = the last segment of the path
//   tracker_domain: VueTorrent's getDomainBody also drops the top-level
//   domain; here it is the URL's whole hostname (spec 2.1 row S10).
// A zero or negative duration has no average (VueTorrent divides by -1).

/** The tracker URL's hostname, lowercased; `null` for an empty or malformed URL. */
export function trackerDomainOf(tracker: string): string | null {
  if (tracker === '') return null
  try {
    const { hostname } = new URL(tracker)
    return hostname === '' ? null : hostname.toLowerCase()
  } catch {
    return null
  }
}

/** The last non-empty path segment; `null` for an empty path or `/`. */
export function basenameOf(path: string | null): string | null {
  if (path === null) return null
  const segments = path.split('/').filter((segment) => segment !== '')
  return segments.length === 0 ? null : segments[segments.length - 1]
}

function sum(a: number | null, b: number | null): number | null {
  return a === null || b === null ? null : a + b
}

function average(amount: number | null, seconds: number | null): number | null {
  if (amount === null || seconds === null || !(seconds > 0)) return null
  return amount / seconds
}

export function extraSortValue(
  field: ExtraSortFieldId,
  extras: SortExtras,
): SortValue {
  switch (field) {
    case 'avg_dlspeed':
      return average(
        extras.downloaded,
        extras.time_active === null || extras.seeding_time === null
          ? null
          : extras.time_active - extras.seeding_time,
      )
    case 'avg_upspeed':
      return average(extras.uploaded, extras.time_active)
    case 'global_volume':
      return sum(extras.downloaded, extras.uploaded)
    case 'content_path_basename':
      return basenameOf(extras.content_path)
    case 'seeding_time_limit':
      return seedingLimitSeconds(extras.seeding_time_limit)
    case 'inactive_seeding_time_limit':
      return seedingLimitSeconds(extras.inactive_seeding_time_limit)
    default:
      return extras[field]
  }
}

/** The stored fields an extra sort's value is computed from. */
export function extraSortSources(
  field: ExtraSortFieldId,
): ReadonlyArray<keyof SortExtras> {
  switch (field) {
    case 'avg_dlspeed':
      return ['downloaded', 'time_active', 'seeding_time']
    case 'avg_upspeed':
      return ['uploaded', 'time_active']
    case 'global_volume':
      return ['downloaded', 'uploaded']
    case 'content_path_basename':
      return ['content_path']
    default:
      return [field]
  }
}

/**
 * The `state` sort as a plain list order (the board's column order). Since
 * story 2.3 「狀態」 shows the board (selectBoardColumns); this stays so the
 * 51 sorts all order a list the same way.
 */
const STATUS_RANK: Readonly<Record<TorrentStatusId, number>> = {
  error: 6,
  stalled: 5,
  downloading: 4,
  paused: 3,
  seeding: 2,
  done: 1,
  archived: 0,
}

export type SlimSortFieldId = Exclude<SortFieldId, ExtraSortFieldId>

export function slimSortValue(
  field: SlimSortFieldId,
  torrent: SlimTorrent,
  stateBeforeMove: Readonly<Record<string, string>>,
): SortValue {
  switch (field) {
    case 'state':
      return STATUS_RANK[statusOf(torrent, stateBeforeMove)]
    case 'global_speed':
      return torrent.dlspeed + torrent.upspeed
    case 'save_path_basename':
      return basenameOf(torrent.save_path)
    default:
      return torrent[field]
  }
}

/**
 * What the comparator compares: a number (yes is 1, no is 0), text, or
 * `null` for no value (sorted last in both directions).
 */
export function sortKeyOf(
  field: SortFieldId,
  value: SortValue | undefined,
): number | string | null {
  if (hasNoSortValue(field, value)) return null
  if (typeof value === 'boolean') return value ? 1 : 0
  if (field === 'ratio' && typeof value === 'number')
    return sortableRatio(value)
  return value as number | string
}
