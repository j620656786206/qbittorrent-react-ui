import { randomBytes } from 'node:crypto'
import { log as defaultLog } from '#/server/log'
import type { Logger } from '#/server/log'
import { BadMaindata } from '#/server/qbit/bad-maindata'
import type { QbitClient } from '#/server/qbit/client'
import { createTorrentTable } from '#/server/sync/torrent-table'
import type { TorrentTable } from '#/server/sync/torrent-table'
import { MAINDATA_VERSION_PATTERN } from '#/shared/maindata'
import type { MaindataResponse } from '#/shared/maindata'

// AD-6 / AR-37 / AR-38: pull-through sync. The container talks to
// qBittorrent only while it is serving a `getMaindata` call, with its own
// `rid`; there is no timer, so an idle container sends nothing. Pulls
// coalesce: one in flight at a time, and a read within 1 s of the last pull's
// start reuses its outcome, success or failure (a failure is rethrown, so a
// failing qBittorrent is not asked again on every read). A failed pull
// changes nothing (the old table stays, NFR-2). An answer the table cannot
// use resets `rid` to 0, so the next pull asks for a full update instead of
// receiving the same unusable delta again.

export const MIN_PULL_INTERVAL_MS = 1000

export interface SyncerOptions {
  client: QbitClient
  /** Monotonic milliseconds; `performance.now` (a wall clock can step back). */
  now?: () => number
  /** 8 lowercase hex chars; a new one per container start. */
  instanceId?: string
  logger?: Logger
}

export interface Syncer {
  readonly instanceId: string
  /** `since` is a version this syncer handed out earlier, or nothing. */
  read: (since?: string) => Promise<MaindataResponse>
}

interface LastPull {
  startedAt: number
  /** Set when that pull failed; rethrown to reads inside the window. */
  error?: unknown
}

export function createSyncer(options: SyncerOptions): Syncer {
  const now = options.now ?? (() => performance.now())
  const instanceId = options.instanceId ?? randomBytes(4).toString('hex')
  const logger = options.logger ?? defaultLog
  const table: TorrentTable = createTorrentTable(now)

  let rid = 0
  let lastPull: LastPull | null = null
  let inflight: Promise<void> | null = null

  async function runPull(): Promise<void> {
    try {
      const raw = await options.client.syncMaindata(rid)
      table.apply(raw)
      rid = raw.rid
    } catch (error) {
      if (error instanceof BadMaindata) {
        logger.warn('qbit_bad_maindata', {
          reason: error.reason,
          fields: error.issues,
        })
        rid = 0
      }
      throw error
    }
  }

  function pull(): Promise<void> {
    if (inflight) return inflight
    const startedAt = now()
    if (lastPull && startedAt - lastPull.startedAt < MIN_PULL_INTERVAL_MS) {
      return 'error' in lastPull
        ? Promise.reject(lastPull.error)
        : Promise.resolve()
    }
    const current: LastPull = { startedAt }
    lastPull = current
    inflight = runPull()
      .catch((error: unknown) => {
        current.error = error
        throw error
      })
      .finally(() => {
        inflight = null
      })
    return inflight
  }

  /** The counter to diff from, or `null` for "send everything". */
  function parseSince(since: string | undefined): number | null {
    if (since === undefined || !MAINDATA_VERSION_PATTERN.test(since)) {
      return null
    }
    const [id, counter] = since.split('.')
    // Another instance id: the container restarted since.
    return id === instanceId ? Number(counter) : null
  }

  async function read(since?: string): Promise<MaindataResponse> {
    await pull()
    const { full, changed, removed } = table.changesSince(parseSince(since))
    return {
      version: `${instanceId}.${table.version}`,
      full,
      changed,
      removed,
      serverState: table.serverState,
      categories: table.categories,
    }
  }

  return { instanceId, read }
}
