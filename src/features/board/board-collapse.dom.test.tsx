// @vitest-environment happy-dom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import type { Root } from 'react-dom/client'
import { QueryClientProvider, notifyManager } from '@tanstack/react-query'
import type { QueryClient } from '@tanstack/react-query'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { PREF_KEYS } from '#/lib/prefs'
import { fakeHash, fakeResponse, t } from '#/lib/testing'
import type { MaindataResponse, SlimTorrent } from '#/shared/maindata'
import { DESKTOP_QUERY } from '#/shared/ui/breakpoint'
import { MAIN_ID } from '#/shared/ui/main-scroll'
import { setAutoCollapse } from '#/state/auto-collapse'
import { clearConnectionErrors } from '#/state/connection'
import { clearLoginRequired } from '#/state/login-required'
import { MAINDATA_KEY } from '#/state/maindata'
import { clearMaindataFailure } from '#/state/maindata-failure'
import { freezeStore, resetOrderFreeze } from '#/state/order-freeze'
import { createQueryClient } from '#/state/query-client'
import { ViewedHashContext } from '#/state/viewed-hash'
import {
  COLLAPSE_MS,
  EXPAND_MS,
  SPREAD_MS,
} from '#/features/board/board-collapse'
import { BoardCollapseController } from '#/features/board/board-collapse-controller'
import { TorrentBoard } from '#/features/board/torrent-board'

// Spec 2.8 rows C1, C2, C4, E1, E2, F1, R1, P1, V1 in a DOM (happy-dom).
// happy-dom has no layout, so a small stub gives the column bodies a
// 600px box at y 100 and each card the box its `translate` says; scroll
// events are dispatched by hand. The real layout and the trace are in
// e2e/board-collapse.spec.ts.

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean | undefined
}

const VIEW_TOP = 100
const VIEW_HEIGHT = 600
const h = (n: number) => fakeHash(0x500 + n)

/** 40 seeding torrents (longest first: s0 first), two downloading, one done. */
function data(seeding = 40): Array<SlimTorrent> {
  const out: Array<SlimTorrent> = []
  for (let i = 0; i < seeding; i += 1) {
    out.push(
      t({
        hash: h(i),
        name: `s${i}`,
        state: 'uploading',
        progress: 1,
        seeding_time: 100_000 - i * 60,
      }),
    )
  }
  out.push(
    t({ hash: h(900), name: 'd1', state: 'downloading', progress: 0.3 }),
    t({ hash: h(901), name: 'd2', state: 'downloading', progress: 0.6 }),
    t({ hash: h(902), name: 'done', state: 'stoppedUP', progress: 1 }),
  )
  return out
}

let main: HTMLElement
let root: Root
let client: QueryClient
let answers: Array<MaindataResponse>
let desktop = true
let reduced = true
let animate: ReturnType<typeof vi.fn>
const restores: Array<() => void> = []

function stubPrototype(name: 'clientHeight' | 'clientWidth', value: number) {
  const original = Object.getOwnPropertyDescriptor(HTMLElement.prototype, name)
  Object.defineProperty(HTMLElement.prototype, name, {
    configurable: true,
    get: () => value,
  })
  restores.push(() => {
    if (original) Object.defineProperty(HTMLElement.prototype, name, original)
  })
}

function box(left: number, top: number, width: number, height: number) {
  return {
    left,
    top,
    width,
    height,
    right: left + width,
    bottom: top + height,
    x: left,
    y: top,
    toJSON: () => ({}),
  } as DOMRect
}

const TRANSLATE = /translate(?:Y)?\((?:(-?[\d.]+)px, )?(-?[\d.]+)px\)/

/** Column bodies at y 100, 600 tall; cards where their translate puts them. */
function stubLayout() {
  vi.spyOn(Element.prototype, 'getBoundingClientRect').mockImplementation(
    function (this: Element) {
      const element = this as HTMLElement
      if (element.getAttribute('role') === 'group') {
        return box(0, VIEW_TOP, 300, VIEW_HEIGHT)
      }
      if (element.dataset.hash !== undefined) {
        const scroller = element.closest<HTMLElement>('[role="group"]')
        const match = TRANSLATE.exec(element.style.transform)
        const x = match?.[1] ? Number(match[1]) : 0
        const y = Number(match?.[2] ?? 0)
        return box(
          12 + x,
          VIEW_TOP + y - (scroller?.scrollTop ?? 0),
          parseFloat(element.style.width) || 276,
          parseFloat(element.style.height) || 0,
        )
      }
      return box(0, 0, 0, 0)
    },
  )
}

async function render(first: MaindataResponse) {
  answers = [first]
  let fetches = 0
  client = createQueryClient({
    fetchMaindata: () => {
      fetches += 1
      return Promise.resolve(answers[Math.min(fetches - 1, answers.length - 1)])
    },
    currentPath: () => '/',
  })
  await client.prefetchQuery({ queryKey: MAINDATA_KEY })
  const container = document.createElement('div')
  main.append(container)
  root = createRoot(container)
  await act(async () => {
    root.render(
      <QueryClientProvider client={client}>
        <ViewedHashContext
          value={{ hash: null, setHash: () => {}, followHash: () => {} }}
        >
          <TorrentBoard />
        </ViewedHashContext>
      </QueryClientProvider>,
    )
  })
}

async function poll(response: MaindataResponse) {
  answers.push(response)
  await act(async () => {
    await client.refetchQueries({ queryKey: MAINDATA_KEY })
  })
}

const board = () =>
  main.querySelector('[role="region"][aria-label="看板"]') as HTMLElement
const sections = () =>
  [...board().querySelectorAll(':scope > section')].map((section) =>
    section.getAttribute('aria-label'),
  )
const body = (name: string) =>
  main.querySelector(`[role="group"][aria-label="${name}"]`) as HTMLElement
const button = (label: RegExp) =>
  [...main.querySelectorAll('button')].find((each) =>
    label.test(each.getAttribute('aria-label') ?? ''),
  ) as HTMLButtonElement
const items = (scope: Element) => [
  ...scope.querySelectorAll<HTMLElement>('[role="listitem"]'),
]
const framed = () =>
  [...main.querySelectorAll<HTMLElement>('.anchor-frame')].map(
    (item) => item.querySelector('[title]')?.getAttribute('title') ?? '',
  )

/** A cancelable touch event; happy-dom's TouchEvent has no `touches`. */
function touchEvent(type: string, clientY?: number): Event {
  const event = new Event(type, { bubbles: true, cancelable: true })
  const list = clientY === undefined ? [] : [{ clientY }]
  Object.defineProperty(event, 'touches', {
    value: {
      length: list.length,
      item: (index: number) => list[index] ?? null,
    },
  })
  return event
}

/**
 * Alex scrolls a column body: the position and the event (the virtualizer
 * re-renders for it), then one frame (the collapse check).
 */
async function scroll(element: HTMLElement, top: number) {
  element.scrollTop = top
  await act(async () => {
    element.dispatchEvent(new Event('scroll'))
  })
  await act(async () => {
    await vi.advanceTimersByTimeAsync(20)
  })
}

async function wait(ms: number) {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms)
  })
}

const collapsedBoard = () =>
  board().style.gridTemplateColumns === '64px 64px minmax(0,1fr) 64px 64px'

beforeEach(() => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true
  vi.useFakeTimers({
    toFake: [
      'setTimeout',
      'clearTimeout',
      'requestAnimationFrame',
      'cancelAnimationFrame',
      'performance',
    ],
  })
  notifyManager.setScheduler((callback) => callback())
  desktop = true
  reduced = true
  vi.spyOn(window, 'matchMedia').mockImplementation(
    (query: string) =>
      ({
        matches:
          query === DESKTOP_QUERY
            ? desktop
            : query.includes('reduce')
              ? reduced
              : false,
        media: query,
        addEventListener: () => {},
        removeEventListener: () => {},
      }) as unknown as MediaQueryList,
  )
  animate = vi.fn(() => ({ cancel: () => {}, finished: Promise.resolve() }))
  const original = Object.getOwnPropertyDescriptor(
    HTMLElement.prototype,
    'animate',
  )
  Object.defineProperty(HTMLElement.prototype, 'animate', {
    configurable: true,
    writable: true,
    value: animate,
  })
  restores.push(() => {
    if (original)
      Object.defineProperty(HTMLElement.prototype, 'animate', original)
  })
  stubPrototype('clientHeight', VIEW_HEIGHT)
  stubPrototype('clientWidth', 300)
  stubLayout()
  localStorage.clear()
  clearLoginRequired()
  clearConnectionErrors()
  clearMaindataFailure()
  resetOrderFreeze()
  main = document.createElement('main')
  main.id = MAIN_ID
  document.body.append(main)
})

afterEach(async () => {
  await act(async () => root.unmount())
  client.clear()
  main.remove()
  for (const restore of restores.splice(0)) restore()
  vi.restoreAllMocks()
  vi.useRealTimers()
  notifyManager.setScheduler((callback) => setTimeout(callback, 0))
  globalThis.IS_REACT_ACT_ENVIRONMENT = false
  localStorage.clear()
})

describe('C1 R1 collapse (reduced motion: at once)', () => {
  it('past one column height: strips, the wide column, the anchor framed, no animation', async () => {
    await render(fakeResponse({ changed: data() }))
    const seeding = body('做種中')
    await scroll(seeding, VIEW_HEIGHT)
    expect(collapsedBoard()).toBe(false)
    await scroll(seeding, VIEW_HEIGHT + 1)
    expect(collapsedBoard()).toBe(true)
    expect(sections()).toEqual([
      '要處理欄',
      '下載中欄',
      '做種中，40 個',
      '完成欄',
      '已整理欄',
    ])
    // Strips are real buttons with the count; each says what a press does.
    const strip = button(/^回到看板，下載中/)
    expect(strip.getAttribute('aria-label')).toBe('回到看板，下載中，2 個')
    expect(strip.textContent).toBe('2下載中')
    // A press restores the board, it does not expand that column.
    expect(strip.hasAttribute('aria-expanded')).toBe(false)
    expect(button(/^回到看板，已整理/).getAttribute('aria-label')).toBe(
      '回到看板，已整理，0 個',
    )
    expect(button(/^展開已整理欄/)).toBeUndefined()
    // The anchor: at scrollTop 601 the first fully visible card is s6
    // (each card 89px + 10px gap, the list starts 10px down since story
    // 4.1: s6 starts at 10 + 6 * 99 = 604).
    expect(framed()).toEqual(['s6'])
    expect(animate).not.toHaveBeenCalled()
    expect(freezeStore.state.animation).toBe(false)
  })

  it('the anchor nearest the pointer inside the column', async () => {
    await render(fakeResponse({ changed: data() }))
    // y 100 + 500 = 600 is inside s11 at scrollTop 601 (s11 spans
    // 10 + 11 * 99 = 1099 to 1188, so 598 to 687 on screen).
    document.dispatchEvent(
      new PointerEvent('pointermove', { clientX: 150, clientY: 600 }),
    )
    await scroll(body('做種中'), VIEW_HEIGHT + 1)
    expect(framed()).toEqual(['s11'])
  })

  it('V1 the wide column holds 2 to 3 cards per row and stays under 60 cards', async () => {
    restores.at(-1)?.()
    stubPrototype('clientWidth', 900)
    await render(fakeResponse({ changed: data(1000) }))
    await scroll(body('做種中'), 5000)
    expect(collapsedBoard()).toBe(true)
    const cards = items(body('做種中'))
    expect(cards.length).toBeGreaterThan(0)
    expect(cards.length).toBeLessThan(60)
    // 900px: three per row, each (900 - 20) / 3 wide.
    const widths = new Set(cards.map((card) => parseFloat(card.style.width)))
    expect(widths.size).toBe(1)
    expect([...widths][0]).toBeCloseTo((900 - 20) / 3, 3)
    const rowOf = new Map<string, number>()
    for (const card of cards) {
      const y = TRANSLATE.exec(card.style.transform)?.[2] ?? ''
      rowOf.set(y, (rowOf.get(y) ?? 0) + 1)
    }
    expect(Math.max(...rowOf.values())).toBe(3)
  })
})

describe('C2 off or narrow', () => {
  it('the pref off: scrolling never collapses', async () => {
    localStorage.setItem(PREF_KEYS.autoCollapse, 'off')
    await render(fakeResponse({ changed: data() }))
    await scroll(body('做種中'), 3000)
    expect(collapsedBoard()).toBe(false)
    expect(sections()).toHaveLength(5)
    expect(sections()[1]).toBe('下載中，2 個')
  })

  it('a broken stored value reads the default (on)', async () => {
    localStorage.setItem(PREF_KEYS.autoCollapse, 'maybe')
    await render(fakeResponse({ changed: data() }))
    await scroll(body('做種中'), 3000)
    expect(collapsedBoard()).toBe(true)
  })

  it('turning the pref off in another tab restores the board', async () => {
    await render(fakeResponse({ changed: data() }))
    await scroll(body('做種中'), 3000)
    expect(collapsedBoard()).toBe(true)
    localStorage.setItem(PREF_KEYS.autoCollapse, 'off')
    await act(async () => {
      window.dispatchEvent(
        new StorageEvent('storage', { key: PREF_KEYS.autoCollapse }),
      )
      await vi.advanceTimersByTimeAsync(20)
    })
    expect(collapsedBoard()).toBe(false)
    expect(sections()[1]).toBe('下載中，2 個')
  })

  it('story 3.3: the settings switch (same tab) turns it off and on without a reload', async () => {
    await render(fakeResponse({ changed: data() }))
    await scroll(body('做種中'), 3000)
    expect(collapsedBoard()).toBe(true)
    // No storage event in the same tab: setAutoCollapse tells the board.
    await act(async () => {
      setAutoCollapse(false)
      await vi.advanceTimersByTimeAsync(20)
    })
    expect(localStorage.getItem(PREF_KEYS.autoCollapse)).toBe('off')
    expect(collapsedBoard()).toBe(false)
    await scroll(body('做種中'), 3200)
    expect(collapsedBoard()).toBe(false)
    expect(sections()).toHaveLength(5)
    // Back on: the next scroll collapses again.
    await act(async () => {
      setAutoCollapse(true)
      await vi.advanceTimersByTimeAsync(20)
    })
    await scroll(body('做種中'), 0)
    await scroll(body('做種中'), 3000)
    expect(collapsedBoard()).toBe(true)
  })

  it('below 1024px: the phone board, nothing collapses', async () => {
    desktop = false
    await render(fakeResponse({ changed: data() }))
    const panel = main.querySelector('[role="tabpanel"]') as HTMLElement
    await scroll(panel, 3000)
    expect(main.querySelector('[role="tablist"]')).not.toBeNull()
    expect(button(/^回到看板/)).toBeUndefined()
  })
})

describe('E1 E2 expand', () => {
  it('E1 scrolled up to the top: four columns, scrolled to 0; no re-collapse until past the threshold', async () => {
    await render(fakeResponse({ changed: data() }))
    const seeding = body('做種中')
    await scroll(seeding, 3000)
    expect(collapsedBoard()).toBe(true)
    await scroll(seeding, 40)
    expect(collapsedBoard()).toBe(true)
    await scroll(seeding, 5)
    expect(collapsedBoard()).toBe(false)
    expect(body('做種中').scrollTop).toBe(0)
    expect(sections()).toHaveLength(5)
    await scroll(body('做種中'), 300)
    expect(collapsedBoard()).toBe(false)
    await scroll(body('做種中'), 700)
    expect(collapsedBoard()).toBe(true)
  })

  it('E1 a wheel up at the top past 60px of deltaY expands', async () => {
    await render(fakeResponse({ changed: data() }))
    const seeding = body('做種中')
    await scroll(seeding, 3000)
    seeding.scrollTop = 0
    const wheel = (deltaY: number) =>
      act(async () => {
        seeding.dispatchEvent(
          new WheelEvent('wheel', { deltaY, bubbles: true, cancelable: true }),
        )
        await vi.advanceTimersByTimeAsync(20)
      })
    await wheel(-30)
    await wheel(-30)
    expect(collapsedBoard()).toBe(true)
    await wheel(-5)
    expect(collapsedBoard()).toBe(false)
  })

  it('E2 a strip press (click or Enter) restores the board; that column waits until near its top', async () => {
    await render(fakeResponse({ changed: data() }))
    await scroll(body('做種中'), 3000)
    const strip = button(/^回到看板，完成/)
    strip.focus()
    expect(document.activeElement).toBe(strip)
    await act(async () => strip.click())
    expect(collapsedBoard()).toBe(false)
    // The pressed strip went away; focus is on the restored 完成 column.
    expect(document.activeElement).toBe(body('完成'))
    const seeding = body('做種中')
    // The anchor stays where it was; the column is still far down.
    expect(seeding.scrollTop).toBeGreaterThan(VIEW_HEIGHT)
    await scroll(seeding, seeding.scrollTop + 200)
    expect(collapsedBoard()).toBe(false)
    await scroll(seeding, 3)
    await scroll(seeding, 700)
    expect(collapsedBoard()).toBe(true)
  })

  it('E2 another column still collapses while one is suppressed', async () => {
    await render(fakeResponse({ changed: data() }))
    await scroll(body('做種中'), 3000)
    await act(async () => button(/^回到看板，要處理/).click())
    restores.push(() => {})
    // 下載中 has 2 cards; its body still takes a scrollTop in happy-dom.
    await scroll(body('下載中'), 700)
    expect(board().style.gridTemplateColumns).toBe(
      '64px minmax(0,1fr) 64px 64px 64px',
    )
  })

  it('E2 Enter on a focused strip restores the board and focus lands on that column', async () => {
    await render(fakeResponse({ changed: data() }))
    await scroll(body('做種中'), 3000)
    const strip = button(/^回到看板，下載中/)
    strip.focus()
    // A real Enter on a button sends click; happy-dom does not, so both.
    await act(async () => {
      strip.dispatchEvent(
        new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }),
      )
      strip.click()
    })
    expect(collapsedBoard()).toBe(false)
    expect(document.activeElement).toBe(body('下載中'))
  })

  it('focus inside a column that becomes a strip moves to the wide column', async () => {
    await render(fakeResponse({ changed: data() }))
    const card = body('下載中').querySelector('button') as HTMLButtonElement
    card.focus()
    expect(document.activeElement).toBe(card)
    await scroll(body('做種中'), 3000)
    expect(collapsedBoard()).toBe(true)
    expect(document.activeElement).toBe(body('做種中'))
  })

  it('the expanded 已整理 column can be the wide one; its header closes it at once', async () => {
    const archived = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11].map((i) =>
      t({
        hash: h(600 + i),
        name: `a${i}`,
        state: 'missingFiles',
        completion_on: 1_790_000_000 - i,
      }),
    )
    await render(fakeResponse({ changed: [...data(), ...archived] }))
    await act(async () => button(/^展開已整理欄/).click())
    await scroll(body('已整理'), VIEW_HEIGHT + 50)
    expect(board().style.gridTemplateColumns).toBe(
      '64px 64px 64px 64px minmax(0,1fr)',
    )
    expect(sections().at(-1)).toBe('已整理，12 個')
    await act(async () => button(/^收合已整理欄/).click())
    expect(board().style.gridTemplateColumns).toBe('')
    expect(sections()).toEqual([
      '要處理，0 個',
      '下載中，2 個',
      '做種中，40 個',
      '完成，1 個',
      '已整理欄',
    ])
    expect(button(/^展開已整理欄，12 個/)).toBeDefined()
    expect(freezeStore.state.animation).toBe(false)
  })

  it('a finger pulled down at the top of the wide column (a tablet) expands like a wheel up', async () => {
    await render(fakeResponse({ changed: data() }))
    const seeding = body('做種中')
    await scroll(seeding, 3000)
    seeding.scrollTop = 0
    const touch = (type: string, clientY: number) =>
      act(async () => {
        seeding.dispatchEvent(touchEvent(type, clientY))
        await vi.advanceTimersByTimeAsync(20)
      })
    await touch('touchstart', 200)
    await touch('touchmove', 240)
    await touch('touchmove', 255)
    expect(collapsedBoard()).toBe(true)
    await touch('touchmove', 265)
    expect(collapsedBoard()).toBe(false)
  })
})

describe('C4 F1 with animations', () => {
  beforeEach(() => {
    reduced = false
  })

  it('C4 during the animation the column does not scroll and nothing new starts; steps run in order', async () => {
    await render(fakeResponse({ changed: data() }))
    const seeding = body('做種中')
    await scroll(seeding, 700)
    // Step 1: strips at once, cards keep their width.
    expect(collapsedBoard()).toBe(true)
    expect(freezeStore.state.animation).toBe(true)
    const stepOneWidths = new Set(
      items(seeding).map((card) => card.style.width),
    )
    expect([...stepOneWidths]).toEqual(['276px'])

    const wheel = new WheelEvent('wheel', {
      deltaY: 120,
      bubbles: true,
      cancelable: true,
    })
    seeding.dispatchEvent(wheel)
    expect(wheel.defaultPrevented).toBe(true)
    const key = new KeyboardEvent('keydown', {
      key: 'PageDown',
      bubbles: true,
      cancelable: true,
    })
    seeding.dispatchEvent(key)
    expect(key.defaultPrevented).toBe(true)
    const touchMove = touchEvent('touchmove', 300)
    seeding.dispatchEvent(touchMove)
    expect(touchMove.defaultPrevented).toBe(true)
    // Zoom (ctrl + wheel, a trackpad pinch) and sideways wheels still pass.
    const zoom = new WheelEvent('wheel', {
      deltaY: 30,
      ctrlKey: true,
      bubbles: true,
      cancelable: true,
    })
    // happy-dom drops `ctrlKey` from the WheelEvent init.
    Object.defineProperty(zoom, 'ctrlKey', { value: true })
    seeding.dispatchEvent(zoom)
    expect(zoom.defaultPrevented).toBe(false)
    const sideways = new WheelEvent('wheel', {
      deltaX: 80,
      deltaY: 2,
      bubbles: true,
      cancelable: true,
    })
    seeding.dispatchEvent(sideways)
    expect(sideways.defaultPrevented).toBe(false)
    // An up-scroll to the top does not expand mid-animation.
    await scroll(seeding, 2)
    expect(collapsedBoard()).toBe(true)
    seeding.scrollTop = 700

    // Step 2 after 380 ms: the grid (one per row at 300px in this stub).
    await wait(COLLAPSE_MS)
    expect(items(seeding)[0]?.style.width).not.toBe('276px')
    await wait(SPREAD_MS + 300)
    expect(freezeStore.state.animation).toBe(false)
    const after = new WheelEvent('wheel', {
      deltaY: 120,
      bubbles: true,
      cancelable: true,
    })
    seeding.dispatchEvent(after)
    expect(after.defaultPrevented).toBe(false)
    const touchAfter = touchEvent('touchmove', 300)
    seeding.dispatchEvent(touchAfter)
    expect(touchAfter.defaultPrevented).toBe(false)
    // transform (and opacity for new cards) only.
    const props = new Set(
      animate.mock.calls.flatMap(([frames]) =>
        (frames as Array<Record<string, unknown>>).flatMap((frame) =>
          Object.keys(frame),
        ),
      ),
    )
    expect(
      [...props].every((prop) => ['transform', 'opacity'].includes(prop)),
    ).toBe(true)
  })

  it('the anchor frame is on at step 1 start and lasts the animation plus about 0.9 s', async () => {
    await render(fakeResponse({ changed: data() }))
    await scroll(body('做種中'), 700)
    // In the step 1 commit, before any time passes: the frame is there (its
    // keyframes start at full opacity, styles.test.ts) and step 1's moves
    // have only just been started.
    expect(framed()).toHaveLength(1)
    expect(collapsedBoard()).toBe(true)
    expect(
      animate.mock.calls.every(
        ([, options]) =>
          (options as KeyframeAnimationOptions).duration === COLLAPSE_MS,
      ),
    ).toBe(true)
    const frame = main.querySelector('.anchor-frame') as HTMLElement
    expect(frame.style.getPropertyValue('--here-ms')).toBe(
      `${COLLAPSE_MS + SPREAD_MS + 300 + 900}ms`,
    )
    await wait(COLLAPSE_MS)
    // The collapse started in the scroll's frame (16 of its 20 ms).
    await wait(SPREAD_MS + 300 + 900 - 20)
    expect(framed()).toHaveLength(1)
    await wait(20)
    expect(framed()).toHaveLength(0)
  })

  it('F1 data mid-animation: order holds, applies after; values still update', async () => {
    await render(fakeResponse({ changed: data(12) }))
    await scroll(body('做種中'), 700)
    expect(freezeStore.state.animation).toBe(true)
    const before = items(body('做種中')).map(
      (item) => `${item.dataset.index}:${item.dataset.hash}`,
    )
    // s5 now seeds the shortest (it would move last), and a new torrent
    // arrives that would go first.
    await poll(
      fakeResponse({
        version: 'v2',
        full: false,
        changed: [
          t({
            hash: h(5),
            name: 's5 renamed',
            state: 'uploading',
            progress: 1,
            seeding_time: 1,
          }),
          t({
            hash: h(77),
            name: 'new',
            state: 'uploading',
            progress: 1,
            seeding_time: 999_999,
          }),
        ],
      }),
    )
    // Positions hold: every shown card keeps its index; s5 stays sixth.
    const shown = () =>
      items(body('做種中')).map(
        (item) => `${item.dataset.index}:${item.dataset.hash}`,
      )
    expect(shown()).toEqual(before)
    expect(shown()).toContain(`5:${h(5)}`)
    const s5 = items(body('做種中')).find((item) => item.dataset.hash === h(5))
    expect(s5?.textContent).toContain('s5 renamed')
    expect(
      items(body('做種中')).some((item) => item.dataset.hash === h(77)),
    ).toBe(false)
    // Step 2 commits at 380 ms; its end is scheduled from there.
    await wait(COLLAPSE_MS)
    await wait(SPREAD_MS + 300)
    expect(freezeStore.state.animation).toBe(false)
    body('做種中').scrollTop = 0
    await act(async () => body('做種中').dispatchEvent(new Event('scroll')))
    expect(
      items(body('做種中')).some((item) => item.dataset.hash === h(77)),
    ).toBe(true)
  })

  it('the pref turned off mid-animation restores the board once it ends', async () => {
    await render(fakeResponse({ changed: data() }))
    await scroll(body('做種中'), 3000)
    expect(collapsedBoard()).toBe(true)
    localStorage.setItem(PREF_KEYS.autoCollapse, 'off')
    await act(async () => {
      window.dispatchEvent(
        new StorageEvent('storage', { key: PREF_KEYS.autoCollapse }),
      )
    })
    expect(collapsedBoard()).toBe(true)
    await wait(COLLAPSE_MS)
    await wait(SPREAD_MS + 300)
    // The collapse ended; the expand started from there.
    expect(collapsedBoard()).toBe(false)
    await wait(EXPAND_MS + 100)
    expect(freezeStore.state.animation).toBe(false)
    expect(sections()[1]).toBe('下載中，2 個')
  })

  it('an anchor removed during step 1: step 2 keeps a new anchor on screen', async () => {
    await render(fakeResponse({ changed: data() }))
    const seeding = body('做種中')
    await scroll(seeding, 3000)
    const anchor = main.querySelector<HTMLElement>('.anchor-frame')
    const gone = anchor?.dataset.hash ?? ''
    expect(gone).not.toBe('')
    await poll(fakeResponse({ version: 'v3', full: false, removed: [gone] }))
    await wait(COLLAPSE_MS)
    // A new anchor took over: framed, still in the scroll box.
    const next = main.querySelector<HTMLElement>('.anchor-frame')
    expect(next?.dataset.hash).toBeDefined()
    expect(next?.dataset.hash).not.toBe(gone)
    const rect = next?.getBoundingClientRect()
    expect(rect?.top).toBeGreaterThanOrEqual(VIEW_TOP - 2)
    expect(rect?.bottom).toBeLessThanOrEqual(VIEW_TOP + VIEW_HEIGHT)
    expect(seeding.scrollTop).toBeGreaterThan(VIEW_HEIGHT)
    await wait(SPREAD_MS + 300)
  })

  it('running animations are cancelled when the collapse resets or unmounts', async () => {
    const handles: Array<{ cancel: ReturnType<typeof vi.fn> }> = []
    animate.mockImplementation(() => {
      const handle = { cancel: vi.fn(), finished: Promise.resolve() }
      handles.push(handle)
      return handle
    })
    const archived = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11].map((i) =>
      t({
        hash: h(600 + i),
        name: `a${i}`,
        state: 'missingFiles',
        completion_on: 1_790_000_000 - i,
      }),
    )
    await render(fakeResponse({ changed: [...data(), ...archived] }))
    await act(async () => button(/^展開已整理欄/).click())
    await scroll(body('已整理'), VIEW_HEIGHT + 50)
    expect(handles.length).toBeGreaterThan(0)
    // Closing the wide 已整理 column resets at once.
    await act(async () => button(/^收合已整理欄/).click())
    expect(
      handles.every((handle) => handle.cancel.mock.calls.length === 1),
    ).toBe(true)

    // And on unmount mid-animation.
    handles.length = 0
    await scroll(body('做種中'), 3000)
    expect(handles.length).toBeGreaterThan(0)
    await act(async () => root.unmount())
    expect(
      handles.every((handle) => handle.cancel.mock.calls.length === 1),
    ).toBe(true)
    root = createRoot(document.createElement('div'))
  })

  it('F1 unmounting mid-animation releases the hold', async () => {
    await render(fakeResponse({ changed: data() }))
    await scroll(body('做種中'), 700)
    expect(freezeStore.state.animation).toBe(true)
    await act(async () => root.unmount())
    expect(freezeStore.state.animation).toBe(false)
    root = createRoot(document.createElement('div'))
  })

  it('expand animates back and releases at the end', async () => {
    await render(fakeResponse({ changed: data() }))
    const seeding = body('做種中')
    await scroll(seeding, 3000)
    await wait(COLLAPSE_MS)
    await wait(SPREAD_MS + 300)
    animate.mockClear()
    await scroll(seeding, 2000)
    await scroll(seeding, 4)
    expect(collapsedBoard()).toBe(false)
    expect(freezeStore.state.animation).toBe(true)
    expect(body('做種中').scrollTop).toBe(0)
    expect(animate).toHaveBeenCalled()
    await wait(EXPAND_MS + 100)
    expect(freezeStore.state.animation).toBe(false)
  })
})

describe('review fixes', () => {
  it('R1 reduced motion ends only after the commit, so the pin is applied first', async () => {
    const views: Array<unknown> = []
    const controller = new BoardCollapseController((next) => views.push(next))
    const rootElement = document.createElement('div')
    const scroller = document.createElement('div')
    rootElement.append(scroller)
    document.body.append(rootElement)
    controller.setRoot(rootElement)
    controller.scrollerRef('seeding')(scroller)
    expect(controller.collapse('seeding')).toBe(true)
    expect(views).toHaveLength(1)
    // No commit yet: no timer may end it (that would clear the pin in the
    // same render, before the pin's layout effect runs).
    await wait(1000)
    expect(freezeStore.state.animation).toBe(true)
    expect(views).toHaveLength(1)
    // The hook's layout effect after the commit ends it.
    controller.runPending()
    expect(freezeStore.state.animation).toBe(false)
    controller.setRoot(null)
    rootElement.remove()
  })

  it('wheel and touchmove on the board are passive except during a transition', async () => {
    reduced = false
    const added: Array<{ type: string; passive: unknown }> = []
    const removed: Array<string> = []
    const add = HTMLElement.prototype.addEventListener
    const remove = HTMLElement.prototype.removeEventListener
    vi.spyOn(HTMLElement.prototype, 'addEventListener').mockImplementation(
      function (this: HTMLElement, type, listener, options) {
        if (this.getAttribute('aria-label') === '看板') {
          added.push({
            type,
            passive: typeof options === 'object' ? options.passive : undefined,
          })
        }
        add.call(this, type, listener, options)
      },
    )
    vi.spyOn(HTMLElement.prototype, 'removeEventListener').mockImplementation(
      function (this: HTMLElement, type, listener, options) {
        if (this.getAttribute('aria-label') === '看板') removed.push(type)
        remove.call(this, type, listener, options)
      },
    )
    await render(fakeResponse({ changed: data() }))
    const scrollers = added.filter(
      (each) => each.type === 'wheel' || each.type === 'touchmove',
    )
    expect(scrollers.length).toBeGreaterThan(0)
    expect(scrollers.every((each) => each.passive === true)).toBe(true)
    added.length = 0
    await scroll(body('做種中'), 700)
    expect(added).toEqual([
      { type: 'wheel', passive: false },
      { type: 'touchmove', passive: false },
    ])
    await wait(COLLAPSE_MS)
    await wait(SPREAD_MS + 300)
    expect(freezeStore.state.animation).toBe(false)
    expect(removed).toEqual(['wheel', 'touchmove'])
  })

  it('a step ends when its last animation does, delays included', async () => {
    reduced = false
    restores.at(-1)?.()
    stubPrototype('clientWidth', 900)
    animate.mockImplementation(
      (_frames: unknown, options: { duration: number; delay?: number }) => ({
        cancel: () => {},
        finished: Promise.resolve(),
        effect: {
          getComputedTiming: () => ({
            endTime: (options.delay ?? 0) + options.duration,
          }),
        },
      }),
    )
    await render(fakeResponse({ changed: data() }))
    await scroll(body('做種中'), 700)
    await wait(COLLAPSE_MS)
    // Step 2 spreads to three per row, so cards new to the screen rise in
    // after their staggered delays.
    const last = Math.max(
      ...animate.mock.calls.map(
        ([, options]) =>
          ((options as { delay?: number }).delay ?? 0) +
          (options as { duration: number }).duration,
      ),
    )
    expect(last).toBeGreaterThan(SPREAD_MS + 300)
    await wait(SPREAD_MS + 300)
    expect(freezeStore.state.animation).toBe(true)
    await wait(last - SPREAD_MS)
    expect(freezeStore.state.animation).toBe(false)
  })
})

describe('P1 the detail panel', () => {
  it('collapse never touches data-archived (the panel width depends only on it)', async () => {
    await render(fakeResponse({ changed: data() }))
    expect(board().dataset.archived).toBe('closed')
    await scroll(body('做種中'), 3000)
    expect(collapsedBoard()).toBe(true)
    expect(board().dataset.archived).toBe('closed')
  })
})
