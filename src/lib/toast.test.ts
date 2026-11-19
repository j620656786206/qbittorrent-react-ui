import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { toast } from '#/lib/toast'
import { resetToasts, toastStore } from '#/shared/toast-store'

// Spec 2.6 rows T1 and T2 through the API features use. Node has no
// `window`, which the store reads as "server": stub one.

const shown = () => toastStore.state.toast

beforeEach(() => {
  vi.stubGlobal('window', globalThis)
  vi.useFakeTimers()
  resetToasts()
})

afterEach(() => {
  resetToasts()
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

describe('T1 failure', () => {
  it('stays until closed; its 重試 runs onRetry', () => {
    const onRetry = vi.fn()
    toast.failure('暫停失敗：qBittorrent 拒絕這個操作', {
      keys: ['a'],
      onRetry,
    })
    vi.advanceTimersByTime(10 * 60_000)
    expect(shown()?.text).toBe('暫停失敗：qBittorrent 拒絕這個操作')
    shown()?.retry()
    expect(onRetry).toHaveBeenCalledOnce()
  })

  it('shows nothing on the server', () => {
    vi.unstubAllGlobals()
    toast.failure('f', { keys: ['a'], onRetry: vi.fn() })
    expect(shown()).toBeNull()
  })
})

describe('dismissFor', () => {
  it('closes the toast about that key', () => {
    toast.failure('f', { keys: ['file:a:1', 'file:a:2'], onRetry: vi.fn() })
    toast.dismissFor('file:a:2')
    expect(shown()).toBeNull()
  })

  it('leaves a toast about something else', () => {
    toast.failure('f', { keys: ['a'], onRetry: vi.fn() })
    toast.dismissFor('b')
    expect(shown()?.text).toBe('f')
  })
})

describe('T2 replace', () => {
  it('a new toast replaces the old one with a new id', () => {
    toast.failure('first', { keys: ['a'], onRetry: vi.fn() })
    const first = shown()?.id
    toast.failure('second', { keys: ['b'], onRetry: vi.fn() })
    expect(shown()?.text).toBe('second')
    expect(shown()?.id).not.toBe(first)
    // A new op on the replaced toast's thing never closes the newer one.
    toast.dismissFor('a')
    expect(shown()?.text).toBe('second')
  })
})

describe('setLift (spec 4.1)', () => {
  it('lifts and lowers without touching the toast showing', () => {
    toast.failure('f', { keys: ['a'], onRetry: vi.fn() })
    toast.setLift(true)
    expect(toastStore.state.lifted).toBe(true)
    expect(shown()?.text).toBe('f')
    toast.failure('g', { keys: ['b'], onRetry: vi.fn() })
    expect(toastStore.state.lifted).toBe(true)
    toast.setLift(false)
    expect(toastStore.state.lifted).toBe(false)
    expect(shown()?.text).toBe('g')
  })
})
