import { describe, expect, it } from 'vitest'
import {
  LONG_PRESS_MS,
  LONG_PRESS_SLOP_PX,
  longPressStep,
} from '#/lib/long-press'

// Spec 4.2: fire at 500 ms, cancel past 10px (straight-line) before then.

describe('longPressStep', () => {
  it('the thresholds are 500 ms and 10px', () => {
    expect(LONG_PRESS_MS).toBe(500)
    expect(LONG_PRESS_SLOP_PX).toBe(10)
  })

  it('499 ms still waits; 500 ms fires', () => {
    expect(longPressStep({ elapsedMs: 499, dx: 0, dy: 0 })).toBe('wait')
    expect(longPressStep({ elapsedMs: 500, dx: 0, dy: 0 })).toBe('fire')
    expect(longPressStep({ elapsedMs: 800, dx: 0, dy: 0 })).toBe('fire')
  })

  it('10px of movement waits; 10.01px cancels', () => {
    expect(longPressStep({ elapsedMs: 200, dx: 10, dy: 0 })).toBe('wait')
    expect(longPressStep({ elapsedMs: 200, dx: 0, dy: -10 })).toBe('wait')
    expect(longPressStep({ elapsedMs: 200, dx: 10.01, dy: 0 })).toBe('cancel')
    expect(longPressStep({ elapsedMs: 200, dx: 0, dy: -10.01 })).toBe('cancel')
  })

  it('diagonal movement is measured as a straight line', () => {
    // 6, 8: exactly 10px.
    expect(longPressStep({ elapsedMs: 300, dx: 6, dy: 8 })).toBe('wait')
    // 8, 7: about 10.6px, though neither axis passes 10.
    expect(longPressStep({ elapsedMs: 300, dx: 8, dy: -7 })).toBe('cancel')
  })

  it('matrix: a 6px wobble at 500 ms fires; 11px within 500 ms cancels', () => {
    expect(longPressStep({ elapsedMs: 500, dx: 6, dy: 0 })).toBe('fire')
    expect(longPressStep({ elapsedMs: 120, dx: 0, dy: 11 })).toBe('cancel')
  })
})
