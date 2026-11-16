import { describe, expect, it } from 'vitest'
import {
  RUBBER_BAND,
  SWIPE_SLOP,
  settleSwipe,
  swipeIntent,
  swipeOffset,
  swipeVelocity,
  trackTransform,
} from '#/features/board/board-swipe'

// Spec 2.3 row K12: the phone board's swipe decisions.

describe('swipeIntent', () => {
  it('undecided inside the slop', () => {
    expect(swipeIntent(SWIPE_SLOP - 1, 0)).toBe('pending')
    expect(swipeIntent(-3, 4)).toBe('pending')
  })

  it('sideways past the slop is a swipe; up or down first is a scroll', () => {
    expect(swipeIntent(-SWIPE_SLOP, 2)).toBe('horizontal')
    expect(swipeIntent(14, -9)).toBe('horizontal')
    expect(swipeIntent(3, SWIPE_SLOP)).toBe('vertical')
    // A diagonal never counts as a swipe.
    expect(swipeIntent(12, 12)).toBe('vertical')
  })
})

describe('swipeOffset', () => {
  it('follows the finger between columns', () => {
    expect(swipeOffset({ dx: -80, index: 1, count: 4 })).toBe(-80)
    expect(swipeOffset({ dx: 80, index: 1, count: 4 })).toBe(80)
  })

  it('stretches past the first and the last column', () => {
    expect(swipeOffset({ dx: 90, index: 0, count: 4 })).toBe(90 * RUBBER_BAND)
    expect(swipeOffset({ dx: -90, index: 3, count: 4 })).toBe(-90 * RUBBER_BAND)
    expect(swipeOffset({ dx: -90, index: 0, count: 4 })).toBe(-90)
  })
})

describe('settleSwipe', () => {
  const base = { count: 4, width: 400, velocity: 0 }

  it('past 25% of the width moves one column that way', () => {
    expect(settleSwipe({ ...base, index: 1, dx: -101 })).toBe(2)
    expect(settleSwipe({ ...base, index: 1, dx: 101 })).toBe(0)
  })

  it('a short slow drag springs back', () => {
    expect(settleSwipe({ ...base, index: 1, dx: -99 })).toBe(1)
    expect(settleSwipe({ ...base, index: 1, dx: 0, velocity: -2 })).toBe(1)
  })

  it('a flick moves even when short, only the way the finger went', () => {
    expect(settleSwipe({ ...base, index: 1, dx: -30, velocity: -0.8 })).toBe(2)
    expect(settleSwipe({ ...base, index: 1, dx: -30, velocity: 0.8 })).toBe(1)
    expect(settleSwipe({ ...base, index: 1, dx: -30, velocity: -0.4 })).toBe(1)
  })

  it('past 25% but flicked back the other way: stays', () => {
    expect(settleSwipe({ ...base, index: 1, dx: -150, velocity: 0.8 })).toBe(1)
    expect(settleSwipe({ ...base, index: 1, dx: 150, velocity: -0.8 })).toBe(1)
    // A slow move back still lets the distance count.
    expect(settleSwipe({ ...base, index: 1, dx: -150, velocity: 0.3 })).toBe(2)
  })

  it('never past the first or the last column', () => {
    expect(settleSwipe({ ...base, index: 0, dx: 300 })).toBe(0)
    expect(settleSwipe({ ...base, index: 3, dx: -300 })).toBe(3)
  })
})

describe('swipeVelocity', () => {
  it('px/ms over the last 100 ms', () => {
    expect(
      swipeVelocity([
        { time: 0, x: 0 },
        { time: 200, x: 10 },
        { time: 250, x: 20 },
        { time: 300, x: 60 },
      ]),
    ).toBe(0.5)
  })

  it('0 without two samples or time between them', () => {
    expect(swipeVelocity([])).toBe(0)
    expect(swipeVelocity([{ time: 5, x: 1 }])).toBe(0)
    expect(
      swipeVelocity([
        { time: 5, x: 1 },
        { time: 5, x: 9 },
      ]),
    ).toBe(0)
  })
})

describe('trackTransform', () => {
  it('one form for React and the drag', () => {
    expect(trackTransform(0)).toBe('translateX(calc(0% + 0px))')
    expect(trackTransform(2, -35)).toBe('translateX(calc(-200% + -35px))')
  })
})
