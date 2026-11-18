import { describe, expect, it } from 'vitest'
import {
  MAX_SAVE_PATH,
  normalizeSavePath,
  savePathSchema,
} from '#/shared/save-path'

// Story 3.1 matrix row "Path schema" (AD-12, AR-29): the shared path schema.
// The SAVE_ROOTS half is the isUnderSaveRoot block in
// src/server/settings/store.test.ts.

const parse = (value: unknown) => savePathSchema.safeParse(value)

/** An absolute path of exactly `length` characters. */
const pathOf = (length: number) => `/${'a'.repeat(length - 1)}`

describe('normalizeSavePath', () => {
  it.each([
    ['/data/media/tv', '/data/media/tv'],
    ['/data/media/tv/', '/data/media/tv'],
    ['/data//media///tv//', '/data/media/tv'],
    ['/', '/'],
    ['//', '/'],
    ['', ''],
    ['/data/./x', '/data/x'],
    ['/./data/.', '/data'],
    ['/./', '/'],
    ['/data/../x', '/data/../x'],
    ['data/./x', 'data/x'],
  ])('%j -> %j', (input, expected) => {
    expect(normalizeSavePath(input)).toBe(expected)
  })
})

describe('savePathSchema', () => {
  it('normalizes repeated and trailing slashes and . segments', () => {
    expect(parse('/data//media/X/').data).toBe('/data/media/X')
    expect(parse('/').data).toBe('/')
    expect(parse('/data/./media/./X').data).toBe('/data/media/X')
  })

  it.each([
    ['a .. segment', '/data/../etc'],
    ['a trailing .. segment', '/data/media/..'],
    ['relative', 'data/media'],
    ['empty', ''],
    ['a backslash', '/data\\media'],
    ['NUL', '/data/\u0000x'],
    ['a newline', '/data/x\ny'],
    ['DEL', '/data/\u007f'],
    ['not a string', 42],
  ])('rejects %s', (_name, value) => {
    expect(parse(value).success).toBe(false)
  })

  it('keeps names that only look like dots', () => {
    expect(parse('/data/..hidden/x...').success).toBe(true)
  })

  it('1024 characters pass, 1025 do not (after normalizing)', () => {
    expect(MAX_SAVE_PATH).toBe(1024)
    expect(parse(pathOf(1024)).success).toBe(true)
    expect(parse(pathOf(1025)).success).toBe(false)
    // A trailing slash is removed before the length is measured.
    expect(parse(`${pathOf(1024)}/`).success).toBe(true)
  })
})
