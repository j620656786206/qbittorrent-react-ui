import { describe, expect, it } from 'vitest'
import { categoryOrderRows, orderAfterMove } from '#/lib/category-order'
import { selectCategoryCounts } from '#/lib/category-tabs'
import { mergeMaindata } from '#/lib/maindata-merge'
import { fakeHash, fakeResponse, t } from '#/lib/testing'
import { ALL } from '#/shared/categories'

// Story 3.3: the settings page's category list (every qBittorrent category,
// those torrents use, uncategorized when used, order like the tabs) and a
// move of one row. Code-name categories only.

const map = (...names: Array<string>) =>
  Object.fromEntries(names.map((name) => [name, { name, savePath: '/data' }]))

function countsOf(categories: Array<string>) {
  return selectCategoryCounts(
    mergeMaindata(
      undefined,
      fakeResponse({
        changed: categories.map((category, i) =>
          t({ hash: fakeHash(i + 1), category }),
        ),
      }),
    ),
  )
}

const keys = (rows: Array<{ key: string }>) => rows.map((row) => row.key)

describe('categoryOrderRows', () => {
  it('categoryOrder first, then the rest by name; a category without torrents is listed', () => {
    // Matrix "List order": categoryOrder ['b'], categories a, b, c, d (d
    // has no torrents) gives b, a, c, d.
    const rows = categoryOrderRows({
      categories: map('a', 'b', 'c', 'd'),
      counts: countsOf(['a', 'b', 'c']),
      categoryOrder: ['b'],
    })
    expect(keys(rows)).toEqual(['b', 'a', 'c', 'd'])
    expect(rows[0]).toEqual({ key: 'b', label: 'b' })
  })

  it('a category a torrent uses but the map lacks is listed too', () => {
    const rows = categoryOrderRows({
      categories: map('a'),
      counts: countsOf(['a', 'mteam-X']),
      categoryOrder: [],
    })
    expect(keys(rows)).toEqual(['a', 'mteam-X'])
  })

  it('uncategorized only when some torrent is uncategorized, labelled 未分類', () => {
    expect(
      keys(
        categoryOrderRows({
          categories: map('X'),
          counts: countsOf(['X']),
          categoryOrder: [],
        }),
      ),
    ).toEqual(['X'])
    const rows = categoryOrderRows({
      categories: map('X'),
      counts: countsOf(['X', '']),
      categoryOrder: [],
    })
    expect(rows).toContainEqual({ key: '', label: '未分類' })
  })

  it('an uncategorized torrent that is archived still lists 未分類', () => {
    const counts = selectCategoryCounts(
      mergeMaindata(
        undefined,
        fakeResponse({
          changed: [
            t({
              hash: fakeHash(1),
              category: '',
              state: 'missingFiles',
              private: false,
            }),
          ],
        }),
      ),
    )
    expect(
      keys(categoryOrderRows({ categories: {}, counts, categoryOrder: [] })),
    ).toEqual([''])
  })

  it('names the URL cannot carry are left out; ALL is never a row', () => {
    const rows = categoryOrderRows({
      categories: map('ok', ALL, '__proto__', 'bad\u0007', 'x'.repeat(256)),
      counts: countsOf(['ok']),
      categoryOrder: [ALL, 'ok'],
    })
    expect(keys(rows)).toEqual(['ok'])
  })

  it('order entries no longer present are skipped; duplicates count once', () => {
    const rows = categoryOrderRows({
      categories: map('a', 'b'),
      counts: countsOf([]),
      categoryOrder: ['gone', 'b', 'b', 'a'],
    })
    expect(keys(rows)).toEqual(['b', 'a'])
  })

  it('names are plain text', () => {
    const rows = categoryOrderRows({
      categories: map('<script>'),
      counts: countsOf([]),
      categoryOrder: [],
    })
    expect(rows).toEqual([{ key: '<script>', label: '<script>' }])
  })

  it('no categories: an empty list', () => {
    expect(
      categoryOrderRows({
        categories: {},
        counts: countsOf([]),
        categoryOrder: [],
      }),
    ).toEqual([])
  })
})

describe('orderAfterMove', () => {
  const listed = ['b', 'a', 'c', 'd']

  it('up swaps with the listed row above (matrix "Move up")', () => {
    expect(
      orderAfterMove({ stored: ['b'], listed, key: 'c', delta: -1 }),
    ).toEqual(['b', 'c', 'a', 'd'])
  })

  it('down swaps with the listed row below', () => {
    expect(
      orderAfterMove({ stored: ['b'], listed, key: 'b', delta: 1 }),
    ).toEqual(['a', 'b', 'c', 'd'])
  })

  it('the first row cannot go up, the last cannot go down, an unlisted key cannot move', () => {
    expect(orderAfterMove({ stored: [], listed, key: 'b', delta: -1 })).toBe(
      null,
    )
    expect(orderAfterMove({ stored: [], listed, key: 'd', delta: 1 })).toBe(
      null,
    )
    expect(orderAfterMove({ stored: [], listed, key: 'z', delta: 1 })).toBe(
      null,
    )
  })

  it('saved entries not listed now keep their place', () => {
    // 未分類 ('') and a category briefly missing are saved but not listed.
    expect(
      orderAfterMove({
        stored: ['b', '', 'gone', 'a'],
        listed: ['b', 'a', 'c'],
        key: 'c',
        delta: -1,
      }),
    ).toEqual(['b', '', 'gone', 'c', 'a'])
    expect(
      orderAfterMove({
        stored: ['b', '', 'a'],
        listed: ['b', 'a'],
        key: 'a',
        delta: -1,
      }),
    ).toEqual(['a', '', 'b'])
  })

  it('does not change what it was given; each name once', () => {
    const stored = ['b', 'b', 'a']
    expect(
      orderAfterMove({ stored, listed: ['b', 'a'], key: 'a', delta: -1 }),
    ).toEqual(['a', 'b'])
    expect(stored).toEqual(['b', 'b', 'a'])
  })
})
