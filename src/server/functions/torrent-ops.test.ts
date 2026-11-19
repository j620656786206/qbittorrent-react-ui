import { toJSONAsync } from 'seroval'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { testSession } from '#/server/auth/testing'
import { resetEnvCache } from '#/server/env'
import { GUARDED, input } from '#/server/functions/_define'
import type { Guarded } from '#/server/functions/_define'
import { deleteTorrents } from '#/server/functions/delete-torrents'
import { startTorrents } from '#/server/functions/start-torrents'
import { stopTorrents } from '#/server/functions/stop-torrents'
import { HASH_LIST_BODY_LIMIT } from '#/server/gate/body-limit'
import { stubTestEnv } from '#/server/gate/testing'
import { resetQbitClientForTests } from '#/server/qbit'
import {
  HASH_A,
  HASH_B,
  HASH_C,
  captureStdout,
  fakeQbit,
} from '#/server/qbit/testing'
import { ERROR_MESSAGES } from '#/shared/errors'
import type { Result } from '#/shared/errors'
import {
  deleteTorrentsInputSchema,
  torrentHashesInputSchema,
} from '#/shared/torrent-ops'
import type { BatchResult } from '#/shared/torrent-ops'

// Spec 2.6 rows S1 to S5: stopTorrents and startTorrents through the real
// factory, with a fake qBittorrent behind the global fetch (AD-15). Spec 4.3
// adds deleteTorrents at the end, same patterns.

const FUNCTIONS = [
  ['stopTorrents', stopTorrents, '/api/v2/torrents/stop'],
  ['startTorrents', startTorrents, '/api/v2/torrents/start'],
] as const

const guardedOf = (fn: unknown) => (fn as Record<symbol, Guarded>)[GUARDED]

function runner(
  fn: unknown,
  schema: Parameters<typeof input>[0] = torrentHashesInputSchema,
) {
  const guarded = guardedOf(fn)
  return (
    value: unknown,
    {
      session = testSession(),
      bodyBytes = 0,
    }: {
      session?: ReturnType<typeof testSession> | null
      bodyBytes?: number
    } = {},
  ) =>
    guarded.run({
      data: input(schema)(value),
      context: { session, bodyBytes },
    }) as Promise<Result<BatchResult>>
}

/** What Start's client sends as the POST body (serverFnFetcher). */
async function startBody(
  hashes: Array<string>,
  extra: Record<string, unknown> = {},
): Promise<number> {
  const json = JSON.stringify(await toJSONAsync({ data: { hashes, ...extra } }))
  return new TextEncoder().encode(json).byteLength
}

const hashes = (length: 40 | 64, count: number) =>
  Array.from({ length: count }, (_, index) =>
    index.toString(16).padStart(length, '0'),
  )

let qbit: ReturnType<typeof fakeQbit>
let opAnswer: () => Response

beforeEach(() => {
  stubTestEnv()
  resetEnvCache()
  captureStdout()
  opAnswer = () => new Response('')
  qbit = fakeQbit({
    stop: () => opAnswer(),
    start: () => opAnswer(),
    delete: () => opAnswer(),
  })
  vi.stubGlobal('fetch', qbit.fetch)
})

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
  resetEnvCache()
  resetQbitClientForTests()
})

describe.each(FUNCTIONS)('%s server function', (name, fn, path) => {
  const run = runner(fn)
  const opCalls = () => qbit.calls.filter((call) => call.path === path)

  it('is a gated POST function with the hash-list body limit', () => {
    const guarded = guardedOf(fn)
    expect(guarded.spec.auth).toBeUndefined()
    expect(guarded.spec.name).toBe(name)
    expect(guarded.spec.bodyLimit).toBe(HASH_LIST_BODY_LIMIT)
    expect((fn as unknown as { method: string }).method).toBe('POST')
  })

  it('S1 sends the distinct hashes joined with | and answers ok per input hash', async () => {
    const result = await run({ hashes: [HASH_A, HASH_A, HASH_C] })
    expect(result).toEqual({
      ok: true,
      data: {
        items: [
          { key: HASH_A, ok: true },
          { key: HASH_A, ok: true },
          { key: HASH_C, ok: true },
        ],
      },
    })
    expect(opCalls()).toHaveLength(1)
    expect(opCalls()[0].method).toBe('POST')
    expect([...new URLSearchParams(opCalls()[0].body).entries()]).toEqual([
      ['hashes', `${HASH_A}|${HASH_C}`],
    ])
  })

  it.each([
    ['an empty list', { hashes: [] }],
    ['5001 hashes', { hashes: hashes(40, 5001) }],
    ['all', { hashes: ['all'] }],
    ['a | inside', { hashes: [`${HASH_A}|${HASH_B}`] }],
    ['upper-case hex', { hashes: [HASH_A.toUpperCase()] }],
    ['a short hash', { hashes: ['abc'] }],
    ['an extra key', { hashes: [HASH_A], deleteFiles: true }],
    ['a string instead of a list', { hashes: HASH_A }],
    ['nothing', undefined],
  ])('S2 %s: invalid_input with no qBittorrent call', async (_name, value) => {
    expect(await run(value)).toEqual({
      ok: false,
      error: { code: 'invalid_input', message: ERROR_MESSAGES.invalid_input },
    })
    expect(qbit.spy).not.toHaveBeenCalled()
  })

  it('S2 accepts exactly 5000 hashes', async () => {
    const result = await run({ hashes: hashes(40, 5000) })
    expect(result.ok).toBe(true)
    expect(opCalls()).toHaveLength(1)
  })

  it('S3 no session: not_logged_in with no qBittorrent call', async () => {
    expect(await run({ hashes: [HASH_A] }, { session: null })).toMatchObject({
      ok: false,
      error: { code: 'not_logged_in' },
    })
    expect(qbit.spy).not.toHaveBeenCalled()
  })

  it.each([400, 404, 409, 500])(
    'S4 qBittorrent answers %s: qbit_rejected',
    async (status) => {
      opAnswer = () => new Response('raw qbit text', { status })
      expect(await run({ hashes: [HASH_A] })).toEqual({
        ok: false,
        error: { code: 'qbit_rejected', message: ERROR_MESSAGES.qbit_rejected },
      })
    },
  )

  it('S5 5000 40-char hashes as Start serializes them fit the limit and are accepted', async () => {
    const list = hashes(40, 5000)
    const bytes = await startBody(list)
    expect(bytes).toBeLessThanOrEqual(HASH_LIST_BODY_LIMIT)
    expect((await run({ hashes: list }, { bodyBytes: bytes })).ok).toBe(true)
  })

  it('S5 a body over the limit: invalid_input with no qBittorrent call', async () => {
    expect(
      await run({ hashes: [HASH_A] }, { bodyBytes: HASH_LIST_BODY_LIMIT + 1 }),
    ).toMatchObject({ ok: false, error: { code: 'invalid_input' } })
    expect(qbit.spy).not.toHaveBeenCalled()
  })
})

describe('S5 the 400 KB limit against the largest hash list (AD-12)', () => {
  // Start's client wraps every string as {"t":1,"s":"..."}: 5000 v2
  // (64-char) hashes come to 395 140 bytes. The limit was raised from
  // 384 KB to 400 KB on 2026-11-18 so they fit (spec 2.6 finding). Pinned
  // so a change in Start's encoding or the limit is noticed.
  it('5000 64-char hashes fit, with room for a 1024-character path', async () => {
    const size = await startBody(hashes(64, 5000))
    expect(size).toBeLessThanOrEqual(HASH_LIST_BODY_LIMIT)
    expect(HASH_LIST_BODY_LIMIT - size).toBeGreaterThan(4 * 1024)
  })
})

describe('deleteTorrents server function (spec 4.3)', () => {
  const run = runner(deleteTorrents, deleteTorrentsInputSchema)
  const path = '/api/v2/torrents/delete'
  const opCalls = () => qbit.calls.filter((call) => call.path === path)
  const form = (index = 0) => [
    ...new URLSearchParams(opCalls()[index].body).entries(),
  ]

  it('is a gated POST function with the hash-list body limit', () => {
    const guarded = guardedOf(deleteTorrents)
    expect(guarded.spec.auth).toBeUndefined()
    expect(guarded.spec.name).toBe('deleteTorrents')
    expect(guarded.spec.bodyLimit).toBe(HASH_LIST_BODY_LIMIT)
    expect((deleteTorrents as unknown as { method: string }).method).toBe(
      'POST',
    )
  })

  it('server accepts: one POST with hashes=a|b&deleteFiles=true, every item ok', async () => {
    const result = await run({
      hashes: [HASH_A, HASH_B, HASH_A],
      deleteFiles: true,
    })
    expect(result).toEqual({
      ok: true,
      data: {
        items: [
          { key: HASH_A, ok: true },
          { key: HASH_B, ok: true },
          { key: HASH_A, ok: true },
        ],
      },
    })
    expect(opCalls()).toHaveLength(1)
    expect(opCalls()[0].method).toBe('POST')
    expect(form()).toEqual([
      ['hashes', `${HASH_A}|${HASH_B}`],
      ['deleteFiles', 'true'],
    ])
    expect(qbit.count('/api/v2/torrents/stop')).toBe(0)
  })

  it('no files: the form says deleteFiles=false', async () => {
    expect((await run({ hashes: [HASH_C], deleteFiles: false })).ok).toBe(true)
    expect(form()).toEqual([
      ['hashes', HASH_C],
      ['deleteFiles', 'false'],
    ])
  })

  it.each([
    ['a missing flag', { hashes: [HASH_A] }],
    ['a string flag', { hashes: [HASH_A], deleteFiles: 'true' }],
    ['a number flag', { hashes: [HASH_A], deleteFiles: 1 }],
    ['all', { hashes: ['all'], deleteFiles: true }],
    ['a | inside', { hashes: [`${HASH_A}|${HASH_B}`], deleteFiles: true }],
    ['an empty list', { hashes: [], deleteFiles: true }],
    ['5001 hashes', { hashes: hashes(40, 5001), deleteFiles: true }],
    ['an extra key', { hashes: [HASH_A], deleteFiles: true, savepath: '/x' }],
    ['nothing', undefined],
  ])('%s: invalid_input with no qBittorrent call', async (_name, value) => {
    expect(await run(value)).toEqual({
      ok: false,
      error: { code: 'invalid_input', message: ERROR_MESSAGES.invalid_input },
    })
    expect(qbit.spy).not.toHaveBeenCalled()
  })

  it('no session: not_logged_in with no qBittorrent call', async () => {
    expect(
      await run({ hashes: [HASH_A], deleteFiles: true }, { session: null }),
    ).toMatchObject({ ok: false, error: { code: 'not_logged_in' } })
    expect(qbit.spy).not.toHaveBeenCalled()
  })

  it.each([400, 409, 500])(
    'qBittorrent answers %s: qbit_rejected',
    async (status) => {
      opAnswer = () => new Response('raw qbit text', { status })
      expect(await run({ hashes: [HASH_A], deleteFiles: true })).toEqual({
        ok: false,
        error: { code: 'qbit_rejected', message: ERROR_MESSAGES.qbit_rejected },
      })
    },
  )

  it('3,626 64-char hashes as Start serializes them fit the limit and are accepted', async () => {
    const list = hashes(64, 3626)
    const bytes = await startBody(list, { deleteFiles: true })
    expect(bytes).toBeLessThanOrEqual(HASH_LIST_BODY_LIMIT)
    const result = await run(
      { hashes: list, deleteFiles: true },
      { bodyBytes: bytes },
    )
    expect(result.ok).toBe(true)
    expect(opCalls()).toHaveLength(1)
  })

  it('a body over the limit: invalid_input with no qBittorrent call', async () => {
    expect(
      await run(
        { hashes: [HASH_A], deleteFiles: true },
        { bodyBytes: HASH_LIST_BODY_LIMIT + 1 },
      ),
    ).toMatchObject({ ok: false, error: { code: 'invalid_input' } })
    expect(qbit.spy).not.toHaveBeenCalled()
  })
})
