import { isErroredTorrent } from '#/lib/error-reason'
import { isTorrentHash } from '#/lib/is-torrent-hash'
import { isMovingTorrent } from '#/lib/torrent-status'
import { BadMaindata, issuePaths } from '#/server/qbit/bad-maindata'
import type { RawMaindata } from '#/server/qbit/maindata-schema'
import {
  TORRENT_FIELDS,
  categorySchema,
  serverStateSchema,
  slimTorrentSchema,
} from '#/shared/maindata'
import type { Category, ServerState, SlimTorrent } from '#/shared/maindata'

// AD-6 / AR-37: the container's slim torrent table. Every torrent remembers
// the version that last changed one of its slim fields (`changedAt`, never
// sent); removed hashes keep a tombstone for 10 minutes so a client that asks
// "what changed since version N" also learns what disappeared. Pruning a
// tombstone raises `floor`: a `since` below it may have missed a removal and
// gets the full table. Everything handed out is a copy, never a row.

export const TOMBSTONE_MS = 600_000

/**
 * `seeding_time` is stored floored to whole minutes. qBittorrent moves it
 * every second for every seeding torrent, which alone would put most of the
 * library in each 5 s delta; the screen shows it in days. `last_activity`
 * (story 2.3) moves as often for every active torrent and is floored the
 * same way; the screen shows it as 「N 分前」 at the finest.
 */
export const SEEDING_TIME_STEP_S = 60

const floorToMinute = (seconds: number) =>
  Math.floor(seconds / SEEDING_TIME_STEP_S) * SEEDING_TIME_STEP_S

export interface TableChanges {
  full: boolean
  changed: Array<SlimTorrent>
  removed: Array<string>
}

export interface TorrentTable {
  /** Applies one maindata answer; throws `BadMaindata` and changes nothing if it is unusable. */
  apply: (raw: RawMaindata) => void
  /** Throws before the first answer has been applied (a programming error). */
  readonly serverState: ServerState
  readonly categories: Record<string, Category>
  readonly version: number
  readonly floor: number
  readonly size: number
  /** `null` means "send everything". */
  changesSince: (counter: number | null) => TableChanges
  /**
   * Story 2.10: visits every torrent, read only, without copying; the row
   * must not be kept past the call.
   */
  forEach: (visit: (torrent: Readonly<SlimTorrent>) => void) => void
  /**
   * Story 2.10: Unix seconds after which this torrent's current error
   * started: the time of the last answer that still showed it outside
   * `error` (a move keeps it). 0 when it was errored the first time this
   * table saw it, or is not errored.
   */
  errorStartedAfter: (hash: string) => number
}

interface Row {
  torrent: SlimTorrent
  changedAt: number
}

interface Tombstone {
  removedAt: number
  /** `now()` in ms when it was removed. */
  at: number
}

function sameSlimFields(a: SlimTorrent, b: SlimTorrent): boolean {
  return TORRENT_FIELDS.every((field) => a[field] === b[field])
}

export function createTorrentTable(now: () => number = Date.now): TorrentTable {
  const rows = new Map<string, Row>()
  /** Story 2.10: hash to `errorStartedAfter`, while errored or moving. */
  const errorStarts = new Map<string, number>()
  /** `now()` in ms of the last applied answer. */
  let appliedAt: number | null = null
  const tombstones = new Map<string, Tombstone>()
  let categories = new Map<string, Category>()
  let serverState: ServerState | null = null
  let version = 0
  let floor = 0

  function apply(raw: RawMaindata): void {
    const full = raw.full_update === true
    const incoming = raw.torrents ?? {}
    const removedList = new Set(raw.torrents_removed ?? [])

    // Validate everything before touching the table (S7).
    for (const hash of [...Object.keys(incoming), ...removedList]) {
      if (!isTorrentHash(hash)) throw new BadMaindata('not_hash')
    }
    const removing = new Set(removedList)
    if (full) {
      for (const hash of rows.keys()) {
        if (!(hash in incoming)) removing.add(hash)
      }
    }

    const updates: Array<{
      hash: string
      torrent: SlimTorrent
      changed: boolean
    }> = []
    for (const [hash, partial] of Object.entries(incoming)) {
      // Removal wins inside one answer.
      if (removedList.has(hash)) continue
      const existing = rows.get(hash)
      const parsed = slimTorrentSchema.safeParse({
        // A new torrent without `private` (a magnet with no metadata yet)
        // reads as unknown, not as an unusable answer.
        private: null,
        ...existing?.torrent,
        ...partial,
        hash,
      })
      if (!parsed.success) {
        throw new BadMaindata(
          'incomplete_torrent',
          issuePaths(parsed.error.issues, ['torrents', hash]),
        )
      }
      const torrent = {
        ...parsed.data,
        seeding_time: floorToMinute(parsed.data.seeding_time),
        last_activity: floorToMinute(parsed.data.last_activity),
      }
      const changed = !existing || !sameSlimFields(existing.torrent, torrent)
      updates.push({ hash, torrent, changed })
    }

    const nextState = serverStateSchema.safeParse({
      ...serverState,
      ...raw.server_state,
    })
    if (!nextState.success) {
      throw new BadMaindata(
        'incomplete_server_state',
        issuePaths(nextState.error.issues, ['server_state']),
      )
    }

    // A full answer (a new qBittorrent session) lists every category.
    const nextCategories = new Map(full ? [] : categories)
    for (const [name, partial] of Object.entries(raw.categories ?? {})) {
      const parsed = categorySchema.safeParse({
        ...nextCategories.get(name),
        ...partial,
      })
      if (!parsed.success) {
        throw new BadMaindata(
          'incomplete_category',
          issuePaths(parsed.error.issues, ['categories', name]),
        )
      }
      nextCategories.set(name, parsed.data)
    }
    for (const name of raw.categories_removed ?? []) nextCategories.delete(name)

    // Commit.
    const removed = [...removing].filter((hash) => rows.has(hash))
    if (removed.length > 0 || updates.some((update) => update.changed)) {
      version += 1
    }
    for (const { hash, torrent, changed } of updates) {
      const existing = rows.get(hash)
      if (isErroredTorrent(torrent, {})) {
        if (!errorStarts.has(hash)) {
          const before =
            existing && appliedAt !== null ? Math.floor(appliedAt / 1000) : 0
          errorStarts.set(hash, before)
        }
      } else if (!isMovingTorrent(torrent)) errorStarts.delete(hash)
      rows.set(hash, {
        torrent,
        changedAt: changed || !existing ? version : existing.changedAt,
      })
      // Re-added (S6): it is in `changed` again, not in `removed`.
      if (changed) tombstones.delete(hash)
    }
    const at = now()
    for (const hash of removed) {
      rows.delete(hash)
      errorStarts.delete(hash)
      tombstones.set(hash, { removedAt: version, at })
    }
    for (const [hash, tombstone] of tombstones) {
      if (at - tombstone.at >= TOMBSTONE_MS) {
        tombstones.delete(hash)
        floor = Math.max(floor, tombstone.removedAt)
      }
    }

    categories = nextCategories
    serverState = nextState.data
    appliedAt = at
  }

  function changesSince(counter: number | null): TableChanges {
    if (counter === null || counter > version || counter < floor) {
      return {
        full: true,
        changed: [...rows.values()].map((row) => ({ ...row.torrent })),
        removed: [],
      }
    }
    const changed: Array<SlimTorrent> = []
    for (const row of rows.values()) {
      if (row.changedAt > counter) changed.push({ ...row.torrent })
    }
    const removed: Array<string> = []
    for (const [hash, tombstone] of tombstones) {
      if (tombstone.removedAt > counter) removed.push(hash)
    }
    return { full: false, changed, removed }
  }

  function forEach(visit: (torrent: Readonly<SlimTorrent>) => void): void {
    for (const row of rows.values()) visit(row.torrent)
  }

  return {
    apply,
    changesSince,
    forEach,
    errorStartedAfter: (hash) => errorStarts.get(hash) ?? 0,
    get serverState() {
      if (serverState === null) {
        throw new Error('torrent table: read before the first answer')
      }
      return { ...serverState }
    },
    get categories() {
      return Object.fromEntries(
        [...categories].map(([name, category]) => [name, { ...category }]),
      )
    },
    get version() {
      return version
    },
    get floor() {
      return floor
    },
    get size() {
      return rows.size
    },
  }
}
