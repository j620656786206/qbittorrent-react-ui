import { useSyncExternalStore } from 'react'
import { PREF_DEFAULTS, isPrefKey, readPref, writePref } from '#/lib/prefs'

// Story 2.8's auto-collapse pref (src/lib/prefs.ts, AD-13) as one value for
// the whole page. Story 3.3: the settings page's switch writes it through
// `setAutoCollapse`, which tells every reader in this tab at once (the
// `storage` event only reaches other tabs); a change in another tab
// arrives through that event. What it reads is what the storage holds: a
// storage that throws reads as on (the default) and a write it refused
// leaves the value as it was (the switch then says so), so nothing ever
// errors.
// https://react.dev/reference/react/useSyncExternalStore

const listeners = new Set<() => void>()

function subscribe(listener: () => void): () => void {
  listeners.add(listener)
  const onStorage = (event: StorageEvent) => {
    if (isPrefKey(event.key, 'autoCollapse')) listener()
  }
  window.addEventListener('storage', onStorage)
  return () => {
    listeners.delete(listener)
    window.removeEventListener('storage', onStorage)
  }
}

const read = () => readPref('autoCollapse')
const readOnServer = () => PREF_DEFAULTS.autoCollapse

/** The desktop board collapses the other columns on scroll (default on). */
export function useAutoCollapse(): boolean {
  return useSyncExternalStore(subscribe, read, readOnServer)
}

/**
 * Stores the pref on this device and updates every reader in this tab;
 * `false` when the storage refused it (the value stays as it was).
 */
export function setAutoCollapse(on: boolean): boolean {
  const stored = writePref('autoCollapse', on)
  for (const listener of [...listeners]) listener()
  return stored
}
