import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { testSession } from '#/server/auth/testing'
import { resetEnvCache } from '#/server/env'
import { GUARDED, input } from '#/server/functions/_define'
import type { Guarded } from '#/server/functions/_define'
import { getMaindata } from '#/server/functions/get-maindata'
import { getSortKeys } from '#/server/functions/get-sort-keys'
import { stubTestEnv } from '#/server/gate/testing'
import { resetQbitClientForTests } from '#/server/qbit'
import {
  FAKE_PASSKEY,
  FAKE_TRACKER_DOMAIN,
  HASH_A,
  HASH_B,
  HASH_C,
  LEAK_MARKERS,
  SORT_KEY_ONLY_MARKERS,
  captureStdout,
  fakeQbit,
  fullMaindata,
  jsonResponse,
  rawTorrent,
} from '#/server/qbit/testing'
import { resetSyncerForTests } from '#/server/sync'
import { ERROR_MESSAGES } from '#/shared/errors'
import type { Result } from '#/shared/errors'
import { getMaindataInputSchema } from '#/shared/maindata'
import type { MaindataResponse } from '#/shared/maindata'
import { EXTRA_SORT_FIELD_IDS } from '#/shared/sort-fields'
import { getSortKeysInputSchema } from '#/shared/sort-keys'
import type { SortKeysResponse } from '#/shared/sort-keys'

// Spec 2.1: getSortKeys through the real factory, with a fake qBittorrent
// behind the global fetch. Rows S10, S11 and the leak check.

const guarded = (getSortKeys as unknown as Record<symbol, Guarded>)[GUARDED]
const maindataGuarded = (getMaindata as unknown as Record<symbol, Guarded>)[
  GUARDED
]

function run(
  value: unknown,
  session: ReturnType<typeof testSession> | null = testSession(),
) {
  return guarded.run({
    data: input(getSortKeysInputSchema)(value as never),
    context: { session },
  }) as Promise<Result<SortKeysResponse>>
}

function data<T>(result: Result<T>): T {
  if (!result.ok) throw new Error(`expected ok, got ${result.error.code}`)
  return result.data
}

let qbit: ReturnType<typeof fakeQbit>
let maindataRid = 1
let nextAnswer: () => unknown

beforeEach(() => {
  stubTestEnv()
  resetEnvCache()
  captureStdout()
  maindataRid = 1
  nextAnswer = () => fullMaindata()
  qbit = fakeQbit({ maindata: () => jsonResponse(nextAnswer()) })
  vi.stubGlobal('fetch', qbit.fetch)
})

afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
  resetEnvCache()
  resetQbitClientForTests()
  resetSyncerForTests()
})

describe('getSortKeys server function', () => {
  it('is a gated GET function named getSortKeys', () => {
    expect(guarded.spec.auth).toBeUndefined()
    expect(guarded.spec.name).toBe('getSortKeys')
    expect((getSortKeys as unknown as { method: string }).method).toBe('GET')
  })

  it('no since: every torrent with that field only', async () => {
    const result = data(await run({ field: 'num_seeds' }))
    expect(result.full).toBe(true)
    expect(result.version).toMatch(/^[0-9a-f]{8}\.1$/)
    expect(result.keys).toEqual({ [HASH_A]: 3, [HASH_B]: 3, [HASH_C]: 3 })
  })

  it('S10 tracker_domain is the hostname, never the URL', async () => {
    const result = data(await run({ field: 'tracker_domain' }))
    expect(result.keys[HASH_A]).toBe(FAKE_TRACKER_DOMAIN)
  })

  it('S11 a recent since: only the torrent whose extras changed', async () => {
    vi.useFakeTimers()
    const first = data(await run({ field: 'num_seeds' }))
    maindataRid = 2
    nextAnswer = () => ({
      rid: maindataRid,
      torrents: { [HASH_B]: { num_seeds: 11 } },
    })
    // Past the syncer's 1 s pull reuse.
    vi.advanceTimersByTime(1500)
    const second = data(await run({ field: 'num_seeds', since: first.version }))
    expect(second).toEqual({
      version: expect.stringMatching(/\.2$/),
      full: false,
      keys: { [HASH_B]: 11 },
    })
  })

  it('S11 a since from another container start: full', async () => {
    const result = data(await run({ field: 'num_seeds', since: '0123abcd.7' }))
    expect(result.full).toBe(true)
  })

  it.each([
    ['a slim field', { field: 'name' }],
    ['a dropped field', { field: 'download_path' }],
    ['tracker (not a sort id)', { field: 'tracker' }],
    ['no field', {}],
    ['a bad since', { field: 'num_seeds', since: 'abc' }],
    ['an extra key', { field: 'num_seeds', extra: 1 }],
  ])('%s: invalid_input with no qBittorrent call', async (_name, value) => {
    expect(await run(value)).toEqual({
      ok: false,
      error: { code: 'invalid_input', message: ERROR_MESSAGES.invalid_input },
    })
    expect(qbit.spy).not.toHaveBeenCalled()
  })

  it('no session: not_logged_in with no qBittorrent call', async () => {
    expect(await run({ field: 'num_seeds' }, null)).toMatchObject({
      ok: false,
      error: { code: 'not_logged_in' },
    })
    expect(qbit.spy).not.toHaveBeenCalled()
  })

  it('leak check: no tracker URL, passkey or magnet for any field; comment, paths and infohashes only for their own field', async () => {
    nextAnswer = () =>
      fullMaindata({
        torrents: { [HASH_A]: rawTorrent(), [HASH_B]: rawTorrent() },
      })
    for (const field of EXTRA_SORT_FIELD_IDS) {
      const text = JSON.stringify(await run({ field }))
      expect(text, field).not.toContain(LEAK_MARKERS.tracker)
      expect(text, field).not.toContain(FAKE_PASSKEY)
      expect(text, field).not.toContain(LEAK_MARKERS.magnet_uri)
      expect(text, field).not.toContain(LEAK_MARKERS.download_path)
      expect(text, field).not.toContain(LEAK_MARKERS.last_external_address_v4)
      expect(text, field).not.toContain(LEAK_MARKERS.last_external_address_v6)
      expect(text, field).not.toContain('fake-tag')
      for (const [own, marker] of Object.entries(SORT_KEY_ONLY_MARKERS)) {
        if (own === field) expect(text, field).toContain(marker)
        else expect(text, `${field} carries ${own}`).not.toContain(marker)
      }
      if (field !== 'tracker_domain') {
        expect(text, field).not.toContain(FAKE_TRACKER_DOMAIN)
      }
    }
    // getMaindata still carries none of them.
    const maindata = (await maindataGuarded.run({
      data: input(getMaindataInputSchema)(undefined),
      context: { session: testSession() },
    })) as Result<MaindataResponse>
    const text = JSON.stringify(data(maindata))
    for (const marker of [
      ...Object.values(LEAK_MARKERS),
      FAKE_PASSKEY,
      FAKE_TRACKER_DOMAIN,
    ]) {
      expect(text).not.toContain(marker)
    }
  })
})
