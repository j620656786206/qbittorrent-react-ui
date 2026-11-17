// @vitest-environment happy-dom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import type { Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { TOAST_REGION_ATTR } from '#/shared/ui/toast-region'
import {
  Toaster,
  resetToasts,
  setToastLift,
  showToast,
} from '#/shared/ui/toaster'

// Spec 2.6: the renderer. Always-mounted live regions, the failure in the
// alert region, the looks from DESIGN toast, the pill and ✕, hover holding
// an `action` toast, a replacement replaying the entrance, and the lift.

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean | undefined
}

let root: Root
let host: HTMLElement

const region = () =>
  document.querySelector<HTMLElement>(`[${TOAST_REGION_ATTR}]`) as HTMLElement
const polite = () =>
  region().querySelector<HTMLElement>('[aria-live="polite"]') as HTMLElement
const alertBox = () =>
  region().querySelector<HTMLElement>('[role="alert"]') as HTMLElement
const card = () => document.querySelector<HTMLElement>('[data-slot="toast"]')
const button = (name: string) =>
  [...document.querySelectorAll('button')].find(
    (b) => b.textContent === name || b.getAttribute('aria-label') === name,
  ) as HTMLButtonElement

beforeEach(async () => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true
  vi.useFakeTimers()
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
  vi.useRealTimers()
  globalThis.IS_REACT_ACT_ENVIRONMENT = false
})

describe('the toaster', () => {
  it('mounts both live regions empty, marked as the toast region, above z-50', () => {
    expect(region()).not.toBeNull()
    expect(polite().childElementCount).toBe(0)
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
    expect(classes).toContain('lg:bottom-[var(--toast-bottom,24px)]')
    expect(classes).toContain('lg:w-[356px]')
  })

  it('info: text in the polite region, ✕ only, the DESIGN looks', async () => {
    await act(async () => showToast({ kind: 'info', text: '<b>plain</b>' }))
    expect(polite().contains(card())).toBe(true)
    expect(card()?.querySelector('p')?.textContent).toBe('<b>plain</b>')
    expect(card()?.querySelector('b')).toBeNull()
    expect(card()?.querySelectorAll('button')).toHaveLength(1)
    const close = button('關閉')
    expect(close.className).toContain('size-7')
    expect(close.className).toContain('text-text-muted')
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
  })

  it('failure: in the alert region with a 32px 重試 pill; pressing it closes, then retries', async () => {
    const onPress = vi.fn(() => {
      // Closed before the callback runs.
      expect(card()).toBeNull()
    })
    await act(async () =>
      showToast({
        kind: 'failure',
        text: '暫停失敗：qBittorrent 拒絕這個操作',
        button: { label: '重試', onPress },
      }),
    )
    expect(alertBox().contains(card())).toBe(true)
    expect(polite().childElementCount).toBe(0)
    const retry = button('重試')
    expect(retry.className).toContain('h-8')
    expect(retry.className).toContain('rounded-full')
    expect(retry.className).toContain('border')
    await act(async () => retry.click())
    expect(onPress).toHaveBeenCalledOnce()
    expect(card()).toBeNull()
  })

  it('✕ closes without running the callback', async () => {
    const onPress = vi.fn()
    await act(async () =>
      showToast({
        kind: 'failure',
        text: 'x',
        button: { label: '重試', onPress },
      }),
    )
    await act(async () => button('關閉').click())
    expect(card()).toBeNull()
    expect(onPress).not.toHaveBeenCalled()
  })

  it('action: the pointer over it holds the 8 s; leaving resumes', async () => {
    await act(async () =>
      showToast({
        kind: 'action',
        text: 'x',
        button: { label: '去看', onPress: vi.fn() },
      }),
    )
    await act(async () => vi.advanceTimersByTime(6000))
    const node = card() as HTMLElement
    await act(async () => {
      node.dispatchEvent(new PointerEvent('pointerover', { bubbles: true }))
    })
    await act(async () => vi.advanceTimersByTime(30_000))
    expect(card()).not.toBeNull()
    await act(async () => {
      node.dispatchEvent(new PointerEvent('pointerout', { bubbles: true }))
    })
    await act(async () => vi.advanceTimersByTime(1999))
    expect(card()).not.toBeNull()
    await act(async () => vi.advanceTimersByTime(1))
    expect(card()).toBeNull()
  })

  it('T2 a new toast replaces the old one with a new element (the entrance replays)', async () => {
    await act(async () => showToast({ kind: 'info', text: 'one' }))
    const first = card()
    await act(async () => showToast({ kind: 'info', text: 'two' }))
    expect(document.querySelectorAll('[data-slot="toast"]')).toHaveLength(1)
    expect(card()?.textContent).toContain('two')
    expect(card()).not.toBe(first)
  })

  it('lift: a CSS variable 16px above the bar, removed at 0', async () => {
    await act(async () => setToastLift(72))
    expect(region().style.getPropertyValue('--toast-bottom')).toBe('88px')
    await act(async () => setToastLift(0))
    expect(region().style.getPropertyValue('--toast-bottom')).toBe('')
  })
})
