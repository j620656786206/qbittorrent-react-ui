import { describe, expect, it } from 'vitest'
import {
  JOIN_MS,
  STAGGER_MS,
  entranceDelay,
  intersectBoxes,
  isVisible,
  rowOrdinals,
  sweepDecision,
} from '#/lib/entrance'

const box = (top: number, left = 0, height = 60, width = 300) => ({
  top,
  left,
  bottom: top + height,
  right: left + width,
})

describe('rowOrdinals', () => {
  it('numbers rows top to bottom in the input order', () => {
    expect(rowOrdinals([100, 0, 50])).toEqual([2, 0, 1])
  })

  it('tops within 1px are one row (a grid row rises together)', () => {
    expect(rowOrdinals([0, 0.6, 1, 70, 70.4, 140])).toEqual([0, 0, 0, 1, 1, 2])
  })

  it('a top more than 1px below the row’s first top starts a new row', () => {
    // 0.8 joins the row of 0; 1.6 is 1.6 below 0, a new row.
    expect(rowOrdinals([0, 0.8, 1.6])).toEqual([0, 0, 1])
  })

  it('empty in, empty out', () => {
    expect(rowOrdinals([])).toEqual([])
  })
})

describe('isVisible', () => {
  const viewport = { width: 390, height: 844 }
  const container = box(100, 0, 600, 390)

  it('inside the container and the window', () => {
    expect(isVisible(box(120), container, viewport)).toBe(true)
  })

  it('partly inside counts', () => {
    expect(isVisible(box(680), container, viewport)).toBe(true)
  })

  it('below the container (overscan) does not', () => {
    expect(isVisible(box(700), container, viewport)).toBe(false)
    expect(isVisible(box(40), container, viewport)).toBe(false)
  })

  it('a phone panel translated off the window does not', () => {
    const offScreen = box(100, 390, 600, 390)
    expect(isVisible(box(120, 400), offScreen, viewport)).toBe(false)
  })

  it('an empty box (not laid out) does not', () => {
    expect(
      isVisible(
        { top: 0, left: 0, bottom: 0, right: 0 },
        { top: 0, left: 0, bottom: 0, right: 0 },
        viewport,
      ),
    ).toBe(false)
  })
})

describe('intersectBoxes', () => {
  it('the overlap of two boxes', () => {
    expect(
      intersectBoxes(box(0, 0, 600, 400), {
        top: 0,
        left: 16,
        bottom: 844,
        right: 374,
      }),
    ).toEqual({ top: 0, left: 16, bottom: 600, right: 374 })
  })

  it('boxes that do not meet give an empty box, which shows nothing', () => {
    const clip = intersectBoxes(box(0, 374, 600, 358), {
      top: 0,
      left: 16,
      bottom: 844,
      right: 374,
    })
    expect(clip.right - clip.left).toBe(0)
    expect(
      isVisible(box(10, 374, 60, 358), clip, { width: 390, height: 844 }),
    ).toBe(false)
  })
})

describe('entranceDelay', () => {
  it('60ms per row, shifted by the late start', () => {
    expect(entranceDelay(0, 0)).toBe(0)
    expect(entranceDelay(3, 0)).toBe(3 * STAGGER_MS)
    expect(entranceDelay(0, 40)).toBe(-40)
    expect(entranceDelay(2, 40)).toBe(2 * STAGGER_MS - 40)
  })
})

describe('sweepDecision', () => {
  const base = { generation: 1, played: 0, now: 1000 }

  it('not ready: wait', () => {
    expect(sweepDecision({ ...base, ready: false, startedAt: null })).toEqual({
      kind: 'wait',
    })
    expect(sweepDecision({ ...base, ready: false, startedAt: 990 })).toEqual({
      kind: 'wait',
    })
  })

  it('the first ready surface claims the generation', () => {
    expect(sweepDecision({ ...base, ready: true, startedAt: null })).toEqual({
      kind: 'claim',
    })
  })

  it('ready within JOIN_MS of the claim: join with the elapsed time', () => {
    expect(sweepDecision({ ...base, ready: true, startedAt: 960 })).toEqual({
      kind: 'join',
      elapsed: 40,
    })
    expect(
      sweepDecision({ ...base, ready: true, startedAt: 1000 - JOIN_MS }),
    ).toEqual({ kind: 'join', elapsed: JOIN_MS })
  })

  it('ready later (or mounted later): skip', () => {
    expect(
      sweepDecision({ ...base, ready: true, startedAt: 1000 - JOIN_MS - 1 }),
    ).toEqual({ kind: 'skip' })
  })

  it('a generation already handled: skip, ready or not', () => {
    for (const ready of [true, false]) {
      expect(
        sweepDecision({ ...base, played: 1, ready, startedAt: null }),
      ).toEqual({ kind: 'skip' })
    }
  })

  it('a replay (new generation) is swept again by a surface that played the old one', () => {
    expect(
      sweepDecision({
        generation: 2,
        played: 1,
        ready: true,
        startedAt: 995,
        now: 1000,
      }),
    ).toEqual({ kind: 'join', elapsed: 5 })
  })

  it('a clock that reads before startedAt joins at 0', () => {
    expect(sweepDecision({ ...base, ready: true, startedAt: 1005 })).toEqual({
      kind: 'join',
      elapsed: 0,
    })
  })
})
