// Test-only exception to AD-5: this builds the client half of a server
// function exactly as production does; it never runs on a server.
// eslint-disable-next-line no-restricted-imports
import { createServerFn } from '@tanstack/react-start'
import { createClientRpc } from '@tanstack/react-start/client-rpc'
import { runWithStartContext } from '@tanstack/start-storage-context'
import { toCrossJSONAsync } from 'seroval'
import { vi } from 'vitest'

// Test-only. A server function stub built from Start's real client RPC, so
// tests exercise Start's own request building and response parsing. Pair it
// with `vi.stubGlobal('fetch', ...)`; never point it at a real server.

interface FakeCallOptions {
  data?: unknown
  headers?: HeadersInit
  signal?: AbortSignal
  fetch?: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>
}

export function fakeServerFn<TData, TInput = unknown>(
  id: string,
  method: 'GET' | 'POST',
) {
  vi.stubEnv('TSS_SERVER_FN_BASE', '/_serverFn/')
  const rpc = createClientRpc(id)
  return (options: FakeCallOptions & { data?: TInput }) =>
    runWithStartContext({ startOptions: {} } as never, () =>
      rpc({ ...options, method }),
    ) as Promise<
      | { ok: true; data: TData }
      | { ok: false; error: { code: string; message: string } }
    >
}

/**
 * Like `fakeServerFn`, but built the way Start's compiler builds the client
 * side of a real server function: `createServerFn(...).handler(rpc)`, so the
 * call also runs Start's client middleware chain.
 */
export function startServerFn<TData, TInput = unknown>(
  id: string,
  method: 'GET' | 'POST',
) {
  vi.stubEnv('TSS_SERVER_FN_BASE', '/_serverFn/')
  const fn = createServerFn({ method }).handler(createClientRpc(id) as never)
  return (options: FakeCallOptions & { data?: TInput }) =>
    runWithStartContext({ startOptions: {} } as never, () =>
      (fn as unknown as (options: FakeCallOptions) => Promise<unknown>)(
        options,
      ),
    ) as Promise<
      | { ok: true; data: TData }
      | { ok: false; error: { code: string; message: string } }
    >
}

/** A server function reply encoded the way Start's server handler sends it. */
export async function startResponse(result: unknown): Promise<Response> {
  const body = JSON.stringify(
    await toCrossJSONAsync({ result }, { refs: new Map() }),
  )
  return new Response(body, {
    status: 200,
    headers: { 'content-type': 'application/json', 'x-tss-serialized': 'true' },
  })
}
