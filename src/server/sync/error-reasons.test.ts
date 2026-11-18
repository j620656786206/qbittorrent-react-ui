import { describe, expect, it, vi } from 'vitest'
import { ServerFailure } from '#/server/errors/server-failure'
import type { LogEntry, QbitClient } from '#/server/qbit/client'
import { rawMaindataSchema } from '#/server/qbit/maindata-schema'
import {
  HASH_A,
  HASH_B,
  HASH_C,
  HASH_D,
  deferred,
  fullMaindata,
  rawTorrent,
} from '#/server/qbit/testing'
import {
  ERROR_REASON_REFRESH_MS,
  ERROR_START_SLACK_S,
  MAX_REMEMBERED_NAMES,
  createErrorReasonReader,
} from '#/server/sync/error-reasons'
import { createSyncer } from '#/server/sync/syncer'
import type { ErrorCandidate } from '#/server/sync/syncer'

// Spec 2.10 matrix rows 4 to 10 and 12: the rate-limited, incremental
// reader of qBittorrent's log, against a fake log buffer that answers
// `last_known_id` like qBittorrent 5.1.4 (only ids above it). Code names
// and fake paths only.

const fileError = (name: string, reason: string) =>
  `File error alert. Torrent: "${name}". File: "/data/media/X/a.mkv". Reason: "${name} file_open (/data/media/X/a.mkv) error: ${reason}"`
/** Torrents are added at T0; log lines are written after it unless set. */
const T0 = 1_790_000_000
const line = (id: number, message: string, timestamp = T0 + id): LogEntry => ({
  id,
  message,
  timestamp,
  type: 4,
})

function setup(
  candidates: Array<ErrorCandidate>,
  initial: Array<LogEntry> = [],
) {
  let clock = 5_000_000
  const log = { buffer: [...initial], failures: [] as Array<Error> }
  const logMain = vi.fn(async (lastKnownId: number) => {
    const failure = log.failures.shift()
    if (failure) throw failure
    return log.buffer.filter((entry) => entry.id > lastKnownId)
  })
  const client: Pick<QbitClient, 'logMain'> = { logMain }
  const state = { candidates }
  const reader = createErrorReasonReader({
    client,
    candidates: () => Promise.resolve(state.candidates),
    now: () => clock,
  })
  const ids = () => logMain.mock.calls.map(([id]) => id)
  return {
    reader,
    logMain,
    log,
    state,
    ids,
    /** Past the window, then read. */
    readLater: async () => {
      clock += ERROR_REASON_REFRESH_MS
      return (await reader.read()).reasons
    },
    advance: (ms: number) => {
      clock += ms
    },
  }
}

const N = {
  hash: HASH_A,
  name: 'Fake.Show.S01E05',
  added_on: T0,
  errorStartedAfter: 0,
}
const M = {
  hash: HASH_B,
  name: 'mteam-X.Fake.Movie',
  added_on: T0,
  errorStartedAfter: 0,
}

describe('error reason reader', () => {
  it('the window is under the browser 60 s poll', () => {
    expect(ERROR_REASON_REFRESH_MS).toBe(55_000)
  })

  it('first read asks for the whole buffer and maps each errored torrent', async () => {
    const { reader, ids } = setup(
      [N, M],
      [
        line(3, fileError(N.name, 'No such file or directory')),
        line(4, 'Some other warning. Torrent: "x"'),
        line(5, fileError(M.name, 'Permission denied')),
      ],
    )
    expect(await reader.read()).toEqual({
      reasons: { [HASH_A]: '找不到檔案或資料夾', [HASH_B]: '沒有權限' },
    })
    expect(ids()).toEqual([-1])
  })

  it('matrix 4: an errored torrent without a line is left out', async () => {
    const { reader } = setup(
      [N, M],
      [line(1, fileError(N.name, 'File too large'))],
    )
    expect(await reader.read()).toEqual({ reasons: { [HASH_A]: '檔案太大' } })
  })

  it('matrix 6: the newer line wins, in any order', async () => {
    const { reader, log, readLater } = setup(
      [N],
      [
        line(9, fileError(N.name, 'No space left on device')),
        line(2, fileError(N.name, 'Permission denied')),
      ],
    )
    expect((await reader.read()).reasons[HASH_A]).toBe('磁碟空間不足')
    log.buffer.push(line(10, fileError(N.name, 'Read-only file system')))
    expect((await readLater())[HASH_A]).toBe('磁碟是唯讀的')
  })

  it('a newest line with nothing to show beats an older reason', async () => {
    const { reader } = setup(
      [N],
      [
        line(1, fileError(N.name, 'Permission denied')),
        line(2, `Torrent errored. Torrent: "${N.name}". Error: "   "`),
      ],
    )
    expect((await reader.read()).reasons).toEqual({})
  })

  it('a line older than the torrent belongs to an earlier one of that name', async () => {
    const readded = { ...N, added_on: T0 + 100 }
    const { reader, log, state, readLater } = setup(
      [readded],
      [line(1, fileError(N.name, 'Permission denied'), T0 + 99)],
    )
    expect((await reader.read()).reasons).toEqual({})
    log.buffer.push(line(2, fileError(N.name, 'File too large'), T0 + 100))
    expect(await readLater()).toEqual({ [HASH_A]: '檔案太大' })
    state.candidates = [{ ...N, added_on: T0 + 101 }]
    expect((await reader.read()).reasons).toEqual({})
  })

  it('a line from before the torrent was last seen outside error is about an earlier error', async () => {
    const after = T0 + 1000
    const again = { ...N, errorStartedAfter: after }
    const { reader, log, readLater } = setup(
      [again],
      [line(1, fileError(N.name, 'No space left on device'), T0 + 10)],
    )
    // The new error logged nothing: the old reason is not shown.
    expect((await reader.read()).reasons).toEqual({})
    // A line a little before (clock difference) still counts.
    log.buffer.push(
      line(
        2,
        fileError(N.name, 'Permission denied'),
        after - ERROR_START_SLACK_S,
      ),
    )
    expect(await readLater()).toEqual({ [HASH_A]: '沒有權限' })
  })

  it('matrix 7: a torrent that left error is not in the map', async () => {
    const { reader, state } = setup(
      [N],
      [line(1, fileError(N.name, 'File too large'))],
    )
    expect((await reader.read()).reasons).toEqual({ [HASH_A]: '檔案太大' })
    state.candidates = [M]
    expect((await reader.read()).reasons).toEqual({})
  })

  it('matrix 8: with no errored torrent qBittorrent is never asked', async () => {
    const { reader, logMain, advance } = setup([])
    expect(await reader.read()).toEqual({ reasons: {} })
    advance(ERROR_REASON_REFRESH_MS * 3)
    expect(await reader.read()).toEqual({ reasons: {} })
    expect(logMain).not.toHaveBeenCalled()
  })

  it('matrix 9: two reads 10 s apart make one log call; the second answers from the cache', async () => {
    const { reader, logMain, advance } = setup(
      [N],
      [line(1, fileError(N.name, 'File too large'))],
    )
    const first = await reader.read()
    advance(10_000)
    expect(await reader.read()).toEqual(first)
    advance(ERROR_REASON_REFRESH_MS - 10_001)
    await reader.read()
    expect(logMain).toHaveBeenCalledTimes(1)
    advance(1)
    await reader.read()
    expect(logMain).toHaveBeenCalledTimes(2)
  })

  it('reads at the same time share one call', async () => {
    const gate = deferred<Array<LogEntry>>()
    const { reader, logMain } = setup([N])
    logMain.mockImplementationOnce(() => gate.promise)
    const both = Promise.all([reader.read(), reader.read()])
    await Promise.resolve()
    gate.resolve([line(1, fileError(N.name, 'File too large'))])
    const [a, b] = await both
    expect(a).toEqual(b)
    expect(a.reasons).toEqual({ [HASH_A]: '檔案太大' })
    expect(logMain).toHaveBeenCalledTimes(1)
  })

  it('later reads ask again for the newest entry seen and apply what follows it', async () => {
    const { reader, log, ids, readLater } = setup(
      [N],
      [line(7, fileError(N.name, 'File too large')), line(8, 'other')],
    )
    await reader.read()
    log.buffer.push(line(9, fileError(N.name, 'Permission denied')))
    expect(await readLater()).toEqual({ [HASH_A]: '沒有權限' })
    expect(await readLater()).toEqual({ [HASH_A]: '沒有權限' })
    expect(ids()).toEqual([-1, 7, 8])
  })

  it('matrix 10: a restart whose new log is shorter: an empty answer forgets everything and reads from -1 at once', async () => {
    const { reader, log, ids, readLater } = setup(
      [N, M],
      [line(40, fileError(N.name, 'File too large'))],
    )
    expect((await reader.read()).reasons).toEqual({ [HASH_A]: '檔案太大' })
    log.buffer = [line(0, fileError(M.name, 'Permission denied'), T0 + 500)]
    // The old reason is gone with the old buffer; the new one shows now.
    expect(await readLater()).toEqual({ [HASH_B]: '沒有權限' })
    expect(ids()).toEqual([-1, 39, -1])
    // Back to incremental reads.
    expect(await readLater()).toEqual({ [HASH_B]: '沒有權限' })
    expect(ids()).toEqual([-1, 39, -1, -1])
  })

  it('a restart whose new log already passed the old id: the first entry differs, so it starts over', async () => {
    const { reader, log, ids, readLater } = setup(
      [N, M],
      [line(2, fileError(N.name, 'File too large'))],
    )
    await reader.read()
    log.buffer = [
      line(0, fileError(M.name, 'Permission denied'), T0 + 500),
      line(1, 'other', T0 + 501),
      line(2, 'qBittorrent started', T0 + 502),
      line(3, 'other', T0 + 503),
    ]
    // The old reason is gone at once; the new session is read from its
    // first line (id 0) in the same refresh.
    expect(await readLater()).toEqual({ [HASH_B]: '沒有權限' })
    expect(ids()).toEqual([-1, 1, -1])
  })

  it('a restart while every candidate has a reason is still noticed', async () => {
    const { reader, log, readLater } = setup(
      [N],
      [line(5, fileError(N.name, 'File too large'))],
    )
    expect((await reader.read()).reasons).toEqual({ [HASH_A]: '檔案太大' })
    log.buffer = [line(5, fileError(N.name, 'Permission denied'), T0 + 900)]
    expect(await readLater()).toEqual({ [HASH_A]: '沒有權限' })
  })

  it('an errored torrent with no line does not cause repeated full reads', async () => {
    const { reader, ids, readLater } = setup(
      [N, M],
      [line(5, fileError(N.name, 'File too large'))],
    )
    await reader.read()
    for (let i = 0; i < 4; i += 1) await readLater()
    expect(ids()).toEqual([-1, 4, 4, 4, 4])
  })

  it('matrix 11/12: a failed read rejects, is rethrown inside its window and retried after it', async () => {
    const rejected = new ServerFailure('qbit_rejected', 'log: schema')
    const { reader, log, logMain, ids, advance } = setup(
      [N],
      [line(1, fileError(N.name, 'File too large'))],
    )
    log.failures.push(rejected)
    await expect(reader.read()).rejects.toBe(rejected)
    advance(30_000)
    await expect(reader.read()).rejects.toBe(rejected)
    expect(logMain).toHaveBeenCalledTimes(1)
    advance(ERROR_REASON_REFRESH_MS)
    expect((await reader.read()).reasons).toEqual({ [HASH_A]: '檔案太大' })
    // The failed read moved nothing: still the whole buffer.
    expect(ids()).toEqual([-1, -1])
  })

  it('keeps at most MAX_REMEMBERED_NAMES names, dropping the least recently updated', async () => {
    const lines = Array.from({ length: MAX_REMEMBERED_NAMES + 1 }, (_, i) =>
      line(i, fileError(`Fake.${i}`, 'File too large')),
    )
    const first = { ...N, hash: HASH_C, name: 'Fake.0' }
    const last = { ...N, hash: HASH_D, name: `Fake.${MAX_REMEMBERED_NAMES}` }
    const { reader } = setup([first, last], lines)
    expect((await reader.read()).reasons).toEqual({ [HASH_D]: '檔案太大' })
  })
})

describe('syncer readErrorCandidates', () => {
  function syncerWith(torrents: Record<string, unknown>) {
    const syncMaindata = vi.fn(() =>
      Promise.resolve(rawMaindataSchema.parse(fullMaindata({ torrents }))),
    )
    return {
      syncer: createSyncer({ client: { syncMaindata }, now: () => 0 }),
      syncMaindata,
    }
  }

  it('errored and moving torrents, and matrix 5: never a name shared by two torrents', async () => {
    const { syncer } = syncerWith({
      [HASH_A]: rawTorrent({ name: 'N', state: 'error' }),
      [HASH_B]: rawTorrent({ name: 'N', state: 'downloading' }),
      [HASH_C]: rawTorrent({ name: 'mteam-X.Fake', state: 'error' }),
      [HASH_D]: rawTorrent({ name: 'Fake.Missing', state: 'missingFiles' }),
    })
    expect(await syncer.readErrorCandidates()).toEqual([
      {
        hash: HASH_C,
        name: 'mteam-X.Fake',
        added_on: 1_700_000_000,
        errorStartedAfter: 0,
      },
    ])
  })

  it('a moving torrent is a candidate (the browser decides whether it reads as error)', async () => {
    const { syncer } = syncerWith({
      [HASH_A]: rawTorrent({ name: 'N', state: 'moving' }),
      [HASH_B]: rawTorrent({ name: 'O', state: 'stalledUP' }),
    })
    expect(await syncer.readErrorCandidates()).toEqual([
      {
        hash: HASH_A,
        name: 'N',
        added_on: 1_700_000_000,
        errorStartedAfter: 0,
      },
    ])
  })

  it('a torrent that errors after being seen fine carries that moment', async () => {
    const answers = [
      fullMaindata({
        torrents: { [HASH_A]: rawTorrent({ name: 'N', state: 'stalledDL' }) },
      }),
      { rid: 2, torrents: { [HASH_A]: { state: 'error' } } },
    ]
    let clock = 1_800_000_000_000
    const syncMaindata = vi.fn(() =>
      Promise.resolve(rawMaindataSchema.parse(answers.shift())),
    )
    const syncer = createSyncer({ client: { syncMaindata }, now: () => clock })
    expect(await syncer.readErrorCandidates()).toEqual([])
    clock += 10_000
    expect(await syncer.readErrorCandidates()).toEqual([
      {
        hash: HASH_A,
        name: 'N',
        added_on: 1_700_000_000,
        errorStartedAfter: 1_800_000_000,
      },
    ])
  })

  it('reuses the last maindata pull', async () => {
    const { syncer, syncMaindata } = syncerWith({
      [HASH_A]: rawTorrent({ name: 'N', state: 'error' }),
    })
    await syncer.read()
    await syncer.readErrorCandidates()
    expect(syncMaindata).toHaveBeenCalledTimes(1)
  })
})
