import { describe, expect, it } from 'vitest'
import { rawMaindataSchema } from '#/server/qbit/maindata-schema'
import type { RawMaindata } from '#/server/qbit/maindata-schema'
import {
  HASH_A,
  HASH_B,
  HASH_C,
  HASH_D,
  fullMaindata,
  rawTorrent,
} from '#/server/qbit/testing'
import {
  SEEDING_TIME_STEP_S,
  TOMBSTONE_MS,
  createTorrentTable,
} from '#/server/sync/torrent-table'
import { TORRENT_FIELDS } from '#/shared/maindata'

// Spec 1.5 rows S1 to S7, S11 and the G1 to G6 rules at table level.

const raw = (value: unknown): RawMaindata => rawMaindataSchema.parse(value)

function setup() {
  let clock = 0
  const table = createTorrentTable(() => clock)
  table.apply(raw(fullMaindata()))
  return {
    table,
    advance: (ms: number) => {
      clock += ms
    },
  }
}

const hashes = (list: Array<{ hash: string }>) =>
  list.map((torrent) => torrent.hash).sort()

const failure = (code: string) =>
  expect.objectContaining({ name: 'ServerFailure', code })

describe('torrent table', () => {
  it('S1 first full answer: 3 slim torrents, version 1, state and categories', () => {
    const { table } = setup()
    expect(table.size).toBe(3)
    expect(table.version).toBe(1)
    const { full, changed, removed } = table.changesSince(null)
    expect(full).toBe(true)
    expect(removed).toEqual([])
    expect(hashes(changed)).toEqual([HASH_A, HASH_B, HASH_C].sort())
    for (const torrent of changed) {
      expect(Object.keys(torrent).sort()).toEqual([...TORRENT_FIELDS].sort())
    }
    expect(changed.find((t) => t.hash === HASH_A)).toMatchObject({
      name: 'A',
      size: 1_073_741_824,
      save_path: '/downloads/movies/',
    })
    expect(table.serverState).toEqual({
      dl_info_speed: 2048,
      up_info_speed: 512,
      dl_rate_limit: 0,
      up_rate_limit: 0,
      use_alt_speed_limits: false,
      connection_status: 'connected',
    })
    expect(table.categories).toEqual({
      movies: { name: 'movies', savePath: '/downloads/movies' },
      tv: { name: 'tv', savePath: '/downloads/tv' },
    })
  })

  it('S2 a slim field change bumps that torrent only; a non-slim one bumps nothing', () => {
    const { table } = setup()
    table.apply(
      raw({
        rid: 2,
        torrents: { [HASH_A]: { progress: 0.75 }, [HASH_B]: { num_seeds: 9 } },
      }),
    )
    expect(table.version).toBe(2)
    const { full, changed } = table.changesSince(1)
    expect(full).toBe(false)
    expect(changed).toEqual([
      expect.objectContaining({ hash: HASH_A, progress: 0.75, name: 'A' }),
    ])

    table.apply(raw({ rid: 3, torrents: { [HASH_B]: { num_seeds: 10 } } }))
    expect(table.version).toBe(2)
    expect(table.changesSince(2)).toEqual({
      full: false,
      changed: [],
      removed: [],
    })
  })

  it('S2 a slim field set to the value it already has bumps nothing', () => {
    const { table } = setup()
    table.apply(raw({ rid: 2, torrents: { [HASH_A]: { name: 'A' } } }))
    expect(table.version).toBe(1)
  })

  it('S3 removed: leaves the table, tombstoned at the new version', () => {
    const { table } = setup()
    table.apply(raw({ rid: 2, torrents_removed: [HASH_A] }))
    expect(table.size).toBe(2)
    expect(table.version).toBe(2)
    expect(table.changesSince(1)).toEqual({
      full: false,
      changed: [],
      removed: [HASH_A],
    })
    expect(table.changesSince(2).removed).toEqual([])
    expect(hashes(table.changesSince(null).changed)).toEqual(
      [HASH_B, HASH_C].sort(),
    )
  })

  it('S3 removal wins over a change in the same answer', () => {
    const { table } = setup()
    table.apply(
      raw({
        rid: 2,
        torrents: {
          [HASH_A]: { progress: 1 },
          [HASH_D]: rawTorrent({ name: 'D' }),
        },
        torrents_removed: [HASH_A, HASH_D],
      }),
    )
    expect(table.changesSince(1)).toEqual({
      full: false,
      changed: [],
      removed: [HASH_A],
    })
  })

  it('S4 a later full answer is diffed: identical kept, changed bumped, missing tombstoned', () => {
    const { table } = setup()
    table.apply(
      raw({
        rid: 1,
        full_update: true,
        torrents: {
          [HASH_A]: rawTorrent({ name: 'A', progress: 0.9 }),
          [HASH_C]: rawTorrent({ name: 'C', private: null }),
        },
        categories: { tv: { name: 'tv', savePath: '/downloads/tv' } },
        server_state: fullMaindata().server_state,
      }),
    )
    expect(table.version).toBe(2)
    expect(table.changesSince(1)).toEqual({
      full: false,
      changed: [expect.objectContaining({ hash: HASH_A, progress: 0.9 })],
      removed: [HASH_B],
    })
    expect(table.categories).toEqual({
      tv: { name: 'tv', savePath: '/downloads/tv' },
    })
  })

  it('S4 an identical full answer changes nothing', () => {
    const { table } = setup()
    table.apply(raw(fullMaindata()))
    expect(table.version).toBe(1)
  })

  it('S5 categories merge by name, removed ones go, server state merges key by key', () => {
    const { table } = setup()
    table.apply(
      raw({
        rid: 2,
        categories: {
          movies: { savePath: '/downloads/films' },
          music: { name: 'music', savePath: '/downloads/music' },
        },
        categories_removed: ['tv'],
        server_state: { dl_info_speed: 99 },
      }),
    )
    expect(table.categories).toEqual({
      movies: { name: 'movies', savePath: '/downloads/films' },
      music: { name: 'music', savePath: '/downloads/music' },
    })
    expect(table.serverState).toMatchObject({
      dl_info_speed: 99,
      up_info_speed: 512,
      connection_status: 'connected',
    })
    // Categories and state alone do not bump the torrent version.
    expect(table.version).toBe(1)
  })

  it('S6 a re-added hash drops its tombstone and is in changed, not removed', () => {
    const { table } = setup()
    table.apply(raw({ rid: 2, torrents_removed: [HASH_A] }))
    table.apply(
      raw({ rid: 3, torrents: { [HASH_A]: rawTorrent({ name: 'A again' }) } }),
    )
    expect(table.version).toBe(3)
    const since1 = table.changesSince(1)
    expect(since1.removed).toEqual([])
    expect(since1.changed).toEqual([
      expect.objectContaining({ hash: HASH_A, name: 'A again' }),
    ])
    expect(table.changesSince(2)).toMatchObject({ removed: [] })
  })

  it('S7 an unknown hash without every slim field: qbit_rejected, nothing changes', () => {
    const { table } = setup()
    const before = table.changesSince(null)
    expect(() =>
      table.apply(
        raw({
          rid: 2,
          torrents: {
            [HASH_A]: { progress: 0.99 },
            [HASH_D]: { name: 'D', progress: 0.1 },
          },
          torrents_removed: [HASH_B],
          categories_removed: ['tv'],
          server_state: { dl_info_speed: 1 },
        }),
      ),
    ).toThrow(
      expect.objectContaining({
        code: 'qbit_rejected',
        reason: 'incomplete_torrent',
        // Field names only (at most 10); the hash is replaced by `*`.
        issues: expect.arrayContaining(['torrents.*.state', 'torrents.*.size']),
      }),
    )
    expect(table.version).toBe(1)
    expect(table.size).toBe(3)
    expect(table.changesSince(null)).toEqual(before)
    expect(table.categories).toHaveProperty('tv')
    expect(table.serverState.dl_info_speed).toBe(2048)
  })

  it('S7 a key that is not a torrent hash is rejected even past the raw schema', () => {
    const { table } = setup()
    const forged = {
      rid: 2,
      torrents: { 'not-a-hash': rawTorrent() },
    } as unknown as RawMaindata
    expect(() => table.apply(forged)).toThrow(
      expect.objectContaining({ code: 'qbit_rejected', reason: 'not_hash' }),
    )
    expect(table.size).toBe(3)
  })

  it('a first answer without a complete server state is rejected', () => {
    const table = createTorrentTable(() => 0)
    expect(() =>
      table.apply(raw({ rid: 1, full_update: true, torrents: {} })),
    ).toThrow(failure('qbit_rejected'))
    expect(() => table.serverState).toThrow()
  })

  it('an incomplete new category is rejected like an incomplete torrent', () => {
    const { table } = setup()
    expect(() =>
      table.apply(
        raw({
          rid: 2,
          torrents: { [HASH_A]: { progress: 0.99 } },
          categories: { X: { name: 'X' } },
        }),
      ),
    ).toThrow(
      expect.objectContaining({
        reason: 'incomplete_category',
        issues: ['categories.*.savePath'],
      }),
    )
    expect(table.categories).not.toHaveProperty('X')
    expect(table.version).toBe(1)
  })

  it('hands out copies: changing a result changes nothing inside', () => {
    const { table } = setup()
    const first = table.changesSince(null)
    first.changed[0].name = 'mutated'
    table.serverState.dl_info_speed = -1
    table.categories.movies.savePath = '/elsewhere'
    const again = table.changesSince(null)
    expect(again.changed.map((t) => t.name).sort()).toEqual(['A', 'B', 'C'])
    expect(table.serverState.dl_info_speed).toBe(2048)
    expect(table.categories.movies.savePath).toBe('/downloads/movies')
    table.apply(raw({ rid: 2, torrents: { [HASH_A]: { progress: 0.8 } } }))
    table.changesSince(1).changed[0].progress = 0
    expect(table.changesSince(1).changed[0].progress).toBe(0.8)
  })

  it('S11 private true, false and null are kept as is', () => {
    const { table } = setup()
    const byHash = Object.fromEntries(
      table.changesSince(null).changed.map((t) => [t.hash, t.private]),
    )
    expect(byHash).toEqual({ [HASH_A]: false, [HASH_B]: true, [HASH_C]: null })
  })

  it('a new torrent without private (no metadata yet) is kept with private null', () => {
    const { private: _left, ...noPrivate } = rawTorrent({ name: 'D' })
    const fresh = createTorrentTable(() => 0)
    fresh.apply(raw(fullMaindata({ torrents: { [HASH_D]: noPrivate } })))
    expect(fresh.changesSince(null).changed).toEqual([
      expect.objectContaining({ hash: HASH_D, private: null }),
    ])

    const { table } = setup()
    table.apply(raw({ rid: 2, torrents: { [HASH_D]: noPrivate } }))
    expect(table.changesSince(1).changed).toEqual([
      expect.objectContaining({ hash: HASH_D, private: null }),
    ])
    // A later delta without `private` keeps what is stored.
    table.apply(raw({ rid: 3, torrents: { [HASH_B]: { progress: 0.9 } } }))
    expect(table.changesSince(2).changed).toEqual([
      expect.objectContaining({ hash: HASH_B, private: true }),
    ])
  })

  it('an unknown connection_status from qBittorrent is stored as disconnected', () => {
    const { table } = setup()
    table.apply(
      raw({ rid: 2, server_state: { connection_status: 'fake-new-status' } }),
    )
    expect(table.serverState.connection_status).toBe('disconnected')
    table.apply(raw({ rid: 3, server_state: { dl_info_speed: 1 } }))
    expect(table.serverState.connection_status).toBe('disconnected')
    table.apply(
      raw({ rid: 4, server_state: { connection_status: 'connected' } }),
    )
    expect(table.serverState.connection_status).toBe('connected')
  })

  it.each([
    // [stored seeding_time, next seeding_time, changed?]
    [600, 659, false],
    [600, 660, true],
    [659, 600, false],
    [0, 59, false],
  ])(
    'seeding_time is floored to whole minutes: %i then %i, changed %s',
    (from, to, changed) => {
      const { table } = setup()
      table.apply(
        raw({ rid: 2, torrents: { [HASH_A]: { seeding_time: from } } }),
      )
      const version = table.version
      table.apply(raw({ rid: 3, torrents: { [HASH_A]: { seeding_time: to } } }))
      expect(table.version).toBe(changed ? version + 1 : version)
      const stored = table
        .changesSince(null)
        .changed.find((t) => t.hash === HASH_A)?.seeding_time
      expect(stored).toBe(
        Math.floor(to / SEEDING_TIME_STEP_S) * SEEDING_TIME_STEP_S,
      )
    },
  )

  it('G1 no counter: full, every torrent, nothing removed', () => {
    const { table } = setup()
    table.apply(raw({ rid: 2, torrents_removed: [HASH_A] }))
    expect(table.changesSince(null)).toMatchObject({ full: true, removed: [] })
    expect(table.changesSince(null).changed).toHaveLength(2)
  })

  it('G2 the current counter: nothing', () => {
    const { table } = setup()
    expect(table.changesSince(table.version)).toEqual({
      full: false,
      changed: [],
      removed: [],
    })
  })

  it('G3 an older counter: only what changed and what was removed since', () => {
    const { table } = setup()
    table.apply(raw({ rid: 2, torrents: { [HASH_A]: { progress: 0.8 } } }))
    table.apply(raw({ rid: 3, torrents_removed: [HASH_B] }))
    expect(table.changesSince(1)).toEqual({
      full: false,
      changed: [expect.objectContaining({ hash: HASH_A })],
      removed: [HASH_B],
    })
    expect(table.changesSince(2)).toEqual({
      full: false,
      changed: [],
      removed: [HASH_B],
    })
  })

  it('G4 a pruned tombstone raises the floor; a counter below it gets full', () => {
    const { table, advance } = setup()
    table.apply(raw({ rid: 2, torrents_removed: [HASH_A] }))
    expect(table.version).toBe(2)
    advance(TOMBSTONE_MS - 1)
    table.apply(raw({ rid: 3 }))
    expect(table.floor).toBe(0)
    expect(table.changesSince(1).removed).toEqual([HASH_A])
    advance(1)
    table.apply(raw({ rid: 4 }))
    expect(table.floor).toBe(2)
    expect(table.changesSince(1).full).toBe(true)
    expect(table.changesSince(2)).toEqual({
      full: false,
      changed: [],
      removed: [],
    })
  })

  it('G6 a counter above the current version: full', () => {
    const { table } = setup()
    expect(table.changesSince(table.version + 1).full).toBe(true)
  })
})
