import { describe, expect, it } from 'vitest'
import type { SlimTorrent } from '#/shared/maindata'
import { SORT_FIELD_IDS, isExtraSortField } from '#/shared/sort-fields'
import type { SortValue } from '#/shared/sort-keys'
import { mergeMaindata } from '#/lib/maindata-merge'
import { fakeHash, fakeResponse, t } from '#/lib/testing'
import {
  countAll,
  boardColumnOf,
  selectBoardColumns,
  selectVisibleTorrents,
} from '#/lib/visible-torrents'

const ADDED_NEWEST = { sort: 'added_on', dir: 'desc' } as const
// Spec 1.6 rows V1, V2.

const H1 = fakeHash(1)
const H2 = fakeHash(2)
const H3 = fakeHash(3)
const H4 = fakeHash(4)

const maindata = mergeMaindata(
  undefined,
  fakeResponse({
    changed: [
      t({ hash: H3, added_on: 1_790_000_100 }),
      t({ hash: H1, added_on: 1_790_000_200, state: 'stalledUP', progress: 1 }),
      t({ hash: H2, added_on: 1_790_000_100, category: 'mteam-X' }),
      t({
        hash: H4,
        added_on: 1_790_000_300,
        state: 'missingFiles',
        private: false,
      }),
    ],
  }),
)

describe('selectVisibleTorrents', () => {
  it('V1 newest first, ties by hash ascending, archived left out', () => {
    expect(selectVisibleTorrents(maindata, ADDED_NEWEST)).toEqual([H1, H2, H3])
  })

  it('V2 countAll leaves archived out', () => {
    expect(countAll(maindata)).toBe(3)
  })

  it('V3 a moving torrent remembered as non-private missingFiles stays hidden', () => {
    const H5 = fakeHash(5)
    const before = mergeMaindata(
      undefined,
      fakeResponse({
        changed: [
          t({ hash: H1, added_on: 1_790_000_200 }),
          t({ hash: H5, state: 'missingFiles', private: false }),
        ],
      }),
    )
    const moving = mergeMaindata(
      before,
      fakeResponse({
        version: 'abcdef12.2',
        full: false,
        changed: [t({ hash: H5, state: 'moving', private: false })],
      }),
    )
    expect(moving.stateBeforeMove).toEqual({ [H5]: 'missingFiles' })
    expect(selectVisibleTorrents(moving, ADDED_NEWEST)).toEqual([H1])
    expect(countAll(moving)).toBe(1)
  })
})

// Spec 2.1 rows S2, S3 and S12: every field in both directions, ties, no
// value last both ways, and 4165 torrents.

type Field = (typeof SORT_FIELD_IDS)[number]

const A = fakeHash(0xa1)
const B = fakeHash(0xb2)
const M = fakeHash(0xc3)

interface Case {
  /** Overrides for the torrent `desc` puts first, the second, and (optional) one with no value. */
  slim?: [Partial<SlimTorrent>, Partial<SlimTorrent>, Partial<SlimTorrent>?]
  /** Extra sorts: keys for the first, the second, and the no-value torrent. */
  keys?: [SortValue, SortValue, SortValue?]
}

const T0 = 1_790_000_000
const SLIM_CASES: Partial<Record<Field, Case>> = {
  state: {
    slim: [{ state: 'error' }, { state: 'stoppedUP', progress: 1 }],
  },
  seeding_time: { slim: [{ seeding_time: 200 }, { seeding_time: 100 }] },
  added_on: { slim: [{ added_on: T0 + 10 }, { added_on: T0 }] },
  ratio: { slim: [{ ratio: -1 }, { ratio: 1 }] },
  completion_on: {
    slim: [
      { completion_on: T0 + 10 },
      { completion_on: T0 },
      { completion_on: -1 },
    ],
  },
  last_activity: {
    slim: [
      { last_activity: T0 + 60 },
      { last_activity: T0 },
      { last_activity: 0 },
    ],
  },
  eta: { slim: [{ eta: 7200 }, { eta: 60 }, { eta: 8_640_000 }] },
  progress: { slim: [{ progress: 0.9 }, { progress: 0.1 }] },
  dlspeed: { slim: [{ dlspeed: 2 }, { dlspeed: 1 }] },
  upspeed: { slim: [{ upspeed: 2 }, { upspeed: 1 }] },
  global_speed: {
    slim: [
      { dlspeed: 1, upspeed: 5 },
      { dlspeed: 3, upspeed: 1 },
    ],
  },
  size: { slim: [{ size: 2 }, { size: 1 }] },
  name: { slim: [{ name: 'alpha.S01E2' }, { name: 'Alpha.S01E10' }] },
  category: {
    slim: [{ category: 'mteam-tv' }, { category: 'X' }, { category: '' }],
  },
  private: {
    slim: [{ private: true }, { private: false }, { private: null }],
  },
  save_path: { slim: [{ save_path: '/data/a' }, { save_path: '/data/b' }] },
  save_path_basename: {
    slim: [{ save_path: '/z/a' }, { save_path: '/a/b' }, { save_path: '/' }],
  },
}

const number2 = { keys: [2, 1, null] } satisfies Case
const KEY_CASES: Partial<Record<Field, Case>> = {
  seen_complete: { keys: [T0 + 10, T0, -1] },
  availability: { keys: [1.5, 0.5, -1] },
  num_complete: { keys: [9, 0, -1] },
  dl_limit: { keys: [2048, 1024, -1] },
  up_limit: { keys: [2048, 1024, 0] },
  priority: { keys: [3, 1, 0] },
  ratio_limit: { keys: [2, 0, -2] },
  seeding_time_limit: { keys: [120, 60, -1] },
  inactive_seeding_time_limit: { keys: [120, 60, -2] },
  tracker_domain: { keys: ['a.example', 'b.example', null] },
  content_path: { keys: ['/data/a', '/data/b', ''] },
  root_path: { keys: ['/data/a', '/data/b', ''] },
  content_path_basename: { keys: ['a', 'b', null] },
  infohash_v1: { keys: ['0a', '0b', ''] },
  infohash_v2: { keys: ['0a', '0b', ''] },
  comment: { keys: ['a', 'b', ''] },
  has_metadata: { keys: [true, false, null] },
}

function caseFor(field: Field): Case {
  if (field === 'hash') return {}
  if (isExtraSortField(field)) return KEY_CASES[field] ?? number2
  const found = SLIM_CASES[field]
  if (!found) throw new Error(`no case for ${field}`)
  return found
}

function build(field: Field) {
  const spec = caseFor(field)
  // The first torrent is the older one, so the tie-break alone would put
  // it second: only the field can put it first.
  const base = [
    { hash: A, added_on: T0 - 100 },
    { hash: B, added_on: T0 - 50 },
    { hash: M, added_on: T0 },
  ]
  const slim = spec.slim ?? [{}, {}]
  const torrents = base
    .slice(0, slim.length === 3 || spec.keys?.length === 3 ? 3 : 2)
    .map((entry, index) => t({ ...entry, ...(slim[index] ?? {}) }))
  if (field === 'added_on') {
    torrents[0] = t({ hash: A, added_on: T0 + 10 })
    torrents[1] = t({ hash: B, added_on: T0 })
  }
  const keys: Record<string, SortValue> | undefined = spec.keys
    ? Object.fromEntries(
        spec.keys.map((value, index) => [base[index].hash, value ?? null]),
      )
    : undefined
  return {
    data: mergeMaindata(undefined, fakeResponse({ changed: torrents })),
    keys,
    missing: torrents.length === 3,
  }
}

describe('selectVisibleTorrents: every field, both directions (S2, S3)', () => {
  it.each(SORT_FIELD_IDS.map((field) => [field]))('%s', (field) => {
    const { data, keys, missing } = build(field)
    const desc = selectVisibleTorrents(data, { sort: field, dir: 'desc' }, keys)
    const asc = selectVisibleTorrents(data, { sort: field, dir: 'asc' }, keys)
    expect(desc, 'desc').toEqual(missing ? [A, B, M] : [A, B])
    // Reversed, except that no value stays last.
    expect(asc, 'asc').toEqual(missing ? [B, A, M] : [B, A])
  })
})

describe('ties and no value', () => {
  const tied = mergeMaindata(
    undefined,
    fakeResponse({
      changed: [
        t({ hash: H1, seeding_time: 60, added_on: T0 }),
        t({ hash: H2, seeding_time: 60, added_on: T0 + 5 }),
        t({ hash: H3, seeding_time: 60, added_on: T0 + 5 }),
        t({ hash: H4, seeding_time: 120, added_on: T0 - 5 }),
      ],
    }),
  )

  it('S2 ties: added_on newest first, then hash, in both directions', () => {
    expect(
      selectVisibleTorrents(tied, { sort: 'seeding_time', dir: 'desc' }),
    ).toEqual([H4, H2, H3, H1])
    expect(
      selectVisibleTorrents(tied, { sort: 'seeding_time', dir: 'asc' }),
    ).toEqual([H2, H3, H1, H4])
  })

  it('S3 no value last in both directions, tied among themselves', () => {
    const data = mergeMaindata(
      undefined,
      fakeResponse({
        changed: [
          t({ hash: H1, completion_on: -1, added_on: T0 }),
          t({ hash: H2, completion_on: T0, added_on: T0 }),
          t({ hash: H3, completion_on: -1, added_on: T0 + 1 }),
          t({ hash: H4, completion_on: T0 + 9, added_on: T0 }),
        ],
      }),
    )
    expect(
      selectVisibleTorrents(data, { sort: 'completion_on', dir: 'desc' }),
    ).toEqual([H4, H2, H3, H1])
    expect(
      selectVisibleTorrents(data, { sort: 'completion_on', dir: 'asc' }),
    ).toEqual([H2, H4, H3, H1])
  })

  it('S4 an extra sort without keys: every torrent in tie order', () => {
    expect(
      selectVisibleTorrents(tied, { sort: 'num_seeds', dir: 'desc' }),
    ).toEqual([H2, H3, H1, H4])
  })

  it('a key for a torrent maindata no longer has is ignored', () => {
    expect(
      selectVisibleTorrents(
        tied,
        { sort: 'num_seeds', dir: 'desc' },
        { [H1]: 5, [fakeHash(99)]: 9 },
      ),
    ).toEqual([H1, H2, H3, H4])
  })
})

describe('S12 4165 torrents', () => {
  it('each sort selects well under 100 ms', () => {
    const changed = Array.from({ length: 4165 }, (_, index) =>
      t({
        hash: fakeHash(index + 1),
        name: `Fake.Show.${(index * 7919) % 4165}.S01E${index % 24}.1080p`,
        added_on: T0 - ((index * 7919) % 10_000),
        seeding_time: ((index * 31) % 400) * 86_400,
        ratio: ((index * 13) % 300) / 100,
        save_path: `/data/media/X/${index % 17}`,
        state: index % 5 === 0 ? 'stoppedUP' : 'uploading',
        progress: 1,
      }),
    )
    const data = mergeMaindata(undefined, fakeResponse({ changed }))
    const keys = Object.fromEntries(
      changed.map((torrent, index) => [torrent.hash, (index * 17) % 50]),
    )
    const times: Record<string, number> = {}
    for (const sort of [
      'seeding_time',
      'ratio',
      'name',
      'save_path',
      'hash',
      'num_seeds',
    ] as const) {
      const start = performance.now()
      const order = selectVisibleTorrents(data, { sort, dir: 'desc' }, keys)
      times[sort] = performance.now() - start
      expect(order).toHaveLength(4165)
    }
    // Measured on the dev machine: see the PR; the bound leaves CI headroom.
    for (const [sort, ms] of Object.entries(times)) {
      expect(ms, sort).toBeLessThan(100)
    }
    console.info('S12 select ms', times)
  })
})

describe('hash fields compare as hex code units', () => {
  it.each(['hash', 'infohash_v1'] as const)('%s', (sort) => {
    const low = '0a' + '0'.repeat(38)
    const mid = '10' + '0'.repeat(38)
    const high = '9f' + '0'.repeat(38)
    const shortish = '00a' + '0'.repeat(37)
    const torrents = [high, low, mid, shortish].map((hash, index) =>
      t({ hash, added_on: T0 + index }),
    )
    const data = mergeMaindata(undefined, fakeResponse({ changed: torrents }))
    const keys = Object.fromEntries(torrents.map((x) => [x.hash, x.hash]))
    expect(selectVisibleTorrents(data, { sort, dir: 'desc' }, keys)).toEqual([
      shortish,
      low,
      mid,
      high,
    ])
  })
})

// Spec 2.3 rows K3 to K7: the board's columns and their fixed orders.

describe('selectBoardColumns', () => {
  const data = (torrents: Array<SlimTorrent>) =>
    mergeMaindata(undefined, fakeResponse({ changed: torrents }))
  const h = (n: number) => fakeHash(0x100 + n)

  it('K3 each column in its order, no value last, ties by added_on then hash', () => {
    const columns = selectBoardColumns(
      data([
        // 下載中 (downloading and paused): added_on newest first.
        t({ hash: h(1), state: 'downloading', added_on: T0 + 1 }),
        t({ hash: h(2), state: 'pausedDL', added_on: T0 + 3 }),
        t({ hash: h(3), state: 'queuedDL', added_on: T0 + 2 }),
        // 做種中: seeding_time longest first; 0 last.
        t({ hash: h(4), state: 'uploading', progress: 1, seeding_time: 60 }),
        t({ hash: h(5), state: 'stalledUP', progress: 1, seeding_time: 600 }),
        t({ hash: h(6), state: 'uploading', progress: 1, seeding_time: 0 }),
        // 完成: completion_on newest first; -1 last; a tie by added_on.
        t({
          hash: h(7),
          state: 'stoppedUP',
          progress: 1,
          completion_on: T0,
          added_on: T0 - 10,
        }),
        t({
          hash: h(8),
          state: 'stoppedUP',
          progress: 1,
          completion_on: T0,
          added_on: T0 - 5,
        }),
        t({ hash: h(9), state: 'stoppedUP', progress: 1, completion_on: -1 }),
        t({
          hash: h(10),
          state: 'pausedUP',
          progress: 1,
          completion_on: T0 + 100,
        }),
      ]),
    )
    expect(columns.downloading).toEqual([h(2), h(3), h(1)])
    expect(columns.seeding).toEqual([h(5), h(4), h(6)])
    expect(columns.done).toEqual([h(10), h(8), h(7), h(9)])
    expect(columns.attention).toEqual([])
    expect(columns.archived).toEqual([])
  })

  it('K3 a full tie (same value, same added_on) goes by hash ascending', () => {
    const same = { state: 'uploading', progress: 1, seeding_time: 60 }
    const columns = selectBoardColumns(
      data([
        t({ ...same, hash: h(3), added_on: T0 }),
        t({ ...same, hash: h(1), added_on: T0 }),
        t({ ...same, hash: h(2), added_on: T0 }),
      ]),
    )
    expect(columns.seeding).toEqual([h(1), h(2), h(3)])
  })

  it('K4 要處理: stalled and errored, newest activity first, 0 last', () => {
    const columns = selectBoardColumns(
      data([
        t({ hash: h(1), state: 'stalledDL', last_activity: T0 }),
        t({ hash: h(2), state: 'error', last_activity: T0 + 120 }),
        t({ hash: h(3), state: 'unknown', last_activity: 0 }),
        t({
          hash: h(4),
          state: 'missingFiles',
          private: true,
          last_activity: T0 + 60,
        }),
      ]),
    )
    expect(columns.attention).toEqual([h(2), h(4), h(1), h(3)])
  })

  it('K5 archived only in its own column, never counted in 全部', () => {
    const torrents = [
      t({
        hash: h(1),
        state: 'missingFiles',
        private: false,
        completion_on: T0,
      }),
      t({
        hash: h(2),
        state: 'missingFiles',
        private: null,
        completion_on: T0 + 1,
      }),
      t({
        hash: h(3),
        state: 'missingFiles',
        private: false,
        completion_on: 0,
      }),
      t({ hash: h(4), state: 'downloading' }),
    ]
    const columns = selectBoardColumns(data(torrents))
    expect(columns.archived).toEqual([h(2), h(1), h(3)])
    expect(columns.downloading).toEqual([h(4)])
    expect(countAll(data(torrents))).toBe(1)
  })

  it('K6 only archived: 全部 0, the four work columns empty', () => {
    const only = data([
      t({ hash: h(1), state: 'missingFiles', private: false }),
      t({ hash: h(2), state: 'missingFiles', private: false }),
    ])
    const columns = selectBoardColumns(only)
    expect(countAll(only)).toBe(0)
    expect(columns.attention).toEqual([])
    expect(columns.downloading).toEqual([])
    expect(columns.seeding).toEqual([])
    expect(columns.done).toEqual([])
    expect(columns.archived).toHaveLength(2)
  })

  it('K7 nothing stalled or errored: 要處理 is empty', () => {
    const columns = selectBoardColumns(
      data([
        t({ hash: h(1) }),
        t({ hash: h(2), state: 'uploading', progress: 1 }),
      ]),
    )
    expect(columns.attention).toEqual([])
  })

  it('a moving torrent keeps the column of the state it moved from', () => {
    const before = data([
      t({ hash: h(1), state: 'stoppedUP', progress: 1, completion_on: T0 }),
    ])
    const moving = mergeMaindata(
      before,
      fakeResponse({
        version: 'abcdef12.2',
        full: false,
        changed: [
          t({ hash: h(1), state: 'moving', progress: 1, completion_on: T0 }),
        ],
      }),
    )
    expect(selectBoardColumns(moving).done).toEqual([h(1)])
  })

  it('4165 torrents in under 100 ms', () => {
    const states = [
      'downloading',
      'uploading',
      'stoppedUP',
      'stalledDL',
      'error',
    ]
    const torrents = Array.from({ length: 4165 }, (_, i) =>
      t({
        hash: fakeHash(0x10000 + i),
        state: states[i % states.length],
        progress: i % 5 === 0 ? 0.5 : 1,
        added_on: T0 + (i % 97),
        seeding_time: (i % 400) * 60,
        completion_on: T0 + (i % 53),
        last_activity: T0 + (i % 31),
      }),
    )
    const big = data(torrents)
    const start = performance.now()
    const columns = selectBoardColumns(big)
    const ms = performance.now() - start
    const total = Object.values(columns).reduce((n, c) => n + c.length, 0)
    expect(total).toBe(4165)
    expect(ms).toBeLessThan(100)
  })
})

describe('boardColumnOf (spec 2.4)', () => {
  const columns = {
    attention: ['a'],
    downloading: [],
    seeding: ['b', 'c'],
    done: [],
    archived: ['d'],
  }

  it('the column holding the hash, archived included; null when none', () => {
    expect(boardColumnOf(columns, 'c')).toBe('seeding')
    expect(boardColumnOf(columns, 'd')).toBe('archived')
    expect(boardColumnOf(columns, 'z')).toBeNull()
  })
})
