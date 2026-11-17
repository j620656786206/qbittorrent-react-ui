import { getQbitClient } from '#/server/qbit'
import { createErrorReasonReader } from '#/server/sync/error-reasons'
import type { ErrorReasonReader } from '#/server/sync/error-reasons'
import { createSyncer } from '#/server/sync/syncer'
import type { Syncer } from '#/server/sync/syncer'

// One torrent table per container, built on first use (no env read at import).

let syncer: Syncer | undefined
let errorReasons: ErrorReasonReader | undefined

export function getSyncer(): Syncer {
  syncer ??= createSyncer({ client: getQbitClient() })
  return syncer
}

/** Story 2.10: the one rate-limited reader of qBittorrent's log. */
export function getErrorReasonReader(): ErrorReasonReader {
  errorReasons ??= createErrorReasonReader({
    client: getQbitClient(),
    candidates: () => getSyncer().readErrorCandidates(),
  })
  return errorReasons
}

/** Tests only: a fresh table, version counter, instance id and log reader. */
export function resetSyncerForTests(): void {
  syncer = undefined
  errorReasons = undefined
}
