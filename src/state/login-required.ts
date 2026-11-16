import { createStore, useSelector } from '@tanstack/react-store'
import type { LoginStopReason } from '#/lib/app-error'

// AR-35, AD-13: set by the global query `onError` when the app must show the
// login screen. Story 1.4 reads it and clears it after a successful login.

export interface LoginRequired {
  reason: LoginStopReason
  /** Same-site path (pathname + search + hash) to return to after login. */
  returnTo: string
}

interface LoginState {
  loginRequired: LoginRequired | null
}

export const loginStore = createStore<LoginState>({ loginRequired: null })

/**
 * The latest reason wins; `returnTo` keeps the first recorded value. A no-op
 * on the server: this module-level store would leak across requests.
 */
export function markLoginRequired(reason: LoginStopReason, returnTo: string) {
  if (typeof window === 'undefined') return
  loginStore.setState((prev) => ({
    loginRequired: {
      reason,
      returnTo: prev.loginRequired?.returnTo ?? returnTo,
    },
  }))
}

export function clearLoginRequired() {
  loginStore.setState(() => ({ loginRequired: null }))
}

export function isLoginRequired(): boolean {
  return loginStore.state.loginRequired !== null
}

export function useLoginRequired(): LoginRequired | null {
  return useSelector(loginStore, (state) => state.loginRequired)
}
