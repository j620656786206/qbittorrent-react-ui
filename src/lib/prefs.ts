// AD-13: this browser's own preferences. The only localStorage key table in
// the app: every key is listed in `PREF_KEYS`, read through `readPref` and
// written through `writePref`. Each value has a default; a missing,
// unreadable or unknown stored value reads as that default, and storage that
// throws (a private window, blocked site data) never breaks the page.
// Story 2.8 adds `autoCollapse`; story 3.6 adds `lastCategory` and
// `lastViewedHash` (per device, never sent to the NAS), each read through
// zod: a category key as the URL can carry it, a torrent hash as the URL's
// `hash` pattern.
// https://developer.mozilla.org/en-US/docs/Web/API/Window/localStorage
// https://zod.dev/api

import { z } from '#/shared/zod'
import { ALL, categoryOrderEntrySchema } from '#/shared/categories'
import { TORRENT_HASH_PATTERN } from '#/shared/torrent-hash'

/** Story 3.6: category key to the hash last viewed there, oldest first. */
export type ViewedHashes = ReadonlyMap<string, string>

export interface Prefs {
  /** Story 2.8: the desktop board collapses the other columns on scroll. */
  autoCollapse: boolean
  /** Story 3.6: the category last viewed on this device (`ALL`: 「全部」). */
  lastCategory: string
  /** Story 3.6: per category, the torrent last viewed there. */
  lastViewedHash: ViewedHashes
}

export type PrefName = keyof Prefs

/** The storage key of each preference; nothing else touches localStorage. */
export const PREF_KEYS: Readonly<Record<PrefName, string>> = {
  autoCollapse: 'rt.autoCollapse',
  lastCategory: 'rt.lastCategory',
  lastViewedHash: 'rt.lastViewedHash',
}

export const PREF_DEFAULTS: Readonly<Prefs> = {
  autoCollapse: true,
  lastCategory: ALL,
  lastViewedHash: new Map(),
}

/**
 * Story 3.6, Claude 代決: the most categories `lastViewedHash` keeps; the
 * oldest entries go first, so the stored value stays small.
 */
export const MAX_VIEWED_HASHES = 100

interface Codec<T> {
  parse: (raw: string) => T | undefined
  format: (value: T) => string
}

const onOff: Codec<boolean> = {
  parse: (raw) => (raw === 'on' ? true : raw === 'off' ? false : undefined),
  format: (value) => (value ? 'on' : 'off'),
}

/** A category key the URL can carry: 「全部」, uncategorized or a name. */
const categoryPrefSchema = z.union([z.literal(ALL), categoryOrderEntrySchema])
const hashPrefSchema = z.string().regex(TORRENT_HASH_PATTERN)

/** JSON text, or `undefined` when it does not parse. */
function parseJson(raw: string): unknown {
  try {
    return JSON.parse(raw) as unknown
  } catch {
    return undefined
  }
}

const categoryCodec: Codec<string> = {
  parse: (raw) => {
    const parsed = categoryPrefSchema.safeParse(parseJson(raw))
    return parsed.success ? parsed.data : undefined
  },
  format: (value) => JSON.stringify(value),
}

/** At most MAX_VIEWED_HASHES entries, the newest kept. */
function capped(entries: ReadonlyArray<[string, string]>): ViewedHashes {
  const map = new Map<string, string>()
  for (const [key, hash] of entries) {
    // A key seen again moves to the newest end.
    map.delete(key)
    map.set(key, hash)
  }
  while (map.size > MAX_VIEWED_HASHES) {
    const oldest = map.keys().next()
    if (oldest.done === true) break
    map.delete(oldest.value)
  }
  return map
}

// Stored as `[key, hash]` pairs, oldest first: a plain object would put a
// category named like a number (`2024`) first, losing the age order.
const viewedHashesCodec: Codec<ViewedHashes> = {
  parse: (raw) => {
    const value = parseJson(raw)
    if (!Array.isArray(value)) return undefined
    const entries: Array<[string, string]> = []
    for (const entry of value as Array<unknown>) {
      // One bad entry is absent; the rest stay.
      if (!Array.isArray(entry) || entry.length !== 2) continue
      const key = categoryPrefSchema.safeParse(entry[0])
      const hash = hashPrefSchema.safeParse(entry[1])
      if (key.success && hash.success) entries.push([key.data, hash.data])
    }
    return capped(entries)
  },
  format: (value) => JSON.stringify([...capped([...value])]),
}

const CODECS: { [K in PrefName]: Codec<Prefs[K]> } = {
  autoCollapse: onOff,
  lastCategory: categoryCodec,
  lastViewedHash: viewedHashesCodec,
}

/**
 * Story 3.6: `hashes` with `hash` as `category`'s last viewed torrent, that
 * entry now the newest, capped at MAX_VIEWED_HASHES. A key or hash the
 * preference would refuse leaves `hashes` as it is.
 */
export function withViewedHash(
  hashes: ViewedHashes,
  category: string,
  hash: string,
): ViewedHashes {
  if (
    !categoryPrefSchema.safeParse(category).success ||
    !hashPrefSchema.safeParse(hash).success
  ) {
    return hashes
  }
  return capped([...hashes, [category, hash]])
}

/** The storage to use: the given one, else the page's, else none. */
function storageOf(storage: Storage | null | undefined): Storage | null {
  if (storage !== undefined) return storage
  // Node (tests, the server) has no page; its own experimental storage is
  // not this browser's.
  if (typeof window === 'undefined') return null
  try {
    return window.localStorage
  } catch {
    // Reading `localStorage` itself throws when site data is blocked.
    return null
  }
}

/** The stored value, or the default when missing, broken or unreadable. */
export function readPref<TName extends PrefName>(
  name: TName,
  storage?: Storage | null,
): Prefs[TName] {
  const store = storageOf(storage)
  if (store === null) return PREF_DEFAULTS[name]
  try {
    const raw = store.getItem(PREF_KEYS[name])
    if (raw === null) return PREF_DEFAULTS[name]
    return CODECS[name].parse(raw) ?? PREF_DEFAULTS[name]
  } catch {
    return PREF_DEFAULTS[name]
  }
}

/** Stores the value; `false` when the storage refused it. */
export function writePref<TName extends PrefName>(
  name: TName,
  value: Prefs[TName],
  storage?: Storage | null,
): boolean {
  const store = storageOf(storage)
  if (store === null) return false
  try {
    store.setItem(PREF_KEYS[name], CODECS[name].format(value))
    return true
  } catch {
    return false
  }
}

/**
 * A `storage` event's key concerns this preference (`null` is a
 * `localStorage.clear()`, which resets every preference).
 */
export function isPrefKey(key: string | null, name: PrefName): boolean {
  return key === null || key === PREF_KEYS[name]
}
