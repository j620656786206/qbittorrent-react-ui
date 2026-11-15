import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { resetEnvCache } from '#/server/env'
import { originGate } from './origin'
import { runMiddleware, serverFnRequest, stubTestEnv } from './testing'

const XRW = { 'x-requested-with': 'XMLHttpRequest' }
const GOOD_ORIGIN = { origin: 'http://localhost:3000' }

async function expectBadOrigin(response: Response) {
  expect(response.status).toBe(403)
  expect(await response.json()).toEqual({
    ok: false,
    error: { code: 'bad_origin', message: '請求來源不對' },
  })
}

beforeEach(() => {
  stubTestEnv()
  resetEnvCache()
})
afterEach(() => {
  vi.unstubAllEnvs()
  resetEnvCache()
})

describe('origin gate (AR-26)', () => {
  it('rejects a server fn POST from a foreign Origin', async () => {
    const { response, next } = await runMiddleware(originGate, {
      request: serverFnRequest({
        method: 'POST',
        headers: { ...XRW, origin: 'https://evil.example' },
      }),
    })
    expect(next).not.toHaveBeenCalled()
    await expectBadOrigin(response)
  })

  it.each([
    ['server fn', 'serverFn', 'http://evil.example/_serverFn/abc'],
    ['page', 'router', 'http://evil.example/'],
  ] as const)(
    'rejects a %s request whose Host is not in APP_ORIGINS',
    async (_name, handlerType, url) => {
      const { response, next } = await runMiddleware(originGate, {
        request: new Request(url, {
          headers: { ...XRW, ...GOOD_ORIGIN, host: 'evil.example' },
        }),
        handlerType,
      })
      expect(next).not.toHaveBeenCalled()
      await expectBadOrigin(response)
    },
  )

  it('rejects a Host whose port differs', async () => {
    const { next } = await runMiddleware(originGate, {
      request: serverFnRequest({ headers: { ...XRW, host: 'localhost:3001' } }),
    })
    expect(next).not.toHaveBeenCalled()
  })

  it('rejects a server fn request without X-Requested-With: XMLHttpRequest', async () => {
    for (const headers of [
      { ...GOOD_ORIGIN },
      { ...GOOD_ORIGIN, 'x-requested-with': 'fetch' },
    ]) {
      const { response, next } = await runMiddleware(originGate, {
        request: serverFnRequest({
          method: 'POST',
          headers: { host: 'localhost:3000', ...headers },
        }),
      })
      expect(next).not.toHaveBeenCalled()
      await expectBadOrigin(response)
    }
  })

  it('rejects a server fn POST without Origin', async () => {
    const { response, next } = await runMiddleware(originGate, {
      request: serverFnRequest({
        method: 'POST',
        headers: { host: 'localhost:3000', ...XRW },
      }),
    })
    expect(next).not.toHaveBeenCalled()
    await expectBadOrigin(response)
  })

  it('rejects a server fn GET with a foreign Origin', async () => {
    const { next } = await runMiddleware(originGate, {
      request: serverFnRequest({
        headers: {
          host: 'localhost:3000',
          ...XRW,
          origin: 'https://evil.example',
        },
      }),
    })
    expect(next).not.toHaveBeenCalled()
  })

  it('passes a server fn GET with good Host, XRW and no Origin', async () => {
    const { next } = await runMiddleware(originGate, {
      request: serverFnRequest({ headers: { host: 'localhost:3000', ...XRW } }),
    })
    expect(next).toHaveBeenCalledTimes(1)
  })

  it('passes a server fn POST with good Host, XRW and Origin', async () => {
    const { next } = await runMiddleware(originGate, {
      request: serverFnRequest({
        method: 'POST',
        headers: { host: 'localhost:3000', ...XRW, ...GOOD_ORIGIN },
      }),
    })
    expect(next).toHaveBeenCalledTimes(1)
  })

  it('passes /healthz with a foreign Host and no XRW', async () => {
    const { next } = await runMiddleware(originGate, {
      request: new Request('http://evil.example/healthz', {
        headers: { host: 'evil.example' },
      }),
      handlerType: 'router',
    })
    expect(next).toHaveBeenCalledTimes(1)
  })

  it('passes GET / with an allowed Host and no XRW or Origin', async () => {
    const { next } = await runMiddleware(originGate, {
      request: new Request('http://localhost:3000/', {
        headers: { host: 'localhost:3000' },
      }),
      handlerType: 'router',
    })
    expect(next).toHaveBeenCalledTimes(1)
  })

  it('answers bad_origin, not a raw 500, when the env is invalid (dev)', async () => {
    vi.stubEnv('SESSION_SECRET', 'short')
    resetEnvCache()
    const { response, next } = await runMiddleware(originGate, {
      request: serverFnRequest({
        method: 'POST',
        headers: { host: 'localhost:3000', ...XRW, ...GOOD_ORIGIN },
      }),
    })
    expect(next).not.toHaveBeenCalled()
    await expectBadOrigin(response)
  })

  it('skips during the build prerender (no app env)', async () => {
    vi.unstubAllEnvs()
    resetEnvCache()
    vi.stubEnv('TSS_PRERENDERING', 'true')
    const { next } = await runMiddleware(originGate, {
      request: new Request('http://localhost/', {
        headers: { host: 'localhost' },
      }),
      handlerType: 'router',
    })
    expect(next).toHaveBeenCalledTimes(1)
  })
})
