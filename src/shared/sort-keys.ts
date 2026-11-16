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

// A field qBittorrent left out, sent as null or sent in a shape this app
// does not expect is `null` ("qBittorrent has not said"): a sort extra must
// never make the answer unusable.
const extraNumber = z.number().nullable().catch(null)
const extraString = z.string().nullable().catch(null)
const extraBoolean = z.boolean().nullable().catch(null)

/**
 * The one list of sort extras: what the extras table keeps per torrent, raw
 * (it floors a copy for its change check only). `SortExtras`,
 * `SORT_EXTRAS_FIELDS`, the empty row and the raw qBittorrent schema
 * (src/server/qbit/maindata-schema.ts) all come from it.
 */
export const sortExtrasSchema = z.object({
  time_active: extraNumber,
  seen_complete: extraNumber,
  amount_left: extraNumber,
  availability: extraNumber,
  downloaded: extraNumber,
  uploaded: extraNumber,
  downloaded_session: extraNumber,
  uploaded_session: extraNumber,
  popularity: extraNumber,
  total_size: extraNumber,
  num_seeds: extraNumber,
  num_leechs: extraNumber,
  num_complete: extraNumber,
  num_incomplete: extraNumber,
  /** The tracker URL's hostname, computed when the answer is parsed. */
  tracker_domain: extraString,
  trackers_count: extraNumber,
  content_path: extraString,
  root_path: extraString,
  dl_limit: extraNumber,
  up_limit: extraNumber,
  ratio_limit: extraNumber,
  /** Minutes, as qBittorrent sends it. */
  seeding_time_limit: extraNumber,
  /** Minutes, as qBittorrent sends it. */
  inactive_seeding_time_limit: extraNumber,
  priority: extraNumber,
  reannounce: extraNumber,
  infohash_v1: extraString,
  infohash_v2: extraString,
  has_metadata: extraBoolean,
  comment: extraString,
  /** Seconds, as qBittorrent sends it; only for the average download speed. */
  seeding_time: extraNumber,
})

export type SortExtras = z.output<typeof sortExtrasSchema>

export const SORT_EXTRAS_FIELDS = sortExtrasSchema.keyof().options

/** Every extra `null`: a torrent qBittorrent has said nothing about yet. */
export function emptySortExtras(): SortExtras {
  return sortExtrasSchema.parse({})
}

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
