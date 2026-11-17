import { describe, expect, it } from 'vitest'
import { t } from '#/lib/testing'
import { infoRows, positionText } from '#/features/detail/detail-model'

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
      { downloaded: 61.3 * 1024 ** 3, uploaded: 1.5 * 1024 ** 4 },
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
    const unsaid = infoRows(t(), NOW, { downloaded: 0, uploaded: null })
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
