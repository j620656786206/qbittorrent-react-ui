// @vitest-environment happy-dom
import { act, useCallback, useState } from 'react'
import type { ReactNode } from 'react'
import { createRoot } from 'react-dom/client'
import type { Root } from 'react-dom/client'
import { QueryClientProvider, notifyManager } from '@tanstack/react-query'
import type { QueryClient } from '@tanstack/react-query'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fakeHash, fakeResponse, t } from '#/lib/testing'
import type { MaindataResponse, SlimTorrent } from '#/shared/maindata'
import { MAIN_ID } from '#/shared/ui/main-scroll'
import { clearConnectionErrors } from '#/state/connection'
import { clearLoginRequired } from '#/state/login-required'
import { MAINDATA_KEY } from '#/state/maindata'
import { clearMaindataFailure } from '#/state/maindata-failure'
import { freezeStore, resetOrderFreeze } from '#/state/order-freeze'
import { createQueryClient } from '#/state/query-client'
import { clearPending, pendingOpOf, resetPendingOps } from '#/state/pending-ops'
import { openLayerCount, resetShortcuts } from '#/state/shortcuts'
import { clearShownList, publishShownList } from '#/state/shown-order'
import { ViewedHashContext } from '#/state/viewed-hash'
import { BoardDetailPanel } from '#/features/detail/board-detail-panel'
import { DetailHeader } from '#/features/detail/detail-header'
import { ListDetailPanel } from '#/features/detail/list-detail-panel'
import {
  BoardDetailSheet,
  ListDetailSheet,
} from '#/features/detail/phone-detail-sheet'

// Spec 2.4: the detail's wiring in a DOM (happy-dom): the header in both
// layouts and the phone name, the tabs and the info list, the list panel's
// N of M and ‹ ›, the board panel (open, switch, ✕, Esc, gone, moved) and
// the phone sheet. The list's own side (rows, ring, vanish) is in
// torrent-list.dom.test.tsx; layout, motion and real clicks in e2e.

// getTorrentDetail never reaches a server here: each test sets the answer.
const detailCalls = vi.hoisted(() => ({
  hashes: [] as Array<string>,
  answer: (_hash: string): Promise<unknown> =>
    Promise.resolve({
      ok: true,
      data: {
        detail: {
          downloaded: 2 * 1024 ** 3,
          uploaded: 512 * 1024 ** 2,
          num_seeds: 12,
          num_leechs: 3,
        },
      },
    }),
}))
vi.mock('#/server/functions/get-torrent-detail', () => ({
  getTorrentDetail: (options: { data: { hash: string } }) => {
    detailCalls.hashes.push(options.data.hash)
    return detailCalls.answer(options.data.hash)
  },
}))

// Story 2.6: stopTorrents and startTorrents never reach a server either;
// toasts are checked at the feature's API (src/lib/toast.ts).
const opCalls = vi.hoisted(() => ({
  sent: [] as Array<{ op: 'stop' | 'start'; hashes: Array<string> }>,
  answer: (_op: 'stop' | 'start'): Promise<unknown> =>
    Promise.resolve({ ok: true, data: { items: [] } }),
}))
vi.mock('#/server/functions/stop-torrents', () => ({
  stopTorrents: (options: { data: { hashes: Array<string> } }) => {
    opCalls.sent.push({ op: 'stop', hashes: options.data.hashes })
    return opCalls.answer('stop')
  },
}))
vi.mock('#/server/functions/start-torrents', () => ({
  startTorrents: (options: { data: { hashes: Array<string> } }) => {
    opCalls.sent.push({ op: 'start', hashes: options.data.hashes })
    return opCalls.answer('start')
  },
}))
const toastCalls = vi.hoisted(() => ({
  dismissFor: vi.fn((_key: string) => {}),
  failure: vi.fn(
    (
      _text: string,
      _options: { keys: ReadonlyArray<string>; onRetry: () => void },
    ) => {},
  ),
}))
vi.mock('#/lib/toast', () => ({ toast: toastCalls }))

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean | undefined
}

const T0 = 1_790_000_000
const h = (n: number) => fakeHash(0x200 + n)

/** 下載中 Down1 (newest) and Down2; 做種中 Seed1 (longest), Seed2, Seed3. */
function board(): Array<SlimTorrent> {
  return [
    t({ hash: h(1), name: 'Down1', added_on: T0 + 10, category: '' }),
    t({ hash: h(2), name: 'Down2', added_on: T0 + 5 }),
    ...[1, 2, 3].map((n) =>
      t({
        hash: h(10 + n),
        name: `Seed${n}`,
        state: 'uploading',
        progress: 1,
        completion_on: T0,
        seeding_time: 1000 - n,
      }),
    ),
  ]
}

let main: HTMLElement
let root: Root
let client: QueryClient
let answers: Array<MaindataResponse>
let fetchCount: number
let hashNow: string | null
const writes: Array<string | null> = []

function Url({
  initial,
  children,
}: {
  initial: string | null
  children: ReactNode
}) {
  const [hash, setHashState] = useState(initial)
  hashNow = hash
  const setHash = useCallback((next: string | null) => {
    writes.push(next)
    setHashState(next)
  }, [])
  return (
    <ViewedHashContext value={{ hash, setHash }}>{children}</ViewedHashContext>
  )
}

async function render(
  ui: ReactNode,
  {
    hash = null,
    data = board(),
  }: { hash?: string | null; data?: Array<SlimTorrent> } = {},
) {
  answers = [fakeResponse({ changed: data })]
  fetchCount = 0
  client = createQueryClient({
    fetchMaindata: () => {
      fetchCount += 1
      return Promise.resolve(
        answers[Math.min(fetchCount - 1, answers.length - 1)],
      )
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
        <Url initial={hash}>{ui}</Url>
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

const q = <T extends Element = HTMLElement>(selector: string) =>
  document.querySelector<T>(selector)
const byLabel = (label: string) =>
  q<HTMLButtonElement>(`button[aria-label="${label}"]`) as HTMLButtonElement
const positionLine = () =>
  [...document.querySelectorAll('span')].find((span) =>
    span.textContent.includes('個／共'),
  )?.textContent
const esc = () =>
  act(async () => {
    document.dispatchEvent(
      new KeyboardEvent('keydown', {
        key: 'Escape',
        bubbles: true,
        cancelable: true,
      }),
    )
  })

beforeEach(() => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true
  notifyManager.setScheduler((callback) => callback())
  writes.length = 0
  vi.spyOn(window, 'matchMedia').mockImplementation(
    (query: string) =>
      ({
        matches: query.includes('reduce'),
        media: query,
        addEventListener: () => {},
        removeEventListener: () => {},
      }) as unknown as MediaQueryList,
  )
  clearLoginRequired()
  clearConnectionErrors()
  clearMaindataFailure()
  resetOrderFreeze()
  resetShortcuts()
  clearShownList()
  main = document.createElement('main')
  main.id = MAIN_ID
  main.tabIndex = -1
  document.body.append(main)
})

afterEach(async () => {
  await act(async () => root.unmount())
  client.clear()
  document.body.replaceChildren()
  resetShortcuts()
  vi.restoreAllMocks()
  notifyManager.setScheduler((callback) => setTimeout(callback, 0))
  globalThis.IS_REACT_ACT_ENVIRONMENT = false
})

describe('the header', () => {
  const position = { index: 0, total: 3, prev: null, next: 'b' }

  async function header(
    layout: 'row' | 'stacked' | 'phone',
    onClose?: () => void,
  ) {
    const onNavigate = vi.fn()
    await render(
      <DetailHeader
        layout={layout}
        torrent={t({ hash: 'a', name: 'A.Very.Long.Name' })}
        position={position}
        onNavigate={onNavigate}
        onClose={onClose}
      />,
    )
    return onNavigate
  }

  it('row (list mode): one row, name with title, nav, ⋯, no ✕; 36px buttons', async () => {
    const onNavigate = await header('row')
    const h2 = q('h2') as HTMLElement
    expect(h2.getAttribute('title')).toBe('A.Very.Long.Name')
    expect(h2.className).toContain('text-detail-name')
    expect(h2.className).toContain('truncate')
    expect(positionLine()).toBe('第 1 個／共 3 個')
    expect(byLabel('上一個').disabled).toBe(true)
    expect(byLabel('下一個').disabled).toBe(false)
    // Story 2.6: ⋯ works now.
    expect(byLabel('更多動作').disabled).toBe(false)
    expect(byLabel('更多動作').className).toContain('size-9')
    expect(byLabel('關閉')).toBeNull()
    expect(byLabel('下一個').className).toContain('size-9')
    // One row: the nav group is a sibling of the name.
    expect(h2.parentElement?.contains(byLabel('上一個'))).toBe(true)
    expect(h2.parentElement?.className).toContain('border-b')
    await act(async () => byLabel('下一個').click())
    expect(onNavigate).toHaveBeenCalledWith('b')
  })

  it('stacked (board panel): name, ⋯, ✕ on row 1; ‹ N › on row 2', async () => {
    const onClose = vi.fn()
    await header('stacked', onClose)
    const h2 = q('h2') as HTMLElement
    const row1 = h2.parentElement as HTMLElement
    expect(row1.contains(byLabel('更多動作'))).toBe(true)
    expect(row1.contains(byLabel('關閉'))).toBe(true)
    expect(row1.contains(byLabel('上一個'))).toBe(false)
    expect(row1.nextElementSibling?.contains(byLabel('上一個'))).toBe(true)
    await act(async () => byLabel('關閉').click())
    expect(onClose).toHaveBeenCalled()
  })

  it('D14 phone: 44px buttons; the name expands and collapses; › collapses it', async () => {
    const onNavigate = await header('phone', () => {})
    expect(byLabel('下一個').className).toContain('size-11')
    const name = byLabel('展開完整名稱')
    expect(name.closest('h2')).not.toBeNull()
    expect(name.className).toContain('min-h-11')
    expect(name.getAttribute('aria-expanded')).toBe('false')
    expect(name.querySelector('span')?.className).toContain('truncate')
    await act(async () => name.click())
    const expanded = byLabel('收起名稱')
    expect(expanded.getAttribute('aria-expanded')).toBe('true')
    expect(expanded.querySelector('span')?.className).toContain(
      '[overflow-wrap:anywhere]',
    )
    await act(async () => expanded.click())
    expect(byLabel('展開完整名稱')).not.toBeNull()
    await act(async () => byLabel('展開完整名稱').click())
    await act(async () => byLabel('下一個').click())
    expect(onNavigate).toHaveBeenCalledWith('b')
    expect(byLabel('展開完整名稱')).not.toBeNull()
  })
})

describe('the list panel (desktop list mode)', () => {
  const order = [h(1), h(2), h(11)]

  it('D7 header, N of M from the published order, tabs and the info list', async () => {
    await render(<ListDetailPanel />)
    await act(async () => publishShownList({ order, viewed: h(2) }))
    const aside = q('aside[aria-label="詳情"]') as HTMLElement
    expect(aside.className).toContain('rounded-panel')
    expect(q('h2')?.textContent).toBe('Down2')
    expect(positionLine()).toBe('第 2 個／共 3 個')
    const tablist = q('[role="tablist"]') as HTMLElement
    expect(tablist.getAttribute('aria-label')).toBe('詳情分頁')
    const tabs = [
      ...tablist.querySelectorAll<HTMLButtonElement>('[role="tab"]'),
    ]
    expect(tabs.map((tab) => tab.textContent)).toEqual(['概覽', '檔案'])
    expect(tabs[0].getAttribute('aria-selected')).toBe('true')
    expect(tabs[0].className).toContain('bg-primary')
    // Story 2.7: 檔案 works; roving tabIndex.
    expect(tabs[1].disabled).toBe(false)
    expect(tabs[1].getAttribute('aria-selected')).toBe('false')
    expect(tabs.map((tab) => tab.tabIndex)).toEqual([0, -1])
    const panel = q('[role="tabpanel"]') as HTMLElement
    expect(panel.getAttribute('aria-labelledby')).toBe(tabs[0].id)
    expect(tabs[0].getAttribute('aria-controls')).toBe(panel.id)
    expect(
      [...panel.querySelectorAll('dt')].map((dt) => dt.textContent),
    ).toEqual(['分類', '大小', '加入時間', '完成時間', '已下載', '已上傳'])
    // The header and tabs stay; only the panel scrolls.
    expect(panel.className).toContain('overflow-y-auto')
  })

  it('‹ › write the neighbours in the shown order', async () => {
    await render(<ListDetailPanel />)
    await act(async () => publishShownList({ order, viewed: h(2) }))
    await act(async () => byLabel('上一個').click())
    expect(writes).toEqual([h(1)])
  })

  it('D15 no category and not completed: 「沒有」 muted', async () => {
    await render(<ListDetailPanel />)
    await act(async () => publishShownList({ order, viewed: h(1) }))
    const values = [...document.querySelectorAll('dd')]
    expect(values[0].textContent).toBe('沒有')
    expect(values[0].className).toContain('text-text-muted')
    expect(values[3].textContent).toBe('沒有')
    expect(values[1].className).not.toContain('text-text-muted')
  })

  it('已下載 and 已上傳 come from getTorrentDetail for the viewed hash only', async () => {
    detailCalls.hashes = []
    await render(<ListDetailPanel />)
    await act(async () => publishShownList({ order, viewed: h(2) }))
    const values = () =>
      [...document.querySelectorAll('dd')].map((dd) => dd.textContent)
    await vi.waitFor(() =>
      expect(values().slice(4)).toEqual(['2 GB', '512 MB']),
    )
    expect(new Set(detailCalls.hashes)).toEqual(new Set([h(2)]))
  })

  it('before the first answer 「…」 muted; detail null is 「沒有」', async () => {
    const original = detailCalls.answer
    let resolve: (value: unknown) => void = () => {}
    detailCalls.answer = () =>
      new Promise((done) => {
        resolve = done
      })
    try {
      await render(<ListDetailPanel />)
      await act(async () => publishShownList({ order, viewed: h(2) }))
      const dd = () => [...document.querySelectorAll('dd')]
      expect(dd()[4].textContent).toBe('…')
      expect(dd()[4].className).toContain('text-text-muted')
      await act(async () => resolve({ ok: true, data: { detail: null } }))
      await vi.waitFor(() => expect(dd()[5].textContent).toBe('沒有'))
      expect(dd()[5].className).toContain('text-text-muted')
    } finally {
      detailCalls.answer = original
    }
  })
})

describe('traffic values (getTorrentDetail)', () => {
  const dd = () => [...document.querySelectorAll('dd')]

  it('the first call fails: 「沒有」 muted, not 「…」 forever', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const original = detailCalls.answer
    detailCalls.answer = () =>
      Promise.resolve({
        ok: false,
        error: { code: 'qbit_rejected', message: 'x' },
      })
    try {
      await render(<BoardDetailPanel />, { hash: h(1) })
      await vi.waitFor(() => expect(dd()[4].textContent).toBe('沒有'))
      expect(dd()[5].textContent).toBe('沒有')
      expect(dd()[4].className).toContain('text-text-muted')
      // The next poll starts and hangs: still 「沒有」, never back to 「…」
      // (Query resets `isError` when a fetch starts with no data).
      detailCalls.answer = () => new Promise(() => {})
      await act(async () => {
        void client.refetchQueries({ queryKey: ['torrent-detail', h(1)] })
      })
      expect(dd()[4].textContent).toBe('沒有')
      expect(dd()[5].textContent).toBe('沒有')
    } finally {
      detailCalls.answer = original
    }
  })

  it("switching torrents never shows the previous one's values", async () => {
    const original = detailCalls.answer
    try {
      await render(<BoardDetailPanel />, { hash: h(1) })
      await vi.waitFor(() =>
        expect(
          dd()
            .map((cell) => cell.textContent)
            .slice(4),
        ).toEqual(['2 GB', '512 MB']),
      )
      detailCalls.answer = () => new Promise(() => {})
      await act(async () => byLabel('下一個').click())
      expect(q('h2')?.textContent).toBe('Down2')
      expect(
        dd()
          .map((cell) => cell.textContent)
          .slice(4),
      ).toEqual(['…', '…'])
      expect(dd()[4].className).toContain('text-text-muted')
      expect(dd()[5].className).toContain('text-text-muted')
    } finally {
      detailCalls.answer = original
    }
  })
})

describe('focus at the ends', () => {
  it('a focused › that turns disabled hands focus to ‹ (and back)', async () => {
    await render(<BoardDetailPanel />, { hash: h(12) })
    byLabel('下一個').focus()
    await act(async () => byLabel('下一個').click())
    expect(byLabel('下一個').disabled).toBe(true)
    expect(document.activeElement).toBe(byLabel('上一個'))
    await act(async () => byLabel('上一個').click())
    await act(async () => byLabel('上一個').click())
    expect(byLabel('上一個').disabled).toBe(true)
    expect(document.activeElement).toBe(byLabel('下一個'))
  })

  it('a press that does not reach an end keeps focus where it is', async () => {
    await render(<BoardDetailPanel />, { hash: h(11) })
    byLabel('下一個').focus()
    await act(async () => byLabel('下一個').click())
    expect(positionLine()).toBe('做種中　第 2 個／共 3 個')
    expect(document.activeElement).toBe(byLabel('下一個'))
  })
})

describe('the board panel (desktop board mode)', () => {
  it('closed without hash; D4 D8 open: column name in N of M, ends disable', async () => {
    await render(<BoardDetailPanel />)
    expect(q('aside')).toBeNull()
    expect(openLayerCount()).toBe(0)
    await act(async () => root.unmount())
    await render(<BoardDetailPanel />, { hash: h(12) })
    const aside = q('aside[aria-label="詳情"]') as HTMLElement
    expect(aside.className).toContain('absolute')
    expect(aside.className).toContain('w-[calc((100%-120px)/4+78px)]')
    expect(aside.className).toContain('shadow-float')
    expect(aside.className).toContain('animate-panel-in')
    expect(positionLine()).toBe('做種中　第 2 個／共 3 個')
    await act(async () => byLabel('下一個').click())
    expect(positionLine()).toBe('做種中　第 3 個／共 3 個')
    expect(byLabel('下一個').disabled).toBe(true)
    // Never jumps to the next column.
    expect(writes).toEqual([h(13)])
  })

  it('D5 a switch keeps the same panel (no replayed slide)', async () => {
    await render(<BoardDetailPanel />, { hash: h(1) })
    const aside = q('aside')
    await act(async () => byLabel('下一個').click())
    expect(q('h2')?.textContent).toBe('Down2')
    expect(q('aside')).toBe(aside)
  })

  it('D4 ✕ closes and removes hash; focus goes back to main', async () => {
    await render(<BoardDetailPanel />, { hash: h(1) })
    byLabel('關閉').focus()
    await act(async () => byLabel('關閉').click())
    expect(hashNow).toBeNull()
    expect(q('aside')).toBeNull()
    expect(document.activeElement).toBe(main)
  })

  it('D4 D13 Esc closes it through the registry', async () => {
    await render(<BoardDetailPanel />, { hash: h(1) })
    expect(openLayerCount()).toBe(1)
    await esc()
    expect(hashNow).toBeNull()
    expect(openLayerCount()).toBe(0)
  })

  it('D10 a moved torrent keeps the panel with the new column; a deleted one closes it', async () => {
    await render(<BoardDetailPanel />, { hash: h(1) })
    expect(positionLine()).toBe('下載中　第 1 個／共 2 個')
    await poll(
      fakeResponse({
        version: 'v2',
        full: false,
        changed: [
          t({
            hash: h(1),
            name: 'Down1',
            state: 'uploading',
            progress: 1,
            completion_on: T0,
            seeding_time: 5000,
          }),
        ],
      }),
    )
    expect(positionLine()).toBe('做種中　第 1 個／共 4 個')
    await poll(
      fakeResponse({
        version: 'v3',
        full: false,
        changed: [],
        removed: [h(1)],
      }),
    )
    expect(q('aside')).toBeNull()
    expect(hashNow).toBeNull()
  })

  it('D12 a reloaded hash the board does not have closes', async () => {
    await render(<BoardDetailPanel />, { hash: h(99) })
    expect(q('aside')).toBeNull()
    expect(writes).toEqual([null])
  })
})

describe('the phone sheet', () => {
  it('D6 board: opens at detail height with the header in the sheet; ✕ closes and removes hash', async () => {
    await render(<BoardDetailSheet />, { hash: h(11) })
    const dialog = q('[role="dialog"]') as HTMLElement
    expect(dialog).not.toBeNull()
    const titleId = dialog.getAttribute('aria-labelledby') ?? ''
    expect(document.getElementById(titleId)?.textContent).toBe('Seed1')
    expect(document.getElementById(titleId)?.closest('h2')).not.toBeNull()
    expect(positionLine()).toBe('做種中　第 1 個／共 3 個')
    expect(byLabel('展開完整名稱')).not.toBeNull()
    // The list behind keeps its order while it is open.
    expect(freezeStore.state.sheetOpen).toBe(true)
    // One close button: the detail header's.
    expect(document.querySelectorAll('button[aria-label="關閉"]')).toHaveLength(
      1,
    )
    // Focus starts on the ✕, like the sort sheet.
    expect(document.activeElement).toBe(byLabel('關閉'))
    // The tabs stay above the scrolling content.
    const content = q('[data-slot="bottom-sheet-content"]') as HTMLElement
    expect(content.contains(q('[role="tablist"]'))).toBe(false)
    expect(content.contains(q('[role="tabpanel"]'))).toBe(true)
    await act(async () => byLabel('關閉').click())
    expect(hashNow).toBeNull()
    expect(q('[role="dialog"]')).toBeNull()
    expect(freezeStore.state.sheetOpen).toBe(false)
  })

  it('D13 Esc closes it; D11 a deleted torrent closes it', async () => {
    await render(<BoardDetailSheet />, { hash: h(11) })
    await esc()
    expect(hashNow).toBeNull()
    await act(async () => root.unmount())
    writes.length = 0
    await render(<BoardDetailSheet />, { hash: h(11) })
    await poll(
      fakeResponse({
        version: 'v2',
        full: false,
        changed: [],
        removed: [h(11)],
      }),
    )
    expect(writes).toEqual([null])
    expect(q('[role="dialog"]')).toBeNull()
  })

  it('board: a torrent turning 已整理 closes it (the phone has no 已整理 tab)', async () => {
    await render(<BoardDetailSheet />, { hash: h(11) })
    expect(q('[role="dialog"]')).not.toBeNull()
    await poll(
      fakeResponse({
        version: 'v2',
        full: false,
        changed: [
          t({
            hash: h(11),
            name: 'Seed1',
            state: 'missingFiles',
            progress: 1,
            completion_on: T0,
            private: false,
          }),
        ],
      }),
    )
    expect(writes).toEqual([null])
    expect(q('[role="dialog"]')).toBeNull()
  })

  it('list: the viewed row in the published order; ‹ › move through it', async () => {
    await render(<ListDetailSheet />)
    expect(q('[role="dialog"]')).toBeNull()
    await act(async () =>
      publishShownList({ order: [h(1), h(2)], viewed: h(2) }),
    )
    expect(q('[role="dialog"]')).not.toBeNull()
    expect(positionLine()).toBe('第 2 個／共 2 個')
    await act(async () => byLabel('上一個').click())
    expect(writes).toEqual([h(1)])
  })
})

// Spec 2.5: the overview's blocks in a DOM. Layout, the real front cut and
// the real clipboard are checked in e2e (detail.spec.ts).
describe('the overview (story 2.5)', () => {
  const LONG_PATH = '/data/media/tv/假影集.Fake.Show.S01.2160p.WEB-DL'
  const sectionOf = () => q('section[aria-label="儲存位置"]') as HTMLElement
  const pills = () => [
    ...sectionOf().querySelectorAll<HTMLButtonElement>(
      ':scope > div:last-child > button',
    ),
  ]
  const tileTexts = () =>
    [...(q('[data-slot="stat-tiles"]') as HTMLElement).children].map((tile) =>
      [...tile.children].map((part) => part.textContent),
    )

  function setClipboard(value: unknown) {
    Object.defineProperty(navigator, 'clipboard', {
      value,
      configurable: true,
    })
  }

  /** Own property descriptors before the tests touch them (restored after). */
  const ORIGINAL = {
    clipboard: Object.getOwnPropertyDescriptor(navigator, 'clipboard'),
    execCommand: Object.getOwnPropertyDescriptor(document, 'execCommand'),
  }
  function restore(
    target: object,
    name: string,
    descriptor: PropertyDescriptor | undefined,
  ) {
    if (descriptor) Object.defineProperty(target, name, descriptor)
    else Reflect.deleteProperty(target, name)
  }

  afterEach(() => {
    restore(navigator, 'clipboard', ORIGINAL.clipboard)
    restore(document, 'execCommand', ORIGINAL.execCommand)
    vi.useRealTimers()
  })

  async function openSeed(data = board()) {
    await render(<ListDetailPanel />, { data })
    await act(async () =>
      publishShownList({ order: [h(1), h(11)], viewed: h(11) }),
    )
  }

  it('order: hero, three tiles, save-path block, info list', async () => {
    await openSeed()
    const panel = q('[role="tabpanel"]') as HTMLElement
    const blocks = [...(panel.firstElementChild as HTMLElement).children]
    expect(blocks).toHaveLength(4)
    expect(blocks[0].querySelector('svg')?.getAttribute('width')).toBe('64')
    expect(blocks[0].textContent).toContain('做種')
    expect(blocks[1].getAttribute('data-slot')).toBe('stat-tiles')
    expect(blocks[1].children).toHaveLength(3)
    expect(blocks[1].className).toContain('grid-cols-3')
    expect(blocks[2]).toBe(sectionOf())
    expect(blocks[3].tagName).toBe('DL')
    // The headline says the status: the circle is decorative.
    const circle = blocks[0].querySelector('svg') as SVGElement
    expect(circle.getAttribute('aria-hidden')).toBe('true')
    expect(circle.hasAttribute('role')).toBe(false)
    // The panel scrolls and its first content takes no focus: it stays a
    // tab stop (WAI-ARIA tabs pattern).
    expect(panel.getAttribute('tabindex')).toBe('0')
  })

  it('hero: headline in the status colour, muted summary; tiles get the detail counts', async () => {
    await openSeed()
    const headline = q('[role="tabpanel"] p') as HTMLElement
    expect(headline.textContent).toBe('做種 16 分')
    expect(headline.className).toContain('text-detail-hero')
    expect(headline.className).toContain('text-status-seeding')
    const summary = headline.nextElementSibling as HTMLElement
    expect(summary.className).toContain('text-text-muted')
    await vi.waitFor(() =>
      expect(summary.textContent).toBe(
        '分享率 0.00 · 已上傳 512 MB · 85 GB · X',
      ),
    )
    expect(tileTexts()).toEqual([
      ['現在上傳', '0 KB/s'],
      ['在抓的人', '3'],
      ['最後有人抓', '沒人抓過'],
    ])
    const values = [
      ...document.querySelectorAll(
        '[data-slot="stat-tiles"] > * > :last-child',
      ),
    ]
    // A missing value is muted, a real one is not.
    expect(values[2].className).toContain('text-text-muted')
    expect(values[1].className).not.toContain('text-text-muted')
  })

  it('save path: tag, full path cut from the front, one solid pill, three disabled', async () => {
    const data = board().map((torrent) =>
      torrent.hash === h(11) ? { ...torrent, save_path: LONG_PATH } : torrent,
    )
    await openSeed(data)
    const section = sectionOf()
    expect(section.textContent).toContain('儲存位置')
    expect(section.textContent).toContain(
      'tv/假影集.Fake.Show.S01.2160p.WEB-DL',
    )
    const cut = section.querySelector('[dir="rtl"]') as HTMLElement
    expect(cut.className).toContain('truncate')
    expect(cut.className).toContain('font-mono')
    expect(cut.querySelector('bdi')?.getAttribute('dir')).toBe('ltr')
    expect(cut.textContent).toBe(LONG_PATH)
    // Desktop: the whole path on hover; no expand button.
    expect(cut.parentElement?.getAttribute('title')).toBe(LONG_PATH)
    expect(section.querySelector('[aria-expanded]')).toBeNull()
    expect(pills().map((pill) => pill.textContent)).toEqual([
      '複製',
      '☆ 加到常用',
      '改路徑',
      '改檔名',
    ])
    expect(pills().map((pill) => pill.disabled)).toEqual([
      false,
      true,
      true,
      true,
    ])
    expect(pills()[2].className).toContain('bg-primary')
    expect(pills()[0].className).toContain('h-[34px]')
    expect(
      pills().filter((pill) => pill.className.includes('bg-primary')),
    ).toHaveLength(1)
  })

  it('C1 複製: the full path, 「已複製」 for 1.5 s, a second press restarts it', async () => {
    const writeText = vi.fn(() => Promise.resolve())
    setClipboard({ writeText })
    await openSeed()
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
    await act(async () => pills()[0].click())
    expect(writeText).toHaveBeenCalledWith('/data/media/X/incompleted')
    expect(pills()[0].textContent).toBe('已複製')
    await act(async () => vi.advanceTimersByTime(1000))
    await act(async () => pills()[0].click())
    await act(async () => vi.advanceTimersByTime(1000))
    // 2 s after the first press, 1 s after the second: still showing.
    expect(pills()[0].textContent).toBe('已複製')
    await act(async () => vi.advanceTimersByTime(600))
    expect(pills()[0].textContent).toBe('複製')
  })

  it('C2 both ways fail: 「複製失敗」 for 1.5 s, no toast', async () => {
    setClipboard(undefined)
    Object.defineProperty(document, 'execCommand', {
      value: () => false,
      configurable: true,
      writable: true,
    })
    await openSeed()
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
    await act(async () => pills()[0].click())
    expect(pills()[0].textContent).toBe('複製失敗')
    expect(q('[role="status"]')).toBeNull()
    await act(async () => vi.advanceTimersByTime(1500))
    expect(pills()[0].textContent).toBe('複製')
  })

  it('P2 phone: tapping the path wraps it, tapping again cuts it; 2 x 2 44px pills', async () => {
    await render(<BoardDetailSheet />, {
      hash: h(11),
      data: board().map((torrent) =>
        torrent.hash === h(11) ? { ...torrent, save_path: LONG_PATH } : torrent,
      ),
    })
    const button = sectionOf().querySelector(
      'button[aria-expanded]',
    ) as HTMLButtonElement
    expect(button.getAttribute('aria-expanded')).toBe('false')
    expect(button.className).toContain('min-h-11')
    expect(button.querySelector('.truncate')).not.toBeNull()
    await act(async () => button.click())
    expect(button.getAttribute('aria-expanded')).toBe('true')
    expect(button.querySelector('.truncate')).toBeNull()
    expect(button.textContent).toBe(LONG_PATH)
    await act(async () => button.click())
    expect(button.getAttribute('aria-expanded')).toBe('false')
    expect(button.querySelector('.truncate')).not.toBeNull()
    expect(pills()[0].parentElement?.className).toContain('grid-cols-2')
    expect(pills()[0].className).toContain('h-11')
  })

  it('› resets the save-path block: path collapsed, label 「複製」 again', async () => {
    setClipboard({ writeText: () => Promise.resolve() })
    await render(<BoardDetailSheet />, {
      hash: h(11),
      data: board().map((torrent) => ({ ...torrent, save_path: LONG_PATH })),
    })
    const pathButton = () =>
      sectionOf().querySelector('button[aria-expanded]') as HTMLButtonElement
    await act(async () => pathButton().click())
    expect(pathButton().getAttribute('aria-expanded')).toBe('true')
    await act(async () => pills()[0].click())
    expect(pills()[0].textContent).toBe('已複製')
    await act(async () => byLabel('下一個').click())
    expect(q('h2')?.textContent).toBe('Seed2')
    expect(pathButton().getAttribute('aria-expanded')).toBe('false')
    expect(pills()[0].textContent).toBe('複製')
  })

  it('a copy still pending when ‹ › remounts the block changes nothing afterwards', async () => {
    let resolve: () => void = () => {}
    setClipboard({
      writeText: () =>
        new Promise<void>((done) => {
          resolve = done
        }),
    })
    const errors = vi.spyOn(console, 'error')
    await render(<BoardDetailPanel />, { hash: h(11) })
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
    await act(async () => pills()[0].click())
    expect(pills()[0].textContent).toBe('複製')
    await act(async () => byLabel('下一個').click())
    expect(q('h2')?.textContent).toBe('Seed2')
    const timersBefore = vi.getTimerCount()
    await act(async () => resolve())
    // The gone block starts no 1.5 s timer.
    expect(vi.getTimerCount()).toBe(timersBefore)
    expect(pills()[0].textContent).toBe('複製')
    await act(async () => vi.advanceTimersByTime(2000))
    expect(pills()[0].textContent).toBe('複製')
    expect(errors).not.toHaveBeenCalled()
  })

  it('a move keeps the row it had before (stateBeforeMove from maindata)', async () => {
    const paused = t({
      hash: h(1),
      name: 'Down1',
      state: 'pausedDL',
      progress: 0.42,
    })
    await render(<BoardDetailPanel />, {
      hash: h(1),
      data: [paused, ...board().slice(1)],
    })
    const headline = () => q('[role="tabpanel"] p') as HTMLElement
    expect(headline().textContent).toBe('已暫停\u300042%')
    await poll(
      fakeResponse({
        version: 'v2',
        full: false,
        changed: [{ ...paused, state: 'moving' }],
      }),
    )
    expect(headline().textContent).toBe('已暫停\u300042%')
    expect(headline().className).toContain('text-status-paused')
  })

  it('X1 names, paths and categories with markup stay plain text', async () => {
    const markup = '<b>x</b>'
    const data = board().map((torrent) =>
      torrent.hash === h(11)
        ? {
            ...torrent,
            name: markup,
            category: markup,
            save_path: `/data/javascript:alert(1)/${markup}`,
          }
        : torrent,
    )
    await openSeed(data)
    const panel = q('[role="tabpanel"]') as HTMLElement
    expect(panel.querySelector('b')).toBeNull()
    expect(panel.querySelector('a')).toBeNull()
    expect(panel.textContent).toContain(`85 GB · ${markup}`)
    expect(panel.textContent).toContain(`/data/javascript:alert(1)/${markup}`)
    expect(q('h2')?.textContent).toBe(markup)
  })
})

describe('the ⋯ menu (story 2.6)', () => {
  const OK = { ok: true, data: { items: [] } }
  const failWith = (code: string) => () =>
    Promise.resolve({ ok: false, error: { code, message: 'x' } })

  beforeEach(() => {
    opCalls.sent.length = 0
    opCalls.answer = () => Promise.resolve(OK)
    toastCalls.failure.mockClear()
    toastCalls.dismissFor.mockClear()
    resetPendingOps()
  })

  afterEach(() => resetPendingOps())

  const trigger = () => byLabel('更多動作')
  const menu = () => q('[role="menu"]')
  const item = () => q('[role="menuitem"]') as HTMLElement

  async function openMenu() {
    await act(async () => {
      trigger().dispatchEvent(
        new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }),
      )
    })
    expect(menu()).not.toBeNull()
  }

  async function pressItem() {
    await act(async () => item().click())
  }

  /**
   * Lets the mutation and the refresh it starts settle, and Radix's focus
   * return after the menu closed (a 0 ms timer in its FocusScope).
   */
  async function settle() {
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0))
    })
  }

  const pausedDown = (state: string) =>
    t({ hash: h(1), name: 'Down1', added_on: T0 + 10, state, progress: 0.42 })

  it('M1 one item: 暫停 for a downloading torrent, 繼續 for paused and done', async () => {
    await render(<BoardDetailPanel />, { hash: h(1) })
    expect(trigger().getAttribute('aria-haspopup')).toBe('menu')
    expect(trigger().className).toContain('size-9')
    await openMenu()
    expect(document.querySelectorAll('[role="menuitem"]')).toHaveLength(1)
    expect(item().textContent).toBe('暫停')
    expect(item().className).toContain('h-9')
    await act(async () => root.unmount())

    for (const state of ['pausedDL', 'stoppedDL']) {
      await render(<BoardDetailPanel />, {
        hash: h(1),
        data: [pausedDown(state), ...board().slice(1)],
      })
      await openMenu()
      expect(item().textContent, state).toBe('繼續')
      await act(async () => root.unmount())
    }
    const done = t({
      hash: h(1),
      name: 'Done1',
      state: 'stoppedUP',
      progress: 1,
      completion_on: T0,
    })
    await render(<BoardDetailPanel />, {
      hash: h(1),
      data: [done, ...board().slice(1)],
    })
    await openMenu()
    expect(item().textContent).toBe('繼續')
  })

  it('P1 暫停: one stop call for that hash, no toast, one refresh; disabled until the state flips', async () => {
    await render(<BoardDetailPanel />, { hash: h(1) })
    await openMenu()
    const before = fetchCount
    await pressItem()
    await settle()
    expect(opCalls.sent).toEqual([{ op: 'stop', hashes: [h(1)] }])
    expect(toastCalls.failure).not.toHaveBeenCalled()
    expect(fetchCount).toBe(before + 1)
    expect(menu()).toBeNull()
    // qBittorrent has not shown it yet: the item is disabled, same word.
    expect(pendingOpOf(h(1))).toBe('stop')
    await openMenu()
    expect(item().textContent).toBe('暫停')
    expect(item().getAttribute('aria-disabled')).toBe('true')
    await pressItem()
    expect(opCalls.sent).toHaveLength(1)
    // The next maindata shows it paused: 繼續, enabled.
    await poll(
      fakeResponse({
        version: 'v2',
        full: false,
        changed: [pausedDown('stoppedDL')],
      }),
    )
    expect(pendingOpOf(h(1))).toBeNull()
    expect(item().textContent).toBe('繼續')
    expect(item().getAttribute('aria-disabled')).toBeNull()
  })

  it('a settled call (重試 too) leaves no observer behind: the cache collects it', async () => {
    opCalls.answer = failWith('qbit_rejected')
    await render(<BoardDetailPanel />, { hash: h(1) })
    client.setMutationDefaults(['pause-resume'], { gcTime: 0 })
    await openMenu()
    await pressItem()
    await settle()
    const [, { onRetry }] = toastCalls.failure.mock.calls[0]
    await act(async () => onRetry())
    await settle()
    expect(opCalls.sent).toHaveLength(2)
    await settle()
    expect(
      client.getMutationCache().findAll({ mutationKey: ['pause-resume'] }),
    ).toEqual([])
  })

  it('繼續 on a 已完成 torrent sends start', async () => {
    const done = t({
      hash: h(1),
      name: 'Done1',
      state: 'stoppedUP',
      progress: 1,
      completion_on: T0,
    })
    await render(<BoardDetailPanel />, {
      hash: h(1),
      data: [done, ...board().slice(1)],
    })
    await openMenu()
    await pressItem()
    await settle()
    expect(opCalls.sent).toEqual([{ op: 'start', hashes: [h(1)] }])
  })

  it.each(['missingFiles', 'error'])(
    '暫停 on a %s torrent (qBittorrent keeps that state code): the item comes back once the refresh arrived',
    async (state) => {
      const kept = t({
        hash: h(1),
        name: 'Kept1',
        state,
        progress: 1,
        completion_on: T0,
      })
      await render(<BoardDetailPanel />, {
        hash: h(1),
        data: [kept, ...board().slice(1)],
      })
      await openMenu()
      const before = fetchCount
      await pressItem()
      await settle()
      expect(opCalls.sent).toEqual([{ op: 'stop', hashes: [h(1)] }])
      expect(fetchCount).toBe(before + 1)
      // Same word (the state did not change), usable again: no 30 s wait.
      expect(pendingOpOf(h(1))).toBeNull()
      await openMenu()
      expect(item().textContent).toBe('暫停')
      expect(item().getAttribute('aria-disabled')).toBeNull()
    },
  )

  it.each([
    ['qbit_rejected', '暫停失敗：qBittorrent 拒絕這個操作'],
    ['timeout', '暫停失敗：qBittorrent 沒有回應，請再試一次'],
    ['invalid_input', '暫停失敗：送出的資料格式不對'],
  ])(
    'F1 %s: a failure toast with 重試; the item is enabled again; 重試 resends',
    async (code, text) => {
      opCalls.answer = failWith(code)
      await render(<BoardDetailPanel />, { hash: h(1) })
      await openMenu()
      await pressItem()
      await settle()
      expect(toastCalls.failure).toHaveBeenCalledOnce()
      const [shownText, { onRetry }] = toastCalls.failure.mock.calls[0] as [
        string,
        { onRetry: () => void },
      ]
      expect(shownText).toBe(text)
      expect(pendingOpOf(h(1))).toBeNull()
      await openMenu()
      expect(item().getAttribute('aria-disabled')).toBeNull()
      // 重試 works even after the detail closed.
      await act(async () => root.unmount())
      opCalls.answer = () => Promise.resolve(OK)
      await act(async () => onRetry())
      await settle()
      expect(opCalls.sent).toEqual([
        { op: 'stop', hashes: [h(1)] },
        { op: 'stop', hashes: [h(1)] },
      ])
      expect(toastCalls.failure).toHaveBeenCalledOnce()
      expect(pendingOpOf(h(1))).toBe('stop')
    },
  )

  it.each([
    'home_unreachable',
    'qbit_unreachable',
    'not_logged_in',
    'bad_origin',
  ])(
    'F2 %s: no toast (the global onError has it); pending cleared',
    async (code) => {
      vi.spyOn(console, 'error').mockImplementation(() => {})
      opCalls.answer = failWith(code)
      await render(<BoardDetailPanel />, { hash: h(1) })
      await openMenu()
      await pressItem()
      await settle()
      expect(toastCalls.failure).not.toHaveBeenCalled()
      expect(pendingOpOf(h(1))).toBeNull()
    },
  )

  it('a new op for the hash closes its failure toast, so 重試 cannot resend a stale op', async () => {
    opCalls.answer = failWith('qbit_rejected')
    await render(<BoardDetailPanel />, { hash: h(1) })
    await openMenu()
    await pressItem()
    await settle()
    expect(toastCalls.failure).toHaveBeenCalledOnce()
    expect(toastCalls.failure.mock.calls[0][1].keys).toEqual([h(1)])
    expect(toastCalls.dismissFor).toHaveBeenCalledTimes(1)
    opCalls.answer = () => Promise.resolve(OK)
    await openMenu()
    await pressItem()
    await settle()
    expect(toastCalls.dismissFor).toHaveBeenCalledTimes(2)
    expect(toastCalls.dismissFor).toHaveBeenLastCalledWith(h(1))
    expect(opCalls.sent).toHaveLength(2)
  })

  it('the item stays disabled while its call is in flight, past the pending mark', async () => {
    let finish: (value: unknown) => void = () => {}
    opCalls.answer = () =>
      new Promise((resolve) => {
        finish = resolve
      })
    await render(<BoardDetailPanel />, { hash: h(1) })
    await openMenu()
    await pressItem()
    await settle()
    // The 30 s mark ends while the call still runs (server 30 s, callFn 35 s).
    await act(async () => clearPending(h(1)))
    await openMenu()
    expect(item().getAttribute('aria-disabled')).toBe('true')
    await pressItem()
    expect(opCalls.sent).toHaveLength(1)
    await act(async () => finish(OK))
    await settle()
    // Settled; its mark already ended, so the item is enabled again.
    expect(pendingOpOf(h(1))).toBeNull()
    expect(item().getAttribute('aria-disabled')).toBeNull()
  })

  it('a paused torrent polled to moving still offers 繼續 (stateBeforeMove)', async () => {
    await render(<BoardDetailPanel />, {
      hash: h(1),
      data: [pausedDown('pausedDL'), ...board().slice(1)],
    })
    await openMenu()
    expect(item().textContent).toBe('繼續')
    await poll(
      fakeResponse({
        version: 'v2',
        full: false,
        changed: [pausedDown('moving')],
      }),
    )
    expect(item().textContent).toBe('繼續')
  })

  it('Esc with the menu open closes only the menu, not the panel', async () => {
    await render(<BoardDetailPanel />, { hash: h(1) })
    await openMenu()
    const target = document.activeElement ?? document
    await act(async () => {
      target.dispatchEvent(
        new KeyboardEvent('keydown', {
          key: 'Escape',
          bubbles: true,
          cancelable: true,
        }),
      )
    })
    expect(menu()).toBeNull()
    expect(hashNow).toBe(h(1))
    expect(q('aside')).not.toBeNull()
    await esc()
    expect(hashNow).toBeNull()
  })

  it('phone: 44px trigger and rows; the menu portals into the sheet and stays open', async () => {
    await render(<BoardDetailSheet />, { hash: h(11) })
    const dialog = q('[role="dialog"]') as HTMLElement
    expect(trigger().className).toContain('size-11')
    await openMenu()
    expect(dialog.contains(menu())).toBe(true)
    expect(item().className).toContain('h-11')
    expect(item().textContent).toBe('暫停')
    // Focus moved into the menu without the sheet pulling it back.
    expect(menu()?.contains(document.activeElement)).toBe(true)
    // Esc closes the menu, the sheet stays.
    await act(async () => {
      ;(document.activeElement ?? document).dispatchEvent(
        new KeyboardEvent('keydown', {
          key: 'Escape',
          bubbles: true,
          cancelable: true,
        }),
      )
    })
    expect(menu()).toBeNull()
    expect(q('[role="dialog"]')).not.toBeNull()
    expect(hashNow).toBe(h(11))
  })
})
