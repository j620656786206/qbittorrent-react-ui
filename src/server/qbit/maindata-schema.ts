import { z } from 'zod'
import { isTorrentHash } from '#/lib/is-torrent-hash'
import {
  categorySchema,
  serverStateSchema,
  slimTorrentSchema,
} from '#/shared/maindata'

// The raw `sync/maindata` answer of qBittorrent 5.1.4, limited to what the
// table reads. Parsing strips every other key, so this schema is the
// allowlist: `last_external_address_v4/v6`, `magnet_uri`, `tracker`,
// `comment`, `content_path` and the like are gone before anything stores
// them. Partial answers carry only changed keys, hence `.partial()`.

/** A maindata key is the torrent id: lowercased, then a 40 or 64 hex hash. */
const torrentHash = z.string().toLowerCase().refine(isTorrentHash)

export const rawMaindataSchema = z.object({
  rid: z.number().int(),
  full_update: z.boolean().optional(),
  torrents: z
    .record(torrentHash, slimTorrentSchema.omit({ hash: true }).partial())
    .optional(),
  torrents_removed: z.array(torrentHash).optional(),
  categories: z.record(z.string(), categorySchema.partial()).optional(),
  categories_removed: z.array(z.string()).optional(),
  server_state: serverStateSchema.partial().optional(),
})

export type RawMaindata = z.infer<typeof rawMaindataSchema>
