import { describe, expect, it } from 'vitest'
import { Route } from './healthz'

type RouteModule = { Route: { options: { server?: { handlers?: unknown } } } }

// Every route module: skip tests and `-` files (the router ignores those too).
const routeModules = import.meta.glob<RouteModule>([
  './**/*.{ts,tsx}',
  '!./**/*.test.{ts,tsx}',
  '!./**/-*',
])

describe('GET /healthz', () => {
  it('returns 200 with body ok as plain text', async () => {
    const handlers = Route.options.server?.handlers
    if (!handlers || typeof handlers === 'function' || !handlers.GET) {
      throw new Error('healthz has no GET handler')
    }
    const GET = handlers.GET as unknown as (ctx: {
      request: Request
    }) => Response | Promise<Response>

    const response = await GET({
      request: new Request('http://localhost/healthz'),
    })

    expect(response.status).toBe(200)
    expect(response.headers.get('content-type')).toMatch(/^text\/plain/)
    expect(await response.text()).toBe('ok')
  })
})

describe('server routes', () => {
  it('only healthz defines server handlers', async () => {
    const files = Object.keys(routeModules)
    expect(files).toContain('./__root.tsx')

    const withHandlers: Array<string> = []
    for (const file of files) {
      const module = await routeModules[file]()
      if (module.Route.options.server?.handlers) withHandlers.push(file)
    }

    expect(withHandlers).toEqual(['./healthz.ts'])
  })
})
