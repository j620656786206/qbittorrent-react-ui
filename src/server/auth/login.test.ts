import { createHash } from 'node:crypto'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { credentialsMatch } from '#/server/auth/credentials'
import { attemptLogin } from '#/server/auth/login'
import {
  LOCK_AFTER_FAILURES,
  LOCK_MS,
  consecutiveFailures,
  expireLock,
  lockedUntil,
  resetLoginLockout,
} from '#/server/auth/login-lockout'
import {
  REMEMBER_SECONDS,
  SHORT_SECONDS,
  verifySession,
} from '#/server/auth/session'
import { resetEnvCache } from '#/server/env'
import type * as CredentialsModule from '#/server/auth/credentials'

// Spec 1.4 rows L1 to L7, L9 and L10. Fake env only; never a real qBittorrent.

vi.mock('#/server/auth/credentials', async (importOriginal) => {
  const actual = await importOriginal<typeof CredentialsModule>()
  return { ...actual, credentialsMatch: vi.fn(actual.credentialsMatch) }
})

const USERNAME = 'dev'
const PASSWORD = 'dev-pass'
const FAKE_ENV = {
  QBIT_URL: 'http://qbit.test.invalid:8080',
  QBIT_USERNAME: USERNAME,
  QBIT_PASSWORD: PASSWORD,
  SESSION_SECRET: 's'.repeat(44),
  APP_ORIGINS: 'http://localhost:3000',
  SAVE_ROOTS: '/downloads',
}
const T0 = Date.UTC(2026, 10, 16, 1, 0, 0)

const sha256Hex = (value: string) =>
  createHash('sha256').update(value).digest('hex')

const right = (remember = true) => ({
  username: USERNAME,
  password: PASSWORD,
  remember,
})
const wrong = { username: USERNAME, password: 'nope', remember: true }

let stdout: Array<string>
let fetchSpy: ReturnType<typeof vi.fn>

beforeEach(() => {
  for (const [key, value] of Object.entries(FAKE_ENV)) vi.stubEnv(key, value)
  resetEnvCache()
  resetLoginLockout()
  vi.mocked(credentialsMatch).mockClear()
  vi.useFakeTimers({ now: T0 })
  fetchSpy = vi.fn()
  vi.stubGlobal('fetch', fetchSpy)
  stdout = []
  vi.spyOn(process.stdout, 'write').mockImplementation((chunk) => {
    stdout.push(String(chunk))
    return true
  })
})

afterEach(() => {
  // L9: no row ever reaches qBittorrent (or anything else over the network).
  expect(fetchSpy).not.toHaveBeenCalled()
  // L10: no line carries the fake credentials or their SHA-256.
  for (const line of stdout) {
    for (const value of [
      USERNAME,
      PASSWORD,
      sha256Hex(USERNAME),
      sha256Hex(PASSWORD),
    ]) {
      expect(line).not.toContain(value)
    }
  }
  vi.restoreAllMocks()
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
  vi.useRealTimers()
  resetEnvCache()
})

const logLines = () =>
  stdout.map((line) => JSON.parse(line) as Record<string, unknown>)

function failTimes(n: number) {
  for (let i = 0; i < n; i += 1) attemptLogin(wrong)
}

describe('attemptLogin', () => {
  it('L1 remember: 90-day token', () => {
    const result = attemptLogin(right(true))
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.maxAge).toBe(REMEMBER_SECONDS)
    expect(result.maxAge).toBe(7_776_000)
    const payload = verifySession(result.token, {
      secret: FAKE_ENV.SESSION_SECRET,
    })
    expect(payload).not.toBeNull()
    expect(payload!.exp - payload!.iat).toBe(7_776_000)
    expect(result.exp).toBe(payload!.exp)
    expect(payload!.iat).toBe(Math.floor(T0 / 1000))
  })

  it('L2 not remembered: 12-hour token', () => {
    const result = attemptLogin(right(false))
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.maxAge).toBe(SHORT_SECONDS)
    const payload = verifySession(result.token, {
      secret: FAKE_ENV.SESSION_SECRET,
    })
    expect(payload!.exp - payload!.iat).toBe(43_200)
    expect(result.exp).toBe(payload!.exp)
  })

  it.each([
    ['wrong password', { username: USERNAME, password: 'nope' }],
    ['wrong username', { username: 'someone', password: PASSWORD }],
    ['both empty', { username: '', password: '' }],
  ])(
    'L3 %s: login_failed, counter +1, logged without values',
    (_name, creds) => {
      expect(attemptLogin({ ...creds, remember: true })).toEqual({
        ok: false,
        code: 'login_failed',
      })
      expect(consecutiveFailures()).toBe(1)
      expect(logLines()).toEqual([
        expect.objectContaining({
          level: 'warn',
          event: 'login_failed',
          consecutiveFailures: 1,
        }),
      ])
    },
  )

  it('L4 the 5th wrong attempt in a row starts a 15-minute lock', () => {
    failTimes(LOCK_AFTER_FAILURES - 1)
    expect(attemptLogin(wrong)).toEqual({ ok: false, code: 'login_locked' })
    expect(LOCK_AFTER_FAILURES).toBe(5)
    expect(LOCK_MS).toBe(15 * 60 * 1000)
    const last = logLines().at(-1)
    expect(last).toMatchObject({
      level: 'warn',
      event: 'login_locked',
      until: new Date(T0 + LOCK_MS).toISOString(),
    })
  })

  it.each([1, LOCK_MS - 1])(
    'L5 %i ms into the lock: locked even with the right credentials',
    (offset) => {
      failTimes(5)
      stdout.length = 0
      vi.setSystemTime(T0 + offset)
      expect(attemptLogin(right())).toEqual({ ok: false, code: 'login_locked' })
      expect(logLines()).toEqual([
        expect.objectContaining({
          event: 'login_rejected_locked',
          until: new Date(T0 + LOCK_MS).toISOString(),
        }),
      ])
    },
  )

  it('L5 a locked attempt is not compared and does not extend the lock', () => {
    failTimes(5)
    vi.mocked(credentialsMatch).mockClear()
    vi.setSystemTime(T0 + 60_000)
    attemptLogin(wrong)
    expect(credentialsMatch).not.toHaveBeenCalled()
    vi.setSystemTime(T0 + LOCK_MS)
    expect(attemptLogin(right()).ok).toBe(true)
  })

  it('L6 at exactly lock + 15:00 the right credentials work and the counter is 0', () => {
    failTimes(5)
    vi.setSystemTime(T0 + LOCK_MS)
    expect(attemptLogin(right()).ok).toBe(true)
    expect(consecutiveFailures()).toBe(0)
  })

  it('L6 after the lock, counting starts again from 0', () => {
    failTimes(5)
    vi.setSystemTime(T0 + LOCK_MS)
    expect(attemptLogin(wrong)).toEqual({ ok: false, code: 'login_failed' })
    expect(consecutiveFailures()).toBe(1)
  })

  it('lockedUntil has no side effects; expireLock resets after the lock', () => {
    failTimes(5)
    expect(lockedUntil(T0 + LOCK_MS - 1)).toBe(T0 + LOCK_MS)
    expect(lockedUntil(T0 + LOCK_MS)).toBeNull()
    expect(consecutiveFailures()).toBe(5)
    expireLock(T0 + LOCK_MS - 1)
    expect(consecutiveFailures()).toBe(5)
    expireLock(T0 + LOCK_MS)
    expect(consecutiveFailures()).toBe(0)
    expect(lockedUntil(T0)).toBeNull()
  })

  it('a successful login logs login_succeeded with the time only', () => {
    expect(attemptLogin(right()).ok).toBe(true)
    const lines = logLines()
    expect(lines).toHaveLength(1)
    expect(Object.keys(lines[0]).sort()).toEqual(['event', 'level', 'time'])
    expect(lines[0]).toMatchObject({ level: 'info', event: 'login_succeeded' })
  })

  it('L7 a success resets the counter', () => {
    failTimes(4)
    expect(attemptLogin(right()).ok).toBe(true)
    failTimes(3)
    expect(attemptLogin(wrong)).toEqual({ ok: false, code: 'login_failed' })
    expect(consecutiveFailures()).toBe(4)
  })
})
