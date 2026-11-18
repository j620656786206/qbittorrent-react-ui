import { describe, expect, it } from 'vitest'
import {
  rememberedSortOf,
  rememberedSortSwitch,
  sameSort,
} from '#/lib/remembered-sort'
import { ALL } from '#/shared/categories'
import { defaultSettings } from '#/shared/settings'
import type { SortView } from '#/shared/list-search'

// Story 3.1 (Design Notes): only a change of the remembered value between
// two settings answers moves the screen, never a mismatch alone.

const RATIO: SortView = { sort: 'ratio', dir: 'desc' }
const SEEDING: SortView = { sort: 'seeding_time', dir: 'desc' }
const ADDED: SortView = { sort: 'added_on', dir: 'desc' }

describe('rememberedSortOf', () => {
  it('undefined before the first answer, null when nothing is remembered', () => {
    expect(rememberedSortOf(undefined, ALL)).toBeUndefined()
    expect(rememberedSortOf(defaultSettings(), ALL)).toBeNull()
  })

  it('the remembered sort of the category', () => {
    const settings = {
      ...defaultSettings(),
      categorySort: { [ALL]: RATIO, X: SEEDING },
    }
    expect(rememberedSortOf(settings, ALL)).toBe(RATIO)
    expect(rememberedSortOf(settings, 'X')).toBe(SEEDING)
    expect(rememberedSortOf(settings, 'mteam-X')).toBeNull()
  })

  it('never reads inherited properties', () => {
    expect(rememberedSortOf(defaultSettings(), 'toString')).toBeNull()
  })
})

describe('sameSort', () => {
  it('compares sort and direction', () => {
    expect(sameSort(RATIO, { sort: 'ratio', dir: 'desc' })).toBe(true)
    expect(sameSort(RATIO, { sort: 'ratio', dir: 'asc' })).toBe(false)
    expect(sameSort(null, null)).toBe(true)
    expect(sameSort(null, undefined)).toBe(false)
    expect(sameSort(RATIO, null)).toBe(false)
  })
})

describe('rememberedSortSwitch with a URL sort (next is shown)', () => {
  const urlSort = (
    before: SortView | null | undefined,
    after: SortView | null | undefined,
    shown: SortView,
    saving = false,
  ) => rememberedSortSwitch({ before, after, shown, next: shown, saving })

  it('another device changed it: switch to the new sort', () => {
    expect(urlSort(RATIO, SEEDING, RATIO)).toEqual(SEEDING)
    expect(urlSort(RATIO, SEEDING, ADDED)).toEqual(SEEDING)
    expect(urlSort(null, SEEDING, ADDED)).toEqual(SEEDING)
  })

  it('a value after no answer at all never moves a URL sort', () => {
    expect(urlSort(undefined, SEEDING, ADDED)).toBeNull()
  })

  it('write in flight or failed: the answer keeps the old value, nothing moves', () => {
    expect(urlSort(RATIO, RATIO, ADDED)).toBeNull()
  })

  it("this tab's own write: the new value is what the screen shows", () => {
    expect(urlSort(RATIO, ADDED, ADDED)).toBeNull()
  })

  it('while this tab still saves, no answer moves the screen', () => {
    expect(urlSort(RATIO, SEEDING, ADDED, true)).toBeNull()
  })

  it('the remembered value removed: a URL sort stays', () => {
    expect(urlSort(RATIO, null, ADDED)).toBeNull()
  })

  it('a remembered 狀態 is compared with its default direction', () => {
    const board = { sort: 'state', dir: 'desc' } as const
    expect(urlSort(RATIO, { sort: 'state', dir: 'asc' }, board)).toBeNull()
    expect(urlSort(RATIO, { sort: 'state', dir: 'asc' }, ADDED)).toEqual(board)
  })
})

describe('rememberedSortSwitch without a URL sort (next follows the value)', () => {
  const BOARD = { sort: 'state', dir: 'desc' } as const

  it('a value after a failed first read: switch to it', () => {
    expect(
      rememberedSortSwitch({
        before: undefined,
        after: RATIO,
        shown: BOARD,
        next: RATIO,
        saving: false,
      }),
    ).toEqual(RATIO)
  })

  it('another value: switch to it', () => {
    expect(
      rememberedSortSwitch({
        before: RATIO,
        after: SEEDING,
        shown: RATIO,
        next: SEEDING,
        saving: false,
      }),
    ).toEqual(SEEDING)
  })

  it('back to nothing: switch to 狀態', () => {
    expect(
      rememberedSortSwitch({
        before: RATIO,
        after: null,
        shown: RATIO,
        next: BOARD,
        saving: false,
      }),
    ).toEqual(BOARD)
  })

  it('the same value again: nothing', () => {
    expect(
      rememberedSortSwitch({
        before: RATIO,
        after: { sort: 'ratio', dir: 'desc' },
        shown: RATIO,
        next: RATIO,
        saving: false,
      }),
    ).toBeNull()
  })
})
