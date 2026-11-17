// @vitest-environment happy-dom
import { act, useState } from 'react'
import { createRoot } from 'react-dom/client'
import type { Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  BottomSheet,
  SHEET_EASING,
  SHEET_MOTION_MS,
} from '#/shared/ui/bottom-sheet'
import { LIST_SCROLL_ID, MAIN_ID } from '#/shared/ui/main-scroll'
import { bodyTouchAction, shouldDragSheet } from '#/shared/ui/sheet-drag'
import { TOAST_REGION_ATTR } from '#/shared/ui/toast-region'

// Spec 2.2 rows B1 to B5, B10, B14: the shared bottom sheet's wiring in a
// DOM, with the real snap decisions (src/shared/ui/sheet-snap.test.ts covers
// them per mode). happy-dom has no layout, so the viewport and the content
// heights are stubbed: a `fit` sheet with 400px of content rests at 400px.
// Holding the list order and Esc are the caller's (useSheetLayer;
// sort-sheet.dom.test.tsx).

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean | undefined
}

const VIEWPORT = 800
const REST = 400

let root: Root
let container: HTMLElement
let main: HTMLElement
/** The list's own scroller (story 2.4), inside `main` as in the app. */
let listScroll: HTMLElement
/** Everything the scroll lock must hold still. */
const scrollers = () => [
  document.documentElement,
  document.body,
  main,
  listScroll,
]
let opener: HTMLButtonElement
const onOpenChange = vi.fn()

function Harness({ initial = true }: { initial?: boolean }) {
  const [open, setOpen] = useState(initial)
  return (
    <>
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
    </>
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
  init: PointerEventInit = {},
) {
  const event = new PointerEvent(type, {
    bubbles: true,
    cancelable: true,
    clientY,
    pointerId: 1,
    isPrimary: true,
    pointerType: 'touch',
    ...init,
  })
  Object.defineProperty(event, 'timeStamp', { value: timeStamp })
  target.dispatchEvent(event)
}

/**
 * A slow drag: the last move comes 500ms before the release, so the release
 * speed is 0 and only the distance decides. The first move passes the slop
 * (the drag counts from there).
 */
async function drag(target: Element, from: number, to: number) {
  await act(async () => {
    pointer(target, 'pointerdown', from)
    pointer(target, 'pointermove', from + Math.sign(to - from) * 10, 10)
    pointer(target, 'pointermove', to, 500)
    pointer(target, 'pointerup', to, 1000)
  })
}

let reducedMotion = true

beforeEach(() => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true
  vi.clearAllMocks()
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
  // The sheet is a fixed box as tall as the screen; its content is REST tall.
  vi.spyOn(HTMLElement.prototype, 'offsetHeight', 'get').mockImplementation(
    function (this: HTMLElement) {
      if (this.getAttribute('role') === 'dialog') return VIEWPORT
      return this.parentElement?.dataset.slot === 'bottom-sheet-content'
        ? REST
        : 0
    },
  )
  main = document.createElement('main')
  main.id = MAIN_ID
  document.body.append(main)
  listScroll = document.createElement('div')
  listScroll.id = LIST_SCROLL_ID
  main.append(listScroll)
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

  it('locks the page scroll while open (B14)', async () => {
    await mount()
    for (const element of scrollers()) {
      expect(element.style.overflow).toBe('hidden')
    }
    await act(async () => closeButton()?.click())
    for (const element of scrollers()) {
      expect(element.style.overflow).toBe('')
    }
  })

  it('a closed sheet renders nothing', async () => {
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

  it('T3 the toast region stays usable: not inert, focus inside it stays', async () => {
    const region = document.createElement('div')
    region.setAttribute(TOAST_REGION_ATTR, '')
    const retry = document.createElement('button')
    retry.textContent = '重試'
    region.append(retry)
    document.body.append(region)
    await mount()
    expect(region.hasAttribute('inert')).toBe(false)
    expect(main.hasAttribute('inert')).toBe(true)
    await act(async () => retry.focus())
    expect(document.activeElement).toBe(retry)
    region.remove()
  })
})

describe('B3 to B5 drag', () => {
  it('B3 the handle drag follows the finger with transform only', async () => {
    await mount()
    const sheet = dialog() as HTMLElement
    await act(async () => {
      pointer(handle() as Element, 'pointerdown', 500)
      pointer(handle() as Element, 'pointermove', 510, 10)
      pointer(sheet, 'pointermove', 600, 500)
    })
    expect(sheet.style.transform).toBe(
      `translate3d(0, ${VIEWPORT - REST + 90}px, 0)`,
    )
    expect(sheet.style.paddingBottom).toBe(`${VIEWPORT - REST}px`)
    // No text selection while a drag is on.
    expect(sheet.className).toContain('select-none')
    await act(async () => pointer(sheet, 'pointerup', 600, 1000))
    expect(sheet.className).not.toContain('select-none')
    // 90px down and slow: back to the rest height.
    expect(sheet.style.transform).toBe(
      `translate3d(0, ${VIEWPORT - REST}px, 0)`,
    )
  })

  it('a mouse whose button went up unseen ends the drag; hovering then moves nothing', async () => {
    await mount()
    const sheet = dialog() as HTMLElement
    const mouse = (buttons: number) => ({ pointerType: 'mouse', buttons })
    await act(async () => {
      pointer(handle() as Element, 'pointerdown', 500, 0, mouse(1))
      pointer(handle() as Element, 'pointermove', 510, 10, mouse(1))
      pointer(sheet, 'pointermove', 530, 500, mouse(1))
    })
    expect(sheet.style.transform).toBe(
      `translate3d(0, ${VIEWPORT - REST + 20}px, 0)`,
    )
    // The pointerup was lost (window blur); the next move has no button.
    await act(async () => pointer(sheet, 'pointermove', 540, 1000, mouse(0)))
    expect(sheet.style.transform).toBe(
      `translate3d(0, ${VIEWPORT - REST}px, 0)`,
    )
    await act(async () => pointer(sheet, 'pointermove', 700, 40, mouse(0)))
    expect(sheet.style.transform).toBe(
      `translate3d(0, ${VIEWPORT - REST}px, 0)`,
    )
    expect(sheet.className).not.toContain('select-none')
  })

  it('B3 released past the threshold closes; below it springs back', async () => {
    await mount()
    // 50px down: above the close line (a quarter of 400px), springs back.
    await drag(handle() as Element, 500, 560)
    expect(onOpenChange).not.toHaveBeenCalled()
    expect(dialog()?.style.transform).toBe(
      `translate3d(0, ${VIEWPORT - REST}px, 0)`,
    )
    // 190px down: past it, closes.
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
    const touch = (scrollTop: number, canScroll: boolean, panDown: boolean) =>
      bodyTouchAction({ scrollTop, canScroll, panDown })
    expect(touch(0, false, true)).toBe('none')
    expect(touch(0, true, true)).toBe('pan-down')
    expect(touch(5, true, true)).toBe('pan-y')
    // Safari has no pan-down: scrollable content always pans natively.
    expect(touch(0, false, false)).toBe('none')
    expect(touch(0, true, false)).toBe('pan-y')
  })

  it('B4 in the DOM: content scrolled down, a downward drag never settles', async () => {
    await mount()
    const body = content() as HTMLElement
    vi.spyOn(body, 'scrollTop', 'get').mockReturnValue(120)
    vi.spyOn(body, 'scrollHeight', 'get').mockReturnValue(2000)
    vi.spyOn(body, 'clientHeight', 'get').mockReturnValue(300)
    const row = body.querySelector('button') as HTMLElement
    await drag(row, 300, 400)
    expect(onOpenChange).not.toHaveBeenCalled()
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
    // 190px up: past a quarter of 400px, full screen.
    await drag(handle() as Element, 500, 300)
    const sheet = dialog() as HTMLElement
    expect(sheet.style.transform).toBe('translate3d(0, 0px, 0)')
    expect(sheet.dataset.fullScreen).toBe('true')
    expect(sheet.className).toContain('rounded-none')
    expect(sheet.className).toContain('pt-[env(safe-area-inset-top)]')
    expect(sheet.className).not.toContain('rounded-t-sheet')
    expect(sheet.style.paddingBottom).toBe('0px')
    expect(handle()?.querySelector('span')).not.toBeNull()
    // From full screen: 90px down stays full screen, 290px (past a quarter
    // of the screen) goes back to the rest height.
    await drag(handle() as Element, 100, 200)
    expect(sheet.dataset.fullScreen).toBe('true')
    await drag(handle() as Element, 100, 400)
    expect(sheet.dataset.fullScreen).toBeUndefined()
    expect(sheet.style.transform).toBe(
      `translate3d(0, ${VIEWPORT - REST}px, 0)`,
    )
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
    await act(async () => {
      pointer(handle() as Element, 'pointerdown', 500)
      pointer(handle() as Element, 'pointermove', 520, 10)
      pointer(handle() as Element, 'pointermove', 540, 500)
    })
    expect(dialog()?.style.transform).toBe(
      `translate3d(0, ${VIEWPORT - REST + 20}px, 0)`,
    )
    await act(async () => pointer(handle() as Element, 'pointerup', 540, 1000))
    expect(dialog()?.style.transform).toBe(
      `translate3d(0, ${VIEWPORT - REST}px, 0)`,
    )
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
    // The whole session is back: scroll lock, inert page.
    for (const element of scrollers()) {
      expect(element.style.overflow).toBe('hidden')
    }
    expect(main.hasAttribute('inert')).toBe(true)
    expect(opener.hasAttribute('inert')).toBe(true)
    // And it closes again.
    await act(async () => closeButton()?.click())
    expect(dialog()?.getAttribute('data-state')).toBe('closing')
  })

  it('B2 reopen while a full-screen sheet closes: it rests at its height again', async () => {
    reducedMotion = false
    fakeAnimate()
    await mount()
    await drag(handle() as Element, 500, 300)
    expect(dialog()?.dataset.fullScreen).toBe('true')
    // Past the release's own click.
    await act(() => new Promise((resolve) => setTimeout(resolve, 0)))
    await act(async () => closeButton()?.click())
    expect(dialog()?.getAttribute('data-state')).toBe('closing')
    await act(async () =>
      document.querySelector<HTMLButtonElement>('#reopen')?.click(),
    )
    const sheet = dialog() as HTMLElement
    expect(sheet.getAttribute('data-state')).toBe('open')
    expect(sheet.dataset.fullScreen).toBeUndefined()
    expect(sheet.className).toContain('rounded-t-sheet')
    expect(sheet.style.transform).toBe(
      `translate3d(0, ${VIEWPORT - REST}px, 0)`,
    )
    expect(sheet.style.paddingBottom).toBe(`${VIEWPORT - REST}px`)
  })

  it('a drag caught during the open slide counts only its own distance', async () => {
    reducedMotion = false
    fakeAnimate()
    // The open slide is drawn 200px below the rest position right now.
    const caughtAt = VIEWPORT - REST + 200
    vi.stubGlobal(
      'DOMMatrixReadOnly',
      class {
        m42 = caughtAt
      },
    )
    const real = window.getComputedStyle.bind(window)
    vi.spyOn(window, 'getComputedStyle').mockImplementation((element) =>
      element.getAttribute('role') === 'dialog'
        ? ({
            transform: `matrix(1, 0, 0, 1, 0, ${caughtAt})`,
          } as CSSStyleDeclaration)
        : real(element),
    )
    try {
      await mount()
      // Caught 200px below the rest and moved 30px: from the rest that would
      // be 230px, past the close line; counted from the catch it springs back.
      await drag(handle() as Element, 500, 540)
      expect(onOpenChange).not.toHaveBeenCalled()
      expect(dialog()?.getAttribute('data-state')).toBe('open')
      expect(dialog()?.style.transform).toBe(
        `translate3d(0, ${VIEWPORT - REST}px, 0)`,
      )
    } finally {
      vi.unstubAllGlobals()
    }
  })
})

describe('page around the sheet', () => {
  it('unmounted while open: the scroll lock and inert are undone', async () => {
    await mount()
    await act(async () => root.unmount())
    expect(main.hasAttribute('inert')).toBe(false)
    for (const element of scrollers()) {
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

  function stubPanDown(supported: boolean) {
    vi.stubGlobal('CSS', {
      supports: (property: string, value: string) =>
        property === 'touch-action' && value === 'pan-down' && supported,
    })
  }

  it("the content's touch-action: none when short, pan-down at the top, pan-y once scrolled", async () => {
    stubPanDown(true)
    try {
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
    } finally {
      vi.unstubAllGlobals()
    }
  })

  it('without pan-down (Safari) content that grew scrollable gets pan-y, never stays none', async () => {
    stubPanDown(false)
    try {
      await mount()
      const body = content() as HTMLElement
      expect(body.style.touchAction).toBe('none')
      // 更多 opened: the content scrolls now, still at the top.
      vi.spyOn(body, 'scrollTop', 'get').mockReturnValue(0)
      vi.spyOn(body, 'scrollHeight', 'get').mockReturnValue(2000)
      vi.spyOn(body, 'clientHeight', 'get').mockReturnValue(300)
      await act(async () => body.dispatchEvent(new Event('scroll')))
      expect(body.style.touchAction).toBe('pan-y')
    } finally {
      vi.unstubAllGlobals()
    }
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
    expect(onOpenChange).not.toHaveBeenCalled()
  })
})

describe('header slot (story 2.4)', () => {
  it('replaces the title row, names the dialog and leaves Esc to the caller', async () => {
    await act(async () =>
      root.render(
        <BottomSheet
          open
          onOpenChange={onOpenChange}
          mode="detail"
          header={(titleId) => (
            <div>
              <h2 id={titleId}>Fake.Name</h2>
              <button type="button" aria-label="關閉詳情的替身">
                x
              </button>
            </div>
          )}
        >
          <p>內容</p>
        </BottomSheet>,
      ),
    )
    const sheet = dialog() as HTMLElement
    const labelledBy = sheet.getAttribute('aria-labelledby') ?? ''
    expect(document.getElementById(labelledBy)?.textContent).toBe('Fake.Name')
    expect(closeButton()).toBeNull()
    // The handle stays above the header.
    expect(handle()).not.toBeNull()
    // Nothing focusable was asked for and there is no ✕: the dialog itself.
    expect(document.activeElement).toBe(sheet)
    await act(async () =>
      document.dispatchEvent(
        new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }),
      ),
    )
    expect(onOpenChange).not.toHaveBeenCalled()
  })
})
