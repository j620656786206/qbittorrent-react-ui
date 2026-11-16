// AD-3 / AR-21: one global counter in memory (restart to clear). Never keyed
// by `CF-Connecting-IP` or `X-Forwarded-For`, which anyone can forge.
// Times are `Date.now()` milliseconds.

export const LOCK_AFTER_FAILURES = 5
export const LOCK_MS = 900_000

interface LockoutState {
  consecutiveFailures: number
  /** Time of the last wrong attempt; 0 before any. */
  lastFailureAt: number
}

const state: LockoutState = { consecutiveFailures: 0, lastFailureAt: 0 }

/** End of the lock if one is active at `now`, else `null`. No side effects. */
export function lockedUntil(now: number): number | null {
  if (state.consecutiveFailures < LOCK_AFTER_FAILURES) return null
  const until = state.lastFailureAt + LOCK_MS
  return now < until ? until : null
}

/**
 * Counts one wrong attempt and returns the end of the lock it is under, or
 * `null` when not locked. A count whose last failure is `LOCK_MS` old (which
 * includes a lock that is over) starts again from 0. During a lock nothing
 * changes, so a locked attempt never extends the lock.
 */
export function recordFailure(now: number): number | null {
  const active = lockedUntil(now)
  if (active !== null) return active
  if (now - state.lastFailureAt >= LOCK_MS) state.consecutiveFailures = 0
  state.consecutiveFailures += 1
  state.lastFailureAt = now
  return lockedUntil(now)
}

export function recordSuccess(): void {
  state.consecutiveFailures = 0
  state.lastFailureAt = 0
}

/** The count as of the last `recordFailure` or `recordSuccess`. */
export function consecutiveFailures(): number {
  return state.consecutiveFailures
}
