import { createStore, useSelector } from '@tanstack/react-store'
import type { ConnectionCode } from '#/lib/app-error'

// AR-35, FR-6: the connection-class failures seen since the last successful
// `['maindata']` fetch. The global `onError` adds codes (queries and
// mutations); only a maindata success clears them (a session check says
// nothing about qBittorrent). Every active code is kept, so
// `pickConnectionAlert` in src/lib/connection-alert.ts can apply the
// priority order instead of showing whichever failed last.

interface ConnectionState {
  errors: ReadonlyArray<ConnectionCode>
}

const NONE: ReadonlyArray<ConnectionCode> = Object.freeze([])

export const connectionStore = createStore<ConnectionState>({ errors: NONE })

/** A no-op on the server: this module-level store would leak across requests. */
export function markConnectionError(code: ConnectionCode) {
  if (typeof window === 'undefined') return
  if (connectionStore.state.errors.includes(code)) return
  connectionStore.setState((prev) => ({ errors: [...prev.errors, code] }))
}

export function clearConnectionErrors() {
  if (connectionStore.state.errors.length === 0) return
  connectionStore.setState(() => ({ errors: NONE }))
}

export function getConnectionErrors(): ReadonlyArray<ConnectionCode> {
  return connectionStore.state.errors
}

export function useConnectionErrors(): ReadonlyArray<ConnectionCode> {
  return useSelector(connectionStore, (state) => state.errors)
}
