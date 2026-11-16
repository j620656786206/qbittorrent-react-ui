import {
  MutationObserver,
  QueryObserver,
  environmentManager,
  focusManager,
} from '@tanstack/react-query'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { MockInstance } from 'vitest'
import { AppError } from '#/lib/app-error'
import { callFn } from '#/state/call-fn'
import {
  clearConnectionErrors,
  getConnectionErrors,
  markConnectionError,
} from '#/state/connection'
import { clearLoginRequired, loginStore } from '#/state/login-required'
import { pollInterval } from '#/state/polling'
import { createQueryClient } from '#/state/query-client'
import { fakeServerFn } from '#/state/testing'
import type { QueryClient } from '@tanstack/react-query'

// Spec 1.3 matrix rows 12 to 16: the global onError, with Start's real client
// RPC behind callFn and a fake fetch. Fake timers drive polling and retries.

const MAINDATA_URL = '/_serverFn/rt-maindata'
const PAUSE_URL = '/_serverFn/rt-pause'

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  })
}

const okData = (n: number) => () => json({ ok: true, data: { n } })
const contractError = (code: string) => () =>
  json({ ok: false, error: { code, message: 'x' } })
const networkError = () => () => {
  throw new TypeError('Failed to fetch')
}

type Responder = () => Response

/** Answers the i-th call with the i-th responder, then repeats the last one. */
function route(table: Record<string, Array<Responder>>) {
  const counts = new Map<string, number>()
  return vi.fn(async (url: string) => {
    const path = url.split('?')[0]
    const responders = table[path] as Array<Responder> | undefined
    if (!responders) throw new Error(`unexpected fetch ${path}`)
    const index = counts.get(path) ?? 0
    counts.set(path, index + 1)
    return responders[Math.min(index, responders.length - 1)]()
  })
}

function callsTo(fetchMock: ReturnType<typeof route>, path: string): number {
  return fetchMock.mock.calls.filter(([url]) => url.split('?')[0] === path)
    .length
}

function pollMaindata(client: QueryClient) {
  const getMaindata = fakeServerFn<{ n: number }, { since: number }>(
    'rt-maindata',
    'GET',
  )
  // Its own key: these rows test the global onError and polling rules, not
  // the registered ['maindata'] query (AR-39 bans a queryFn on that key).
  const observer = new QueryObserver(client, {
    queryKey: ['polled'],
    queryFn: ({ signal }) => callFn(getMaindata, { since: 0 }, { signal }),
    refetchInterval: pollInterval(5000),
  })
  const unsubscribe = observer.subscribe(() => {})
  return { observer, unsubscribe }
}

function pause(client: QueryClient) {
  const pauseTorrents = fakeServerFn<null, { hashes: Array<string> }>(
    'rt-pause',
    'POST',
  )
  const observer = new MutationObserver(client, {
    mutationFn: () => callFn(pauseTorrents, { hashes: ['a'.repeat(40)] }),
  })
  return observer.mutate().catch(() => undefined)
}

let consoleError: MockInstance<typeof console.error>
let cleanups: Array<() => void> = []

function stubLocation(pathname: string, search: string, hash: string) {
  // markLoginRequired is a no-op without `window` (SSR guard).
  vi.stubGlobal('window', { location: { pathname, search, hash } })
}

beforeEach(() => {
  vi.useFakeTimers()
  stubLocation('/', '', '')
  environmentManager.setIsServer(() => false)
  clearLoginRequired()
  consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})
})

afterEach(() => {
  for (const cleanup of cleanups) cleanup()
  cleanups = []
  environmentManager.setIsServer(() => typeof window === 'undefined')
  focusManager.setFocused(undefined)
  clearLoginRequired()
  vi.useRealTimers()
  vi.unstubAllGlobals()
  vi.unstubAllEnvs()
  vi.restoreAllMocks()
})

function setup(
  table: Record<string, Array<Responder>>,
  currentPath: () => string = () => '/?view=list',
) {
  const fetchMock = route(table)
  vi.stubGlobal('fetch', fetchMock)
  const client = createQueryClient({ currentPath })
  const poll = pollMaindata(client)
  cleanups.push(() => {
    poll.unsubscribe()
    client.clear()
  })
  return { client, fetchMock, poll }
}

const badOriginLogs = () =>
  consoleError.mock.calls.filter((args) =>
    String(args[0]).includes('bad_origin'),
  ).length

describe('global onError', () => {
  it('row 12: not_logged_in stops polling without retry and records reason and URL', async () => {
    const { fetchMock, poll } = setup({
      [MAINDATA_URL]: [okData(1), contractError('not_logged_in'), okData(3)],
    })

    await vi.advanceTimersByTimeAsync(60_000)

    expect(callsTo(fetchMock, MAINDATA_URL)).toBe(2)
    expect(loginStore.state.loginRequired).toEqual({
      reason: 'not_logged_in',
      returnTo: '/?view=list',
    })
    expect(poll.observer.getCurrentResult().data).toEqual({ n: 1 })
  })

  it('row 13: a mutation getting qbit_auth_failed stops polling, no retry', async () => {
    const { client, fetchMock } = setup({
      [MAINDATA_URL]: [okData(1)],
      [PAUSE_URL]: [contractError('qbit_auth_failed')],
    })
    await vi.advanceTimersByTimeAsync(12_000)
    const pollsBefore = callsTo(fetchMock, MAINDATA_URL)
    expect(pollsBefore).toBe(3)

    void pause(client)
    await vi.advanceTimersByTimeAsync(60_000)

    expect(callsTo(fetchMock, PAUSE_URL)).toBe(1)
    expect(callsTo(fetchMock, MAINDATA_URL)).toBe(pollsBefore)
    expect(loginStore.state.loginRequired?.reason).toBe('qbit_auth_failed')
  })

  it('row 14: a second auth error updates the reason and keeps the first returnTo', async () => {
    let path = '/?view=list'
    const { client } = setup(
      {
        [MAINDATA_URL]: [okData(1), contractError('not_logged_in')],
        [PAUSE_URL]: [contractError('qbit_auth_failed')],
      },
      () => path,
    )
    await vi.advanceTimersByTimeAsync(6_000)
    expect(loginStore.state.loginRequired).toEqual({
      reason: 'not_logged_in',
      returnTo: '/?view=list',
    })

    path = '/somewhere-else'
    void pause(client)
    await vi.advanceTimersByTimeAsync(1_000)

    expect(loginStore.state.loginRequired).toEqual({
      reason: 'qbit_auth_failed',
      returnTo: '/?view=list',
    })
  })

  it('row 15: bad_origin is logged once, the store stays empty, polling continues', async () => {
    const { fetchMock } = setup({
      [MAINDATA_URL]: [okData(1), contractError('bad_origin')],
    })

    // Poll at 5 s fails; bad_origin is never retried, so onError runs then.
    await vi.advanceTimersByTimeAsync(6_000)
    expect(badOriginLogs()).toBe(1)
    expect(loginStore.state.loginRequired).toBeNull()

    const polls = callsTo(fetchMock, MAINDATA_URL)
    await vi.advanceTimersByTimeAsync(5_000)
    expect(callsTo(fetchMock, MAINDATA_URL)).toBeGreaterThan(polls)
    expect(loginStore.state.loginRequired).toBeNull()
  })

  it('row 16: home_unreachable leaves the store empty, keeps data and keeps polling', async () => {
    const { fetchMock, poll } = setup({
      [MAINDATA_URL]: [okData(1), networkError()],
    })

    await vi.advanceTimersByTimeAsync(13_000)
    const result = poll.observer.getCurrentResult()
    expect(result.status).toBe('error')
    expect(result.data).toEqual({ n: 1 })
    expect(loginStore.state.loginRequired).toBeNull()

    const polls = callsTo(fetchMock, MAINDATA_URL)
    await vi.advanceTimersByTimeAsync(5_000)
    expect(callsTo(fetchMock, MAINDATA_URL)).toBeGreaterThan(polls)
    expect(loginStore.state.loginRequired).toBeNull()
  })
})

describe('spec 1.7 row LA4: a login stop clears the connection codes', () => {
  afterEach(() => clearConnectionErrors())

  it.each(['not_logged_in', 'qbit_auth_failed'] as const)(
    'a mutation getting %s clears cloudflare_expired and home_unreachable',
    async (code) => {
      const { client } = setup({
        [MAINDATA_URL]: [okData(1)],
        [PAUSE_URL]: [contractError(code)],
      })
      await vi.advanceTimersByTimeAsync(0)
      markConnectionError('cloudflare_expired')
      markConnectionError('home_unreachable')
      expect(getConnectionErrors()).toEqual([
        'cloudflare_expired',
        'home_unreachable',
      ])

      await pause(client)
      await vi.advanceTimersByTimeAsync(0)

      expect(getConnectionErrors()).toEqual([])
      expect(loginStore.state.loginRequired?.reason).toBe(code)
    },
  )
})

describe('after a login stop', () => {
  it('polling resumes once the login state is cleared', async () => {
    const { fetchMock } = setup({
      [MAINDATA_URL]: [okData(1), contractError('not_logged_in'), okData(3)],
    })
    await vi.advanceTimersByTimeAsync(30_000)
    expect(callsTo(fetchMock, MAINDATA_URL)).toBe(2)

    clearLoginRequired()
    await vi.advanceTimersByTimeAsync(5_000)
    expect(callsTo(fetchMock, MAINDATA_URL)).toBe(3)
    await vi.advanceTimersByTimeAsync(5_000)
    expect(callsTo(fetchMock, MAINDATA_URL)).toBe(4)
  })

  it('window focus does not refetch while login is required, and does after', async () => {
    const { client, fetchMock } = setup({
      [MAINDATA_URL]: [okData(1), contractError('not_logged_in'), okData(3)],
    })
    client.mount()
    cleanups.push(() => client.unmount())
    await vi.advanceTimersByTimeAsync(6_000)
    expect(callsTo(fetchMock, MAINDATA_URL)).toBe(2)

    focusManager.setFocused(false)
    focusManager.setFocused(true)
    await vi.advanceTimersByTimeAsync(100)
    expect(callsTo(fetchMock, MAINDATA_URL)).toBe(2)

    clearLoginRequired()
    focusManager.setFocused(false)
    focusManager.setFocused(true)
    await vi.advanceTimersByTimeAsync(100)
    expect(callsTo(fetchMock, MAINDATA_URL)).toBe(3)
  })

  it('records the current full path by default', async () => {
    stubLocation('/torrents', '?view=list&q=a', '#row-3')
    const fetchMock = route({
      [MAINDATA_URL]: [contractError('not_logged_in')],
    })
    vi.stubGlobal('fetch', fetchMock)
    const client = createQueryClient()
    const poll = pollMaindata(client)
    cleanups.push(() => {
      poll.unsubscribe()
      client.clear()
    })
    await vi.advanceTimersByTimeAsync(1_000)
    expect(loginStore.state.loginRequired).toEqual({
      reason: 'not_logged_in',
      returnTo: '/torrents?view=list&q=a#row-3',
    })
  })

  it('adds no store subscription on the server, where each request builds a client', () => {
    vi.stubGlobal('window', undefined)
    const subscribe = vi.spyOn(loginStore, 'subscribe')
    createQueryClient()
    createQueryClient()
    expect(subscribe).not.toHaveBeenCalled()
  })

  it('records nothing on the server (no window)', async () => {
    vi.stubGlobal('window', undefined)
    const fetchMock = route({
      [MAINDATA_URL]: [contractError('not_logged_in')],
    })
    vi.stubGlobal('fetch', fetchMock)
    const client = createQueryClient()
    const poll = pollMaindata(client)
    cleanups.push(() => {
      poll.unsubscribe()
      client.clear()
    })
    await vi.advanceTimersByTimeAsync(1_000)
    expect(callsTo(fetchMock, MAINDATA_URL)).toBe(1)
    expect(loginStore.state.loginRequired).toBeNull()
  })
})

describe('retry policy', () => {
  const retry = createQueryClient().getDefaultOptions().queries?.retry as (
    count: number,
    error: unknown,
  ) => boolean

  it.each(['home_unreachable', 'qbit_unreachable', 'timeout'] as const)(
    'retries %s up to 3 times',
    (code) => {
      expect(retry(0, new AppError(code))).toBe(true)
      expect(retry(2, new AppError(code))).toBe(true)
      expect(retry(3, new AppError(code))).toBe(false)
    },
  )

  it.each([
    'not_logged_in',
    'qbit_auth_failed',
    'bad_origin',
    'invalid_input',
    'qbit_rejected',
    'cloudflare_expired',
  ] as const)('never retries %s', (code) => {
    expect(retry(0, new AppError(code))).toBe(false)
  })

  it('never retries a plain Error', () => {
    expect(retry(0, new Error('bug'))).toBe(false)
  })
})
