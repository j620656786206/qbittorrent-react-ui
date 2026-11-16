import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { testSession } from '#/server/auth/testing'
import { resetEnvCache } from '#/server/env'
import {
  GUARDED,
  SERVER_FN_TIMEOUT_MS,
  input,
} from '#/server/functions/_define'
import type { Guarded } from '#/server/functions/_define'
import { getMaindata } from '#/server/functions/get-maindata'
import { stubTestEnv } from '#/server/gate/testing'
import { QBIT_DEADLINE_MS, resetQbitClientForTests } from '#/server/qbit'
import {
  LEAK_MARKERS,
  captureStdout,
  fakeQbit,
  fetchFailed,
  fullMaindata,
  jsonResponse,
  rawServerState,
} from '#/server/qbit/testing'
import type { FakeQbitRoutes } from '#/server/qbit/testing'
import { resetSyncerForTests } from '#/server/sync'
import { ERROR_MESSAGES } from '#/shared/errors'
import type { Result } from '#/shared/errors'
import {
  TORRENT_FIELDS,
  getMaindataInputSchema,
  serverStateSchema,
} from '#/shared/maindata'
import type { MaindataResponse } from '#/shared/maindata'

// Spec 1.5 rows G1, G2 and G7 to G11 through the real factory, with a fake
// qBittorrent behind the global fetch.

const guarded = (getMaindata as unknown as Record<symbol, Guarded>)[GUARDED]

function run(
  value: unknown,
  session: ReturnType<typeof testSession> | null = testSession(),
) {
  return guarded.run({
    data: input(getMaindataInputSchema)(value as never),
    context: { session },
  }) as Promise<Result<MaindataResponse>>
}

function useQbit(routes: FakeQbitRoutes = {}) {
  const qbit = fakeQbit(routes)
  vi.stubGlobal('fetch', qbit.fetch)
  return qbit
}

function data(result: Result<MaindataResponse>): MaindataResponse {
  if (!result.ok) throw new Error(`expected ok, got ${result.error.code}`)
  return result.data
}

let out: ReturnType<typeof captureStdout>

beforeEach(() => {
  stubTestEnv()
  resetEnvCache()
  out = captureStdout()
})

afterEach(() => {
  for (const line of out.lines) expect(line).not.toContain('qbit.test.invalid')
  vi.useRealTimers()
  vi.restoreAllMocks()
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
  resetEnvCache()
  resetQbitClientForTests()
  resetSyncerForTests()
})

describe('getMaindata server function', () => {
  it('is a gated GET function named getMaindata', () => {
    expect(guarded.spec.auth).toBeUndefined()
    expect(guarded.spec.name).toBe('getMaindata')
    expect((getMaindata as unknown as { method: string }).method).toBe('GET')
  })

  it.each([
    ['{}', {}],
    ['undefined', undefined],
  ])('G1 no since (%s): full with every torrent', async (_name, value) => {
    useQbit()
    const result = data(await run(value))
    expect(result.full).toBe(true)
    expect(result.changed).toHaveLength(3)
    expect(result.removed).toEqual([])
    expect(result.version).toMatch(/^[0-9a-f]{8}\.1$/)
    expect(result.serverState.connection_status).toBe('connected')
    expect(Object.keys(result.categories).sort()).toEqual(['movies', 'tv'])
  })

  it('G2 the latest version: nothing changed', async () => {
    useQbit()
    const first = data(await run({}))
    const second = data(await run({ since: first.version }))
    expect(second).toMatchObject({
      version: first.version,
      full: false,
      changed: [],
      removed: [],
    })
  })

  it('fresh: a new qBittorrent pull even right after one', async () => {
    const qbit = useQbit()
    const first = data(await run({}))
    const calls = qbit.count('/api/v2/sync/maindata')
    const plain = data(await run({ since: first.version }))
    expect(qbit.count('/api/v2/sync/maindata')).toBe(calls)
    const fresh = data(await run({ since: plain.version, fresh: true }))
    expect(qbit.count('/api/v2/sync/maindata')).toBe(calls + 1)
    expect(fresh.full).toBe(false)
  })

  it.each([
    ['a non-version string', { since: 'abc' }],
    ['a number', { since: 5 }],
    ['an extra key', { since: '0123abcd.1', extra: 1 }],
    ['a counter with a leading zero', { since: '0123abcd.01' }],
    ['fresh not a boolean', { fresh: 'yes' }],
  ])('G7 %s: invalid_input with no qBittorrent call', async (_name, value) => {
    const qbit = useQbit()
    expect(await run(value)).toEqual({
      ok: false,
      error: {
        code: 'invalid_input',
        message: ERROR_MESSAGES.invalid_input,
      },
    })
    expect(qbit.spy).not.toHaveBeenCalled()
  })

  it('G8 no session: not_logged_in with no qBittorrent call', async () => {
    const qbit = useQbit()
    expect(await run({}, null)).toMatchObject({
      ok: false,
      error: { code: 'not_logged_in' },
    })
    expect(qbit.spy).not.toHaveBeenCalled()
  })

  it('G9 only allowlisted fields leave the container', async () => {
    useQbit()
    const result = await run({})
    const { changed, serverState } = data(result)
    expect(Object.keys(serverState).sort()).toEqual(
      Object.keys(serverStateSchema.shape).sort(),
    )
    expect(Object.keys(serverState)).toHaveLength(6)
    for (const torrent of changed) {
      expect(Object.keys(torrent).sort()).toEqual([...TORRENT_FIELDS].sort())
    }
    const text = JSON.stringify(result)
    for (const marker of Object.values(LEAK_MARKERS)) {
      expect(text).not.toContain(marker)
    }
    expect(text).not.toContain('fake-tag')
  })

  it('G10 login Fails.: qbit_auth_failed with the fixed message', async () => {
    useQbit({ login: () => new Response('Fails.') })
    const result = await run({})
    expect(result).toEqual({
      ok: false,
      error: {
        code: 'qbit_auth_failed',
        message: ERROR_MESSAGES.qbit_auth_failed,
      },
    })
    expect(JSON.stringify(result)).not.toContain('qbit.test.invalid')
  })

  it('G10 unreachable: qbit_unreachable with the fixed message', async () => {
    useQbit({ login: () => Promise.reject(fetchFailed('ENOTFOUND')) })
    const result = await run({})
    expect(result).toEqual({
      ok: false,
      error: {
        code: 'qbit_unreachable',
        message: ERROR_MESSAGES.qbit_unreachable,
      },
    })
    expect(JSON.stringify(result)).not.toContain('qbit.test.invalid')
    expect(out.events('qbit_unreachable')).toHaveLength(1)
  })

  it('G10 no answer: timeout with the fixed message, from the pull deadline before the factory timer', async () => {
    vi.useFakeTimers()
    let hang = true
    const qbit = useQbit({
      maindata: (call) => {
        if (!hang) return jsonResponse(fullMaindata())
        return new Promise<Response>((_resolve, reject) => {
          call.signal?.addEventListener('abort', () =>
            reject(new Error('aborted')),
          )
        })
      },
    })
    const pending = run({})
    let settled = false
    void pending.then(() => (settled = true))
    await vi.advanceTimersByTimeAsync(QBIT_DEADLINE_MS - 1)
    expect(settled).toBe(false)
    await vi.advanceTimersByTimeAsync(1)
    // Settled at 25 s, before the factory's 30 s timer.
    expect(QBIT_DEADLINE_MS).toBeLessThan(SERVER_FN_TIMEOUT_MS)
    expect(settled).toBe(true)
    const result = await pending
    expect(result).toEqual({
      ok: false,
      error: { code: 'timeout', message: ERROR_MESSAGES.timeout },
    })
    expect(JSON.stringify(result)).not.toContain('qbit.test.invalid')
    expect(out.events('server_fn_timeout')).toHaveLength(0)
    expect(out.events('server_fn_failed')).toEqual([
      expect.objectContaining({ fn: 'getMaindata', code: 'timeout' }),
    ])

    // The stuck pull was released: the next read starts a fresh one.
    hang = false
    const maindataCalls = qbit.count('/api/v2/sync/maindata')
    const next = await run({})
    expect(next.ok).toBe(true)
    expect(qbit.count('/api/v2/sync/maindata')).toBe(maindataCalls + 1)
  })

  it('G11 alternative limits pass through unchanged', async () => {
    useQbit({
      maindata: () =>
        jsonResponse(
          fullMaindata({
            server_state: rawServerState({
              use_alt_speed_limits: true,
              dl_rate_limit: 10240,
              up_rate_limit: 0,
            }),
          }),
        ),
    })
    const { serverState } = data(await run({}))
    expect(serverState).toMatchObject({
      use_alt_speed_limits: true,
      dl_rate_limit: 10240,
      up_rate_limit: 0,
    })
  })
})
