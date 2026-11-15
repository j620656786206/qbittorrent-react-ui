import { vi } from 'vitest'
import type { AnyRequestMiddleware } from '@tanstack/react-start'

// Test-only helpers for request middleware. Not imported by the app.

export const TEST_ENV = {
  QBIT_URL: 'http://qbit.test.invalid:8080',
  QBIT_USERNAME: 'fake-user',
  QBIT_PASSWORD: 'fake-password-1',
  SESSION_SECRET: 's'.repeat(44),
  APP_ORIGINS: 'http://localhost:3000',
  SAVE_ROOTS: '/downloads',
}

export function stubTestEnv(): void {
  for (const [key, value] of Object.entries(TEST_ENV)) vi.stubEnv(key, value)
}

export interface MiddlewareCall {
  request: Request
  pathname?: string
  handlerType?: 'serverFn' | 'router'
  context?: Record<string, unknown>
}

type Context = Record<string, unknown>
interface Ctx {
  request: Request
  pathname: string
  handlerType: 'serverFn' | 'router'
  context: Context
}
interface Result extends Ctx {
  response: Response
}
type ServerFn = (
  options: Ctx & { next: (options?: { context?: Context }) => Promise<Result> },
) => Promise<Result | Response> | Result | Response

function serverOf(middleware: AnyRequestMiddleware): ServerFn {
  const server = middleware.options.server
  if (!server) throw new Error('middleware has no server function')
  return server as unknown as ServerFn
}

function ctxOf(call: MiddlewareCall): Ctx {
  return {
    request: call.request,
    pathname: call.pathname ?? new URL(call.request.url).pathname,
    handlerType: call.handlerType ?? 'serverFn',
    context: call.context ?? {},
  }
}

/** Runs one middleware with a spy `next` that returns a 200 response. */
export async function runMiddleware(
  middleware: AnyRequestMiddleware,
  call: MiddlewareCall,
) {
  const ctx = ctxOf(call)
  const next = vi.fn(async (options?: { context?: Context }) => ({
    ...ctx,
    context: { ...ctx.context, ...options?.context },
    response: new Response('inner', { status: 200 }),
  }))
  const result = await serverOf(middleware)({ ...ctx, next })
  const response = result instanceof Response ? result : result.response
  return { result, response, next }
}

/** Runs a middleware chain the way Start does; `terminal` sees the final context. */
export async function runChain(
  middlewares: ReadonlyArray<AnyRequestMiddleware>,
  call: MiddlewareCall,
  handler: (ctx: Ctx) => Promise<Response> = async () =>
    new Response('terminal', { status: 200 }),
) {
  const terminal = vi.fn(handler)
  const dispatch = async (index: number, ctx: Ctx): Promise<Result> => {
    if (index === middlewares.length)
      return { ...ctx, response: await terminal(ctx) }
    const result = await serverOf(middlewares[index])({
      ...ctx,
      next: (options) =>
        dispatch(index + 1, {
          ...ctx,
          context: { ...ctx.context, ...options?.context },
        }),
    })
    return result instanceof Response ? { ...ctx, response: result } : result
  }
  const result = await dispatch(0, ctxOf(call))
  return { response: result.response, terminal }
}

export function serverFnRequest(
  init: RequestInit & { url?: string; duplex?: 'half' } = {},
): Request {
  const { url = 'http://localhost:3000/_serverFn/abc', ...rest } = init
  return new Request(url, rest)
}
