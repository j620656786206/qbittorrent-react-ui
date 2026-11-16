import { describe, expect, it } from 'vitest'
import { safeReturnTo } from '#/lib/return-to'

// Spec 1.4 rows R1 and R2.

describe('safeReturnTo', () => {
  it.each(['/', '/?view=list#x', '/a/b?c=1'])('R1 keeps %s', (value) => {
    expect(safeReturnTo(value)).toBe(value)
  })

  it.each([
    ['undefined', undefined],
    ['a number', 123],
    ['empty', ''],
    ['protocol-relative', '//evil.example'],
    ['backslash', '/\\evil.example'],
    ['absolute', 'https://evil.example/'],
    ['javascript:', 'javascript:alert(1)'],
    ['tab trick', '/\t/evil.example'],
    ['2049 characters', `/${'a'.repeat(2048)}`],
    ['the login page', '/login?redirect=/'],
    ['the login page, upper case', '/LOGIN'],
    ['the login page, mixed case with slash', '/Login/'],
    ['the login page, percent-encoded', '/%6Cogin'],
    ['malformed percent-encoding', '/%E0%A4%A'],
  ])('R2 %s gives /', (_name, value) => {
    expect(safeReturnTo(value)).toBe('/')
  })

  it('accepts exactly 2048 characters', () => {
    const value = `/${'a'.repeat(2047)}`
    expect(safeReturnTo(value)).toBe(value)
  })
})
