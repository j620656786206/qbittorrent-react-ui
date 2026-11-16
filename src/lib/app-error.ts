import type { ErrorCode } from '#/shared/errors'

// AR-34: what the browser throws to TanStack Query. `message` is the code
// itself (for logs), never server text, HTML or a URL, and never screen text:
// screens show `errorText(code)` from src/lib/error-text.ts (AR-33).
export class AppError extends Error {
  readonly code: ErrorCode

  constructor(code: ErrorCode) {
    super(code)
    this.name = 'AppError'
    this.code = code
  }
}

export function isAppError(value: unknown): value is AppError {
  return value instanceof AppError
}

/** AD-9: stop all polling, never retry, go to login. */
export const LOGIN_STOP_CODES = [
  'not_logged_in',
  'qbit_auth_failed',
] as const satisfies ReadonlyArray<ErrorCode>

export type LoginStopReason = (typeof LOGIN_STOP_CODES)[number]

export function isLoginStopCode(code: ErrorCode): code is LoginStopReason {
  return (LOGIN_STOP_CODES as ReadonlyArray<ErrorCode>).includes(code)
}

/**
 * AR-35, FR-6: the connection alert's codes. The global `onError` records
 * them in src/state/connection.ts; a successful maindata fetch clears them.
 */
export const CONNECTION_CODES = [
  'cloudflare_expired',
  'home_unreachable',
  'qbit_unreachable',
] as const satisfies ReadonlyArray<ErrorCode>

export type ConnectionCode = (typeof CONNECTION_CODES)[number]

export function isConnectionCode(code: ErrorCode): code is ConnectionCode {
  return (CONNECTION_CODES as ReadonlyArray<ErrorCode>).includes(code)
}

function isHtml(response: Response): boolean {
  const type = response.headers.get('content-type') ?? ''
  return type.toLowerCase().includes('text/html')
}

/**
 * AD-9's browser-only codes, decided from the status line and content type
 * alone (the body is never read). `null` means "let the contract decide".
 * The container never answers 401, never redirects and never answers a server
 * function with HTML, so a redirect, a 401, or HTML in a success or a 403, is
 * Cloudflare Access; any other HTML error page is something between here and
 * home.
 */
export function classifyResponse(response: Response): ErrorCode | null {
  // callFn fetches with `redirect: 'manual'`: Cloudflare Access may answer an
  // expired session with a redirect to its login host, which the browser
  // reports as an opaque redirect (Node as the 3xx itself). The container
  // never redirects a server function call.
  if (response.type === 'opaqueredirect') return 'cloudflare_expired'
  if (response.status >= 300 && response.status < 400) {
    return 'cloudflare_expired'
  }
  if (response.status === 401) return 'cloudflare_expired'
  if (response.status >= 500) return 'home_unreachable'
  if (isHtml(response)) {
    if (response.ok || response.status === 403) return 'cloudflare_expired'
    return 'home_unreachable'
  }
  return null
}

/**
 * Spec 1.8 V2, option A: a failed maindata load the screen must show itself.
 * Connection codes and `timeout` (read as qBittorrent not responding) have
 * the alert bar, the login-stop codes the login screen; every other failure
 * (`qbit_rejected`, `bad_origin`, `invalid_input`, or a thrown bug) has no
 * other surface. `null` (no error) is not one.
 */
export function isFirstLoadError(error: unknown): boolean {
  if (error === null || error === undefined) return false
  if (!isAppError(error)) return true
  return (
    !isConnectionCode(error.code) &&
    !isLoginStopCode(error.code) &&
    error.code !== 'timeout'
  )
}
