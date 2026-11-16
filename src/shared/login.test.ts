import { describe, expect, it } from 'vitest'
import { z } from '#/shared/zod'
import { loginInputSchema, loginSearchSchema } from '#/shared/login'

describe('login schemas', () => {
  it('are built with zod in jitless mode (no eval probe under the CSP)', () => {
    expect(z.config().jitless).toBe(true)
  })

  it('validates the form input', () => {
    expect(
      loginInputSchema.safeParse({
        username: 'a',
        password: 'b',
        remember: true,
      }).success,
    ).toBe(true)
    expect(
      loginInputSchema.safeParse({ username: 'a', password: 'b' }).success,
    ).toBe(false)
  })

  it('drops a malformed redirect instead of failing the route', () => {
    expect(loginSearchSchema.parse({ redirect: '/x' })).toEqual({
      redirect: '/x',
    })
    expect(loginSearchSchema.parse({ redirect: 5 })).toEqual({
      redirect: undefined,
    })
    expect(loginSearchSchema.parse({})).toEqual({})
  })
})
