import { createCsrfMiddleware } from '@tanstack/react-start'
import { getEnv } from '#/server/env'
import { bodyLimit } from '#/server/gate/body-limit'
import { badOriginResponse, originGate } from '#/server/gate/origin'
import { securityHeaders } from '#/server/gate/security-headers'
import { sessionGate } from '#/server/gate/session'

// AD-12: with a `src/start.ts`, Start no longer adds its CSRF middleware, so
// it is mounted here explicitly.
export const csrf = createCsrfMiddleware({
  filter: (ctx) => ctx.handlerType === 'serverFn',
  origin: (value) => {
    try {
      return getEnv().appOrigins.includes(value)
    } catch {
      // Invalid env (dev only): fail closed with the bad_origin JSON.
      return false
    }
  },
  // Plain http on a LAN address sends no Sec-Fetch-Site, a same-origin GET
  // sends no Origin, and Referrer-Policy is no-referrer. Such a GET still
  // needs X-Requested-With, which a cross-site page cannot send without a
  // CORS preflight this container never answers (origin gate).
  allowRequestsWithoutOriginCheck: true,
  failureResponse: () => badOriginResponse(),
})

/** Order matters: headers outermost, origin and cookie before the body. */
export const requestMiddleware = [
  securityHeaders,
  csrf,
  originGate,
  sessionGate,
  bodyLimit,
] as const
