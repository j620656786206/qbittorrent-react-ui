import { describe, expect, it } from 'vitest'
import { ALL } from '#/shared/categories'
import {
  MAX_COMMON_PATHS,
  commonPathSchema,
  defaultSettings,
  setCategorySortInputSchema,
  settingsSchema,
  sortChoiceSchema,
} from '#/shared/settings'
import { SORT_FIELD_IDS } from '#/shared/sort-fields'

// Story 3.1 (AD-8): the settings file's schema, every field valid and
// invalid. Code-name categories and fake /data paths only.

const path = (n: number) => ({
  path: `/data/media/X/${n}`,
  name: `路徑 ${n}`,
  mediaLibrary: n % 2 === 0,
})

const valid = () => ({
  version: 1,
  categorySort: {
    [ALL]: { sort: 'seeding_time', dir: 'desc' },
    '': { sort: 'name', dir: 'asc' },
    'mteam-X': { sort: 'ratio', dir: 'desc' },
  },
  categoryOrder: ['X', 'mteam-X', ''],
  commonPaths: [path(1)],
})

describe('settingsSchema', () => {
  it('the defaults', () => {
    expect(defaultSettings()).toEqual({
      version: 1,
      categorySort: {},
      categoryOrder: [],
      commonPaths: [],
    })
    expect(settingsSchema.safeParse(defaultSettings()).success).toBe(true)
  })

  it('a full valid file', () => {
    expect(settingsSchema.parse(valid())).toEqual(valid())
  })

  it.each([
    ['version 2', { version: 2 }],
    ['version missing', { version: undefined }],
    ['an unknown section', { extra: 1 }],
    ['categorySort not an object', { categorySort: [] }],
    ['categoryOrder holding ALL', { categoryOrder: [ALL] }],
    ['categoryOrder a string', { categoryOrder: 'X' }],
    ['commonPaths not an array', { commonPaths: {} }],
  ])('rejects %s', (_name, change) => {
    expect(settingsSchema.safeParse({ ...valid(), ...change }).success).toBe(
      false,
    )
  })

  it('a categorySort key with a control character is rejected', () => {
    const file = valid()
    expect(
      settingsSchema.safeParse({
        ...file,
        categorySort: { 'X\u0001': { sort: 'ratio', dir: 'asc' } },
      }).success,
    ).toBe(false)
  })

  it('50 common paths pass, 51 do not', () => {
    const paths = Array.from({ length: 51 }, (_, i) => path(i))
    expect(MAX_COMMON_PATHS).toBe(50)
    expect(
      settingsSchema.safeParse({ ...valid(), commonPaths: paths.slice(0, 50) })
        .success,
    ).toBe(true)
    expect(
      settingsSchema.safeParse({ ...valid(), commonPaths: paths }).success,
    ).toBe(false)
  })
})

describe('sortChoiceSchema', () => {
  it('accepts every one of the 51 ids, both directions', () => {
    expect(SORT_FIELD_IDS).toHaveLength(51)
    for (const sort of SORT_FIELD_IDS) {
      for (const dir of ['asc', 'desc']) {
        expect(sortChoiceSchema.safeParse({ sort, dir }).success).toBe(true)
      }
    }
  })

  it.each([
    [{ sort: 'nope', dir: 'asc' }],
    [{ sort: 'ratio', dir: 'up' }],
    [{ sort: 'ratio' }],
    [{ sort: 'ratio', dir: 'asc', extra: 1 }],
  ])('rejects %j', (value) => {
    expect(sortChoiceSchema.safeParse(value).success).toBe(false)
  })
})

describe('commonPathSchema', () => {
  it('normalizes the path', () => {
    expect(
      commonPathSchema.parse({
        path: '/data/.//media/X/',
        name: 'X',
        mediaLibrary: true,
      }).path,
    ).toBe('/data/media/X')
  })

  it('names of 1 to 50 characters', () => {
    const named = (name: string) =>
      commonPathSchema.safeParse({ ...path(1), name }).success
    expect(named('a')).toBe(true)
    expect(named('名'.repeat(50))).toBe(true)
    expect(named('名'.repeat(51))).toBe(false)
    expect(named('')).toBe(false)
  })

  it.each([
    ['a line break', 'media\nX'],
    ['a tab', 'media\tX'],
    ['NUL', 'X\u0000'],
    ['DEL', 'X\u007f'],
    ['only spaces', '   '],
    ['only full-width spaces', '\u3000\u3000'],
  ])('a name with %s is rejected', (_name, name) => {
    expect(commonPathSchema.safeParse({ ...path(1), name }).success).toBe(false)
  })

  it('inner spaces are fine', () => {
    expect(
      commonPathSchema.safeParse({ ...path(1), name: 'media X 影集' }).success,
    ).toBe(true)
  })

  it.each([
    ['a .. path', { path: '/data/../x' }],
    ['mediaLibrary not a boolean', { mediaLibrary: 'yes' }],
    ['no name', { name: undefined }],
    ['an extra field', { extra: true }],
  ])('rejects %s', (_name, change) => {
    expect(commonPathSchema.safeParse({ ...path(1), ...change }).success).toBe(
      false,
    )
  })
})

describe('setCategorySortInputSchema', () => {
  it('accepts ALL, uncategorized and a name', () => {
    for (const category of [ALL, '', 'mteam-X']) {
      expect(
        setCategorySortInputSchema.safeParse({
          category,
          sort: 'ratio',
          dir: 'desc',
        }).success,
      ).toBe(true)
    }
  })

  it.each([
    ['a bad sort', { sort: 'nope' }],
    ['a bad dir', { dir: 'sideways' }],
    ['an unknown key', { extra: 1 }],
    ['a control character in the category', { category: 'X\u0002' }],
    ['a category of 256 characters', { category: 'x'.repeat(256) }],
  ])('rejects %s', (_name, change) => {
    expect(
      setCategorySortInputSchema.safeParse({
        category: ALL,
        sort: 'ratio',
        dir: 'desc',
        ...change,
      }).success,
    ).toBe(false)
  })
})
