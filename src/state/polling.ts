import { isLoginRequired } from '#/state/login-required'

// AR-35: the only way features set `refetchInterval`. Polling stops while the
// login screen is needed; the global `onError` makes observers re-read this.
export function pollInterval(ms: number): () => number | false {
  return () => (isLoginRequired() ? false : ms)
}
