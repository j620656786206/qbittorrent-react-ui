// @vitest-environment happy-dom
import { StrictMode, act, useRef } from 'react'
import { createRoot } from 'react-dom/client'
import type { Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { JOIN_MS, RING_MS, RISE_MS, STAGGER_MS } from '#/lib/entrance'
import {
  entranceStore,
  replayEntrance,
  resetEntrance,
  useEntrance,
} from '#/state/entrance'
import { stubElementAnimate, stubReducedMotion } from '#/state/entrance-testing'
import type { AnimateStub } from '#/state/entrance-testing'
import { freezeStore, resetOrderFreeze } from '#/state/order-freeze'

// Story 2.9: the entrance store and `useEntrance` in a DOM. Boxes come from
// `data-top` (the container is 0 to 600), `animate` is a stub whose
// `finished` the test settles, and the clock is `performance.now`.

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean | undefined
}

const CIRCUMFERENCE = 103.67

let stub: AnimateStub
let now: number
let reduced: boolean
let roots: Array<Root>

beforeEach(() => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true
  now = 1000
  reduced = false
  roots = []
  resetEntrance()
  resetOrderFreeze()
  stub = stubElementAnimate()
  vi.spyOn(performance, 'now').mockImplementation(() => now)
  stubReducedMotion(() => reduced)
  vi.spyOn(Element.prototype, 'getBoundingClientRect').mockImplementation(
    function (this: Element) {
      const holder = this.closest('[data-top]')
      if (this.hasAttribute('data-surface')) return new DOMRect(0, 0, 400, 600)
      if (!holder) return new DOMRect(0, 0, 0, 0)
      return new DOMRect(0, Number(holder.getAttribute('data-top')), 400, 60)
    },
  )
})

afterEach(async () => {
  for (const root of roots) await act(async () => root.unmount())
  vi.restoreAllMocks()
  stub.restore()
  globalThis.IS_REACT_ACT_ENVIRONMENT = false
})

interface SurfaceProps {
  ready?: boolean
  rise?: boolean
  /** Row tops, px; above 600 is outside the container. */
  tops?: ReadonlyArray<number>
  /** Rows with no arc (a seeding or done circle). */
  plain?: ReadonlyArray<number>
}

function Surface({
  ready = true,
  rise = true,
  tops = [0, 70, 140],
  plain = [],
}: SurfaceProps) {
  const ref = useRef<HTMLDivElement>(null)
  useEntrance(ref, { ready, rise })
  return (
    <div ref={ref} data-surface="">
      {tops.map((top) => (
        <button key={top} type="button" data-entrance="" data-top={top}>
          <svg>
            {!plain.includes(top) && (
              <circle
                data-progress-arc=""
                strokeDasharray={CIRCUMFERENCE}
                strokeDashoffset={50}
              />
            )}
          </svg>
          <span data-progress-bar="" />
        </button>
      ))}
    </div>
  )
}

async function mount(props: SurfaceProps = {}) {
  const container = document.createElement('div')
  document.body.append(container)
  const root = createRoot(container)
  roots.push(root)
  await act(async () => root.render(<Surface {...props} />))
  return {
    root,
    rerender: (next: SurfaceProps) =>
      act(async () => root.render(<Surface {...next} />)),
  }
}

const rises = () =>
  stub.calls.filter((animation) => animation.element.tagName === 'BUTTON')
const spins = () =>
  stub.calls.filter((animation) => animation.element.tagName === 'circle')
const grows = () =>
  stub.calls.filter((animation) => animation.element.tagName === 'SPAN')

async function settleAll() {
  await act(async () => {
    for (const animation of stub.calls) animation.finish()
    await Promise.resolve()
  })
}

describe('the store', () => {
  it('starts on generation 1, unplayed', () => {
    expect(entranceStore.state).toEqual({ generation: 1, startedAt: null })
  })

  it('replayEntrance() starts a new, unclaimed generation', () => {
    now = 5000
    replayEntrance()
    expect(entranceStore.state).toEqual({ generation: 2, startedAt: null })
  })
})

describe('useEntrance', () => {
  it('the first ready surface claims: rows rise 60ms apart, rings and bars grow with them', async () => {
    await mount()
    expect(entranceStore.state.startedAt).toBe(1000)
    expect(rises().map((a) => a.options.delay)).toEqual([
      0,
      STAGGER_MS,
      2 * STAGGER_MS,
    ])
    expect(rises()[0].keyframes).toEqual([
      { offset: 0, opacity: 0, transform: 'translateY(10px)' },
    ])
    expect(rises()[0].options).toMatchObject({
      duration: RISE_MS,
      easing: 'cubic-bezier(.2,.8,.2,1)',
      fill: 'backwards',
    })
    expect(spins().map((a) => a.options.delay)).toEqual([0, 60, 120])
    expect(spins()[0].keyframes).toEqual([
      { offset: 0, strokeDashoffset: `${CIRCUMFERENCE}px` },
    ])
    expect(spins()[0].options).toMatchObject({ duration: RING_MS })
    expect(grows()[1].keyframes).toEqual([
      { offset: 0, transform: 'scaleX(0)' },
    ])
    expect(grows()[1].options).toMatchObject({ delay: 60, duration: RING_MS })
  })

  it('rows outside the container and circles without an arc get nothing', async () => {
    await mount({ tops: [0, 70, 650], plain: [70] })
    expect(rises().map((a) => a.element.getAttribute('data-top'))).toEqual([
      '0',
      '70',
    ])
    expect(spins()).toHaveLength(1)
  })

  it('tops within 1px share a row and a delay', async () => {
    await mount({ tops: [0, 0.5, 70, 70.8] })
    expect(rises().map((a) => a.options.delay)).toEqual([0, 0, 60, 60])
  })

  it('waits while not ready, then claims on the first ready commit', async () => {
    const surface = await mount({ ready: false })
    expect(stub.calls).toHaveLength(0)
    expect(entranceStore.state.startedAt).toBeNull()
    now = 1200
    await surface.rerender({ ready: true })
    expect(entranceStore.state.startedAt).toBe(1200)
    expect(rises()).toHaveLength(3)
  })

  it('a surface ready within JOIN_MS joins with its delays shifted', async () => {
    await mount({ tops: [0] })
    stub.calls.length = 0
    now = 1040
    await mount({ tops: [0, 70] })
    expect(rises().map((a) => a.options.delay)).toEqual([-40, 20])
  })

  it('a surface ready later skips the generation for good', async () => {
    await mount({ tops: [0] })
    stub.calls.length = 0
    now = 1000 + JOIN_MS + 1
    const late = await mount({ ready: false })
    await late.rerender({ ready: true })
    await late.rerender({ ready: true, tops: [0, 70, 140, 210] })
    expect(stub.calls).toHaveLength(0)
  })

  it('later commits (new data, more rows) start nothing', async () => {
    const surface = await mount()
    stub.calls.length = 0
    now = 3000
    await surface.rerender({ tops: [0, 70, 140, 210] })
    expect(stub.calls).toHaveLength(0)
  })

  it('replayEntrance(): a mounted surface cancels its animations and plays again', async () => {
    await mount()
    const first = [...stub.calls]
    now = 4000
    await act(async () => replayEntrance())
    for (const animation of first) expect(animation.cancel).toHaveBeenCalled()
    const second = stub.calls.slice(first.length)
    expect(
      second
        .filter((a) => a.element.tagName === 'BUTTON')
        .map((a) => a.options.delay),
    ).toEqual([0, 60, 120])
  })

  it('rise: false turns only the rings, at delay 0', async () => {
    await mount({ rise: false, tops: [0] })
    expect(rises()).toHaveLength(0)
    expect(grows()).toHaveLength(0)
    expect(spins().map((a) => a.options.delay)).toEqual([0])
  })
})

describe('replays and StrictMode', () => {
  it('a replay whose new rows commit more than JOIN_MS later still sweeps', async () => {
    const surface = await mount()
    // Epic 3's filter: the surface is busy (not ready) when the replay comes.
    await surface.rerender({ ready: false })
    stub.calls.length = 0
    now = 4000
    await act(async () => replayEntrance())
    expect(stub.calls).toHaveLength(0)
    now = 4000 + JOIN_MS + 350
    await surface.rerender({ ready: true })
    expect(entranceStore.state).toEqual({ generation: 2, startedAt: now })
    expect(rises().map((a) => a.options.delay)).toEqual([0, 60, 120])
  })

  it('a replay before generation 1 was ever claimed still plays', async () => {
    const surface = await mount({ ready: false })
    await act(async () => replayEntrance())
    now = 9000
    await surface.rerender({ ready: true })
    expect(entranceStore.state).toEqual({ generation: 2, startedAt: 9000 })
    expect(rises()).toHaveLength(3)
  })

  it('StrictMode: the remount after the cleanup sweeps again and keeps its run', async () => {
    const container = document.createElement('div')
    document.body.append(container)
    const root = createRoot(container)
    roots.push(root)
    await act(async () =>
      root.render(
        <StrictMode>
          <Surface rise={false} tops={[0]} />
        </StrictMode>,
      ),
    )
    // First mount's spin cancelled by the simulated unmount; the remount's
    // spin runs (it joins at elapsed 0) and holds the order.
    const spinsNow = spins()
    expect(spinsNow).toHaveLength(2)
    expect(spinsNow[0].cancel).toHaveBeenCalled()
    expect(spinsNow[1].cancel).not.toHaveBeenCalled()
    expect(spinsNow[1].options.delay).toBe(0)
    expect(freezeStore.state.animation).toBe(true)
    await settleAll()
    expect(freezeStore.state.animation).toBe(false)
  })
})

describe('the order hold', () => {
  it('holds while the animations run and releases once all settled', async () => {
    await mount()
    expect(freezeStore.state.animation).toBe(true)
    await act(async () => {
      for (const animation of stub.calls.slice(0, -1)) animation.finish()
      await Promise.resolve()
    })
    expect(freezeStore.state.animation).toBe(true)
    await settleAll()
    expect(freezeStore.state.animation).toBe(false)
  })

  it('released on replay (the new sweep holds again) and on unmount', async () => {
    const surface = await mount()
    now = 4000
    await act(async () => replayEntrance())
    // The old hold went with the cancel; the replay's sweep holds anew.
    expect(freezeStore.state.animation).toBe(true)
    await act(async () => surface.root.unmount())
    roots = roots.filter((root) => root !== surface.root)
    expect(freezeStore.state.animation).toBe(false)
  })

  it('an animation that ends rejected (its arc removed mid-turn) still releases', async () => {
    await mount()
    expect(freezeStore.state.animation).toBe(true)
    await act(async () => {
      const [first, ...rest] = stub.calls
      first.cancel()
      for (const animation of rest) animation.finish()
      await Promise.resolve()
    })
    expect(freezeStore.state.animation).toBe(false)
  })

  it('a surface that animates nothing holds nothing', async () => {
    await mount({ tops: [700] })
    expect(stub.calls).toHaveLength(0)
    expect(freezeStore.state.animation).toBe(false)
  })
})

describe('no motion', () => {
  it('reduced motion: no animation, no hold, the generation still played', async () => {
    reduced = true
    const surface = await mount()
    expect(stub.calls).toHaveLength(0)
    expect(freezeStore.state.animation).toBe(false)
    reduced = false
    await surface.rerender({ tops: [0, 70] })
    expect(stub.calls).toHaveLength(0)
  })

  it('no Element.animate: skip silently, no hold', async () => {
    Object.defineProperty(Element.prototype, 'animate', {
      configurable: true,
      writable: true,
      value: undefined,
    })
    await expect(mount()).resolves.toBeDefined()
    expect(freezeStore.state.animation).toBe(false)
  })
})
