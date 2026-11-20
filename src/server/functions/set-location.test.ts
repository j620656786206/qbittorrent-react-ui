import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { testSession } from '#/server/auth/testing'
import { resetEnvCache } from '#/server/env'
import { GUARDED, input } from '#/server/functions/_define'
import type { Guarded } from '#/server/functions/_define'
import { getMaindata } from '#/server/functions/get-maindata'
import { setLocation } from '#/server/functions/set-location'
import { HASH_LIST_BODY_LIMIT } from '#/server/gate/body-limit'
import { stubTestEnv } from '#/server/gate/testing'
import { resetQbitClientForTests } from '#/server/qbit'
import {
  HASH_A,
  HASH_B,
  HASH_C,
  HASH_D,
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
import { setLocationInputSchema } from '#/shared/torrent-ops'
import type { BatchResult } from '#/shared/torrent-ops'

// Spec 5.2 rows S1 to S6 through the real factory, with a fake qBittorrent
// behind the global fetch (AD-15). `SAVE_ROOTS` is `/downloads` here.

const guardedOf = (fn: unknown) => (fn as Record<symbol, Guarded>)[GUARDED]
const PATH = '/api/v2/torrents/setLocation'

type Session = ReturnType<typeof testSession> | null

function run(
  value: unknown,
  {
    session = testSession(),
    bodyBytes = 0,
  }: { session?: Session; bodyBytes?: number } = {},
) {
  return guardedOf(setLocation).run({
    data: input(setLocationInputSchema)(value as never),
    context: { session, bodyBytes },
  }) as Promise<Result<BatchResult>>
}

async function maindata(): Promise<MaindataResponse> {
  const result = (await guardedOf(getMaindata).run({
    data: input(getMaindataInputSchema)({}),
    context: { session: testSession() },
  })) as Result<MaindataResponse>
  if (!result.ok) throw new Error(`expected ok, got ${result.error.code}`)
  return result.data
}

let qbit: ReturnType<typeof fakeQbit>
let opAnswer: () => Response
let torrents: Record<string, unknown>

beforeEach(() => {
  stubTestEnv()
  resetEnvCache()
  captureStdout()
  opAnswer = () => new Response('')
  torrents = fullMaindata().torrents
  qbit = fakeQbit({
    setLocation: () => opAnswer(),
    maindata: () => jsonResponse(fullMaindata({ torrents })),
  })
  vi.stubGlobal('fetch', qbit.fetch)
})

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
  resetEnvCache()
  resetQbitClientForTests()
  resetSyncerForTests()
})

const opCalls = () => qbit.calls.filter((call) => call.path === PATH)
const form = (index = 0) => [
  ...new URLSearchParams(opCalls()[index].body).entries(),
]

describe('setLocation server function (spec 5.2)', () => {
  it('is a gated POST function with the hash-list body limit', () => {
    const guarded = guardedOf(setLocation)
    expect(guarded.spec.auth).toBeUndefined()
    expect(guarded.spec.name).toBe('setLocation')
    expect(guarded.spec.bodyLimit).toBe(HASH_LIST_BODY_LIMIT)
    expect((setLocation as unknown as { method: string }).method).toBe('POST')
  })

  it('S1 one known hash: one POST, ok item, and getMaindata carries movingTo', async () => {
    const result = await run({
      hashes: [HASH_A],
      location: '/downloads/media/tv',
    })
    expect(result).toEqual({
      ok: true,
      data: { items: [{ key: HASH_A, ok: true }] },
    })
    expect(opCalls()).toHaveLength(1)
    expect(opCalls()[0].method).toBe('POST')
    expect(form()).toEqual([
      ['hashes', HASH_A],
      ['location', '/downloads/media/tv'],
    ])
    const { changed } = await maindata()
    expect(changed.find((t) => t.hash === HASH_A)?.movingTo).toBe(
      '/downloads/media/tv',
    )
    expect(changed.find((t) => t.hash === HASH_B)).not.toHaveProperty(
      'movingTo',
    )
  })

  it('S2 a trailing slash and repeated slashes are normalized before qBittorrent', async () => {
    await run({ hashes: [HASH_A], location: '/downloads//media/tv/' })
    expect(form()).toEqual([
      ['hashes', HASH_A],
      ['location', '/downloads/media/tv'],
    ])
    const { changed } = await maindata()
    expect(changed.find((t) => t.hash === HASH_A)?.movingTo).toBe(
      '/downloads/media/tv',
    )
  })

  it.each([
    ['outside the roots', '/etc'],
    ['a sibling of the root', '/downloadsx/tv'],
    ['a .. segment', '/downloads/../etc'],
    ['relative', 'downloads/tv'],
    ['too long', `/downloads/${'x'.repeat(1015)}`],
    ['a backslash', '/downloads/a\\b'],
    ['empty', ''],
  ])(
    'S3/S4 %s: invalid_input with no qBittorrent call',
    async (_name, location) => {
      expect(await run({ hashes: [HASH_A], location })).toEqual({
        ok: false,
        error: { code: 'invalid_input', message: ERROR_MESSAGES.invalid_input },
      })
      expect(qbit.spy).not.toHaveBeenCalled()
    },
  )

  it.each([
    ['no location', { hashes: [HASH_A] }],
    ['all', { hashes: ['all'], location: '/downloads/tv' }],
    ['an empty list', { hashes: [], location: '/downloads/tv' }],
    ['an extra key', { hashes: [HASH_A], location: '/downloads/tv', x: 1 }],
    ['nothing', undefined],
  ])('%s: invalid_input with no qBittorrent call', async (_name, value) => {
    expect(await run(value)).toMatchObject({
      ok: false,
      error: { code: 'invalid_input' },
    })
    expect(qbit.spy).not.toHaveBeenCalled()
  })

  it('no session: not_logged_in with no qBittorrent call', async () => {
    expect(
      await run(
        { hashes: [HASH_A], location: '/downloads/tv' },
        { session: null },
      ),
    ).toMatchObject({ ok: false, error: { code: 'not_logged_in' } })
    expect(qbit.spy).not.toHaveBeenCalled()
  })

  it('a body over the limit: invalid_input with no qBittorrent call', async () => {
    expect(
      await run(
        { hashes: [HASH_A], location: '/downloads/tv' },
        { bodyBytes: HASH_LIST_BODY_LIMIT + 1 },
      ),
    ).toMatchObject({ ok: false, error: { code: 'invalid_input' } })
    expect(qbit.spy).not.toHaveBeenCalled()
  })

  it('S5 an unknown hash: only the known one is sent, items in input order', async () => {
    const result = await run({
      hashes: [HASH_D, HASH_A],
      location: '/downloads/tv',
    })
    expect(result).toEqual({
      ok: true,
      data: {
        items: [
          {
            key: HASH_D,
            ok: false,
            code: 'invalid_input',
            message: ERROR_MESSAGES.invalid_input,
          },
          { key: HASH_A, ok: true },
        ],
      },
    })
    expect(form()).toEqual([
      ['hashes', HASH_A],
      ['location', '/downloads/tv'],
    ])
  })

  it('S5 qBittorrent moving it: qbit_rejected for that one, the rest sent once', async () => {
    torrents = {
      ...torrents,
      [HASH_B]: rawTorrent({ name: 'B', state: 'moving' }),
    }
    const result = await run({
      hashes: [HASH_A, HASH_B, HASH_C, HASH_A],
      location: '/downloads/tv',
    })
    expect(result).toEqual({
      ok: true,
      data: {
        items: [
          { key: HASH_A, ok: true },
          {
            key: HASH_B,
            ok: false,
            code: 'qbit_rejected',
            message: ERROR_MESSAGES.qbit_rejected,
          },
          { key: HASH_C, ok: true },
          { key: HASH_A, ok: true },
        ],
      },
    })
    expect(opCalls()).toHaveLength(1)
    expect(form()).toEqual([
      ['hashes', `${HASH_A}|${HASH_C}`],
      ['location', '/downloads/tv'],
    ])
  })

  it('S5 a movingTo already set: the second move is qbit_rejected with no call', async () => {
    await run({ hashes: [HASH_A], location: '/downloads/tv' })
    const second = await run({ hashes: [HASH_A], location: '/downloads/x' })
    expect(second).toEqual({
      ok: true,
      data: {
        items: [
          {
            key: HASH_A,
            ok: false,
            code: 'qbit_rejected',
            message: ERROR_MESSAGES.qbit_rejected,
          },
        ],
      },
    })
    expect(opCalls()).toHaveLength(1)
  })

  it('S5 every hash refused: no qBittorrent call, every item failed', async () => {
    const result = await run({ hashes: [HASH_D], location: '/downloads/tv' })
    expect(result).toEqual({
      ok: true,
      data: {
        items: [
          {
            key: HASH_D,
            ok: false,
            code: 'invalid_input',
            message: ERROR_MESSAGES.invalid_input,
          },
        ],
      },
    })
    expect(opCalls()).toHaveLength(0)
  })

  it.each([400, 409, 500])(
    'S6 qBittorrent answers %s: qbit_rejected, no movingTo',
    async (status) => {
      opAnswer = () => new Response('raw qbit text', { status })
      expect(
        await run({ hashes: [HASH_A], location: '/downloads/tv' }),
      ).toEqual({
        ok: false,
        error: { code: 'qbit_rejected', message: ERROR_MESSAGES.qbit_rejected },
      })
      const { changed } = await maindata()
      expect(changed.find((t) => t.hash === HASH_A)).not.toHaveProperty(
        'movingTo',
      )
    },
  )
})
