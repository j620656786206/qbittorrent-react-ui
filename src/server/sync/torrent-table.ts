import { isTorrentHash } from '#/lib/is-torrent-hash'
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
      const torrent = parsed.data
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

  return {
    apply,
    changesSince,
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
