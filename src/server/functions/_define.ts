import { createServerFn } from '@tanstack/react-start'
import type { z } from 'zod'
import { isVerifiedSession } from '#/server/auth/verified'
import type { SessionPayload } from '#/server/auth/verified'
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
//     .handler(guard({ name: 'getExample' }, async ({ input, signal }) => ok(...)))
//
// The schema is named once: `input()` parses on the server (Start runs the
// validator only there) and `guard()` takes its input type and result from it.
// https://tanstack.com/start/latest/docs/framework/react/guide/server-functions

/** Reads only. A GET function must have no side effects (AR-25). */
export const serverGet = createServerFn({ method: 'GET' })
/** Every function that changes anything is POST (AR-25). */
export const serverPost = createServerFn({ method: 'POST' })

export const SERVER_FN_TIMEOUT_MS = 30_000
export const GUARDED = Symbol.for('rt.guarded')

declare const PARSED: unique symbol

/** What `input()` hands `guard()`: a zod result, never client data as is. */
export interface ParsedInput<TOutput> {
  readonly [PARSED]: TOutput
}

// Results that `input()` produced. Without a validator Start passes the
// client's data straight through, so `guard()` only trusts these.
const parsedResults = new WeakMap<object, z.ZodSafeParseResult<unknown>>()

/**
 * The validator for `.validator()`. It never throws (Start's own validator
 * would turn bad input into a thrown error): `guard()` checks login first and
 * then answers `invalid_input` when parsing failed.
 */
export function input<TSchema extends z.ZodType>(schema: TSchema) {
  return (data: z.input<TSchema>): ParsedInput<z.output<TSchema>> => {
    const handle = Object.freeze({}) as ParsedInput<z.output<TSchema>>
    parsedResults.set(handle, schema.safeParse(data))
    return handle
  }
}

function readParsed(data: unknown): z.ZodSafeParseResult<unknown> | undefined {
  return typeof data === 'object' && data !== null
    ? parsedResults.get(data)
    : undefined
}

export interface GuardSpec {
  /** Only `login` may be public (AD-5); the discovery test enforces it. */
  auth?: 'required' | 'public'
  /**
   * Bytes; defaults to 64 KB. Cannot exceed the gate's request ceiling.
   * Checked after Start has read the body, so it only ever sees logged-in
   * callers: the gate already caps requests without a session at 64 KB.
   */
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
export interface GuardCall<TInput = unknown> {
  data?: ParsedInput<TInput>
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
  // Only a session `verifySession` made; never a client-sent look-alike.
  const session = isVerifiedSession(value.session) ? value.session : null
  const bodyBytes = typeof value.bodyBytes === 'number' ? value.bodyBytes : 0
  return { session, bodyBytes }
}

const TIMED_OUT = Symbol('timed out')

export function guard<TInput, TData>(
  spec: GuardSpec,
  run: (args: RunArgs<TInput>) => Promise<Result<TData>>,
) {
  const limit = spec.bodyLimit ?? DEFAULT_BODY_LIMIT
  if (!Number.isInteger(limit) || limit < 0 || limit > MAX_REQUEST_BODY) {
    throw new RangeError(
      `guard(): bodyLimit must be an integer from 0 to ${MAX_REQUEST_BODY}`,
    )
  }
  const fn = spec.name

  const runner = async (call: GuardCall<TInput>): Promise<Result<TData>> => {
    const { session, bodyBytes } = readContext(call.context)
    if (spec.auth !== 'public' && session === null) return fail('not_logged_in')
    if (bodyBytes > limit) {
      return fail('invalid_input')
    }
    const parsed = readParsed(call.data)
    if (!parsed?.success) return fail('invalid_input')

    const controller = new AbortController()
    let timer: ReturnType<typeof setTimeout> | undefined
    const timeout = new Promise<typeof TIMED_OUT>((resolve) => {
      timer = setTimeout(() => resolve(TIMED_OUT), SERVER_FN_TIMEOUT_MS)
    })
    const pending = Promise.resolve().then(() =>
      run({ input: parsed.data as TInput, signal: controller.signal, session }),
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

  const guarded: Guarded = { spec, run: runner as Guarded['run'] }
  const handler = (call: GuardCall<TInput>) => runner(call)
  return Object.assign(handler, { [GUARDED]: guarded })
}
