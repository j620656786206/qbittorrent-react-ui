import { createStore, useSelector } from '@tanstack/react-store'
import type { ConnectionCode } from '#/lib/app-error'

// AR-35, FR-6: the connection-class failures behind the alert, fed by the
// global `onError` in query-client.ts (queries and mutations).
// - `home_unreachable` and `qbit_unreachable` say where the chain breaks, so
//   at most one is active: the latest replaces the other.
// - `cloudflare_expired` is its own flag and stays until a maindata success.
// - A maindata failure with any other code (the container answered) proves
//   home is reachable and clears the unreachable code.
// - A maindata success clears everything (a session check says nothing about
//   qBittorrent).
// `pickConnectionAlert` in src/lib/connection-alert.ts applies the priority;
// src/state/connection-alert.ts builds its input for the screens.

type UnreachableCode = Exclude<ConnectionCode, 'cloudflare_expired'>

interface ConnectionState {
  /** Every active code: `cloudflare_expired` first, then the unreachable one. */
  errors: ReadonlyArray<ConnectionCode>
}

const NONE: ReadonlyArray<ConnectionCode> = Object.freeze([])

export const connectionStore = createStore<ConnectionState>({ errors: NONE })

function isUnreachable(code: ConnectionCode): code is UnreachableCode {
  return code !== 'cloudflare_expired'
}

function setErrors(errors: ReadonlyArray<ConnectionCode>) {
  const prev = connectionStore.state.errors
  const same =
    prev.length === errors.length && prev.every((code, i) => code === errors[i])
  if (same) return
  connectionStore.setState(() => ({
    errors: errors.length === 0 ? NONE : Object.freeze([...errors]),
  }))
}

/** A no-op on the server: this module-level store would leak across requests. */
export function markConnectionError(code: ConnectionCode) {
  if (typeof window === 'undefined') return
  const prev = connectionStore.state.errors
  const cloudflare =
    code === 'cloudflare_expired' || prev.includes('cloudflare_expired')
  const unreachable = isUnreachable(code) ? code : prev.find(isUnreachable)
  setErrors([
    ...(cloudflare ? (['cloudflare_expired'] as const) : []),
    ...(unreachable ? [unreachable] : []),
  ])
}

/** The container answered: home and qBittorrent are reachable. */
export function clearUnreachable() {
  setErrors(connectionStore.state.errors.filter((code) => !isUnreachable(code)))
}

export function clearConnectionErrors() {
  setErrors(NONE)
}

export function getConnectionErrors(): ReadonlyArray<ConnectionCode> {
  return connectionStore.state.errors
}

export function useConnectionErrors(): ReadonlyArray<ConnectionCode> {
  return useSelector(connectionStore, (state) => state.errors)
}
