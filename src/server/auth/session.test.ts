import { describe, expect, it } from 'vitest'
import {
  REMEMBER_SECONDS,
  SESSION_COOKIE,
  SHORT_SECONDS,
  issueSession,
  readSessionCookie,
  sessionCookieOptions,
  verifySession,
} from './session'

const SECRET = 'x'.repeat(44)
const OTHER_SECRET = 'y'.repeat(44)
const T = 1_800_000_000

describe('rt_session token (AR-22)', () => {
  it.each([
    ['remember', true, REMEMBER_SECONDS, 7_776_000],
    ['no remember', false, SHORT_SECONDS, 43_200],
  ])(
    '%s: lifetime and expiry boundaries',
    (_name, remember, lifetime, literal) => {
      expect(lifetime).toBe(literal)
      const { token, maxAge } = issueSession({
        remember,
        now: T,
        secret: SECRET,
      })
      expect(maxAge).toBe(lifetime)
      const payload = verifySession(token, { now: T, secret: SECRET })
      expect(payload).toEqual({ iat: T, exp: T + lifetime })
      const exp = T + lifetime
      expect(
        verifySession(token, { now: exp - 1, secret: SECRET }),
      ).not.toBeNull()
      expect(verifySession(token, { now: exp, secret: SECRET })).toBeNull()
      expect(verifySession(token, { now: exp + 1, secret: SECRET })).toBeNull()
    },
  )

  it('rejects a tampered payload', () => {
    const { token } = issueSession({ remember: false, now: T, secret: SECRET })
    const [, signature] = token.split('.')
    const forged = Buffer.from(
      JSON.stringify({ v: 1, iat: T, exp: T + 10 * REMEMBER_SECONDS }),
    ).toString('base64url')
    expect(
      verifySession(`${forged}.${signature}`, { now: T, secret: SECRET }),
    ).toBeNull()
  })

  it('rejects a bad signature', () => {
    const { token } = issueSession({ remember: false, now: T, secret: SECRET })
    const [payload, signature] = token.split('.')
    const flipped = (signature[0] === 'A' ? 'B' : 'A') + signature.slice(1)
    expect(
      verifySession(`${payload}.${flipped}`, { now: T, secret: SECRET }),
    ).toBeNull()
    expect(verifySession(`${payload}.`, { now: T, secret: SECRET })).toBeNull()
    expect(
      verifySession(`${payload}.abc`, { now: T, secret: SECRET }),
    ).toBeNull()
  })

  it.each([
    undefined,
    null,
    '',
    'garbage',
    'a.b.c',
    '...',
    '%%%.%%%',
    'x'.repeat(2000),
  ])('rejects garbage %j', (token) => {
    expect(verifySession(token, { now: T, secret: SECRET })).toBeNull()
  })

  it('rejects a token signed with the previous secret', () => {
    const { token } = issueSession({
      remember: true,
      now: T,
      secret: OTHER_SECRET,
    })
    expect(verifySession(token, { now: T, secret: SECRET })).toBeNull()
  })
})

describe('rt_session cookie', () => {
  it.each([
    ['https', true],
    ['http', false],
  ])('protocol %s: Secure=%s', (protocol, secure) => {
    expect(sessionCookieOptions({ maxAge: SHORT_SECONDS, protocol })).toEqual({
      httpOnly: true,
      sameSite: 'strict',
      path: '/',
      maxAge: SHORT_SECONDS,
      secure,
    })
  })

  it('reads rt_session from a Cookie header', () => {
    expect(SESSION_COOKIE).toBe('rt_session')
    expect(readSessionCookie('a=1; rt_session=abc.def; b=2')).toBe('abc.def')
    expect(readSessionCookie('rt_session_x=1')).toBeNull()
    expect(readSessionCookie(null)).toBeNull()
  })
})
