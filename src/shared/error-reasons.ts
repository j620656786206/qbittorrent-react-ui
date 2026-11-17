import { z } from '#/shared/zod'
import { TORRENT_HASH_PATTERN } from '#/shared/torrent-hash'

// Story 2.10: `getErrorReasons()` answers the reason text of each torrent in
// qBittorrent's `error` state that the container found in qBittorrent's log
// (`log/main`, read at most once a minute). Only errored torrents with a
// matching line and a name no other torrent has are listed; the text is
// already cleaned (no paths, addresses or accounts) and is shown as plain
// text. A torrent missing from the map shows 「qBittorrent 回報錯誤」.

export const getErrorReasonsInputSchema = z.undefined()

export type GetErrorReasonsInput = z.infer<typeof getErrorReasonsInputSchema>

export const errorReasonsResponseSchema = z.strictObject({
  /** Torrent hash to its cleaned reason. */
  reasons: z.record(z.string().regex(TORRENT_HASH_PATTERN), z.string()),
})

export type ErrorReasonsResponse = z.infer<typeof errorReasonsResponseSchema>
