// @vitest-environment happy-dom
import { act, useState } from 'react'
import { createRoot } from 'react-dom/client'
import type { Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { SheetRuntime, SheetSnap } from '#/shared/sheet'
import {
  BottomSheet,
  SHEET_EASING,
  SHEET_MOTION_MS,
  SheetRuntimeContext,
  bodyTouchAction,
  shouldDragSheet,
} from '#/shared/ui/bottom-sheet'
import { MAIN_ID } from '#/shared/ui/main-scroll'

// Spec 2.2 rows B1 to B5, B10, B14: the shared bottom sheet's wiring in a
// DOM. happy-dom has no layout, so the viewport height is stubbed and the
// snap decisions come from a stubbed runtime (src/lib/sheet-snap.test.ts
// covers the real ones).

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean | undefined
}

const VIEWPORT = 800
const REST = 400

let root: Root
let container: HTMLElement
let main: HTMLElement
let opener: HTMLButtonElement
let snap: SheetSnap
const release = vi.fn()
const runtime: SheetRuntime = {
  restHeight: vi.fn(() => REST),
  settle: vi.fn(() => snap),
  releaseVelocity: vi.fn(() => 0),
  holdOrder: vi.fn(() => release),
}
const onOpenChange = vi.fn()

function Harness({ initial = true }: { initial?: boolean }) {
  const [open, setOpen] = useState(initial)
  return (
    <SheetRuntimeContext value={runtime}>
      <button type="button" id="reopen" onClick={() => setOpen(true)}>
        open
      </button>
      <BottomSheet
        open={open}
        onOpenChange={(next) => {
          onOpenChange(next)
          setOpen(next)
        }}
        title="排序"
      >
        <button type="button">第一個</button>
        <button type="button">最後一個</button>
      </BottomSheet>
    </SheetRuntimeContext>
  )
}

async function mount(initial = true) {
  await act(async () => root.render(<Harness initial={initial} />))
}

const dialog = () => document.querySelector<HTMLElement>('[role="dialog"]')
const scrim = () =>
  document.querySelector<HTMLElement>('[data-slot="bottom-sheet-scrim"]')
const content = () =>
  document.querySelector<HTMLElement>('[data-slot="bottom-sheet-content"]')
const closeButton = () =>
  document.querySelector<HTMLButtonElement>('button[aria-label="關閉"]')
const handle = () =>
  dialog()?.querySelector<HTMLElement>('[aria-hidden="true"]') ?? null

function pointer(
  target: Element,
  type: string,
  clientY: number,
  timeStamp = 0,
) {
  const event = new PointerEvent(type, {
    bubbles: true,
    cancelable: true,
    clientY,
    pointerId: 1,
    isPrimary: true,
    pointerType: 'touch',
  })
  Object.defineProperty(event, 'timeStamp', { value: timeStamp })
  target.dispatchEvent(event)
}

async function drag(target: Element, from: number, to: number) {
  await act(async () => {
    pointer(target, 'pointerdown', from)
    pointer(target, 'pointermove', from + Math.sign(to - from) * 10, 10)
    pointer(target, 'pointermove', to, 20)
    pointer(target, 'pointerup', to, 30)
  })
}

let reducedMotion = true

beforeEach(() => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true
  vi.clearAllMocks()
  snap = 'rest'
  reducedMotion = true
  vi.spyOn(window, 'matchMedia').mockImplementation(
    (query: string) =>
      ({
        matches: query.includes('reduce') && reducedMotion,
        media: query,
        addEventListener: () => {},
        removeEventListener: () => {},
      }) as unknown as MediaQueryList,
  )
  // The sheet is a fixed box as tall as the screen.
  vi.spyOn(HTMLElement.prototype, 'offsetHeight', 'get').mockImplementation(
    function (this: HTMLElement) {
      return this.getAttribute('role') === 'dialog' ? VIEWPORT : 0
    },
  )
  main = document.createElement('main')
  main.id = MAIN_ID
  document.body.append(main)
  opener = document.createElement('button')
  document.body.append(opener)
  opener.focus()
  container = document.createElement('div')
  document.body.append(container)
  root = createRoot(container)
})

afterEach(async () => {
  await act(async () => root.unmount())
  container.remove()
  main.remove()
  opener.remove()
  vi.restoreAllMocks()
  globalThis.IS_REACT_ACT_ENVIRONMENT = false
})

describe('B1 open', () => {
  it('a modal dialog named by its title, scrim behind, focus inside on ✕', async () => {
    await mount()
    const sheet = dialog()
    expect(sheet).not.toBeNull()
    expect(sheet?.getAttribute('aria-modal')).toBe('true')
    const titleId = sheet?.getAttribute('aria-labelledby') ?? ''
    expect(document.getElementById(titleId)?.textContent).toBe('排序')
    expect(scrim()).not.toBeNull()
    expect(document.activeElement).toBe(closeButton())
    // Rests at the viewport height minus the rest height.
    expect(sheet?.style.transform).toBe(
      `translate3d(0, ${VIEWPORT - REST}px, 0)`,
    )
    expect(sheet?.style.paddingBottom).toBe(`${VIEWPORT - REST}px`)
  })

  it('holds the list order while open (B9) and locks the page scroll (B14)', async () => {
    await mount()
    expect(runtime.holdOrder).toHaveBeenCalledTimes(1)
    expect(release).not.toHaveBeenCalled()
    for (const element of [document.documentElement, document.body, main]) {
      expect(element.style.overflow).toBe('hidden')
    }
    await act(async () => closeButton()?.click())
    expect(release).toHaveBeenCalledTimes(1)
    for (const element of [document.documentElement, document.body, main]) {
      expect(element.style.overflow).toBe('')
    }
  })

  it('a closed sheet renders nothing and needs no runtime', async () => {
    await act(async () =>
      root.render(
        <BottomSheet open={false} onOpenChange={() => {}} title="排序">
          x
        </BottomSheet>,
      ),
    )
    expect(dialog()).toBeNull()
  })
})

describe('B2 close', () => {
  it.each([
    ['✕', () => closeButton()?.click()],
    ['the scrim', () => scrim()?.click()],
    [
      'Esc',
      () =>
        dialog()?.dispatchEvent(
          new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }),
        ),
    ],
  ] as const)(
    '%s closes and focus goes back to the opener',
    async (_, act_) => {
      await mount()
      await act(async () => act_())
      expect(onOpenChange).toHaveBeenLastCalledWith(false)
      expect(dialog()).toBeNull()
      expect(document.activeElement).toBe(opener)
    },
  )

  it('Tab wraps inside the sheet', async () => {
    await mount()
    const buttons = [...(dialog()?.querySelectorAll('button') ?? [])]
    const last = buttons[buttons.length - 1]
    last.focus()
    const tab = new KeyboardEvent('keydown', {
      key: 'Tab',
      bubbles: true,
      cancelable: true,
    })
    await act(async () => last.dispatchEvent(tab))
    expect(tab.defaultPrevented).toBe(true)
    expect(document.activeElement).toBe(buttons[0])
  })

  it('focus that leaves the sheet is pulled back', async () => {
    await mount()
    await act(async () => opener.focus())
    expect(dialog()?.contains(document.activeElement)).toBe(true)
  })
})

describe('B3 to B5 drag', () => {
  it('B3 the handle drag follows the finger with transform only', async () => {
    await mount()
    const sheet = dialog() as HTMLElement
    await act(async () => {
      pointer(handle() as Element, 'pointerdown', 500)
      pointer(handle() as Element, 'pointermove', 510, 10)
      pointer(sheet, 'pointermove', 600, 20)
    })
    expect(sheet.style.transform).toBe(
      `translate3d(0, ${VIEWPORT - REST + 90}px, 0)`,
    )
    expect(sheet.style.paddingBottom).toBe(`${VIEWPORT - REST}px`)
  })

  it('B3 released past the threshold closes; below it springs back', async () => {
    await mount()
    snap = 'rest'
    await drag(handle() as Element, 500, 560)
    expect(runtime.settle).toHaveBeenLastCalledWith(
      expect.objectContaining({
        mode: 'fit',
        expanded: false,
        restHeight: REST,
        viewportHeight: VIEWPORT,
        distance: 50,
      }),
    )
    expect(dialog()?.style.transform).toBe(
      `translate3d(0, ${VIEWPORT - REST}px, 0)`,
    )
    snap = 'close'
    await drag(handle() as Element, 500, 700)
    expect(onOpenChange).toHaveBeenLastCalledWith(false)
    expect(dialog()).toBeNull()
    expect(document.activeElement).toBe(opener)
  })

  it('B4 a drag down in scrolled content scrolls it, the sheet stays', () => {
    expect(
      shouldDragSheet({
        inBody: true,
        dy: 40,
        scrollTop: 120,
        canScroll: true,
        expanded: false,
      }),
    ).toBe(false)
    expect(
      shouldDragSheet({
        inBody: true,
        dy: 40,
        scrollTop: 0,
        canScroll: true,
        expanded: false,
      }),
    ).toBe(true)
    // Up in scrollable content scrolls; up in short content expands.
    expect(
      shouldDragSheet({
        inBody: true,
        dy: -40,
        scrollTop: 0,
        canScroll: true,
        expanded: false,
      }),
    ).toBe(false)
    expect(
      shouldDragSheet({
        inBody: true,
        dy: -40,
        scrollTop: 0,
        canScroll: false,
        expanded: false,
      }),
    ).toBe(true)
    // The handle and title always drag.
    expect(
      shouldDragSheet({
        inBody: false,
        dy: 40,
        scrollTop: 120,
        canScroll: true,
        expanded: true,
      }),
    ).toBe(true)
    expect(bodyTouchAction({ scrollTop: 0, canScroll: false })).toBe('none')
    expect(bodyTouchAction({ scrollTop: 0, canScroll: true })).toBe('pan-down')
    expect(bodyTouchAction({ scrollTop: 5, canScroll: true })).toBe('pan-y')
  })

  it('B4 in the DOM: content scrolled down, a downward drag never settles', async () => {
    await mount()
    const body = content() as HTMLElement
    vi.spyOn(body, 'scrollTop', 'get').mockReturnValue(120)
    vi.spyOn(body, 'scrollHeight', 'get').mockReturnValue(2000)
    vi.spyOn(body, 'clientHeight', 'get').mockReturnValue(300)
    const row = body.querySelector('button') as HTMLElement
    await drag(row, 300, 400)
    expect(runtime.settle).not.toHaveBeenCalled()
    expect(dialog()?.style.transform).toBe(
      `translate3d(0, ${VIEWPORT - REST}px, 0)`,
    )
  })

  it('a drag that started on a row does not click it', async () => {
    await mount()
    const row = content()?.querySelector('button') as HTMLButtonElement
    const onClick = vi.fn()
    row.addEventListener('click', onClick)
    await act(async () => {
      pointer(row, 'pointerdown', 300)
      pointer(row, 'pointermove', 280, 10)
      pointer(row, 'pointermove', 250, 20)
      pointer(row, 'pointerup', 250, 30)
      row.click()
    })
    expect(onClick).not.toHaveBeenCalled()
    // The next tap clicks.
    await act(async () => {
      pointer(row, 'pointerdown', 300)
      pointer(row, 'pointerup', 300, 10)
      row.click()
    })
    expect(onClick).toHaveBeenCalledTimes(1)
  })

  it('B5 up to full screen: offset 0, corners 0, safe-area padding, handle stays', async () => {
    await mount()
    snap = 'full'
    await drag(handle() as Element, 500, 300)
    const sheet = dialog() as HTMLElement
    expect(sheet.style.transform).toBe('translate3d(0, 0px, 0)')
    expect(sheet.dataset.fullScreen).toBe('true')
    expect(sheet.className).toContain('rounded-none')
    expect(sheet.className).toContain('pt-[env(safe-area-inset-top)]')
    expect(sheet.className).not.toContain('rounded-t-sheet')
    expect(sheet.style.paddingBottom).toBe('0px')
    expect(handle()?.querySelector('span')).not.toBeNull()
    // From full screen the next release reports `expanded`.
    snap = 'rest'
    await drag(handle() as Element, 100, 200)
    expect(runtime.settle).toHaveBeenLastCalledWith(
      expect.objectContaining({ expanded: true, distance: 90 }),
    )
    expect(sheet.dataset.fullScreen).toBeUndefined()
  })
})

describe('B10 motion', () => {
  function fakeAnimate() {
    const calls: Array<[Array<Keyframe>, KeyframeAnimationOptions]> = []
    const animate = vi.fn(function (
      this: Element,
      keyframes: Array<Keyframe>,
      options: KeyframeAnimationOptions,
    ) {
      calls.push([keyframes, options])
      const animation = {
        onfinish: null as null | (() => void),
        cancel: vi.fn(),
      }
      return animation as unknown as Animation
    })
    Object.defineProperty(HTMLElement.prototype, 'animate', {
      configurable: true,
      value: animate,
    })
    return { animate, calls }
  }

  afterEach(() => {
    Reflect.deleteProperty(HTMLElement.prototype, 'animate')
  })

  it('opens with a 0.55 s slide from 60% below its rest and a scrim fade', async () => {
    reducedMotion = false
    const { calls } = fakeAnimate()
    await mount()
    const slide = calls.find(([frames]) => 'transform' in frames[0])
    expect(slide?.[0]).toEqual([
      { transform: `translate3d(0, ${VIEWPORT - REST + REST * 0.6}px, 0)` },
      { transform: `translate3d(0, ${VIEWPORT - REST}px, 0)` },
    ])
    expect(slide?.[1]).toEqual({
      duration: SHEET_MOTION_MS,
      easing: SHEET_EASING,
    })
    const fade = calls.find(([frames]) => 'opacity' in frames[0])
    expect(fade?.[0]).toEqual([{ opacity: 0 }, { opacity: 1 }])
  })

  it('reduced motion: no animation on open, release or close; drag still follows', async () => {
    reducedMotion = true
    const { animate } = fakeAnimate()
    await mount()
    snap = 'rest'
    await act(async () => {
      pointer(handle() as Element, 'pointerdown', 500)
      pointer(handle() as Element, 'pointermove', 520, 10)
      pointer(handle() as Element, 'pointermove', 540, 20)
    })
    expect(dialog()?.style.transform).toBe(
      `translate3d(0, ${VIEWPORT - REST + 20}px, 0)`,
    )
    await act(async () => pointer(handle() as Element, 'pointerup', 540, 30))
    // A later click (not the one the release makes) works again.
    await act(() => new Promise((resolve) => setTimeout(resolve, 0)))
    await act(async () => closeButton()?.click())
    expect(animate).not.toHaveBeenCalled()
    expect(dialog()).toBeNull()
  })

  it('closing waits for the slide, inert, then unmounts', async () => {
    reducedMotion = false
    const { calls, animate } = fakeAnimate()
    await mount()
    await act(async () => closeButton()?.click())
    expect(dialog()).not.toBeNull()
    expect(dialog()?.hasAttribute('inert')).toBe(true)
    expect(document.activeElement).toBe(opener)
    const out = animate.mock.results.at(-1)?.value as {
      onfinish: (() => void) | null
    }
    expect(calls.at(-1)?.[0].at(-1)).toEqual({
      transform: `translate3d(0, ${VIEWPORT}px, 0)`,
    })
    await act(async () => out.onfinish?.())
    expect(dialog()).toBeNull()
  })

  it('B2 reopen while closing: a fresh open, focus inside, no fade-out left on the scrim', async () => {
    reducedMotion = false
    const { calls, animate } = fakeAnimate()
    await mount()
    await act(async () => closeButton()?.click())
    expect(dialog()?.getAttribute('data-state')).toBe('closing')
    // The scrim stops catching taps during the slide.
    expect(scrim()?.className).toContain('pointer-events-none')
    const fadeOutIndex = calls.findIndex(
      ([frames, options]) =>
        'opacity' in frames[0] && options.fill === 'forwards',
    )
    expect(fadeOutIndex).toBeGreaterThan(-1)
    const fadeOut = animate.mock.results[fadeOutIndex].value as {
      cancel: ReturnType<typeof vi.fn>
    }
    await act(async () =>
      document.querySelector<HTMLButtonElement>('#reopen')?.click(),
    )
    expect(dialog()?.getAttribute('data-state')).toBe('open')
    expect(fadeOut.cancel).toHaveBeenCalled()
    expect(scrim()?.className).not.toContain('pointer-events-none')
    expect(dialog()?.contains(document.activeElement)).toBe(true)
    expect(dialog()?.hasAttribute('inert')).toBe(false)
  })
})

describe('page around the sheet', () => {
  it('unmounted while open: the freeze ends and the scroll lock is undone', async () => {
    await mount()
    await act(async () => root.unmount())
    expect(release).toHaveBeenCalledTimes(1)
    for (const element of [document.documentElement, document.body, main]) {
      expect(element.style.overflow).toBe('')
    }
    root = createRoot(container)
  })

  it('the rest of the page is inert while open, as it was after', async () => {
    const already = document.createElement('div')
    already.setAttribute('inert', '')
    document.body.append(already)
    await mount()
    for (const element of [container, main, opener, already]) {
      expect(element.hasAttribute('inert'), element.tagName).toBe(true)
    }
    expect(dialog()?.hasAttribute('inert')).toBe(false)
    expect(scrim()?.hasAttribute('inert')).toBe(false)
    await act(async () => closeButton()?.click())
    for (const element of [container, main, opener]) {
      expect(element.hasAttribute('inert'), element.tagName).toBe(false)
    }
    expect(already.hasAttribute('inert')).toBe(true)
    expect(document.activeElement).toBe(opener)
    already.remove()
  })

  it("the content's touch-action: none when short, pan-down at the top, pan-y once scrolled", async () => {
    await mount()
    const body = content() as HTMLElement
    expect(body.style.touchAction).toBe('none')
    let top = 0
    vi.spyOn(body, 'scrollTop', 'get').mockImplementation(() => top)
    vi.spyOn(body, 'scrollHeight', 'get').mockReturnValue(2000)
    vi.spyOn(body, 'clientHeight', 'get').mockReturnValue(300)
    await act(async () => body.dispatchEvent(new Event('scroll')))
    expect(body.style.touchAction).toBe('pan-down')
    top = 40
    await act(async () => body.dispatchEvent(new Event('scroll')))
    expect(body.style.touchAction).toBe('pan-y')
  })

  it('a press that turned into a scroll past the slop does not click its row', async () => {
    await mount()
    const body = content() as HTMLElement
    vi.spyOn(body, 'scrollHeight', 'get').mockReturnValue(2000)
    vi.spyOn(body, 'clientHeight', 'get').mockReturnValue(300)
    const row = body.querySelector('button') as HTMLButtonElement
    const onClick = vi.fn()
    row.addEventListener('click', onClick)
    // Up in scrollable content is a scroll, not a drag.
    await act(async () => {
      pointer(row, 'pointerdown', 300)
      pointer(row, 'pointermove', 280, 10)
      pointer(row, 'pointerup', 280, 20)
      row.click()
    })
    expect(onClick).not.toHaveBeenCalled()
    expect(runtime.settle).not.toHaveBeenCalled()
  })
})
