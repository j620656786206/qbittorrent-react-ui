import { describe, expect, it } from 'vitest'
import {
  AppError,
  CONNECTION_CODES,
  LOGIN_STOP_CODES,
  classifyResponse,
  isAppError,
  isConnectionCode,
  isFirstLoadError,
} from '#/lib/app-error'
import { ERROR_CODES } from '#/shared/errors'

function response(status: number, contentType?: string): Response {
  const headers = contentType ? { 'content-type': contentType } : undefined
  const body = status === 204 ? null : 'x'
  return new Response(body, { status, headers })
}

/** What a browser's `fetch` with `redirect: 'manual'` gives for a 3xx. */
function opaqueRedirect(): Response {
  const result = new Response(null, { status: 204 })
  Object.defineProperty(result, 'type', { value: 'opaqueredirect' })
  Object.defineProperty(result, 'status', { value: 0 })
  Object.defineProperty(result, 'ok', { value: false })
  return result
}

describe('classifyResponse', () => {
  it.each([
    [401, 'text/html', 'cloudflare_expired'],
    [401, 'application/json', 'cloudflare_expired'],
    [200, 'text/html; charset=utf-8', 'cloudflare_expired'],
    [200, 'TEXT/HTML', 'cloudflare_expired'],
    [500, 'text/html', 'home_unreachable'],
    [502, 'text/html', 'home_unreachable'],
    [503, undefined, 'home_unreachable'],
    [530, 'text/html', 'home_unreachable'],
    [200, 'application/json', null],
    [200, 'text/plain', null],
    [204, undefined, null],
    [403, 'application/json', null],
    [403, 'text/html', 'cloudflare_expired'],
    [404, 'text/html', 'home_unreachable'],
    [429, 'text/html', 'home_unreachable'],
    [429, 'application/json', null],
    [302, undefined, 'cloudflare_expired'],
    [307, 'text/html', 'cloudflare_expired'],
  ] as const)('%i %s -> %s', (status, type, expected) => {
    expect(classifyResponse(response(status, type))).toBe(expected)
  })

  it('a browser opaque redirect (status 0) -> cloudflare_expired', () => {
    expect(classifyResponse(opaqueRedirect())).toBe('cloudflare_expired')
  })
})

describe('AppError', () => {
  it('carries only its code, never screen or server text', () => {
    const error = new AppError('home_unreachable')
    expect(error.code).toBe('home_unreachable')
    expect(error.message).toBe('home_unreachable')
    expect(isAppError(error)).toBe(true)
    expect(isAppError(new Error('x'))).toBe(false)
    expect(isAppError({ code: 'home_unreachable' })).toBe(false)
  })

  it('lists the AD-9 login-stop codes', () => {
    expect([...LOGIN_STOP_CODES].sort()).toEqual([
      'not_logged_in',
      'qbit_auth_failed',
    ])
  })

  it('lists the connection alert codes', () => {
    expect([...CONNECTION_CODES].sort()).toEqual([
      'cloudflare_expired',
      'home_unreachable',
      'qbit_unreachable',
    ])
    expect(isConnectionCode('home_unreachable')).toBe(true)
    expect(isConnectionCode('bad_origin')).toBe(false)
  })
})

// Spec 1.8 rows V1 and V2: which maindata failures the list shows itself.
// Every code is checked: the ones with another surface (the alert bar's
// connection codes and `timeout`, the login screen's stop codes) are not
// first-load errors; every other code is, so a new code is covered too.
describe('isFirstLoadError', () => {
  const OTHER_SURFACE = new Set<string>([
    ...CONNECTION_CODES,
    ...LOGIN_STOP_CODES,
    'timeout',
  ])

  it.each(ERROR_CODES.map((code) => [code]))('%s', (code) => {
    expect(isFirstLoadError(new AppError(code))).toBe(!OTHER_SURFACE.has(code))
  })

  it('the spec examples are first-load errors', () => {
    for (const code of [
      'qbit_rejected',
      'bad_origin',
      'invalid_input',
    ] as const)
      expect(isFirstLoadError(new AppError(code))).toBe(true)
  })

  it('no error is not one; a thrown bug is one', () => {
    expect(isFirstLoadError(null)).toBe(false)
    expect(isFirstLoadError(undefined)).toBe(false)
    expect(isFirstLoadError(new TypeError('x'))).toBe(true)
  })
})
