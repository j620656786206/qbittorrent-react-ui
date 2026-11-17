import { parseErrorLine } from '#/lib/error-reason'
import type { LogEntry, QbitClient } from '#/server/qbit/client'
import type { ErrorCandidate } from '#/server/sync/syncer'
import type { ErrorReasonsResponse } from '#/shared/error-reasons'

// Story 2.10: reasons for torrents in qBittorrent's `error` state, from
// qBittorrent's own log (`log/main`, warning lines only). qBittorrent is
// asked at most once per ERROR_REASON_REFRESH_MS, only when a caller asks,
// and not at all while no torrent in the container table is `error`; a
// call inside the window answers from what was read (a failed read is
// rethrown inside its window, so a failing qBittorrent is not asked again
// each time). Reads are incremental: the newest entry seen is asked for
// again (`last_known_id` = its id - 1), so the answer must start with that
// same entry. An empty answer, or one that starts with anything else, means
// qBittorrent restarted (its ids start at 0 again) or the entry rotated out
// of its buffer: what was kept is dropped and the next allowed read asks
// for the whole buffer (still one call per window). Only the newest line per torrent name is kept (its id,
// time and cleaned reason, or no reason when it has nothing to show), at
// most MAX_REMEMBERED_NAMES names, never the log itself. A line older than
// the torrent (`added_on`) belongs to an earlier torrent of that name.

/**
 * At most one `log/main` call per window (Claude 代決): a little under the
 * browser's 60 s poll, so a poll's jitter never lands inside the previous
 * window and serves a reason a minute late.
 */
export const ERROR_REASON_REFRESH_MS = 55_000
/** Names whose latest reason is kept; the least recently updated go first. */
export const MAX_REMEMBERED_NAMES = 1000

export interface ErrorReasonReaderOptions {
  /** Reads only the log; never a write or settings method. */
  client: Pick<QbitClient, 'logMain'>
  /** Errored torrents with a unique name (the syncer's table). */
  candidates: () => Promise<ReadonlyArray<ErrorCandidate>>
  /** Monotonic milliseconds; `performance.now`. */
  now?: () => number
}

export interface ErrorReasonReader {
  read: () => Promise<ErrorReasonsResponse>
}

interface Remembered {
  id: number
  /** Unix seconds of the line. */
  timestamp: number
  /** `null`: the newest line has nothing to show. */
  reason: string | null
}

interface LastRead {
  at: number
  /** Set when that read failed; rethrown to reads inside the window. */
  error?: unknown
}

const sameEntry = (a: LogEntry, b: LogEntry) =>
  a.id === b.id && a.timestamp === b.timestamp && a.message === b.message

export function createErrorReasonReader(
  options: ErrorReasonReaderOptions,
): ErrorReasonReader {
  const now = options.now ?? (() => performance.now())
  /** Torrent name to its newest line, least recently updated first. */
  const latest = new Map<string, Remembered>()
  /** The newest entry seen; `null` reads the whole buffer. */
  let newest: LogEntry | null = null
  let lastRead: LastRead | null = null
  let inflight: Promise<void> | null = null

  function remember(name: string, entry: Remembered): void {
    const known = latest.get(name)
    if (known && known.id > entry.id) return
    latest.delete(name)
    latest.set(name, entry)
    if (latest.size > MAX_REMEMBERED_NAMES) {
      const oldest = latest.keys().next()
      if (!oldest.done) latest.delete(oldest.value)
    }
  }

  function apply(entries: ReadonlyArray<LogEntry>): void {
    for (const entry of entries) {
      if (newest === null || entry.id > newest.id) newest = entry
      const line = parseErrorLine(entry.message)
      if (line) {
        remember(line.name, {
          id: entry.id,
          timestamp: entry.timestamp,
          reason: line.reason,
        })
      }
    }
  }

  async function runRead(): Promise<void> {
    const seen = newest
    if (seen !== null) {
      const entries = await options.client.logMain(seen.id - 1)
      if (entries.length > 0 && sameEntry(entries[0], seen)) {
        apply(entries.slice(1))
        return
      }
      // Restarted or rotated: forget it all; the next allowed read starts
      // over from -1 (one qBittorrent call per window).
      latest.clear()
      newest = null
      return
    }
    apply(await options.client.logMain(-1))
  }

  function refresh(): Promise<void> {
    if (inflight) return inflight
    if (lastRead && now() - lastRead.at < ERROR_REASON_REFRESH_MS) {
      return 'error' in lastRead
        ? Promise.reject(lastRead.error)
        : Promise.resolve()
    }
    const current: LastRead = { at: now() }
    lastRead = current
    const done = runRead()
      .catch((error: unknown) => {
        current.error = error
        throw error
      })
      .finally(() => {
        if (inflight === done) inflight = null
      })
    inflight = done
    return done
  }

  async function read(): Promise<ErrorReasonsResponse> {
    const candidates = await options.candidates()
    if (candidates.length === 0) return { reasons: {} }
    await refresh()
    const reasons: Record<string, string> = {}
    for (const { hash, name, added_on } of candidates) {
      const known = latest.get(name)
      // A line older than the torrent was about an earlier one of that name.
      if (known && known.reason !== null && known.timestamp >= added_on) {
        reasons[hash] = known.reason
      }
    }
    return { reasons }
  }

  return { read }
}
