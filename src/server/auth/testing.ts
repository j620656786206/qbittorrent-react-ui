import { issueSession, verifySession } from '#/server/auth/session'
import type { SessionPayload } from '#/server/auth/session'

// Test-only. `guard()` accepts only sessions that `verifySession` produced,
// so tests get theirs the same way instead of writing `{ iat, exp }` by hand.

const TEST_SECRET = 't'.repeat(44)

export function testSession(now = 1_000): SessionPayload {
  const { token } = issueSession({ remember: false, now, secret: TEST_SECRET })
  const session = verifySession(token, { now, secret: TEST_SECRET })
  if (!session) throw new Error('testSession: could not verify its own token')
  return session
}
