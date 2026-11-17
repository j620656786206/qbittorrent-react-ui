// AD-13: this browser's own preferences. The only localStorage key table in
// the app: every key is listed in `PREF_KEYS`, read through `readPref` and
// written through `writePref`. Each value has a default; a missing,
// unreadable or unknown stored value reads as that default, and storage that
// throws (a private window, blocked site data) never breaks the page.
// Story 2.8 adds `autoCollapse`; stories 3.3 and 3.6 add their keys here.

export interface Prefs {
  /** Story 2.8: the desktop board collapses the other columns on scroll. */
  autoCollapse: boolean
}

export type PrefName = keyof Prefs

/** The storage key of each preference; nothing else touches localStorage. */
export const PREF_KEYS: Readonly<Record<PrefName, string>> = {
  autoCollapse: 'rt.autoCollapse',
}

export const PREF_DEFAULTS: Readonly<Prefs> = {
  autoCollapse: true,
}

interface Codec<T> {
  parse: (raw: string) => T | undefined
  format: (value: T) => string
}

const onOff: Codec<boolean> = {
  parse: (raw) => (raw === 'on' ? true : raw === 'off' ? false : undefined),
  format: (value) => (value ? 'on' : 'off'),
}

const CODECS: { [K in PrefName]: Codec<Prefs[K]> } = {
  autoCollapse: onOff,
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
