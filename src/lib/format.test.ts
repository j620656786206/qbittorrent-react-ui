import { describe, expect, it } from 'vitest'
import {
  NO_VALUE,
  QBIT_ETA_INFINITY,
  formatAgo,
  formatCount,
  formatDate,
  formatDayKey,
  formatDuration,
  formatEta,
  formatPercent,
  formatRatio,
  formatRowSpeed,
  formatSize,
  formatSpeed,
  formatSpeedLimit,
  formatSortValue,
  seedingLimitSeconds,
  sortableRatio,
  formatSpeedLimitFull,
  hasNoSortValue,
  isGoodRatio,
} from '#/lib/format'

// Spec 1.6 rows F1 to F10. The clock is passed in: 2026-11-16 12:00 in
// Asia/Taipei (04:00 UTC).

const TAIPEI = 'Asia/Taipei'
const NOW = Date.UTC(2026, 10, 16, 4, 0, 0)
const unix = (ms: number) => ms / 1000

const KIB = 1024
const MIB = KIB ** 2
const GIB = KIB ** 3
const TIB = KIB ** 4

const MINUTE = 60
const HOUR = 3600
const DAY = 86_400

describe('F1 formatCount', () => {
  it.each([
    [3631, '3,631'],
    [0, '0'],
  ])('%d -> %s', (value, expected) => {
    expect(formatCount(value)).toBe(expected)
  })
})

describe('F2 formatSize', () => {
  it.each([
    ['0', 0, '0 B'],
    ['512 B', 512, '512 B'],
    ['1 KiB', KIB, '1 KB'],
    ['85 GiB', 85 * GIB, '85 GB'],
    ['301.2 GiB', 301.2 * GIB, '301.2 GB'],
    ['1,023 GiB', 1023 * GIB, '1,023 GB'],
    ['1,024 GiB', 1024 * GIB, '1 TB'],
    ['22.1 TiB', 22.1 * TIB, '22.1 TB'],
    ['1023.96 GiB (unit after rounding)', 1023.96 * GIB, '1 TB'],
  ])('%s -> %s', (_name, bytes, expected) => {
    expect(formatSize(bytes)).toBe(expected)
  })
})

describe('F3 formatSpeed', () => {
  it.each([
    ['0', 0, '0 KB/s'],
    ['300 B/s', 300, '1 KB/s'],
    ['1,023 KiB/s', 1023 * KIB, '1,023 KB/s'],
    ['1,024 KiB/s', 1024 * KIB, '1.00 MB/s'],
    ['6.21 MiB/s', 6.21 * MIB, '6.21 MB/s'],
    ['9.999 MiB/s', 9.999 * MIB, '10.0 MB/s'],
    ['10 MiB/s', 10 * MIB, '10.0 MB/s'],
    ['32.7 MiB/s', 32.7 * MIB, '32.7 MB/s'],
  ])('%s -> %s', (_name, value, expected) => {
    expect(formatSpeed(value)).toBe(expected)
  })

  it('formatRowSpeed leaves 0 out', () => {
    expect(formatRowSpeed(0)).toBeNull()
    expect(formatRowSpeed(6.21 * MIB)).toBe('6.21 MB/s')
  })

  it.each([null, undefined])('formatRowSpeed(%s) leaves it out', (value) => {
    expect(formatRowSpeed(value)).toBeNull()
  })
})

describe('F4 formatEta', () => {
  const SPEED = 6.21 * MIB
  it.each([
    ['30 s', 30, SPEED, '剩不到 1 分'],
    ['34 min', 34 * MINUTE, SPEED, '剩 34 分'],
    ['3 h 12 min', 3 * HOUR + 12 * MINUTE, SPEED, '剩 3 小時 12 分'],
    ['2 d 5 h', 2 * DAY + 5 * HOUR, SPEED, '剩 2 天 5 小時'],
    ['3 h exactly', 3 * HOUR, SPEED, '剩 3 小時'],
    ['infinite eta', QBIT_ETA_INFINITY, SPEED, '剩餘時間不明'],
    ['-1', -1, SPEED, '剩餘時間不明'],
    ['speed 0', 34 * MINUTE, 0, '剩餘時間不明'],
  ])('%s -> %s', (_name, eta, dlspeed, expected) => {
    expect(formatEta(eta, dlspeed)).toBe(expected)
  })
})

describe('F5 formatDate', () => {
  it.each([
    ['today 09:12', Date.UTC(2026, 10, 16, 1, 12), '今天 09:12'],
    ['yesterday 21:40', Date.UTC(2026, 10, 15, 13, 40), '昨天 21:40'],
    ['2026-11-05', Date.UTC(2026, 10, 5, 4, 0), '11/05'],
    ['2025-07-18', Date.UTC(2025, 6, 18, 4, 0), '2025/07/18'],
  ])('%s -> %s', (_name, ms, expected) => {
    expect(formatDate(unix(ms), NOW, TAIPEI)).toBe(expected)
  })

  it.each([0, -1])('%d -> 沒有', (value) => {
    expect(formatDate(value, NOW, TAIPEI)).toBe('沒有')
  })

  it('the day label follows the given zone across midnight', () => {
    // 2026-11-15 23:30 UTC is 2026-11-16 07:30 in Taipei.
    const instant = unix(Date.UTC(2026, 10, 15, 23, 30))
    expect(formatDate(instant, NOW, TAIPEI)).toBe('今天 07:30')
    expect(formatDate(instant, NOW, 'UTC')).toBe('昨天 23:30')
  })

  it.each([
    ['later today', Date.UTC(2026, 10, 16, 8, 30), '今天 16:30'],
    ['tomorrow (NAS clock ahead)', Date.UTC(2026, 10, 17, 1, 0), '今天 09:00'],
  ])('%s reads as today', (_name, ms, expected) => {
    expect(formatDate(unix(ms), NOW, TAIPEI)).toBe(expected)
  })

  it('an unknown zone falls back to the runtime zone instead of throwing', () => {
    const instant = unix(Date.UTC(2026, 10, 16, 1, 12))
    expect(() => formatDate(instant, NOW, 'Not/AZone')).not.toThrow()
    expect(formatDate(instant, NOW, 'Not/AZone')).toBe(formatDate(instant, NOW))
  })

  it('writes midnight as 00, not 24', () => {
    const midnight = unix(Date.UTC(2026, 10, 15, 16, 0))
    expect(formatDate(midnight, NOW, TAIPEI)).toBe('今天 00:00')
  })
})

describe('F6 formatAgo', () => {
  it.each([
    ['3 s', 3, '剛剛'],
    ['20 s', 20, '20 秒前'],
    ['5 min', 5 * MINUTE, '5 分前'],
    ['3 h', 3 * HOUR, '3 小時前'],
    ['3 d', 3 * DAY, '3 天前'],
    ['future', -120, '剛剛'],
  ])('%s ago -> %s', (_name, secondsAgo, expected) => {
    expect(formatAgo(unix(NOW) - secondsAgo, NOW)).toBe(expected)
  })
})

describe('F7 formatDuration', () => {
  it.each([
    ['41 d', 41 * DAY, '41 天'],
    ['5 h', 5 * HOUR, '5 小時'],
    ['12 min', 12 * MINUTE, '12 分'],
    ['30 s', 30, '不到 1 分'],
    ['412 d', 412 * DAY, '412 天'],
  ])('%s -> %s', (_name, seconds, expected) => {
    expect(formatDuration(seconds)).toBe(expected)
  })
})

describe('F8 formatRatio and isGoodRatio', () => {
  it.each([
    [3.123, '3.12', true],
    [0.999, '0.99', false],
    [1, '1.00', true],
    [-1, '∞', true],
    [1 - 1e-11, '1.00', true],
    [0.995, '0.99', false],
  ])('%d -> %s, good %s', (ratio, text, good) => {
    expect(formatRatio(ratio)).toBe(text)
    expect(isGoodRatio(ratio)).toBe(good)
  })
})

describe('F9 formatPercent', () => {
  it.each([
    [0.87, '87%'],
    [0.29, '29%'],
    [0.999, '99%'],
    [1, '100%'],
    [0, '0%'],
  ])('%d -> %s', (progress, expected) => {
    expect(formatPercent(progress)).toBe(expected)
  })
})

describe('F10 no value', () => {
  const formatters: Array<[string, (value: null | undefined) => string]> = [
    ['formatCount', formatCount],
    ['formatSize', formatSize],
    ['formatSpeed', formatSpeed],
    ['formatDate', (value) => formatDate(value, NOW, TAIPEI)],
    ['formatAgo', (value) => formatAgo(value, NOW)],
    ['formatDuration', formatDuration],
    ['formatRatio', formatRatio],
    ['formatPercent', formatPercent],
  ]

  it.each(formatters)('%s(null | undefined) -> 沒有', (_name, format) => {
    expect(NO_VALUE).toBe('沒有')
    expect(format(null)).toBe(NO_VALUE)
    expect(format(undefined)).toBe(NO_VALUE)
  })
})

// Spec 1.7 row H4 (FR-5): the limit text next to a global speed.
describe('H4 formatSpeedLimit', () => {
  it.each([
    [0, '不限速'],
    [-1, '不限速'],
    [undefined, '不限速'],
    [null, '不限速'],
    [Number.NaN, '不限速'],
    [34_288_435, '上限 32.7'],
    [10 * MIB, '上限 10.0'],
    [MIB, '上限 1.00'],
    [512_000, '上限 500 KB/s'],
    [2 * GIB, '上限 2.00 GB/s'],
  ] as const)('%s -> %s', (value, text) => {
    expect(formatSpeedLimit(value)).toBe(text)
  })
})

describe('formatSpeedLimitFull (spoken limit, spec 1.7)', () => {
  it.each([
    [0, '不限速'],
    [-1, '不限速'],
    [34_288_435, '上限 32.7 MB/s'],
    [512_000, '上限 500 KB/s'],
  ] as const)('%s -> %s', (value, text) => {
    expect(formatSpeedLimitFull(value)).toBe(text)
  })
})

// Spec 1.8: the day key behind the list's `today`.
describe('formatDayKey', () => {
  it('the zoned calendar day, changing at local midnight', () => {
    expect(formatDayKey(NOW, TAIPEI)).toBe('2026-11-16')
    expect(formatDayKey(Date.UTC(2026, 10, 16, 15, 59, 59), TAIPEI)).toBe(
      '2026-11-16',
    )
    expect(formatDayKey(Date.UTC(2026, 10, 16, 16, 0, 0), TAIPEI)).toBe(
      '2026-11-17',
    )
    expect(formatDayKey(NOW, 'UTC')).toBe('2026-11-16')
  })
})

// Spec 2.1: "no value" for sorting and the big number per field kind.
describe('hasNoSortValue', () => {
  it.each([
    ['completion_on', -1],
    ['completion_on', 0],
    ['seen_complete', 0],
    ['seen_complete', -1],
    ['last_activity', 0],
    ['eta', QBIT_ETA_INFINITY],
    ['eta', -1],
    ['dl_limit', -1],
    ['dl_limit', 0],
    ['up_limit', 0],
    ['ratio_limit', -1],
    ['ratio_limit', -2],
    ['seeding_time_limit', -2],
    ['inactive_seeding_time_limit', -1],
    ['availability', -1],
    ['num_complete', -1],
    ['priority', 0],
    ['category', ''],
    ['comment', ''],
    ['private', null],
    ['num_seeds', undefined],
    ['size', Number.NaN],
  ] as const)('%s %s: no value', (field, value) => {
    expect(hasNoSortValue(field, value)).toBe(true)
  })

  it.each([
    ['completion_on', 1_790_000_000],
    ['eta', 0],
    ['eta', QBIT_ETA_INFINITY - 1],
    ['dl_limit', 1],
    ['ratio_limit', 0],
    ['seeding_time_limit', 0],
    ['availability', 0],
    ['num_seeds', 0],
    ['priority', 1],
    ['seeding_time', 0],
    ['ratio', -1],
    ['ratio', 0],
    ['dlspeed', 0],
    ['private', false],
    ['has_metadata', false],
    ['name', 'x'],
  ] as const)('%s %s: a value', (field, value) => {
    expect(hasNoSortValue(field, value)).toBe(false)
  })
})

describe('formatSortValue (EXPERIENCE big-number table)', () => {
  const NOW_MS = Date.UTC(2026, 10, 16, 4, 0, 0)
  const at = (field: Parameters<typeof formatSortValue>[0], value: unknown) =>
    formatSortValue(field, value as never, NOW_MS, 'Asia/Taipei')

  it.each([
    ['seeding_time', 41 * 86_400, '41 天'],
    ['time_active', 5 * 3600, '5 小時'],
    ['eta', 12 * 60, '12 分'],
    ['seeding_time_limit', 7 * 86_400, '7 天'],
    ['added_on', Date.UTC(2026, 10, 16, 1, 12) / 1000, '今天 09:12'],
    ['last_activity', (NOW_MS - 3 * 3600_000) / 1000, '3 小時前'],
    ['seen_complete', (NOW_MS - 5 * 86_400_000) / 1000, '5 天前'],
    ['ratio', 3.129, '3.12'],
    ['ratio', -1, '∞'],
    ['availability', 1.456, '1.46'],
    ['progress', 0.879, '87%'],
    ['dlspeed', 6_510_000, '6.21 MB/s'],
    ['uploaded', 323_406_081_638, '301.2 GB'],
    ['num_seeds', 12, '12'],
    ['trackers_count', 3631, '3,631'],
    ['dl_limit', 512 * 1024, '512 KB/s'],
    ['private', true, '是'],
    ['has_metadata', false, '否'],
    ['category', 'mteam-tv', 'mteam-tv'],
    ['hash', 'abcdef0123456789', 'abcdef01'],
    ['infohash_v2', 'e'.repeat(64), 'eeeeeeee'],
  ] as const)('%s %s -> %s', (field, value, text) => {
    expect(at(field, value)).toEqual({ text, muted: false })
  })

  it('a speed of 0 is a muted 「0」', () => {
    expect(at('upspeed', 0)).toEqual({ text: '0', muted: true })
    expect(at('avg_dlspeed', 0)).toEqual({ text: '0', muted: true })
  })

  it('an unset speed limit is a muted 「不限速」', () => {
    expect(at('dl_limit', -1)).toEqual({ text: '不限速', muted: true })
    expect(at('up_limit', 0)).toEqual({ text: '不限速', muted: true })
  })

  it('last_activity 0 and seen_complete -1 are a muted 「沒有」', () => {
    expect(at('last_activity', 0)).toEqual({ text: NO_VALUE, muted: true })
    expect(at('seen_complete', -1)).toEqual({ text: NO_VALUE, muted: true })
  })

  it('no value is a muted 「沒有」', () => {
    expect(at('completion_on', -1)).toEqual({ text: NO_VALUE, muted: true })
    expect(at('ratio_limit', -2)).toEqual({ text: NO_VALUE, muted: true })
    expect(at('comment', '')).toEqual({ text: NO_VALUE, muted: true })
    expect(at('num_seeds', null)).toEqual({ text: NO_VALUE, muted: true })
  })
})

describe('qBittorrent special values for sorting', () => {
  it('ratio -1 sorts as the largest', () => {
    expect(sortableRatio(-1)).toBe(Infinity)
    expect(sortableRatio(2.5)).toBe(2.5)
  })

  it('seeding limits: minutes to seconds, -1 and -2 kept', () => {
    expect(seedingLimitSeconds(60)).toBe(3600)
    expect(seedingLimitSeconds(-1)).toBe(-1)
    expect(seedingLimitSeconds(-2)).toBe(-2)
    expect(seedingLimitSeconds(null)).toBeNull()
  })
})
