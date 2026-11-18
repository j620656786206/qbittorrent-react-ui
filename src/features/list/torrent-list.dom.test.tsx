// @vitest-environment happy-dom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import type { Root } from 'react-dom/client'
import { QueryClientProvider, notifyManager } from '@tanstack/react-query'
import type { QueryClient } from '@tanstack/react-query'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { AppError } from '#/lib/app-error'
import { fakeHash, fakeResponse, t } from '#/lib/testing'
import type { MaindataResponse, SlimTorrent } from '#/shared/maindata'
import { LIST_SCROLL_ID, MAIN_ID } from '#/shared/ui/main-scroll'
import { ringOffset } from '#/shared/ui/status-circle'
import { clearConnectionErrors } from '#/state/connection'
import { replayEntrance, resetEntrance } from '#/state/entrance'
import { stubElementAnimate, stubReducedMotion } from '#/state/entrance-testing'
import type { AnimateStub } from '#/state/entrance-testing'
import { clearLoginRequired } from '#/state/login-required'
import { getErrorReasons } from '#/server/functions/get-error-reasons'
import { bindFetchErrorReasons } from '#/state/error-reasons'
import { MAINDATA_KEY } from '#/state/maindata'
import { clearMaindataFailure } from '#/state/maindata-failure'
import {
  freezeStore,
  holdOrderForSheet,
  resetOrderFreeze,
} from '#/state/order-freeze'
import { createQueryClient } from '#/state/query-client'
import { ListViewContext } from '#/state/list-view'
import { clearShownList, shownListStore } from '#/state/shown-order'
import { ViewedHashContext } from '#/state/viewed-hash'
import type { SortView } from '#/shared/list-search'
import type * as ListModel from '#/features/list/list-model'
import { TorrentList } from '#/features/list/torrent-list'

// Review of 1.7 to 1.9: the list's wiring in a DOM (happy-dom), which the
// node tests in torrent-list.test.tsx cannot reach: the virtualizer window,
// rows that do not re-render on a poll, the freeze from the mouse and from
// a finger, the sticky `:hover` of a phone, and the guarded 「重試」.

const modelCalls = vi.hoisted(() => new Map<string, number>())
vi.mock('#/features/list/list-model', async (importOriginal) => {
  const actual = await importOriginal<typeof ListModel>()
  return {
    ...actual,
    rowModel: (...args: Parameters<typeof actual.rowModel>) => {
      const hash = args[0].hash
      modelCalls.set(hash, (modelCalls.get(hash) ?? 0) + 1)
      return actual.rowModel(...args)
    },
  }
})

// getSortKeys never reaches a server here: each call waits for the test.
const sortKeyCalls = vi.hoisted(
  () => [] as Array<{ data: unknown; resolve: (value: unknown) => void }>,
)
vi.mock('#/server/functions/get-sort-keys', () => ({
  getSortKeys: (options: { data: unknown }) =>
    new Promise((resolve) => {
      sortKeyCalls.push({ data: options.data, resolve })
    }),
}))

// Story 2.10: getErrorReasons never reaches a server here; each test sets
// the map it answers.
const reasonCalls = vi.hoisted(
  (): { count: number; reasons: Record<string, string> } => ({
    count: 0,
    reasons: {},
  }),
)
vi.mock('#/server/functions/get-error-reasons', () => ({
  getErrorReasons: () => {
    reasonCalls.count += 1
    return Promise.resolve({ ok: true, data: { reasons: reasonCalls.reasons } })
  },
}))

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean | undefined
}

const VIEWPORT = 600
const BASE_ADDED = 1_790_000_000

/** Torrent `i`; a higher `i` was added later, so it sorts first. */
const torrent = (i: number, overrides: Partial<SlimTorrent> = {}) =>
  t({
    hash: fakeHash(i + 1),
    name: `T${i}`,
    added_on: BASE_ADDED + i,
    ...overrides,
  })

const many = (count: number) =>
  Array.from({ length: count }, (_, i) => torrent(i))

let main: HTMLElement
let root: Root
let client: QueryClient
let answers: Array<MaindataResponse | AppError>
let fetchCount: number

function mountMain() {
  main = document.createElement('main')
  main.id = MAIN_ID
  main.tabIndex = -1
  document.body.append(main)
  // The virtualizer reads the viewport of the list's own scroller (story
  // 2.4) from clientWidth and clientHeight.
  const height = Object.getOwnPropertyDescriptor(
    HTMLElement.prototype,
    'clientHeight',
  )
  const width = Object.getOwnPropertyDescriptor(
    HTMLElement.prototype,
    'clientWidth',
  )
  vi.spyOn(HTMLElement.prototype, 'clientHeight', 'get').mockImplementation(
    function (this: HTMLElement) {
      return this.id === LIST_SCROLL_ID
        ? VIEWPORT
        : (height?.get?.call(this) as number)
    },
  )
  vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockImplementation(
    function (this: HTMLElement) {
      return this.id === LIST_SCROLL_ID
        ? 1000
        : (width?.get?.call(this) as number)
    },
  )
}

/** The list's own scroller (story 2.4). */
const scroller = () => document.getElementById(LIST_SCROLL_ID) as HTMLElement

let view: SortView = { sort: 'added_on', dir: 'desc' }
/** The URL's `hash` (story 2.4); `setHash` writes it and re-renders. */
let viewedHash: string | null = null
let withPanel = false
/** Writes wait for `applyHash` (the router has not answered yet). */
let deferWrites = false
const setHash = vi.fn((next: string | null) => {
  if (deferWrites) return
  viewedHash = next
  root.render(app())
})

/** The router answers with `next`. */
async function applyHash(next: string | null) {
  viewedHash = next
  await act(async () => root.render(app()))
}

function app() {
  return (
    <QueryClientProvider client={client}>
      <ListViewContext value={{ view, setView: () => {} }}>
        <ViewedHashContext value={{ hash: viewedHash, setHash }}>
          <TorrentList
            panel={withPanel ? <aside aria-label="詳情" /> : undefined}
          />
        </ViewedHashContext>
      </ListViewContext>
    </QueryClientProvider>
  )
}

/** Alex picks another sort (the URL changes). */
async function setView(next: SortView) {
  view = next
  await act(async () => root.render(app()))
}

async function render(first: MaindataResponse | AppError) {
  answers = [first]
  fetchCount = 0
  client = createQueryClient({
    fetchErrorReasons: bindFetchErrorReasons(getErrorReasons),
    fetchMaindata: () => {
      fetchCount += 1
      const answer = answers[Math.min(fetchCount - 1, answers.length - 1)]
      return answer instanceof AppError
        ? Promise.reject(answer)
        : Promise.resolve(answer)
    },
    currentPath: () => '/',
  })
  await client.prefetchQuery({ queryKey: MAINDATA_KEY })
  const container = document.createElement('div')
  main.append(container)
  root = createRoot(container)
  await act(async () => {
    root.render(app())
  })
}

/** The next fetch answers `response`; runs it as a poll would. */
async function poll(response: MaindataResponse) {
  answers.push(response)
  await act(async () => {
    await client.refetchQueries({ queryKey: MAINDATA_KEY })
  })
}

const delta = (changed: Array<SlimTorrent>) =>
  fakeResponse({ version: `v${Math.random()}`, full: false, changed })

const shownNames = () =>
  [...main.querySelectorAll('[role="listitem"]')].map(
    (item) => item.querySelector('[title]')?.getAttribute('title') ?? '',
  )

const section = () => main.querySelector('section') as HTMLElement

function pointer(type: 'pointerover' | 'pointerout', target: Element) {
  target.dispatchEvent(
    new PointerEvent(type, {
      bubbles: true,
      pointerType: 'mouse',
      relatedTarget: type === 'pointerout' ? document.body : null,
    }),
  )
}

function stubHover({
  fineMouse,
  hovered,
}: {
  fineMouse: boolean
  hovered: boolean
}) {
  vi.spyOn(window, 'matchMedia').mockImplementation(
    (query: string) => ({ matches: fineMouse, media: query }) as MediaQueryList,
  )
  const matches = Element.prototype.matches
  vi.spyOn(Element.prototype, 'matches').mockImplementation(function (
    this: Element,
    selector: string,
  ) {
    return selector === ':hover' ? hovered : matches.call(this, selector)
  })
}

beforeEach(() => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true
  // Query batches its notifications on a 0 ms timeout; inside `act` they
  // should land before the assertions.
  notifyManager.setScheduler((callback) => callback())
  modelCalls.clear()
  sortKeyCalls.length = 0
  reasonCalls.count = 0
  reasonCalls.reasons = {}
  view = { sort: 'added_on', dir: 'desc' }
  viewedHash = null
  withPanel = false
  deferWrites = false
  setHash.mockClear()
  clearShownList()
  clearLoginRequired()
  clearConnectionErrors()
  clearMaindataFailure()
  resetOrderFreeze()
  resetEntrance()
  mountMain()
})

afterEach(async () => {
  await act(async () => root.unmount())
  client.clear()
  main.remove()
  vi.restoreAllMocks()
  vi.useRealTimers()
  notifyManager.setScheduler((callback) => setTimeout(callback, 0))
  globalThis.IS_REACT_ACT_ENVIRONMENT = false
})

describe('the virtualizer', () => {
  it('renders only the rows in view plus the overscan, newest first', async () => {
    await render(fakeResponse({ changed: many(300) }))
    const names = shownNames()
    expect(names.length).toBeGreaterThan(0)
    expect(names.length).toBeLessThan(40)
    expect(names[0]).toBe('T299')
    const first = main.querySelector('[role="listitem"]')
    expect(first?.getAttribute('aria-setsize')).toBe('300')
    expect(first?.getAttribute('aria-posinset')).toBe('1')
  })
})

describe('a poll', () => {
  it('re-renders only the row whose torrent changed', async () => {
    await render(fakeResponse({ changed: many(20) }))
    const before = new Map(modelCalls)
    await poll(delta([torrent(19, { progress: 0.9 })]))
    const rerendered = [...modelCalls].filter(
      ([hash, calls]) => calls !== before.get(hash),
    )
    expect(rerendered.map(([hash]) => hash)).toEqual([fakeHash(20)])
  })
})

describe('error reasons (spec 2.10)', () => {
  const rowText = (name: string) =>
    [...main.querySelectorAll('[role="listitem"]')].find((item) =>
      item.querySelector(`[title="${name}"]`),
    )?.textContent ?? ''

  it('an errored row shows its reason; one without a reason the fixed text', async () => {
    reasonCalls.reasons = { [fakeHash(2)]: '找不到檔案或資料夾' }
    await render(
      fakeResponse({
        changed: [
          torrent(1, { state: 'error' }),
          torrent(2, { state: 'error' }),
          torrent(3),
        ],
      }),
    )
    expect(rowText('T1')).toContain('找不到檔案或資料夾')
    expect(rowText('T2')).toContain('qBittorrent 回報錯誤')
    expect(reasonCalls.count).toBe(1)
  })

  it('a long reason cut on the row can be read in full from its title', async () => {
    const long = `fake reason ${'x'.repeat(100)}`
    reasonCalls.reasons = { [fakeHash(2)]: long }
    await render(fakeResponse({ changed: [torrent(1, { state: 'error' })] }))
    const line = main.querySelector(`[role="listitem"] [title="${long}"]`)
    expect(line?.textContent).toBe(long)
    expect(line?.className).toContain('truncate')
  })

  it('matrix 8: no errored torrent, no getErrorReasons call', async () => {
    await render(fakeResponse({ changed: many(5) }))
    expect(reasonCalls.count).toBe(0)
  })

  it('a new reason re-renders only that row', async () => {
    await render(
      fakeResponse({
        changed: [
          torrent(1, { state: 'error' }),
          torrent(2, { state: 'error' }),
          torrent(3),
        ],
      }),
    )
    const before = new Map(modelCalls)
    reasonCalls.reasons = { [fakeHash(2)]: '沒有權限' }
    await act(async () => {
      await client.refetchQueries({ queryKey: ['error-reasons'] })
    })
    expect(rowText('T1')).toContain('沒有權限')
    expect(modelCalls.get(fakeHash(2))).toBeGreaterThan(
      before.get(fakeHash(2)) ?? 0,
    )
    expect(modelCalls.get(fakeHash(3))).toBe(before.get(fakeHash(3)))
    expect(modelCalls.get(fakeHash(4))).toBe(before.get(fakeHash(4)))
  })
})

describe('the freeze', () => {
  it('a resting mouse holds the order; leaving reorders once', async () => {
    await render(fakeResponse({ changed: many(5) }))
    await act(async () => pointer('pointerover', section()))
    expect(freezeStore.state.pointerInList).toBe(true)

    await poll(delta([torrent(9)]))
    expect(shownNames()[0]).toBe('T4')
    expect(shownNames()).not.toContain('T9')

    await act(async () => pointer('pointerout', section()))
    expect(shownNames()[0]).toBe('T9')
  })

  it('a finger holds the order until the scroll settles', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'performance'] })
    await render(fakeResponse({ changed: many(5) }))
    await act(async () =>
      scroller().dispatchEvent(new TouchEvent('touchstart')),
    )
    await act(async () => scroller().dispatchEvent(new Event('scroll')))
    await poll(delta([torrent(9)]))
    expect(shownNames()[0]).toBe('T4')

    // Momentum: the finger is up but the last scroll is under 300 ms old.
    await act(async () => scroller().dispatchEvent(new TouchEvent('touchend')))
    expect(shownNames()[0]).toBe('T4')
    await act(async () => vi.advanceTimersByTime(400))
    expect(shownNames()[0]).toBe('T9')
  })

  it('a phone keeps a sticky :hover, which does not freeze', async () => {
    stubHover({ fineMouse: false, hovered: true })
    await render(fakeResponse({ changed: many(5) }))
    expect(freezeStore.state.pointerInList).toBe(false)
    await poll(delta([torrent(9)]))
    expect(shownNames()[0]).toBe('T9')
  })

  it('a mouse already resting on the list when it mounts freezes', async () => {
    stubHover({ fineMouse: true, hovered: true })
    await render(fakeResponse({ changed: many(5) }))
    expect(freezeStore.state.pointerInList).toBe(true)
  })

  it("unmounting the list clears the list's reasons, not an open sheet", async () => {
    await render(fakeResponse({ changed: many(5) }))
    await act(async () => pointer('pointerover', section()))
    await act(async () =>
      scroller().dispatchEvent(new TouchEvent('touchstart')),
    )
    const releaseSheet = holdOrderForSheet()
    await act(async () => root.unmount())
    expect(freezeStore.state).toEqual({
      pointerInList: false,
      touchScroll: false,
      sheetOpen: true,
      animation: false,
    })
    releaseSheet()
    root = createRoot(document.createElement('div'))
  })
})

describe('重試 on the load error', () => {
  it('presses while a retry runs are ignored; focus goes to main when the block leaves', async () => {
    await render(new AppError('qbit_rejected'))
    const button = main.querySelector('button') as HTMLButtonElement
    expect(button.textContent).toBe('重試')
    let release!: (response: MaindataResponse) => void
    answers.push(
      new Promise<MaindataResponse>((resolve) => (release = resolve)) as never,
    )
    button.focus()
    const before = fetchCount
    await act(async () => {
      button.click()
      button.click()
    })
    expect(fetchCount).toBe(before + 1)
    expect(button.getAttribute('aria-busy')).toBe('true')

    await act(async () => release(fakeResponse({ changed: many(3) })))
    expect(shownNames()[0]).toBe('T2')
    expect(document.activeElement).toBe(main)
  })
})

// Spec 2.1 rows S4 and S9: the list follows the view; an extra sort holds
// the order with skeleton big numbers until its first keys arrive.
const bigCells = () =>
  [...main.querySelectorAll('[role="listitem"]')].map(
    (item) =>
      item.querySelector(
        ':scope > button > span > span:last-child',
      ) as HTMLElement,
  )

describe('sorting', () => {
  it('S9 a sort change re-sorts at once while the mouse freezes the order', async () => {
    await render(
      fakeResponse({
        changed: [
          torrent(0, { name: 'b' }),
          torrent(1, { name: 'c' }),
          torrent(2, { name: 'a' }),
        ],
      }),
    )
    expect(shownNames()).toEqual(['a', 'c', 'b'])
    await act(async () => pointer('pointerover', section()))
    await setView({ sort: 'name', dir: 'desc' })
    expect(shownNames()).toEqual(['a', 'b', 'c'])
    await setView({ sort: 'name', dir: 'asc' })
    expect(shownNames()).toEqual(['c', 'b', 'a'])
    // Data-driven moves stay frozen.
    await poll(delta([torrent(3, { name: 'z' })]))
    expect(shownNames()).toEqual(['c', 'b', 'a'])
  })

  it('S4 an extra sort keeps the order with skeletons until its keys arrive', async () => {
    await render(fakeResponse({ changed: many(3) }))
    expect(shownNames()).toEqual(['T2', 'T1', 'T0'])
    await setView({ sort: 'num_seeds', dir: 'desc' })
    expect(sortKeyCalls.map((call) => call.data)).toEqual([
      { field: 'num_seeds' },
    ])
    expect(shownNames()).toEqual(['T2', 'T1', 'T0'])
    for (const cell of bigCells()) {
      expect(cell.querySelector('[data-slot="skeleton"]')).not.toBeNull()
      expect(cell.querySelector('.sr-only')?.textContent).toBe(
        '做種人數（連上的） ',
      )
    }
    await act(async () => {
      sortKeyCalls[0].resolve({
        ok: true,
        data: {
          version: 'abcdef12.1',
          full: true,
          keys: { [fakeHash(1)]: 9, [fakeHash(2)]: 1, [fakeHash(3)]: null },
        },
      })
    })
    expect(shownNames()).toEqual(['T0', 'T1', 'T2'])
    expect(bigCells().map((cell) => cell.textContent)).toEqual([
      '做種人數（連上的） 9',
      '做種人數（連上的） 1',
      '做種人數（連上的） 沒有',
    ])
  })

  it('S4 a first load on an extra sort applies its keys even while frozen', async () => {
    view = { sort: 'num_seeds', dir: 'asc' }
    await render(fakeResponse({ changed: many(2) }))
    expect(shownNames()).toEqual(['T1', 'T0'])
    await act(async () => pointer('pointerover', section()))
    await act(async () => {
      sortKeyCalls[0].resolve({
        ok: true,
        data: {
          version: 'abcdef12.1',
          full: true,
          keys: { [fakeHash(1)]: 1, [fakeHash(2)]: 5 },
        },
      })
    })
    expect(shownNames()).toEqual(['T0', 'T1'])
  })

  it('S4 the first keys fail: the old order stays, values read 沒有, new torrents on top', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    // Name A to Z differs from the tie order (newest first).
    view = { sort: 'name', dir: 'desc' }
    await render(fakeResponse({ changed: many(3) }))
    expect(shownNames()).toEqual(['T0', 'T1', 'T2'])
    await setView({ sort: 'num_seeds', dir: 'desc' })
    expect(bigCells()[0].querySelector('[data-slot="skeleton"]')).not.toBeNull()
    await act(async () => {
      sortKeyCalls[0].resolve({
        ok: false,
        error: { code: 'qbit_rejected', message: 'x' },
      })
    })
    expect(shownNames()).toEqual(['T0', 'T1', 'T2'])
    const noValue = [
      '做種人數（連上的） 沒有',
      '做種人數（連上的） 沒有',
      '做種人數（連上的） 沒有',
    ]
    expect(bigCells().map((cell) => cell.textContent)).toEqual(noValue)
    // The next poll starts: Query clears its own error while it runs, the
    // rows keep reading 沒有 instead of blinking back to skeletons.
    await act(async () => {
      void client.refetchQueries({ queryKey: ['sort-keys', 'num_seeds'] })
    })
    expect(sortKeyCalls).toHaveLength(2)
    expect(bigCells().map((cell) => cell.textContent)).toEqual(noValue)
    await poll(delta([torrent(5)]))
    expect(shownNames()).toEqual(['T5', 'T0', 'T1', 'T2'])
  })

  it('a sort shown as how long ago reads the minute tick, not the day', async () => {
    const start = Date.UTC(2026, 10, 16, 4, 0, 0)
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval', 'Date'] })
    vi.setSystemTime(start)
    // Story 2.3: last_activity is a slim field (no getSortKeys call).
    view = { sort: 'last_activity', dir: 'desc' }
    await render(
      fakeResponse({
        changed: [torrent(0, { last_activity: (start - 2 * 3600_000) / 1000 })],
      }),
    )
    expect(sortKeyCalls).toHaveLength(0)
    expect(bigCells()[0].textContent).toBe('最後活動 2 小時前')
    await act(async () => vi.advanceTimersByTime(3600_000))
    expect(bigCells()[0].textContent).toBe('最後活動 3 小時前')
  })

  it('a torrent added since the last keys shows a skeleton, not 沒有', async () => {
    await render(fakeResponse({ changed: many(1) }))
    await setView({ sort: 'num_seeds', dir: 'desc' })
    await act(async () => {
      sortKeyCalls[0].resolve({
        ok: true,
        data: { version: 'abcdef12.1', full: true, keys: { [fakeHash(1)]: 4 } },
      })
    })
    await poll(delta([torrent(5)]))
    const cells = bigCells()
    expect(cells.map((cell) => cell.textContent)).toEqual([
      '做種人數（連上的） 4',
      '做種人數（連上的） ',
    ])
    expect(cells[1].querySelector('[data-slot="skeleton"]')).not.toBeNull()
  })

  it('sorting by ratio hides the ratio column', async () => {
    const columns = () => main.querySelectorAll('[class*="w-[76px]"]').length
    await render(fakeResponse({ changed: many(2) }))
    expect(columns()).toBe(2)
    await setView({ sort: 'ratio', dir: 'desc' })
    expect(columns()).toBe(0)
    expect(bigCells().map((cell) => cell.textContent)).toEqual([
      '分享率 0.00',
      '分享率 0.00',
    ])
  })
})

// Spec 2.4 rows D1, D2, D3, D9, D11: rows open the detail; the viewed row
// has the ring; the list publishes what it shows; a vanished row moves on.
const rowButtons = () => [
  ...main.querySelectorAll<HTMLButtonElement>('[role="listitem"] > button'),
]
const ringed = () =>
  rowButtons()
    .filter((button) => button.getAttribute('aria-current') === 'true')
    .map((button) => button.querySelector('[title]')?.getAttribute('title'))

describe('the detail (spec 2.4)', () => {
  it('D1 desktop without hash: the panel sits right of the rows; the first row is viewed', async () => {
    withPanel = true
    await render(fakeResponse({ changed: many(3) }))
    const grid = section().parentElement as HTMLElement
    expect(grid.className).toContain(
      'grid-cols-[minmax(0,560px)_minmax(0,1fr)]',
    )
    expect(
      grid.querySelector(':scope > aside[aria-label="詳情"]'),
    ).not.toBeNull()
    expect(ringed()).toEqual(['T2'])
    expect(rowButtons()[0].className).toContain('viewing-ring')
    expect(rowButtons()[1].className).not.toContain('viewing-ring')
    expect(shownListStore.state).toEqual({
      order: [fakeHash(3), fakeHash(2), fakeHash(1)],
      viewed: fakeHash(3),
    })
    expect(setHash).not.toHaveBeenCalled()
  })

  it('D2 a click sets hash and the ring moves', async () => {
    withPanel = true
    await render(fakeResponse({ changed: many(3) }))
    await act(async () => rowButtons()[2].click())
    expect(setHash).toHaveBeenLastCalledWith(fakeHash(1))
    expect(ringed()).toEqual(['T0'])
    expect(shownListStore.state.viewed).toBe(fakeHash(1))
  })

  it('D3 a hash not in the list: the first row, the URL left alone', async () => {
    withPanel = true
    viewedHash = fakeHash(99)
    await render(fakeResponse({ changed: many(3) }))
    expect(ringed()).toEqual(['T2'])
    expect(setHash).not.toHaveBeenCalled()
  })

  it('D9 without hash, the whole order replaced: the new first row, no blank panel', async () => {
    withPanel = true
    await render(fakeResponse({ changed: many(2) }))
    expect(ringed()).toEqual(['T1'])
    await poll(
      fakeResponse({
        version: 'v-replaced',
        full: true,
        changed: [torrent(5), torrent(6)],
      }),
    )
    expect(shownNames()).toEqual(['T6', 'T5'])
    expect(ringed()).toEqual(['T6'])
    expect(shownListStore.state.viewed).toBe(fakeHash(7))
    expect(setHash).not.toHaveBeenCalled()
  })

  it('D9 the viewed row is deleted: the next one, written to the URL', async () => {
    withPanel = true
    viewedHash = fakeHash(2)
    await render(fakeResponse({ changed: many(3) }))
    expect(ringed()).toEqual(['T1'])
    await poll(
      fakeResponse({
        version: 'v-removed',
        full: false,
        changed: [],
        removed: [fakeHash(2)],
      }),
    )
    expect(setHash).toHaveBeenLastCalledWith(fakeHash(1))
    expect(ringed()).toEqual(['T0'])
  })

  it('D9 archived while the list is frozen: it leaves at once, the next one shows', async () => {
    withPanel = true
    viewedHash = fakeHash(3)
    await render(fakeResponse({ changed: many(3) }))
    await act(async () => pointer('pointerover', section()))
    await poll(delta([torrent(2, { state: 'missingFiles', private: false })]))
    expect(shownNames()).toEqual(['T1', 'T0'])
    expect(setHash).toHaveBeenLastCalledWith(fakeHash(2))
    expect(ringed()).toEqual(['T1'])
  })

  it('D11 phone (no panel): nothing ringed without hash; a deleted viewed row removes hash', async () => {
    await render(fakeResponse({ changed: many(3) }))
    expect(ringed()).toEqual([])
    expect(shownListStore.state.viewed).toBeNull()
    await act(async () => rowButtons()[1].click())
    expect(setHash).toHaveBeenLastCalledWith(fakeHash(2))
    expect(shownListStore.state.viewed).toBe(fakeHash(2))
    await poll(
      fakeResponse({
        version: 'v-removed',
        full: false,
        changed: [],
        removed: [fakeHash(2)],
      }),
    )
    expect(setHash).toHaveBeenLastCalledWith(null)
    expect(shownListStore.state.viewed).toBeNull()
  })

  it('D1 without hash, a new torrent on top keeps the row shown', async () => {
    withPanel = true
    await render(fakeResponse({ changed: many(3) }))
    expect(ringed()).toEqual(['T2'])
    await poll(delta([torrent(9)]))
    expect(shownNames()[0]).toBe('T9')
    expect(ringed()).toEqual(['T2'])
    expect(shownListStore.state.viewed).toBe(fakeHash(3))
    expect(setHash).not.toHaveBeenCalled()
  })

  it('D9 a write not yet echoed keeps the successor; another hash then wins', async () => {
    withPanel = true
    viewedHash = fakeHash(2)
    deferWrites = true
    await render(fakeResponse({ changed: many(3) }))
    await poll(
      fakeResponse({
        version: 'v-removed',
        full: false,
        changed: [],
        removed: [fakeHash(2)],
      }),
    )
    expect(setHash).toHaveBeenLastCalledWith(fakeHash(1))
    expect(ringed()).toEqual(['T0'])
    // One more poll before the router answers: still the successor.
    await poll(delta([torrent(0, { progress: 0.9 })]))
    expect(ringed()).toEqual(['T0'])
    expect(shownListStore.state.viewed).toBe(fakeHash(1))
    // Alex clicked another row meanwhile: that one lands, not the write.
    await applyHash(fakeHash(3))
    expect(ringed()).toEqual(['T2'])
    expect(shownListStore.state.viewed).toBe(fakeHash(3))
  })

  it('a frozen list publishes its frozen order (the N of M basis)', async () => {
    withPanel = true
    viewedHash = fakeHash(2)
    await render(fakeResponse({ changed: many(3) }))
    const frozenOrder = shownListStore.state.order
    await act(async () => pointer('pointerover', section()))
    await poll(delta([torrent(9)]))
    expect(shownListStore.state.order).toBe(frozenOrder)
    expect(shownListStore.state.order).toEqual([
      fakeHash(3),
      fakeHash(2),
      fakeHash(1),
    ])
    expect(shownListStore.state.viewed).toBe(fakeHash(2))
  })

  it('an empty list with a panel shows the empty state and no panel', async () => {
    withPanel = true
    await render(fakeResponse({ changed: [] }))
    expect(main.querySelector('aside[aria-label="詳情"]')).toBeNull()
    expect(main.textContent).toContain('這個分類沒有種子')
  })

  it('without a panel the rows sit in a box-less wrapper (kept across 1024px)', async () => {
    await render(fakeResponse({ changed: many(2) }))
    expect(section().parentElement?.className).toBe('contents')
  })

  it('unmounting clears what the list published', async () => {
    await render(fakeResponse({ changed: many(2) }))
    expect(shownListStore.state.order).toHaveLength(2)
    await act(async () => root.unmount())
    expect(shownListStore.state).toEqual({ order: undefined, viewed: null })
    root = createRoot(document.createElement('div'))
  })
})

describe('the entrance (spec 2.9)', () => {
  let stub: AnimateStub
  let reduced: boolean

  beforeEach(() => {
    stub = stubElementAnimate()
    reduced = false
    stubReducedMotion(() => reduced)
    // Boxes from the virtualizer's own positions: the scroller is the
    // window's top 600px; a row sits at its wrapper's translateY.
    vi.spyOn(Element.prototype, 'getBoundingClientRect').mockImplementation(
      function (this: Element) {
        if (this.id === LIST_SCROLL_ID) return new DOMRect(0, 0, 1000, VIEWPORT)
        // A row's arc and bar get the row's own box.
        if (
          !this.matches(
            '[data-entrance], [data-progress-arc], [data-progress-bar]',
          )
        )
          return new DOMRect(0, 0, 0, 0)
        const wrapper = this.closest<HTMLElement>('[role="listitem"]')
        const y = Number(
          /translateY\((-?[\d.]+)px\)/.exec(
            wrapper?.style.transform ?? '',
          )?.[1] ?? NaN,
        )
        return new DOMRect(0, y, 1000, 59)
      },
    )
  })

  afterEach(() => {
    stub.restore()
  })

  const rises = () =>
    stub.calls.filter((call) => call.element.hasAttribute('data-entrance'))
  const spins = () =>
    stub.calls.filter((call) => call.element.hasAttribute('data-progress-arc'))

  it('the rows in view rise 60ms apart; overscan rows do not', async () => {
    await render(fakeResponse({ changed: many(300) }))
    const rendered = main.querySelectorAll('[data-entrance]').length
    // 600px of 59px rows with 2px gaps: 10 rows show (the 10th partly).
    expect(rises().map((call) => call.options.delay)).toEqual(
      Array.from({ length: 10 }, (_, row) => row * 60),
    )
    expect(rendered).toBeGreaterThan(10)
    expect(rises()[0].keyframes).toEqual([
      { offset: 0, opacity: 0, transform: 'translateY(10px)' },
    ])
  })

  it('arcs turn from their dash array; seeding and done circles do not', async () => {
    await render(
      fakeResponse({
        changed: [
          torrent(3, { state: 'downloading', progress: 0.4 }),
          torrent(2, { state: 'uploading', progress: 1 }),
          torrent(1, { state: 'stalledDL', progress: 0.2 }),
          torrent(0, { state: 'pausedUP', progress: 1 }),
        ],
      }),
    )
    expect(spins()).toHaveLength(2)
    for (const call of spins()) {
      const dash = call.element.getAttribute('stroke-dasharray')
      expect(call.keyframes).toEqual([
        { offset: 0, strokeDashoffset: `${dash}px` },
      ])
      expect(call.options).toMatchObject({
        duration: 900,
        easing: 'cubic-bezier(.2,.8,.2,1)',
        fill: 'backwards',
      })
    }
    // A row's ring turns as its row arrives: T3 is row 0, T1 row 2.
    expect(spins().map((call) => call.options.delay)).toEqual([0, 120])
  })

  it('a poll mid-turn keeps the turning arc and moves its end, no restart', async () => {
    await render(
      fakeResponse({
        changed: [torrent(3, { state: 'downloading', progress: 0.4 })],
      }),
    )
    const [spin] = spins()
    const calls = stub.calls.length
    await poll(delta([torrent(3, { state: 'downloading', progress: 0.6 })]))
    expect(spin.element.isConnected).toBe(true)
    expect(spin.element.getAttribute('stroke-dashoffset')).toBe(
      String(ringOffset(0.6)),
    )
    expect(stub.calls).toHaveLength(calls)
  })

  it('a poll and a sort change start nothing; replayEntrance() plays again', async () => {
    await render(fakeResponse({ changed: many(30) }))
    expect(rises().length).toBeGreaterThan(0)
    stub.calls.length = 0
    await poll(delta([torrent(31)]))
    await setView({ sort: 'name', dir: 'asc' })
    expect(stub.calls).toHaveLength(0)
    await act(async () => replayEntrance())
    // The first ready surface claims the replay on this commit (the list, or
    // the panel hero joining a moment apart): rows stay 60ms apart.
    const [first, second, third] = rises().map((call) =>
      Number(call.options.delay),
    )
    expect(first).toBeLessThanOrEqual(0)
    expect(first).toBeGreaterThan(-150)
    expect(second - first).toBeCloseTo(60)
    expect(third - first).toBeCloseTo(120)
  })

  it('the order holds until the entrance settles', async () => {
    await render(fakeResponse({ changed: many(5) }))
    expect(freezeStore.state.animation).toBe(true)
    await poll(delta([torrent(9)]))
    expect(shownNames()[0]).toBe('T4')
    await act(async () => {
      for (const call of stub.calls) call.finish()
      await Promise.resolve()
    })
    expect(freezeStore.state.animation).toBe(false)
    expect(shownNames()[0]).toBe('T9')
  })

  it('reduced motion: nothing animates, nothing holds', async () => {
    reduced = true
    await render(fakeResponse({ changed: many(30) }))
    expect(stub.calls).toHaveLength(0)
    expect(freezeStore.state.animation).toBe(false)
  })
})
