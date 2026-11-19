// @vitest-environment happy-dom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import type { Root } from 'react-dom/client'
import { QueryClientProvider, notifyManager } from '@tanstack/react-query'
import type { QueryClient } from '@tanstack/react-query'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ALL } from '#/shared/categories'
import { AppError } from '#/lib/app-error'
import { LIST_LOAD_FAILED } from '#/lib/error-text'
import { fakeHash, fakeResponse, t } from '#/lib/testing'
import type { MaindataResponse, SlimTorrent } from '#/shared/maindata'
import { DESKTOP_QUERY } from '#/shared/ui/breakpoint'
import { DEFAULT_SORT_VIEW } from '#/shared/list-search'
import { MAIN_ID } from '#/shared/ui/main-scroll'
import { clearConnectionErrors } from '#/state/connection'
import { replayEntrance, resetEntrance } from '#/state/entrance'
import { stubElementAnimate } from '#/state/entrance-testing'
import type { AnimateStub } from '#/state/entrance-testing'
import { clearLoginRequired } from '#/state/login-required'
import { getErrorReasons } from '#/server/functions/get-error-reasons'
import { bindFetchErrorReasons } from '#/state/error-reasons'
import { MAINDATA_KEY } from '#/state/maindata'
import { clearMaindataFailure } from '#/state/maindata-failure'
import {
  freezeStore,
  holdOrderForAnimation,
  resetOrderFreeze,
} from '#/state/order-freeze'
import { createQueryClient } from '#/state/query-client'
import { ListViewContext } from '#/state/list-view'
import { ViewedHashContext } from '#/state/viewed-hash'
import { resetSelection, selectionStore } from '#/state/selection'
import {
  CARD_GAP,
  CARD_HEIGHT,
  CARD_HEIGHT_WITH_BAR,
} from '#/features/board/board-model'
import type * as BoardModel from '#/features/board/board-model'
import {
  COLUMN_PADDING_END,
  COLUMN_PADDING_START,
} from '#/features/board/board-column'
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

// Story 2.10: getErrorReasons never reaches a server here; each test sets
// the map it answers (`hang`: the call never answers).
const reasonCalls = vi.hoisted(
  (): { count: number; reasons: Record<string, string>; hang: boolean } => ({
    count: 0,
    reasons: {},
    hang: false,
  }),
)
vi.mock('#/server/functions/get-error-reasons', () => ({
  getErrorReasons: () => {
    reasonCalls.count += 1
    if (reasonCalls.hang) return new Promise(() => {})
    return Promise.resolve({ ok: true, data: { reasons: reasonCalls.reasons } })
  },
}))

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

/** Story 3.1: the settings answered (the view is final). */
let viewReady = true
/** Story 3.2: the selected category. */
let category: string = ALL
/** Story 3.5: the search keyword. */
let searchQuery = ''
/** Story 3.5: 「在全部裡找」 calls this with `ALL`. */
const selectCategory = vi.fn()

function boardTree() {
  return (
    <QueryClientProvider client={client}>
      <ListViewContext
        value={{
          view: { ...DEFAULT_SORT_VIEW, category, query: searchQuery },
          viewReady,
          setView: () => {},
          pickView: () => {},
          selectCategory,
          rememberedHint: false,
          openSettings: () => {},
          settingsOpen: false,
          searchOpen: false,
          openSearch: () => {},
          setQuery: () => {},
          closeSearch: () => {},
        }}
      >
        <ViewedHashContext value={{ hash: null, setHash, followHash: setHash }}>
          <TorrentBoard />
        </ViewedHashContext>
      </ListViewContext>
    </QueryClientProvider>
  )
}

async function render(first: MaindataResponse | AppError | 'pending') {
  answers = [first]
  fetchCount = 0
  client = createQueryClient({
    fetchErrorReasons: bindFetchErrorReasons(getErrorReasons),
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
    root.render(boardTree())
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
  viewReady = true
  category = ALL
  searchQuery = ''
  selectCategory.mockReset()
  globalThis.IS_REACT_ACT_ENVIRONMENT = true
  notifyManager.setScheduler((callback) => callback())
  modelCalls.clear()
  reasonCalls.count = 0
  reasonCalls.reasons = {}
  reasonCalls.hang = false
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
  resetSelection()
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
      '[role="listitem"] > button[data-entrance]',
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
    const PADDING_START = COLUMN_PADDING_START
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

describe('error reasons (spec 2.10)', () => {
  const errored = () => [
    ...sample(),
    t({ hash: h(7), name: 'Broken', state: 'error', last_activity: T0 + 120 }),
    t({ hash: h(8), name: 'Broken2', state: 'error', last_activity: T0 + 90 }),
  ]
  const cardText = (name: string) =>
    [...main.querySelectorAll('[role="listitem"]')].find((item) =>
      item.querySelector(`[title="${name}"]`),
    )?.textContent ?? ''

  it('an errored card shows its reason; one without a reason the fixed text', async () => {
    reasonCalls.reasons = { [h(7)]: '磁碟空間不足' }
    await render(fakeResponse({ changed: errored() }))
    expect(cardText('Broken')).toContain('磁碟空間不足')
    expect(cardText('Broken')).not.toContain('qBittorrent 回報錯誤')
    expect(cardText('Broken2')).toContain('qBittorrent 回報錯誤')
    // Missing files keep their own line.
    expect(cardText('Error')).toContain('找不到檔案，做不了種')
    // Every column observes the same query: one call.
    expect(reasonCalls.count).toBe(1)
  })

  it('a long reason cut on the card can be read in full from its title', async () => {
    const long = `fake reason ${'x'.repeat(100)}`
    reasonCalls.reasons = { [h(7)]: long }
    await render(fakeResponse({ changed: errored() }))
    const item = [...main.querySelectorAll('[role="listitem"]')].find((x) =>
      x.querySelector('[title="Broken"]'),
    )
    const line = item?.querySelector(`[title="${long}"]`)
    expect(line?.textContent).toBe(long)
    expect(line?.className).toContain('truncate')
    // Other cards' lines (speed, time) have no tooltip: only the name does.
    const down = [...main.querySelectorAll('[role="listitem"]')].find((x) =>
      x.querySelector('[title="Down"]'),
    )
    expect(down?.querySelectorAll('[title]')).toHaveLength(1)
  })

  it('the phone tabs show it too', async () => {
    desktop = false
    reasonCalls.reasons = { [h(7)]: '沒有權限' }
    await render(fakeResponse({ changed: errored() }))
    expect(cardText('Broken')).toContain('沒有權限')
  })

  it('a reason is text, never markup', async () => {
    reasonCalls.reasons = { [h(7)]: '<img src=x onerror=alert(1)>' }
    await render(fakeResponse({ changed: errored() }))
    expect(cardText('Broken')).toContain('<img src=x onerror=alert(1)>')
    expect(main.querySelector('img')).toBeNull()
  })

  it('matrix 8: no errored torrent, no getErrorReasons call', async () => {
    await render(fakeResponse({ changed: sample() }))
    expect(reasonCalls.count).toBe(0)
  })

  it('a torrent that errors again never shows the reason of its earlier error', async () => {
    reasonCalls.reasons = { [h(7)]: '磁碟空間不足' }
    await render(fakeResponse({ changed: errored() }))
    expect(cardText('Broken')).toContain('磁碟空間不足')
    const fine = (state: string) =>
      errored().map((torrent) =>
        torrent.hash === h(7) || torrent.hash === h(8)
          ? { ...torrent, state }
          : torrent,
      )
    // No errored torrent: the map is dropped.
    await poll(delta(fine('stalledDL')))
    expect(client.getQueryData(['error-reasons'])).toBeUndefined()
    // Errored again; the new answer has not come: the fixed text.
    reasonCalls.hang = true
    await poll(delta(errored()))
    expect(cardText('Broken')).toContain('qBittorrent 回報錯誤')
    expect(cardText('Broken')).not.toContain('磁碟空間不足')
  })

  it('a new reason re-renders only that card', async () => {
    await render(fakeResponse({ changed: errored() }))
    const before = new Map(modelCalls)
    reasonCalls.reasons = { [h(7)]: '檔案太大' }
    await act(async () => {
      await client.refetchQueries({ queryKey: ['error-reasons'] })
    })
    expect(cardText('Broken')).toContain('檔案太大')
    expect(modelCalls.get(h(7))).toBeGreaterThan(before.get(h(7)) ?? 0)
    expect(modelCalls.get(h(8))).toBe(before.get(h(8)))
    expect(modelCalls.get(h(3))).toBe(before.get(h(3)))
  })
})

describe('board states', () => {
  it('story 3.1: maindata first, settings later: the skeleton stays until they answer', async () => {
    viewReady = false
    await render(
      fakeResponse({ changed: [t({ hash: fakeHash(1), name: 'Fake.A' })] }),
    )
    expect(
      main.querySelector('[aria-busy="true"]')?.getAttribute('aria-label'),
    ).toBe('看板，載入中')
    expect(main.textContent).not.toContain('Fake.A')
    viewReady = true
    await act(async () => root.render(boardTree()))
    expect(main.querySelector('[aria-busy="true"]')).toBeNull()
  })

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

// Story 3.2: the board shows only the selected category, the 已整理 column
// too; another category is a new board and never waits on a held order.
describe('the category (story 3.2)', () => {
  const categorized = () =>
    sample().map((torrent) =>
      ['Down', 'Arch1', 'Error'].includes(torrent.name)
        ? { ...torrent, category: 'mteam-X' }
        : torrent,
    )

  async function setCategory(next: string) {
    category = next
    await act(async () => root.render(boardTree()))
  }

  it('columns and the 已整理 column count only the category', async () => {
    category = 'mteam-X'
    await render(fakeResponse({ changed: categorized() }))
    expect(sections()).toEqual([
      '要處理，1 個',
      '下載中，1 個',
      '做種中，0 個',
      '完成，0 個',
      '已整理欄',
    ])
    expect(button('展開已整理欄，1 個')).not.toBeNull()
  })

  it('only archived torrents: four columns of 沒有, 已整理 as usual', async () => {
    category = 'only-archived'
    await render(
      fakeResponse({
        changed: sample().map((torrent) =>
          torrent.name.startsWith('Arch')
            ? { ...torrent, category: 'only-archived' }
            : torrent,
        ),
      }),
    )
    expect(sections()).toEqual([
      '要處理，0 個',
      '下載中，0 個',
      '做種中，0 個',
      '完成，0 個',
      '已整理欄',
    ])
    for (const label of [
      '要處理，0 個',
      '下載中，0 個',
      '做種中，0 個',
      '完成，0 個',
    ]) {
      expect(section(label).textContent).toContain('沒有')
    }
    expect(button('展開已整理欄，2 個')).not.toBeNull()
  })

  it('another category applies at once while an animation holds the order', async () => {
    category = 'mteam-X'
    await render(fakeResponse({ changed: categorized() }))
    expect(sections()[0]).toBe('要處理，1 個')
    const release = holdOrderForAnimation()
    try {
      // Held, new torrents would wait; another category is not "new".
      await setCategory(ALL)
      expect(sections()[0]).toBe('要處理，2 個')
      expect(names(section('要處理，2 個'))).toEqual(['Stalled', 'Error'])
    } finally {
      release()
    }
  })

  it('another category is a new board: the 已整理 column closes again', async () => {
    await render(fakeResponse({ changed: categorized() }))
    await act(async () => button('展開已整理欄，2 個').click())
    expect(sections().at(-1)).toBe('已整理，2 個')
    await setCategory('mteam-X')
    expect(sections().at(-1)).toBe('已整理欄')
  })
})

// Story 3.5: the keyword filters the columns (已整理 too); a partly empty
// board keeps its columns with 「沒有」; only an all-empty board turns into
// the no-result block, with 「在全部裡找」 outside 「全部」.
describe('the search keyword (story 3.5)', () => {
  async function setQuery(next: string) {
    searchQuery = next
    await act(async () => root.render(boardTree()))
  }

  it('columns, counts and the collapsed 已整理 count follow the keyword', async () => {
    searchQuery = 'ARCH'
    await render(fakeResponse({ changed: sample() }))
    expect(sections()).toEqual([
      '要處理，0 個',
      '下載中，0 個',
      '做種中，0 個',
      '完成，0 個',
      '已整理欄',
    ])
    expect(button('展開已整理欄，2 個')).not.toBeNull()
    // While searching, an empty 要處理 says 「沒有」, not 「都沒問題」.
    expect(section('要處理，0 個').textContent).toContain('沒有')
    expect(section('要處理，0 個').textContent).not.toContain('都沒問題')
    await setQuery('arch1')
    expect(button('展開已整理欄，1 個')).not.toBeNull()
  })

  it('a partly empty board keeps four columns, each empty one 「沒有」', async () => {
    searchQuery = 'e'
    await render(fakeResponse({ changed: sample() }))
    // Seed, Stalled, Error match; Down does not.
    expect(sections()).toEqual([
      '要處理，2 個',
      '下載中，0 個',
      '做種中，1 個',
      '完成，0 個',
      '已整理欄',
    ])
    expect(section('下載中，0 個').textContent).toContain('沒有')
    expect(main.querySelector('section[aria-label="搜尋結果"]')).toBeNull()
  })

  it('typing keeps the board mounted (the open 已整理 column stays)', async () => {
    await render(fakeResponse({ changed: sample() }))
    await act(async () => button('展開已整理欄，2 個').click())
    await setQuery('arch')
    expect(sections().at(-1)).toBe('已整理，2 個')
  })

  it('nothing anywhere in a category: the no-result block with 「在全部裡找」', async () => {
    category = 'mteam-tv'
    searchQuery = '牧神記'
    await render(
      fakeResponse({
        changed: sample().map((torrent) => ({
          ...torrent,
          category: 'mteam-tv',
        })),
      }),
    )
    const block = main.querySelector(
      'section[aria-label="搜尋結果"]',
    ) as HTMLElement
    expect(block.textContent).toContain('『牧神記』在 mteam-tv 找不到')
    // The board stays mounted, hidden under the block.
    const board = main.querySelector('[role="region"][aria-label="看板"]')
    expect(board?.closest('.invisible')).not.toBeNull()
    const searchAll = [...block.querySelectorAll('button')].find(
      (element) => element.textContent === '在全部裡找',
    )
    if (!searchAll) throw new Error('no 在全部裡找')
    await act(async () => searchAll.click())
    expect(selectCategory).toHaveBeenCalledWith(ALL)
  })

  it('nothing in 「全部」: only 「找不到『…』」, no button; markup is text', async () => {
    searchQuery = '<script>'
    await render(fakeResponse({ changed: sample() }))
    const block = main.querySelector(
      'section[aria-label="搜尋結果"]',
    ) as HTMLElement
    expect(block.textContent).toBe('找不到『<script>』')
    expect(block.querySelector('button')).toBeNull()
    expect(block.querySelector('script')).toBeNull()
  })

  it('desktop: 要處理 empty, another column not: 要處理 says 「沒有」', async () => {
    searchQuery = 'Seed'
    await render(fakeResponse({ changed: sample() }))
    expect(sections().slice(0, 3)).toEqual([
      '要處理，0 個',
      '下載中，0 個',
      '做種中，1 個',
    ])
    expect(section('要處理，0 個').textContent).toContain('沒有')
    expect(section('要處理，0 個').textContent).not.toContain('都沒問題')
  })

  it('a no-result moment keeps the open 已整理 column', async () => {
    await render(fakeResponse({ changed: sample() }))
    await act(async () => button('展開已整理欄，2 個').click())
    await setQuery('牧神記')
    expect(main.querySelector('section[aria-label="搜尋結果"]')).not.toBeNull()
    await setQuery('arch')
    expect(main.querySelector('section[aria-label="搜尋結果"]')).toBeNull()
    expect(sections().at(-1)).toBe('已整理，2 個')
    expect(
      main
        .querySelector('[role="region"][aria-label="看板"]')
        ?.closest('.invisible'),
    ).toBeNull()
  })

  it('a category with no torrent at all: 「這個分類沒有種子」, not no-result', async () => {
    category = 'emptied'
    searchQuery = 'show'
    await render(fakeResponse({ changed: sample() }))
    expect(main.textContent).toContain('這個分類沒有種子')
    expect(main.querySelector('section[aria-label="搜尋結果"]')).toBeNull()
  })

  it('a keyword cleared while an animation holds the order shows the matches at once', async () => {
    searchQuery = 'Seed'
    await render(fakeResponse({ changed: sample() }))
    expect(sections()[0]).toBe('要處理，0 個')
    const release = holdOrderForAnimation()
    try {
      await setQuery('')
      expect(sections()[0]).toBe('要處理，2 個')
      expect(names(section('要處理，2 個'))).toEqual(['Stalled', 'Error'])
      await setQuery('Stalled')
      expect(sections()[0]).toBe('要處理，1 個')
    } finally {
      release()
    }
  })

  it('only an archived match keeps the board (已整理 is not empty)', async () => {
    searchQuery = 'Arch2'
    await render(fakeResponse({ changed: sample() }))
    expect(main.querySelector('section[aria-label="搜尋結果"]')).toBeNull()
    expect(button('展開已整理欄，1 個')).not.toBeNull()
  })

  it('the phone board: every empty tab says 「沒有」 while searching', async () => {
    desktop = false
    searchQuery = 'Seed'
    await render(fakeResponse({ changed: sample() }))
    expect(main.textContent).not.toContain('都沒問題')
    expect(main.textContent).toContain('沒有')
  })
})

// Story 4.1: the desktop cards' checkbox (the expanded 已整理 ones too),
// sitting outside the card's button and its `overflow-hidden`, the ticked
// card's background, the board never freezing for a selection, and no
// checkbox on the phone.
describe('selection (story 4.1)', () => {
  const card = (scope: Element) =>
    scope.querySelector('[role="listitem"]') as HTMLElement
  const checkbox = (item: Element) =>
    item.querySelector<HTMLButtonElement>('button[role="checkbox"]')
  const cardButton = (item: Element) =>
    item.querySelector('button[data-entrance]') as HTMLButtonElement

  it('a desktop card: a checkbox named 選取 <name> before the card button, 6px out of its corner on a surface backing', async () => {
    await render(fakeResponse({ changed: sample() }))
    const item = card(section('下載中，1 個'))
    const box = checkbox(item) as HTMLButtonElement
    expect(box.getAttribute('aria-label')).toBe('選取 Down')
    expect(item.firstElementChild).toBe(box)
    expect(cardButton(item).contains(box)).toBe(false)
    for (const token of [
      'absolute',
      '-top-1.5',
      '-left-1.5',
      'bg-surface',
      'ring-surface',
      'opacity-0',
      'group-hover/item:opacity-100',
      'group-focus-within/item:opacity-100',
    ]) {
      expect(box.className).toContain(token)
    }
    // The first card starts below the checkbox's 6px (and its outline).
    expect(COLUMN_PADDING_START).toBeGreaterThanOrEqual(6)
    expect(item.style.transform).toBe(`translateY(${COLUMN_PADDING_START}px)`)
    // 110px stay under the last card (the bar never covers it).
    expect(COLUMN_PADDING_END).toBe(110)
    const list = section('下載中，1 個').querySelector(
      '[data-card-list]',
    ) as HTMLElement
    expect(list.style.height).toBe(
      `${COLUMN_PADDING_START + CARD_HEIGHT_WITH_BAR + COLUMN_PADDING_END}px`,
    )
  })

  it('ticking: only the selection changes; the card turns selection-row; every list shows its checkboxes; the board keeps its order', async () => {
    await render(fakeResponse({ changed: sample() }))
    const down = card(section('下載中，1 個'))
    await act(async () => checkbox(down)?.click())
    expect(selectionStore.state.hashes).toEqual([h(1)])
    expect(setHash).not.toHaveBeenCalled()
    expect(cardButton(down).className).toContain('bg-selection-row')
    expect(cardButton(card(section('做種中，1 個'))).className).toContain(
      'bg-surface',
    )
    for (const list of main.querySelectorAll('[data-card-list]')) {
      expect(list.hasAttribute('data-selecting')).toBe(true)
    }
    expect(freezeStore.state.animation).toBe(false)
    // A board is not frozen: a status change moves the card at once.
    await poll(
      delta([t({ hash: h(1), name: 'Down', state: 'uploading', progress: 1 })]),
    )
    expect(names(section('做種中，2 個'))).toContain('Down')
    await act(async () => cardButton(card(section('要處理，2 個'))).click())
    expect(setHash).toHaveBeenCalledWith(h(3))
  })

  it('the expanded 已整理 cards have the checkbox too', async () => {
    await render(fakeResponse({ changed: sample() }))
    await act(async () => button('展開已整理欄，2 個').click())
    const boxes = [
      ...section('已整理，2 個').querySelectorAll('button[role="checkbox"]'),
    ].map((box) => box.getAttribute('aria-label'))
    expect(boxes.sort()).toEqual(['選取 Arch1', '選取 Arch2'])
  })

  it('below 1024px: no checkbox on the phone cards', async () => {
    desktop = false
    await render(fakeResponse({ changed: sample() }))
    expect(main.querySelector('[role="listitem"]')).not.toBeNull()
    expect(main.querySelector('button[role="checkbox"]')).toBeNull()
  })
})
