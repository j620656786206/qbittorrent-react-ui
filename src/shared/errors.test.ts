import { afterEach, describe, expect, it, vi } from 'vitest'
import { ERROR_CODES, ERROR_MESSAGES, fail, isErrorCode, ok } from './errors'

const FAKE_QBIT_URL = 'http://qbit.test.invalid:8080'

afterEach(() => {
  vi.unstubAllEnvs()
})

describe('error contract (AR-33)', () => {
  it('has exactly the 12 AD-9 codes', () => {
    expect([...ERROR_CODES].sort()).toEqual(
      [
        'not_logged_in',
        'login_failed',
        'login_locked',
        'cloudflare_expired',
        'home_unreachable',
        'qbit_unreachable',
        'qbit_auth_failed',
        'qbit_rejected',
        'timeout',
        'invalid_input',
        'settings_write_failed',
        'bad_origin',
      ].sort(),
    )
    expect(Object.keys(ERROR_MESSAGES).sort()).toEqual([...ERROR_CODES].sort())
  })

  it.each(ERROR_CODES)('fail(%s) carries the fixed Chinese message', (code) => {
    vi.stubEnv('QBIT_URL', FAKE_QBIT_URL)
    const result = fail(code)
    expect(result).toEqual({
      ok: false,
      error: { code, message: ERROR_MESSAGES[code] },
    })
    expect(result.error.message).toMatch(/\p{Script=Han}/u)
    expect(result.error.message).not.toContain(FAKE_QBIT_URL)
    expect(result.error.message).not.toContain('qbit.test.invalid')
  })

  it('ok() wraps data', () => {
    expect(ok({ a: 1 })).toEqual({ ok: true, data: { a: 1 } })
  })

  it('isErrorCode accepts only the 12 codes', () => {
    expect(isErrorCode('timeout')).toBe(true)
    expect(isErrorCode('internal_error')).toBe(false)
    expect(isErrorCode(undefined)).toBe(false)
  })
})
