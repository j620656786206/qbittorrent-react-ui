import {
  MutationObserver,
  QueryObserver,
  environmentManager,
  focusManager,
  onlineManager,
} from '@tanstack/react-query'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { MockInstance } from 'vitest'
import type { QueryClient } from '@tanstack/react-query'
import { AppError } from '#/lib/app-error'
import { fakeHash, fakeResponse, t } from '#/lib/testing'
import type { Maindata } from '#/lib/maindata-merge'
import type { ErrorCode } from '#/shared/errors'
import type { GetMaindataInput, MaindataResponse } from '#/shared/maindata'
import { clearConnectionErrors, connectionStore } from '#/state/connection'
import {
  clearLoginRequired,
  loginStore,
  markLoginRequired,
} from '#/state/login-required'
import {
  MAINDATA_KEY,
  assertMaindataRegistered,
  bindFetchMaindata,
  getMaindataFetchStartedAt,
  refreshMaindata,
} from '#/state/maindata'
import type { FetchMaindata } from '#/state/maindata'
import { createQueryClient } from '#/state/query-client'
import { fakeServerFn } from '#/state/testing'
import {
  selectBoardColumns,
  selectVisibleTorrents,
} from '#/lib/visible-torrents'
import type { BoardColumns } from '#/lib/visible-torrents'
import { DEFAULT_SORT_VIEW } from '#/shared/list-search'

// Spec 1.6 rows Q1 to Q6: the `['maindata']` query registered by
// createQueryClient, with a fake fetcher and fake timers.

const ID = 'abcdef12'
let counter = 0

/** A fresh delta answer with the next version. */
function answer(overrides: Partial<MaindataResponse> = {}): MaindataResponse {
  counter += 1
  return fakeResponse({
    version: `${ID}.${counter}`,
    full: counter === 1,
    changed: counter === 1 ? [t({ hash: fakeHash(1) })] : [],
    ...overrides,
  })
}

type Step = (
  since: string | undefined,
  signal: AbortSignal,
) => Promise<MaindataResponse>

/** Runs the i-th step on the i-th call, then repeats the last one. */
function fakeFetch(steps: Array<Step> = [async () => answer()]) {
  let index = 0
  return vi.fn<FetchMaindata>((since, signal) => {
    const step = steps[Math.min(index, steps.length - 1)]
    index += 1
    return step(since, signal)
  })
}

const ok: Step = async () => answer()
const fail =
  (code: ConstructorParameters<typeof AppError>[0]): Step =>
  async () => {
    throw new AppError(code)
  }

/** Never settles on its own; rejects when the signal aborts. */
function hanging() {
  let seenSignal: AbortSignal | undefined
  let resolve!: (value: MaindataResponse) => void
  const step: Step = (_since, signal) => {
    seenSignal = signal
    return new Promise((res, reject) => {
      resolve = res
      signal.addEventListener('abort', () => reject(signal.reason), {
        once: true,
      })
    })
  }
  return {
    step,
    signal: () => seenSignal,
    resolve: (r: MaindataResponse) => resolve(r),
  }
}

let consoleError: MockInstance<typeof console.error>
let cleanups: Array<() => void> = []

beforeEach(() => {
  counter = 0
  vi.useFakeTimers()
  // markLoginRequired and markConnectionError are no-ops without `window`.
  vi.stubGlobal('window', { location: { pathname: '/', search: '', hash: '' } })
  environmentManager.setIsServer(() => false)
  clearLoginRequired()
  clearConnectionErrors()
  consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})
})

afterEach(() => {
  for (const cleanup of cleanups) cleanup()
  cleanups = []
  environmentManager.setIsServer(() => typeof window === 'undefined')
  focusManager.setFocused(undefined)
  onlineManager.setOnline(true)
  clearLoginRequired()
  clearConnectionErrors()
  vi.useRealTimers()
  vi.unstubAllGlobals()
  vi.unstubAllEnvs()
  vi.restoreAllMocks()
})

function setup(fetchMaindata: ReturnType<typeof fakeFetch>) {
  const client = createQueryClient({ fetchMaindata, currentPath: () => '/' })
  client.mount()
  cleanups.push(() => {
    client.unmount()
    client.clear()
  })
  return { client, observe: () => observeMaindata(client) }
}

function observeMaindata(client: QueryClient) {
  const observer = new QueryObserver<Maindata>(client, {
    queryKey: MAINDATA_KEY,
  })
  const unsubscribe = observer.subscribe(() => {})
  cleanups.push(unsubscribe)
  return observer
}

function mutateFailing(client: QueryClient, code: ErrorCode) {
  const observer = new MutationObserver(client, {
    mutationFn: async () => {
      throw new AppError(code)
    },
  })
  return observer.mutate().catch(() => undefined)
}

describe('the maindata query', () => {
  it('Q1 polls every 5 s and sends the last version', async () => {
    const fetchMaindata = fakeFetch()
    const { observe } = setup(fetchMaindata)
    const observer = observe()

    await vi.advanceTimersByTimeAsync(0)
    expect(fetchMaindata).toHaveBeenCalledTimes(1)
    expect(fetchMaindata.mock.calls[0][0]).toBeUndefined()
    expect(observer.getCurrentResult().data?.version).toBe(`${ID}.1`)

    await vi.advanceTimersByTimeAsync(5_000)
    expect(fetchMaindata).toHaveBeenCalledTimes(2)
    expect(fetchMaindata.mock.calls[1][0]).toBe(`${ID}.1`)

    await vi.advanceTimersByTimeAsync(5_000)
    expect(fetchMaindata).toHaveBeenCalledTimes(3)
    expect(fetchMaindata.mock.calls[2][0]).toBe(`${ID}.2`)

    await vi.advanceTimersByTimeAsync(10_000)
    expect(fetchMaindata).toHaveBeenCalledTimes(5)
    expect(observer.getCurrentResult().data?.version).toBe(`${ID}.5`)
  })

  it('Q1 the merge keeps unchanged torrents across polls', async () => {
    const fetchMaindata = fakeFetch()
    const { observe } = setup(fetchMaindata)
    const observer = observe()
    await vi.advanceTimersByTimeAsync(0)
    const firstData = observer.getCurrentResult().data
    await vi.advanceTimersByTimeAsync(5_000)
    const secondData = observer.getCurrentResult().data
    expect(secondData).not.toBe(firstData)
    expect(secondData?.torrents).toBe(firstData?.torrents)
  })

  it('Q2 no calls while hidden, one call at once on return', async () => {
    const fetchMaindata = fakeFetch()
    const { observe } = setup(fetchMaindata)
    observe()
    await vi.advanceTimersByTimeAsync(1_000)
    expect(fetchMaindata).toHaveBeenCalledTimes(1)

    focusManager.setFocused(false)
    await vi.advanceTimersByTimeAsync(20_000)
    expect(fetchMaindata).toHaveBeenCalledTimes(1)

    focusManager.setFocused(true)
    await vi.advanceTimersByTimeAsync(100)
    expect(fetchMaindata).toHaveBeenCalledTimes(2)
    expect(fetchMaindata.mock.calls[1][0]).toBe(`${ID}.1`)
  })

  it('Q3 a failure keeps the data and polling; the next success clears the alert', async () => {
    const fetchMaindata = fakeFetch([ok, fail('home_unreachable'), ok])
    const { observe } = setup(fetchMaindata)
    const observer = observe()
    await vi.advanceTimersByTimeAsync(0)
    const before = observer.getCurrentResult()
    expect(before.data).toBeDefined()

    await vi.advanceTimersByTimeAsync(5_000)
    expect(fetchMaindata).toHaveBeenCalledTimes(2)
    const failed = observer.getCurrentResult()
    expect(failed.status).toBe('error')
    expect(failed.data).toBe(before.data)
    expect(failed.dataUpdatedAt).toBe(before.dataUpdatedAt)
    expect(connectionStore.state.errors).toEqual(['home_unreachable'])
    expect(loginStore.state.loginRequired).toBeNull()

    await vi.advanceTimersByTimeAsync(5_000)
    expect(fetchMaindata).toHaveBeenCalledTimes(3)
    expect(observer.getCurrentResult().status).toBe('success')
    expect(connectionStore.state.errors).toEqual([])
  })

  it('Q3 one failed call is enough (no retry before the next poll)', async () => {
    const fetchMaindata = fakeFetch([ok, fail('qbit_unreachable'), ok])
    const { observe } = setup(fetchMaindata)
    observe()
    await vi.advanceTimersByTimeAsync(5_000)
    expect(fetchMaindata).toHaveBeenCalledTimes(2)
    expect(connectionStore.state.errors).toEqual(['qbit_unreachable'])
    await vi.advanceTimersByTimeAsync(4_900)
    expect(fetchMaindata).toHaveBeenCalledTimes(2)
  })

  it.each(['not_logged_in', 'qbit_auth_failed'] as const)(
    'Q4 %s stops polling; a new observer does not fetch',
    async (code) => {
      const fetchMaindata = fakeFetch([ok, fail(code), ok])
      const { client, observe } = setup(fetchMaindata)
      observe()
      await vi.advanceTimersByTimeAsync(5_000)
      expect(fetchMaindata).toHaveBeenCalledTimes(2)
      expect(loginStore.state.loginRequired?.reason).toBe(code)

      await vi.advanceTimersByTimeAsync(30_000)
      expect(fetchMaindata).toHaveBeenCalledTimes(2)

      // A fresh client with no data, mounted while login is required.
      const fresh = fakeFetch()
      const other = setup(fresh)
      other.observe()
      await vi.advanceTimersByTimeAsync(30_000)
      expect(fresh).not.toHaveBeenCalled()

      // refreshMaindata is a no-op while the query is disabled.
      await refreshMaindata(client)
      expect(fetchMaindata).toHaveBeenCalledTimes(2)
      expect(connectionStore.state.errors).toEqual([])
    },
  )

  it.each(['not_logged_in', 'qbit_auth_failed'] as const)(
    'Q4 after %s, polling restarts once login clears, from the last version',
    async (code) => {
      const fetchMaindata = fakeFetch([ok, fail(code), ok])
      const { observe } = setup(fetchMaindata)
      observe()
      await vi.advanceTimersByTimeAsync(5_000)
      expect(loginStore.state.loginRequired?.reason).toBe(code)
      await vi.advanceTimersByTimeAsync(30_000)
      expect(fetchMaindata).toHaveBeenCalledTimes(2)

      clearLoginRequired()
      await vi.advanceTimersByTimeAsync(5_000)
      expect(fetchMaindata).toHaveBeenCalledTimes(3)
      expect(fetchMaindata.mock.calls[2][0]).toBe(`${ID}.1`)
    },
  )

  it('Q4 refreshMaindata does not fetch while login is required, even with no observer', async () => {
    const fetchMaindata = fakeFetch()
    const { client, observe } = setup(fetchMaindata)
    const observer = observe()
    await vi.advanceTimersByTimeAsync(0)
    expect(fetchMaindata).toHaveBeenCalledTimes(1)
    observer.destroy()

    markLoginRequired('not_logged_in', '/')
    await refreshMaindata(client)
    expect(fetchMaindata).toHaveBeenCalledTimes(1)

    clearLoginRequired()
    await refreshMaindata(client)
    expect(fetchMaindata).toHaveBeenCalledTimes(2)
  })

  it('Q3 a maindata timeout (hung qBittorrent) shows as qbit_unreachable', async () => {
    const fetchMaindata = fakeFetch([ok, fail('timeout'), ok])
    const { observe } = setup(fetchMaindata)
    observe()
    await vi.advanceTimersByTimeAsync(5_000)
    expect(fetchMaindata).toHaveBeenCalledTimes(2)
    expect(connectionStore.state.errors).toEqual(['qbit_unreachable'])
    await vi.advanceTimersByTimeAsync(5_000)
    expect(connectionStore.state.errors).toEqual([])
  })

  it('Q3 offline (navigator.onLine false) still calls, so the failure surfaces', async () => {
    const fetchMaindata = fakeFetch([ok, fail('home_unreachable')])
    const { client, observe } = setup(fetchMaindata)
    observe()
    await vi.advanceTimersByTimeAsync(0)
    onlineManager.setOnline(false)

    await vi.advanceTimersByTimeAsync(5_000)
    expect(fetchMaindata).toHaveBeenCalledTimes(2)
    expect(connectionStore.state.errors).toEqual(['home_unreachable'])

    let settled = false
    void refreshMaindata(client).then(() => {
      settled = true
    })
    await vi.advanceTimersByTimeAsync(0)
    expect(settled).toBe(true)
    expect(fetchMaindata).toHaveBeenCalledTimes(3)
  })

  it('a select result keeps its reference across a poll with no changes', async () => {
    const fetchMaindata = fakeFetch()
    const { client } = setup(fetchMaindata)
    const observer = new QueryObserver<Maindata, Error, Array<string>>(client, {
      queryKey: MAINDATA_KEY,
      select: (data) => selectVisibleTorrents(data, DEFAULT_SORT_VIEW),
    })
    cleanups.push(observer.subscribe(() => {}))
    await vi.advanceTimersByTimeAsync(0)
    const first = observer.getCurrentResult().data
    expect(first).toEqual([fakeHash(1)])

    await vi.advanceTimersByTimeAsync(5_000)
    expect(fetchMaindata).toHaveBeenCalledTimes(2)
    expect(observer.getCurrentResult().data).toBe(first)
  })

  it('board columns: an unchanged column keeps its array across polls', async () => {
    const seed = t({ hash: fakeHash(2), state: 'uploading', progress: 1 })
    const fetchMaindata = fakeFetch([
      async () => answer({ changed: [t({ hash: fakeHash(1) }), seed] }),
      async () => answer({ changed: [] }),
      async () =>
        answer({
          changed: [t({ hash: fakeHash(3), added_on: 1_800_000_000 })],
        }),
    ])
    const { client } = setup(fetchMaindata)
    // The same select useBoardColumns() passes.
    const observer = new QueryObserver<Maindata, Error, BoardColumns>(client, {
      queryKey: MAINDATA_KEY,
      select: selectBoardColumns,
    })
    cleanups.push(observer.subscribe(() => {}))
    await vi.advanceTimersByTimeAsync(0)
    const first = observer.getCurrentResult().data
    expect(first?.downloading).toEqual([fakeHash(1)])
    expect(first?.seeding).toEqual([fakeHash(2)])

    await vi.advanceTimersByTimeAsync(5_000)
    expect(observer.getCurrentResult().data).toBe(first)

    await vi.advanceTimersByTimeAsync(5_000)
    const third = observer.getCurrentResult().data
    expect(third?.downloading).toEqual([fakeHash(3), fakeHash(1)])
    expect(third?.seeding).toBe(first?.seeding)
  })

  it('Q5 refresh during a call aborts it and starts a new one at once', async () => {
    const pending = hanging()
    let second!: ReturnType<typeof hanging>
    const fetchMaindata = fakeFetch([
      ok,
      pending.step,
      (since, signal) => {
        second = hanging()
        return second.step(since, signal)
      },
    ])
    const { client, observe } = setup(fetchMaindata)
    const observer = observe()
    await vi.advanceTimersByTimeAsync(5_000)
    expect(fetchMaindata).toHaveBeenCalledTimes(2)
    const dataBefore = observer.getCurrentResult().data

    let settled = false
    const refresh = refreshMaindata(client).then(() => {
      settled = true
    })
    await vi.advanceTimersByTimeAsync(0)
    expect(pending.signal()?.aborted).toBe(true)
    expect(fetchMaindata).toHaveBeenCalledTimes(3)
    expect(fetchMaindata.mock.calls[2][0]).toBe(`${ID}.1`)
    expect(settled).toBe(false)
    expect(observer.getCurrentResult().data).toBe(dataBefore)

    second.resolve(answer())
    await refresh
    expect(settled).toBe(true)
    expect(observer.getCurrentResult().data?.version).toBe(`${ID}.2`)
  })

  it('Q5 refresh while idle makes one call at once', async () => {
    const fetchMaindata = fakeFetch()
    const { client, observe } = setup(fetchMaindata)
    observe()
    await vi.advanceTimersByTimeAsync(1_000)
    expect(fetchMaindata).toHaveBeenCalledTimes(1)

    await refreshMaindata(client)
    expect(fetchMaindata).toHaveBeenCalledTimes(2)
    expect(fetchMaindata.mock.calls[0][2]).toEqual({ fresh: false })
    expect(fetchMaindata.mock.calls[1][2]).toEqual({ fresh: true })

    // Polling after the refresh asks the normal way again.
    await vi.advanceTimersByTimeAsync(5_000)
    expect(fetchMaindata).toHaveBeenCalledTimes(3)
    expect(fetchMaindata.mock.calls[2][2]).toEqual({ fresh: false })
  })

  it('Q5 the refresh that replaces a call in flight asks for fresh', async () => {
    const pending = hanging()
    const fetchMaindata = fakeFetch([ok, pending.step, ok])
    const { client, observe } = setup(fetchMaindata)
    observe()
    await vi.advanceTimersByTimeAsync(5_000)
    expect(fetchMaindata.mock.calls[1][2]).toEqual({ fresh: false })
    await refreshMaindata(client)
    expect(fetchMaindata).toHaveBeenCalledTimes(3)
    expect(fetchMaindata.mock.calls[2][2]).toEqual({ fresh: true })
  })

  it('Q6 bad_origin on every poll is logged only once', async () => {
    const fetchMaindata = fakeFetch([ok, fail('bad_origin')])
    const { observe } = setup(fetchMaindata)
    observe()
    await vi.advanceTimersByTimeAsync(21_000)
    expect(fetchMaindata).toHaveBeenCalledTimes(5)
    const logs = consoleError.mock.calls.filter((args) =>
      String(args[0]).includes('bad_origin'),
    )
    expect(logs).toHaveLength(1)
  })

  it('Q6 bad_origin is logged once and touches neither store', async () => {
    const fetchMaindata = fakeFetch([ok, fail('bad_origin'), ok])
    const { observe } = setup(fetchMaindata)
    observe()
    await vi.advanceTimersByTimeAsync(11_000)
    expect(fetchMaindata).toHaveBeenCalledTimes(3)
    const logs = consoleError.mock.calls.filter((args) =>
      String(args[0]).includes('bad_origin'),
    )
    expect(logs).toHaveLength(1)
    expect(loginStore.state.loginRequired).toBeNull()
    expect(connectionStore.state.errors).toEqual([])
  })
})

describe('the fetch start time (for the stale line)', () => {
  it('is set while a call is in flight and cleared when it settles', async () => {
    const pending = hanging()
    const fetchMaindata = fakeFetch([ok, pending.step])
    const { observe } = setup(fetchMaindata)
    observe()
    await vi.advanceTimersByTimeAsync(0)
    expect(getMaindataFetchStartedAt()).toBeNull()

    await vi.advanceTimersByTimeAsync(5_000)
    const startedAt = Date.now()
    expect(getMaindataFetchStartedAt()).toBe(startedAt)
    // Still the start time while the call hangs.
    await vi.advanceTimersByTimeAsync(3_000)
    expect(getMaindataFetchStartedAt()).toBe(startedAt)

    pending.resolve(answer())
    await vi.advanceTimersByTimeAsync(0)
    expect(getMaindataFetchStartedAt()).toBeNull()
  })

  it('a cancelled call settling late does not clear its replacement', async () => {
    const first = hanging()
    const second = hanging()
    const fetchMaindata = fakeFetch([ok, first.step, second.step])
    const { client, observe } = setup(fetchMaindata)
    observe()
    await vi.advanceTimersByTimeAsync(5_000)
    await vi.advanceTimersByTimeAsync(1_000)
    void refreshMaindata(client)
    await vi.advanceTimersByTimeAsync(0)
    expect(first.signal()?.aborted).toBe(true)
    expect(getMaindataFetchStartedAt()).toBe(Date.now())
    second.resolve(answer())
    await vi.advanceTimersByTimeAsync(0)
    expect(getMaindataFetchStartedAt()).toBeNull()
  })
})

describe('the connection store', () => {
  it('D1 the latest unreachable code replaces the other; Cloudflare stays; an answered failure clears unreachable', async () => {
    const fetchMaindata = fakeFetch([
      ok,
      fail('home_unreachable'),
      fail('qbit_unreachable'),
      fail('home_unreachable'),
      fail('qbit_rejected'),
      ok,
    ])
    const { client, observe } = setup(fetchMaindata)
    observe()
    await vi.advanceTimersByTimeAsync(5_000)
    expect(connectionStore.state.errors).toEqual(['home_unreachable'])

    // The phone has signal again but qBittorrent hangs.
    await vi.advanceTimersByTimeAsync(5_000)
    expect(connectionStore.state.errors).toEqual(['qbit_unreachable'])

    await mutateFailing(client, 'cloudflare_expired')
    expect(connectionStore.state.errors).toEqual([
      'cloudflare_expired',
      'qbit_unreachable',
    ])

    await vi.advanceTimersByTimeAsync(5_000)
    expect(connectionStore.state.errors).toEqual([
      'cloudflare_expired',
      'home_unreachable',
    ])

    // The container answered (qbit_rejected): reachable, Cloudflare kept.
    await vi.advanceTimersByTimeAsync(5_000)
    expect(connectionStore.state.errors).toEqual(['cloudflare_expired'])

    await vi.advanceTimersByTimeAsync(5_000)
    expect(connectionStore.state.errors).toEqual([])
  })

  it('D1 a failed mutation with another code does not clear unreachable', async () => {
    const fetchMaindata = fakeFetch([ok, fail('home_unreachable')])
    const { client, observe } = setup(fetchMaindata)
    observe()
    await vi.advanceTimersByTimeAsync(5_000)
    await mutateFailing(client, 'qbit_rejected')
    expect(connectionStore.state.errors).toEqual(['home_unreachable'])
  })

  it('only a maindata success clears it', async () => {
    const fetchMaindata = fakeFetch([ok, fail('cloudflare_expired')])
    const { client, observe } = setup(fetchMaindata)
    observe()
    await vi.advanceTimersByTimeAsync(5_000)
    expect(connectionStore.state.errors).toEqual(['cloudflare_expired'])

    await client.fetchQuery({ queryKey: ['session'], queryFn: async () => 1 })
    expect(connectionStore.state.errors).toEqual(['cloudflare_expired'])
  })

  it('a failed mutation adds its code; the earlier one is kept', async () => {
    const fetchMaindata = fakeFetch([ok, fail('cloudflare_expired')])
    const { client, observe } = setup(fetchMaindata)
    observe()
    await vi.advanceTimersByTimeAsync(5_000)

    await mutateFailing(client, 'home_unreachable')
    expect(connectionStore.state.errors).toEqual([
      'cloudflare_expired',
      'home_unreachable',
    ])
  })

  it('a mutation timeout is not a connection alert', async () => {
    const { client } = setup(fakeFetch())
    await mutateFailing(client, 'timeout')
    expect(connectionStore.state.errors).toEqual([])
  })

  it('bad_origin from a mutation only logs', async () => {
    const { client } = setup(fakeFetch())
    await mutateFailing(client, 'bad_origin')
    const logs = consoleError.mock.calls.filter((args) =>
      String(args[0]).includes('bad_origin'),
    )
    expect(logs).toHaveLength(1)
    expect(connectionStore.state.errors).toEqual([])
    expect(loginStore.state.loginRequired).toBeNull()
  })
})

describe('a client without fetchMaindata', () => {
  it('fails with an error that names fetchMaindata', () => {
    expect(() => assertMaindataRegistered(createQueryClient())).toThrow(
      /fetchMaindata/,
    )
    expect(() =>
      assertMaindataRegistered(
        createQueryClient({ fetchMaindata: fakeFetch() }),
      ),
    ).not.toThrow()
  })
})

describe('bindFetchMaindata (the production binding)', () => {
  const MAINDATA_URL = '/_serverFn/rt-maindata'

  /** A server function reply as fakeServerFn's client RPC reads it. */
  function serverReply(body: MaindataResponse): Response {
    return new Response(JSON.stringify({ ok: true, data: body }), {
      headers: { 'content-type': 'application/json' },
    })
  }

  /** Start sends a GET server function's input in the query string. */
  const sentInput = (url: string) => decodeURIComponent(url.split('?')[1] ?? '')

  it('sends since only after the first answer, and refresh aborts the call in flight', async () => {
    const requests: Array<{ url: string; signal: AbortSignal | undefined }> = []
    let hang = false
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      const signal = init?.signal ?? undefined
      requests.push({ url, signal })
      expect(url.split('?')[0]).toBe(MAINDATA_URL)
      if (hang) {
        hang = false
        return new Promise<Response>((_resolve, reject) => {
          signal?.addEventListener('abort', () => reject(signal.reason), {
            once: true,
          })
        })
      }
      return serverReply(answer())
    })
    vi.stubGlobal('fetch', fetchMock)
    const getMaindata = fakeServerFn<MaindataResponse, GetMaindataInput>(
      'rt-maindata',
      'GET',
    )
    const { client, observe } = setup(bindFetchMaindata(getMaindata) as never)
    const observer = observe()

    await vi.advanceTimersByTimeAsync(0)
    expect(requests).toHaveLength(1)
    expect(sentInput(requests[0].url)).not.toContain('since')
    expect(observer.getCurrentResult().data?.version).toBe(`${ID}.1`)

    await vi.advanceTimersByTimeAsync(5_000)
    expect(requests).toHaveLength(2)
    expect(sentInput(requests[1].url)).toContain('since')
    expect(sentInput(requests[1].url)).toContain(`${ID}.1`)

    hang = true
    await vi.advanceTimersByTimeAsync(5_000)
    expect(requests).toHaveLength(3)
    const inFlight = requests[2].signal
    expect(inFlight?.aborted).toBe(false)

    expect(sentInput(requests[2].url)).not.toContain('fresh')

    await refreshMaindata(client)
    expect(inFlight?.aborted).toBe(true)
    expect(requests).toHaveLength(4)
    expect(sentInput(requests[3].url)).toContain(`${ID}.2`)
    expect(sentInput(requests[3].url)).toContain('fresh')
    expect(observer.getCurrentResult().data?.version).toBe(`${ID}.3`)
  })
})
