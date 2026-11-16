import { TORRENT_FIELDS } from '#/shared/maindata'
import type {
  Category,
  MaindataResponse,
  MaindataVersion,
  ServerState,
  SlimTorrent,
} from '#/shared/maindata'

// AD-6, AR-39: the only producer of `['maindata']` data. The query function
// in src/state/maindata.ts returns `mergeMaindata(previous, response)`;
// nothing else writes that key. A torrent whose slim fields did not change
// keeps its old object, and a record with nothing changed keeps its old
// reference, so rows memoized by hash do not re-render. Inputs are never
// mutated.

export interface Maindata {
  version: MaindataVersion
  /** Keyed by hash. */
  torrents: Readonly<Record<string, SlimTorrent>>
  serverState: ServerState
  categories: Readonly<Record<string, Category>>
  /**
   * The state a torrent had right before it turned `moving`, by hash, so the
   * status stays what it was during a move. Only torrents seen in another
   * state first have an entry; it goes when the torrent stops moving.
   */
  stateBeforeMove: Readonly<Record<string, string>>
}

const MOVING = 'moving'

function sameTorrent(a: SlimTorrent, b: SlimTorrent): boolean {
  return TORRENT_FIELDS.every((field) => a[field] === b[field])
}

function shallowEqual(a: object, b: object): boolean {
  const aKeys = Object.keys(a)
  if (aKeys.length !== Object.keys(b).length) return false
  return aKeys.every(
    (key) =>
      Object.hasOwn(b, key) &&
      (a as Record<string, unknown>)[key] ===
        (b as Record<string, unknown>)[key],
  )
}

function sameCategories(
  a: Readonly<Record<string, Category>>,
  b: Readonly<Record<string, Category>>,
): boolean {
  const aKeys = Object.keys(a)
  if (aKeys.length !== Object.keys(b).length) return false
  return aKeys.every((name) => {
    const other = b[name] as Category | undefined
    return other !== undefined && shallowEqual(a[name], other)
  })
}

const EMPTY: Readonly<Record<string, never>> = Object.freeze({})

function mergeTorrents(
  previous: Readonly<Record<string, SlimTorrent>>,
  response: MaindataResponse,
): Readonly<Record<string, SlimTorrent>> {
  if (response.full) {
    const next: Record<string, SlimTorrent> = {}
    let changed = Object.keys(previous).length !== response.changed.length
    for (const torrent of response.changed) {
      const old = previous[torrent.hash] as SlimTorrent | undefined
      if (old && sameTorrent(old, torrent)) {
        next[torrent.hash] = old
      } else {
        next[torrent.hash] = torrent
        changed = true
      }
    }
    return changed ? next : previous
  }

  // Copy on first write, so an unchanged delta keeps the old record.
  let next: Record<string, SlimTorrent> | null = null
  for (const torrent of response.changed) {
    const old = previous[torrent.hash] as SlimTorrent | undefined
    if (old && sameTorrent(old, torrent)) continue
    next ??= { ...previous }
    next[torrent.hash] = torrent
  }
  for (const hash of response.removed) {
    if (!Object.hasOwn(next ?? previous, hash)) continue
    next ??= { ...previous }
    delete next[hash]
  }
  return next ?? previous
}

function mergeStateBeforeMove(
  previous: Maindata | undefined,
  torrents: Readonly<Record<string, SlimTorrent>>,
  response: MaindataResponse,
): Readonly<Record<string, string>> {
  const before = previous?.stateBeforeMove ?? EMPTY
  const oldTorrents = previous?.torrents ?? EMPTY
  // Copy on first write, so nothing moving keeps the old record.
  let next: Record<string, string> | null = null

  for (const torrent of response.changed) {
    const { hash } = torrent
    if (torrent.state === MOVING) {
      const old = oldTorrents[hash] as SlimTorrent | undefined
      // Remember the state it moved from; first seen as moving: nothing.
      if (old && old.state !== MOVING && before[hash] !== old.state) {
        next ??= { ...before }
        next[hash] = old.state
      }
    } else if (Object.hasOwn(before, hash)) {
      next ??= { ...before }
      delete next[hash]
    }
  }
  // Removed torrents (or absent from a full answer) lose their entry.
  for (const hash of Object.keys(next ?? before)) {
    if (Object.hasOwn(torrents, hash)) continue
    next ??= { ...before }
    delete next[hash]
  }
  return next ?? before
}

export function mergeMaindata(
  previous: Maindata | undefined,
  response: MaindataResponse,
): Maindata {
  const torrents = mergeTorrents(previous?.torrents ?? EMPTY, response)
  const serverState =
    previous && shallowEqual(previous.serverState, response.serverState)
      ? previous.serverState
      : response.serverState
  const categories =
    previous && sameCategories(previous.categories, response.categories)
      ? previous.categories
      : response.categories
  return {
    version: response.version,
    torrents,
    serverState,
    categories,
    stateBeforeMove: mergeStateBeforeMove(previous, torrents, response),
  }
}
