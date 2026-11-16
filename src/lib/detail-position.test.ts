import { describe, expect, it } from 'vitest'
import {
  detailPosition,
  resolveListViewed,
  successorOf,
  viewedInOrder,
} from '#/lib/detail-position'

// Spec 2.4 rows D7 to D11: N of M, prev and next, and the vanished
// torrent's successor.

const ORDER = ['a', 'b', 'c', 'd', 'e']

describe('detailPosition (D7, D8)', () => {
  it('a torrent in the middle', () => {
    expect(detailPosition(ORDER, 'c')).toEqual({
      index: 2,
      total: 5,
      prev: 'b',
      next: 'd',
    })
  })

  it('the first has no prev', () => {
    expect(detailPosition(ORDER, 'a')).toEqual({
      index: 0,
      total: 5,
      prev: null,
      next: 'b',
    })
  })

  it('the last has no next', () => {
    expect(detailPosition(ORDER, 'e')).toEqual({
      index: 4,
      total: 5,
      prev: 'd',
      next: null,
    })
  })

  it('a single item has neither', () => {
    expect(detailPosition(['a'], 'a')).toEqual({
      index: 0,
      total: 1,
      prev: null,
      next: null,
    })
  })

  it('a hash not in the order, or none: null', () => {
    expect(detailPosition(ORDER, 'z')).toBeNull()
    expect(detailPosition(ORDER, null)).toBeNull()
    expect(detailPosition([], 'a')).toBeNull()
  })

  it('a frozen order is read as given, not re-sorted', () => {
    const frozen = Object.freeze(['d', 'a', 'c'])
    expect(detailPosition(frozen, 'a')).toEqual({
      index: 1,
      total: 3,
      prev: 'd',
      next: 'c',
    })
  })
})

describe('viewedInOrder (D1, D3)', () => {
  it('the hash when the order holds it, else the first, else null', () => {
    expect(viewedInOrder(ORDER, 'c')).toBe('c')
    expect(viewedInOrder(ORDER, null)).toBe('a')
    expect(viewedInOrder(ORDER, 'z')).toBe('a')
    expect(viewedInOrder([], 'a')).toBeNull()
  })
})

describe('successorOf (D9 to D11)', () => {
  it('a torrent in the middle vanishes: the old next one', () => {
    expect(successorOf(ORDER, ['a', 'b', 'd', 'e'], 'c')).toBe('d')
  })

  it('the next one vanished too: the first after it still there', () => {
    expect(successorOf(ORDER, ['a', 'b', 'e'], 'c')).toBe('e')
  })

  it('the last vanishes: the old previous one', () => {
    expect(successorOf(ORDER, ['a', 'b', 'c', 'd'], 'e')).toBe('d')
    expect(successorOf(ORDER, ['a', 'b'], 'e')).toBe('b')
  })

  it('the only one vanishes: null', () => {
    expect(successorOf(['a'], [], 'a')).toBeNull()
  })

  it('all gone: null', () => {
    expect(successorOf(ORDER, ['x', 'y'], 'c')).toBeNull()
  })

  it('still present (moved inside the order): itself', () => {
    expect(successorOf(ORDER, ['c', 'a', 'b'], 'c')).toBe('c')
  })

  it('never in the old order: null', () => {
    expect(successorOf(ORDER, ['a'], 'z')).toBeNull()
  })
})

describe('resolveListViewed (D1, D3, D9, D11)', () => {
  const desktop = { fallbackFirst: true }
  const phone = { fallbackFirst: false }

  it('before data: nothing, no write', () => {
    expect(
      resolveListViewed({
        order: undefined,
        hash: 'a',
        previous: null,
        ...desktop,
      }),
    ).toEqual({ viewed: null, write: undefined })
  })

  it('D1 desktop without hash: the first row, URL left alone', () => {
    expect(
      resolveListViewed({
        order: ORDER,
        hash: null,
        previous: null,
        ...desktop,
      }),
    ).toEqual({ viewed: 'a', write: undefined })
  })

  it('D2 a hash in the order is viewed', () => {
    expect(
      resolveListViewed({
        order: ORDER,
        hash: 'c',
        previous: null,
        ...desktop,
      }),
    ).toEqual({ viewed: 'c', write: undefined })
  })

  it('D3 a hash never in the list: the first row, URL left alone', () => {
    expect(
      resolveListViewed({
        order: ORDER,
        hash: 'z',
        previous: { order: ORDER, viewed: 'a' },
        ...desktop,
      }),
    ).toEqual({ viewed: 'a', write: undefined })
  })

  it('D9 the viewed row vanishes: its successor, written to the URL', () => {
    expect(
      resolveListViewed({
        order: ['a', 'b', 'd', 'e'],
        hash: 'c',
        previous: { order: ORDER, viewed: 'c' },
        ...desktop,
      }),
    ).toEqual({ viewed: 'd', write: 'd' })
  })

  it('D9 the implicit first row vanishes: the next one', () => {
    expect(
      resolveListViewed({
        order: ['b', 'c'],
        hash: null,
        previous: { order: ['a', 'b', 'c'], viewed: 'a' },
        ...desktop,
      }),
    ).toEqual({ viewed: 'b', write: 'b' })
  })

  it('D9 none left: nothing viewed, hash removed', () => {
    expect(
      resolveListViewed({
        order: [],
        hash: 'a',
        previous: { order: ['a'], viewed: 'a' },
        ...desktop,
      }),
    ).toEqual({ viewed: null, write: null })
  })

  it('D11 phone: a vanished or unknown hash closes the sheet', () => {
    expect(
      resolveListViewed({
        order: ['a'],
        hash: 'c',
        previous: { order: ['a', 'c'], viewed: 'c' },
        ...phone,
      }),
    ).toEqual({ viewed: null, write: null })
    expect(
      resolveListViewed({ order: ['a'], hash: 'z', previous: null, ...phone }),
    ).toEqual({ viewed: null, write: null })
  })

  it('phone without hash: nothing viewed, no write', () => {
    expect(
      resolveListViewed({ order: ORDER, hash: null, previous: null, ...phone }),
    ).toEqual({ viewed: null, write: undefined })
  })
})
