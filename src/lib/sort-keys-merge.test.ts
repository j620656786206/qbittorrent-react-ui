import { describe, expect, it } from 'vitest'
import { mergeSortKeys } from '#/lib/sort-keys-merge'

// Spec 2.1: merging full and delta getSortKeys answers.

describe('mergeSortKeys', () => {
  const first = mergeSortKeys(undefined, {
    version: 'abcdef12.1',
    full: true,
    keys: { a: 1, b: null },
  })

  it('a full answer replaces', () => {
    expect(first).toEqual({ version: 'abcdef12.1', keys: { a: 1, b: null } })
    const next = mergeSortKeys(first, {
      version: 'abcdef12.5',
      full: true,
      keys: { c: 3 },
    })
    expect(next.keys).toEqual({ c: 3 })
  })

  it('an equal full answer keeps the old keys reference', () => {
    const next = mergeSortKeys(first, {
      version: 'abcdef12.2',
      full: true,
      keys: { a: 1, b: null },
    })
    expect(next.keys).toBe(first.keys)
    expect(next.version).toBe('abcdef12.2')
  })

  it('a delta overwrites only its hashes; inputs are not mutated', () => {
    const before = { ...first.keys }
    const next = mergeSortKeys(first, {
      version: 'abcdef12.2',
      full: false,
      keys: { b: 7, d: 'x' },
    })
    expect(next.keys).toEqual({ a: 1, b: 7, d: 'x' })
    expect(first.keys).toEqual(before)
  })

  it('an empty or unchanged delta keeps the reference', () => {
    expect(
      mergeSortKeys(first, { version: 'abcdef12.3', full: false, keys: {} })
        .keys,
    ).toBe(first.keys)
    expect(
      mergeSortKeys(first, {
        version: 'abcdef12.3',
        full: false,
        keys: { a: 1 },
      }).keys,
    ).toBe(first.keys)
  })
})
