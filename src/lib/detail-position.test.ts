import { describe, expect, it } from 'vitest'
import {
  detailPosition,
  resolveListViewed,
  successorOf,
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

  it('an order is read as given, never re-sorted', () => {
    const frozen = Object.freeze(['d', 'a', 'c'])
    expect(detailPosition(frozen, 'a')).toEqual({
      index: 1,
      total: 3,
      prev: 'd',
      next: 'c',
    })
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

  it('D1 without hash the row shown stays while in the order (a new one on top)', () => {
    expect(
      resolveListViewed({
        order: ['z', 'a', 'b'],
        hash: null,
        previous: { order: ['a', 'b'], viewed: 'a' },
        ...desktop,
      }),
    ).toEqual({ viewed: 'a', write: undefined })
    expect(
      resolveListViewed({
        order: ['b', 'a'],
        hash: null,
        previous: { order: ['a', 'b'], viewed: 'a' },
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

  it('D3 with a stale hash the row shown stays while in the order (a new one on top)', () => {
    expect(
      resolveListViewed({
        order: ['n', 'a', 'b'],
        hash: 'z',
        previous: { order: ['a', 'b'], viewed: 'a' },
        ...desktop,
      }),
    ).toEqual({ viewed: 'a', write: undefined })
    expect(
      resolveListViewed({
        order: ['b', 'a'],
        hash: 'z',
        previous: { order: ['a', 'b'], viewed: 'a' },
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

  it('D9 without hash, every old row gone and new ones in: the first row', () => {
    expect(
      resolveListViewed({
        order: ['x', 'y'],
        hash: null,
        previous: { order: ['a', 'b'], viewed: 'a' },
        ...desktop,
      }),
    ).toEqual({ viewed: 'x', write: undefined })
    expect(
      resolveListViewed({
        order: [],
        hash: null,
        previous: { order: ['a'], viewed: 'a' },
        ...desktop,
      }),
    ).toEqual({ viewed: null, write: undefined })
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

describe('resolveListViewed with the remembered row (story 3.6)', () => {
  const desktop = { fallbackFirst: true } as const
  const phone = { fallbackFirst: false } as const
  const order = ['a', 'b', 'c']

  it('no hash on a new list: the remembered row when the list holds it', () => {
    expect(
      resolveListViewed({
        order,
        hash: null,
        previous: null,
        preferred: 'c',
        ...desktop,
      }),
    ).toEqual({ viewed: 'c', write: undefined })
  })

  it('the remembered row gone (deleted, archived, filtered out): the first row', () => {
    expect(
      resolveListViewed({
        order,
        hash: null,
        previous: null,
        preferred: 'z',
        ...desktop,
      }),
    ).toEqual({ viewed: 'a', write: undefined })
  })

  it('a hash the list does not hold counts as none: the remembered row', () => {
    expect(
      resolveListViewed({
        order,
        hash: 'z',
        previous: null,
        preferred: 'b',
        ...desktop,
      }),
    ).toEqual({ viewed: 'b', write: undefined })
  })

  it('a usable hash wins over the remembered row', () => {
    expect(
      resolveListViewed({
        order,
        hash: 'a',
        previous: null,
        preferred: 'c',
        ...desktop,
      }),
    ).toEqual({ viewed: 'a', write: undefined })
  })

  it('the row already shown stays while the order holds it', () => {
    expect(
      resolveListViewed({
        order: ['b', 'a', 'c'],
        hash: null,
        previous: { order, viewed: 'a' },
        preferred: 'c',
        ...desktop,
      }),
    ).toEqual({ viewed: 'a', write: undefined })
  })

  it('every old row gone at once without a hash: the remembered row, else the first', () => {
    const previous = { order: ['x', 'y'], viewed: 'x' }
    expect(
      resolveListViewed({
        order,
        hash: null,
        previous,
        preferred: 'b',
        ...desktop,
      }),
    ).toEqual({ viewed: 'b', write: undefined })
    expect(
      resolveListViewed({
        order,
        hash: null,
        previous,
        preferred: null,
        ...desktop,
      }),
    ).toEqual({ viewed: 'a', write: undefined })
  })

  it('the phone never views the remembered row by itself', () => {
    expect(
      resolveListViewed({
        order,
        hash: null,
        previous: null,
        preferred: 'b',
        ...phone,
      }),
    ).toEqual({ viewed: null, write: undefined })
  })
})
