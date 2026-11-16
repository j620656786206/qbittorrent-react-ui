import { randomBytes } from 'node:crypto'
import { createMiddleware } from '@tanstack/react-start'
import { buildCsp } from '#/shared/csp'

// AD-10 / AR-31 / AR-18. Outermost middleware, so gate rejections get the
// headers too. Static assets bypass Start; vite.config.ts sets their headers
// from the same src/shared/csp.ts. Everything that does pass through Start is
// per request (server function answers, the HTML with its nonce, /healthz),
// so it is `no-store`: no proxy or browser cache may keep or replay it. The
// hashed /assets/* files keep Nitro's own caching.

// Not exported on purpose: src/start.ts also loads in the browser, where Start
// strips `.server()` and drops what only it referenced. An exported helper
// would keep `node:crypto` in the dev client bundle and break hydration.
// The same holds for every node-only import under src/server/gate.
function createNonce(): string {
  return randomBytes(16).toString('base64')
}

function setHeaders(headers: Headers, nonce: string): void {
  headers.set('content-security-policy', buildCsp(nonce))
  headers.set('x-content-type-options', 'nosniff')
  headers.set('referrer-policy', 'no-referrer')
  headers.set('cache-control', 'no-store')
  for (const name of [...headers.keys()]) {
    if (name.startsWith('access-control-')) headers.delete(name)
  }
}

/** Returns `response` itself, or a copy when its headers are immutable. */
export function applySecurityHeaders(
  response: Response,
  nonce: string,
): Response {
  try {
    setHeaders(response.headers, nonce)
    return response
  } catch (error) {
    // `Response.redirect()` and fetched responses have immutable headers.
    if (!(error instanceof TypeError)) throw error
    const copy = new Response(response.body, response)
    setHeaders(copy.headers, nonce)
    return copy
  }
}

export const securityHeaders = createMiddleware().server(async ({ next }) => {
  const cspNonce = createNonce()
  const result = await next({ context: { cspNonce } })
  const response = applySecurityHeaders(result.response, cspNonce)
  return response === result.response ? result : { ...result, response }
})
