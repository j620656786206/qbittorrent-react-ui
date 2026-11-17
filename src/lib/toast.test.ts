import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { setToastLift, toast } from '#/lib/toast'
import {
  getToastState,
  pauseToast,
  resetToasts,
  resumeToast,
} from '#/shared/ui/toaster'

// Spec 2.6 rows T1 and T2 through the API features use, with fake timers.
// Node has no `window`, which the store reads as "server": stub one.

const shown = () => getToastState().toast

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

describe('T1 timing', () => {
  it('info is gone at 4 s', () => {
    toast.info('已複製')
    expect(shown()).toMatchObject({ kind: 'info', text: '已複製' })
    vi.advanceTimersByTime(3999)
    expect(shown()).not.toBeNull()
    vi.advanceTimersByTime(1)
    expect(shown()).toBeNull()
  })

  it('action is gone at 8 s', () => {
    toast.action('已搬到 影集媒體庫', {
      label: '接著改檔名',
      onAction: vi.fn(),
    })
    expect(shown()?.button?.label).toBe('接著改檔名')
    vi.advanceTimersByTime(7999)
    expect(shown()).not.toBeNull()
    vi.advanceTimersByTime(1)
    expect(shown()).toBeNull()
  })

  it('action: hover holds the countdown; leaving resumes with the time left', () => {
    toast.action('x', { label: '去看', onAction: vi.fn() })
    vi.advanceTimersByTime(3000)
    pauseToast()
    vi.advanceTimersByTime(60_000)
    expect(shown()).not.toBeNull()
    resumeToast()
    vi.advanceTimersByTime(4999)
    expect(shown()).not.toBeNull()
    vi.advanceTimersByTime(1)
    expect(shown()).toBeNull()
  })

  it('info ignores hover', () => {
    toast.info('x')
    pauseToast()
    vi.advanceTimersByTime(4000)
    expect(shown()).toBeNull()
  })

  it('failure stays until closed; its pill is 重試', () => {
    const onRetry = vi.fn()
    toast.failure('暫停失敗：qBittorrent 拒絕這個操作', { onRetry })
    vi.advanceTimersByTime(10 * 60_000)
    expect(shown()).toMatchObject({ kind: 'failure' })
    expect(shown()?.button?.label).toBe('重試')
    shown()?.button?.onPress()
    expect(onRetry).toHaveBeenCalledOnce()
  })
})

describe('failure dismiss handle', () => {
  it('closes its own toast while it shows', () => {
    const handle = toast.failure('f', { onRetry: vi.fn() })
    handle.dismiss()
    expect(shown()).toBeNull()
  })

  it('never closes a newer toast', () => {
    const handle = toast.failure('old', { onRetry: vi.fn() })
    toast.failure('new', { onRetry: vi.fn() })
    handle.dismiss()
    expect(shown()?.text).toBe('new')
  })
})

describe('T2 replace', () => {
  it('a new toast replaces the old one and gets its own timer', () => {
    toast.info('first')
    const first = shown()?.id
    vi.advanceTimersByTime(3000)
    toast.failure('second', { onRetry: vi.fn() })
    expect(shown()?.text).toBe('second')
    expect(shown()?.id).not.toBe(first)
    // The first one's 4 s must not close the second.
    vi.advanceTimersByTime(5000)
    expect(shown()?.text).toBe('second')
  })

  it('an info after a failure closes on its own 4 s', () => {
    toast.failure('f', { onRetry: vi.fn() })
    toast.info('i')
    vi.advanceTimersByTime(4000)
    expect(shown()).toBeNull()
  })
})

describe('lift', () => {
  it('defaults to 0; setToastLift sets a whole px height; 0 and junk reset', () => {
    expect(getToastState().lift).toBe(0)
    setToastLift(64.4)
    expect(getToastState().lift).toBe(64)
    setToastLift(0)
    expect(getToastState().lift).toBe(0)
    setToastLift(Number.NaN)
    expect(getToastState().lift).toBe(0)
    setToastLift(-20)
    expect(getToastState().lift).toBe(0)
  })
})
