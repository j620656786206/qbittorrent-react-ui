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
import { MAIN_ID } from '#/shared/ui/main-scroll'
import { clearConnectionErrors } from '#/state/connection'
import { clearLoginRequired } from '#/state/login-required'
import { MAINDATA_KEY } from '#/state/maindata'
import { clearMaindataFailure } from '#/state/maindata-failure'
import {
  freezeStore,
  holdOrderForSheet,
  resetOrderFreeze,
} from '#/state/order-freeze'
import { createQueryClient } from '#/state/query-client'
import { ListViewContext } from '#/state/list-view'
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
  // The virtualizer reads the viewport from clientWidth and clientHeight.
  Object.defineProperty(main, 'clientHeight', { value: VIEWPORT })
  Object.defineProperty(main, 'clientWidth', { value: 1000 })
  document.body.append(main)
}

let view: SortView = { sort: 'added_on', dir: 'desc' }

function app() {
  return (
    <QueryClientProvider client={client}>
      <ListViewContext value={{ view, setView: () => {} }}>
        <TorrentList />
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
  view = { sort: 'added_on', dir: 'desc' }
  clearLoginRequired()
  clearConnectionErrors()
  clearMaindataFailure()
  resetOrderFreeze()
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
    await act(async () => main.dispatchEvent(new TouchEvent('touchstart')))
    await act(async () => main.dispatchEvent(new Event('scroll')))
    await poll(delta([torrent(9)]))
    expect(shownNames()[0]).toBe('T4')

    // Momentum: the finger is up but the last scroll is under 300 ms old.
    await act(async () => main.dispatchEvent(new TouchEvent('touchend')))
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
    await act(async () => main.dispatchEvent(new TouchEvent('touchstart')))
    const releaseSheet = holdOrderForSheet()
    await act(async () => root.unmount())
    expect(freezeStore.state).toEqual({
      pointerInList: false,
      touchScroll: false,
      sheetOpen: true,
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
      item.querySelector(':scope > div > div > span:last-child') as HTMLElement,
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
    expect(bigCells().map((cell) => cell.textContent)).toEqual([
      '做種人數（連上的） 沒有',
      '做種人數（連上的） 沒有',
      '做種人數（連上的） 沒有',
    ])
    await poll(delta([torrent(5)]))
    expect(shownNames()).toEqual(['T5', 'T0', 'T1', 'T2'])
  })

  it('a sort shown as how long ago reads the minute tick, not the day', async () => {
    const start = Date.UTC(2026, 10, 16, 4, 0, 0)
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval', 'Date'] })
    vi.setSystemTime(start)
    view = { sort: 'last_activity', dir: 'desc' }
    await render(fakeResponse({ changed: many(1) }))
    await act(async () => {
      sortKeyCalls[0].resolve({
        ok: true,
        data: {
          version: 'abcdef12.1',
          full: true,
          keys: { [fakeHash(1)]: (start - 2 * 3600_000) / 1000 },
        },
      })
    })
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
