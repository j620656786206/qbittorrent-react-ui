import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { MockInstance } from 'vitest'
import { AppError } from '#/lib/app-error'
import { CALL_TIMEOUT_MS, callFn } from '#/state/call-fn'
import { fakeServerFn, startResponse, startServerFn } from '#/state/testing'
import type { ErrorCode } from '#/shared/errors'

// Spec 1.3 matrix rows 1 to 11. Start's real client RPC builds the request
// and parses the response; only the global fetch is fake.

const FAKE_HOST = 'qbit.test.invalid'

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  })
}

function html(status: number): Response {
  return new Response(
    `<!doctype html><title>Sign in</title><a href="http://${FAKE_HOST}:8080/login">login</a>`,
    { status, headers: { 'content-type': 'text/html; charset=utf-8' } },
  )
}

type Outcome = { code: ErrorCode } | { data: unknown }

interface Row {
  name: string
  respond: () => Promise<Response>
  expected: Outcome
}

const ROWS: Array<Row> = [
  {
    name: '1 success',
    respond: async () => json({ ok: true, data: { n: 1 } }),
    expected: { data: { n: 1 } },
  },
  {
    name: '2 contract failure',
    respond: async () =>
      json({
        ok: false,
        error: {
          code: 'qbit_rejected',
          message: `raw from http://${FAKE_HOST}`,
        },
      }),
    expected: { code: 'qbit_rejected' },
  },
  {
    name: '3 gate reject',
    respond: async () =>
      json({ ok: false, error: { code: 'bad_origin', message: 'x' } }, 403),
    expected: { code: 'bad_origin' },
  },
  {
    name: '4 Cloudflare 401',
    respond: async () => html(401),
    expected: { code: 'cloudflare_expired' },
  },
  {
    name: '5 HTML in 200',
    respond: async () => html(200),
    expected: { code: 'cloudflare_expired' },
  },
  {
    name: '6 network error',
    respond: async () => {
      throw new TypeError(`Failed to fetch http://${FAKE_HOST}:8080`)
    },
    expected: { code: 'home_unreachable' },
  },
  {
    name: '8 server down 500',
    respond: async () => html(500),
    expected: { code: 'home_unreachable' },
  },
  {
    name: '8 server down 502',
    respond: async () => html(502),
    expected: { code: 'home_unreachable' },
  },
  {
    name: '8 server down 530',
    respond: async () => html(530),
    expected: { code: 'home_unreachable' },
  },
  {
    name: '10 unknown shape: 200 text/plain',
    respond: async () =>
      new Response(`see http://${FAKE_HOST}`, {
        status: 200,
        headers: { 'content-type': 'text/plain' },
      }),
    expected: { code: 'qbit_rejected' },
  },
  {
    name: '4 Cloudflare 403 block page',
    respond: async () => html(403),
    expected: { code: 'cloudflare_expired' },
  },
  {
    name: '8 HTML error page: 404',
    respond: async () => html(404),
    expected: { code: 'home_unreachable' },
  },
  {
    name: '8 HTML error page: 429',
    respond: async () => html(429),
    expected: { code: 'home_unreachable' },
  },
  {
    name: '10 unknown shape: contract code outside AR-33',
    respond: async () =>
      json({ ok: false, error: { code: 'disk_on_fire', message: 'x' } }),
    expected: { code: 'qbit_rejected' },
  },
  {
    name: '10 unknown shape: 403 JSON without the contract',
    respond: async () => json({ message: `http://${FAKE_HOST}` }, 403),
    expected: { code: 'qbit_rejected' },
  },
  {
    name: '3 gate reject: 413 invalid_input',
    respond: async () =>
      json({ ok: false, error: { code: 'invalid_input', message: 'x' } }, 413),
    expected: { code: 'invalid_input' },
  },
  {
    name: '10 unknown shape: JSON without the contract',
    respond: async () => json({ hello: `http://${FAKE_HOST}` }),
    expected: { code: 'qbit_rejected' },
  },
]

let consoleError: MockInstance<typeof console.error>

beforeEach(() => {
  vi.stubEnv('QBIT_URL', `http://${FAKE_HOST}:8080`)
  consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})
})

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
  vi.unstubAllEnvs()
  vi.restoreAllMocks()
})

function expectCleanMessage(error: AppError) {
  // Row 11: message hygiene.
  expect(error.message).not.toContain(FAKE_HOST)
  expect(error.message).not.toContain('<')
  expect(error.message).not.toContain('http')
}

async function settle(promise: Promise<unknown>): Promise<Outcome> {
  try {
    return { data: await promise }
  } catch (error) {
    expect(error).toBeInstanceOf(AppError)
    const appError = error as AppError
    expectCleanMessage(appError)
    return { code: appError.code }
  }
}

describe('callFn (rows 1 to 6, 8, 10, 11)', () => {
  it.each(ROWS.map((row) => [row.name, row] as const))(
    '%s',
    async (_name, row) => {
      const fetchMock = vi.fn(row.respond)
      vi.stubGlobal('fetch', fetchMock)
      const fn = fakeServerFn<unknown, { marker: string }>('rt-test', 'POST')

      const outcome = await settle(callFn(fn, { marker: 'input-marker-17' }))

      expect(outcome).toEqual(row.expected)
      expect(fetchMock).toHaveBeenCalledTimes(1)
      const [url, init] = fetchMock.mock.calls[0] as unknown as [
        string,
        RequestInit,
      ]
      expect(url).toBe('/_serverFn/rt-test')
      const headers = new Headers(init.headers)
      expect(headers.get('x-requested-with')).toBe('XMLHttpRequest')
      expect(String(init.body)).toContain('input-marker-17')
    },
  )

  it('row 2: the message is the fixed Chinese text, not the server text', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        json({
          ok: false,
          error: { code: 'qbit_rejected', message: 'server said no' },
        }),
      ),
    )
    const error = await callFn(fakeServerFn('rt-test', 'POST')).catch(
      (caught: unknown) => caught,
    )
    expect(error).toBeInstanceOf(AppError)
    expect((error as AppError).message).toBe('qBittorrent 拒絕這個操作')
  })

  it('row 8: the error page body is never read into the message', async () => {
    const response = html(502)
    const text = vi.spyOn(response, 'text')
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => response),
    )
    const outcome = await settle(callFn(fakeServerFn('rt-test', 'GET')))
    expect(outcome).toEqual({ code: 'home_unreachable' })
    expect(text).not.toHaveBeenCalled()
  })

  it('row 10: the raw value goes to console.error only', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        json({
          ok: false,
          error: { code: 'disk_on_fire', message: `http://${FAKE_HOST}` },
        }),
      ),
    )
    const outcome = await settle(callFn(fakeServerFn('rt-test', 'GET')))
    expect(outcome).toEqual({ code: 'qbit_rejected' })
    expect(consoleError).toHaveBeenCalled()
    expect(JSON.stringify(consoleError.mock.calls)).toContain(FAKE_HOST)
  })

  it('GET carries the input in the URL and the header', async () => {
    const fetchMock = vi.fn(async () => json({ ok: true, data: 1 }))
    vi.stubGlobal('fetch', fetchMock)
    const fn = fakeServerFn<number, { marker: string }>('rt-get', 'GET')
    await expect(callFn(fn, { marker: 'get-marker-9' })).resolves.toBe(1)
    const [url, init] = fetchMock.mock.calls[0] as unknown as [
      string,
      RequestInit,
    ]
    expect(decodeURIComponent(url)).toContain('get-marker-9')
    expect(new Headers(init.headers).get('x-requested-with')).toBe(
      'XMLHttpRequest',
    )
  })
})

describe('callFn through createServerFn().handler() with Start-encoded replies', () => {
  it.each([
    [
      '1 success',
      () => startResponse({ ok: true, data: { n: 1 } }),
      { data: { n: 1 } },
    ],
    [
      '2 contract failure',
      () =>
        startResponse({
          ok: false,
          error: { code: 'qbit_rejected', message: `http://${FAKE_HOST}` },
        }),
      { code: 'qbit_rejected' },
    ],
    [
      '3 gate reject (plain JSON, not Start-encoded)',
      async () =>
        json({ ok: false, error: { code: 'bad_origin', message: 'x' } }, 403),
      { code: 'bad_origin' },
    ],
    ['4 Cloudflare 401', async () => html(401), { code: 'cloudflare_expired' }],
    ['8 server down 502', async () => html(502), { code: 'home_unreachable' }],
  ] as const)('%s', async (_name, respond, expected) => {
    const fetchMock = vi.fn(respond)
    vi.stubGlobal('fetch', fetchMock)
    const fn = startServerFn<unknown, { marker: string }>('rt-start', 'POST')

    const outcome = await settle(callFn(fn, { marker: 'start-marker-3' }))

    expect(outcome).toEqual(expected)
    expect(fetchMock).toHaveBeenCalledTimes(1)
    const [url, init] = fetchMock.mock.calls[0] as unknown as [
      string,
      RequestInit,
    ]
    expect(url).toBe('/_serverFn/rt-start')
    expect(new Headers(init.headers).get('x-requested-with')).toBe(
      'XMLHttpRequest',
    )
    expect(String(init.body)).toContain('start-marker-3')
  })
})

describe('callFn with no data', () => {
  it('resolves null for plain JSON { ok: true }', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => json({ ok: true })),
    )
    await expect(callFn(fakeServerFn('rt-void', 'POST'))).resolves.toBeNull()
  })

  it('resolves null for a Start-encoded { ok: true }', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => startResponse({ ok: true })),
    )
    await expect(callFn(startServerFn('rt-void', 'POST'))).resolves.toBeNull()
  })
})

describe('callFn timeout (row 7)', () => {
  it('stays pending until 35 s, then fails as home_unreachable and aborts fetch', async () => {
    vi.useFakeTimers()
    let fetchSignal: AbortSignal | undefined
    vi.stubGlobal(
      'fetch',
      vi.fn((_url: string, init: RequestInit) => {
        fetchSignal = init.signal ?? undefined
        return new Promise<Response>(() => {})
      }),
    )
    let settled = false
    const promise = callFn(fakeServerFn('rt-test', 'POST'), { a: 1 })
    const outcome = settle(promise).finally(() => (settled = true))

    await vi.advanceTimersByTimeAsync(CALL_TIMEOUT_MS - 1)
    expect(settled).toBe(false)
    expect(fetchSignal?.aborted).toBe(false)

    await vi.advanceTimersByTimeAsync(1)
    expect(await outcome).toEqual({ code: 'home_unreachable' })
    expect(fetchSignal?.aborted).toBe(true)
  })

  it.each([
    ['success', async () => json({ ok: true, data: 1 })],
    ['failure', async () => html(502)],
  ])('clears the timer after %s', async (_name, respond) => {
    vi.useFakeTimers()
    vi.stubGlobal('fetch', vi.fn(respond))
    await settle(callFn(fakeServerFn('rt-test', 'GET')))
    expect(vi.getTimerCount()).toBe(0)
  })
})

describe('callFn caller cancel (row 9)', () => {
  it('rejects with the abort reason, not an AppError', async () => {
    let fetchSignal: AbortSignal | undefined
    vi.stubGlobal(
      'fetch',
      vi.fn((_url: string, init: RequestInit) => {
        fetchSignal = init.signal ?? undefined
        return new Promise<Response>((_resolve, reject) => {
          init.signal?.addEventListener('abort', () =>
            reject(new DOMException('aborted', 'AbortError')),
          )
        })
      }),
    )
    const controller = new AbortController()
    const reason = new Error('caller cancelled')
    const promise = callFn(fakeServerFn('rt-test', 'POST'), undefined, {
      signal: controller.signal,
    })
    await vi.waitFor(() => expect(fetchSignal).toBeDefined())
    controller.abort(reason)

    const error = await promise.catch((caught: unknown) => caught)
    expect(error).toBe(reason)
    expect(error).not.toBeInstanceOf(AppError)
    expect(fetchSignal?.aborted).toBe(true)
    expect(consoleError).not.toHaveBeenCalled()
  })

  it('rejects with the abort reason even if fetch ignores the signal', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => new Promise<Response>(() => {})),
    )
    const controller = new AbortController()
    const promise = callFn(fakeServerFn('rt-test', 'GET'), undefined, {
      signal: controller.signal,
    })
    controller.abort('stop')
    await expect(promise).rejects.toBe('stop')
  })
})
