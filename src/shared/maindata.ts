import { z } from '#/shared/zod'

// AR-37: the single field list of the slim torrent table. Later stories add
// fields here only; the container's table, its raw maindata schema and the
// browser's merge all follow this file. Names, units and values stay
// qBittorrent 5.1.4's own: snake_case, Unix seconds, bytes, bytes/s.
// Parsing with these schemas is the allowlist (zod strips unknown keys), so
// nothing outside them (the home public IP, magnet links, trackers, comments,
// content paths) ever leaves the container.

export const slimTorrentSchema = z.object({
  /** The maindata key, lowercased; qBittorrent's torrent object has no hash. */
  hash: z.string(),
  name: z.string(),
  state: z.string(),
  progress: z.number(),
  /** Selected files only (qBittorrent's `size`, not `total_size`). */
  size: z.number(),
  dlspeed: z.number(),
  upspeed: z.number(),
  eta: z.number(),
  ratio: z.number(),
  added_on: z.number(),
  completion_on: z.number(),
  seeding_time: z.number(),
  save_path: z.string(),
  category: z.string(),
  /** `null` while the torrent has no metadata yet (AR-58). */
  private: z.boolean().nullable(),
})

export type SlimTorrent = z.infer<typeof slimTorrentSchema>

export const TORRENT_FIELDS = Object.freeze(
  Object.keys(slimTorrentSchema.shape) as Array<keyof SlimTorrent>,
)

export const serverStateSchema = z.object({
  dl_info_speed: z.number(),
  up_info_speed: z.number(),
  /** The limit in effect: qBittorrent reports the alternative one when on. */
  dl_rate_limit: z.number(),
  up_rate_limit: z.number(),
  use_alt_speed_limits: z.boolean(),
  connection_status: z.enum(['connected', 'firewalled', 'disconnected']),
})

export type ServerState = z.infer<typeof serverStateSchema>

/** `savePath` is spelled the way qBittorrent writes it. */
export const categorySchema = z.object({
  name: z.string(),
  savePath: z.string(),
})

export type Category = z.infer<typeof categorySchema>

/** `<8 hex instance id>.<counter>`; a new instance id means a restart. */
export const MAINDATA_VERSION_PATTERN = /^[0-9a-f]{8}\.(0|[1-9][0-9]{0,14})$/

export const maindataVersionSchema = z.string().regex(MAINDATA_VERSION_PATTERN)

export type MaindataVersion = z.infer<typeof maindataVersionSchema>

export const getMaindataInputSchema = z
  .strictObject({ since: maindataVersionSchema.optional() })
  .optional()

export type GetMaindataInput = z.infer<typeof getMaindataInputSchema>

export interface MaindataResponse {
  version: MaindataVersion
  /** True: `changed` is every torrent and replaces what the client has. */
  full: boolean
  changed: Array<SlimTorrent>
  /** Hashes removed since `since`; always empty when `full`. */
  removed: Array<string>
  serverState: ServerState
  categories: Record<string, Category>
}
