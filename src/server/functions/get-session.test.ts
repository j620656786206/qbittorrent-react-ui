import { describe, expect, it } from 'vitest'
import { GUARDED } from '#/server/functions/_define'
import type { Guarded } from '#/server/functions/_define'
import { getSession } from '#/server/functions/get-session'

// Spec 1.4 row S1.

const guarded = (getSession as unknown as Record<symbol, Guarded>)[GUARDED]

describe('getSession', () => {
  it('is a gated GET function', () => {
    expect(guarded.spec.auth).toBeUndefined()
    expect(guarded.spec.name).toBe('getSession')
    expect((getSession as unknown as { method: string }).method).toBe('GET')
  })

  it('S1 valid session: ok with its exp', async () => {
    expect(
      await guarded.run({
        data: undefined,
        context: { session: { iat: 1, exp: 99 } },
      }),
    ).toEqual({ ok: true, data: { exp: 99 } })
  })

  it('S1 no session: not_logged_in', async () => {
    expect(
      await guarded.run({ data: undefined, context: { session: null } }),
    ).toMatchObject({ ok: false, error: { code: 'not_logged_in' } })
  })
})
