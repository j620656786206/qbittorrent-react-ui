import { ERROR_MESSAGES } from '#/shared/errors'
import type { ErrorCode } from '#/shared/errors'

// AR-34: what the browser throws to TanStack Query. The message is always the
// fixed text for the code, never server text, HTML or a URL.
export class AppError extends Error {
  readonly code: ErrorCode

  constructor(code: ErrorCode) {
    super(ERROR_MESSAGES[code])
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

function isHtml(response: Response): boolean {
  const type = response.headers.get('content-type') ?? ''
  return type.toLowerCase().includes('text/html')
}

/**
 * AD-9's browser-only codes, decided from the status line and content type
 * alone (the body is never read). `null` means "let the contract decide".
 * The container never answers 401 and never answers a server function with
 * HTML, so a 401, or HTML in a success or a 403, is Cloudflare Access; any
 * other HTML error page is something between here and home.
 */
export function classifyResponse(response: Response): ErrorCode | null {
  if (response.status === 401) return 'cloudflare_expired'
  if (response.status >= 500) return 'home_unreachable'
  if (isHtml(response)) {
    if (response.ok || response.status === 403) return 'cloudflare_expired'
    return 'home_unreachable'
  }
  return null
}
