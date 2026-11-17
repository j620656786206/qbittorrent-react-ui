import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { testSession } from '#/server/auth/testing'
import { resetEnvCache } from '#/server/env'
import { GUARDED, input } from '#/server/functions/_define'
import type { Guarded } from '#/server/functions/_define'
import { getTorrentDetail } from '#/server/functions/get-torrent-detail'
import { stubTestEnv } from '#/server/gate/testing'
import { resetQbitClientForTests } from '#/server/qbit'
import {
  FAKE_PASSKEY,
  FAKE_TRACKER_DOMAIN,
  HASH_A,
  HASH_B,
  HASH_D,
  LEAK_MARKERS,
  captureStdout,
  fakeQbit,
  fullMaindata,
  jsonResponse,
  rawTorrent,
} from '#/server/qbit/testing'
import { resetSyncerForTests } from '#/server/sync'
import { DETAIL_PULL_REUSE_MS } from '#/server/sync/syncer'
import { ERROR_MESSAGES } from '#/shared/errors'
import type { Result } from '#/shared/errors'
import { getTorrentDetailInputSchema } from '#/shared/torrent-detail'
import type { TorrentDetailResponse } from '#/shared/torrent-detail'

// Spec 2.4 (AD-6 detail exception, 2026-11-17): getTorrentDetail through
// the real factory, with a fake qBittorrent behind the global fetch.

const guarded = (getTorrentDetail as unknown as Record<symbol, Guarded>)[
  GUARDED
]

function run(
  value: unknown,
  session: ReturnType<typeof testSession> | null = testSession(),
) {
  return guarded.run({
    data: input(getTorrentDetailInputSchema)(value as never),
    context: { session },
  }) as Promise<Result<TorrentDetailResponse>>
}

function data<T>(result: Result<T>): T {
  if (!result.ok) throw new Error(`expected ok, got ${result.error.code}`)
  return result.data
}

let qbit: ReturnType<typeof fakeQbit>
let nextAnswer: () => unknown

beforeEach(() => {
  stubTestEnv()
  resetEnvCache()
  captureStdout()
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

describe('getTorrentDetail server function', () => {
  it('is a gated GET function named getTorrentDetail', () => {
    expect(guarded.spec.auth).toBeUndefined()
    expect(guarded.spec.name).toBe('getTorrentDetail')
    expect((getTorrentDetail as unknown as { method: string }).method).toBe(
      'GET',
    )
  })

  it('answers the detail fields of that one torrent only', async () => {
    nextAnswer = () =>
      fullMaindata({
        torrents: {
          [HASH_A]: rawTorrent({
            downloaded: 11,
            uploaded: 22,
            num_seeds: 7,
            num_leechs: 2,
          }),
          [HASH_B]: rawTorrent({
            downloaded: 33,
            uploaded: 44,
            num_seeds: 9,
            num_leechs: 4,
          }),
        },
      })
    expect(data(await run({ hash: HASH_A }))).toEqual({
      // Story 2.5: the connected seeds and leechers joined.
      detail: { downloaded: 11, uploaded: 22, num_seeds: 7, num_leechs: 2 },
    })
  })

  it('a value qBittorrent left out is null', async () => {
    const torrent: Record<string, unknown> = rawTorrent()
    delete torrent.uploaded
    delete torrent.num_leechs
    nextAnswer = () => fullMaindata({ torrents: { [HASH_A]: torrent } })
    expect(data(await run({ hash: HASH_A }))).toEqual({
      detail: {
        downloaded: 1_073_741_824,
        uploaded: null,
        num_seeds: 3,
        num_leechs: null,
      },
    })
  })

  it('follows the next pull', async () => {
    vi.useFakeTimers()
    await run({ hash: HASH_A })
    nextAnswer = () => ({
      rid: 2,
      torrents: { [HASH_A]: { uploaded: 99, num_seeds: 5 } },
    })
    // Past the detail read's 6 s pull reuse.
    vi.advanceTimersByTime(DETAIL_PULL_REUSE_MS + 500)
    expect(data(await run({ hash: HASH_A }))).toEqual({
      detail: {
        downloaded: 1_073_741_824,
        uploaded: 99,
        num_seeds: 5,
        num_leechs: 1,
      },
    })
  })

  it('an unknown hash: detail null', async () => {
    expect(data(await run({ hash: HASH_D }))).toEqual({ detail: null })
  })

  it.each([
    ['no hash', {}],
    ['a short hash', { hash: 'abc' }],
    ['an upper-case hash', { hash: 'A'.repeat(40) }],
    ['an extra key', { hash: HASH_A, field: 'comment' }],
  ])('%s: invalid_input with no qBittorrent call', async (_name, value) => {
    expect(await run(value)).toEqual({
      ok: false,
      error: { code: 'invalid_input', message: ERROR_MESSAGES.invalid_input },
    })
    expect(qbit.spy).not.toHaveBeenCalled()
  })

  it('no session: not_logged_in with no qBittorrent call', async () => {
    expect(await run({ hash: HASH_A }, null)).toMatchObject({
      ok: false,
      error: { code: 'not_logged_in' },
    })
    expect(qbit.spy).not.toHaveBeenCalled()
  })

  it('leak check: nothing the extras table keeps beyond the detail fields', async () => {
    nextAnswer = () => fullMaindata({ torrents: { [HASH_A]: rawTorrent() } })
    const text = JSON.stringify(await run({ hash: HASH_A }))
    for (const marker of [
      ...Object.values(LEAK_MARKERS),
      FAKE_PASSKEY,
      FAKE_TRACKER_DOMAIN,
    ]) {
      expect(text).not.toContain(marker)
    }
  })
})
