import { describe, expect, it } from 'vitest'
import {
  basenameOf,
  extraSortValue,
  slimSortValue,
  sortKeyOf,
  trackerDomainOf,
} from '#/lib/sort-values'
import { t } from '#/lib/testing'
import { emptySortExtras } from '#/shared/sort-keys'
import type { SortExtras } from '#/shared/sort-keys'

// Spec 2.1: the value each sort compares, and the derived fields per
// VueTorrent v2.37.0 (row S10 for the tracker domain).

function extras(overrides: Partial<SortExtras> = {}): SortExtras {
  return { ...emptySortExtras(), ...overrides }
}

describe('trackerDomainOf (S10)', () => {
  it.each([
    ['https://tracker.example/announce?passkey=SECRET', 'tracker.example'],
    ['udp://Open.Tracker.Example:1337/announce', 'open.tracker.example'],
    ['http://[2001:db8::1]:8080/announce', '[2001:db8::1]'],
  ])('%s -> %s', (url, domain) => {
    expect(trackerDomainOf(url)).toBe(domain)
    expect(trackerDomainOf(url)).not.toContain('SECRET')
  })

  it.each(['', 'not a url', '/announce'])('%j -> null', (url) => {
    expect(trackerDomainOf(url)).toBeNull()
  })
})

describe('basenameOf', () => {
  it.each([
    ['/data/media/tv/Show.S01', 'Show.S01'],
    ['/data/media/tv/', 'tv'],
    ['/', null],
    ['', null],
    [null, null],
  ] as const)('%s -> %s', (path, name) => {
    expect(basenameOf(path)).toBe(name)
  })
})

describe('extraSortValue (VueTorrent v2.37.0 formulas)', () => {
  it('avg_dlspeed = downloaded / (time_active - seeding_time)', () => {
    expect(
      extraSortValue(
        'avg_dlspeed',
        extras({ downloaded: 6000, time_active: 600, seeding_time: 300 }),
      ),
    ).toBe(20)
  })

  it('avg_upspeed = uploaded / time_active', () => {
    expect(
      extraSortValue(
        'avg_upspeed',
        extras({ uploaded: 6000, time_active: 600 }),
      ),
    ).toBe(10)
  })

  it('no average for a zero or negative duration, or a missing input', () => {
    expect(
      extraSortValue(
        'avg_dlspeed',
        extras({ downloaded: 1, time_active: 300, seeding_time: 300 }),
      ),
    ).toBeNull()
    expect(
      extraSortValue('avg_upspeed', extras({ uploaded: 1, time_active: 0 })),
    ).toBeNull()
    expect(extraSortValue('avg_upspeed', extras({ uploaded: 1 }))).toBeNull()
  })

  it('global_volume = downloaded + uploaded', () => {
    expect(
      extraSortValue('global_volume', extras({ downloaded: 5, uploaded: 7 })),
    ).toBe(12)
    expect(
      extraSortValue('global_volume', extras({ downloaded: 5 })),
    ).toBeNull()
  })

  it('content_path_basename is the last path segment', () => {
    expect(
      extraSortValue(
        'content_path_basename',
        extras({ content_path: '/data/media/tv/Show.S01E01.mkv' }),
      ),
    ).toBe('Show.S01E01.mkv')
  })

  it('seeding limits come in minutes and compare in seconds; -1 and -2 stay', () => {
    expect(
      extraSortValue('seeding_time_limit', extras({ seeding_time_limit: 60 })),
    ).toBe(3600)
    expect(
      extraSortValue(
        'inactive_seeding_time_limit',
        extras({ inactive_seeding_time_limit: -2 }),
      ),
    ).toBe(-2)
  })

  it('other fields are read as stored', () => {
    expect(extraSortValue('num_seeds', extras({ num_seeds: 4 }))).toBe(4)
    expect(
      extraSortValue('tracker_domain', extras({ tracker_domain: 'a.example' })),
    ).toBe('a.example')
    expect(
      extraSortValue('has_metadata', extras({ has_metadata: false })),
    ).toBe(false)
  })
})

describe('slimSortValue', () => {
  const torrent = t({ dlspeed: 3, upspeed: 4, save_path: '/data/media/tv/' })

  it('global_speed = dlspeed + upspeed', () => {
    expect(slimSortValue('global_speed', torrent, {})).toBe(7)
  })

  it('save_path_basename is the last segment', () => {
    expect(slimSortValue('save_path_basename', torrent, {})).toBe('tv')
  })

  it('state ranks needs-attention first, done last', () => {
    const rank = (state: string, progress = 0.5) =>
      slimSortValue('state', t({ state, progress }), {}) as number
    expect(rank('error')).toBeGreaterThan(rank('stalledDL'))
    expect(rank('stalledDL')).toBeGreaterThan(rank('downloading'))
    expect(rank('downloading')).toBeGreaterThan(rank('pausedDL'))
    expect(rank('pausedDL')).toBeGreaterThan(rank('uploading', 1))
    expect(rank('uploading', 1)).toBeGreaterThan(rank('stoppedUP', 1))
  })

  it('other fields are the torrent field', () => {
    expect(slimSortValue('name', torrent, {})).toBe(torrent.name)
    expect(slimSortValue('private', torrent, {})).toBe(false)
  })
})

describe('sortKeyOf', () => {
  it('no value is null; yes and no are 1 and 0; ratio -1 is the largest', () => {
    expect(sortKeyOf('completion_on', -1)).toBeNull()
    expect(sortKeyOf('num_seeds', undefined)).toBeNull()
    expect(sortKeyOf('private', true)).toBe(1)
    expect(sortKeyOf('private', false)).toBe(0)
    expect(sortKeyOf('ratio', -1)).toBe(Infinity)
    expect(sortKeyOf('name', 'a')).toBe('a')
  })
})
