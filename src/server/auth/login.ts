import { credentialsMatch } from '#/server/auth/credentials'
import {
  LOCK_MS,
  consecutiveFailures,
  expireLock,
  lockedUntil,
  recordFailure,
  recordSuccess,
} from '#/server/auth/login-lockout'
import { issueSession } from '#/server/auth/session'
import { getEnv } from '#/server/env'
import { log } from '#/server/log'
import type { LoginInput } from '#/shared/login'

// AD-2 / AD-3: one login attempt. Log lines carry counts and times only,
// never the submitted or expected values (not even hashes).

export type LoginAttempt =
  | { ok: true; token: string; maxAge: number; exp: number }
  | { ok: false; code: 'login_failed' | 'login_locked' }

const iso = (ms: number) => new Date(ms).toISOString()

export function attemptLogin(input: LoginInput): LoginAttempt {
  const now = Date.now()

  expireLock(now)
  const until = lockedUntil(now)
  if (until !== null) {
    // Locked: the credentials are not even compared, and the lock is not extended.
    log.warn('login_rejected_locked', { until: iso(until) })
    return { ok: false, code: 'login_locked' }
  }

  if (!credentialsMatch(input.username, input.password, getEnv())) {
    if (recordFailure(now)) {
      log.warn('login_locked', { until: iso(now + LOCK_MS) })
      return { ok: false, code: 'login_locked' }
    }
    log.warn('login_failed', { consecutiveFailures: consecutiveFailures() })
    return { ok: false, code: 'login_failed' }
  }

  recordSuccess()
  log.info('login_succeeded')
  const iat = Math.floor(now / 1000)
  const { token, maxAge } = issueSession({ remember: input.remember, now: iat })
  return { ok: true, token, maxAge, exp: iat + maxAge }
}
