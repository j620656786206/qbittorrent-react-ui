// @vitest-environment happy-dom
import { act, useLayoutEffect, useRef } from 'react'
import { createRoot } from 'react-dom/client'
import type { Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { HOLD_SLACK_MS } from '#/lib/entrance'
import { EXIT_EASING, FADE_MS, SLIDE_MS } from '#/lib/leaving'
import { fakeHash, t } from '#/lib/testing'
import type { SlimTorrent } from '#/shared/maindata'
import { stubElementAnimate, stubReducedMotion } from '#/state/entrance-testing'
import type { AnimateStub, RecordedAnimation } from '#/state/entrance-testing'
import {
  captureLeaving,
  expectLeaving,
  leavingStore,
  resetLeaving,
} from '#/state/leaving'
import { useLeavingExit } from '#/state/leaving-exit'
import {
  freezeStore,
  resetOrderFreeze,
  useFrozenOrder,
} from '#/state/order-freeze'

// Story 4.4: `useLeavingExit` in a DOM. Rows are 59px with a 2px gap, row
// `i` at `i * 61`; the scroll box is 0 to 600, so a row at or past 600 is
// not visible. `animate` is a stub whose `finished` the test settles.

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean | undefined
}

const ROW = 59
const GAP = 2
const STEP = ROW + GAP

const [A, B, C, D, E] = [0xa1, 0xb1, 0xc1, 0xd1, 0xe1].map(fakeHash)

let stub: AnimateStub
let reduced: boolean
let roots: Array<Root>

beforeEach(() => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true
  reduced = false
  roots = []
  resetLeaving()
  resetOrderFreeze()
  stub = stubElementAnimate()
  stubReducedMotion(() => reduced)
  vi.spyOn(Element.prototype, 'getBoundingClientRect').mockImplementation(
    function (this: Element) {
      if (this.hasAttribute('data-surface')) return new DOMRect(0, 0, 400, 600)
      const top = this.getAttribute('data-top')
      if (top === null) return new DOMRect(0, 0, 0, 0)
      return new DOMRect(0, Number(top), 400, ROW)
    },
  )
})

afterEach(async () => {
  for (const root of roots) await act(async () => root.unmount())
  vi.restoreAllMocks()
  vi.useRealTimers()
  stub.restore()
  resetLeaving()
  resetOrderFreeze()
  globalThis.IS_REACT_ACT_ENVIRONMENT = false
})

interface SurfaceProps {
  live: ReadonlyArray<string>
  /** Rows start this far down, px (scrolled past the first rows). */
  offset?: number
  disabled?: () => boolean
  slide?: boolean
  /** Another filter (category, keyword) applies at once, held or not. */
  filterKey?: string
  /**
   * The scroll box's `scrollTop` by how many rows show, set before the
   * hook's layout effect (the browser clamping it when content shrinks).
   */
  scrollFor?: Readonly<Record<number, number>>
}

const rowSize = () => ROW

function Surface({
  live,
  offset = 0,
  disabled,
  slide,
  filterKey,
  scrollFor,
}: SurfaceProps) {
  const ref = useRef<HTMLDivElement>(null)
  const shown = useFrozenOrder(live, { filterKey }) ?? []
  const scrollTop = scrollFor?.[shown.length]
  useLayoutEffect(() => {
    if (scrollTop !== undefined && ref.current)
      ref.current.scrollTop = scrollTop
  }, [scrollTop])
  useLeavingExit(ref, {
    order: shown,
    sizeOf: rowSize,
    gap: GAP,
    disabled,
    slide,
  })
  return (
    <div ref={ref} data-surface="">
      {shown.map((hash, index) => (
        <div key={hash} data-hash={hash} data-top={offset + index * STEP} />
      ))}
    </div>
  )
}

async function mount(props: SurfaceProps) {
  const container = document.createElement('div')
  document.body.append(container)
  const root = createRoot(container)
  roots.push(root)
  await act(async () => root.render(<Surface {...props} />))
  return {
    root,
    container,
    rerender: (next: SurfaceProps) =>
      act(async () => root.render(<Surface {...next} />)),
  }
}

function record(hashes: ReadonlyArray<string>): Record<string, SlimTorrent> {
  return Object.fromEntries(hashes.map((hash) => [hash, t({ hash })]))
}

/** A delete of `gone` succeeded and the refresh lacks them. */
async function deleteAndRefresh(
  view: Awaited<ReturnType<typeof mount>>,
  before: ReadonlyArray<string>,
  gone: ReadonlyArray<string>,
  props: Omit<SurfaceProps, 'live'> = {},
) {
  const after = before.filter((hash) => !gone.includes(hash))
  expectLeaving(gone)
  await act(async () => captureLeaving(record(before), record(after)))
  await view.rerender({ ...props, live: after })
  return after
}

const held = () => freezeStore.state.animation
const rendered = (container: HTMLElement) =>
  [...container.querySelectorAll<HTMLElement>('[data-hash]')].map(
    (element) => element.dataset.hash,
  )
const on = (calls: Array<RecordedAnimation>, hash: string) =>
  calls.filter((call) => (call.element as HTMLElement).dataset.hash === hash)

async function finishAll(calls: Array<RecordedAnimation>) {
  await act(async () => {
    for (const call of calls) call.finish()
    for (let i = 0; i < 5; i += 1) await Promise.resolve()
  })
}

describe('useLeavingExit', () => {
  it('L1: fades the visible rows, then slides the rows below, holding the order throughout', async () => {
    const view = await mount({ live: [A, B, C, D] })
    await deleteAndRefresh(view, [A, B, C, D], [B])

    const fades = [...stub.calls]
    expect(fades).toHaveLength(1)
    expect(on(fades, B)).toHaveLength(1)
    expect(fades[0].keyframes).toEqual([{ opacity: 1 }, { opacity: 0 }])
    expect(fades[0].options).toMatchObject({
      duration: FADE_MS,
      easing: EXIT_EASING,
    })
    // The hold starts with the fade; the row is still there.
    expect(held()).toBe(true)
    expect(rendered(view.container)).toEqual([A, B, C, D])

    stub.calls.length = 0
    await finishAll(fades)
    // Faded: the row left, the rows below slide up one row.
    expect(rendered(view.container)).toEqual([A, C, D])
    const slides = [...stub.calls]
    expect(
      slides.map((call) => (call.element as HTMLElement).dataset.hash),
    ).toEqual([C, D])
    expect(slides[0].keyframes).toEqual([
      { translate: `0px ${STEP}px` },
      { translate: '0px 0px' },
    ])
    expect(slides[0].options).toMatchObject({
      duration: SLIDE_MS,
      easing: EXIT_EASING,
    })
    expect(held()).toBe(true)

    await finishAll(slides)
    expect(held()).toBe(false)
    expect(leavingStore.state.hashes.size).toBe(0)
  })

  it('animates only opacity and translate', async () => {
    const view = await mount({ live: [A, B, C, D] })
    await deleteAndRefresh(view, [A, B, C, D], [A, C])
    await finishAll([...stub.calls])
    const keys = new Set(
      stub.calls.flatMap((call) =>
        call.keyframes.flatMap((frame) => Object.keys(frame)),
      ),
    )
    expect([...keys].sort()).toEqual(['opacity', 'translate'])
  })

  it('L3: off-screen rows wait unanimated and leave with the faded ones; the slide counts every removed row above', async () => {
    // Rows E (top 610) and past the box are not visible.
    const order = [A, B, C, D, E, fakeHash(0xf1), fakeHash(0xf2)]
    const below = order.slice(5)
    // Scrolled one row down: A at -61 is above the box. B 0, C 61, ...
    const props = { offset: -STEP, scrollFor: { 7: STEP } }
    const view = await mount({ live: order, ...props })
    const scroller = view.container.querySelector<HTMLElement>('[data-surface]')
    await deleteAndRefresh(view, order, [A, B, D], props)
    // B and D fade. A is not visible: it stays, unanimated, so nothing
    // visible moves during the fade.
    expect(
      stub.calls
        .map((call) => (call.element as HTMLElement).dataset.hash)
        .sort(),
    ).toEqual([B, D].sort())
    expect(rendered(view.container)).toEqual(order)

    const fades = [...stub.calls]
    stub.calls.length = 0
    await finishAll(fades)
    // All three leave together. A was above the view: anchoring takes its
    // row out of `scrollTop`, so each row slides only by what left in view.
    expect(rendered(view.container)).toEqual([C, E, ...below])
    expect(scroller?.scrollTop).toBe(0)
    const shiftOf = (hash: string) =>
      on(stub.calls, hash)[0]?.keyframes[0].translate
    expect(shiftOf(C)).toBe(`0px ${STEP}px`)
    expect(shiftOf(E)).toBe(`0px ${2 * STEP}px`)
    expect(shiftOf(below[1])).toBe(`0px ${2 * STEP}px`)
    await finishAll([...stub.calls])
    expect(held()).toBe(false)
    expect(leavingStore.state.hashes.size).toBe(0)
  })

  it('scrolled to the bottom: the clamped scroll moves every row, so each starts where it was', async () => {
    // 4 rows scrolled 122px; without D the browser clamps to 61px.
    const scrollFor = { 4: 2 * STEP, 3: STEP }
    const view = await mount({ live: [A, B, C, D], scrollFor })
    await deleteAndRefresh(view, [A, B, C, D], [D], { scrollFor })
    const fades = [...stub.calls]
    expect(on(fades, D)).toHaveLength(1)
    stub.calls.length = 0
    await finishAll(fades)
    expect(rendered(view.container)).toEqual([A, B, C])
    // Nothing removed above them: each only undoes the 61px clamp.
    expect(
      stub.calls.map((call) => [
        (call.element as HTMLElement).dataset.hash,
        call.keyframes,
      ]),
    ).toEqual(
      [A, B, C].map((hash) => [
        hash,
        [{ translate: `0px ${-STEP}px` }, { translate: '0px 0px' }],
      ]),
    )
    await finishAll([...stub.calls])
    expect(held()).toBe(false)
  })

  it('the clamp and the slide add up for rows below a removed one', async () => {
    const scrollFor = { 4: 2 * STEP, 3: STEP }
    const view = await mount({ live: [A, B, C, D], scrollFor })
    await deleteAndRefresh(view, [A, B, C, D], [B], { scrollFor })
    const fades = [...stub.calls]
    stub.calls.length = 0
    await finishAll(fades)
    const offsetOf = (hash: string) =>
      on(stub.calls, hash)[0]?.keyframes[0].translate
    // A was above B: it slides down from where it was. C and D moved up
    // one row and down the clamp: they end where they started.
    expect(offsetOf(A)).toBe(`0px ${-STEP}px`)
    expect(offsetOf(C)).toBeUndefined()
    expect(offsetOf(D)).toBeUndefined()
  })

  it('the slide arms its own backstop', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
    const view = await mount({ live: [A, B, C] })
    await deleteAndRefresh(view, [A, B, C], [A])
    // The fade ends late, just before its backstop.
    await act(async () => {
      vi.advanceTimersByTime(FADE_MS + SLIDE_MS + HOLD_SLACK_MS - 10)
    })
    const fades = [...stub.calls]
    stub.calls.length = 0
    await finishAll(fades)
    const slides = [...stub.calls]
    expect(slides.length).toBeGreaterThan(0)
    // The fade's backstop would have fired by now; the slide's has not.
    await act(async () => {
      vi.advanceTimersByTime(SLIDE_MS)
    })
    expect(held()).toBe(true)
    expect(slides.every((call) => call.cancel.mock.calls.length === 0)).toBe(
      true,
    )
    await act(async () => {
      vi.advanceTimersByTime(HOLD_SLACK_MS)
    })
    expect(held()).toBe(false)
  })

  it('a fading row is inert; a cut run clears it', async () => {
    const view = await mount({ live: [A, B, C] })
    await deleteAndRefresh(view, [A, B, C], [B])
    const row = view.container.querySelector<HTMLElement>(`[data-hash="${B}"]`)
    expect(row?.inert).toBe(true)
    expect(
      view.container.querySelector<HTMLElement>(`[data-hash="${A}"]`)?.inert,
    ).toBe(false)
    // Another filter drops the fading row: the run is cut.
    await view.rerender({ live: [C], filterKey: 'other' })
    expect(row?.inert).toBe(false)
  })

  it('a view that drops the fading rows cuts the run: fade cancelled, hold released, rows gone', async () => {
    const view = await mount({ live: [A, B, C] })
    await deleteAndRefresh(view, [A, B, C], [B])
    const [fade] = stub.calls
    expect(held()).toBe(true)
    // Another filter applies its live order at once, without B.
    await view.rerender({ live: [C, A], filterKey: 'other' })
    expect(rendered(view.container)).toEqual([C, A])
    expect(fade.cancel).toHaveBeenCalled()
    expect(held()).toBe(false)
    expect(leavingStore.state.hashes.size).toBe(0)
  })

  it('a collapse FLIP that starts during the fade: no slide, the hold ends', async () => {
    let busy = false
    const disabled = () => busy
    const view = await mount({ live: [A, B, C], disabled })
    await deleteAndRefresh(view, [A, B, C], [A], { disabled })
    const fades = [...stub.calls]
    expect(fades).toHaveLength(1)
    busy = true
    stub.calls.length = 0
    await finishAll(fades)
    expect(rendered(view.container)).toEqual([B, C])
    expect(stub.calls).toHaveLength(0)
    expect(held()).toBe(false)
  })

  it('L2: nothing visible leaves at once with no animation and no hold', async () => {
    const order = [
      A,
      B,
      C,
      D,
      E,
      ...Array.from({ length: 10 }, (_, i) => fakeHash(0x100 + i)),
    ]
    const last = order[order.length - 1]
    const view = await mount({ live: order })
    const freezes: Array<boolean> = []
    const subscription = freezeStore.subscribe(() =>
      freezes.push(freezeStore.state.animation),
    )
    await deleteAndRefresh(view, order, [last])
    subscription.unsubscribe()
    expect(stub.calls).toHaveLength(0)
    expect(freezes).not.toContain(true)
    expect(rendered(view.container)).not.toContain(last)
    expect(leavingStore.state.hashes.size).toBe(0)
  })

  it('L11: reduced motion drops the rows with the refresh, no animation, no hold', async () => {
    reduced = true
    const view = await mount({ live: [A, B, C] })
    await deleteAndRefresh(view, [A, B, C], [B])
    expect(stub.calls).toHaveLength(0)
    expect(held()).toBe(false)
    expect(rendered(view.container)).toEqual([A, C])
    expect(leavingStore.state.hashes.size).toBe(0)
  })

  it('L13: disabled drops the rows without a fade', async () => {
    const disabled = () => true
    const view = await mount({ live: [A, B, C], disabled })
    await deleteAndRefresh(view, [A, B, C], [B], { disabled })
    expect(stub.calls).toHaveLength(0)
    expect(held()).toBe(false)
    expect(rendered(view.container)).toEqual([A, C])
  })

  it('L14: no slide when slide is off; the hold ends after the fade', async () => {
    const view = await mount({ live: [A, B, C], slide: false })
    await deleteAndRefresh(view, [A, B, C], [A], { slide: false })
    const fades = [...stub.calls]
    expect(fades).toHaveLength(1)
    stub.calls.length = 0
    await finishAll(fades)
    expect(stub.calls).toHaveLength(0)
    expect(held()).toBe(false)
    expect(rendered(view.container)).toEqual([B, C])
  })

  it('L15: unmounting mid-fade cancels, releases the hold and lets the rows go', async () => {
    const view = await mount({ live: [A, B, C] })
    await deleteAndRefresh(view, [A, B, C], [B])
    const [fade] = stub.calls
    expect(held()).toBe(true)
    await act(async () => view.root.unmount())
    roots = []
    expect(fade.cancel).toHaveBeenCalled()
    expect(held()).toBe(false)
    expect(leavingStore.state.hashes.size).toBe(0)
  })

  it('a backstop releases the hold if a finished never settles', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
    const view = await mount({ live: [A, B, C] })
    await deleteAndRefresh(view, [A, B, C], [B])
    expect(held()).toBe(true)
    await act(async () => {
      vi.advanceTimersByTime(FADE_MS + SLIDE_MS + HOLD_SLACK_MS)
    })
    expect(held()).toBe(false)
    expect(rendered(view.container)).toEqual([A, C])
  })

  it('L7: new data mid-exit waits for the hold; new torrents then appear', async () => {
    const view = await mount({ live: [A, B, C] })
    await deleteAndRefresh(view, [A, B, C], [B])
    // A new torrent and a reorder arrive during the fade.
    await view.rerender({ live: [D, C, A] })
    expect(rendered(view.container)).toEqual([A, B, C])
    const fades = [...stub.calls]
    stub.calls.length = 0
    await finishAll(fades)
    expect(rendered(view.container)).toEqual([A, C])
    await finishAll([...stub.calls])
    expect(rendered(view.container)).toEqual([D, C, A])
  })

  it('L12: a second group waits for the running exit, then plays its own', async () => {
    const view = await mount({ live: [A, B, C, D] })
    const after = await deleteAndRefresh(view, [A, B, C, D], [A])
    const firstFade = [...stub.calls]
    // The second batch's refresh arrives mid-fade.
    const later = await deleteAndRefresh(view, after, [C])
    expect(stub.calls).toHaveLength(1)
    expect(rendered(view.container)).toEqual([A, B, C, D])

    stub.calls.length = 0
    await finishAll(firstFade)
    // A left; C still waits while the slide runs.
    expect(rendered(view.container)).toEqual([B, C, D])
    expect(
      on(stub.calls, C).every((call) => 'translate' in call.keyframes[0]),
    ).toBe(true)
    const slides = [...stub.calls]
    stub.calls.length = 0
    await finishAll(slides)
    // Now C fades.
    expect(on(stub.calls, C)[0]?.keyframes).toEqual([
      { opacity: 1 },
      { opacity: 0 },
    ])
    expect(held()).toBe(true)
    const secondFade = [...stub.calls]
    stub.calls.length = 0
    await finishAll(secondFade)
    await finishAll([...stub.calls])
    expect(rendered(view.container)).toEqual(later)
    expect(held()).toBe(false)
  })
})

describe('useLeavingExit scroll anchoring', () => {
  // Scrolled two rows down: A at -122 and B at -61 are above the box.
  const order = [A, B, C, D, E]
  const props = { offset: -2 * STEP, scrollFor: { 5: 2 * STEP } }
  const scrollerOf = (view: Awaited<ReturnType<typeof mount>>) =>
    view.container.querySelector<HTMLElement>('[data-surface]') as HTMLElement

  it('rows deleted only above the view: scrollTop takes their height in the removal commit, with a scroll event, no animation, no hold', async () => {
    const view = await mount({ live: order, ...props })
    const scroller = scrollerOf(view)
    let scrolls = 0
    scroller.addEventListener('scroll', () => (scrolls += 1))
    const freezes: Array<boolean> = []
    const subscription = freezeStore.subscribe(() =>
      freezes.push(freezeStore.state.animation),
    )
    await deleteAndRefresh(view, order, [A, B], props)
    subscription.unsubscribe()
    expect(rendered(view.container)).toEqual([C, D, E])
    expect(scroller.scrollTop).toBe(0)
    expect(scrolls).toBe(1)
    expect(stub.calls).toHaveLength(0)
    expect(freezes).not.toContain(true)
    expect(leavingStore.state.hashes.size).toBe(0)
  })

  it('reduced motion: still anchored, nothing animates', async () => {
    reduced = true
    const view = await mount({ live: order, ...props })
    await deleteAndRefresh(view, order, [A, C], props)
    expect(rendered(view.container)).toEqual([B, D, E])
    expect(scrollerOf(view).scrollTop).toBe(STEP)
    expect(stub.calls).toHaveLength(0)
    expect(held()).toBe(false)
  })

  it('disabled (the collapse FLIP owns the scroll): not anchored', async () => {
    const disabled = () => true
    const view = await mount({ live: order, ...props, disabled })
    await deleteAndRefresh(view, order, [A], { ...props, disabled })
    expect(rendered(view.container)).toEqual([B, C, D, E])
    expect(scrollerOf(view).scrollTop).toBe(2 * STEP)
  })

  it('the grid layout (slide off): not anchored', async () => {
    const view = await mount({ live: order, ...props, slide: false })
    await deleteAndRefresh(view, order, [A, C], { ...props, slide: false })
    const fades = [...stub.calls]
    expect(on(fades, C)).toHaveLength(1)
    await finishAll(fades)
    expect(rendered(view.container)).toEqual([B, D, E])
    expect(scrollerOf(view).scrollTop).toBe(2 * STEP)
  })
})
