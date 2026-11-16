import { extraSortSources, extraSortValue } from '#/lib/sort-values'
import type { RawMaindata, RawTorrent } from '#/server/qbit/maindata-schema'
import { SORT_EXTRAS_FIELDS, emptySortExtras } from '#/shared/sort-keys'
import type {
  ExtraSortFieldId,
  SortExtras,
  SortValue,
} from '#/shared/sort-keys'

// AD-6 (2026-11-16, Alex): the second in-memory table, next to the slim one
// and fed by the same `sync/maindata` answers. It keeps the qBittorrent
// fields the 34 extra sorts need (src/shared/sort-keys.ts), never in the
// slim table and never in getMaindata. The tracker is kept as its hostname
// only (the raw schema reduces it); the tracker URL and the magnet link are
// never parsed in, so they cannot be stored or sent.
//
// Every torrent remembers, per field, the version that last changed it, so
// getSortKeys answers only the torrents whose value for the asked field (or
// the fields a derived one is computed from) changed. Fields that move all
// the time are quantized for that change check only, so a torrent changes at
// most once a minute for them: `time_active`, `last_activity`, `reannounce`
// and `seeding_time` floored to 60 s; `availability` and `popularity`
// rounded to 2 decimals. Values sent (derived ones too) come from the raw,
// unquantized copy. A field qBittorrent never sent, or sent in a shape this
// app does not expect, is `null`. A full update starts each torrent from
// empty extras, except the last known tracker domain: an empty tracker
// (no working tracker right now) keeps it. Removed torrents just go: a
// client only looks up the hashes maindata still has. `apply` never throws;
// it runs after the slim table accepted the same answer.

export const EXTRAS_TIME_STEP_S = 60

const FLOORED: ReadonlySet<keyof SortExtras> = new Set<keyof SortExtras>([
  'time_active',
  'last_activity',
  'reannounce',
  'seeding_time',
])
const ROUNDED: ReadonlySet<keyof SortExtras> = new Set<keyof SortExtras>([
  'availability',
  'popularity',
])

export interface SortKeysChanges {
  full: boolean
  keys: Record<string, SortValue>
}

export interface ExtrasTable {
  apply: (raw: RawMaindata) => void
  readonly version: number
  readonly size: number
  /** `null` means "send everything". */
  keysSince: (
    field: ExtraSortFieldId,
    counter: number | null,
  ) => SortKeysChanges
}

interface Row {
  /** As qBittorrent sent them: what values are computed from. */
  raw: SortExtras
  /** Quantized, in `SORT_EXTRAS_FIELDS` order: only for the change check. */
  quantized: ReadonlyArray<SortValue>
  /** Per field, the version that last changed it. */
  changedAt: Record<keyof SortExtras, number>
}

function quantize(name: keyof SortExtras, value: SortValue): SortValue {
  if (typeof value !== 'number') return value
  if (FLOORED.has(name)) {
    return Math.floor(value / EXTRAS_TIME_STEP_S) * EXTRAS_TIME_STEP_S
  }
  if (ROUNDED.has(name)) return Math.round(value * 100) / 100
  return value
}

/** `name`'s new value from a partial answer; `undefined` keeps the old. */
function mergeField<TField extends keyof SortExtras>(
  next: SortExtras,
  partial: Partial<SortExtras>,
  name: TField,
): void {
  const value = partial[name]
  if (value !== undefined) next[name] = value
}

function mergeExtras(base: SortExtras, partial: RawTorrent): SortExtras {
  const next = { ...base }
  for (const name of SORT_EXTRAS_FIELDS) mergeField(next, partial, name)
  return next
}

/** The change-check copy, in `SORT_EXTRAS_FIELDS` order. */
function quantizeAll(extras: SortExtras): Array<SortValue> {
  return SORT_EXTRAS_FIELDS.map((name) => quantize(name, extras[name]))
}

/** A full update's starting point: empty, but the tracker domain stays. */
function freshExtras(existing: Row | undefined): SortExtras {
  return {
    ...emptySortExtras(),
    tracker_domain: existing?.raw.tracker_domain ?? null,
  }
}

export function createExtrasTable(): ExtrasTable {
  const rows = new Map<string, Row>()
  let version = 0

  function apply(raw: RawMaindata): void {
    const incoming = raw.torrents ?? {}
    const removed = new Set(raw.torrents_removed ?? [])
    if (raw.full_update === true) {
      for (const hash of rows.keys()) {
        if (!(hash in incoming)) removed.add(hash)
      }
    }
    const full = raw.full_update === true
    const updates: Array<{
      hash: string
      raw: SortExtras
      quantized: ReadonlyArray<SortValue>
      changed: Array<keyof SortExtras>
    }> = []
    for (const [hash, partial] of Object.entries(incoming)) {
      if (removed.has(hash)) continue
      const existing = rows.get(hash)
      const base = full
        ? freshExtras(existing)
        : (existing?.raw ?? emptySortExtras())
      const next = mergeExtras(base, partial)
      const quantized = quantizeAll(next)
      const changed = existing
        ? SORT_EXTRAS_FIELDS.filter(
            (_, index) => existing.quantized[index] !== quantized[index],
          )
        : [...SORT_EXTRAS_FIELDS]
      updates.push({ hash, raw: next, quantized, changed })
    }
    const removing = [...removed].filter((hash) => rows.has(hash))
    const bump =
      removing.length > 0 || updates.some((update) => update.changed.length > 0)
    if (bump) version += 1
    for (const { hash, raw: values, quantized, changed } of updates) {
      const existing = rows.get(hash)
      const changedAt = existing
        ? { ...existing.changedAt }
        : ({} as Record<keyof SortExtras, number>)
      for (const name of changed) changedAt[name] = version
      // The raw copy follows every answer; the version only real changes.
      rows.set(hash, { raw: values, quantized, changedAt })
    }
    for (const hash of removing) rows.delete(hash)
  }

  function keysSince(
    field: ExtraSortFieldId,
    counter: number | null,
  ): SortKeysChanges {
    const full = counter === null || counter > version
    const sources = extraSortSources(field)
    const keys: Record<string, SortValue> = {}
    for (const [hash, row] of rows) {
      if (full || sources.some((name) => row.changedAt[name] > counter)) {
        keys[hash] = extraSortValue(field, row.raw)
      }
    }
    return { full, keys }
  }

  return {
    apply,
    keysSince,
    get version() {
      return version
    },
    get size() {
      return rows.size
    },
  }
}
