import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ServerFailure } from '#/server/errors/server-failure'
import { BadMaindata } from '#/server/qbit/bad-maindata'
import { rawMaindataSchema } from '#/server/qbit/maindata-schema'
import type { RawMaindata } from '#/server/qbit/maindata-schema'
import type { QbitClient } from '#/server/qbit/client'
import {
  HASH_A,
  HASH_B,
  HASH_C,
  HASH_D,
  captureStdout,
  deferred,
  fullMaindata,
} from '#/server/qbit/testing'
import { MIN_PULL_INTERVAL_MS, createSyncer } from '#/server/sync/syncer'
import { TOMBSTONE_MS } from '#/server/sync/torrent-table'

// Spec 1.5 rows S1, S7 to S10 and G1 to G6 through `read()`, plus the
// review rows F1 to F5 for `fresh` reads (refreshMaindata).

const ID = 'abcdef12'
const raw = (value: unknown): RawMaindata => rawMaindataSchema.parse(value)

type Answer = RawMaindata | Error | Promise<RawMaindata>

function setup(answers: Array<Answer> = [], instanceId = ID) {
  let clock = 1_000_000
  const queue = [...answers]
  const syncMaindata = vi.fn((_rid: number): Promise<RawMaindata> => {
    const next = queue.shift() ?? raw({ rid: 99 })
    if (next instanceof Error) return Promise.reject(next)
    return Promise.resolve(next)
  })
  const client: QbitClient = { syncMaindata }
  const syncer = createSyncer({ client, now: () => clock, instanceId })
  return {
    syncer,
    syncMaindata,
    queue,
    advance: (ms: number) => {
      clock += ms
    },
  }
}

const failure = (code: string) =>
  expect.objectContaining({ name: 'ServerFailure', code })

let out: ReturnType<typeof captureStdout>

beforeEach(() => {
  out = captureStdout()
})

afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
})

describe('syncer', () => {
  it('S1 first read pulls with rid 0, then uses the rid from the answer', async () => {
    const { syncer, syncMaindata, advance } = setup([
      raw(fullMaindata({ rid: 5 })),
      raw({ rid: 6 }),
    ])
    const first = await syncer.read()
    expect(syncMaindata).toHaveBeenLastCalledWith(0)
    expect(first.version).toBe(`${ID}.1`)
    expect(first.full).toBe(true)
    expect(first.changed).toHaveLength(3)
    advance(MIN_PULL_INTERVAL_MS)
    await syncer.read(first.version)
    expect(syncMaindata).toHaveBeenLastCalledWith(5)
  })

  it('G1 no since: full with server state and categories', async () => {
    const { syncer } = setup([raw(fullMaindata())])
    const result = await syncer.read()
    expect(result).toMatchObject({ full: true, removed: [] })
    expect(result.changed).toHaveLength(3)
    expect(result.serverState.connection_status).toBe('connected')
    expect(Object.keys(result.categories).sort()).toEqual(['movies', 'tv'])
  })

  it('G2 the current version: nothing changed', async () => {
    const { syncer, advance } = setup([raw(fullMaindata()), raw({ rid: 2 })])
    const first = await syncer.read()
    advance(MIN_PULL_INTERVAL_MS)
    const second = await syncer.read(first.version)
    expect(second).toMatchObject({
      version: first.version,
      full: false,
      changed: [],
      removed: [],
    })
    expect(second.serverState).toEqual(first.serverState)
  })

  it('G3 an older version of this instance: only the change and the removal', async () => {
    const { syncer, advance } = setup([
      raw(fullMaindata()),
      raw({
        rid: 2,
        torrents: { [HASH_A]: { progress: 0.9 } },
        torrents_removed: [HASH_B],
      }),
    ])
    const first = await syncer.read()
    advance(MIN_PULL_INTERVAL_MS)
    const second = await syncer.read(first.version)
    expect(second).toEqual(
      expect.objectContaining({
        version: `${ID}.2`,
        full: false,
        changed: [expect.objectContaining({ hash: HASH_A, progress: 0.9 })],
        removed: [HASH_B],
      }),
    )
  })

  it('G4 a since below the floor (tombstone pruned after 10 minutes): full', async () => {
    const { syncer, advance } = setup([
      raw(fullMaindata()),
      raw({ rid: 2, torrents_removed: [HASH_B] }),
      raw({ rid: 3 }),
    ])
    const first = await syncer.read()
    advance(MIN_PULL_INTERVAL_MS)
    await syncer.read(first.version)
    advance(TOMBSTONE_MS)
    const late = await syncer.read(first.version)
    expect(late.full).toBe(true)
    expect(late.changed).toHaveLength(2)
  })

  it('G5 a version from another instance (a restart): full', async () => {
    const { syncer } = setup([raw(fullMaindata())])
    expect((await syncer.read('00000000.1')).full).toBe(true)

    const other = setup([raw(fullMaindata())], '12345678')
    const fromOther = await other.syncer.read()
    const { syncer: again } = setup([raw(fullMaindata())])
    expect((await again.read(fromOther.version)).full).toBe(true)
  })

  it('G6 same instance, counter above current: full', async () => {
    const { syncer } = setup([raw(fullMaindata())])
    expect((await syncer.read(`${ID}.2`)).full).toBe(true)
  })

  it('a malformed since read directly is treated as no since', async () => {
    const { syncer } = setup([raw(fullMaindata())])
    expect((await syncer.read('abc')).full).toBe(true)
  })

  it('the default instance id is 8 lowercase hex characters', () => {
    const syncer = createSyncer({ client: { syncMaindata: vi.fn() } })
    expect(syncer.instanceId).toMatch(/^[0-9a-f]{8}$/)
  })

  it('S8 a first read whose pull fails rethrows it; within 1 s again, then pulls anew', async () => {
    const { syncer, syncMaindata, queue, advance } = setup([
      new ServerFailure('qbit_unreachable'),
    ])
    await expect(syncer.read()).rejects.toEqual(failure('qbit_unreachable'))
    // Inside the 1 s window the same failure, without asking qBittorrent.
    await expect(syncer.read()).rejects.toEqual(failure('qbit_unreachable'))
    expect(syncMaindata).toHaveBeenCalledTimes(1)
    advance(MIN_PULL_INTERVAL_MS)
    queue.push(raw(fullMaindata()))
    await expect(syncer.read()).resolves.toMatchObject({ full: true })
    expect(syncMaindata).toHaveBeenCalledTimes(2)
    expect(syncMaindata).toHaveBeenLastCalledWith(0)
  })

  it.each(['qbit_unreachable', 'timeout', 'qbit_rejected'] as const)(
    'S8 a failed pull (%s) keeps table, version and rid, and reaches every waiting reader',
    async (code) => {
      const gate = deferred<undefined>()
      const { syncer, syncMaindata, queue, advance } = setup([
        raw(fullMaindata({ rid: 5 })),
      ])
      const first = await syncer.read()
      advance(MIN_PULL_INTERVAL_MS)
      queue.push(
        gate.promise.then(() => {
          throw new ServerFailure(code)
        }),
      )
      const waiting = [syncer.read(first.version), syncer.read()]
      gate.resolve(undefined)
      for (const result of await Promise.allSettled(waiting)) {
        expect(result).toEqual({ status: 'rejected', reason: failure(code) })
      }
      expect(syncMaindata).toHaveBeenCalledTimes(2)

      advance(MIN_PULL_INTERVAL_MS)
      queue.push(raw({ rid: 6 }))
      const after = await syncer.read(first.version)
      expect(syncMaindata).toHaveBeenCalledTimes(3)
      expect(syncMaindata).toHaveBeenLastCalledWith(5)
      expect(after).toMatchObject({
        version: first.version,
        full: false,
        changed: [],
      })
    },
  )

  it('S7 through the syncer: an incomplete new torrent is qbit_rejected, logged by reason, rid reset to 0', async () => {
    const { syncer, syncMaindata, queue, advance } = setup([
      raw(fullMaindata({ rid: 5 })),
    ])
    const first = await syncer.read()
    advance(MIN_PULL_INTERVAL_MS)
    queue.push(raw({ rid: 6, torrents: { [HASH_D]: { name: 'D' } } }))
    await expect(syncer.read(first.version)).rejects.toEqual(
      failure('qbit_rejected'),
    )
    const lines = out.events('qbit_bad_maindata')
    expect(lines).toEqual([
      expect.objectContaining({
        level: 'warn',
        reason: 'incomplete_torrent',
        fields: expect.arrayContaining(['torrents.*.state']),
      }),
    ])
    // Field names only: no hash, no value.
    expect(JSON.stringify(lines)).not.toContain(HASH_D)
    expect(out.events('qbit_bad_response')).toEqual([])

    advance(MIN_PULL_INTERVAL_MS)
    queue.push(raw(fullMaindata({ rid: 1 })))
    const after = await syncer.read(first.version)
    expect(syncMaindata).toHaveBeenCalledTimes(3)
    // The next pull asks for a full update instead of the same delta.
    expect(syncMaindata).toHaveBeenLastCalledWith(0)
    expect(after).toMatchObject({
      version: first.version,
      full: false,
      changed: [],
    })
  })

  it('a schema failure from the client is logged as qbit_bad_maindata and resets rid', async () => {
    const { syncer, syncMaindata, queue, advance } = setup([
      raw(fullMaindata({ rid: 5 })),
    ])
    await syncer.read()
    advance(MIN_PULL_INTERVAL_MS)
    queue.push(new BadMaindata('schema', ['categories.*.savePath']))
    await expect(syncer.read()).rejects.toEqual(failure('qbit_rejected'))
    expect(out.events('qbit_bad_maindata')).toEqual([
      expect.objectContaining({
        reason: 'schema',
        fields: ['categories.*.savePath'],
      }),
    ])
    advance(MIN_PULL_INTERVAL_MS)
    queue.push(raw({ rid: 8 }))
    await syncer.read()
    expect(syncMaindata).toHaveBeenLastCalledWith(0)
  })

  it('a qBittorrent session reset mid-stream: rid follows, one version step, only real differences', async () => {
    const { syncer, syncMaindata, queue, advance } = setup([
      raw(fullMaindata({ rid: 5 })),
      raw({ rid: 6, torrents: { [HASH_A]: { progress: 0.6 } } }),
    ])
    await syncer.read()
    advance(MIN_PULL_INTERVAL_MS)
    const before = await syncer.read()
    expect(before.version).toBe(`${ID}.2`)

    // After a re-login qBittorrent starts a new sync session: full, small rid.
    const reset = fullMaindata({ rid: 1 })
    reset.torrents[HASH_A] = { ...reset.torrents[HASH_A], progress: 0.6 }
    reset.torrents[HASH_C] = { ...reset.torrents[HASH_C], progress: 0.95 }
    queue.push(raw(reset), raw({ rid: 2 }))
    advance(MIN_PULL_INTERVAL_MS)
    const after = await syncer.read(before.version)
    expect(syncMaindata).toHaveBeenLastCalledWith(6)
    expect(after.full).toBe(false)
    expect(after.version).toBe(`${ID}.3`)
    expect(after.changed).toEqual([
      expect.objectContaining({ hash: HASH_C, progress: 0.95 }),
    ])
    expect(after.removed).toEqual([])

    advance(MIN_PULL_INTERVAL_MS)
    await syncer.read(after.version)
    expect(syncMaindata).toHaveBeenLastCalledWith(1)
  })

  it('S9 idle: no qBittorrent call and no timer for 10 minutes, then one pull with the stored rid', async () => {
    vi.useFakeTimers()
    const syncMaindata = vi.fn(async (rid: number) =>
      rid === 0 ? raw(fullMaindata({ rid: 5 })) : raw({ rid: rid + 1 }),
    )
    const syncer = createSyncer({ client: { syncMaindata }, instanceId: ID })
    const first = await syncer.read()
    expect(vi.getTimerCount()).toBe(0)
    await vi.advanceTimersByTimeAsync(10 * 60_000)
    expect(syncMaindata).toHaveBeenCalledTimes(1)
    await syncer.read(first.version)
    expect(syncMaindata).toHaveBeenCalledTimes(2)
    expect(syncMaindata).toHaveBeenLastCalledWith(5)
  })

  it('S10 parallel reads share one pull; a read 500 ms later reuses it; 1 s later pulls again', async () => {
    const answer = deferred<RawMaindata>()
    const { syncer, syncMaindata, queue, advance } = setup([answer.promise])
    const a = syncer.read()
    const b = syncer.read()
    answer.resolve(raw(fullMaindata()))
    const [ra, rb] = await Promise.all([a, b])
    expect(ra.version).toBe(rb.version)
    expect(syncMaindata).toHaveBeenCalledTimes(1)

    advance(500)
    await syncer.read(ra.version)
    expect(syncMaindata).toHaveBeenCalledTimes(1)

    advance(MIN_PULL_INTERVAL_MS - 500)
    queue.push(raw({ rid: 2 }))
    await syncer.read(ra.version)
    expect(syncMaindata).toHaveBeenCalledTimes(2)
  })

  it('a reader arriving while a pull is in flight joins it', async () => {
    const slow = deferred<RawMaindata>()
    const { syncer, syncMaindata, advance } = setup([slow.promise])
    const a = syncer.read()
    advance(5_000)
    const b = syncer.read()
    slow.resolve(raw(fullMaindata()))
    await Promise.all([a, b])
    expect(syncMaindata).toHaveBeenCalledTimes(1)
  })
})

describe('fresh reads', () => {
  it('F1 within 1 s of a pull: pulls again instead of reusing it', async () => {
    const { syncer, syncMaindata, queue, advance } = setup([
      raw(fullMaindata({ rid: 5 })),
    ])
    const first = await syncer.read()
    advance(500)
    queue.push(raw({ rid: 6, torrents: { [HASH_A]: { progress: 0.9 } } }))
    const fresh = await syncer.read(first.version, { fresh: true })
    expect(syncMaindata).toHaveBeenCalledTimes(2)
    expect(syncMaindata).toHaveBeenLastCalledWith(5)
    expect(fresh.changed).toEqual([
      expect.objectContaining({ hash: HASH_A, progress: 0.9 }),
    ])
  })

  it('F2 a pull in flight from before the read is waited out, then a new one runs', async () => {
    const slow = deferred<RawMaindata>()
    const { syncer, syncMaindata, queue } = setup([slow.promise])
    const plain = syncer.read()
    const fresh = syncer.read(undefined, { fresh: true })
    // Only the old pull so far: never two at once.
    expect(syncMaindata).toHaveBeenCalledTimes(1)
    queue.push(raw({ rid: 2, torrents: { [HASH_A]: { progress: 0.9 } } }))
    slow.resolve(raw(fullMaindata({ rid: 1 })))
    await plain
    const answer = await fresh
    expect(syncMaindata).toHaveBeenCalledTimes(2)
    expect(syncMaindata).toHaveBeenLastCalledWith(1)
    expect(answer.changed).toContainEqual(
      expect.objectContaining({ hash: HASH_A, progress: 0.9 }),
    )
  })

  it('F3 fresh reads waiting together share the one new pull', async () => {
    const slow = deferred<RawMaindata>()
    const { syncer, syncMaindata } = setup([slow.promise])
    void syncer.read()
    const a = syncer.read(undefined, { fresh: true })
    const b = syncer.read(undefined, { fresh: true })
    slow.resolve(raw(fullMaindata({ rid: 1 })))
    const [ra, rb] = await Promise.all([a, b])
    expect(syncMaindata).toHaveBeenCalledTimes(2)
    expect(ra.version).toBe(rb.version)
  })

  it('F4 a fresh read does not join a pull that started before it arrived', async () => {
    const first = deferred<RawMaindata>()
    const second = deferred<RawMaindata>()
    const { syncer, syncMaindata, queue } = setup([first.promise])
    void syncer.read()
    const a = syncer.read(undefined, { fresh: true })
    queue.push(second.promise)
    first.resolve(raw(fullMaindata({ rid: 1 })))
    await vi.waitFor(() => expect(syncMaindata).toHaveBeenCalledTimes(2))
    // Arrives while a's pull is in flight: needs a third.
    const b = syncer.read(undefined, { fresh: true })
    second.resolve(raw({ rid: 2 }))
    await a
    await b
    expect(syncMaindata).toHaveBeenCalledTimes(3)
  })

  it('F5 a failed pull inside the 1 s window is not rethrown to a fresh read', async () => {
    const { syncer, syncMaindata, queue } = setup([
      new ServerFailure('qbit_unreachable'),
    ])
    await expect(syncer.read()).rejects.toEqual(failure('qbit_unreachable'))
    queue.push(raw(fullMaindata()))
    await expect(
      syncer.read(undefined, { fresh: true }),
    ).resolves.toMatchObject({ full: true })
    expect(syncMaindata).toHaveBeenCalledTimes(2)
  })

  it('F2 a failed pull from before the read is waited out without failing it', async () => {
    const gate = deferred<undefined>()
    const { syncer, syncMaindata, queue } = setup([
      gate.promise.then((): RawMaindata => {
        throw new ServerFailure('timeout')
      }),
    ])
    const plain = syncer.read()
    const fresh = syncer.read(undefined, { fresh: true })
    queue.push(raw(fullMaindata()))
    gate.resolve(undefined)
    await expect(plain).rejects.toEqual(failure('timeout'))
    await expect(fresh).resolves.toMatchObject({ full: true })
    expect(syncMaindata).toHaveBeenCalledTimes(2)
  })
})
