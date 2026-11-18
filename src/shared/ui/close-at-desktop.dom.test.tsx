// @vitest-environment happy-dom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import type { Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { DESKTOP_QUERY } from '#/shared/ui/breakpoint'
import { useCloseAtDesktop } from '#/shared/ui/close-at-desktop'

// Stories 2.2 and 3.4: a phone sheet closes when the width crosses 1024px.

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean | undefined
}

let desktop = false
const listeners = new Set<() => void>()
let root: Root
let container: HTMLElement
const onOpenChange = vi.fn()

function Probe({ open }: { open: boolean }) {
  useCloseAtDesktop(open, onOpenChange)
  return null
}

async function render(open: boolean) {
  await act(async () => root.render(<Probe open={open} />))
}

async function crossTo(isDesktop: boolean) {
  desktop = isDesktop
  await act(async () => {
    for (const listener of listeners) listener()
  })
}

beforeEach(() => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true
  desktop = false
  listeners.clear()
  onOpenChange.mockClear()
  vi.spyOn(window, 'matchMedia').mockImplementation(
    (query: string) =>
      ({
        get matches() {
          return query === DESKTOP_QUERY && desktop
        },
        addEventListener: (_: string, listener: () => void) => {
          if (query === DESKTOP_QUERY) listeners.add(listener)
        },
        removeEventListener: (_: string, listener: () => void) => {
          listeners.delete(listener)
        },
      }) as unknown as MediaQueryList,
  )
  container = document.createElement('div')
  document.body.append(container)
  root = createRoot(container)
})

afterEach(async () => {
  await act(async () => root.unmount())
  container.remove()
  vi.restoreAllMocks()
  globalThis.IS_REACT_ACT_ENVIRONMENT = false
})

describe('useCloseAtDesktop', () => {
  it('closed: does not listen', async () => {
    await render(false)
    expect(listeners.size).toBe(0)
    await crossTo(true)
    expect(onOpenChange).not.toHaveBeenCalled()
  })

  it('open at phone width: closes once the width reaches desktop', async () => {
    await render(true)
    expect(listeners.size).toBe(1)
    expect(onOpenChange).not.toHaveBeenCalled()
    await crossTo(true)
    expect(onOpenChange).toHaveBeenCalledWith(false)
  })

  it('opened at desktop width: closes at once', async () => {
    desktop = true
    await render(true)
    expect(onOpenChange).toHaveBeenCalledWith(false)
  })

  it('stops listening once closed or unmounted', async () => {
    await render(true)
    await render(false)
    expect(listeners.size).toBe(0)
    await render(true)
    await act(async () => root.unmount())
    expect(listeners.size).toBe(0)
    root = createRoot(container)
  })
})
