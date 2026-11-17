import { describe, expect, it } from 'vitest'
import { t } from '#/lib/testing'
import {
  infoRows,
  positionText,
  statTiles,
} from '#/features/detail/detail-model'

// Spec 2.4 rows D7, D8, D15.

const NOW = Date.UTC(2026, 10, 16, 4, 0, 0)

describe('positionText (D7, D8)', () => {
  it('list mode: 第 N 個／共 M 個', () => {
    expect(positionText({ index: 3, total: 19 })).toBe('第 4 個／共 19 個')
  })

  it('board: the column name and a full-width space first', () => {
    expect(positionText({ index: 2, total: 80 }, '做種中')).toBe(
      '做種中　第 3 個／共 80 個',
    )
  })

  it('big numbers are grouped', () => {
    expect(positionText({ index: 999, total: 4165 })).toBe(
      '第 1,000 個／共 4,165 個',
    )
  })
})

describe('infoRows (D15)', () => {
  it('分類, 大小, 加入時間, 完成時間, 已下載, 已上傳 in order, through format.ts', () => {
    const rows = infoRows(
      t({
        category: 'mteam-tv',
        size: 61.3 * 1024 ** 3,
        added_on: Date.UTC(2026, 1, 19, 4, 0, 0) / 1000,
        completion_on: Date.UTC(2026, 1, 20, 4, 0, 0) / 1000,
      }),
      NOW,
      {
        downloaded: 61.3 * 1024 ** 3,
        uploaded: 1.5 * 1024 ** 4,
        num_seeds: 3,
        num_leechs: 1,
      },
    )
    expect(rows).toEqual([
      { label: '分類', value: 'mteam-tv', muted: false },
      { label: '大小', value: '61.3 GB', muted: false },
      { label: '加入時間', value: '02/19', muted: false },
      { label: '完成時間', value: '02/20', muted: false },
      { label: '已下載', value: '61.3 GB', muted: false },
      { label: '已上傳', value: '1.5 TB', muted: false },
    ])
  })

  it('已下載 and 已上傳: 「…」 before the first answer, 「沒有」 when unknown, both muted', () => {
    const loading = infoRows(t(), NOW, undefined)
    expect(loading[4]).toEqual({ label: '已下載', value: '…', muted: true })
    expect(loading[5]).toEqual({ label: '已上傳', value: '…', muted: true })
    const gone = infoRows(t(), NOW, null)
    expect(gone[4]).toEqual({ label: '已下載', value: '沒有', muted: true })
    const unsaid = infoRows(t(), NOW, {
      downloaded: 0,
      uploaded: null,
      num_seeds: null,
      num_leechs: null,
    })
    expect(unsaid[4]).toEqual({ label: '已下載', value: '0 B', muted: false })
    expect(unsaid[5]).toEqual({ label: '已上傳', value: '沒有', muted: true })
  })

  it('no category and not completed: 「沒有」, muted', () => {
    const rows = infoRows(t({ category: '', completion_on: -1 }), NOW, null)
    expect(rows[0]).toEqual({ label: '分類', value: '沒有', muted: true })
    expect(rows[3]).toEqual({ label: '完成時間', value: '沒有', muted: true })
  })

  it('a category is plain text', () => {
    expect(infoRows(t({ category: '<b>x</b>' }), NOW, null)[0].value).toBe(
      '<b>x</b>',
    )
  })
})

// Spec 2.5 rows T1, T2.
describe('statTiles (T1, T2)', () => {
  const MIB = 1024 ** 2
  const CLOCK = { today: NOW, now: NOW }
  const DETAIL = {
    downloaded: 0,
    uploaded: 0,
    num_seeds: 12,
    num_leechs: 3,
  }
  const text = (tiles: ReturnType<typeof statTiles>) =>
    tiles.map((tile) => [tile.title, tile.value, tile.muted])

  it.each(['downloading', 'paused', 'stalled'] as const)(
    'T1 %s: 下載速度, 剩餘時間, 來源數',
    (status) => {
      const torrent = t({ dlspeed: 6.21 * MIB, eta: 34 * 60 })
      expect(text(statTiles(torrent, status, CLOCK, DETAIL))).toEqual([
        ['下載速度', '6.21 MB/s', false],
        ['剩餘時間', '34 分', false],
        ['來源數', '12', false],
      ])
    },
  )

  it.each(['seeding', 'done'] as const)(
    'T1 %s: 現在上傳, 在抓的人, 最後有人抓',
    (status) => {
      const torrent = t({
        progress: 1,
        upspeed: 2.38 * MIB,
        last_activity: NOW / 1000 - 3 * 86_400,
      })
      expect(text(statTiles(torrent, status, CLOCK, DETAIL))).toEqual([
        ['現在上傳', '2.38 MB/s', false],
        ['在抓的人', '3', false],
        ['最後有人抓', '3 天前', false],
      ])
    },
  )

  it.each(['error', 'archived'] as const)(
    'T1 %s: 大小, 完成時間, 分享率',
    (status) => {
      const torrent = t({
        completion_on: Date.UTC(2026, 1, 20, 4, 0, 0) / 1000,
        ratio: 3.12,
      })
      expect(text(statTiles(torrent, status, CLOCK, DETAIL))).toEqual([
        ['大小', '85 GB', false],
        ['完成時間', '02/20', false],
        ['分享率', '3.12', false],
      ])
    },
  )

  it('最後有人抓 reads the minute clock `now`, not the day clock `today`', () => {
    const clock = { today: Date.UTC(2026, 10, 16, 0, 0, 0), now: NOW }
    const torrent = t({ progress: 1, last_activity: NOW / 1000 - 3 * 3600 })
    expect(statTiles(torrent, 'seeding', clock, DETAIL)[2].value).toBe(
      '3 小時前',
    )
  })

  it('T2 no values: 「0 KB/s」, 「不明」, 「沒人抓過」, 「沒有」', () => {
    const none = { ...DETAIL, num_seeds: -1, num_leechs: null }
    expect(text(statTiles(t(), 'downloading', CLOCK, none))).toEqual([
      ['下載速度', '0 KB/s', false],
      ['剩餘時間', '不明', true],
      ['來源數', '沒有', true],
    ])
    expect(
      text(statTiles(t({ last_activity: 0 }), 'seeding', CLOCK, none)),
    ).toEqual([
      ['現在上傳', '0 KB/s', false],
      ['在抓的人', '沒有', true],
      ['最後有人抓', '沒人抓過', true],
    ])
    expect(
      statTiles(t({ last_activity: -1 }), 'done', CLOCK, none)[2].value,
    ).toBe('沒人抓過')
    expect(text(statTiles(t(), 'archived', CLOCK, none))[1]).toEqual([
      '完成時間',
      '沒有',
      true,
    ])
  })

  it('T2 the counts before the first answer 「…」 muted; detail null 「沒有」', () => {
    expect(statTiles(t(), 'stalled', CLOCK, undefined)[2]).toEqual({
      title: '來源數',
      value: '…',
      muted: true,
    })
    expect(statTiles(t(), 'seeding', CLOCK, undefined)[1].value).toBe('…')
    expect(statTiles(t(), 'seeding', CLOCK, null)[1].value).toBe('沒有')
  })
})
