import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createClock } from '#/state/now'

// Spec 1.7: the shared ticking clock behind `useNow`.

beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(1_000_000)
})

afterEach(() => {
  vi.useRealTimers()
})

describe('createClock', () => {
  it('ticks every interval while subscribed, with one timer for all', () => {
    const clock = createClock(1000)
    const a = vi.fn()
    const b = vi.fn()
    const stopA = clock.subscribe(a)
    const stopB = clock.subscribe(b)
    expect(vi.getTimerCount()).toBe(1)

    vi.advanceTimersByTime(3000)
    expect(a).toHaveBeenCalledTimes(3)
    expect(b).toHaveBeenCalledTimes(3)
    expect(clock.getSnapshot()).toBe(1_003_000)

    stopA()
    vi.advanceTimersByTime(1000)
    expect(a).toHaveBeenCalledTimes(3)
    expect(b).toHaveBeenCalledTimes(4)

    stopB()
    expect(vi.getTimerCount()).toBe(0)
  })

  it('keeps the snapshot stable between ticks', () => {
    const clock = createClock(1000)
    clock.subscribe(() => {})
    const first = clock.getSnapshot()
    vi.advanceTimersByTime(999)
    expect(clock.getSnapshot()).toBe(first)
    vi.advanceTimersByTime(1)
    expect(clock.getSnapshot()).toBe(first + 1000)
  })

  it('refreshes an old value before anyone subscribes', () => {
    const clock = createClock(1000)
    vi.setSystemTime(1_000_500)
    expect(clock.getSnapshot()).toBe(1_000_000)
    vi.setSystemTime(1_005_000)
    expect(clock.getSnapshot()).toBe(1_005_000)
  })
})
