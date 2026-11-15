import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { issueSession } from '#/server/auth/session'
import { resetEnvCache } from '#/server/env'
import { sessionGate } from './session'
import {
  TEST_ENV,
  runMiddleware,
  serverFnRequest,
  stubTestEnv,
} from './testing'

beforeEach(() => {
  stubTestEnv()
  resetEnvCache()
})
afterEach(() => {
  vi.unstubAllEnvs()
  resetEnvCache()
})

function withCookie(cookie?: string) {
  return serverFnRequest({ headers: cookie ? { cookie } : {} })
}

describe('session gate', () => {
  it('passes the payload of a valid rt_session', async () => {
    const { token } = issueSession({
      remember: false,
      secret: TEST_ENV.SESSION_SECRET,
    })
    const { next } = await runMiddleware(sessionGate, {
      request: withCookie(`a=1; rt_session=${token}`),
    })
    expect(next).toHaveBeenCalledTimes(1)
    const { session } = (
      next.mock.calls[0][0] as { context: { session: unknown } }
    ).context
    expect(session).toMatchObject({
      iat: expect.any(Number),
      exp: expect.any(Number),
    })
  })

  it.each([
    ['missing', undefined],
    ['invalid', 'rt_session=garbage.value'],
    [
      'signed with another secret',
      `rt_session=${issueSession({ remember: true, secret: 'o'.repeat(44) }).token}`,
    ],
  ])(
    'passes session null when the cookie is %s, never rejects',
    async (_name, cookie) => {
      const { next, response } = await runMiddleware(sessionGate, {
        request: withCookie(cookie),
      })
      expect(next).toHaveBeenCalledTimes(1)
      expect(next).toHaveBeenCalledWith({ context: { session: null } })
      expect(response.status).toBe(200)
    },
  )

  it('does not touch page requests', async () => {
    const { next } = await runMiddleware(sessionGate, {
      request: new Request('http://localhost:3000/'),
      handlerType: 'router',
    })
    expect(next).toHaveBeenCalledWith()
  })
})
