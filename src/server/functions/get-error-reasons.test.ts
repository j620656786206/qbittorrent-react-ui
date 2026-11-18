import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { testSession } from '#/server/auth/testing'
import { resetEnvCache } from '#/server/env'
import { GUARDED, input } from '#/server/functions/_define'
import type { Guarded } from '#/server/functions/_define'
import { getErrorReasons } from '#/server/functions/get-error-reasons'
import { stubTestEnv } from '#/server/gate/testing'
import { resetQbitClientForTests } from '#/server/qbit'
import {
  HASH_A,
  HASH_B,
  captureStdout,
  fakeQbit,
  fullMaindata,
  jsonResponse,
  rawTorrent,
} from '#/server/qbit/testing'
import { resetSyncerForTests } from '#/server/sync'
import { ERROR_REASON_REFRESH_MS } from '#/server/sync/error-reasons'
import {
  errorReasonsResponseSchema,
  getErrorReasonsInputSchema,
} from '#/shared/error-reasons'
import type { ErrorReasonsResponse } from '#/shared/error-reasons'
import { ERROR_MESSAGES } from '#/shared/errors'
import type { Result } from '#/shared/errors'

// Spec 2.10 matrix rows 1, 8, 11 and 12: getErrorReasons through the real
// factory, with a fake qBittorrent behind the global fetch (fake names and
// paths only).

const guarded = (getErrorReasons as unknown as Record<symbol, Guarded>)[GUARDED]

function run(
  value: unknown = undefined,
  session: ReturnType<typeof testSession> | null = testSession(),
) {
  return guarded.run({
    data: input(getErrorReasonsInputSchema)(value as never),
    context: { session },
  }) as Promise<Result<ErrorReasonsResponse>>
}

const NAME = 'Fake.Show.S01E05'
const SECRET_FILE = '/data/media/X/incompleted/fake-secret-file.mkv'
const LOG_LINE = {
  id: 3,
  message: `File error alert. Torrent: "${NAME}". File: "${SECRET_FILE}". Reason: "${NAME} file_open (${SECRET_FILE}) error: No such file or directory"`,
  timestamp: 1_790_000_000,
  type: 4,
}
const LOG = '/api/v2/log/main'

let qbit: ReturnType<typeof fakeQbit>
let out: ReturnType<typeof captureStdout>
let torrents: Record<string, unknown>
let logAnswer: () => Response

beforeEach(() => {
  stubTestEnv()
  resetEnvCache()
  out = captureStdout()
  torrents = {
    [HASH_A]: rawTorrent({ name: NAME, state: 'error' }),
    [HASH_B]: rawTorrent({ name: 'mteam-X.Fake', state: 'uploading' }),
  }
  logAnswer = () => jsonResponse([LOG_LINE])
  qbit = fakeQbit({
    maindata: () => jsonResponse(fullMaindata({ torrents })),
    log: () => logAnswer(),
  })
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

describe('getErrorReasons server function', () => {
  it('is a gated GET function named getErrorReasons', () => {
    expect(guarded.spec.auth).toBeUndefined()
    expect(guarded.spec.name).toBe('getErrorReasons')
    expect((getErrorReasons as unknown as { method: string }).method).toBe(
      'GET',
    )
  })

  it('matrix 1: answers the shown reason of the errored torrent only', async () => {
    const result = await run()
    expect(result).toEqual({
      ok: true,
      data: { reasons: { [HASH_A]: '找不到檔案或資料夾' } },
    })
    if (result.ok) errorReasonsResponseSchema.parse(result.data)
    const sent = qbit.calls.filter((call) => call.path === LOG)
    expect(sent).toHaveLength(1)
    expect(sent[0].method).toBe('GET')
    expect(sent[0].query.get('warning')).toBe('true')
    expect(sent[0].query.get('last_known_id')).toBe('-1')
    // Never a path or the file name in the answer.
    expect(JSON.stringify(result)).not.toContain('fake-secret-file')
  })

  it('matrix 8: no errored torrent: log/main is never called', async () => {
    torrents = { [HASH_B]: rawTorrent({ name: 'mteam-X.Fake' }) }
    expect(await run()).toEqual({ ok: true, data: { reasons: {} } })
    expect(qbit.count(LOG)).toBe(0)
  })

  it('rate limit: a second call 10 s later answers from the cache', async () => {
    vi.useFakeTimers()
    await run()
    vi.advanceTimersByTime(10_000)
    expect(await run()).toEqual({
      ok: true,
      data: { reasons: { [HASH_A]: '找不到檔案或資料夾' } },
    })
    expect(qbit.count(LOG)).toBe(1)
    vi.advanceTimersByTime(ERROR_REASON_REFRESH_MS)
    await run()
    expect(qbit.count(LOG)).toBe(2)
  })

  it.each([
    ['HTTP 500', () => new Response('boom', { status: 500 })],
    ['not JSON', () => new Response('<html>')],
    ['matrix 12: a malformed answer', () => jsonResponse([{ message: 1 }])],
  ])(
    'matrix 11: log/main answered %s: the AD-9 error, logged without reason text',
    async (_name, answer) => {
      logAnswer = answer
      expect(await run()).toEqual({
        ok: false,
        error: { code: 'qbit_rejected', message: ERROR_MESSAGES.qbit_rejected },
      })
      const text = out.lines.join('')
      expect(text).toContain('/api/v2/log/main')
      expect(text).not.toContain(NAME)
      expect(text).not.toContain('fake-secret-file')
      expect(text).not.toContain('No such file')
    },
  )

  it('an extra input: invalid_input with no qBittorrent call', async () => {
    expect(await run({ any: 1 })).toEqual({
      ok: false,
      error: { code: 'invalid_input', message: ERROR_MESSAGES.invalid_input },
    })
    expect(qbit.spy).not.toHaveBeenCalled()
  })

  it('no session: not_logged_in with no qBittorrent call', async () => {
    expect(await run(undefined, null)).toMatchObject({
      ok: false,
      error: { code: 'not_logged_in' },
    })
    expect(qbit.spy).not.toHaveBeenCalled()
  })
})
