import { AppError, classifyResponse, isAppError } from '#/lib/app-error'
import { isErrorCode } from '#/shared/errors'

// AD-9 / AR-34: the browser's only way to call a server function. It adds
// `X-Requested-With`, a 35 s timeout, and turns every failure into an
// `AppError` for TanStack Query. Golden example:
//
//   queryFn: ({ signal }) => callFn(getMaindata, { since }, { signal })

export const CALL_TIMEOUT_MS = 35_000

type CustomFetch = (
  input: RequestInfo | URL,
  init?: RequestInit,
) => Promise<Response>

/** The per-call options Start's client accepts. */
interface ServerFnCallOptions {
  data?: unknown
  headers?: HeadersInit
  signal?: AbortSignal
  fetch?: CustomFetch
}

type AnyServerFn = (options: never) => Promise<unknown>

type InputOf<TFn extends AnyServerFn> =
  NonNullable<Parameters<TFn>[0]> extends { data?: infer TInput }
    ? TInput
    : undefined

type DataOf<TFn extends AnyServerFn> =
  Extract<Awaited<ReturnType<TFn>>, { ok: true }> extends { data: infer TData }
    ? TData
    : never

export interface CallFnOptions {
  /** Usually the `signal` TanStack Query passes to `queryFn`. */
  signal?: AbortSignal
  /**
   * Story 4.7: this call's own timeout instead of `CALL_TIMEOUT_MS` (an
   * upload, whose time on the wire comes before the server's deadline).
   */
  timeoutMs?: number
}

function unexpected(what: string, raw: unknown): AppError {
  // The raw value may hold HTML, a URL or exception text: console only.
  console.error(`callFn: ${what}`, raw)
  return new AppError('qbit_rejected')
}

function unwrap(value: unknown): unknown {
  // Start hands back a raw Response for a non-JSON 2xx; its `ok` is not ours.
  const isContract =
    typeof value === 'object' &&
    value !== null &&
    !(value instanceof Response) &&
    'ok' in value
  if (isContract) {
    const result = value as { ok: unknown; data?: unknown; error?: unknown }
    // Query rejects `undefined` data, so a function with no data gives null.
    if (result.ok === true) return result.data ?? null
    if (result.ok === false) {
      const code = (result.error as { code?: unknown } | undefined)?.code
      if (isErrorCode(code)) throw new AppError(code)
      throw unexpected('unknown error code', value)
    }
  }
  throw unexpected('response is not the error contract', value)
}

function isJson(response: Response): boolean {
  const type = response.headers.get('content-type') ?? ''
  return type.toLowerCase().includes('application/json')
}

function gateFailure(body: unknown): AppError {
  const code = (body as { error?: { code?: unknown } } | undefined)?.error?.code
  if (
    (body as { ok?: unknown } | undefined)?.ok === false &&
    isErrorCode(code)
  ) {
    return new AppError(code)
  }
  return unexpected('error response is not the error contract', body)
}

/** Rejects with the signal's reason when it aborts; `stop` removes the listener. */
function rejectOnAbort(signal: AbortSignal) {
  let stop = () => {}
  const promise = new Promise<never>((_resolve, reject) => {
    const onAbort = () => reject(signal.reason)
    if (signal.aborted) return onAbort()
    signal.addEventListener('abort', onAbort, { once: true })
    stop = () => signal.removeEventListener('abort', onAbort)
  })
  // Promise.race observes it; this only keeps a late rejection quiet.
  promise.catch(() => {})
  return { promise, stop }
}

export async function callFn<TFn extends AnyServerFn>(
  fn: TFn,
  input?: InputOf<TFn>,
  options: CallFnOptions = {},
): Promise<DataOf<TFn>> {
  const caller = options.signal
  caller?.throwIfAborted()

  const timeout = new AbortController()
  // A plain timer (not AbortSignal.timeout) so fake timers drive it in tests.
  const timer = setTimeout(
    () => timeout.abort(),
    options.timeoutMs ?? CALL_TIMEOUT_MS,
  )
  const signal = caller
    ? AbortSignal.any([caller, timeout.signal])
    : timeout.signal
  const aborted = rejectOnAbort(signal)

  // Called by Start's client instead of the global fetch; looked up at call
  // time so tests can stub it. Errors thrown here reach callFn unchanged.
  const guardedFetch: CustomFetch = async (url, init) => {
    let response: Response
    try {
      // Manual: a followed Cloudflare Access redirect would fail on CORS and
      // look like `home_unreachable`; classifyResponse sees it instead.
      response = await globalThis.fetch(url, { ...init, redirect: 'manual' })
    } catch (error) {
      if (caller?.aborted) throw caller.reason
      // Network failure or our own timeout.
      throw new AppError('home_unreachable')
    }
    const code = classifyResponse(response)
    if (code) {
      // Never read an error page into a message.
      void response.body?.cancel().catch(() => {})
      throw new AppError(code)
    }
    if (!response.ok && isJson(response)) {
      // A gate rejection (403 bad_origin, 413 invalid_input) is plain contract
      // JSON. Start's client would turn its `error` key into a thrown object,
      // so decide it here.
      throw gateFailure(await response.json().catch(() => undefined))
    }
    return response
  }

  const call = fn as unknown as (
    options: ServerFnCallOptions,
  ) => Promise<unknown>

  try {
    const value = await Promise.race([
      call({
        data: input,
        headers: { 'X-Requested-With': 'XMLHttpRequest' },
        signal,
        fetch: guardedFetch,
      }),
      aborted.promise,
    ])
    return unwrap(value) as DataOf<TFn>
  } catch (error) {
    // The caller cancelled (e.g. Query cancelled the fetch): no classification.
    if (caller?.aborted) throw caller.reason
    if (isAppError(error)) throw error
    if (timeout.signal.aborted) throw new AppError('home_unreachable')
    throw unexpected('server function call failed', error)
  } finally {
    clearTimeout(timer)
    aborted.stop()
  }
}
