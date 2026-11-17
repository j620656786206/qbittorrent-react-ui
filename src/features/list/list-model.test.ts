import { describe, expect, it } from 'vitest'
import { AppError } from '#/lib/app-error'
import { formatSize } from '#/lib/format'
import { mergeMaindata } from '#/lib/maindata-merge'
import { fakeHash, fakeResponse, t } from '#/lib/testing'
import { countAll, selectVisibleTorrents } from '#/lib/visible-torrents'
import type { SlimTorrent } from '#/shared/maindata'
import { ringCircumference, ringOffset } from '#/shared/ui/status-circle'
import {
  listView,
  rowClock,
  rowModel,
  rowProps,
} from '#/features/list/list-model'

const ADDED_NEWEST = { sort: 'added_on', dir: 'desc' } as const
// Spec 1.8 rows R1 to R6, C1 to C3, V1 to V4 and M1. Clock: 2026-11-16
// 12:00 in Asia/Taipei, passed explicitly. C = 2 x pi x 16.5.

const NOW = Date.UTC(2026, 10, 16, 4, 0, 0)
const ZONE = 'Asia/Taipei'
const OPTIONS = { now: NOW, timeZone: ZONE, stateBeforeMove: {} }
/** Unix seconds of a Taipei wall-clock time. */
const taipei = (y: number, m: number, d: number, h = 0, min = 0) =>
  Date.UTC(y, m - 1, d, h - 8, min) / 1000
const C = 2 * Math.PI * 16.5

const model = (overrides: Partial<SlimTorrent>) =>
  rowModel(t(overrides), OPTIONS)

describe('R1 seeding row', () => {
  const row = model({
    state: 'uploading',
    progress: 1,
    ratio: 3.12,
    upspeed: 2_495_611,
    size: 182.7e9,
    save_path: '/data/torrent/mteam-seed',
    added_on: taipei(2026, 11, 16, 9, 12),
  })

  it('tag, size, upload speed, good ratio, today', () => {
    expect(row.tag).toBe('torrent/mteam-seed')
    expect(row.size).toBe(formatSize(182.7e9))
    expect(row.size).toBe('170.2 GB')
    expect(row.speed).toEqual({ direction: 'up', text: '2.38 MB/s' })
    expect(row.ratio).toEqual({ text: '3.12', good: true })
    expect(row.value.text).toBe('今天 09:12')
    expect(row.errorDetail).toBeNull()
    expect(row.movingDetail).toBeNull()
  })
})

describe('R2 downloading row', () => {
  it('under 100% shows the download speed', () => {
    const row = model({ progress: 0.87, dlspeed: 6_510_000, upspeed: 30_000 })
    expect(row.speed).toEqual({ direction: 'down', text: '6.21 MB/s' })
  })
})

describe('R3 zero speed', () => {
  it.each([
    [0.5, { dlspeed: 0, upspeed: 30_000 }],
    [1, { dlspeed: 30_000, upspeed: 0 }],
  ])('progress %d: no speed item', (progress, speeds) => {
    expect(model({ progress, ...speeds }).speed).toBeNull()
  })
})

describe('R4 ratio', () => {
  it.each([
    [0.88, '0.88', false],
    [1.0, '1.00', true],
    [-1, '∞', true],
  ])('%d -> %s', (ratio, text, good) => {
    expect(model({ ratio }).ratio).toEqual({ text, good })
  })
})

describe('R5 dates', () => {
  it.each([
    [taipei(2026, 11, 15, 21, 40), '昨天 21:40'],
    [taipei(2026, 11, 5, 10), '11/05'],
    [taipei(2025, 7, 18, 10), '2025/07/18'],
  ])('%d -> %s', (added_on, value) => {
    expect(model({ added_on }).value.text).toBe(value)
  })
})

describe('R6 error rows', () => {
  it.each([
    [{ state: 'error' }, 'qBittorrent 回報錯誤'],
    [{ state: 'missingFiles', private: true }, '找不到檔案，做不了種'],
  ])('%o -> %s', (overrides, detail) => {
    const row = model(overrides)
    expect(row.circle.status).toBe('error')
    expect(row.errorDetail).toBe(detail)
  })

  it('a non-error row has none', () => {
    expect(model({ state: 'stalledDL' }).errorDetail).toBeNull()
  })

  it('story 2.10 an error row says its reason when it has one', () => {
    const row = rowModel(t({ state: 'error' }), {
      ...OPTIONS,
      errorReason: '找不到檔案或資料夾',
    })
    expect(row.errorDetail).toBe('找不到檔案或資料夾')
  })

  it("story 2.10 rowProps passes only this torrent's reason", () => {
    const data = mergeMaindata(
      undefined,
      fakeResponse({
        changed: [
          t({ hash: fakeHash(1), state: 'error' }),
          t({ hash: fakeHash(2), state: 'error' }),
        ],
      }),
    )
    const reasons = { [fakeHash(1)]: '磁碟空間不足' }
    const args = [NOW, 'added_on', undefined, false, reasons] as const
    expect(rowProps(data, fakeHash(1), ...args)?.errorReason).toBe(
      '磁碟空間不足',
    )
    expect(rowProps(data, fakeHash(2), ...args)?.errorReason).toBeUndefined()
    expect(rowProps(data, fakeHash(1), NOW)?.errorReason).toBeUndefined()
  })

  it('a move from an error kind says 搬移中 once, no reason', () => {
    const torrent = t({ hash: fakeHash(8), state: 'moving', private: true })
    const row = rowModel(torrent, {
      ...OPTIONS,
      stateBeforeMove: { [fakeHash(8)]: 'missingFiles' },
    })
    expect(row.circle.status).toBe('error')
    expect(row.movingDetail).toBe('搬移中')
    expect(row.errorDetail).toBeNull()
  })

  it('a moving row says 搬移中 and keeps its status', () => {
    const torrent = t({ hash: fakeHash(7), state: 'moving', progress: 1 })
    const row = rowModel(torrent, {
      ...OPTIONS,
      stateBeforeMove: { [fakeHash(7)]: 'uploading' },
    })
    expect(row.circle.status).toBe('seeding')
    expect(row.movingDetail).toBe('搬移中')
    expect(row.errorDetail).toBeNull()
  })
})

describe('C1 ring', () => {
  it.each([
    ['downloading', 0.87, 0.13, '下載中，87%'],
    ['pausedDL', 0.45, 0.55, '已暫停，45%'],
    ['stalledDL', 0.87, 0.13, '停滯，87%'],
  ])('%s %d: offset C x %d', (state, progress, rest, label) => {
    const { circle } = model({ state, progress })
    expect(circle.label).toBe(label)
    expect(circle.arcFraction).toBe(progress)
    expect(ringOffset(circle.arcFraction ?? -1)).toBeCloseTo(C * rest, 9)
  })

  it('the circumference is 2 x pi x 16.5', () => {
    expect(ringCircumference()).toBeCloseTo(C, 12)
  })
})

describe('C2 full ring', () => {
  it.each([
    [{ state: 'uploading', progress: 1 }, 'seeding', '做種中'],
    [{ state: 'stoppedUP', progress: 1 }, 'done', '已完成'],
    [{ state: 'error' }, 'error', '錯誤'],
  ])('%o: no arc, %s', (overrides, status, label) => {
    expect(model(overrides).circle).toEqual({
      status,
      label,
      arcFraction: null,
    })
  })
})

describe('C3 ring edges', () => {
  it('progress 0: fraction 0 (no arc drawn), 0%', () => {
    const { circle } = model({ progress: 0 })
    expect(circle).toEqual({
      status: 'downloading',
      label: '下載中，0%',
      arcFraction: 0,
    })
  })

  it('progress 0.999: 99%', () => {
    expect(model({ progress: 0.999 }).circle.label).toBe('下載中，99%')
  })
})

describe('V1 to V4 listView', () => {
  it('V1: no data, pending or an alert code -> skeleton', () => {
    expect(listView({ hasData: false, visibleCount: 0, error: null })).toBe(
      'skeleton',
    )
    for (const code of [
      'home_unreachable',
      'qbit_unreachable',
      'timeout',
      'cloudflare_expired',
      'not_logged_in',
    ] as const) {
      expect(
        listView({
          hasData: false,
          visibleCount: 0,
          error: new AppError(code),
        }),
      ).toBe('skeleton')
    }
  })

  it.each(['qbit_rejected', 'bad_origin', 'invalid_input'] as const)(
    'V2: no data and %s -> error',
    (code) => {
      expect(
        listView({
          hasData: false,
          visibleCount: 0,
          error: new AppError(code),
        }),
      ).toBe('error')
    },
  )

  it('V3: no torrents, or only archived ones -> empty, 全部 0', () => {
    const none = mergeMaindata(undefined, fakeResponse({ changed: [] }))
    const archived = mergeMaindata(
      undefined,
      fakeResponse({
        changed: [
          t({ hash: fakeHash(1), state: 'missingFiles', private: false }),
          t({ hash: fakeHash(2), state: 'missingFiles', private: null }),
        ],
      }),
    )
    for (const data of [none, archived]) {
      const visible = selectVisibleTorrents(data, ADDED_NEWEST)
      expect(
        listView({ hasData: true, visibleCount: visible.length, error: null }),
      ).toBe('empty')
      expect(countAll(data)).toBe(0)
    }
  })

  it('V4: data -> rows, and a later failed poll keeps them', () => {
    expect(listView({ hasData: true, visibleCount: 3, error: null })).toBe(
      'rows',
    )
    expect(
      listView({
        hasData: true,
        visibleCount: 3,
        error: new AppError('qbit_rejected'),
      }),
    ).toBe('rows')
  })
})

describe('M1 memo', () => {
  it('unchanged rows get shallow-equal props after a merge; the changed row differs', () => {
    const today = NOW
    const first = mergeMaindata(
      undefined,
      fakeResponse({
        version: 'abcdef12.1',
        changed: [
          t({ hash: fakeHash(1), dlspeed: 100 }),
          t({ hash: fakeHash(2), dlspeed: 200 }),
        ],
      }),
    )
    const second = mergeMaindata(
      first,
      fakeResponse({
        version: 'abcdef12.2',
        full: false,
        changed: [t({ hash: fakeHash(2), dlspeed: 999 })],
      }),
    )
    const shallowEqual = (a: object | null, b: object | null) =>
      a !== null &&
      b !== null &&
      Object.keys(a).length === Object.keys(b).length &&
      Object.entries(a).every(
        ([key, value]) => (b as Record<string, unknown>)[key] === value,
      )
    expect(
      shallowEqual(
        rowProps(first, fakeHash(1), today),
        rowProps(second, fakeHash(1), today),
      ),
    ).toBe(true)
    expect(
      shallowEqual(
        rowProps(first, fakeHash(2), today),
        rowProps(second, fakeHash(2), today),
      ),
    ).toBe(false)
  })

  it('a hash without data has no props', () => {
    const data = mergeMaindata(undefined, fakeResponse())
    expect(rowProps(data, fakeHash(9), NOW)).toBeNull()
  })
})

// Spec 2.1: the big number follows the sort (EXPERIENCE big-number table).
describe('the big number by sort', () => {
  const big = (
    sort: Parameters<typeof rowModel>[1]['sort'],
    overrides: Partial<SlimTorrent> = {},
    sortValue?: Parameters<typeof rowModel>[1]['sortValue'],
  ) => rowModel(t(overrides), { ...OPTIONS, sort, sortValue }).value

  it('seeding time in days, a number', () => {
    expect(big('seeding_time', { seeding_time: 41 * 86_400 })).toEqual({
      label: '做種時間',
      text: '41 天',
      style: 'number',
      muted: false,
      loading: false,
    })
  })

  it('completion: a date, or a muted 沒有', () => {
    expect(big('completion_on', { completion_on: -1 })).toMatchObject({
      text: '沒有',
      muted: true,
    })
  })

  it('ratio: the value, and the ratio column hides', () => {
    const byRatio = rowModel(t({ ratio: 3.129 }), {
      ...OPTIONS,
      sort: 'ratio',
    })
    expect(byRatio.value.text).toBe('3.12')
    expect(byRatio.value.good).toBe(true)
    expect(byRatio.showRatio).toBe(false)
    expect(big('ratio', { ratio: 0.5 }).good).toBe(false)
    expect(rowModel(t(), OPTIONS).showRatio).toBe(true)
  })

  it('a speed of 0 is a muted 0', () => {
    expect(big('dlspeed', { dlspeed: 0 })).toMatchObject({
      text: '0',
      style: 'number',
      muted: true,
    })
  })

  it('name: the progress where the row draws one, else the status word (13px)', () => {
    expect(big('name', { state: 'downloading', progress: 0.87 })).toMatchObject(
      { text: '87%', style: 'number' },
    )
    expect(big('name', { state: 'uploading', progress: 1 })).toMatchObject({
      text: '做種中',
      style: 'text',
      muted: true,
    })
  })

  it('rowClock: the minute tick only for a how-long-ago sort', () => {
    expect(rowClock('last_activity', 1, 2)).toBe(2)
    expect(rowClock('seen_complete', 1, 2)).toBe(2)
    expect(rowClock('added_on', 1, 2)).toBe(1)
  })

  it('save path: the location label as text', () => {
    expect(big('save_path', { save_path: '/data/media/tv/' })).toMatchObject({
      text: 'media/tv',
      style: 'text',
      muted: true,
      title: '/data/media/tv/',
    })
  })

  it('category and hash: text styles; hash first 8', () => {
    expect(big('category', { category: 'mteam-tv' })).toMatchObject({
      text: 'mteam-tv',
      style: 'text',
    })
    expect(big('hash', { hash: fakeHash('ab') })).toMatchObject({
      text: 'abababab',
      style: 'hash',
      muted: true,
    })
  })

  it('extra sorts: the key, a path cut from the front, a skeleton while loading', () => {
    expect(big('num_seeds', {}, 12)).toMatchObject({ text: '12' })
    expect(big('content_path', {}, '/data/media/tv/Show')).toMatchObject({
      text: '/data/media/tv/Show',
      style: 'path',
    })
    expect(big('dl_limit', {}, -1)).toMatchObject({
      text: '不限速',
      muted: true,
    })
    expect(big('num_seeds', {}, null)).toMatchObject({
      text: '沒有',
      muted: true,
    })
    expect(big('num_seeds')).toMatchObject({ loading: true })
  })

  it('rowProps passes only an extra sort key; a hash the keys lack is still loading', () => {
    const data = mergeMaindata(
      undefined,
      fakeResponse({ changed: [t({ hash: fakeHash(1) })] }),
    )
    expect(rowProps(data, fakeHash(1), NOW, 'seeding_time')?.sortValue).toBe(
      undefined,
    )
    expect(rowProps(data, fakeHash(1), NOW, 'num_seeds')?.sortValue).toBe(
      undefined,
    )
    expect(
      rowProps(data, fakeHash(1), NOW, 'num_seeds', { [fakeHash(1)]: 4 })
        ?.sortValue,
    ).toBe(4)
    expect(
      rowProps(data, fakeHash(1), NOW, 'num_seeds', { [fakeHash(1)]: null })
        ?.sortValue,
    ).toBeNull()
    // Added since the last sort-keys poll: loading, not 「沒有」.
    expect(
      rowProps(data, fakeHash(1), NOW, 'num_seeds', {})?.sortValue,
    ).toBeUndefined()
    // The first keys failed: no value.
    expect(
      rowProps(data, fakeHash(1), NOW, 'num_seeds', undefined, true)?.sortValue,
    ).toBeNull()
  })
})
