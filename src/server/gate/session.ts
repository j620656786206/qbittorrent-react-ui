import { createMiddleware } from '@tanstack/react-start'
import { readSessionCookie, verifySession } from '#/server/auth/session'
import type { SessionPayload } from '#/server/auth/session'

// AR-26 "cookie before body": verify `rt_session` before any body byte is
// read. Never rejects; the factory's `guard()` enforces login per function.

function sessionFrom(request: Request): SessionPayload | null {
  try {
    return verifySession(readSessionCookie(request.headers.get('cookie')))
  } catch {
    // Invalid env (dev only; prod refuses to boot): treat as logged out.
    return null
  }
}

export const sessionGate = createMiddleware().server(
  ({ request, handlerType, next }) => {
    if (handlerType !== 'serverFn') return next()
    return next({ context: { session: sessionFrom(request) } })
  },
)
