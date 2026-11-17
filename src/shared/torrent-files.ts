import { z } from '#/shared/zod'
import { TORRENT_HASH_PATTERN } from '#/shared/torrent-hash'

// AD-6 files exception, AD-12, story 2.7: the detail's 檔案 tab. While it is
// open the browser asks `getFiles({ hash })` every 5 s for that one
// torrent's files (`['files', hash]`); ticking a file or picking its
// priority sends `setFilePriority({ hash, ids, priority })`. File ids are
// qBittorrent's `index` (non-negative integers, deduplicated and joined
// with `|` in the container, never by the browser); the priority is one of
// qBittorrent 5.1.4's four values: 0 不下載, 1 一般, 6 高, 7 最高
// (https://github.com/qbittorrent/qBittorrent/wiki/WebUI-API-(qBittorrent-5.0)).

export const FILE_PRIORITIES = [0, 1, 6, 7] as const

export type FilePriority = (typeof FILE_PRIORITIES)[number]

/**
 * At most this many ids in one call. Start's client sends about 19 bytes
 * per id (seroval wraps each number), so 3000 seven-digit ids stay under
 * the default 64 KB body limit (AD-12: only hash lists get 384 KB).
 */
export const MAX_FILE_IDS = 3000

const hashSchema = z.string().regex(TORRENT_HASH_PATTERN)

export const getFilesInputSchema = z.strictObject({ hash: hashSchema })

export type GetFilesInput = z.infer<typeof getFilesInputSchema>

export const setFilePriorityInputSchema = z.strictObject({
  hash: hashSchema,
  ids: z.array(z.int().min(0)).min(1).max(MAX_FILE_IDS),
  priority: z.literal(FILE_PRIORITIES),
})

export type SetFilePriorityInput = z.infer<typeof setFilePriorityInputSchema>

/** One file as the container sends it: these five fields, nothing else. */
export interface TorrentFile {
  /** qBittorrent's file index: the id `setFilePriority` takes. */
  index: number
  /** The path relative to the torrent's folder, `/` between parts. */
  name: string
  /** Bytes. */
  size: number
  /** 0 to 1. */
  progress: number
  /** As qBittorrent reports it (0, 1, 6, 7; older values 2 to 5 exist). */
  priority: number
}

/** The distinct ids, first occurrence order. */
export function uniqueFileIds(ids: ReadonlyArray<number>): Array<number> {
  return [...new Set(ids)]
}
