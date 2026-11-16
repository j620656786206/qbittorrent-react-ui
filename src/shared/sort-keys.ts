import { z } from '#/shared/zod'
import { maindataVersionSchema } from '#/shared/maindata'
import type { MaindataVersion } from '#/shared/maindata'
import { EXTRA_SORT_FIELD_IDS } from '#/shared/sort-fields'
import type { ExtraSortFieldId } from '#/shared/sort-fields'

// AD-6 (2026-11-16, Alex): sort values the slim table does not carry come
// from `getSortKeys({ field, since })`, one field at a time. The container
// keeps these qBittorrent fields in a second table next to the slim one
// (`src/server/sync/extras-table.ts`); derived values are computed from
// them by `src/lib/sort-values.ts`. The raw tracker URL (it carries the
// passkey) and the magnet link are never stored: only the tracker's
// hostname is. comment, content_path, root_path and the infohashes leave
// the container only here, each for its own field.

/** What the extras table keeps per torrent; `null` is "qBittorrent has not said". */
export interface SortExtras {
  time_active: number | null
  last_activity: number | null
  seen_complete: number | null
  amount_left: number | null
  availability: number | null
  downloaded: number | null
  uploaded: number | null
  downloaded_session: number | null
  uploaded_session: number | null
  popularity: number | null
  total_size: number | null
  num_seeds: number | null
  num_leechs: number | null
  num_complete: number | null
  num_incomplete: number | null
  /** The tracker URL's hostname, computed when the answer is parsed. */
  tracker_domain: string | null
  trackers_count: number | null
  content_path: string | null
  root_path: string | null
  dl_limit: number | null
  up_limit: number | null
  ratio_limit: number | null
  /** Minutes, as qBittorrent sends it. */
  seeding_time_limit: number | null
  /** Minutes, as qBittorrent sends it. */
  inactive_seeding_time_limit: number | null
  priority: number | null
  reannounce: number | null
  infohash_v1: string | null
  infohash_v2: string | null
  has_metadata: boolean | null
  comment: string | null
  /** Floored to whole minutes; only for the average download speed. */
  seeding_time: number | null
}

export const SORT_EXTRAS_FIELDS = Object.freeze([
  'time_active',
  'last_activity',
  'seen_complete',
  'amount_left',
  'availability',
  'downloaded',
  'uploaded',
  'downloaded_session',
  'uploaded_session',
  'popularity',
  'total_size',
  'num_seeds',
  'num_leechs',
  'num_complete',
  'num_incomplete',
  'tracker_domain',
  'trackers_count',
  'content_path',
  'root_path',
  'dl_limit',
  'up_limit',
  'ratio_limit',
  'seeding_time_limit',
  'inactive_seeding_time_limit',
  'priority',
  'reannounce',
  'infohash_v1',
  'infohash_v2',
  'has_metadata',
  'comment',
  'seeding_time',
] as const satisfies ReadonlyArray<keyof SortExtras>)

/** A sort value: a number, text, a yes/no, or nothing. */
export type SortValue = number | string | boolean | null

export const getSortKeysInputSchema = z.strictObject({
  field: z.enum(EXTRA_SORT_FIELD_IDS),
  since: maindataVersionSchema.optional(),
})

export type GetSortKeysInput = z.infer<typeof getSortKeysInputSchema>

export interface SortKeysResponse {
  /** Same format as maindata's, its own counter. */
  version: MaindataVersion
  /** True: `keys` is every torrent and replaces what the client has. */
  full: boolean
  /** Only `field`'s value, by hash. */
  keys: Record<string, SortValue>
}

export type { ExtraSortFieldId }
