import { describe, expect, it, vi } from 'vitest'
import { createRetryGuard } from '#/state/maindata-retry'

// Spec 1.7 review: 「重試」 shows a busy state and ignores presses meanwhile.

function deferred() {
  let resolve!: () => void
  let reject!: (error: unknown) => void
  const promise = new Promise<void>((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}

describe('createRetryGuard', () => {
  it('runs once, ignores presses while in flight, clears busy when settled', async () => {
    const busy = vi.fn()
    const guard = createRetryGuard(busy)
    const first = deferred()
    const run = vi.fn(() => first.promise)

    guard(run)
    guard(run)
    guard(run)
    expect(run).toHaveBeenCalledTimes(1)
    expect(busy.mock.calls).toEqual([[true]])

    first.resolve()
    await first.promise
    await Promise.resolve()
    expect(busy.mock.calls).toEqual([[true], [false]])

    guard(run)
    expect(run).toHaveBeenCalledTimes(2)
  })

  it('a failed run also clears busy and allows the next press', async () => {
    const busy = vi.fn()
    const guard = createRetryGuard(busy)
    const failing = deferred()
    guard(() => failing.promise)
    failing.reject(new Error('x'))
    await failing.promise.catch(() => {})
    await Promise.resolve()
    expect(busy.mock.calls).toEqual([[true], [false]])
    const next = vi.fn(async () => {})
    guard(next)
    expect(next).toHaveBeenCalledTimes(1)
  })

  it('a run that throws synchronously still clears busy', async () => {
    const busy = vi.fn()
    const guard = createRetryGuard(busy)
    guard(() => {
      throw new Error('x')
    })
    await Promise.resolve()
    await Promise.resolve()
    expect(busy.mock.calls).toEqual([[true], [false]])
    const next = vi.fn(async () => {})
    guard(next)
    expect(next).toHaveBeenCalledTimes(1)
  })
})
