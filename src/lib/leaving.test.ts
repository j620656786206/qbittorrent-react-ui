import { describe, expect, it } from 'vitest'
import { exitShifts, isExpectationLive, removedAbove } from '#/lib/leaving'

// Story 4.4: how far each remaining row slides after a removal, and when an
// expected hash stops counting.

const ROW = 59
const GAP = 2
const rows = () => ROW

describe('exitShifts', () => {
  it('moves nothing when nothing was removed', () => {
    expect(exitShifts(['a', 'b', 'c'], ['a', 'b', 'c'], rows, GAP).size).toBe(0)
  })

  it('moves every row below a removed top row by one row and gap', () => {
    const shifts = exitShifts(['a', 'b', 'c'], ['b', 'c'], rows, GAP)
    expect([...shifts]).toEqual([
      ['b', ROW + GAP],
      ['c', ROW + GAP],
    ])
  })

  it('leaves the rows above a removed middle row in place', () => {
    const shifts = exitShifts(['a', 'b', 'c', 'd'], ['a', 'c', 'd'], rows, GAP)
    expect(shifts.has('a')).toBe(false)
    expect(shifts.get('c')).toBe(ROW + GAP)
    expect(shifts.get('d')).toBe(ROW + GAP)
  })

  it('moves nothing when only the bottom rows went', () => {
    expect(exitShifts(['a', 'b', 'c'], ['a'], rows, GAP).size).toBe(0)
  })

  it('counts every row removed above each remaining row (L3)', () => {
    // Removed: b, d, e. c moves up by one row, f by three.
    const shifts = exitShifts(
      ['a', 'b', 'c', 'd', 'e', 'f'],
      ['a', 'c', 'f'],
      rows,
      GAP,
    )
    expect(shifts.get('c')).toBe(ROW + GAP)
    expect(shifts.get('f')).toBe(3 * (ROW + GAP))
  })

  it('sums mixed card heights and asks only for removed ones', () => {
    const asked: Array<string> = []
    const sizeOf = (hash: string) => {
      asked.push(hash)
      return hash === 'tall' ? 101 : 89
    }
    const shifts = exitShifts(
      ['tall', 'x', 'short', 'y'],
      ['x', 'y'],
      sizeOf,
      10,
    )
    expect(shifts.get('x')).toBe(111)
    expect(shifts.get('y')).toBe(111 + 99)
    expect(asked).toEqual(['tall', 'short'])
  })

  it('ignores hashes only in after (they slide in from nowhere)', () => {
    expect(exitShifts(['a'], ['a', 'new'], rows, GAP).size).toBe(0)
  })
})

describe('isExpectationLive', () => {
  it('counts until the expiry, not at it', () => {
    expect(isExpectationLive(1000, 999)).toBe(true)
    expect(isExpectationLive(1000, 1000)).toBe(false)
  })
})

describe('removedAbove', () => {
  const removed = new Set(['a', 'c', 'e'])

  it('sums the removed rows before the first row in view', () => {
    expect(
      removedAbove(['a', 'b', 'c', 'd', 'e'], 'd', removed, rows, GAP),
    ).toBe(2 * (ROW + GAP))
  })

  it('leaves out a removed row that is itself the first in view', () => {
    expect(removedAbove(['a', 'b', 'c', 'd'], 'c', removed, rows, GAP)).toBe(
      ROW + GAP,
    )
  })

  it('is 0 with nothing removed above, or nothing in view', () => {
    expect(removedAbove(['a', 'b'], 'a', removed, rows, GAP)).toBe(0)
    expect(removedAbove(['a', 'b'], null, removed, rows, GAP)).toBe(0)
    expect(removedAbove(['a', 'b'], 'z', removed, rows, GAP)).toBe(0)
  })

  it('asks each removed row its own size', () => {
    const sizes: Record<string, number> = { a: 100, c: 40 }
    expect(
      removedAbove(
        ['a', 'b', 'c', 'd'],
        'd',
        removed,
        (hash) => sizes[hash],
        8,
      ),
    ).toBe(100 + 8 + 40 + 8)
  })
})
