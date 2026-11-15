import { createMiddleware } from '@tanstack/react-start'
import { getEnv } from '#/server/env'
import { failureResponse } from '#/server/gate/respond'

// AD-12 / AR-26. Host on every Start request except /healthz (DNS rebinding).
// Server fn requests also need X-Requested-With (callFn sends it) and a
// matching Origin: required on POST, checked on GET when present.

export const HEALTHZ_PATH = '/healthz'
export const REQUESTED_WITH = 'XMLHttpRequest'

export function badOriginResponse(): Response {
  return failureResponse('bad_origin', 403)
}

export interface OriginPolicy {
  appOrigins: ReadonlyArray<string>
  allowedHosts: ReadonlyArray<string>
}

export function isAllowedRequest(
  request: Request,
  handlerType: 'serverFn' | 'router',
  policy: OriginPolicy,
): boolean {
  const host = request.headers.get('host')?.toLowerCase()
  if (!host || !policy.allowedHosts.includes(host)) return false
  if (handlerType !== 'serverFn') return true

  if (request.headers.get('x-requested-with') !== REQUESTED_WITH) return false
  const origin = request.headers.get('origin')
  const method = request.method.toUpperCase()
  if (origin === null) return method === 'GET' || method === 'HEAD'
  return policy.appOrigins.includes(origin)
}

export const originGate = createMiddleware().server(
  ({ request, pathname, handlerType, next }) => {
    // The build's SPA prerender requests the shell without app env.
    if (process.env.TSS_PRERENDERING === 'true') return next()
    if (pathname === HEALTHZ_PATH) return next()
    let allowed: boolean
    try {
      allowed = isAllowedRequest(request, handlerType, getEnv())
    } catch {
      // Invalid env (dev only; prod refuses to boot): reject in the contract.
      allowed = false
    }
    return allowed ? next() : badOriginResponse()
  },
)
