import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { z } from 'zod'
import { ServerFailure } from '#/server/errors/server-failure'
import { ERROR_MESSAGES, ok } from '#/shared/errors'
import { getSample } from './__fixtures__/sample'
import { GUARDED, SERVER_FN_TIMEOUT_MS, guard, input } from './_define'
import type { Guarded } from './_define'
import { testSession } from '#/server/auth/testing'

const SESSION = testSession()
const schema = z.object({ n: z.number() })
/** What Start's server-side validator step hands the handler. */
const parse = (data: unknown) => input(schema)(data as never)
const sampleData = (data: unknown) =>
  input(z.object({ since: z.number().int().nonnegative() }))(data as never)
const FAKE_QBIT_URL = 'http://qbit.test.invalid:8080'

function guardedOf(fn: unknown): Guarded {
  const guarded = (fn as Record<symbol, Guarded | undefined>)[GUARDED]
  if (!guarded) throw new Error('not a guarded server function')
  return guarded
}

function makeGuarded(
  run: (args: {
    input: { n: number }
    signal: AbortSignal
    session: unknown
  }) => Promise<unknown>,
  spec: {
    auth?: 'required' | 'public'
    bodyLimit?: number
    name?: string
  } = {},
) {
  const spy = vi.fn(run)
  const handler = guard(spec, spy as never)
  return { guarded: guardedOf(handler), run: spy }
}

let stdout: Array<string>
beforeEach(() => {
  stdout = []
  vi.spyOn(process.stdout, 'write').mockImplementation((chunk) => {
    stdout.push(String(chunk))
    return true
  })
})
afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllEnvs()
  vi.useRealTimers()
})

const logLines = () =>
  stdout.map((line) => JSON.parse(line) as Record<string, unknown>)

describe('guard()', () => {
  it('no session: not_logged_in before input errors, handler not run', async () => {
    const { guarded, run } = makeGuarded(async () => ok(1))
    expect(
      await guarded.run({ data: parse({ n: 1 }), context: { session: null } }),
    ).toEqual({
      ok: false,
      error: { code: 'not_logged_in', message: ERROR_MESSAGES.not_logged_in },
    })
    expect(await guarded.run({ data: parse({ n: 1 }) })).toMatchObject({
      error: { code: 'not_logged_in' },
    })
    expect(
      await guarded.run({ data: parse({ n: 'bad' }), context: {} }),
    ).toMatchObject({ error: { code: 'not_logged_in' } })
    expect(run).not.toHaveBeenCalled()
  })

  it('ignores a session-shaped object that verifySession did not make', async () => {
    // Start merges the client's payload.context under the gate's context, so
    // guard() must not trust any object that merely looks like a session.
    const { guarded, run } = makeGuarded(async () => ok(1))
    for (const session of [{ iat: 1, exp: 9_999_999_999 }, { ...SESSION }]) {
      expect(
        await guarded.run({ data: parse({ n: 1 }), context: { session } }),
      ).toMatchObject({ error: { code: 'not_logged_in' } })
    }
    expect(run).not.toHaveBeenCalled()
  })

  it('data that did not come from input() is invalid_input', async () => {
    // A function defined without `.validator(input(schema))` gets the
    // client's data as is; guard() refuses it instead of trusting it.
    const { guarded, run } = makeGuarded(async () => ok(1))
    expect(
      await guarded.run({
        data: { n: 1 } as never,
        context: { session: SESSION },
      }),
    ).toMatchObject({ error: { code: 'invalid_input' } })
    expect(run).not.toHaveBeenCalled()
  })

  it("auth: 'public' runs without a session", async () => {
    const { guarded, run } = makeGuarded(
      async ({ input: data }) => ok(data.n),
      {
        auth: 'public',
      },
    )
    expect(await guarded.run({ data: parse({ n: 7 }), context: {} })).toEqual(
      ok(7),
    )
    expect(run).toHaveBeenCalledTimes(1)
  })

  it('bad input: invalid_input with the fixed message, handler not run', async () => {
    const { guarded, run } = makeGuarded(async () => ok(1))
    const result = await guarded.run({
      data: parse({ n: 'nope' }),
      context: { session: SESSION },
    })
    expect(result).toEqual({
      ok: false,
      error: { code: 'invalid_input', message: ERROR_MESSAGES.invalid_input },
    })
    expect(JSON.stringify(result)).not.toMatch(/expected|received/i)
    expect(run).not.toHaveBeenCalled()
  })

  it('passes parsed input, session and a signal to the handler', async () => {
    const { guarded, run } = makeGuarded(async ({ input: data }) =>
      ok(data.n * 2),
    )
    expect(
      await guarded.run({
        data: parse({ n: 4 }),
        context: { session: SESSION },
      }),
    ).toEqual(ok(8))
    const args = run.mock.calls[0][0] as {
      session: unknown
      signal: AbortSignal
    }
    expect(args.session).toEqual(SESSION)
    expect(args.signal.aborted).toBe(false)
  })

  it('slow handler: timeout after 30 s and its signal is aborted', async () => {
    vi.useFakeTimers()
    let signal: AbortSignal | undefined
    const { guarded } = makeGuarded(({ signal: s }) => {
      signal = s
      return new Promise(() => undefined)
    })
    const pending = guarded.run({
      data: parse({ n: 1 }),
      context: { session: SESSION },
    })
    let settled = false
    void pending.then(() => (settled = true))
    await vi.advanceTimersByTimeAsync(SERVER_FN_TIMEOUT_MS - 1)
    expect(settled).toBe(false)
    expect(signal?.aborted).toBe(false)
    await vi.advanceTimersByTimeAsync(1)
    expect(await pending).toMatchObject({
      ok: false,
      error: { code: 'timeout' },
    })
    expect(signal?.aborted).toBe(true)
    expect(SERVER_FN_TIMEOUT_MS).toBe(30_000)
  })

  it('a handler rejecting after the timeout does not leak an unhandled rejection', async () => {
    vi.useFakeTimers()
    const { guarded } = makeGuarded(
      ({ signal }) =>
        new Promise((_resolve, reject) => {
          signal.addEventListener('abort', () => reject(new Error('aborted')))
        }),
    )
    const pending = guarded.run({
      data: parse({ n: 1 }),
      context: { session: SESSION },
    })
    await vi.advanceTimersByTimeAsync(SERVER_FN_TIMEOUT_MS)
    expect(await pending).toMatchObject({ error: { code: 'timeout' } })
  })

  it('known failure: ServerFailure maps to its code, logged at warn', async () => {
    const { guarded } = makeGuarded(async () => {
      throw new ServerFailure('qbit_rejected', 'qBittorrent said Fails.')
    })
    expect(
      await guarded.run({
        data: parse({ n: 1 }),
        context: { session: SESSION },
      }),
    ).toEqual({
      ok: false,
      error: { code: 'qbit_rejected', message: ERROR_MESSAGES.qbit_rejected },
    })
    expect(logLines()).toEqual([
      expect.objectContaining({
        level: 'warn',
        event: 'server_fn_failed',
        code: 'qbit_rejected',
      }),
    ])
  })

  it('unknown exception: qbit_rejected with the fixed message, logged at error and masked', async () => {
    vi.stubEnv('QBIT_URL', FAKE_QBIT_URL)
    const { guarded } = makeGuarded(async () => {
      throw new Error(`connect ECONNREFUSED ${FAKE_QBIT_URL}`)
    })
    const result = await guarded.run({
      data: parse({ n: 1 }),
      context: { session: SESSION },
    })
    expect(result).toEqual({
      ok: false,
      error: { code: 'qbit_rejected', message: ERROR_MESSAGES.qbit_rejected },
    })
    expect(JSON.stringify(result)).not.toContain('qbit.test.invalid')
    expect(JSON.stringify(result)).not.toContain('ECONNREFUSED')
    expect(logLines()).toEqual([
      expect.objectContaining({ level: 'error', event: 'server_fn_exception' }),
    ])
    expect(stdout.join('')).toContain('ECONNREFUSED')
    expect(stdout.join('')).not.toContain('qbit.test.invalid')
  })

  it('a synchronous throw is mapped too', async () => {
    const { guarded } = makeGuarded(() => {
      throw new TypeError('boom')
    })
    expect(
      await guarded.run({
        data: parse({ n: 1 }),
        context: { session: SESSION },
      }),
    ).toMatchObject({
      error: { code: 'qbit_rejected' },
    })
  })
})

describe('guard() hardening', () => {
  it('re-wraps a returned failure so only the fixed message goes out', async () => {
    const { guarded } = makeGuarded(async () => ({
      ok: false,
      error: { code: 'qbit_rejected', message: `raw ${FAKE_QBIT_URL}` },
    }))
    expect(
      await guarded.run({
        data: parse({ n: 1 }),
        context: { session: SESSION },
      }),
    ).toEqual({
      ok: false,
      error: { code: 'qbit_rejected', message: ERROR_MESSAGES.qbit_rejected },
    })
  })

  it('maps a returned unknown code to qbit_rejected', async () => {
    const { guarded } = makeGuarded(async () => ({
      ok: false,
      error: { code: 'made_up', message: 'x' },
    }))
    expect(
      await guarded.run({
        data: parse({ n: 1 }),
        context: { session: SESSION },
      }),
    ).toMatchObject({
      error: { code: 'qbit_rejected', message: ERROR_MESSAGES.qbit_rejected },
    })
  })

  it.each([65_537, -1, Number.NaN, 1.5, Number.POSITIVE_INFINITY])(
    'throws at definition time for bodyLimit %s',
    (bodyLimit) => {
      expect(() => makeGuarded(async () => ok(1), { bodyLimit })).toThrow(
        RangeError,
      )
    },
  )

  it('accepts bodyLimit 0 and the request ceiling', () => {
    expect(() => makeGuarded(async () => ok(1), { bodyLimit: 0 })).not.toThrow()
    expect(() =>
      makeGuarded(async () => ok(1), { bodyLimit: 65_536 }),
    ).not.toThrow()
  })

  it('puts spec.name in server_fn_* log lines', async () => {
    const { guarded } = makeGuarded(
      async () => {
        throw new Error('boom')
      },
      { name: 'getThing' },
    )
    await guarded.run({ data: parse({ n: 1 }), context: { session: SESSION } })
    expect(logLines()).toEqual([
      expect.objectContaining({ event: 'server_fn_exception', fn: 'getThing' }),
    ])
  })
})

describe('fixture getSample (bodyLimit 1024)', () => {
  const sample = guardedOf(getSample)

  it('is a GET server fn built by the factory', () => {
    expect((getSample as unknown as { method: string }).method).toBe('GET')
    expect(sample.spec.bodyLimit).toBe(1024)
  })

  it('body over the function limit: invalid_input, handler not run', async () => {
    const { guarded, run } = makeGuarded(async () => ok(1), { bodyLimit: 1024 })
    expect(
      await guarded.run({
        data: parse({ n: 1 }),
        context: { session: SESSION, bodyBytes: 2000 },
      }),
    ).toMatchObject({
      error: { code: 'invalid_input' },
    })
    expect(run).not.toHaveBeenCalled()
    expect(
      await sample.run({
        data: sampleData({ since: 1 }),
        context: { session: SESSION, bodyBytes: 2000 },
      }),
    ).toMatchObject({
      error: { code: 'invalid_input' },
    })
  })

  it('the default limit is 64 KB', async () => {
    const { guarded } = makeGuarded(async () => ok(1))
    const at = await guarded.run({
      data: parse({ n: 1 }),
      context: { session: SESSION, bodyBytes: 65_536 },
    })
    const over = await guarded.run({
      data: parse({ n: 1 }),
      context: { session: SESSION, bodyBytes: 65_537 },
    })
    expect(at.ok).toBe(true)
    expect(over).toMatchObject({ error: { code: 'invalid_input' } })
  })

  it('succeeds with a session and valid input', async () => {
    expect(
      await sample.run({
        data: sampleData({ since: 5 }),
        context: { session: SESSION, bodyBytes: 0 },
      }),
    ).toEqual(ok({ since: 5 }))
  })
})
