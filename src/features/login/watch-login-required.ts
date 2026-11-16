import { isLoginRequired, onLoginRequired } from '#/state/login-required'

/** The slice of the TanStack router this watcher needs. */
export interface WatchableRouter {
  state: { status: 'pending' | 'idle' }
  invalidate: () => Promise<unknown>
  subscribe: (eventType: 'onResolved', fn: () => void) => () => void
}

/**
 * When the login-required store goes from null to set (a later
 * not_logged_in / qbit_auth_failed, e.g. from polling), rerun the `_authed`
 * beforeLoad so it redirects to login. While a navigation is pending its
 * beforeLoad may already have passed (cached session), so wait for it to
 * resolve and invalidate then, if login is still required.
 * Returns the unsubscribe function.
 */
export function watchLoginRequired(router: WatchableRouter): () => void {
  let stopResolved: (() => void) | undefined
  const stopStore = onLoginRequired(() => {
    if (router.state.status === 'idle') {
      void router.invalidate()
      return
    }
    if (stopResolved) return
    stopResolved = router.subscribe('onResolved', () => {
      stopResolved?.()
      stopResolved = undefined
      if (isLoginRequired()) void router.invalidate()
    })
  })
  return () => {
    stopStore()
    stopResolved?.()
  }
}
