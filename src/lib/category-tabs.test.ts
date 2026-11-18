import { describe, expect, it } from 'vitest'
import {
  categoryLabel,
  categoryTabs,
  isTabCategory,
  resolveCategory,
  selectCategoryCounts,
} from '#/lib/category-tabs'
import type { CategoryCount, CategoryCounts } from '#/lib/category-tabs'
import { mergeMaindata } from '#/lib/maindata-merge'
import { fakeHash, fakeResponse, t } from '#/lib/testing'
import { ALL } from '#/shared/categories'

// Story 3.2: tab counts (archived left out), tab order and visibility, and
// which category the screen shows for the URL. Fake data only.

const archived = { state: 'missingFiles', private: false } as const

function data(torrents: Array<ReturnType<typeof t>>) {
  return mergeMaindata(undefined, fakeResponse({ changed: torrents }))
}

describe('selectCategoryCounts', () => {
  it('counts per category without archived; uncategorized is its own key', () => {
    const counts = selectCategoryCounts(
      data([
        t({ hash: fakeHash(1), category: 'mteam-X' }),
        t({ hash: fakeHash(2), category: 'mteam-X' }),
        t({ hash: fakeHash(3), category: 'mteam-X', ...archived }),
        t({ hash: fakeHash(4), category: '' }),
        t({ hash: fakeHash(5), category: 'X' }),
      ]),
    )
    expect(counts).toEqual({
      all: 4,
      categories: [
        { key: '', count: 1 },
        { key: 'X', count: 1 },
        { key: 'mteam-X', count: 2 },
      ],
    })
  })

  it('a category with only archived torrents is present with 0', () => {
    const counts = selectCategoryCounts(
      data([
        t({ hash: fakeHash(1), category: 'mteam-tv', ...archived }),
        t({ hash: fakeHash(2), category: 'mteam-tv', ...archived }),
        t({ hash: fakeHash(3), category: 'X' }),
      ]),
    )
    expect(counts).toEqual({
      all: 1,
      categories: [
        { key: 'X', count: 1 },
        { key: 'mteam-tv', count: 0 },
      ],
    })
  })

  it('no torrent: no category', () => {
    expect(selectCategoryCounts(data([]))).toEqual({ all: 0, categories: [] })
  })

  it('keys the URL cannot carry get no tab; their torrents count in 「全部」', () => {
    const counts = selectCategoryCounts(
      data([
        t({ hash: fakeHash(1), category: '__proto__' }),
        t({ hash: fakeHash(2), category: ALL }),
        t({ hash: fakeHash(3), category: 'x'.repeat(256) }),
        t({ hash: fakeHash(4), category: 'bad\u0007name' }),
        t({ hash: fakeHash(5), category: 'X' }),
      ]),
    )
    expect(counts).toEqual({ all: 5, categories: [{ key: 'X', count: 1 }] })
  })
})

describe('isTabCategory', () => {
  it('uncategorized and names the URL schema accepts', () => {
    expect(isTabCategory('')).toBe(true)
    expect(isTabCategory('mteam-X')).toBe(true)
    expect(isTabCategory('x'.repeat(255))).toBe(true)
    expect(isTabCategory('x'.repeat(256))).toBe(false)
    expect(isTabCategory(ALL)).toBe(false)
    expect(isTabCategory('__proto__')).toBe(false)
    expect(isTabCategory('a\nb')).toBe(false)
  })
})

describe('categoryLabel', () => {
  it('「全部」, 「未分類」 and names as they are', () => {
    expect(categoryLabel(ALL)).toBe('全部')
    expect(categoryLabel('')).toBe('未分類')
    expect(categoryLabel('<script>alert(1)</script>')).toBe(
      '<script>alert(1)</script>',
    )
  })
})

const count = (key: string, n: number): CategoryCount => ({ key, count: n })
/** Counts whose 「全部」 is the sum (no torrent outside a tab). */
const of = (...categories: Array<CategoryCount>): CategoryCounts => ({
  all: categories.reduce((sum, entry) => sum + entry.count, 0),
  categories,
})

describe('categoryTabs', () => {
  it('「全部」 first with every count added, then categoryOrder, then by name', () => {
    const tabs = categoryTabs({
      counts: of(count('a', 1), count('b', 2), count('c', 3)),
      categoryOrder: ['b'],
      selected: ALL,
    })
    expect(tabs.map((tab) => tab.key)).toEqual([ALL, 'b', 'a', 'c'])
    expect(tabs[0]).toEqual({ key: ALL, label: '全部', count: 6 })
  })

  it('names outside the order sort in zh-Hant by the name shown (未分類 for uncategorized)', () => {
    const tabs = categoryTabs({
      counts: of(
        count('mteam-tv', 1),
        count('', 1),
        count('X', 1),
        count('mteam-X', 1),
      ),
      categoryOrder: [],
      selected: ALL,
    })
    const expected = ['mteam-tv', '未分類', 'X', 'mteam-X'].sort((a, b) =>
      a.localeCompare(b, 'zh-Hant'),
    )
    expect(tabs.slice(1).map((tab) => tab.label)).toEqual(expected)
  })

  it('「未分類」 is placed by its name, not first for its empty key', () => {
    const tabs = categoryTabs({
      counts: of(count('', 1), count('一般', 1), count('黃金', 1)),
      categoryOrder: [],
      selected: ALL,
    })
    // zh-Hant puts 一 (1 stroke) before 未 (5) before 黃 (12).
    expect(tabs.map((tab) => tab.label)).toEqual([
      '全部',
      '一般',
      '未分類',
      '黃金',
    ])
  })

  it('「全部」 counts torrents outside any tab too', () => {
    const tabs = categoryTabs({
      counts: { all: 9, categories: [count('a', 2)] },
      categoryOrder: [],
      selected: ALL,
    })
    expect(tabs[0].count).toBe(9)
  })

  it('order entries without torrents and duplicates are skipped', () => {
    const tabs = categoryTabs({
      counts: of(count('a', 1), count('c', 1)),
      categoryOrder: ['gone', 'c', 'c', ''],
      selected: ALL,
    })
    expect(tabs.map((tab) => tab.key)).toEqual([ALL, 'c', 'a'])
  })

  it('a category with no torrent has no tab; only archived keeps it with 0', () => {
    const tabs = categoryTabs({
      counts: of(count('only-archived', 0), count('a', 2)),
      categoryOrder: [],
      selected: ALL,
    })
    expect(tabs).toEqual([
      { key: ALL, label: '全部', count: 2 },
      { key: 'a', label: 'a', count: 2 },
      { key: 'only-archived', label: 'only-archived', count: 0 },
    ])
  })

  it('the selected category keeps its tab with 0 after its last torrent went', () => {
    const selectedGone = categoryTabs({
      counts: of(count('a', 2)),
      categoryOrder: ['b'],
      selected: 'b',
    })
    expect(selectedGone.map((tab) => [tab.key, tab.count])).toEqual([
      [ALL, 2],
      ['b', 0],
      ['a', 2],
    ])
    // Once Alex leaves it, it has no tab.
    const left = categoryTabs({
      counts: of(count('a', 2)),
      categoryOrder: ['b'],
      selected: ALL,
    })
    expect(left.map((tab) => tab.key)).toEqual([ALL, 'a'])
  })
})

describe('resolveCategory', () => {
  const counts = of(count('mteam-X', 3), count('', 1))

  it('before maindata answers, the URL stays', () => {
    expect(
      resolveCategory({
        requested: 'nope',
        counts: undefined,
        confirmed: null,
      }),
    ).toEqual({ category: 'nope', invalid: false, confirmed: null })
  })

  it('「全部」 and a present category show and are confirmed', () => {
    expect(
      resolveCategory({ requested: ALL, counts, confirmed: 'mteam-X' }),
    ).toEqual({ category: ALL, invalid: false, confirmed: ALL })
    expect(resolveCategory({ requested: '', counts, confirmed: null })).toEqual(
      { category: '', invalid: false, confirmed: '' },
    )
  })

  it('a category no torrent has falls back to 「全部」, URL to fix', () => {
    expect(
      resolveCategory({ requested: 'nope', counts, confirmed: null }),
    ).toEqual({ category: ALL, invalid: true, confirmed: null })
  })

  it('the confirmed category emptied while selected stays', () => {
    expect(
      resolveCategory({
        requested: 'gone',
        counts,
        confirmed: 'gone',
      }),
    ).toEqual({ category: 'gone', invalid: false, confirmed: 'gone' })
  })

  it('a reload on a vanished category (nothing confirmed) falls back', () => {
    expect(
      resolveCategory({ requested: 'gone', counts, confirmed: 'mteam-X' }),
    ).toEqual({ category: ALL, invalid: true, confirmed: null })
  })
})
