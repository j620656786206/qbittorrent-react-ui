import {
  QueryClientProvider,
  QueryObserver,
  environmentManager,
  focusManager,
} from '@tanstack/react-query'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { QueryClient } from '@tanstack/react-query'
import { AppError } from '#/lib/app-error'
import { pickConnectionAlert } from '#/lib/connection-alert'
import type { ConnectionAlert } from '#/lib/connection-alert'
import { fakeHash, fakeResponse, t } from '#/lib/testing'
import type { Maindata } from '#/lib/maindata-merge'
import type { ErrorCode } from '#/shared/errors'
import type { MaindataResponse } from '#/shared/maindata'
import {
  clearConnectionErrors,
  getConnectionErrors,
  markConnectionError,
} from '#/state/connection'
import {
  connectionAlertInput,
  loginConnectionAlertInput,
  useConnectionAlert,
} from '#/state/connection-alert'
import { clearLoginRequired } from '#/state/login-required'
import { MAINDATA_KEY, refreshMaindata } from '#/state/maindata'
import type { FetchMaindata } from '#/state/maindata'
import { createQueryClient } from '#/state/query-client'

// Spec 1.7: the alert input the hooks build (pure), plus rows R1 (retry) and
// H12 (the unreachable code switches) with the real query client and a fake
// fetcher. Clock: 2026-11-16 12:00 in Asia/Taipei.

const NOW = Date.UTC(2026, 10, 16, 4, 0, 0)

describe('connectionAlertInput', () => {
  it('maps Query values: dataUpdatedAt 0 is never, no data is null', () => {
    expect(
      connectionAlertInput({
        errorCodes: ['home_unreachable'],
        connectionStatus: undefined,
        dataUpdatedAt: 0,
        fetchStartedAt: null,
        now: NOW,
      }),
    ).toEqual({
      errorCodes: ['home_unreachable'],
      connectionStatus: null,
      lastSuccessAt: null,
      fetchStartedAt: null,
      now: NOW,
    })
  })

  it('passes a real success time, status and fetch start through', () => {
    const input = connectionAlertInput({
      errorCodes: [],
      connectionStatus: 'firewalled',
      dataUpdatedAt: NOW - 3_000,
      fetchStartedAt: NOW - 500,
      now: NOW,
    })
    expect(input).toEqual({
      errorCodes: [],
      connectionStatus: 'firewalled',
      lastSuccessAt: NOW - 3_000,
      fetchStartedAt: NOW - 500,
      now: NOW,
    })
    expect(pickConnectionAlert(input)?.kind).toBe('firewalled')
  })

  it('H7: home unreachable 3 min after the last success has the suffix', () => {
    const alert = pickConnectionAlert(
      connectionAlertInput({
        errorCodes: ['home_unreachable'],
        connectionStatus: 'connected',
        dataUpdatedAt: NOW - 3 * 60_000,
        fetchStartedAt: null,
        now: NOW,
      }),
    )
    expect(alert).toMatchObject({
      text: '連不到家裡的 NAS',
      detail: '最後更新 3 分前',
    })
  })

  it('H10: no data yet, home unreachable has no suffix', () => {
    const alert = pickConnectionAlert(
      connectionAlertInput({
        errorCodes: ['home_unreachable'],
        connectionStatus: undefined,
        dataUpdatedAt: 0,
        fetchStartedAt: null,
        now: NOW,
      }),
    )
    expect(alert?.text).toBe('連不到家裡的 NAS')
  })
})

describe('loginConnectionAlertInput (LA1, LA2)', () => {
  it.each([
    ['home_unreachable', '連不到家裡的 NAS'],
    ['qbit_unreachable', '家裡的 qBittorrent 沒有回應'],
    ['cloudflare_expired', 'Cloudflare 登入過期了'],
  ] as const)('%s reads %s, never with a suffix', (code, text) => {
    expect(pickConnectionAlert(loginConnectionAlertInput([code]))).toEqual({
      kind: code,
      text,
      detail: null,
    })
  })

  it('no codes: no bar', () => {
    expect(pickConnectionAlert(loginConnectionAlertInput([]))).toBeNull()
  })
})

let counter = 0
function answer(): MaindataResponse {
  counter += 1
  return fakeResponse({
    version: `abcdef12.${counter}`,
    full: counter === 1,
    changed: counter === 1 ? [t({ hash: fakeHash(1) })] : [],
  })
}

let cleanups: Array<() => void> = []

beforeEach(() => {
  counter = 0
  vi.useFakeTimers()
  vi.setSystemTime(NOW)
  // The stores are no-ops without `window`.
  vi.stubGlobal('window', { location: { pathname: '/', search: '', hash: '' } })
  environmentManager.setIsServer(() => false)
  clearLoginRequired()
  clearConnectionErrors()
})

afterEach(() => {
  for (const cleanup of cleanups) cleanup()
  cleanups = []
  environmentManager.setIsServer(() => typeof window === 'undefined')
  focusManager.setFocused(undefined)
  clearLoginRequired()
  clearConnectionErrors()
  vi.useRealTimers()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

function setup(fetchMaindata: FetchMaindata) {
  const client = createQueryClient({ fetchMaindata, currentPath: () => '/' })
  client.mount()
  const observer = new QueryObserver<Maindata>(client, {
    queryKey: MAINDATA_KEY,
  })
  const unsubscribe = observer.subscribe(() => {})
  cleanups.push(() => {
    unsubscribe()
    client.unmount()
    client.clear()
  })
  return { client, observer }
}

/** Runs the real `useConnectionAlert` once (server render, no effects). */
function currentAlert(client: QueryClient): ConnectionAlert | null {
  let seen: ConnectionAlert | null = null
  const record = (alert: ConnectionAlert | null) => {
    seen = alert
  }
  renderToStaticMarkup(
    <QueryClientProvider client={client}>
      <AlertProbe onAlert={record} />
    </QueryClientProvider>,
  )
  return seen
}

function AlertProbe({
  onAlert,
}: {
  onAlert: (alert: ConnectionAlert | null) => void
}) {
  onAlert(useConnectionAlert())
  return null
}

/** A client with the maindata query registered and nothing observing it. */
function bareClient(fetchMaindata: FetchMaindata) {
  const client = createQueryClient({ fetchMaindata, currentPath: () => '/' })
  cleanups.push(() => {
    void client.cancelQueries()
    client.clear()
  })
  return client
}

const failWith = (code: ErrorCode) => {
  throw new AppError(code)
}

describe('R1 retry', () => {
  it('one immediate call; success clears the codes and the bar', async () => {
    let failing = false
    const fetchMaindata = vi.fn<FetchMaindata>(async () =>
      failing ? failWith('home_unreachable') : answer(),
    )
    const { client } = setup(fetchMaindata)
    await vi.advanceTimersByTimeAsync(0)
    failing = true
    // The poll at 5 s fails (maindata does not retry: the next poll is it).
    await vi.advanceTimersByTimeAsync(5_000)
    expect(currentAlert(client)?.kind).toBe('home_unreachable')
    const callsBefore = fetchMaindata.mock.calls.length

    failing = false
    await refreshMaindata(client)

    expect(fetchMaindata.mock.calls.length).toBe(callsBefore + 1)
    expect(fetchMaindata.mock.calls.at(-1)?.[2]).toEqual({ fresh: true })
    expect(getConnectionErrors()).toEqual([])
    expect(currentAlert(client)).toBeNull()
  })

  it('a failed retry keeps the bar', async () => {
    let failing = false
    const fetchMaindata = vi.fn<FetchMaindata>(async () =>
      failing ? failWith('home_unreachable') : answer(),
    )
    const { client } = setup(fetchMaindata)
    await vi.advanceTimersByTimeAsync(0)
    failing = true
    await vi.advanceTimersByTimeAsync(5_000)
    const callsBefore = fetchMaindata.mock.calls.length

    const retry = refreshMaindata(client)
    await vi.advanceTimersByTimeAsync(30_000)
    await retry

    expect(fetchMaindata.mock.calls.length).toBeGreaterThan(callsBefore)
    expect(currentAlert(client)?.kind).toBe('home_unreachable')
  })
})

describe('H12 the unreachable code switches', () => {
  it('the bar follows the newest unreachable code; Cloudflare wins over both', async () => {
    const steps: Array<() => Promise<MaindataResponse>> = [
      async () => answer(),
      async () => failWith('home_unreachable'),
      async () => failWith('timeout'),
    ]
    let index = 0
    const fetchMaindata = vi.fn<FetchMaindata>(() => {
      const step = steps[Math.min(index, steps.length - 1)]
      index += 1
      return step()
    })
    const { client } = setup(fetchMaindata)
    await vi.advanceTimersByTimeAsync(0)

    // Poll at 5 s: home_unreachable.
    await vi.advanceTimersByTimeAsync(5_000)
    expect(getConnectionErrors()).toEqual(['home_unreachable'])
    expect(currentAlert(client)?.text).toBe('連不到家裡的 NAS')

    // Poll at 10 s: the container's timeout, recorded as qbit_unreachable,
    // replaces home_unreachable.
    await vi.advanceTimersByTimeAsync(5_000)
    expect(getConnectionErrors()).toEqual(['qbit_unreachable'])
    expect(currentAlert(client)?.text).toBe('家裡的 qBittorrent 沒有回應')

    markConnectionError('cloudflare_expired')
    expect(currentAlert(client)?.kind).toBe('cloudflare_expired')
    markConnectionError('home_unreachable')
    expect(getConnectionErrors()).toEqual([
      'cloudflare_expired',
      'home_unreachable',
    ])
    expect(currentAlert(client)?.text).toBe('Cloudflare 登入過期了')
  })
})

describe('useConnectionAlert itself (server render with a seeded client)', () => {
  /** Never settles on its own; rejects when the signal aborts. */
  const hang: FetchMaindata = (_since, signal) =>
    new Promise((_resolve, reject) => {
      signal.addEventListener('abort', () => reject(signal.reason), {
        once: true,
      })
    })

  it('H10: no data yet, home unreachable without the suffix', () => {
    const client = bareClient(async () => answer())
    markConnectionError('home_unreachable')
    expect(currentAlert(client)).toEqual({
      kind: 'home_unreachable',
      text: '連不到家裡的 NAS',
      detail: null,
    })
  })

  it('H7: home unreachable 3 min after the last success', async () => {
    const client = bareClient(async () => answer())
    await client.prefetchQuery({ queryKey: MAINDATA_KEY })
    vi.setSystemTime(NOW + 3 * 60_000)
    markConnectionError('home_unreachable')
    expect(currentAlert(client)).toMatchObject({
      text: '連不到家裡的 NAS',
      detail: '最後更新 3 分前',
    })
  })

  it.each([
    ['a fetch started 1 s ago: held back', 24_000, null],
    ['a fetch started 3 s ago: stale', 22_000, '最後更新 25 秒前'],
    ['no fetch: stale', null, '最後更新 25 秒前'],
  ] as const)('S1 %s', async (_name, fetchAt, text) => {
    let calls = 0
    const client = bareClient((since, signal, options) => {
      calls += 1
      return calls === 1
        ? Promise.resolve(answer())
        : hang(since, signal, options)
    })
    await client.prefetchQuery({ queryKey: MAINDATA_KEY })
    if (fetchAt !== null) {
      vi.setSystemTime(NOW + fetchAt)
      void client
        .fetchQuery({ queryKey: MAINDATA_KEY, staleTime: 0 })
        .catch(() => {})
      await vi.advanceTimersByTimeAsync(0)
    }
    vi.setSystemTime(NOW + 25_000)
    const alert = currentAlert(client)
    expect(alert === null ? null : alert.text).toBe(text)
  })
})
