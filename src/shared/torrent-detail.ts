import { z } from '#/shared/zod'
import { TORRENT_HASH_PATTERN } from '#/shared/torrent-hash'
import type { SortExtras } from '#/shared/sort-keys'

// AD-6 detail exception (2026-11-17, Alex, story 2.4): while the detail
// shows a torrent, the browser asks `getTorrentDetail({ hash })` every 5 s
// for the few qBittorrent fields the detail draws that the slim table does
// not carry. The container answers from its sort extras table, reusing a
// `sync/maindata` pull younger than 6 s (maindata pulls every 5 s, so
// qBittorrent is normally not asked again), else it pulls. Only the
// fields named here leave, for that one torrent: never comment, paths,
// infohashes, the tracker or anything else the extras table keeps. Story 2.5
// added the connected seeds (`num_seeds`, the 來源數 tile) and leechers
// (`num_leechs`, the 在抓的人 tile).

export const TORRENT_DETAIL_FIELDS = [
  'downloaded',
  'uploaded',
  'num_seeds',
  'num_leechs',
] as const satisfies ReadonlyArray<keyof SortExtras>

export type TorrentDetailField = (typeof TORRENT_DETAIL_FIELDS)[number]

/** `null` per field: qBittorrent has not said. */
export type TorrentDetail = Pick<SortExtras, TorrentDetailField>

export const getTorrentDetailInputSchema = z.strictObject({
  hash: z.string().regex(TORRENT_HASH_PATTERN),
})

export type GetTorrentDetailInput = z.infer<typeof getTorrentDetailInputSchema>

export interface TorrentDetailResponse {
  /** `null`: the container does not know this torrent (gone, or never was). */
  detail: TorrentDetail | null
}

/** Only the detail fields of an extras row, nothing else. */
export function pickTorrentDetail(extras: SortExtras): TorrentDetail {
  const detail = {} as Record<TorrentDetailField, number | null>
  for (const name of TORRENT_DETAIL_FIELDS) detail[name] = extras[name]
  return detail
}
