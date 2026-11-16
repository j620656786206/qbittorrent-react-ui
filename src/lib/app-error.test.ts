import { describe, expect, it } from 'vitest'
import {
  AppError,
  LOGIN_STOP_CODES,
  classifyResponse,
  isAppError,
} from '#/lib/app-error'
import { ERROR_MESSAGES } from '#/shared/errors'

function response(status: number, contentType?: string): Response {
  const headers = contentType ? { 'content-type': contentType } : undefined
  const body = status === 204 ? null : 'x'
  return new Response(body, { status, headers })
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
  ] as const)('%i %s -> %s', (status, type, expected) => {
    expect(classifyResponse(response(status, type))).toBe(expected)
  })
})

describe('AppError', () => {
  it('always carries the fixed message for its code', () => {
    const error = new AppError('home_unreachable')
    expect(error.code).toBe('home_unreachable')
    expect(error.message).toBe(ERROR_MESSAGES.home_unreachable)
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
})
