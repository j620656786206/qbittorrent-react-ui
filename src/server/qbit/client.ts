import { z } from 'zod'
import { ServerFailure } from '#/server/errors/server-failure'
import { log as defaultLog } from '#/server/log'
import {
  knownConnectionStatus,
  rawMaindataSchema,
} from '#/server/qbit/maindata-schema'
import type { RawMaindata } from '#/server/qbit/maindata-schema'
import { BadMaindata, issuePaths } from '#/server/qbit/bad-maindata'
import { QBIT_PATHS } from '#/server/qbit/paths'
import { createQbitSession } from '#/server/qbit/session'
import type { QbitSessionOptions } from '#/server/qbit/session'
import type { FilePriority, TorrentFile } from '#/shared/torrent-files'

// AD-5 / AR-24: the whitelist. One named method per qBittorrent endpoint the
// app uses, constant paths only, parameters built with URLSearchParams. No
// generic `/api/v2/*` forwarding, no preferences, no path from caller input.

export { QBIT_PATHS }

export interface QbitClient {
  /** `sync/maindata` with the container's own `rid`, parsed and stripped. */
  syncMaindata: (rid: number) => Promise<RawMaindata>
  /**
   * `torrents/stop` for these hashes (validated, distinct, never `all`).
   * qBittorrent answers 200 whatever happened; the next maindata tells.
   */
  stopTorrents: (hashes: ReadonlyArray<string>) => Promise<void>
  /** `torrents/start`, same contract as `stopTorrents`. */
  startTorrents: (hashes: ReadonlyArray<string>) => Promise<void>
  /**
   * Story 4.3: `torrents/delete` for these hashes (validated, distinct,
   * never `all`), with `deleteFiles` as qBittorrent's `true`/`false`. It
   * answers 200 whatever happened; a non-2xx is `qbit_rejected`.
   */
  deleteTorrents: (
    hashes: ReadonlyArray<string>,
    deleteFiles: boolean,
  ) => Promise<void>
  /**
   * Story 4.7: `torrents/add` for one entry, multipart: a magnet link as
   * `urls` or a .torrent file as `torrents`, with `category` and
   * `autoTMM=true` (the category's save path applies). Never `savepath`
   * or `cookie`, never a URL fetched here. A non-2xx (415 for a file
   * qBittorrent cannot read) or a body of `Fails.` is `qbit_rejected`.
   */
  addTorrent: (entry: AddTorrentEntry, category: string) => Promise<void>
  /**
   * `torrents/files` for one validated hash: each file's index, name, size,
   * progress and priority only, in qBittorrent's order. A torrent
   * qBittorrent does not know answers 404 (`qbit_rejected`); an answer that
   * is not that shape is `qbit_rejected` too.
   */
  torrentFiles: (hash: string) => Promise<Array<TorrentFile>>
  /**
   * `torrents/filePrio`: these file ids (validated, distinct) of one torrent
   * get `priority`. qBittorrent's 400, 404 and 409 are `qbit_rejected`.
   */
  setFilePriority: (
    hash: string,
    ids: ReadonlyArray<number>,
    priority: FilePriority,
  ) => Promise<void>
  /**
   * Story 2.10: `log/main`, warning lines only, newer than `lastKnownId`
   * (`-1` for the whole buffer), oldest first. Read only. An answer that is
   * not that shape is `qbit_rejected`.
   */
  logMain: (lastKnownId: number) => Promise<Array<LogEntry>>
}

/** One entry for `addTorrent`, validated by the server function. */
export type AddTorrentEntry =
  | { kind: 'magnet'; url: string }
  | { kind: 'file'; bytes: Uint8Array<ArrayBuffer>; name: string }

/**
 * qBittorrent 5.0 answers `Ok.` or `Fails.` with 200; newer versions may
 * answer JSON with counts. `Fails.` is a rejection, and so is any JSON
 * answer that does not say at least one was added (`success_count` above
 * 0). Other text (`Ok.`, empty) counts as accepted (the next maindata
 * tells).
 */
function addRejected(body: string): boolean {
  const text = body.trim()
  if (text === 'Fails.') return true
  if (!text.startsWith('{')) return false
  try {
    const json = JSON.parse(text) as Record<string, unknown>
    return !(typeof json.success_count === 'number' && json.success_count > 0)
  } catch {
    return true
  }
}

/** One `log/main` line (qBittorrent 5.1.4 `Log::Msg`). */
export interface LogEntry {
  id: number
  message: string
  /** Unix seconds. */
  timestamp: number
  /** 1 normal, 2 info, 4 warning, 8 critical. */
  type: number
}

const rawLogSchema = z.array(
  z.object({
    id: z.int(),
    message: z.string(),
    timestamp: z.number(),
    type: z.int(),
  }),
)

// The fields the files tab draws; anything else qBittorrent sends (piece
// range, availability, is_seed) is dropped by the parse.
const rawFilesSchema = z.array(
  z.object({
    index: z.int().min(0),
    name: z.string(),
    size: z.number().min(0),
    progress: z.number(),
    priority: z.int(),
  }),
)

/** The `hashes` form field: `|` between hashes, nothing else. */
function hashesForm(hashes: ReadonlyArray<string>): URLSearchParams {
  const form = new URLSearchParams()
  form.set('hashes', hashes.join('|'))
  return form
}

export function createQbitClient(options: QbitSessionOptions): QbitClient {
  const session = createQbitSession(options)
  const logger = options.logger ?? defaultLog
  let warnedUnknownStatus = false

  async function syncMaindata(rid: number): Promise<RawMaindata> {
    const path = QBIT_PATHS.syncMaindata
    const query = new URLSearchParams()
    query.set('rid', String(rid))
    const response = await session.send(path, { method: 'GET', query })
    let json: unknown
    try {
      json = JSON.parse(response.body)
    } catch {
      throw new BadMaindata('not_json')
    }
    // The syncer logs it (`qbit_bad_maindata`) and asks for a full update.
    const parsed = rawMaindataSchema.safeParse(json)
    if (!parsed.success) {
      throw new BadMaindata('schema', issuePaths(parsed.error.issues))
    }
    // Read as `disconnected` by the schema; said once per container, without
    // the value (qBittorrent's own word, but nothing needs it in a log).
    const status = (json as { server_state?: { connection_status?: unknown } })
      .server_state?.connection_status
    if (
      !warnedUnknownStatus &&
      typeof status === 'string' &&
      knownConnectionStatus(status) !== status
    ) {
      warnedUnknownStatus = true
      logger.warn('qbit_unknown_connection_status')
    }
    return parsed.data
  }

  async function stopTorrents(hashes: ReadonlyArray<string>): Promise<void> {
    await session.send(QBIT_PATHS.torrentsStop, {
      method: 'POST',
      form: hashesForm(hashes),
    })
  }

  async function startTorrents(hashes: ReadonlyArray<string>): Promise<void> {
    await session.send(QBIT_PATHS.torrentsStart, {
      method: 'POST',
      form: hashesForm(hashes),
    })
  }

  async function deleteTorrents(
    hashes: ReadonlyArray<string>,
    deleteFiles: boolean,
  ): Promise<void> {
    const form = hashesForm(hashes)
    form.set('deleteFiles', deleteFiles ? 'true' : 'false')
    await session.send(QBIT_PATHS.torrentsDelete, { method: 'POST', form })
  }

  async function addTorrent(
    entry: AddTorrentEntry,
    category: string,
  ): Promise<void> {
    const path = QBIT_PATHS.torrentsAdd
    const form = new FormData()
    if (entry.kind === 'magnet') form.set('urls', entry.url)
    else form.set('torrents', new Blob([entry.bytes]), entry.name)
    form.set('category', category)
    form.set('autoTMM', 'true')
    const response = await session.send(path, { method: 'POST', form })
    if (addRejected(response.body)) {
      logger.warn('qbit_bad_response', { path, reason: 'add_failed' })
      throw new ServerFailure('qbit_rejected', 'add: failed')
    }
  }

  async function torrentFiles(hash: string): Promise<Array<TorrentFile>> {
    const path = QBIT_PATHS.torrentsFiles
    const query = new URLSearchParams()
    query.set('hash', hash)
    const response = await session.send(path, { method: 'GET', query })
    let json: unknown
    try {
      json = JSON.parse(response.body)
    } catch {
      logger.warn('qbit_bad_response', { path, reason: 'not_json' })
      throw new ServerFailure('qbit_rejected', 'files: not json')
    }
    const parsed = rawFilesSchema.safeParse(json)
    if (!parsed.success) {
      // The reason only: file names are data.
      logger.warn('qbit_bad_response', { path, reason: 'schema' })
      throw new ServerFailure('qbit_rejected', 'files: schema')
    }
    // `z.object` strips the fields it does not name.
    return parsed.data
  }

  async function setFilePriority(
    hash: string,
    ids: ReadonlyArray<number>,
    priority: FilePriority,
  ): Promise<void> {
    const form = new URLSearchParams()
    form.set('hash', hash)
    form.set('id', ids.join('|'))
    form.set('priority', String(priority))
    await session.send(QBIT_PATHS.torrentsFilePrio, { method: 'POST', form })
  }

  async function logMain(lastKnownId: number): Promise<Array<LogEntry>> {
    const path = QBIT_PATHS.logMain
    const query = new URLSearchParams()
    query.set('normal', 'false')
    query.set('info', 'false')
    query.set('warning', 'true')
    query.set('critical', 'false')
    query.set('last_known_id', String(lastKnownId))
    const response = await session.send(path, { method: 'GET', query })
    let json: unknown
    try {
      json = JSON.parse(response.body)
    } catch {
      logger.warn('qbit_bad_response', { path, reason: 'not_json' })
      throw new ServerFailure('qbit_rejected', 'log: not json')
    }
    const parsed = rawLogSchema.safeParse(json)
    if (!parsed.success) {
      // The reason only: log lines carry names and paths.
      logger.warn('qbit_bad_response', { path, reason: 'schema' })
      throw new ServerFailure('qbit_rejected', 'log: schema')
    }
    return parsed.data
  }

  return Object.freeze({
    syncMaindata,
    stopTorrents,
    startTorrents,
    deleteTorrents,
    addTorrent,
    torrentFiles,
    setFilePriority,
    logMain,
  })
}
