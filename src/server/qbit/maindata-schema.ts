import { z } from 'zod'
import { isTorrentHash } from '#/lib/is-torrent-hash'
import { trackerDomainOf } from '#/lib/sort-values'
import {
  categorySchema,
  serverStateSchema,
  slimTorrentSchema,
} from '#/shared/maindata'
import type { ServerState } from '#/shared/maindata'

// The raw `sync/maindata` answer of qBittorrent 5.1.4, limited to what the
// two tables read: the slim fields (`src/shared/maindata.ts`) and the sort
// extras (`src/shared/sort-keys.ts`). Parsing strips every other key, so
// this schema is the allowlist: `last_external_address_v4/v6`,
// `magnet_uri`, `download_path`, `tags` and the like are gone before
// anything stores them, and `tracker` is reduced to its hostname here (the
// URL carries the passkey). Partial answers carry only changed keys, hence
// `.partial()`.

/** A maindata key is the torrent id: lowercased, then a 40 or 64 hex hash. */
const torrentHash = z.string().toLowerCase().refine(isTorrentHash)

const connectionStatus = serverStateSchema.shape.connection_status

/** A status this app does not know (a newer qBittorrent) reads as `disconnected`; the client logs it. */
export function knownConnectionStatus(
  value: string,
): ServerState['connection_status'] {
  const known = connectionStatus.safeParse(value)
  return known.success ? known.data : 'disconnected'
}

// A sort extra must never make the answer unusable (sorting must not break
// the torrent list): a key qBittorrent leaves out is "unchanged"
// (`undefined`), a key it sends as null or in a shape this app does not
// expect is "no value" (`null`).
const extraNumber = z.number().nullable().optional().catch(null)
const extraString = z.string().nullable().optional().catch(null)

/**
 * The hostname only, never the URL. An empty tracker (no working tracker
 * right now) is "unchanged": the last known domain stays.
 */
function trackerDomainOrKeep(tracker: string): string | null | undefined {
  return tracker === '' ? undefined : trackerDomainOf(tracker)
}

/** The sort extras as qBittorrent names them (`tracker` already a hostname). */
export const rawSortExtrasSchema = z.object({
  time_active: extraNumber,
  last_activity: extraNumber,
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
  /** The hostname only (`null` for a malformed URL); never the URL. */
  tracker: z
    .string()
    .transform(trackerDomainOrKeep)
    .nullable()
    .optional()
    .catch(null),
  trackers_count: extraNumber,
  content_path: extraString,
  root_path: extraString,
  dl_limit: extraNumber,
  up_limit: extraNumber,
  ratio_limit: extraNumber,
  seeding_time_limit: extraNumber,
  inactive_seeding_time_limit: extraNumber,
  priority: extraNumber,
  reannounce: extraNumber,
  infohash_v1: extraString,
  infohash_v2: extraString,
  has_metadata: z.boolean().nullable().optional().catch(null),
  comment: extraString,
})

export const rawTorrentSchema = slimTorrentSchema
  .omit({ hash: true })
  .partial()
  .extend(rawSortExtrasSchema.shape)

export type RawTorrent = z.infer<typeof rawTorrentSchema>

export const rawMaindataSchema = z.object({
  rid: z.number().int(),
  full_update: z.boolean().optional(),
  torrents: z.record(torrentHash, rawTorrentSchema).optional(),
  torrents_removed: z.array(torrentHash).optional(),
  categories: z.record(z.string(), categorySchema.partial()).optional(),
  categories_removed: z.array(z.string()).optional(),
  server_state: serverStateSchema
    .extend({ connection_status: z.string().transform(knownConnectionStatus) })
    .partial()
    .optional(),
})

export type RawMaindata = z.infer<typeof rawMaindataSchema>
