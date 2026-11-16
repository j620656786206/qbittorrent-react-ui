import { describe, expect, it } from 'vitest'
import type { SlimTorrent } from '#/shared/maindata'
import { SORT_FIELD_IDS, isExtraSortField } from '#/shared/sort-fields'
import type { SortValue } from '#/shared/sort-keys'
import { DEFAULT_SORT_VIEW } from '#/shared/list-search'
import { mergeMaindata } from '#/lib/maindata-merge'
import { fakeHash, fakeResponse, t } from '#/lib/testing'
import { countAll, selectVisibleTorrents } from '#/lib/visible-torrents'

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
    expect(selectVisibleTorrents(maindata, DEFAULT_SORT_VIEW)).toEqual([
      H1,
      H2,
      H3,
    ])
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
    expect(selectVisibleTorrents(moving, DEFAULT_SORT_VIEW)).toEqual([H1])
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
  last_activity: { keys: [T0 + 10, T0, 0] },
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
