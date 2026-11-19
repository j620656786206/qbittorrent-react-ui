import { z } from '#/shared/zod'
import { TORRENT_HASH_PATTERN } from '#/shared/torrent-hash'
import type { ErrorCode } from '#/shared/errors'

// AD-12 / AD-14, story 2.6: what every server function that takes a list of
// torrents shares. The input is 1 to 5000 hashes, each 40 or 64 lowercase
// hex (so never `all`, never a `|`, which qBittorrent reads as a list
// separator); the container deduplicates them and joins them with `|`.
// The answer has one item per input hash (AR-54); when qBittorrent gives no
// per-torrent answer (stop, start, delete) every item is ok after a 2xx and
// the next maindata shows what really happened.

export const MAX_TORRENT_HASHES = 5000

export const torrentHashListSchema = z
  .array(z.string().regex(TORRENT_HASH_PATTERN))
  .min(1)
  .max(MAX_TORRENT_HASHES)

export const torrentHashesInputSchema = z.strictObject({
  hashes: torrentHashListSchema,
})

export type TorrentHashesInput = z.infer<typeof torrentHashesInputSchema>

/**
 * Story 4.3: `deleteTorrents`. `deleteFiles` is required with no default, so
 * a client that forgets it gets `invalid_input` instead of a guess.
 */
export const deleteTorrentsInputSchema = z.strictObject({
  hashes: torrentHashListSchema,
  deleteFiles: z.boolean(),
})

export type DeleteTorrentsInput = z.infer<typeof deleteTorrentsInputSchema>

export type BatchItem =
  | { key: string; ok: true }
  | { key: string; ok: false; code: ErrorCode; message: string }

export interface BatchResult {
  items: Array<BatchItem>
}

/** Every key ok, in input order (repeats kept: one item per input). */
export function allOk(keys: ReadonlyArray<string>): BatchResult {
  return { items: keys.map((key) => ({ key, ok: true as const })) }
}

/** The distinct hashes, first occurrence order. */
export function uniqueHashes(hashes: ReadonlyArray<string>): Array<string> {
  return [...new Set(hashes)]
}
