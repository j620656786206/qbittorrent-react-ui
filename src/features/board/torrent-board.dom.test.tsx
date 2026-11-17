// @vitest-environment happy-dom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import type { Root } from 'react-dom/client'
import { QueryClientProvider, notifyManager } from '@tanstack/react-query'
import type { QueryClient } from '@tanstack/react-query'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { AppError } from '#/lib/app-error'
import { LIST_LOAD_FAILED } from '#/lib/error-text'
import { fakeHash, fakeResponse, t } from '#/lib/testing'
import type { MaindataResponse, SlimTorrent } from '#/shared/maindata'
import { DESKTOP_QUERY } from '#/shared/ui/breakpoint'
import { MAIN_ID } from '#/shared/ui/main-scroll'
import { clearConnectionErrors } from '#/state/connection'
import { replayEntrance, resetEntrance } from '#/state/entrance'
import { stubElementAnimate } from '#/state/entrance-testing'
import type { AnimateStub } from '#/state/entrance-testing'
import { clearLoginRequired } from '#/state/login-required'
import { MAINDATA_KEY } from '#/state/maindata'
import { clearMaindataFailure } from '#/state/maindata-failure'
import { freezeStore, resetOrderFreeze } from '#/state/order-freeze'
import { createQueryClient } from '#/state/query-client'
import { ViewedHashContext } from '#/state/viewed-hash'
import {
  CARD_GAP,
  CARD_HEIGHT,
  CARD_HEIGHT_WITH_BAR,
} from '#/features/board/board-model'
import type * as BoardModel from '#/features/board/board-model'
import { TorrentBoard } from '#/features/board/torrent-board'

// Spec 2.3: the board's wiring in a DOM (happy-dom): columns from the live
// maindata, cards that do not re-render on a poll that leaves them alone,
// no freeze, 已整理 expand and collapse with focus, the states, and the
// phone tabs with keys and a pointer swipe. Layout and real touch are in
// the browser smoke (e2e/board.spec.ts).

const modelCalls = vi.hoisted(() => new Map<string, number>())
vi.mock('#/features/board/board-model', async (importOriginal) => {
  const actual = await importOriginal<typeof BoardModel>()
  return {
    ...actual,
    cardModel: (...args: Parameters<typeof actual.cardModel>) => {
      const hash = args[0].hash
      modelCalls.set(hash, (modelCalls.get(hash) ?? 0) + 1)
      return actual.cardModel(...args)
    },
  }
})

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean | undefined
}

const T0 = 1_790_000_000
const h = (n: number) => fakeHash(0x100 + n)

/** Sample-like: 要處理 2, 下載中 1, 做種中 1, 完成 0, 已整理 2. */
function sample(): Array<SlimTorrent> {
  return [
    t({ hash: h(1), name: 'Down', state: 'downloading', progress: 0.87 }),
    t({
      hash: h(2),
      name: 'Seed',
      state: 'uploading',
      progress: 1,
      seeding_time: 600,
    }),
    t({
      hash: h(3),
      name: 'Stalled',
      state: 'stalledDL',
      progress: 0.42,
      last_activity: T0 + 60,
    }),
    t({
      hash: h(4),
      name: 'Error',
      state: 'missingFiles',
      private: true,
      last_activity: T0,
    }),
    t({ hash: h(5), name: 'Arch1', state: 'missingFiles', completion_on: T0 }),
    t({
      hash: h(6),
      name: 'Arch2',
      state: 'missingFiles',
      completion_on: T0 + 5,
    }),
  ]
}

let main: HTMLElement
let root: Root
let client: QueryClient
let answers: Array<MaindataResponse | AppError | 'pending'>
let fetchCount: number
let desktop = true
const restores: Array<() => void> = []
const setHash = vi.fn()

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

async function render(first: MaindataResponse | AppError | 'pending') {
  answers = [first]
  fetchCount = 0
  client = createQueryClient({
    fetchMaindata: () => {
      fetchCount += 1
      const answer = answers[Math.min(fetchCount - 1, answers.length - 1)]
      if (answer === 'pending') return new Promise(() => {})
      return answer instanceof AppError
        ? Promise.reject(answer)
        : Promise.resolve(answer)
    },
    currentPath: () => '/',
  })
  if (first !== 'pending') {
    await client.prefetchQuery({ queryKey: MAINDATA_KEY })
  }
  const container = document.createElement('div')
  main.append(container)
  root = createRoot(container)
  await act(async () => {
    root.render(
      <QueryClientProvider client={client}>
        <ViewedHashContext value={{ hash: null, setHash }}>
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

const delta = (changed: Array<SlimTorrent>) =>
  fakeResponse({ version: `v${Math.random()}`, full: false, changed })

const sections = () =>
  [
    ...main.querySelectorAll('[role="region"][aria-label="看板"] > section'),
  ].map((section) => section.getAttribute('aria-label'))
const section = (label: string) =>
  main.querySelector(`section[aria-label="${label}"]`) as HTMLElement
const names = (scope: Element) =>
  [...scope.querySelectorAll('[role="listitem"]')].map(
    (item) => item.querySelector('[title]')?.getAttribute('title') ?? '',
  )
const button = (label: string) =>
  main.querySelector(`button[aria-label="${label}"]`) as HTMLButtonElement

beforeEach(() => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true
  notifyManager.setScheduler((callback) => callback())
  modelCalls.clear()
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
  // The virtualizer reads each column body's size from these.
  stubPrototype('clientHeight', 600)
  stubPrototype('clientWidth', 300)
  clearLoginRequired()
  clearConnectionErrors()
  clearMaindataFailure()
  resetOrderFreeze()
  resetEntrance()
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
  notifyManager.setScheduler((callback) => setTimeout(callback, 0))
  globalThis.IS_REACT_ACT_ENVIRONMENT = false
})

describe('opening the detail (spec 2.4)', () => {
  it('a card is a button with the hover ring; a click sets hash', async () => {
    setHash.mockClear()
    await render(fakeResponse({ changed: sample() }))
    const card = section('下載中，1 個').querySelector(
      '[role="listitem"] > button',
    ) as HTMLButtonElement
    expect(card.type).toBe('button')
    expect(card.className).toContain('hover-ring')
    await act(async () => card.click())
    expect(setHash).toHaveBeenCalledWith(h(1))
  })

  it('a phone card opens it too', async () => {
    setHash.mockClear()
    desktop = false
    await render(fakeResponse({ changed: sample() }))
    const card = main.querySelector(
      '[role="tabpanel"] [role="listitem"] > button',
    ) as HTMLButtonElement
    await act(async () => card.click())
    expect(setHash).toHaveBeenCalledWith(h(3))
  })
})

describe('the desktop board', () => {
  it('K1 K3 four work columns with counts and orders, 已整理 collapsed', async () => {
    await render(fakeResponse({ changed: sample() }))
    expect(sections()).toEqual([
      '要處理，2 個',
      '下載中，1 個',
      '做種中，1 個',
      '完成，0 個',
      '已整理欄',
    ])
    expect(names(section('要處理，2 個'))).toEqual(['Stalled', 'Error'])
    expect(section('完成，0 個').textContent).toContain('沒有')
    expect(
      [...main.querySelectorAll('h2')].map((h2) => h2.getAttribute('title')),
    ).toEqual([
      '最新出問題的在前',
      '新加入的在前',
      '做種最久的在前',
      '剛完成的在前',
    ])
    const expand = button('展開已整理欄，2 個')
    expect(expand.getAttribute('aria-expanded')).toBe('false')
    expect(expand.textContent).toBe('2已整理')
    // Cards keep their names as plain text with the full name as title.
    const card = section('下載中，1 個').querySelector('[role="listitem"]')
    expect(
      card?.querySelector('[role="img"]')?.getAttribute('aria-label'),
    ).toBe('下載中，87%')
    expect(card?.textContent).toContain('87%')
  })

  it('K8 已整理 expands and collapses; focus follows', async () => {
    await render(fakeResponse({ changed: sample() }))
    const expand = button('展開已整理欄，2 個')
    await act(async () => expand.click())
    expect(sections()).toEqual([
      '要處理，2 個',
      '下載中，1 個',
      '做種中，1 個',
      '完成，0 個',
      '已整理，2 個',
    ])
    expect(names(section('已整理，2 個'))).toEqual(['Arch2', 'Arch1'])
    const collapse = button('收合已整理欄，2 個')
    expect(document.activeElement).toBe(collapse)
    expect(collapse.getAttribute('aria-expanded')).toBe('true')
    await act(async () => collapse.click())
    expect(document.activeElement).toBe(button('展開已整理欄，2 個'))
  })

  it('K10 live: a poll moves a card between columns; untouched cards keep their render', async () => {
    await render(fakeResponse({ changed: sample() }))
    const before = new Map(modelCalls)
    const board = main.querySelector('[role="region"][aria-label="看板"]')
    // The mouse on the board freezes nothing.
    board?.dispatchEvent(
      new PointerEvent('pointerover', { bubbles: true, pointerType: 'mouse' }),
    )
    expect(freezeStore.state.pointerInList).toBe(false)
    await poll(
      delta([
        t({
          hash: h(1),
          name: 'Down',
          state: 'stoppedUP',
          progress: 1,
          completion_on: T0,
        }),
      ]),
    )
    expect(sections()[1]).toBe('下載中，0 個')
    expect(names(section('完成，1 個'))).toEqual(['Down'])
    expect(section('下載中，0 個').textContent).toContain('沒有')
    // Only the changed torrent built its card again.
    expect(modelCalls.get(h(2))).toBe(before.get(h(2)))
    expect(modelCalls.get(h(3))).toBe(before.get(h(3)))
  })

  it('a height change inside a column moves the cards below it', async () => {
    /** The desktop column body's space above the first card. */
    const PADDING_START = 4
    await render(
      fakeResponse({
        changed: [
          t({
            hash: h(1),
            name: 'First',
            state: 'stalledDL',
            progress: 0.4,
            last_activity: T0 + 60,
          }),
          t({ hash: h(2), name: 'Second', state: 'error', last_activity: T0 }),
        ],
      }),
    )
    const items = () => [
      ...section('要處理，2 個').querySelectorAll<HTMLElement>(
        '[role="listitem"]',
      ),
    ]
    expect(names(section('要處理，2 個'))).toEqual(['First', 'Second'])
    expect(items()[1].style.transform).toBe(
      `translateY(${CARD_HEIGHT_WITH_BAR + CARD_GAP + PADDING_START}px)`,
    )
    // The first loses its bar (stalled to error) without leaving the column.
    await poll(
      delta([
        t({
          hash: h(1),
          name: 'First',
          state: 'error',
          last_activity: T0 + 60,
        }),
      ]),
    )
    expect(names(section('要處理，2 個'))).toEqual(['First', 'Second'])
    expect(items()[1].style.transform).toBe(
      `translateY(${CARD_HEIGHT + CARD_GAP + PADDING_START}px)`,
    )
  })

  it('the desktop column body is focusable and named like the column', async () => {
    await render(fakeResponse({ changed: sample() }))
    const body =
      section('做種中，1 個').querySelector<HTMLElement>('[role="group"]')
    expect(body?.tabIndex).toBe(0)
    expect(body?.getAttribute('aria-label')).toBe('做種中')
  })

  it('K7 nothing stalled or errored: 要處理 says 都沒問題', async () => {
    await render(
      fakeResponse({ changed: [t({ hash: h(1), state: 'downloading' })] }),
    )
    expect(section('要處理，0 個').textContent).toContain('都沒問題')
  })
})

describe('board states', () => {
  it('K11 first load: card skeletons, busy, no spinner text', async () => {
    await render('pending')
    const busy = main.querySelector('[aria-busy="true"]')
    expect(busy?.getAttribute('aria-label')).toBe('看板，載入中')
    expect(
      main.querySelectorAll('[data-slot="skeleton"]').length,
    ).toBeGreaterThan(12)
    expect(main.textContent).not.toContain('載入中…')
  })

  it('K14 a first-load failure shows the list error block', async () => {
    await render(new AppError('qbit_rejected'))
    expect(main.querySelector('[role="alert"]')?.textContent).toBe(
      LIST_LOAD_FAILED,
    )
    expect(main.querySelector('button')?.textContent).toBe('重試')
  })

  it('K14 no torrent at all: the list empty block', async () => {
    await render(fakeResponse({ changed: [] }))
    expect(main.querySelector('[role="status"]')?.textContent).toBe(
      '這個分類沒有種子',
    )
  })
})

describe('the phone board', () => {
  const tabs = () => [
    ...main.querySelectorAll<HTMLButtonElement>('[role="tab"]'),
  ]
  const selected = () =>
    tabs().findIndex((tab) => tab.getAttribute('aria-selected') === 'true')
  const panels = () => [
    ...main.querySelectorAll<HTMLElement>('[role="tabpanel"]'),
  ]
  const track = () =>
    main.querySelector('[data-slot="board-track"]') as HTMLElement
  const swipeArea = () =>
    main.querySelector('[data-slot="board-swipe"]') as HTMLElement

  function pointer(
    type: 'pointerdown' | 'pointermove' | 'pointerup' | 'pointercancel',
    x: number,
    y = 300,
  ) {
    const target = panels()[selected()]
    target.dispatchEvent(
      new PointerEvent(type, {
        bubbles: true,
        pointerId: 1,
        pointerType: 'touch',
        isPrimary: true,
        clientX: x,
        clientY: y,
      }),
    )
  }

  beforeEach(() => {
    desktop = false
  })

  it('K12 four tabs with counts, starting at 要處理; no 已整理', async () => {
    await render(fakeResponse({ changed: sample() }))
    expect(tabs().map((tab) => tab.getAttribute('aria-label'))).toEqual([
      '要處理，2 個',
      '下載中，1 個',
      '做種中，1 個',
      '完成，0 個',
    ])
    expect(selected()).toBe(0)
    expect(tabs().map((tab) => tab.tabIndex)).toEqual([0, -1, -1, -1])
    expect(panels().map((panel) => panel.getAttribute('aria-label'))).toEqual([
      '要處理',
      '下載中',
      '做種中',
      '完成',
    ])
    expect(panels().map((panel) => panel.hasAttribute('inert'))).toEqual([
      false,
      true,
      true,
      true,
    ])
    expect(tabs()[0].getAttribute('aria-controls')).toBe(panels()[0].id)
    expect(main.textContent).not.toContain('已整理')
    expect(main.querySelector('[role="region"][aria-label="看板"]')).toBeNull()
  })

  it('a tap and the arrow keys change the column (wrapping, Home, End)', async () => {
    await render(fakeResponse({ changed: sample() }))
    await act(async () => tabs()[2].click())
    expect(selected()).toBe(2)
    expect(track().style.transform).toBe('translateX(calc(-200% + 0px))')
    expect(panels()[2].textContent).toContain('Seed')
    const key = async (name: string) =>
      act(async () => {
        tabs()[selected()].dispatchEvent(
          new KeyboardEvent('keydown', { key: name, bubbles: true }),
        )
      })
    await key('ArrowRight')
    expect(selected()).toBe(3)
    expect(document.activeElement).toBe(tabs()[3])
    expect(panels()[3].textContent).toContain('沒有')
    await key('ArrowRight')
    expect(selected()).toBe(0)
    await key('ArrowLeft')
    expect(selected()).toBe(3)
    await key('Home')
    expect(selected()).toBe(0)
    await key('End')
    expect(selected()).toBe(3)
  })

  it('K12 a sideways swipe past a quarter moves one column; the track follows', async () => {
    await render(fakeResponse({ changed: sample() }))
    await act(async () => {
      pointer('pointerdown', 300)
      pointer('pointermove', 280)
      pointer('pointermove', 200)
    })
    // Following the finger, no transition while dragging.
    expect(track().style.transition).toBe('none')
    expect(track().style.transform).toBe('translateX(calc(0% + -100px))')
    await act(async () => pointer('pointerup', 180))
    expect(selected()).toBe(1)
    expect(track().style.transition).toBe('')
    expect(track().style.transform).toBe('translateX(calc(-100% + 0px))')
    expect(swipeArea().className).toContain('touch-pan-y')
  })

  it('a vertical move is never a swipe; a cancelled swipe goes back', async () => {
    await render(fakeResponse({ changed: sample() }))
    await act(async () => {
      pointer('pointerdown', 300, 300)
      pointer('pointermove', 290, 200)
      pointer('pointermove', 150, 180)
      pointer('pointerup', 100, 180)
    })
    expect(selected()).toBe(0)
    await act(async () => {
      pointer('pointerdown', 300)
      pointer('pointermove', 100)
      pointer('pointercancel', 100)
    })
    expect(selected()).toBe(0)
    expect(track().style.transform).toBe('translateX(calc(0% + 0px))')
  })

  it('past the first column the track only stretches', async () => {
    await render(fakeResponse({ changed: sample() }))
    await act(async () => {
      pointer('pointerdown', 100)
      pointer('pointermove', 130)
      pointer('pointermove', 250)
    })
    expect(track().style.transform).toBe('translateX(calc(0% + 50px))')
    await act(async () => pointer('pointerup', 250))
    expect(selected()).toBe(0)
  })

  it('K11 the phone skeleton: tabs with placeholders and one busy column', async () => {
    await render('pending')
    expect(tabs().map((tab) => tab.getAttribute('aria-label'))).toEqual([
      '要處理，載入中',
      '下載中，載入中',
      '做種中，載入中',
      '完成，載入中',
    ])
    expect(panels()).toHaveLength(1)
    expect(panels()[0].getAttribute('aria-busy')).toBe('true')
  })
})

describe('the entrance (spec 2.9)', () => {
  let stub: AnimateStub
  let reduced: boolean

  /** A card list body: desktop group or phone tab panel. */
  const BODY = '[role="group"], [role="tabpanel"]'

  /** Body `i` of the phone track sits `i - selected` windows to the side. */
  function bodyRect(body: Element): DOMRect {
    if (body.getAttribute('role') !== 'tabpanel')
      return new DOMRect(0, 0, 300, 600)
    const all = [...main.querySelectorAll('[role="tabpanel"]')]
    const shown = all.findIndex((panel) => !panel.hasAttribute('inert'))
    const x = (all.indexOf(body) - shown) * window.innerWidth
    return new DOMRect(x, 0, window.innerWidth, 600)
  }

  beforeEach(() => {
    stub = stubElementAnimate()
    reduced = false
    vi.spyOn(window, 'matchMedia').mockImplementation(
      (query: string) =>
        ({
          matches:
            query === DESKTOP_QUERY
              ? desktop
              : query.includes('prefers-reduced-motion') && reduced,
          media: query,
          addEventListener: () => {},
          removeEventListener: () => {},
        }) as unknown as MediaQueryList,
    )
    vi.spyOn(Element.prototype, 'getBoundingClientRect').mockImplementation(
      function (this: Element) {
        if (this.matches(BODY)) return bodyRect(this)
        // A row's arc and bar get the row's own box.
        if (
          !this.matches(
            '[data-entrance], [data-progress-arc], [data-progress-bar]',
          )
        )
          return new DOMRect(0, 0, 0, 0)
        const body = this.closest(BODY)
        const wrapper = this.closest<HTMLElement>('[data-hash]')
        const y = Number(
          /(?:translateY\(|, )(-?[\d.]+)px\)/.exec(
            wrapper?.style.transform ?? '',
          )?.[1] ?? NaN,
        )
        const box = body ? bodyRect(body) : new DOMRect(0, 0, 0, 0)
        return new DOMRect(
          box.x,
          y,
          box.width,
          Number.parseFloat(wrapper?.style.height ?? '0'),
        )
      },
    )
  })

  afterEach(() => {
    stub.restore()
  })

  /** `name` of the card each call's element sits in, with the delay. */
  const calls = (attribute: string) =>
    stub.calls
      .filter((call) => call.element.hasAttribute(attribute))
      .map((call) => [
        call.element
          .closest('[data-hash]')
          ?.querySelector('[title]')
          ?.getAttribute('title'),
        // Columns after the first join a moment later (their delays shift
        // by under a ms): the stagger step each delay is at.
        Math.round(Number(call.options.delay) / 60) * 60 || 0,
      ])

  it('desktop: each column rises from its own first row; rings and bars grow with their card', async () => {
    await render(fakeResponse({ changed: sample() }))
    expect(calls('data-entrance')).toEqual([
      ['Stalled', 0],
      ['Error', 60],
      ['Down', 0],
      ['Seed', 0],
    ])
    expect(calls('data-progress-arc')).toEqual([
      ['Stalled', 0],
      ['Down', 0],
    ])
    expect(calls('data-progress-bar')).toEqual([
      ['Stalled', 0],
      ['Down', 0],
    ])
    const bar = stub.calls.find((call) =>
      call.element.hasAttribute('data-progress-bar'),
    )
    expect(bar?.keyframes).toEqual([{ offset: 0, transform: 'scaleX(0)' }])
    expect(bar?.element.classList.contains('origin-left')).toBe(true)
    // The card button rises, never the wrapper the virtualizer moves.
    expect(
      stub.calls.some((call) => call.element.hasAttribute('data-hash')),
    ).toBe(false)
  })

  it('a poll moving a card starts nothing; replayEntrance() plays again', async () => {
    await render(fakeResponse({ changed: sample() }))
    // The entrance ends (its order hold with it), then the poll applies.
    await act(async () => {
      for (const call of stub.calls) call.finish()
      await Promise.resolve()
    })
    expect(freezeStore.state.animation).toBe(false)
    stub.calls.length = 0
    await poll(
      delta([t({ hash: h(1), name: 'Down', state: 'uploading', progress: 1 })]),
    )
    expect(stub.calls).toHaveLength(0)
    await act(async () => replayEntrance())
    expect(calls('data-entrance').map(([name]) => name)).toEqual([
      'Stalled',
      'Error',
      'Seed',
      'Down',
    ])
  })

  it('phone: only the visible panel animates', async () => {
    desktop = false
    await render(fakeResponse({ changed: sample() }))
    expect(calls('data-entrance')).toEqual([
      ['Stalled', 0],
      ['Error', 60],
    ])
  })

  it('reduced motion: nothing animates, nothing holds', async () => {
    reduced = true
    await render(fakeResponse({ changed: sample() }))
    expect(stub.calls).toHaveLength(0)
    expect(freezeStore.state.animation).toBe(false)
  })
})
