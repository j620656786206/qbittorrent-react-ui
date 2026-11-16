import { z } from 'zod'
import { isTorrentHash } from '#/lib/is-torrent-hash'
import { trackerDomainOf } from '#/lib/sort-values'
import {
  categorySchema,
  serverStateSchema,
  slimTorrentSchema,
} from '#/shared/maindata'
import type { ServerState } from '#/shared/maindata'
import { sortExtrasSchema } from '#/shared/sort-keys'

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

/**
 * The hostname only, never the URL. An empty tracker (no working tracker
 * right now) is "unchanged": the last known domain stays.
 */
function trackerDomainOrKeep(tracker: string): string | null | undefined {
  return tracker === '' ? undefined : trackerDomainOf(tracker)
}

// The sort extras as qBittorrent sends them, built from the one list in
// src/shared/sort-keys.ts. `.partial()`: a key qBittorrent leaves out is
// "unchanged" (`undefined`); a null or unexpected shape is still "no value"
// (`null`, the shared schema's catch). `seeding_time` is a slim field and
// comes from the slim schema. qBittorrent calls the tracker `tracker` and
// sends the URL: it is reduced to its hostname here and renamed to
// `tracker_domain` on the torrent, so the URL never leaves this parse.
const rawSortExtrasSchema = sortExtrasSchema
  .omit({ tracker_domain: true, seeding_time: true })
  .extend({
    /** The hostname only (`null` for a malformed URL); never the URL. */
    tracker: z.string().transform(trackerDomainOrKeep).nullable().catch(null),
  })
  .partial()

export const rawTorrentSchema = slimTorrentSchema
  .omit({ hash: true })
  .partial()
  .extend(rawSortExtrasSchema.shape)
  .transform(({ tracker, ...torrent }) => ({
    ...torrent,
    tracker_domain: tracker,
  }))

export type RawTorrent = z.output<typeof rawTorrentSchema>

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
