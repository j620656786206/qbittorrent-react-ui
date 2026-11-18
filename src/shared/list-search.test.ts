import { describe, expect, it } from 'vitest'
import { ALL } from '#/shared/categories'
import {
  DEFAULT_SORT_VIEW,
  categoryOfSearch,
  fixListSearch,
  listSearchSchema,
  normalizeSortView,
  searchWithCategory,
  searchWithHash,
  sortViewOf,
} from '#/shared/list-search'

// Spec 2.1 row S5: the URL's `sort` and `dir`.

describe('listSearchSchema', () => {
  it('keeps a valid sort and dir', () => {
    expect(listSearchSchema.parse({ sort: 'ratio', dir: 'asc' })).toEqual({
      sort: 'ratio',
      dir: 'asc',
    })
  })

  it.each([
    [{ sort: 'nope', dir: 'up' }],
    [{ sort: 5, dir: true }],
    [{ sort: 'tags', dir: 'DESC' }],
    [{}],
  ])('reads %j as missing, never throws', (raw) => {
    expect(listSearchSchema.parse(raw)).toEqual({
      sort: undefined,
      dir: undefined,
    })
  })
})

describe('sortViewOf', () => {
  it('K1 no sort: 狀態 (the board), with its default direction', () => {
    expect(sortViewOf({})).toBe(DEFAULT_SORT_VIEW)
    expect(DEFAULT_SORT_VIEW).toEqual({ sort: 'state', dir: 'desc' })
  })

  it('a sort without dir takes its default direction', () => {
    expect(sortViewOf({ sort: 'name' })).toEqual({ sort: 'name', dir: 'desc' })
  })

  it('both given: as given', () => {
    expect(sortViewOf({ sort: 'size', dir: 'asc' })).toEqual({
      sort: 'size',
      dir: 'asc',
    })
  })

  it('a dir alone is ignored: the default 狀態 has no direction', () => {
    expect(sortViewOf({ dir: 'asc' })).toBe(DEFAULT_SORT_VIEW)
  })
})

// Story 3.1: a URL without `sort` shows the remembered sort of the category.
describe('sortViewOf with a remembered sort', () => {
  const remembered = { sort: 'seeding_time', dir: 'desc' } as const

  it('URL without sort: the remembered sort', () => {
    expect(sortViewOf({}, remembered)).toEqual(remembered)
  })

  it('URL with sort: the URL wins', () => {
    expect(sortViewOf({ sort: 'ratio' }, remembered)).toEqual({
      sort: 'ratio',
      dir: 'desc',
    })
    expect(sortViewOf({ sort: 'ratio', dir: 'asc' }, remembered)).toEqual({
      sort: 'ratio',
      dir: 'asc',
    })
  })

  it('nothing remembered (null or undefined): 狀態', () => {
    expect(sortViewOf({}, null)).toBe(DEFAULT_SORT_VIEW)
    expect(sortViewOf({}, undefined)).toBe(DEFAULT_SORT_VIEW)
  })

  it('a dir alone never changes the remembered sort', () => {
    expect(sortViewOf({ dir: 'asc' }, remembered)).toEqual(remembered)
  })

  it('a remembered 狀態 takes its default direction', () => {
    expect(sortViewOf({}, { sort: 'state', dir: 'asc' })).toEqual({
      sort: 'state',
      dir: 'desc',
    })
  })
})

describe('normalizeSortView', () => {
  it('keeps a directional choice as is (same object)', () => {
    const choice = { sort: 'ratio', dir: 'asc' } as const
    expect(normalizeSortView(choice)).toBe(choice)
  })

  it('狀態 always takes its default direction', () => {
    expect(normalizeSortView({ sort: 'state', dir: 'asc' })).toEqual({
      sort: 'state',
      dir: 'desc',
    })
  })
})

describe('fixListSearch (S5)', () => {
  it('nothing to fix: null', () => {
    expect(fixListSearch({})).toBeNull()
    expect(fixListSearch({ sort: 'ratio', dir: 'desc' })).toBeNull()
    expect(fixListSearch({ other: 'x' })).toBeNull()
  })

  it('a bad sort and dir both go', () => {
    expect(fixListSearch({ sort: 'nope', dir: 'up' })).toEqual({})
  })

  it('a bad sort takes a valid dir with it (back to the default)', () => {
    expect(fixListSearch({ sort: 'nope', dir: 'asc' })).toEqual({})
  })

  it('a dir on a field without a direction goes', () => {
    expect(fixListSearch({ sort: 'state', dir: 'asc' })).toEqual({
      sort: 'state',
    })
    expect(fixListSearch({ sort: 'state' })).toBeNull()
  })

  it('a dir without a sort goes (story 3.1: the remembered sort decides)', () => {
    expect(fixListSearch({ dir: 'asc', q: 'x' })).toEqual({ q: 'x' })
    expect(fixListSearch({ dir: 'up' })).toEqual({})
  })

  it('a bad dir alone goes alone; other params stay', () => {
    expect(fixListSearch({ sort: 'ratio', dir: 'up', q: 'x' })).toEqual({
      sort: 'ratio',
      q: 'x',
    })
  })
})

describe('sortViewOf on a field without a direction', () => {
  it('狀態 ignores dir', () => {
    expect(sortViewOf({ sort: 'state', dir: 'asc' })).toEqual({
      sort: 'state',
      dir: 'desc',
    })
  })
})

// Spec 2.4: `hash`, the torrent the detail shows (D3, D12).
const SHA1 = '0123456789abcdef'.repeat(2) + '01234567'
const SHA256 = '0123456789abcdef'.repeat(4)

describe('hash in the search', () => {
  it('keeps a 40 or 64 lowercase hex hash', () => {
    expect(listSearchSchema.parse({ hash: SHA1 }).hash).toBe(SHA1)
    expect(listSearchSchema.parse({ hash: SHA256 }).hash).toBe(SHA256)
  })

  it.each([
    ['uppercase', SHA1.toUpperCase()],
    ['too short', SHA1.slice(1)],
    ['41 characters', `${SHA1}a`],
    ['not hex', 'g'.repeat(40)],
    ['a number', 12],
    ['all', 'all'],
  ])('reads a hash that is %s as missing, never throws', (_, hash) => {
    expect(listSearchSchema.parse({ hash }).hash).toBeUndefined()
  })

  it('fixListSearch drops a bad hash alone and keeps a good one', () => {
    expect(fixListSearch({ sort: 'ratio', hash: SHA1 })).toBeNull()
    expect(fixListSearch({ sort: 'ratio', hash: 'nope' })).toEqual({
      sort: 'ratio',
    })
    expect(fixListSearch({ sort: 'nope', hash: SHA1 })).toEqual({
      hash: SHA1,
    })
    expect(fixListSearch({ hash: SHA1.toUpperCase(), q: 'x' })).toEqual({
      q: 'x',
    })
  })

  it('searchWithHash sets or removes hash and keeps the sort', () => {
    const previous = { sort: 'ratio', dir: 'asc', hash: SHA1 }
    expect(searchWithHash(previous, SHA256)).toEqual({
      sort: 'ratio',
      dir: 'asc',
      hash: SHA256,
    })
    const closed = searchWithHash(previous, null)
    expect(closed).toEqual({ sort: 'ratio', dir: 'asc' })
    expect('hash' in closed).toBe(false)
  })
})

// Story 3.2: `category`, absent for 「全部」, `category=` for uncategorized.
describe('category in the search', () => {
  it('keeps a name and the uncategorized empty string', () => {
    expect(listSearchSchema.parse({ category: 'mteam-X' }).category).toBe(
      'mteam-X',
    )
    expect(listSearchSchema.parse({ category: '' }).category).toBe('')
    expect(
      listSearchSchema.parse({ category: '<script>alert(1)</script>' })
        .category,
    ).toBe('<script>alert(1)</script>')
  })

  it.each([
    [123],
    [true],
    [ALL],
    ['bad\u0001name'],
    ['x'.repeat(256)],
    ['__proto__'],
  ])('reads %j as missing (「全部」)', (category) => {
    expect(listSearchSchema.parse({ category }).category).toBeUndefined()
  })

  it('categoryOfSearch: absent is ALL', () => {
    expect(categoryOfSearch({})).toBe(ALL)
    expect(categoryOfSearch({ category: '' })).toBe('')
    expect(categoryOfSearch({ category: 'X' })).toBe('X')
  })

  it('fixListSearch drops a bad category alone and keeps a good one', () => {
    expect(fixListSearch({ category: 'mteam-X', sort: 'ratio' })).toBeNull()
    expect(fixListSearch({ category: '' })).toBeNull()
    expect(fixListSearch({ category: 7, sort: 'ratio', dir: 'asc' })).toEqual({
      sort: 'ratio',
      dir: 'asc',
    })
    expect(fixListSearch({ category: ALL, hash: 'nope' })).toEqual({})
  })

  it('searchWithCategory sets it, removes it for 「全部」, keeps the rest', () => {
    const previous = { sort: 'ratio', dir: 'asc', category: 'X' }
    expect(searchWithCategory(previous, 'mteam-X')).toEqual({
      sort: 'ratio',
      dir: 'asc',
      category: 'mteam-X',
    })
    expect(searchWithCategory(previous, '')).toEqual({
      sort: 'ratio',
      dir: 'asc',
      category: '',
    })
    expect(searchWithCategory(previous, ALL)).toEqual({
      sort: 'ratio',
      dir: 'asc',
    })
  })
})
