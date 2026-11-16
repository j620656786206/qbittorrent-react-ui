import { getQbitClient } from '#/server/qbit'
import { createSyncer } from '#/server/sync/syncer'
import type { Syncer } from '#/server/sync/syncer'

// One torrent table per container, built on first use (no env read at import).

let syncer: Syncer | undefined

export function getSyncer(): Syncer {
  syncer ??= createSyncer({ client: getQbitClient() })
  return syncer
}

/** Tests only: a fresh table, version counter and instance id. */
export function resetSyncerForTests(): void {
  syncer = undefined
}
