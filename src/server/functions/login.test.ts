import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  consecutiveFailures,
  resetLoginLockout,
} from '#/server/auth/login-lockout'
import { setSessionCookie, verifySession } from '#/server/auth/session'
import { resetEnvCache } from '#/server/env'
import { GUARDED } from '#/server/functions/_define'
import type { Guarded } from '#/server/functions/_define'
import { login } from '#/server/functions/login'
import type * as SessionModule from '#/server/auth/session'

// Spec 1.4 rows L1, L2 and L8 through the real factory. The cookie helper
// needs Start's request context, so it is mocked.

vi.mock('#/server/auth/session', async (importOriginal) => {
  const actual = await importOriginal<typeof SessionModule>()
  return { ...actual, setSessionCookie: vi.fn() }
})

const FAKE_ENV = {
  QBIT_URL: 'http://qbit.test.invalid:8080',
  QBIT_USERNAME: 'dev',
  QBIT_PASSWORD: 'dev-pass',
  SESSION_SECRET: 's'.repeat(44),
  APP_ORIGINS: 'http://localhost:3000',
  SAVE_ROOTS: '/downloads',
}

const guarded = (login as unknown as Record<symbol, Guarded>)[GUARDED]
const run = (data: unknown) => guarded.run({ data, context: { session: null } })

let fetchSpy: ReturnType<typeof vi.fn>

beforeEach(() => {
  for (const [key, value] of Object.entries(FAKE_ENV)) vi.stubEnv(key, value)
  resetEnvCache()
  resetLoginLockout()
  vi.mocked(setSessionCookie).mockClear()
  fetchSpy = vi.fn()
  vi.stubGlobal('fetch', fetchSpy)
  vi.spyOn(process.stdout, 'write').mockImplementation(() => true)
})

afterEach(() => {
  expect(fetchSpy).not.toHaveBeenCalled()
  vi.restoreAllMocks()
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
  resetEnvCache()
})

describe('login server function', () => {
  it('is the public POST function', () => {
    expect(guarded.spec.auth).toBe('public')
    expect(guarded.spec.name).toBe('login')
    expect((login as unknown as { method: string }).method).toBe('POST')
  })

  it.each([
    ['L1 remember', true, 7_776_000],
    ['L2 not remembered', false, 43_200],
  ])('%s: ok with exp, cookie set once', async (_name, remember, maxAge) => {
    const result = await run({
      username: 'dev',
      password: 'dev-pass',
      remember,
    })
    expect(result.ok).toBe(true)
    expect(setSessionCookie).toHaveBeenCalledTimes(1)
    const [token, cookieMaxAge] = vi.mocked(setSessionCookie).mock.calls[0]
    expect(cookieMaxAge).toBe(maxAge)
    const payload = verifySession(token, { secret: FAKE_ENV.SESSION_SECRET })
    expect(payload!.exp - payload!.iat).toBe(maxAge)
    expect(result).toEqual({ ok: true, data: { exp: payload!.exp } })
  })

  it('L3 wrong password: login_failed, no cookie', async () => {
    const result = await run({ username: 'dev', password: 'x', remember: true })
    expect(result).toMatchObject({ ok: false, error: { code: 'login_failed' } })
    expect(setSessionCookie).not.toHaveBeenCalled()
  })

  it.each([
    ['missing remember', { username: 'dev', password: 'dev-pass' }],
    [
      'non-string username',
      { username: 1, password: 'dev-pass', remember: true },
    ],
    [
      '1025-char password',
      { username: 'dev', password: 'p'.repeat(1025), remember: true },
    ],
    ['no body', undefined],
  ])('L8 %s: invalid_input, counter unchanged', async (_name, data) => {
    const result = await run(data)
    expect(result).toMatchObject({
      ok: false,
      error: { code: 'invalid_input' },
    })
    expect(consecutiveFailures()).toBe(0)
    expect(setSessionCookie).not.toHaveBeenCalled()
  })

  it('L8 a 1024-char password is still compared (counts as wrong)', async () => {
    const result = await run({
      username: 'dev',
      password: 'p'.repeat(1024),
      remember: true,
    })
    expect(result).toMatchObject({ error: { code: 'login_failed' } })
    expect(consecutiveFailures()).toBe(1)
  })
})
