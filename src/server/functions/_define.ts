import { createServerFn } from '@tanstack/react-start'
import type { z } from 'zod'
import type { SessionPayload } from '#/server/auth/session'
import { ServerFailure } from '#/server/errors/server-failure'
import { DEFAULT_BODY_LIMIT, MAX_REQUEST_BODY } from '#/server/gate/body-limit'
import { log } from '#/server/log'
import { fail, isErrorCode } from '#/shared/errors'
import type { Result } from '#/shared/errors'

// AD-5 / AR-23: the only place that calls createServerFn (lint enforced).
// Start's compiler derives each function's id from a top-level
// `export const x = <builder>.handler(fn)`, so a wrapper that calls
// createServerFn here would give every function the same id. Instead every
// server function is written as:
//
//   export const getExample = serverGet
//     .validator(input(exampleInput))
//     .handler(guard({ input: exampleInput }, async ({ input, signal }) => ok(...)))
//
// https://tanstack.com/start/latest/docs/framework/react/guide/server-functions

/** Reads only. A GET function must have no side effects (AR-25). */
export const serverGet = createServerFn({ method: 'GET' })
/** Every function that changes anything is POST (AR-25). */
export const serverPost = createServerFn({ method: 'POST' })

export const SERVER_FN_TIMEOUT_MS = 30_000
export const GUARDED = Symbol.for('rt.guarded')

/**
 * Types the call site only. Start's own validator throws on bad input, so this
 * passes data through untouched and `guard()` runs `safeParse`.
 */
export function input<TSchema extends z.ZodType>(_schema: TSchema) {
  return (data: z.input<TSchema>): z.input<TSchema> => data
}

export interface GuardSpec<TSchema extends z.ZodType = z.ZodType> {
  input: TSchema
  /** Only `login` may be public (AD-5); the discovery test enforces it. */
  auth?: 'required' | 'public'
  /** Bytes; defaults to 64 KB. Cannot exceed the gate's request ceiling. */
  bodyLimit?: number
  /** Shown in `server_fn_*` log lines; use the export name. */
  name?: string
}

export interface RunArgs<TInput> {
  input: TInput
  /** Aborted when the 30 s timeout fires; pass it to qBittorrent calls. */
  signal: AbortSignal
  session: SessionPayload | null
}

/** What Start (or a test) hands the handler; context comes from the gate. */
export interface GuardCall {
  data?: unknown
  context?: unknown
}

export interface Guarded {
  spec: GuardSpec
  run: (call: GuardCall) => Promise<Result<unknown>>
}

interface GateContext {
  session: SessionPayload | null
  bodyBytes: number
}

function readContext(context: unknown): GateContext {
  const value = (context ?? {}) as Partial<Record<keyof GateContext, unknown>>
  const session =
    typeof value.session === 'object' && value.session !== null
      ? (value.session as SessionPayload)
      : null
  const bodyBytes = typeof value.bodyBytes === 'number' ? value.bodyBytes : 0
  return { session, bodyBytes }
}

const TIMED_OUT = Symbol('timed out')

export function guard<TSchema extends z.ZodType, TData>(
  spec: GuardSpec<TSchema>,
  run: (args: RunArgs<z.output<TSchema>>) => Promise<Result<TData>>,
) {
  const limit = spec.bodyLimit ?? DEFAULT_BODY_LIMIT
  if (!Number.isInteger(limit) || limit < 0 || limit > MAX_REQUEST_BODY) {
    throw new RangeError(
      `guard(): bodyLimit must be an integer from 0 to ${MAX_REQUEST_BODY}`,
    )
  }
  const fn = spec.name

  const runner = async (call: GuardCall): Promise<Result<TData>> => {
    const { session, bodyBytes } = readContext(call.context)
    if (spec.auth !== 'public' && session === null) return fail('not_logged_in')
    if (bodyBytes > limit) {
      return fail('invalid_input')
    }
    const parsed = spec.input.safeParse(call.data)
    if (!parsed.success) return fail('invalid_input')

    const controller = new AbortController()
    let timer: ReturnType<typeof setTimeout> | undefined
    const timeout = new Promise<typeof TIMED_OUT>((resolve) => {
      timer = setTimeout(() => resolve(TIMED_OUT), SERVER_FN_TIMEOUT_MS)
    })
    const pending = Promise.resolve().then(() =>
      run({ input: parsed.data, signal: controller.signal, session }),
    )
    // A handler that rejects after the timeout must not become unhandled.
    pending.catch(() => undefined)

    try {
      const outcome = await Promise.race([pending, timeout])
      if (outcome === TIMED_OUT) {
        controller.abort()
        log.warn('server_fn_timeout', { fn, timeoutMs: SERVER_FN_TIMEOUT_MS })
        return fail('timeout')
      }
      // Only the fixed message may reach the client, whatever the handler set.
      if (outcome.ok) return outcome
      return fail(
        isErrorCode(outcome.error.code) ? outcome.error.code : 'qbit_rejected',
      )
    } catch (error) {
      if (error instanceof ServerFailure) {
        log.warn('server_fn_failed', { fn, code: error.code, error })
        return fail(error.code)
      }
      // AD-9: a bug never reaches the client; that operation's failure path runs.
      log.error('server_fn_exception', { fn, error })
      return fail('qbit_rejected')
    } finally {
      clearTimeout(timer)
    }
  }

  const guarded: Guarded = { spec, run: runner }
  const handler = (call: GuardCall) => runner(call)
  return Object.assign(handler, { [GUARDED]: guarded })
}
