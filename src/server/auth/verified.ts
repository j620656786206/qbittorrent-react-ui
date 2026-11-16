// Sessions that `verifySession` produced. Server function context also carries
// the client's own `payload.context`, so `guard()` must not trust any object
// shaped like a session: only these, which client JSON cannot forge.
//
// Kept apart from session.ts on purpose: `_define.ts` is in the browser graph
// (server function modules import it), and session.ts imports node:crypto
// and Start's server-only cookie helpers.

export interface SessionPayload {
  iat: number
  exp: number
}

const verified = new WeakSet<object>()

/** Freezes and registers a payload whose cookie signature and `exp` passed. */
export function markVerified(payload: SessionPayload): SessionPayload {
  const session = Object.freeze({ iat: payload.iat, exp: payload.exp })
  verified.add(session)
  return session
}

/** True only for a payload `verifySession` returned in this process. */
export function isVerifiedSession(value: unknown): value is SessionPayload {
  return typeof value === 'object' && value !== null && verified.has(value)
}
