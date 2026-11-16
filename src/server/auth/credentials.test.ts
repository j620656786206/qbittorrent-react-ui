import * as crypto from 'node:crypto'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { credentialsMatch } from '#/server/auth/credentials'

vi.mock('node:crypto', async (importOriginal) => {
  const actual = await importOriginal<typeof crypto>()
  return { ...actual, timingSafeEqual: vi.fn(actual.timingSafeEqual) }
})

const EXPECTED = { qbitUsername: 'dev', qbitPassword: 'dev-pass' }

afterEach(() => {
  vi.mocked(crypto.timingSafeEqual).mockClear()
})

describe('credentialsMatch (AD-3)', () => {
  it('matches only when both fields match', () => {
    expect(credentialsMatch('dev', 'dev-pass', EXPECTED)).toBe(true)
    expect(credentialsMatch('dev', 'wrong', EXPECTED)).toBe(false)
    expect(credentialsMatch('other', 'dev-pass', EXPECTED)).toBe(false)
    expect(credentialsMatch('', '', EXPECTED)).toBe(false)
  })

  it('is exact: case, whitespace and prefixes differ', () => {
    expect(credentialsMatch('Dev', 'dev-pass', EXPECTED)).toBe(false)
    expect(credentialsMatch('dev ', 'dev-pass', EXPECTED)).toBe(false)
    expect(credentialsMatch('dev', 'dev-pas', EXPECTED)).toBe(false)
    expect(credentialsMatch('dev', 'dev-pass\u0000', EXPECTED)).toBe(false)
  })

  it('always compares both pairs as equal-length SHA-256 digests', () => {
    credentialsMatch('wrong-user', 'a much longer wrong password', EXPECTED)
    const calls = vi.mocked(crypto.timingSafeEqual).mock.calls
    expect(calls).toHaveLength(2)
    for (const [a, b] of calls) {
      expect((a as Buffer).length).toBe(32)
      expect((b as Buffer).length).toBe(32)
    }
  })
})
