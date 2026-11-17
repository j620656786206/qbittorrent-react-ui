import { toJSONAsync } from 'seroval'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { testSession } from '#/server/auth/testing'
import { resetEnvCache } from '#/server/env'
import { GUARDED, input } from '#/server/functions/_define'
import type { Guarded } from '#/server/functions/_define'
import { getFiles } from '#/server/functions/get-files'
import { setFilePriority } from '#/server/functions/set-file-priority'
import { DEFAULT_BODY_LIMIT } from '#/server/gate/body-limit'
import { stubTestEnv } from '#/server/gate/testing'
import { resetQbitClientForTests } from '#/server/qbit'
import {
  HASH_A,
  HASH_C,
  captureStdout,
  fakeQbit,
  jsonResponse,
  rawFile,
} from '#/server/qbit/testing'
import { ERROR_MESSAGES } from '#/shared/errors'
import type { Result } from '#/shared/errors'
import {
  MAX_FILE_IDS,
  getFilesInputSchema,
  setFilePriorityInputSchema,
} from '#/shared/torrent-files'
import type { TorrentFile } from '#/shared/torrent-files'

// Spec 2.7 rows G1, G2, S1 to S3: getFiles and setFilePriority through the
// real factory, with a fake qBittorrent behind the global fetch (AD-15).

const FILES = '/api/v2/torrents/files'
const FILE_PRIO = '/api/v2/torrents/filePrio'

const guardedOf = (fn: unknown) => (fn as Record<symbol, Guarded>)[GUARDED]

function runner<T>(fn: unknown, schema: Parameters<typeof input>[0]) {
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
    }) as Promise<Result<T>>
}

const runGet = runner<Array<TorrentFile>>(getFiles, getFilesInputSchema)
const runSet = runner<null>(setFilePriority, setFilePriorityInputSchema)

const INVALID = {
  ok: false,
  error: { code: 'invalid_input', message: ERROR_MESSAGES.invalid_input },
}
const REJECTED = {
  ok: false,
  error: { code: 'qbit_rejected', message: ERROR_MESSAGES.qbit_rejected },
}

let qbit: ReturnType<typeof fakeQbit>
let filesAnswer: () => Response
let prioAnswer: () => Response

beforeEach(() => {
  stubTestEnv()
  resetEnvCache()
  captureStdout()
  filesAnswer = () =>
    jsonResponse([
      rawFile({ index: 0, name: 'Show/E02.mkv', priority: 0 }),
      rawFile({ index: 1, name: 'Show/E01.mkv', priority: 7, progress: 1 }),
    ])
  prioAnswer = () => new Response('')
  qbit = fakeQbit({ files: () => filesAnswer(), filePrio: () => prioAnswer() })
  vi.stubGlobal('fetch', qbit.fetch)
})

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
  resetEnvCache()
  resetQbitClientForTests()
})

const callsTo = (path: string) =>
  qbit.calls.filter((call) => call.path === path)

describe('getFiles', () => {
  it('is a gated GET function', () => {
    const guarded = guardedOf(getFiles)
    expect(guarded.spec.auth).toBeUndefined()
    expect(guarded.spec.name).toBe('getFiles')
    expect((getFiles as unknown as { method: string }).method).toBe('GET')
  })

  it('G1 asks torrents/files for the hash and answers five fields per file, in order', async () => {
    expect(await runGet({ hash: HASH_C })).toEqual({
      ok: true,
      data: [
        {
          index: 0,
          name: 'Show/E02.mkv',
          size: 1_073_741_824,
          progress: 0.5,
          priority: 0,
        },
        {
          index: 1,
          name: 'Show/E01.mkv',
          size: 1_073_741_824,
          progress: 1,
          priority: 7,
        },
      ],
    })
    expect(callsTo(FILES)).toHaveLength(1)
    expect(callsTo(FILES)[0].method).toBe('GET')
    expect([...callsTo(FILES)[0].query.entries()]).toEqual([['hash', HASH_C]])
  })

  it('G1 a torrent with no files answers an empty list', async () => {
    filesAnswer = () => jsonResponse([])
    expect(await runGet({ hash: HASH_A })).toEqual({ ok: true, data: [] })
  })

  it.each([
    [
      '404 (qBittorrent does not know the torrent)',
      () => new Response('', { status: 404 }),
    ],
    ['500', () => new Response('raw qbit text', { status: 500 })],
    ['not JSON', () => new Response('nope')],
    ['the wrong shape', () => jsonResponse([{ index: 'x' }])],
  ])('G1 %s: qbit_rejected', async (_name, answer) => {
    filesAnswer = answer
    expect(await runGet({ hash: HASH_A })).toEqual(REJECTED)
  })

  it.each([
    ['no hash', {}],
    ['upper-case hex', { hash: HASH_A.toUpperCase() }],
    ['all', { hash: 'all' }],
    ['two hashes with |', { hash: `${HASH_A}|${HASH_C}` }],
    ['an extra key', { hash: HASH_A, indexes: '1' }],
    ['nothing', undefined],
  ])('G2 %s: invalid_input with no qBittorrent call', async (_name, value) => {
    expect(await runGet(value)).toEqual(INVALID)
    expect(qbit.spy).not.toHaveBeenCalled()
  })

  it('S3 no session: not_logged_in with no qBittorrent call', async () => {
    expect(await runGet({ hash: HASH_A }, { session: null })).toMatchObject({
      ok: false,
      error: { code: 'not_logged_in' },
    })
    expect(qbit.spy).not.toHaveBeenCalled()
  })
})

describe('setFilePriority', () => {
  it('is a gated POST function with the default body limit', () => {
    const guarded = guardedOf(setFilePriority)
    expect(guarded.spec.auth).toBeUndefined()
    expect(guarded.spec.name).toBe('setFilePriority')
    expect(guarded.spec.bodyLimit).toBeUndefined()
    expect((setFilePriority as unknown as { method: string }).method).toBe(
      'POST',
    )
  })

  it('S1 sends hash, the distinct ids joined with | and the priority as a form', async () => {
    expect(await runSet({ hash: HASH_A, ids: [3, 1, 3], priority: 6 })).toEqual(
      { ok: true, data: null },
    )
    expect(callsTo(FILE_PRIO)).toHaveLength(1)
    expect(callsTo(FILE_PRIO)[0].method).toBe('POST')
    expect([
      ...new URLSearchParams(callsTo(FILE_PRIO)[0].body).entries(),
    ]).toEqual([
      ['hash', HASH_A],
      ['id', '3|1'],
      ['priority', '6'],
    ])
  })

  it.each([0, 1, 6, 7])('S1 priority %s is accepted', async (priority) => {
    expect((await runSet({ hash: HASH_A, ids: [0], priority })).ok).toBe(true)
  })

  it.each([
    ['no ids', { hash: HASH_A, ids: [], priority: 1 }],
    ['a negative id', { hash: HASH_A, ids: [-1], priority: 1 }],
    ['a fraction', { hash: HASH_A, ids: [1.5], priority: 1 }],
    ['a joined string', { hash: HASH_A, ids: ['1|2'], priority: 1 }],
    ['ids as a string', { hash: HASH_A, ids: '1|2', priority: 1 }],
    [
      'too many ids',
      {
        hash: HASH_A,
        ids: Array.from({ length: MAX_FILE_IDS + 1 }, (_, i) => i),
        priority: 1,
      },
    ],
    ['priority 2', { hash: HASH_A, ids: [1], priority: 2 }],
    ["priority '6'", { hash: HASH_A, ids: [1], priority: '6' }],
    ['priority -1', { hash: HASH_A, ids: [1], priority: -1 }],
    ['all as hash', { hash: 'all', ids: [1], priority: 1 }],
    ['upper-case hash', { hash: HASH_A.toUpperCase(), ids: [1], priority: 1 }],
    ['an extra key', { hash: HASH_A, ids: [1], priority: 1, id: '1' }],
    ['nothing', undefined],
  ])('S2 %s: invalid_input with no qBittorrent call', async (_name, value) => {
    expect(await runSet(value)).toEqual(INVALID)
    expect(qbit.spy).not.toHaveBeenCalled()
  })

  it.each([400, 404, 409, 500])(
    'qBittorrent answers %s: qbit_rejected',
    async (status) => {
      prioAnswer = () => new Response('raw qbit text', { status })
      expect(await runSet({ hash: HASH_A, ids: [1], priority: 0 })).toEqual(
        REJECTED,
      )
    },
  )

  it('S3 no session: not_logged_in with no qBittorrent call', async () => {
    expect(
      await runSet({ hash: HASH_A, ids: [1], priority: 0 }, { session: null }),
    ).toMatchObject({ ok: false, error: { code: 'not_logged_in' } })
    expect(qbit.spy).not.toHaveBeenCalled()
  })

  it('the most ids, seven digits each, fit the default body limit as Start sends them', async () => {
    const ids = Array.from({ length: MAX_FILE_IDS }, (_, i) => 9_000_000 + i)
    const json = JSON.stringify(
      await toJSONAsync({ data: { hash: HASH_C, ids, priority: 7 } }),
    )
    expect(new TextEncoder().encode(json).byteLength).toBeLessThanOrEqual(
      DEFAULT_BODY_LIMIT,
    )
  })
})
