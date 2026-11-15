import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { resetEnvCache } from '#/server/env'
import { bodyLimit } from './body-limit'
import { csrf, requestMiddleware } from './index'
import { originGate } from './origin'
import { securityHeaders } from './security-headers'
import { sessionGate } from './session'
import {
  runChain,
  runMiddleware,
  serverFnRequest,
  stubTestEnv,
} from './testing'

const GOOD = {
  host: 'localhost:3000',
  'x-requested-with': 'XMLHttpRequest',
  origin: 'http://localhost:3000',
}

beforeEach(() => {
  stubTestEnv()
  resetEnvCache()
})
afterEach(() => {
  vi.unstubAllEnvs()
  resetEnvCache()
})

function expectHeaded(response: Response) {
  expect(response.headers.get('content-security-policy')).toMatch(
    /script-src 'self' 'nonce-/,
  )
  expect(response.headers.get('x-content-type-options')).toBe('nosniff')
  expect(response.headers.get('referrer-policy')).toBe('no-referrer')
}

describe('request middleware chain (AR-26)', () => {
  it('runs headers, CSRF, origin, session, body limit in that order', () => {
    expect(requestMiddleware).toEqual([
      securityHeaders,
      csrf,
      originGate,
      sessionGate,
      bodyLimit,
    ])
  })

  it('CSRF: Sec-Fetch-Site cross-site gets the bad_origin JSON', async () => {
    const { response, next } = await runMiddleware(csrf, {
      request: serverFnRequest({
        method: 'POST',
        headers: { ...GOOD, 'sec-fetch-site': 'cross-site' },
      }),
    })
    expect(next).not.toHaveBeenCalled()
    expect(response.status).toBe(403)
    expect(await response.json()).toMatchObject({
      ok: false,
      error: { code: 'bad_origin' },
    })
  })

  it('CSRF: an Origin outside APP_ORIGINS is rejected', async () => {
    const { next } = await runMiddleware(csrf, {
      request: serverFnRequest({
        method: 'POST',
        headers: { ...GOOD, origin: 'https://evil.example' },
      }),
    })
    expect(next).not.toHaveBeenCalled()
  })

  it('CSRF: answers bad_origin, not a raw 500, when the env is invalid (dev)', async () => {
    vi.stubEnv('APP_ORIGINS', '')
    resetEnvCache()
    const { response, next } = await runMiddleware(csrf, {
      request: serverFnRequest({ method: 'POST', headers: GOOD }),
    })
    expect(next).not.toHaveBeenCalled()
    expect(response.status).toBe(403)
    expect(await response.json()).toMatchObject({
      error: { code: 'bad_origin' },
    })
  })

  it('CSRF: ignores page requests', async () => {
    const { next } = await runMiddleware(csrf, {
      request: new Request('http://localhost:3000/', {
        headers: { 'sec-fetch-site': 'cross-site' },
      }),
      handlerType: 'router',
    })
    expect(next).toHaveBeenCalledTimes(1)
  })

  it('a GET read with good Host and XRW and no Origin (plain http) reaches the handler', async () => {
    const { response, terminal } = await runChain(requestMiddleware, {
      request: serverFnRequest({
        headers: { host: GOOD.host, 'x-requested-with': 'XMLHttpRequest' },
      }),
    })
    expect(terminal).toHaveBeenCalledTimes(1)
    expect(terminal.mock.calls[0][0].context).toMatchObject({
      session: null,
      bodyBytes: 0,
    })
    expect(typeof terminal.mock.calls[0][0].context.cspNonce).toBe('string')
    expectHeaded(response)
  })

  it('a gate 403 still gets the security headers, handler not called', async () => {
    const { response, terminal } = await runChain(requestMiddleware, {
      request: serverFnRequest({
        method: 'POST',
        headers: { ...GOOD, origin: 'https://evil.example' },
      }),
    })
    expect(terminal).not.toHaveBeenCalled()
    expect(response.status).toBe(403)
    expectHeaded(response)
  })

  it('a gate 413 still gets the security headers, handler not called', async () => {
    const { response, terminal } = await runChain(requestMiddleware, {
      request: serverFnRequest({
        method: 'POST',
        body: 'z'.repeat(70_000),
        headers: GOOD,
      }),
    })
    expect(terminal).not.toHaveBeenCalled()
    expect(response.status).toBe(413)
    expectHeaded(response)
  })

  it('/healthz with a foreign Host and no XRW answers', async () => {
    const { response, terminal } = await runChain(
      requestMiddleware,
      {
        request: new Request('http://evil.example/healthz', {
          headers: { host: 'evil.example' },
        }),
        handlerType: 'router',
      },
      vi.fn(async () => new Response('ok', { status: 200 })),
    )
    expect(terminal).toHaveBeenCalledTimes(1)
    expect(response.status).toBe(200)
    expect(await response.text()).toBe('ok')
    expectHeaded(response)
  })

  it('GET / with an allowed Host and no XRW or Origin renders', async () => {
    const { response, terminal } = await runChain(requestMiddleware, {
      request: new Request('http://localhost:3000/', {
        headers: { host: GOOD.host },
      }),
      handlerType: 'router',
    })
    expect(terminal).toHaveBeenCalledTimes(1)
    expectHeaded(response)
  })
})
