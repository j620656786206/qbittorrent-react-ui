import { describe, expect, it } from 'vitest'
import { z } from '#/shared/zod'
import { testSession } from '#/server/auth/testing'
import { GUARDED, input } from '#/server/functions/_define'
import type { Guarded } from '#/server/functions/_define'
import { getSession } from '#/server/functions/get-session'

// Spec 1.4 row S1.

const guarded = (getSession as unknown as Record<symbol, Guarded>)[GUARDED]
const noData = () => input(z.undefined())(undefined)

describe('getSession', () => {
  it('is a gated GET function', () => {
    expect(guarded.spec.auth).toBeUndefined()
    expect(guarded.spec.name).toBe('getSession')
    expect((getSession as unknown as { method: string }).method).toBe('GET')
  })

  it('S1 valid session: ok with its exp', async () => {
    const session = testSession()
    expect(await guarded.run({ data: noData(), context: { session } })).toEqual(
      { ok: true, data: { exp: session.exp } },
    )
  })

  it('S1 no session: not_logged_in', async () => {
    expect(
      await guarded.run({ data: noData(), context: { session: null } }),
    ).toMatchObject({ ok: false, error: { code: 'not_logged_in' } })
  })

  it('a session-shaped object that verifySession did not make is ignored', async () => {
    expect(
      await guarded.run({
        data: noData(),
        context: { session: { iat: 1, exp: 9_999_999_999 } },
      }),
    ).toMatchObject({ ok: false, error: { code: 'not_logged_in' } })
  })
})
