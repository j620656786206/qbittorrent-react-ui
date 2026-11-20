// @vitest-environment happy-dom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import type { Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { DESKTOP_QUERY } from '#/shared/ui/breakpoint'
import {
  addOpenStore,
  openAdd,
  resetAddOpen,
  takeQueuedFiles,
} from '#/state/add-open'
import { pushEscapeLayer, resetShortcuts } from '#/state/shortcuts'
import { DROP_TEXT, DropOverlay } from '#/features/add/drop-overlay'

// Spec 4.6 D1 to D4: the desktop drop overlay. Drag events are built by
// hand with a `dataTransfer` stand-in (happy-dom has no drag and drop).

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean | undefined
}

let desktop: boolean
let root: Root

function drag(
  type: string,
  { types = ['Files'], files = [] as Array<File> } = {},
): Event {
  const event = new Event(type, { bubbles: true, cancelable: true })
  Object.defineProperty(event, 'dataTransfer', {
    value: { types, files, dropEffect: 'none' },
  })
  return event
}

async function fire(event: Event, target: EventTarget = document.body) {
  await act(async () => {
    target.dispatchEvent(event)
  })
}

const overlay = () => document.querySelector('[data-drop-overlay]')

async function render() {
  const host = document.createElement('div')
  document.body.append(host)
  root = createRoot(host)
  await act(async () => root.render(<DropOverlay />))
}

beforeEach(() => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true
  desktop = true
  vi.spyOn(window, 'matchMedia').mockImplementation(
    (query: string) =>
      ({
        matches: query === DESKTOP_QUERY ? desktop : false,
        media: query,
        addEventListener: () => {},
        removeEventListener: () => {},
      }) as unknown as MediaQueryList,
  )
  resetAddOpen()
  resetShortcuts()
})

afterEach(async () => {
  await act(async () => root.unmount())
  document.body.replaceChildren()
  resetAddOpen()
  resetShortcuts()
  vi.restoreAllMocks()
  globalThis.IS_REACT_ACT_ENVIRONMENT = false
})

describe('drop overlay', () => {
  it('D1: a file drag shows 放開就新增; the drop opens add with the files', async () => {
    await render()
    const enter = drag('dragenter')
    await fire(enter)
    expect(enter.defaultPrevented).toBe(true)
    expect(overlay()?.textContent).toBe(DROP_TEXT)
    expect(overlay()?.querySelector('[role="status"]')).not.toBeNull()
    // `status` is polite; no contradicting `aria-live`.
    expect(overlay()?.querySelector('[aria-live]')).toBeNull()
    const over = drag('dragover')
    await fire(over)
    expect(over.defaultPrevented).toBe(true)
    const file = new File(['d1:ae'], 'a.torrent')
    const drop = drag('drop', { files: [file] })
    await fire(drop)
    expect(drop.defaultPrevented).toBe(true)
    expect(overlay()).toBeNull()
    expect(addOpenStore.state.open).toBe(true)
    expect(takeQueuedFiles()).toEqual([file])
  })

  it('D1: a drop while add is open appends to the queue', async () => {
    await render()
    const first = new File(['x'], 'first.torrent')
    await act(async () => openAdd([first]))
    const second = new File(['y'], 'second.torrent')
    await fire(drag('dragenter'))
    await fire(drag('drop', { files: [second] }))
    expect(takeQueuedFiles()).toEqual([first, second])
  })

  it('D2: leaving the window or Esc hides it', async () => {
    await render()
    const inner = document.createElement('div')
    document.body.append(inner)
    await fire(drag('dragenter'))
    await fire(drag('dragenter'), inner)
    // Leaving the inner element only: still over the window.
    await fire(drag('dragleave'), inner)
    expect(overlay()).not.toBeNull()
    await fire(drag('dragleave'))
    expect(overlay()).toBeNull()
    await fire(drag('dragenter'))
    expect(overlay()).not.toBeNull()
    await fire(
      new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }),
      window,
    )
    expect(overlay()).toBeNull()
    expect(addOpenStore.state.open).toBe(false)
  })

  it('D3: a text drag shows nothing and keeps the browser default', async () => {
    await render()
    const enter = drag('dragenter', { types: ['text/plain'] })
    await fire(enter)
    expect(enter.defaultPrevented).toBe(false)
    expect(overlay()).toBeNull()
    const drop = drag('drop', { types: ['text/plain'] })
    await fire(drop)
    expect(drop.defaultPrevented).toBe(false)
    expect(addOpenStore.state.open).toBe(false)
  })

  it('D4: below 1024px no overlay and no add, but the file never opens in the tab', async () => {
    desktop = false
    await render()
    await fire(drag('dragenter'))
    expect(overlay()).toBeNull()
    const over = drag('dragover')
    await fire(over)
    expect(over.defaultPrevented).toBe(true)
    const drop = drag('drop', { files: [new File(['x'], 'a.torrent')] })
    await fire(drop)
    expect(drop.defaultPrevented).toBe(true)
    expect(addOpenStore.state.open).toBe(false)
    expect(takeQueuedFiles()).toEqual([])
  })

  it('over another dialog or sheet: no overlay, the drop is ignored but cancelled', async () => {
    await render()
    const removeLayer = pushEscapeLayer(() => {}, 'dialog')
    await fire(drag('dragenter'))
    await fire(drag('dragover'))
    expect(overlay()).toBeNull()
    const drop = drag('drop', { files: [new File(['x'], 'a.torrent')] })
    await fire(drop)
    expect(drop.defaultPrevented).toBe(true)
    expect(addOpenStore.state.open).toBe(false)
    expect(takeQueuedFiles()).toEqual([])
    removeLayer()
  })

  it('with add itself open (its own dialog layer) a drop still appends', async () => {
    await render()
    await act(async () => openAdd())
    const removeLayer = pushEscapeLayer(() => {}, 'dialog')
    await fire(drag('dragenter'))
    expect(overlay()).not.toBeNull()
    const file = new File(['x'], 'b.torrent')
    await fire(drag('drop', { files: [file] }))
    expect(takeQueuedFiles()).toEqual([file])
    removeLayer()
  })

  it('an Esc with no drag under way does not hide the next drag', async () => {
    await render()
    await fire(
      new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }),
      window,
    )
    await fire(drag('dragenter'))
    expect(overlay()).not.toBeNull()
  })

  it('after Esc a fresh drag shows it even when no dragleave came', async () => {
    await render()
    await fire(drag('dragenter'))
    await fire(drag('dragenter'))
    await fire(
      new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }),
      window,
    )
    expect(overlay()).toBeNull()
    // The OS drag was cancelled without dragleave or dragend; a new one:
    await fire(drag('dragenter'))
    expect(overlay()).not.toBeNull()
    // Its count starts again at 1: one dragleave ends it.
    await fire(drag('dragleave'))
    expect(overlay()).toBeNull()
  })

  it('after Esc it stays hidden until that drag ends', async () => {
    await render()
    await fire(drag('dragenter'))
    expect(overlay()).not.toBeNull()
    await fire(
      new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }),
      window,
    )
    expect(overlay()).toBeNull()
    await fire(drag('dragover'))
    await fire(drag('dragover'))
    expect(overlay()).toBeNull()
    // The drag leaves the window (depth back to 0): a new drag shows it.
    await fire(drag('dragleave'))
    await fire(drag('dragenter'))
    expect(overlay()).not.toBeNull()
    await fire(
      new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }),
      window,
    )
    await fire(new Event('dragend'), window)
    await fire(drag('dragenter'))
    expect(overlay()).not.toBeNull()
  })
})
