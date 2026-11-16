import { describe, expect, it } from 'vitest'
import {
  DEFAULT_SORT_VIEW,
  fixListSearch,
  listSearchSchema,
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

  it('a dir without a sort goes: the default 狀態 has no direction', () => {
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
