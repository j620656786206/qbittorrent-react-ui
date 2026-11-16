// AD-3 / AR-21: one global counter in memory (restart to clear). Never keyed
// by `CF-Connecting-IP` or `X-Forwarded-For`, which anyone can forge.
// Times are `Date.now()` milliseconds.

export const LOCK_AFTER_FAILURES = 5
export const LOCK_MS = 900_000

interface LockoutState {
  consecutiveFailures: number
  /** End of the current lock; 0 when not locked. */
  lockedUntil: number
}

const state: LockoutState = { consecutiveFailures: 0, lockedUntil: 0 }

/** End of the lock if one is active at `now`, else `null`. No side effects. */
export function lockedUntil(now: number): number | null {
  return state.lockedUntil !== 0 && now < state.lockedUntil
    ? state.lockedUntil
    : null
}

/** Once a lock is over, counting starts again from 0. Call before `lockedUntil`. */
export function expireLock(now: number): void {
  if (state.lockedUntil !== 0 && now >= state.lockedUntil) recordSuccess()
}

/** Counts one wrong attempt; `true` when this attempt starts the lock. */
export function recordFailure(now: number): boolean {
  state.consecutiveFailures += 1
  if (state.consecutiveFailures < LOCK_AFTER_FAILURES) return false
  state.lockedUntil = now + LOCK_MS
  return true
}

export function recordSuccess(): void {
  state.consecutiveFailures = 0
  state.lockedUntil = 0
}

export function consecutiveFailures(): number {
  return state.consecutiveFailures
}

/** Tests only. */
export function resetLoginLockout(): void {
  recordSuccess()
}
