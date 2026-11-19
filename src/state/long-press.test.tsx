// @vitest-environment happy-dom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import type { Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { LONG_PRESS_VIBRATE_MS, useLongPress } from '#/state/long-press'

// Spec 4.2: the long press on pointer events, with fake timers and the
// matrix rows: a still hold fires once (one buzz, the release's click
// swallowed), 11px within 500 ms cancels, a 6px wobble fires, a short tap
// clicks as before; the release, pointercancel, a lost capture, a scroll
// and unmounting cancel; contextmenu is prevented only around a press.

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean | undefined
}

let root: Root
let host: HTMLElement
const onFire = vi.fn()
const onClick = vi.fn()

function Target({ enabled }: { enabled: boolean }) {
  const press = useLongPress({ enabled, onFire })
  return (
    <>
      <button type="button" data-target="" onClick={onClick} {...press}>
        <span data-inner="">row</span>
      </button>
      <button type="button" data-other="" onClick={onClick}>
        other
      </button>
    </>
  )
}

async function render(enabled = true) {
  await act(async () => root.render(<Target enabled={enabled} />))
}

const target = () => host.querySelector('[data-target]') as HTMLElement
const other = () => host.querySelector('[data-other]') as HTMLElement

function pointer(
  type:
    | 'pointerdown'
    | 'pointermove'
    | 'pointerup'
    | 'pointercancel'
    | 'lostpointercapture',
  { x = 100, y = 100, id = 1, primary = true, kind = 'touch', button = 0 } = {},
  element: Element = target(),
) {
  element.dispatchEvent(
    new PointerEvent(type, {
      bubbles: true,
      cancelable: true,
      pointerId: id,
      pointerType: kind,
      isPrimary: primary,
      button,
      clientX: x,
      clientY: y,
    }),
  )
}

/** What the browser sends after a release on `element`. */
function click(element: Element = target()) {
  element.dispatchEvent(
    new MouseEvent('click', { bubbles: true, cancelable: true }),
  )
}

function contextMenu(): boolean {
  const event = new MouseEvent('contextmenu', {
    bubbles: true,
    cancelable: true,
  })
  target().dispatchEvent(event)
  return event.defaultPrevented
}

async function advance(ms: number) {
  await act(async () => {
    vi.advanceTimersByTime(ms)
  })
}

let vibrate: ReturnType<typeof vi.fn>

beforeEach(() => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true
  vi.useFakeTimers()
  onFire.mockReset()
  onClick.mockReset()
  vibrate = vi.fn(() => true)
  Object.defineProperty(navigator, 'vibrate', {
    configurable: true,
    value: vibrate,
  })
  host = document.createElement('div')
  document.body.append(host)
  root = createRoot(host)
})

afterEach(async () => {
  await act(async () => root.unmount())
  host.remove()
  Reflect.deleteProperty(navigator, 'vibrate')
  vi.useRealTimers()
  globalThis.IS_REACT_ACT_ENVIRONMENT = false
})

describe('useLongPress', () => {
  it('matrix long press: held still 500 ms fires once with one short buzz; the release opens nothing', async () => {
    await render()
    pointer('pointerdown')
    await advance(499)
    expect(onFire).not.toHaveBeenCalled()
    await advance(1)
    expect(onFire).toHaveBeenCalledTimes(1)
    expect(vibrate).toHaveBeenCalledTimes(1)
    expect(vibrate).toHaveBeenCalledWith(LONG_PRESS_VIBRATE_MS)
    expect(LONG_PRESS_VIBRATE_MS).toBeLessThanOrEqual(20)
    await advance(2000)
    expect(onFire).toHaveBeenCalledTimes(1)
    pointer('pointerup')
    click()
    expect(onClick).not.toHaveBeenCalled()
    // Only that one click: the next tap clicks again.
    pointer('pointerdown')
    pointer('pointerup')
    click()
    expect(onClick).toHaveBeenCalledTimes(1)
  })

  it('a press on an inner element counts (the handlers sit on the row button)', async () => {
    await render()
    pointer('pointerdown', {}, host.querySelector('[data-inner]') as Element)
    await advance(500)
    expect(onFire).toHaveBeenCalledTimes(1)
  })

  it('vibrate missing: no call, no error; vibrate throwing: no error', async () => {
    Reflect.deleteProperty(navigator, 'vibrate')
    await render()
    pointer('pointerdown')
    await advance(500)
    expect(onFire).toHaveBeenCalledTimes(1)
    pointer('pointerup')

    Object.defineProperty(navigator, 'vibrate', {
      configurable: true,
      value: () => {
        throw new Error('blocked')
      },
    })
    pointer('pointerdown')
    await advance(500)
    expect(onFire).toHaveBeenCalledTimes(2)
  })

  it('matrix scroll, not press: 11px within 500 ms cancels', async () => {
    await render()
    pointer('pointerdown')
    await advance(100)
    pointer('pointermove', { y: 111 })
    await advance(1000)
    expect(onFire).not.toHaveBeenCalled()
  })

  it('a diagonal 8, 7 (about 10.6px) cancels too', async () => {
    await render()
    pointer('pointerdown')
    pointer('pointermove', { x: 108, y: 93 })
    await advance(1000)
    expect(onFire).not.toHaveBeenCalled()
  })

  it('matrix small wobble: 6px, then 500 ms, fires', async () => {
    await render()
    pointer('pointerdown')
    await advance(200)
    pointer('pointermove', { x: 106 })
    pointer('pointermove', { x: 104, y: 103 })
    await advance(300)
    expect(onFire).toHaveBeenCalledTimes(1)
  })

  it('matrix short tap: released at 200 ms, nothing fires and the click goes through', async () => {
    await render()
    pointer('pointerdown')
    await advance(200)
    pointer('pointerup')
    click()
    await advance(1000)
    expect(onFire).not.toHaveBeenCalled()
    expect(onClick).toHaveBeenCalledTimes(1)
  })

  it('pointercancel, a lost capture, or a scroll before 500 ms cancels', async () => {
    await render()
    pointer('pointerdown')
    pointer('pointercancel')
    await advance(600)

    pointer('pointerdown')
    pointer('lostpointercapture')
    await advance(600)

    pointer('pointerdown')
    const scroller = document.createElement('div')
    host.append(scroller)
    scroller.dispatchEvent(new Event('scroll'))
    await advance(600)
    expect(onFire).not.toHaveBeenCalled()
  })

  it('unmounting cancels a pending press', async () => {
    await render()
    pointer('pointerdown')
    await act(async () => root.unmount())
    await advance(600)
    expect(onFire).not.toHaveBeenCalled()
    root = createRoot(host)
  })

  it('disabled (something selected): a press is an ordinary tap', async () => {
    await render(false)
    pointer('pointerdown')
    await advance(600)
    pointer('pointerup')
    click()
    expect(onFire).not.toHaveBeenCalled()
    expect(onClick).toHaveBeenCalledTimes(1)
  })

  it('turning disabled mid-press cancels it', async () => {
    await render()
    pointer('pointerdown')
    await advance(200)
    await render(false)
    await advance(600)
    expect(onFire).not.toHaveBeenCalled()
  })

  it('only a primary pointer, and a mouse only with its main button', async () => {
    await render()
    pointer('pointerdown', { primary: false })
    await advance(600)
    pointer('pointerdown', { kind: 'mouse', button: 2 })
    await advance(600)
    expect(onFire).not.toHaveBeenCalled()
    pointer('pointerdown', { kind: 'mouse' })
    await advance(500)
    expect(onFire).toHaveBeenCalledTimes(1)
  })

  it('another pointer moving or lifting does not touch the press', async () => {
    await render()
    pointer('pointerdown')
    pointer('pointermove', { id: 2, y: 300 })
    pointer('pointerup', { id: 2 })
    await advance(500)
    expect(onFire).toHaveBeenCalledTimes(1)
  })

  it('contextmenu is prevented while a press is pending or has fired, not otherwise', async () => {
    await render()
    expect(contextMenu()).toBe(false)
    pointer('pointerdown')
    expect(contextMenu()).toBe(true)
    await advance(500)
    expect(contextMenu()).toBe(true)
    pointer('pointerup')
    click()
    expect(contextMenu()).toBe(false)
  })

  it('no click after the release: the swallow ends with the next press, so that tap clicks', async () => {
    await render()
    pointer('pointerdown')
    await advance(500)
    pointer('pointerup')
    pointer('pointerdown', {}, other())
    pointer('pointerup', {}, other())
    click(other())
    expect(onClick).toHaveBeenCalledTimes(1)
  })

  it('no click after the release: the swallow ends shortly after it (a keyboard click later goes through)', async () => {
    await render()
    pointer('pointerdown')
    await advance(500)
    pointer('pointerup')
    await advance(400)
    click(other())
    expect(onClick).toHaveBeenCalledTimes(1)
  })

  it('a lost capture after firing (the board swipe took the pointer, no release here) ends the swallow shortly after', async () => {
    await render()
    pointer('pointerdown')
    await advance(500)
    pointer('lostpointercapture')
    await advance(399)
    expect(contextMenu()).toBe(true)
    await advance(1)
    expect(contextMenu()).toBe(false)
    click(other())
    expect(onClick).toHaveBeenCalledTimes(1)
  })

  it('a pointercancel after firing (the browser took the finger) ends the swallow at once', async () => {
    await render()
    pointer('pointerdown')
    await advance(500)
    pointer('pointercancel')
    click(other())
    expect(onClick).toHaveBeenCalledTimes(1)
    expect(contextMenu()).toBe(false)
  })
})
