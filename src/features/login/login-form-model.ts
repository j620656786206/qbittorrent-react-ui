import { errorText } from '#/lib/error-text'
import type { ErrorCode } from '#/shared/errors'
import type { LoginRequired } from '#/state/login-required'

// Spec 1.4 rows F1 to F5: what the login form does with a result. Pure, so it
// is tested in node; focus and layout are checked in the browser.

/**
 * Codes shown under the password field (UX-DR59). Other connection codes are
 * left to the global onError and story 1.7's alert bar. `bad_origin` is shown
 * here because nothing else shows it on this screen: a wrong `APP_ORIGINS`
 * would otherwise make the button do nothing.
 */
export const INLINE_ERROR_CODES = [
  'login_failed',
  'login_locked',
  'invalid_input',
  'qbit_rejected',
  'timeout',
  'bad_origin',
] as const satisfies ReadonlyArray<ErrorCode>

/** The inline codes that mean the typed credentials were not accepted. */
export const WRONG_CREDENTIAL_CODES = [
  'login_failed',
  'login_locked',
] as const satisfies ReadonlyArray<ErrorCode>

/** EXPERIENCE "送出中": after 10 s show 「還在等 NAS 回應」. */
export const SLOW_HINT_MS = 10_000

export function isInlineErrorCode(code: ErrorCode): boolean {
  return (INLINE_ERROR_CODES as ReadonlyArray<ErrorCode>).includes(code)
}

export interface SubmitErrorEffect {
  /** Text for the message slot, or `null` when the form shows nothing. */
  message: string | null
  /**
   * Clear and focus the password, and mark it invalid. Only for a wrong
   * login; after a timeout or server error the typed password is kept.
   */
  wrongCredentials: boolean
}

export function afterSubmitError(code: ErrorCode): SubmitErrorEffect {
  return {
    message: isInlineErrorCode(code) ? errorText(code) : null,
    wrongCredentials: (
      WRONG_CREDENTIAL_CODES as ReadonlyArray<ErrorCode>
    ).includes(code),
  }
}

export interface ScreenMessage {
  text: string
  /** The password field gets the `delete` border and `aria-invalid`. */
  passwordInvalid: boolean
}

/**
 * The message under the password field. `submitError` is the code of the last
 * failed submit (null before any or while a new one is pending). An inline
 * code replaces the stored login reason; a connection code shows nothing of
 * its own (story 1.7's alert bar) and leaves the stored reason in place.
 */
export function screenMessage({
  submitError,
  loginRequired,
}: {
  submitError: ErrorCode | null
  loginRequired: LoginRequired | null
}): ScreenMessage | null {
  if (submitError !== null) {
    const { message, wrongCredentials } = afterSubmitError(submitError)
    if (message !== null) {
      return { text: message, passwordInvalid: wrongCredentials }
    }
  }
  if (loginRequired?.reason === 'qbit_auth_failed') {
    return { text: errorText('qbit_auth_failed'), passwordInvalid: true }
  }
  return null
}

export type SubmitDecision =
  | { action: 'submit' }
  /** An attempt is already in flight: never send a second one. */
  | { action: 'ignore' }
  /** A field is empty: focus it, send nothing, show no message. */
  | { action: 'focus'; field: 'username' | 'password' }

/**
 * Whether a submit may go out. `inFlight` must be read from a ref set
 * synchronously on submit, not from render state, so a double press before
 * the pending re-render cannot send two attempts toward the global lock.
 */
export function decideSubmit({
  inFlight,
  username,
  password,
}: {
  inFlight: boolean
  username: string
  password: string
}): SubmitDecision {
  if (inFlight) return { action: 'ignore' }
  if (username === '') return { action: 'focus', field: 'username' }
  if (password === '') return { action: 'focus', field: 'password' }
  return { action: 'submit' }
}

/**
 * Calls `onChange(true)` once a submit has been pending for `SLOW_HINT_MS`.
 * The returned stop function clears the timer and calls `onChange(false)`.
 */
export function startSlowHint(onChange: (slow: boolean) => void): () => void {
  const timer = setTimeout(() => onChange(true), SLOW_HINT_MS)
  return () => {
    clearTimeout(timer)
    onChange(false)
  }
}
