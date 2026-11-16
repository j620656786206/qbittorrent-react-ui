import { afterEach, describe, expect, it, vi } from 'vitest'
import { errorText } from '#/lib/error-text'
import {
  INLINE_ERROR_CODES,
  SLOW_HINT_MS,
  afterSubmitError,
  decideSubmit,
  screenMessage,
  startSlowHint,
} from '#/features/login/login-form-model'
import type { ErrorCode } from '#/shared/errors'

// Spec 1.4 rows F1 to F5.

afterEach(() => {
  vi.useRealTimers()
})

describe('afterSubmitError', () => {
  it.each(['login_failed', 'login_locked'] as const)(
    'F1 %s: message, clear and focus the password',
    (code) => {
      expect(afterSubmitError(code)).toEqual({
        message: errorText(code),
        clearPassword: true,
        focusPassword: true,
      })
    },
  )

  it.each(['invalid_input', 'qbit_rejected', 'timeout'] as const)(
    'F2 %s: same as F1',
    (code) => {
      expect(afterSubmitError(code)).toEqual({
        message: errorText(code),
        clearPassword: true,
        focusPassword: true,
      })
    },
  )

  it.each([
    'home_unreachable',
    'cloudflare_expired',
    'qbit_unreachable',
    'bad_origin',
  ] as const)('F3 %s: nothing, both fields kept', (code) => {
    expect(afterSubmitError(code)).toEqual({
      message: null,
      clearPassword: false,
      focusPassword: false,
    })
  })

  it('lists exactly the five inline codes', () => {
    expect([...INLINE_ERROR_CODES].sort()).toEqual(
      [
        'invalid_input',
        'login_failed',
        'login_locked',
        'qbit_rejected',
        'timeout',
      ].sort(),
    )
  })
})

describe('screenMessage (F4)', () => {
  const stored = (reason: 'not_logged_in' | 'qbit_auth_failed') => ({
    reason,
    returnTo: '/',
  })

  it('stored qbit_auth_failed: its text, password marked invalid', () => {
    expect(
      screenMessage({
        submitError: null,
        loginRequired: stored('qbit_auth_failed'),
      }),
    ).toEqual({ text: errorText('qbit_auth_failed'), passwordInvalid: true })
  })

  it('stored not_logged_in or nothing: no message', () => {
    expect(
      screenMessage({
        submitError: null,
        loginRequired: stored('not_logged_in'),
      }),
    ).toBeNull()
    expect(screenMessage({ submitError: null, loginRequired: null })).toBeNull()
  })

  it('a submit error replaces the stored reason', () => {
    expect(
      screenMessage({
        submitError: 'login_failed',
        loginRequired: stored('qbit_auth_failed'),
      }),
    ).toEqual({ text: errorText('login_failed'), passwordInvalid: true })
  })

  it.each([
    'home_unreachable',
    'cloudflare_expired',
    'qbit_unreachable',
    'bad_origin',
  ] as const)(
    'a connection-class submit error (%s) keeps the stored qbit_auth_failed text',
    (code: ErrorCode) => {
      expect(
        screenMessage({
          submitError: code,
          loginRequired: stored('qbit_auth_failed'),
        }),
      ).toEqual({ text: errorText('qbit_auth_failed'), passwordInvalid: true })
      expect(
        screenMessage({
          submitError: code,
          loginRequired: stored('not_logged_in'),
        }),
      ).toBeNull()
      expect(
        screenMessage({ submitError: code, loginRequired: null }),
      ).toBeNull()
    },
  )
})

describe('decideSubmit', () => {
  it('sends when both fields are filled and nothing is in flight', () => {
    expect(
      decideSubmit({ inFlight: false, username: 'u', password: 'p' }),
    ).toEqual({
      action: 'submit',
    })
  })

  it('ignores a second submit while one is in flight', () => {
    expect(
      decideSubmit({ inFlight: true, username: 'u', password: 'p' }),
    ).toEqual({
      action: 'ignore',
    })
    expect(
      decideSubmit({ inFlight: true, username: '', password: '' }),
    ).toEqual({
      action: 'ignore',
    })
  })

  it('focuses the first empty field instead of sending', () => {
    expect(
      decideSubmit({ inFlight: false, username: '', password: '' }),
    ).toEqual({
      action: 'focus',
      field: 'username',
    })
    expect(
      decideSubmit({ inFlight: false, username: '', password: 'p' }),
    ).toEqual({
      action: 'focus',
      field: 'username',
    })
    expect(
      decideSubmit({ inFlight: false, username: 'u', password: '' }),
    ).toEqual({
      action: 'focus',
      field: 'password',
    })
  })
})

describe('startSlowHint (F5)', () => {
  it('false at 9 999 ms, true at 10 000 ms, false again once settled', () => {
    vi.useFakeTimers()
    const onChange = vi.fn()
    const stop = startSlowHint(onChange)
    vi.advanceTimersByTime(SLOW_HINT_MS - 1)
    expect(onChange).not.toHaveBeenCalled()
    vi.advanceTimersByTime(1)
    expect(onChange).toHaveBeenLastCalledWith(true)
    stop()
    expect(onChange).toHaveBeenLastCalledWith(false)
    expect(vi.getTimerCount()).toBe(0)
    expect(SLOW_HINT_MS).toBe(10_000)
  })

  it('settling before 10 s clears the timer and never shows the hint', () => {
    vi.useFakeTimers()
    const onChange = vi.fn()
    const stop = startSlowHint(onChange)
    vi.advanceTimersByTime(5_000)
    stop()
    expect(vi.getTimerCount()).toBe(0)
    vi.advanceTimersByTime(10_000)
    expect(onChange.mock.calls).toEqual([[false]])
  })
})
