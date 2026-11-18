import { createMiddleware } from '@tanstack/react-start'
import { isVerifiedSession } from '#/server/auth/verified'
import { failureResponse } from '#/server/gate/respond'

// AD-12 / AR-27. Start reads the body after middleware and the function id is
// opaque here, so this enforces a request-level ceiling and passes the
// measured size on; `guard()` compares it with each function's own limit.
// `guard()` runs only after Start has read and parsed the body, so the
// ceiling is decided here, before that: a request without a valid session
// (anyone who has not logged in, and `login` itself) never gets more than
// ANONYMOUS_BODY_LIMIT, however high MAX_REQUEST_BODY is raised later.

export const DEFAULT_BODY_LIMIT = 65_536
/**
 * AD-12: a request that carries a hash list (story 2.6: stop, start; later
 * delete, move) may be 400 KB (409 600 bytes). Server functions that take
 * one give it as their own `bodyLimit`. Measured as Start serializes the
 * body (torrent-ops.test.ts): 5000 64-char hashes are 395 140 bytes, so
 * the largest list (1 to 5000 hashes, AD-12) fits with about 14 KB left
 * for the other fields of the call (a 1024-character path at most).
 * Alex raised it from 384 KB on 2026-11-18, when 5000 64-char hashes were
 * found not to fit (spec 2.6).
 */
export const HASH_LIST_BODY_LIMIT = 409_600
/** Request-level ceiling: the largest per-function limit (uploads raise it). */
export const MAX_REQUEST_BODY = HASH_LIST_BODY_LIMIT
/** Ceiling without a valid session. Stays 64 KB when MAX_REQUEST_BODY grows. */
export const ANONYMOUS_BODY_LIMIT = 65_536

export function tooLargeResponse(): Response {
  return failureResponse('invalid_input', 413)
}

/** Body size in bytes, or `null` once it passes `limit` or cannot be read. */
export async function measureBody(
  request: Request,
  limit: number,
): Promise<number | null> {
  const method = request.method.toUpperCase()
  if (method === 'GET' || method === 'HEAD' || request.body === null) return 0

  const declared = request.headers.get('content-length')
  if (declared !== null && /^\d+$/.test(declared.trim())) {
    const length = Number(declared.trim())
    return length > limit ? null : length
  }

  // No Content-Length: count a clone so Start can still read the original.
  const clone = request.clone()
  if (!clone.body) return 0
  const reader = clone.body.getReader()
  // Both tee branches must cancel for the source stream to stop.
  const stop = () =>
    Promise.allSettled([reader.cancel(), request.body?.cancel()])
  let total = 0
  for (;;) {
    let chunk: ReadableStreamReadResult<Uint8Array>
    try {
      chunk = await reader.read()
    } catch {
      // Client abort or a broken stream: answer in the contract, not a 500.
      await stop()
      return null
    }
    if (chunk.done) return total
    total += chunk.value.byteLength
    if (total > limit) {
      await stop()
      return null
    }
  }
}

export const bodyLimit = createMiddleware().server(
  async ({ request, handlerType, context, next }) => {
    if (handlerType !== 'serverFn') return next()
    // Runs after sessionGate, which always sets `context.session`.
    const session = (context as { session?: unknown } | undefined)?.session
    const ceiling = isVerifiedSession(session)
      ? MAX_REQUEST_BODY
      : ANONYMOUS_BODY_LIMIT
    const bodyBytes = await measureBody(request, ceiling)
    if (bodyBytes === null) return tooLargeResponse()
    return next({ context: { bodyBytes } })
  },
)
