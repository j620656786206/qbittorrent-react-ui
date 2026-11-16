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
  it('no sort: added time, newest first', () => {
    expect(sortViewOf({})).toBe(DEFAULT_SORT_VIEW)
    expect(DEFAULT_SORT_VIEW).toEqual({ sort: 'added_on', dir: 'desc' })
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

  it('a dir alone applies to the default sort', () => {
    expect(sortViewOf({ dir: 'asc' })).toEqual({ sort: 'added_on', dir: 'asc' })
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
