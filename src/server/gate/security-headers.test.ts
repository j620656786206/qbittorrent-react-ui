import { describe, expect, it } from 'vitest'
import { STATIC_CSP, buildCsp } from '#/shared/csp'
import { applySecurityHeaders, securityHeaders } from './security-headers'
import { runChain, runMiddleware } from './testing'

const AR_31 =
  "default-src 'self'; script-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'"

describe('CSP builder (AR-31, amended AD-10)', () => {
  it('static assets get the exact AR-31 string', () => {
    expect(STATIC_CSP).toBe(AR_31)
  })

  it('HTML gets the same policy with a nonce in script-src only', () => {
    expect(buildCsp('abc==')).toBe(
      AR_31.replace("script-src 'self'", "script-src 'self' 'nonce-abc=='"),
    )
    expect(buildCsp('abc==')).not.toContain('unsafe-inline')
  })
})

describe('securityHeaders middleware', () => {
  it('passes a fresh nonce to the context and sets the headers', async () => {
    const { response, next } = await runMiddleware(securityHeaders, {
      request: new Request('http://localhost:3000/'),
      handlerType: 'router',
    })
    expect(next).toHaveBeenCalledTimes(1)
    const nonce = (next.mock.calls[0][0] as { context: { cspNonce: string } })
      .context.cspNonce
    expect(Buffer.from(nonce, 'base64')).toHaveLength(16)
    expect(response.headers.get('content-security-policy')).toBe(
      buildCsp(nonce),
    )
    expect(response.headers.get('x-content-type-options')).toBe('nosniff')
    expect(response.headers.get('referrer-policy')).toBe('no-referrer')
    expect(response.headers.get('cache-control')).toBe('no-store')
  })

  it.each([
    ['a server function', 'serverFn', 'http://localhost:3000/_serverFn/abc'],
    ['a page', 'router', 'http://localhost:3000/'],
  ] as const)(
    '%s answer is no-store, even if the handler asked for caching',
    async (_name, handlerType, url) => {
      const { response } = await runChain(
        [securityHeaders],
        { request: new Request(url), handlerType },
        async () =>
          new Response('{}', {
            headers: { 'cache-control': 'public, max-age=600' },
          }),
      )
      expect(response.headers.get('cache-control')).toBe('no-store')
    },
  )

  it('uses a different nonce per request', async () => {
    const a = await runMiddleware(securityHeaders, {
      request: new Request('http://localhost:3000/'),
    })
    const b = await runMiddleware(securityHeaders, {
      request: new Request('http://localhost:3000/'),
    })
    expect(a.response.headers.get('content-security-policy')).not.toBe(
      b.response.headers.get('content-security-policy'),
    )
  })

  it.each([200, 404, 403, 413])(
    'heads a %i response and strips access-control-*',
    async (status) => {
      const { response } = await runChain(
        [securityHeaders],
        {
          request: new Request('http://localhost:3000/x'),
          handlerType: 'router',
        },
        async () =>
          new Response('x', {
            status,
            headers: {
              'access-control-allow-origin': '*',
              'Access-Control-Allow-Credentials': 'true',
            },
          }),
      )
      expect(response.status).toBe(status)
      expect(response.headers.get('content-security-policy')).toMatch(
        /script-src 'self' 'nonce-/,
      )
      expect(
        [...response.headers.keys()].filter((key) =>
          key.startsWith('access-control-'),
        ),
      ).toEqual([])
    },
  )

  it('copies a response with immutable headers, then heads it', () => {
    const redirect = Response.redirect('http://localhost:3000/elsewhere', 302)
    const headed = applySecurityHeaders(redirect, 'n0nce')
    expect(headed).not.toBe(redirect)
    expect(headed.status).toBe(302)
    expect(headed.headers.get('location')).toBe(
      'http://localhost:3000/elsewhere',
    )
    expect(headed.headers.get('content-security-policy')).toBe(
      buildCsp('n0nce'),
    )
    expect(headed.headers.get('cache-control')).toBe('no-store')
  })
})
