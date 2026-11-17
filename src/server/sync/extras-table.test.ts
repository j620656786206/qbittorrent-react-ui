import { describe, expect, expectTypeOf, it } from 'vitest'
import { rawMaindataSchema } from '#/server/qbit/maindata-schema'
import type { RawMaindata, RawTorrent } from '#/server/qbit/maindata-schema'
import {
  FAKE_PASSKEY,
  FAKE_TRACKER_DOMAIN,
  HASH_A,
  HASH_B,
  HASH_C,
  LEAK_MARKERS,
  fullMaindata,
  rawTorrent,
} from '#/server/qbit/testing'
import {
  EXTRAS_TIME_STEP_S,
  createExtrasTable,
} from '#/server/sync/extras-table'
import { EXTRA_SORT_FIELD_IDS } from '#/shared/sort-fields'
import { SORT_EXTRAS_FIELDS, emptySortExtras } from '#/shared/sort-keys'
import type { SortExtras } from '#/shared/sort-keys'

// Spec 2.1 rows S10 and S11 at table level: the second table, quantized
// change detection, deltas by version, the tracker reduced to its hostname.

const raw = (value: unknown): RawMaindata => rawMaindataSchema.parse(value)
const delta = (rid: number, torrents: Record<string, unknown>) =>
  raw({ rid, torrents })

function setup() {
  const table = createExtrasTable()
  table.apply(raw(fullMaindata()))
  return table
}

describe('extras table', () => {
  it('keeps every torrent of a full answer; a full read has every hash', () => {
    const table = setup()
    expect(table.size).toBe(3)
    expect(table.version).toBe(1)
    const { full, keys } = table.keysSince('num_seeds', null)
    expect(full).toBe(true)
    expect(keys).toEqual({ [HASH_A]: 3, [HASH_B]: 3, [HASH_C]: 3 })
  })

  it('S10 stores the tracker hostname only, never the URL or passkey', () => {
    const table = setup()
    expect(table.keysSince('tracker_domain', null).keys[HASH_A]).toBe(
      FAKE_TRACKER_DOMAIN,
    )
    for (const field of EXTRA_SORT_FIELD_IDS) {
      const text = JSON.stringify(table.keysSince(field, null))
      expect(text, field).not.toContain(FAKE_PASSKEY)
      expect(text, field).not.toContain(LEAK_MARKERS.tracker)
      expect(text, field).not.toContain(LEAK_MARKERS.magnet_uri)
      expect(text, field).not.toContain(LEAK_MARKERS.download_path)
    }
  })

  it('S10 a malformed tracker URL reads as no value', () => {
    const table = setup()
    table.apply(delta(2, { [HASH_A]: { tracker: 'not a url' } }))
    expect(table.keysSince('tracker_domain', null).keys[HASH_A]).toBeNull()
  })

  it('S11 a delta lists only torrents whose value for that field changed', () => {
    const table = setup()
    const since = table.version
    table.apply(
      delta(2, {
        [HASH_B]: { num_seeds: 9 },
        [HASH_C]: { comment: 'fake-new-comment' },
      }),
    )
    expect(table.keysSince('num_seeds', since)).toEqual({
      full: false,
      keys: { [HASH_B]: 9 },
    })
    // A static field: only the torrent whose comment changed.
    expect(table.keysSince('comment', since)).toEqual({
      full: false,
      keys: { [HASH_C]: 'fake-new-comment' },
    })
    expect(table.keysSince('infohash_v1', since).keys).toEqual({})
  })

  it('S11 a derived field follows the fields it is computed from', () => {
    const table = setup()
    const since = table.version
    table.apply(
      delta(2, {
        [HASH_A]: { uploaded: 1 },
        [HASH_B]: { content_path: '/downloads/x/Show' },
      }),
    )
    expect(Object.keys(table.keysSince('global_volume', since).keys)).toEqual([
      HASH_A,
    ])
    expect(Object.keys(table.keysSince('avg_upspeed', since).keys)).toEqual([
      HASH_A,
    ])
    expect(Object.keys(table.keysSince('avg_dlspeed', since).keys)).toEqual([])
    expect(table.keysSince('content_path_basename', since).keys).toEqual({
      [HASH_B]: 'Show',
    })
  })

  it('derived values come from the raw values, not the quantized ones', () => {
    const table = createExtrasTable()
    table.apply(
      raw({
        rid: 1,
        full_update: true,
        torrents: {
          [HASH_A]: {
            ...rawTorrent(),
            downloaded: 5800,
            time_active: 119,
            seeding_time: 61,
          },
        },
      }),
    )
    // 5800 / (119 - 61); floored first it would be 5800 / 0, no value.
    expect(table.keysSince('avg_dlspeed', null).keys[HASH_A]).toBe(100)
  })

  it('an empty tracker keeps the last known domain, also on a full update', () => {
    const table = setup()
    table.apply(delta(2, { [HASH_A]: { tracker: '' } }))
    expect(table.keysSince('tracker_domain', null).keys[HASH_A]).toBe(
      FAKE_TRACKER_DOMAIN,
    )
    table.apply(
      raw({
        rid: 0,
        full_update: true,
        torrents: { [HASH_A]: rawTorrent({ tracker: '' }) },
      }),
    )
    expect(table.keysSince('tracker_domain', null).keys[HASH_A]).toBe(
      FAKE_TRACKER_DOMAIN,
    )
  })

  it('a full update starts from empty extras: a field left out is no value', () => {
    const table = setup()
    const { comment: _comment, ...withoutComment } = rawTorrent()
    table.apply(
      raw({
        rid: 0,
        full_update: true,
        torrents: { [HASH_A]: withoutComment },
      }),
    )
    expect(table.keysSince('comment', null).keys[HASH_A]).toBeNull()
  })

  it('a key sent as null or the wrong type is no value, not "unchanged"', () => {
    const table = setup()
    table.apply(delta(2, { [HASH_A]: { num_seeds: null, comment: 5 } }))
    expect(table.keysSince('num_seeds', null).keys[HASH_A]).toBeNull()
    expect(table.keysSince('comment', null).keys[HASH_A]).toBeNull()
    // A key left out is unchanged.
    table.apply(delta(3, { [HASH_B]: { name: 'B2' } }))
    expect(table.keysSince('num_seeds', null).keys[HASH_B]).toBe(3)
  })

  it('S11 an unknown (newer) counter answers full', () => {
    const table = setup()
    expect(table.keysSince('num_seeds', table.version + 5).full).toBe(true)
  })

  it('a slim-only change, or nothing, does not bump the version', () => {
    const table = setup()
    table.apply(delta(2, { [HASH_A]: { dlspeed: 99_999, name: 'X' } }))
    expect(table.version).toBe(1)
    table.apply(delta(3, {}))
    expect(table.version).toBe(1)
  })

  it('quantizes churning fields for change detection only', () => {
    const table = setup()
    const base = rawTorrent()
    const floor = (value: number) =>
      Math.floor(value / EXTRAS_TIME_STEP_S) * EXTRAS_TIME_STEP_S
    // Inside the same minute and the same 2 decimals: no change.
    table.apply(
      delta(2, {
        [HASH_A]: {
          time_active: base.time_active + 5,
          reannounce: base.reannounce - 30,
          availability: 1.4612,
          popularity: 0.1249,
        },
      }),
    )
    expect(table.version).toBe(1)
    expect(table.keysSince('time_active', 1).keys).toEqual({})
    // The values sent are the raw ones.
    expect(table.keysSince('time_active', null).keys[HASH_A]).toBe(
      base.time_active + 5,
    )
    expect(table.keysSince('availability', null).keys[HASH_A]).toBe(1.4612)
    // The next minute: a change.
    table.apply(
      delta(3, {
        [HASH_A]: { time_active: floor(base.time_active) + 60 },
      }),
    )
    expect(table.version).toBe(2)
  })

  it('a field qBittorrent leaves out or sends oddly reads as no value, never throws', () => {
    const table = createExtrasTable()
    table.apply(
      raw({
        rid: 1,
        full_update: true,
        torrents: {
          [HASH_A]: { name: 'A', num_seeds: 'many', comment: 5 },
        },
      }),
    )
    expect(table.keysSince('num_seeds', null).keys).toEqual({ [HASH_A]: null })
    expect(table.keysSince('comment', null).keys).toEqual({ [HASH_A]: null })
    expect(table.keysSince('avg_upspeed', null).keys).toEqual({
      [HASH_A]: null,
    })
  })

  it('removed torrents leave; a full answer drops the ones it does not list', () => {
    const table = setup()
    table.apply(raw({ rid: 2, torrents_removed: [HASH_A] }))
    expect(Object.keys(table.keysSince('num_seeds', null).keys)).not.toContain(
      HASH_A,
    )
    table.apply(
      raw({ rid: 0, full_update: true, torrents: { [HASH_C]: rawTorrent() } }),
    )
    expect(Object.keys(table.keysSince('num_seeds', null).keys)).toEqual([
      HASH_C,
    ])
  })

  it('a re-added torrent is in the next delta', () => {
    const table = setup()
    table.apply(raw({ rid: 2, torrents_removed: [HASH_A] }))
    const since = table.version
    table.apply(delta(3, { [HASH_A]: rawTorrent() }))
    expect(Object.keys(table.keysSince('num_seeds', since).keys)).toEqual([
      HASH_A,
    ])
  })
})

describe('one list of sort extras (src/shared/sort-keys.ts)', () => {
  it('the parsed raw torrent carries every extra, the tracker as tracker_domain', () => {
    // A field added to the list but not read from the raw answer fails here.
    expectTypeOf<Exclude<keyof SortExtras, keyof RawTorrent>>().toBeNever()
    expectTypeOf<RawTorrent>().not.toHaveProperty('tracker')
  })

  it('the empty row is every field, all null', () => {
    const empty = emptySortExtras()
    expect(Object.keys(empty).sort()).toEqual([...SORT_EXTRAS_FIELDS].sort())
    expect(Object.values(empty).every((value) => value === null)).toBe(true)
  })

  it('a value qBittorrent left out is unchanged; an unexpected shape is no value', () => {
    const table = setup()
    const before = table.keysSince('num_seeds', null).keys[HASH_A]
    table.apply(delta(2, { [HASH_A]: { comment: 'x' } }))
    expect(table.keysSince('num_seeds', null).keys[HASH_A]).toBe(before)
    table.apply(delta(3, { [HASH_A]: { num_seeds: 'many' } }))
    expect(table.keysSince('num_seeds', null).keys[HASH_A]).toBeNull()
  })

  it('rawOf: one torrent as qBittorrent sent it, unquantized; gone hashes are undefined (story 2.4)', () => {
    const table = setup()
    table.apply(delta(2, { [HASH_A]: { uploaded: 7, time_active: 61 } }))
    expect(table.rawOf(HASH_A)).toMatchObject({ uploaded: 7, time_active: 61 })
    table.apply(raw({ rid: 3, torrents_removed: [HASH_A] }))
    expect(table.rawOf(HASH_A)).toBeUndefined()
    expect(table.rawOf('f'.repeat(40))).toBeUndefined()
  })
})
