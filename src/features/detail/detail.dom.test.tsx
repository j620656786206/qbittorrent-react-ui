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
        hash="a"
        name="A.Very.Long.Name"
        position={position}
        onNavigate={onNavigate}
        onClose={onClose}
      />,
    )
    return onNavigate
  }

  it('row (list mode): one row, name with title, nav, disabled ⋯, no ✕; 36px buttons', async () => {
    const onNavigate = await header('row')
    const h2 = q('h2') as HTMLElement
    expect(h2.getAttribute('title')).toBe('A.Very.Long.Name')
    expect(h2.className).toContain('text-detail-name')
    expect(h2.className).toContain('truncate')
    expect(positionLine()).toBe('第 1 個／共 3 個')
    expect(byLabel('上一個').disabled).toBe(true)
    expect(byLabel('下一個').disabled).toBe(false)
    expect(byLabel('更多動作').disabled).toBe(true)
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
    expect(tabs[1].disabled).toBe(true)
    const panel = q('[role="tabpanel"]') as HTMLElement
    expect(panel.getAttribute('aria-labelledby')).toBe(tabs[0].id)
    expect(tabs[0].getAttribute('aria-controls')).toBe(panel.id)
    expect(
      [...panel.querySelectorAll('dt')].map((dt) => dt.textContent),
    ).toEqual(['分類', '大小', '加入時間', '完成時間'])
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
