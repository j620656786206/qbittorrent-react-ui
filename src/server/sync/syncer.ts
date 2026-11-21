import { randomBytes } from 'node:crypto'
import { isErroredTorrent } from '#/lib/error-reason'
import { isMovingTorrent, isQbitMoving } from '#/lib/torrent-status'
import { log as defaultLog } from '#/server/log'
import type { Logger } from '#/server/log'
import { BadMaindata } from '#/server/qbit/bad-maindata'
import type { QbitClient } from '#/server/qbit/client'
import { createExtrasTable } from '#/server/sync/extras-table'
import { createTorrentTable } from '#/server/sync/torrent-table'
import type { TorrentTable } from '#/server/sync/torrent-table'
import { MAINDATA_VERSION_PATTERN } from '#/shared/maindata'
import type { MaindataResponse } from '#/shared/maindata'
import type { ExtraSortFieldId, SortKeysResponse } from '#/shared/sort-keys'
import { pickTorrentDetail } from '#/shared/torrent-detail'
import type { TorrentDetailResponse } from '#/shared/torrent-detail'

// AD-6 / AR-37 / AR-38: pull-through sync. The container talks to
// qBittorrent only while it is serving a `getMaindata` call, with its own
// `rid`; there is no timer, so an idle container sends nothing. Pulls
// coalesce: one in flight at a time, and a read within 1 s of the last pull's
// start reuses its outcome, success or failure (a failure is rethrown, so a
// failing qBittorrent is not asked again on every read). A failed pull
// changes nothing (the old table stays, NFR-2). An answer the table cannot
// use resets `rid` to 0, so the next pull asks for a full update instead of
// receiving the same unusable delta again.
//
// A `fresh` read (refreshMaindata after an operation) skips the 1 s reuse and
// only joins a pull that started after the read arrived; a pull already in
// flight is waited out first (still one pull at a time, so `rid` stays in
// order). With a hung qBittorrent that wait can reach the server function's
// own timeout, which answers `timeout` as a stuck pull would anyway.
//
// The same pulls feed the sort extras table (story 2.1). `readSortKeys`
// pulls like `read` (so it joins or reuses the same pull) and answers one
// extra sort's values, with versions of the extras table's own counter.
// `readTorrentDetail` (story 2.4) answers the detail fields of one torrent
// from the extras table. The detail polls every 5 s next to the 5 s
// maindata poll, unaligned: it reuses the last pull (success or failure)
// when that started under DETAIL_PULL_REUSE_MS ago, so it adds no
// qBittorrent request while maindata is polled, and pulls itself otherwise.
// `readErrorCandidates` (story 2.10) answers the torrents in the `error`
// state or moving whose name no other torrent has (the log names torrents
// by name only), with the same pull reuse as the detail. The browser shows
// a reason only where classify says `error`, a move from error included.
// `readCategoryNames` (story 4.7) answers the categories an add may name,
// with the same reuse. `readMoveStates` (story 5.2) answers, for
// `setLocation`'s pre-check, whether each known torrent is already moving
// (`movingTo` set or qBittorrent's `moving`), with the same reuse; `markMoving`
// records the target of a move qBittorrent accepted (`movingTo`, AR-43).

export const MIN_PULL_INTERVAL_MS = 1000
/** The detail read reuses a pull this recent: a little over one 5 s poll. */
export const DETAIL_PULL_REUSE_MS = 6000

export interface SyncerOptions {
  /** The syncer only reads; it never needs the client's write methods. */
  client: Pick<QbitClient, 'syncMaindata'>
  /** Monotonic milliseconds; `performance.now` (a wall clock can step back). */
  now?: () => number
  /** 8 lowercase hex chars; a new one per container start. */
  instanceId?: string
  logger?: Logger
}

export interface ReadOptions {
  /** Answer from a pull that starts after this read arrives. */
  fresh?: boolean
}

export interface Syncer {
  readonly instanceId: string
  /** `since` is a version this syncer handed out earlier, or nothing. */
  read: (since?: string, options?: ReadOptions) => Promise<MaindataResponse>
  /** `since` is a sort-keys version this syncer handed out earlier, or nothing. */
  readSortKeys: (
    field: ExtraSortFieldId,
    since?: string,
  ) => Promise<SortKeysResponse>
  /** `hash` is a valid torrent hash (the server function checked it). */
  readTorrentDetail: (hash: string) => Promise<TorrentDetailResponse>
  /** Errored or moving torrents with a name no other torrent has. */
  readErrorCandidates: () => Promise<Array<ErrorCandidate>>
  /**
   * Story 4.7: every qBittorrent category's name, for validating an add
   * (the same pull reuse as the detail).
   */
  readCategoryNames: () => Promise<Array<string>>
  /**
   * Story 5.2: for each hash the table has, whether it is already moving
   * (`movingTo` set or qBittorrent's `moving`); unknown hashes are absent.
   */
  readMoveStates: (
    hashes: ReadonlyArray<string>,
  ) => Promise<Map<string, boolean>>
  /** Story 5.2: qBittorrent accepted moving these torrents to `target`. */
  markMoving: (hashes: ReadonlyArray<string>, target: string) => void
}

/** Story 2.10: a torrent whose log line may be matched by name. */
export interface ErrorCandidate {
  hash: string
  name: string
  /** Unix seconds: a log line older than this belongs to an earlier torrent. */
  added_on: number
  /**
   * Unix seconds: the torrent was last seen outside `error` then, so an
   * older line is about an earlier error; 0 when unknown.
   */
  errorStartedAfter: number
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
  const table: TorrentTable = createTorrentTable(now, { logger })
  const extras = createExtrasTable()

  let rid = 0
  let lastPull: LastPull | null = null
  /** Pulls started so far; `inflight.seq` orders a pull against a read. */
  let pullCount = 0
  let inflight: { seq: number; done: Promise<void> } | null = null

  async function runPull(): Promise<void> {
    try {
      const raw = await options.client.syncMaindata(rid)
      table.apply(raw)
      // Only after the slim table accepted the answer; never throws.
      extras.apply(raw)
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

  function startPull(): Promise<void> {
    const current: LastPull = { startedAt: now() }
    lastPull = current
    pullCount += 1
    const seq = pullCount
    const done = runPull()
      .catch((error: unknown) => {
        current.error = error
        throw error
      })
      .finally(() => {
        if (inflight?.seq === seq) inflight = null
      })
    inflight = { seq, done }
    return done
  }

  function pull(reuseMs = MIN_PULL_INTERVAL_MS): Promise<void> {
    if (inflight) return inflight.done
    if (lastPull && now() - lastPull.startedAt < reuseMs) {
      return 'error' in lastPull
        ? Promise.reject(lastPull.error)
        : Promise.resolve()
    }
    return startPull()
  }

  async function pullFresh(): Promise<void> {
    const seen = pullCount
    if (inflight && inflight.seq <= seen) {
      // Started before this read: its answer may predate the operation.
      await inflight.done.catch(() => {})
    }
    // Another read may have started a pull after this one arrived: join it.
    if (inflight) return inflight.done
    return startPull()
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

  async function read(
    since?: string,
    { fresh = false }: ReadOptions = {},
  ): Promise<MaindataResponse> {
    await (fresh ? pullFresh() : pull())
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

  async function readSortKeys(
    field: ExtraSortFieldId,
    since?: string,
  ): Promise<SortKeysResponse> {
    await pull()
    const { full, keys } = extras.keysSince(field, parseSince(since))
    return { version: `${instanceId}.${extras.version}`, full, keys }
  }

  async function readTorrentDetail(
    hash: string,
  ): Promise<TorrentDetailResponse> {
    await pull(DETAIL_PULL_REUSE_MS)
    const raw = extras.rawOf(hash)
    return { detail: raw ? pickTorrentDetail(raw) : null }
  }

  async function readErrorCandidates(): Promise<Array<ErrorCandidate>> {
    await pull(DETAIL_PULL_REUSE_MS)
    const names = new Map<string, number>()
    const errored: Array<ErrorCandidate> = []
    table.forEach((torrent) => {
      names.set(torrent.name, (names.get(torrent.name) ?? 0) + 1)
      if (isErroredTorrent(torrent, {}) || isQbitMoving(torrent)) {
        errored.push({
          hash: torrent.hash,
          name: torrent.name,
          added_on: torrent.added_on,
          errorStartedAfter: table.errorStartedAfter(torrent.hash),
        })
      }
    })
    // A shared name: never attribute a reason to the wrong torrent.
    return errored.filter((candidate) => names.get(candidate.name) === 1)
  }

  async function readCategoryNames(): Promise<Array<string>> {
    await pull(DETAIL_PULL_REUSE_MS)
    return Object.keys(table.categories)
  }

  async function readMoveStates(
    hashes: ReadonlyArray<string>,
  ): Promise<Map<string, boolean>> {
    await pull(DETAIL_PULL_REUSE_MS)
    const found = new Map<string, boolean>()
    for (const hash of hashes) {
      const torrent = table.get(hash)
      if (torrent) {
        // `movingTo` set or qBittorrent's `moving`.
        found.set(hash, isMovingTorrent(torrent))
      }
    }
    return found
  }

  return {
    instanceId,
    read,
    readSortKeys,
    readTorrentDetail,
    readErrorCandidates,
    readCategoryNames,
    readMoveStates,
    markMoving: (hashes, target) => table.setMovingTo(hashes, target),
  }
}
