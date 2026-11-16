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
  it('分類, 大小, 加入時間, 完成時間 in order, through format.ts', () => {
    const rows = infoRows(
      t({
        category: 'mteam-tv',
        size: 61.3 * 1024 ** 3,
        added_on: Date.UTC(2026, 1, 19, 4, 0, 0) / 1000,
        completion_on: Date.UTC(2026, 1, 20, 4, 0, 0) / 1000,
      }),
      NOW,
    )
    expect(rows).toEqual([
      { label: '分類', value: 'mteam-tv', muted: false },
      { label: '大小', value: '61.3 GB', muted: false },
      { label: '加入時間', value: '02/19', muted: false },
      { label: '完成時間', value: '02/20', muted: false },
    ])
  })

  it('no category and not completed: 「沒有」, muted', () => {
    const rows = infoRows(t({ category: '', completion_on: -1 }), NOW)
    expect(rows[0]).toEqual({ label: '分類', value: '沒有', muted: true })
    expect(rows[3]).toEqual({ label: '完成時間', value: '沒有', muted: true })
  })

  it('a category is plain text', () => {
    expect(infoRows(t({ category: '<b>x</b>' }), NOW)[0].value).toBe('<b>x</b>')
  })
})
