// @vitest-environment happy-dom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import type { Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  resetToasts,
  setToastLift,
  showFailureToast,
  showPlainToast,
} from '#/shared/toast-store'
import {
  TOAST_LIFT_CLASS,
  TOAST_REGION_ATTR,
  Toaster,
} from '#/shared/ui/toaster'

// Spec 2.6: the renderer. An always-mounted alert region, the looks from
// DESIGN toast, the 重試 pill and ✕, and a replacement replaying the
// entrance.

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean | undefined
}

let root: Root
let host: HTMLElement

const region = () =>
  document.querySelector<HTMLElement>(`[${TOAST_REGION_ATTR}]`) as HTMLElement
const alertBox = () =>
  region().querySelector<HTMLElement>('[role="alert"]') as HTMLElement
const card = () => document.querySelector<HTMLElement>('[data-slot="toast"]')
const button = (name: string) =>
  [...document.querySelectorAll('button')].find(
    (b) => b.textContent === name || b.getAttribute('aria-label') === name,
  ) as HTMLButtonElement

beforeEach(async () => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true
  resetToasts()
  host = document.createElement('div')
  document.body.append(host)
  root = createRoot(host)
  await act(async () => root.render(<Toaster />))
})

afterEach(async () => {
  await act(async () => root.unmount())
  resetToasts()
  document.body.replaceChildren()
  globalThis.IS_REACT_ACT_ENVIRONMENT = false
})

describe('the toaster', () => {
  it('mounts the alert region empty, marked as the toast region, above z-50', () => {
    expect(region()).not.toBeNull()
    expect(alertBox().childElementCount).toBe(0)
    expect(region().className).toContain('z-[60]')
    expect(region().getAttribute('style')).toBeNull()
  })

  it('places it: phone top with 16px sides, desktop bottom right 24px, 356px wide', () => {
    const classes = region().className
    expect(classes).toContain('fixed')
    expect(classes).toContain('inset-x-4')
    expect(classes).toContain('top-[calc(16px+env(safe-area-inset-top))]')
    expect(classes).toContain('lg:right-6')
    expect(classes).toContain('lg:bottom-6')
    expect(classes).toContain('lg:w-[356px]')
  })

  it('failure: plain text in the alert region, the DESIGN looks, a 32px 重試 pill; pressing it closes, then retries', async () => {
    const retry = vi.fn(() => {
      // Closed before the callback runs.
      expect(card()).toBeNull()
    })
    await act(async () => showFailureToast('<b>plain</b>', ['a'], retry))
    expect(alertBox().contains(card())).toBe(true)
    expect(card()?.querySelector('p')?.textContent).toBe('<b>plain</b>')
    expect(card()?.querySelector('b')).toBeNull()
    const look = card()?.className ?? ''
    for (const token of [
      'bg-surface',
      'border',
      'rounded-card',
      'shadow-float',
      'py-3',
      'pr-2',
      'pl-[18px]',
      'animate-rise',
    ]) {
      expect(look).toContain(token)
    }
    expect(card()?.querySelector('p')?.className).toContain('text-[13px]')
    expect(card()?.querySelector('p')?.className).toContain('font-semibold')
    const close = button('關閉')
    expect(close.className).toContain('size-7')
    expect(close.className).toContain('text-text-muted')
    const pill = button('重試')
    expect(pill.className).toContain('h-8')
    expect(pill.className).toContain('rounded-full')
    expect(pill.className).toContain('border')
    await act(async () => pill.click())
    expect(retry).toHaveBeenCalledOnce()
    expect(card()).toBeNull()
  })

  it('4.3 plain: the same card in a polite status region, ✕ but no 重試, gone after 4 s', async () => {
    vi.useFakeTimers()
    try {
      await act(async () => showPlainToast('已刪除 3 個種子和檔案（301.2 GB）'))
      const status = region().querySelector('[role="status"]')
      expect(status?.contains(card())).toBe(true)
      expect(alertBox().childElementCount).toBe(0)
      expect(card()?.textContent).toContain('已刪除 3 個種子和檔案（301.2 GB）')
      expect(card()?.className).toContain('rounded-card')
      expect(button('重試')).toBeUndefined()
      expect(button('關閉')).toBeDefined()
      await act(async () => vi.advanceTimersByTime(4000))
      expect(card()).toBeNull()
    } finally {
      vi.useRealTimers()
    }
  })

  it('✕ closes without running the callback', async () => {
    const retry = vi.fn()
    await act(async () => showFailureToast('x', ['a'], retry))
    await act(async () => button('關閉').click())
    expect(card()).toBeNull()
    expect(retry).not.toHaveBeenCalled()
  })

  it('T2 a new toast replaces the old one with a new element (the entrance replays)', async () => {
    await act(async () => showFailureToast('one', ['a'], vi.fn()))
    const first = card()
    await act(async () => showFailureToast('two', ['b'], vi.fn()))
    expect(document.querySelectorAll('[data-slot="toast"]')).toHaveLength(1)
    expect(card()?.textContent).toContain('two')
    expect(card()).not.toBe(first)
  })

  it('4.1 lifted: 68px up on desktop with a transform transition, none under reduced motion, no style attribute', async () => {
    const classes = () => region().className.split(' ')
    expect(classes()).not.toContain(TOAST_LIFT_CLASS)
    expect(classes()).toContain('lg:transition-transform')
    expect(classes()).toContain('lg:duration-300')
    expect(classes()).toContain('lg:ease-[cubic-bezier(0.2,0.8,0.2,1)]')
    expect(classes()).toContain('lg:motion-reduce:transition-none')
    await act(async () => setToastLift(true))
    expect(TOAST_LIFT_CLASS).toBe('lg:-translate-y-[68px]')
    expect(classes()).toContain(TOAST_LIFT_CLASS)
    expect(region().getAttribute('style')).toBeNull()
    await act(async () => setToastLift(false))
    expect(classes()).not.toContain(TOAST_LIFT_CLASS)
  })
})
