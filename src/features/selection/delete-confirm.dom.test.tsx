// @vitest-environment happy-dom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import type { Root } from 'react-dom/client'
import { QueryClientProvider, notifyManager } from '@tanstack/react-query'
import type { QueryClient } from '@tanstack/react-query'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fakeHash, fakeResponse, t } from '#/lib/testing'
import type { SlimTorrent } from '#/shared/maindata'
import { MAIN_ID } from '#/shared/ui/main-scroll'
import { STILL_WAITING_TEXT } from '#/shared/ui/confirm-shell'
import { MAINDATA_KEY } from '#/state/maindata'
import { resetOrderFreeze } from '#/state/order-freeze'
import { pendingOpOf, resetPendingOps } from '#/state/pending-ops'
import { createQueryClient } from '#/state/query-client'
import {
  pruneSelection,
  resetSelection,
  selectionStore,
  toggleSelected,
} from '#/state/selection'
import { resetShortcuts } from '#/state/shortcuts'
import { SelectionBar } from '#/features/selection/selection-bar'

// Spec 4.3: the delete confirmation through the selection bar, in a DOM.
// The list (tick order, sizes, the gone words and notes, 5 rows then the
// virtualized rest), the checkbox and the button text, close paths (no
// request, selection kept, focus back), the send (one request, pending
// marks, the plain toast, the refresh, the selection cleared), the failure
// toast with 重試 (same body), connection codes, the sending lock and the
// close when the selection empties. The server function is faked (AD-15).

const deleteCalls = vi.hoisted(() => ({
  sent: [] as Array<{ hashes: Array<string>; deleteFiles: boolean }>,
  answer: (): Promise<unknown> =>
    Promise.resolve({ ok: true, data: { items: [] } }),
}))
vi.mock('#/server/functions/delete-torrents', () => ({
  deleteTorrents: (options: {
    data: { hashes: Array<string>; deleteFiles: boolean }
  }) => {
    deleteCalls.sent.push(options.data)
    return deleteCalls.answer()
  },
}))

// The toast API as features see it (they never import the toast store).
const toastCalls = vi.hoisted(() => ({
  plain: vi.fn((_text: string) => {}),
  failure: vi.fn(
    (
      _text: string,
      _options: { keys: ReadonlyArray<string>; onRetry: () => void },
    ) => {},
  ),
  dismissFor: vi.fn((_key: string) => {}),
  setLift: vi.fn((_on: boolean) => {}),
}))
vi.mock('#/lib/toast', () => ({ toast: toastCalls }))

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean | undefined
}

const GB = 1024 ** 3
const A = fakeHash(1)
const B = fakeHash(2)
const C = fakeHash(3)

let torrents: Array<SlimTorrent>
let fetches = 0
let root: Root
let client: QueryClient
let main: HTMLElement

function baseTorrents(): Array<SlimTorrent> {
  return [
    t({ hash: A, name: 'Alpha.Show', size: 100 * GB }),
    // Non-private `missingFiles`: 已整理.
    t({
      hash: B,
      name: 'Beta.Show',
      size: 50 * GB,
      state: 'missingFiles',
      progress: 1,
      private: false,
    }),
    // Private `missingFiles`: 找不到檔案.
    t({
      hash: C,
      name: 'Gamma.Show',
      size: 20 * GB,
      state: 'missingFiles',
      progress: 1,
      private: true,
    }),
  ]
}

async function render(desktop = true) {
  client = createQueryClient({
    fetchMaindata: () => {
      fetches += 1
      return Promise.resolve(fakeResponse({ changed: torrents }))
    },
    currentPath: () => '/',
  })
  await client.prefetchQuery({ queryKey: MAINDATA_KEY })
  const host = document.createElement('div')
  document.body.append(host)
  root = createRoot(host)
  await act(async () =>
    root.render(
      <QueryClientProvider client={client}>
        <SelectionBar desktop={desktop} />
      </QueryClientProvider>,
    ),
  )
}

async function rerender(desktop: boolean) {
  await act(async () =>
    root.render(
      <QueryClientProvider client={client}>
        <SelectionBar desktop={desktop} />
      </QueryClientProvider>,
    ),
  )
}

const settle = () =>
  act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0))
  })

const dialog = () => document.querySelector<HTMLElement>('[role="alertdialog"]')
/** A button in the dialog (the bar has its own 取消). */
const buttonNamed = (name: string) =>
  [...(dialog()?.querySelectorAll('button') ?? [])].find(
    (each) =>
      each.textContent === name || each.getAttribute('aria-label') === name,
  ) as HTMLButtonElement
const barDelete = () =>
  document
    .querySelector('[data-selection-bar]')
    ?.querySelector<HTMLButtonElement>(
      'button[aria-haspopup="dialog"]',
    ) as HTMLButtonElement
const rows = () => [
  ...(dialog()?.querySelectorAll<HTMLElement>('[data-delete-row]') ?? []),
]
const rowTexts = () =>
  rows().map((row) => [...row.children].map((child) => child.textContent))
const checkbox = () =>
  dialog()?.querySelector<HTMLButtonElement>(
    'button[role="checkbox"]',
  ) as HTMLButtonElement
const primary = () => {
  const buttons = [...(dialog()?.querySelectorAll('button') ?? [])]
  return buttons[buttons.length - 1]
}
/** The gone notes (the always-mounted status line is not one). */
const notes = () =>
  [...(dialog()?.querySelectorAll('p:not([role="status"])') ?? [])].map(
    (p) => p.textContent,
  )
const lastFailure = () => toastCalls.failure.mock.lastCall

async function select(...hashes: Array<string>) {
  await act(async () => {
    for (const hash of hashes) toggleSelected(hash)
  })
}

async function openConfirm() {
  await act(async () => barDelete().click())
  await settle()
}

const press = (key: string) =>
  act(async () => {
    ;(document.activeElement ?? document.body).dispatchEvent(
      new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }),
    )
  })

beforeEach(() => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true
  notifyManager.setScheduler((callback) => callback())
  vi.stubGlobal('requestAnimationFrame', (callback: () => void) =>
    setTimeout(callback, 0),
  )
  vi.spyOn(window, 'matchMedia').mockImplementation(
    (query: string) =>
      ({
        matches: query.includes('reduce'),
        media: query,
        addEventListener: () => {},
        removeEventListener: () => {},
      }) as unknown as MediaQueryList,
  )
  // The expanded list's viewport (happy-dom has no layout).
  const isScroller = (element: HTMLElement) =>
    element.dataset.slot === 'delete-list-scroll'
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
      return isScroller(this) ? 320 : (height?.get?.call(this) as number)
    },
  )
  vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockImplementation(
    function (this: HTMLElement) {
      return isScroller(this) ? 460 : (width?.get?.call(this) as number)
    },
  )
  main = document.createElement('main')
  main.id = MAIN_ID
  main.tabIndex = -1
  document.body.append(main)
  torrents = baseTorrents()
  fetches = 0
  deleteCalls.sent = []
  deleteCalls.answer = () => Promise.resolve({ ok: true, data: { items: [] } })
  resetSelection()
  resetOrderFreeze()
  resetPendingOps()
  for (const fn of Object.values(toastCalls)) fn.mockClear()
  resetShortcuts()
})

afterEach(async () => {
  await act(async () => root.unmount())
  client.clear()
  document.body.replaceChildren()
  resetSelection()
  resetOrderFreeze()
  resetPendingOps()
  for (const fn of Object.values(toastCalls)) fn.mockClear()
  resetShortcuts()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
  vi.useRealTimers()
  notifyManager.setScheduler((callback) => setTimeout(callback, 0))
  globalThis.IS_REACT_ACT_ENVIRONMENT = false
})

describe('the list and the texts', () => {
  it('lists the selection in tick order with sizes, gone words and one note per kind', async () => {
    await render()
    await select(C, A, B)
    await openConfirm()
    expect(dialog()?.querySelector('h2')?.textContent).toBe('刪除 3 個種子？')
    expect(rowTexts()).toEqual([
      ['Gamma.Show', '找不到檔案'],
      ['Alpha.Show', '100 GB'],
      ['Beta.Show', '已整理'],
    ])
    // Names are plain text, one line with an ellipsis.
    const name = rows()[0].children[0] as HTMLElement
    expect(name.className).toContain('truncate')
    expect(name.className).toContain('font-semibold')
    expect((rows()[1].children[1] as HTMLElement).className).toContain(
      'tabular-nums',
    )
    expect((rows()[0].children[1] as HTMLElement).className).toContain(
      'text-text-muted',
    )
    expect(rows()[0].parentElement?.className).toContain('bg-surface-muted')
    expect(rows()[0].parentElement?.className).toContain('rounded-card')
    expect(notes()).toEqual([
      '其中 1 個找不到檔案，只會刪種子',
      '其中 1 個已整理，只會刪種子',
    ])
    expect(buttonNamed('還有 0 個')).toBeUndefined()
  })

  it('「連檔案一起刪」 is ticked by default and the button says what goes', async () => {
    await render()
    await select(A, B, C)
    await openConfirm()
    expect(checkbox().getAttribute('aria-checked')).toBe('true')
    expect(checkbox().closest('label')?.textContent).toBe('連檔案一起刪')
    expect(primary().textContent).toBe('刪除 3 個種子和檔案（100 GB）')
    expect(primary().className).toContain('bg-delete')
    await act(async () => checkbox().click())
    expect(checkbox().getAttribute('aria-checked')).toBe('false')
    expect(primary().textContent).toBe('只刪 3 個種子，檔案留著')
    expect(primary().className).toContain('bg-delete')
  })

  it('every file gone: 「刪除 2 個種子（檔案已經不在）」', async () => {
    await render()
    await select(B, C)
    await openConfirm()
    expect(primary().textContent).toBe('刪除 2 個種子（檔案已經不在）')
  })

  it('3,626 selected: 5 rows, then 「還有 3,621 個」 expands a virtualized list under 60 rows', async () => {
    torrents = Array.from({ length: 3626 }, (_, index) =>
      t({
        hash: fakeHash(0x1000 + index),
        name: `Show.${index}`,
        size: 6.25 * GB,
      }),
    )
    await render()
    await act(async () => {
      selectionStore.setState((state) => ({
        ...state,
        hashes: torrents.map((torrent) => torrent.hash),
      }))
    })
    await openConfirm()
    expect(dialog()?.querySelector('h2')?.textContent).toBe(
      '刪除 3,626 個種子？',
    )
    expect(primary().textContent).toBe('刪除 3,626 個種子和檔案（22.1 TB）')
    expect(rows()).toHaveLength(5)
    const more = buttonNamed('還有 3,621 個')
    expect(more.className).toContain('h-9')
    expect(more.className).toContain('font-semibold')
    await act(async () => more.click())
    await settle()
    const scroller = dialog()?.querySelector<HTMLElement>(
      '[data-slot="delete-list-scroll"]',
    ) as HTMLElement
    expect(scroller.style.maxHeight).toBe('320px')
    expect(scroller.className).toContain('overflow-y-auto')
    expect(document.activeElement).toBe(scroller)
    expect(rows().length).toBeGreaterThan(5)
    expect(rows().length).toBeLessThan(60)
    expect(rows()[0].textContent).toContain('Show.0')
    expect(rows()[0].getAttribute('aria-setsize')).toBe('3626')
  })
})

describe('closing without a delete', () => {
  it('cancel: no request, the selection stays, focus back on 刪除（含檔案）', async () => {
    await render()
    await select(A, B)
    await openConfirm()
    await act(async () => buttonNamed('取消').click())
    await settle()
    expect(dialog()).toBeNull()
    expect(deleteCalls.sent).toEqual([])
    expect(selectionStore.state.hashes).toEqual([A, B])
    expect(document.activeElement).toBe(barDelete())
  })

  it('Esc: the same', async () => {
    await render()
    await select(A)
    await openConfirm()
    await press('Escape')
    await settle()
    expect(dialog()).toBeNull()
    expect(deleteCalls.sent).toEqual([])
    expect(selectionStore.state.hashes).toEqual([A])
    expect(document.activeElement).toBe(barDelete())
  })

  it('phone: ✕ 「關閉，不刪」 and Esc (the dialog layer) close it, nothing sent, selection kept', async () => {
    await render(false)
    await select(A, C)
    await openConfirm()
    expect(dialog()?.dataset.slot).toBe('bottom-sheet')
    expect(buttonNamed('取消')).toBeUndefined()
    await act(async () => buttonNamed('關閉，不刪').click())
    await settle()
    expect(dialog()).toBeNull()
    expect(document.activeElement).toBe(barDelete())
    await openConfirm()
    await press('Escape')
    await settle()
    expect(dialog()).toBeNull()
    expect(deleteCalls.sent).toEqual([])
    expect(selectionStore.state.hashes).toEqual([A, C])
  })

  it('reopening starts ticked and folded again', async () => {
    torrents = Array.from({ length: 8 }, (_, index) =>
      t({ hash: fakeHash(0x50 + index), name: `S${index}` }),
    )
    await render()
    await select(...torrents.map((torrent) => torrent.hash))
    await openConfirm()
    await act(async () => checkbox().click())
    await act(async () => buttonNamed('還有 3 個').click())
    await act(async () => buttonNamed('取消').click())
    await settle()
    await openConfirm()
    expect(checkbox().getAttribute('aria-checked')).toBe('true')
    expect(buttonNamed('還有 3 個')).toBeDefined()
  })
})

describe('the delete', () => {
  it('success: one request in tick order, pending marks, the plain toast, the refresh, the selection cleared', async () => {
    await render()
    await select(C, A, B)
    await openConfirm()
    const before = fetches
    torrents = []
    await act(async () => primary().click())
    await settle()
    expect(deleteCalls.sent).toEqual([{ hashes: [C, A, B], deleteFiles: true }])
    expect(pendingOpOf(A)).toBe('delete')
    expect(pendingOpOf(C)).toBe('delete')
    expect(selectionStore.state.hashes).toEqual([])
    expect(dialog()).toBeNull()
    expect(toastCalls.plain).toHaveBeenCalledExactlyOnceWith(
      '已刪除 3 個種子和檔案（100 GB）',
    )
    expect(fetches).toBe(before + 1)
    // The bar slid out, so focus goes to the main area.
    expect(document.activeElement).toBe(main)
  })

  it('files unticked: deleteFiles false and 「已刪除 2 個種子，檔案留著」', async () => {
    await render()
    await select(A, B)
    await openConfirm()
    await act(async () => checkbox().click())
    await act(async () => primary().click())
    await settle()
    expect(deleteCalls.sent).toEqual([{ hashes: [A, B], deleteFiles: false }])
    expect(toastCalls.plain).toHaveBeenCalledExactlyOnceWith(
      '已刪除 2 個種子，檔案留著',
    )
  })

  it('sending: 刪除中…, pressing again sends nothing, Esc and cancel are ignored; 10 s later 「還在等 NAS 回應」', async () => {
    let finish: (value: unknown) => void = () => {}
    deleteCalls.answer = () =>
      new Promise((resolve) => {
        finish = resolve
      })
    await render()
    await select(A)
    await openConfirm()
    vi.useFakeTimers()
    try {
      await act(async () => primary().click())
      expect(primary().textContent).toBe('刪除中…')
      expect(checkbox().disabled).toBe(true)
      await act(async () => primary().click())
      expect(deleteCalls.sent).toHaveLength(1)
      await press('Escape')
      await act(async () => buttonNamed('取消').click())
      expect(dialog()).not.toBeNull()
      await act(async () => vi.advanceTimersByTime(10_000))
      expect(
        [...(dialog()?.querySelectorAll('p') ?? [])].some(
          (p) => p.textContent === STILL_WAITING_TEXT,
        ),
      ).toBe(true)
    } finally {
      vi.useRealTimers()
    }
    await act(async () => finish({ ok: true, data: { items: [] } }))
    await settle()
    expect(dialog()).toBeNull()
  })

  it('qbit_rejected: the failure toast with 重試, the dialog stays as it was, 重試 resends the same body', async () => {
    deleteCalls.answer = () =>
      Promise.resolve({
        ok: false,
        error: { code: 'qbit_rejected', message: 'x' },
      })
    torrents = Array.from({ length: 7 }, (_, index) =>
      t({ hash: fakeHash(0x70 + index), name: `R${index}` }),
    )
    const hashes = torrents.map((torrent) => torrent.hash)
    await render()
    await select(...hashes)
    await openConfirm()
    await act(async () => checkbox().click())
    await act(async () => buttonNamed('還有 2 個').click())
    await act(async () => primary().click())
    await settle()
    const failure = lastFailure()
    expect(failure?.[0]).toBe('刪除失敗：qBittorrent 拒絕這個操作')
    expect(failure?.[1].keys).toEqual(hashes)
    expect(dialog()).not.toBeNull()
    expect(checkbox().getAttribute('aria-checked')).toBe('false')
    expect(buttonNamed('還有 2 個')).toBeUndefined()
    expect(primary().textContent).toBe('只刪 7 個種子，檔案留著')
    expect(primary().hasAttribute('aria-disabled')).toBe(false)
    expect(pendingOpOf(hashes[0])).toBeNull()
    expect(selectionStore.state.hashes).toEqual(hashes)
    await act(async () => failure?.[1].onRetry())
    await settle()
    expect(deleteCalls.sent).toHaveLength(2)
    expect(deleteCalls.sent[1]).toEqual(deleteCalls.sent[0])
    expect(deleteCalls.sent[1]).toEqual({ hashes, deleteFiles: false })
  })

  it('a connection code: no toast, the dialog stays and the button can be pressed again', async () => {
    deleteCalls.answer = () =>
      Promise.resolve({
        ok: false,
        error: { code: 'home_unreachable', message: 'x' },
      })
    await render()
    await select(A)
    await openConfirm()
    await act(async () => primary().click())
    await settle()
    expect(toastCalls.failure).not.toHaveBeenCalled()
    expect(dialog()).not.toBeNull()
    expect(primary().textContent).toBe('刪除 1 個種子和檔案（100 GB）')
    deleteCalls.answer = () =>
      Promise.resolve({ ok: true, data: { items: [] } })
    await act(async () => primary().click())
    await settle()
    expect(deleteCalls.sent).toHaveLength(2)
    expect(dialog()).toBeNull()
  })
})

describe('review fixes', () => {
  it('toggling 「連檔案一起刪」 after a failure closes its 重試 toast, so the old choice is never resent', async () => {
    deleteCalls.answer = () =>
      Promise.resolve({
        ok: false,
        error: { code: 'qbit_rejected', message: 'x' },
      })
    await render()
    await select(A, B)
    await openConfirm()
    await act(async () => primary().click())
    await settle()
    expect(lastFailure()?.[1].keys).toEqual([A, B])
    toastCalls.dismissFor.mockClear()
    await act(async () => checkbox().click())
    // Every key of that toast is dismissed (the store closes it on the first).
    expect(toastCalls.dismissFor).toHaveBeenCalledWith(A)
    expect(toastCalls.dismissFor).toHaveBeenCalledWith(B)
    expect(deleteCalls.sent).toEqual([{ hashes: [A, B], deleteFiles: true }])
    // The next send carries what the screen shows.
    await act(async () => primary().click())
    await settle()
    expect(deleteCalls.sent.at(-1)).toEqual({
      hashes: [A, B],
      deleteFiles: false,
    })
  })

  it('Esc or 取消 in the same tick as the press never closes the dialog', async () => {
    let finish: (value: unknown) => void = () => {}
    deleteCalls.answer = () =>
      new Promise((resolve) => {
        finish = resolve
      })
    await render()
    await select(A)
    await openConfirm()
    const cancel = buttonNamed('取消')
    await act(async () => {
      primary().click()
      cancel.click()
      document.dispatchEvent(
        new KeyboardEvent('keydown', {
          key: 'Escape',
          bubbles: true,
          cancelable: true,
        }),
      )
    })
    await settle()
    expect(dialog()).not.toBeNull()
    expect(primary().textContent).toBe('刪除中…')
    await act(async () => finish({ ok: true, data: { items: [] } }))
    await settle()
    expect(dialog()).toBeNull()
  })

  it('a failure refreshes maindata (a timeout may still have deleted them)', async () => {
    deleteCalls.answer = () =>
      Promise.resolve({ ok: false, error: { code: 'timeout', message: 'x' } })
    await render()
    await select(A)
    await openConfirm()
    const before = fetches
    await act(async () => primary().click())
    await settle()
    expect(fetches).toBe(before + 1)
    expect(lastFailure()?.[0]).toMatch(/^刪除失敗：/)
  })

  it('both lists keep the list role (list-none drops it in WebKit); 「還有」 is a one-way reveal', async () => {
    torrents = Array.from({ length: 7 }, (_, index) =>
      t({ hash: fakeHash(0x90 + index), name: `L${index}` }),
    )
    await render()
    await select(...torrents.map((torrent) => torrent.hash))
    await openConfirm()
    expect(rows()[0].parentElement?.getAttribute('role')).toBe('list')
    const more = buttonNamed('還有 2 個')
    expect(more.hasAttribute('aria-expanded')).toBe(false)
    await act(async () => more.click())
    await settle()
    expect(rows()[0].parentElement?.getAttribute('role')).toBe('list')
  })

  it('every file already gone: deleteFiles false whatever the checkbox says; a mixed selection follows it', async () => {
    await render()
    await select(B, C)
    await openConfirm()
    expect(checkbox().getAttribute('aria-checked')).toBe('true')
    expect(primary().textContent).toBe('刪除 2 個種子（檔案已經不在）')
    await act(async () => primary().click())
    await settle()
    expect(deleteCalls.sent).toEqual([{ hashes: [B, C], deleteFiles: false }])
    expect(toastCalls.plain).toHaveBeenLastCalledWith('已刪除 2 個種子')

    torrents = baseTorrents()
    await act(async () => {
      await client.refetchQueries({ queryKey: MAINDATA_KEY })
    })
    await select(A, C)
    await openConfirm()
    await act(async () => primary().click())
    await settle()
    expect(deleteCalls.sent.at(-1)).toEqual({
      hashes: [A, C],
      deleteFiles: true,
    })
    await select(A, B)
    await openConfirm()
    await act(async () => checkbox().click())
    await act(async () => primary().click())
    await settle()
    expect(deleteCalls.sent.at(-1)).toEqual({
      hashes: [A, B],
      deleteFiles: false,
    })
  })

  it('closing without a delete, or opening again, closes the failure toast (its 重試 never skips the dialog)', async () => {
    deleteCalls.answer = () =>
      Promise.resolve({
        ok: false,
        error: { code: 'qbit_rejected', message: 'x' },
      })
    await render()
    await select(A, B)
    await openConfirm()
    await act(async () => primary().click())
    await settle()
    toastCalls.dismissFor.mockClear()
    await act(async () => buttonNamed('取消').click())
    await settle()
    expect(dialog()).toBeNull()
    expect(toastCalls.dismissFor).toHaveBeenCalledWith(A)
    expect(toastCalls.dismissFor).toHaveBeenCalledWith(B)
    toastCalls.dismissFor.mockClear()
    await openConfirm()
    expect(toastCalls.dismissFor).toHaveBeenCalledWith(A)
    expect(toastCalls.dismissFor).toHaveBeenCalledWith(B)
  })

  it('a double press in the same tick sends one delete', async () => {
    await render()
    await select(A)
    await openConfirm()
    await act(async () => {
      primary().click()
      primary().click()
    })
    await settle()
    expect(deleteCalls.sent).toHaveLength(1)
    expect(toastCalls.plain).toHaveBeenCalledTimes(1)
  })

  it('a late 重試 that succeeds after a new selection leaves that selection alone and never locks its dialog', async () => {
    deleteCalls.answer = () =>
      Promise.resolve({
        ok: false,
        error: { code: 'qbit_rejected', message: 'x' },
      })
    await render()
    await select(A)
    await openConfirm()
    await act(async () => primary().click())
    await settle()
    const retry = lastFailure()?.[1].onRetry
    await act(async () => buttonNamed('取消').click())
    await settle()
    // Alex unticks A and picks other torrents, then opens their confirm.
    await select(A, B, C)
    expect(selectionStore.state.hashes).toEqual([B, C])
    await openConfirm()
    let finish: (value: unknown) => void = () => {}
    deleteCalls.answer = () =>
      new Promise((resolve) => {
        finish = resolve
      })
    await act(async () => retry?.())
    expect(deleteCalls.sent.at(-1)).toEqual({ hashes: [A], deleteFiles: true })
    // The retry is about A only: this dialog is not sending.
    expect(primary().textContent).toBe('刪除 2 個種子（檔案已經不在）')
    expect(primary().hasAttribute('aria-disabled')).toBe(false)
    await act(async () => finish({ ok: true, data: { items: [] } }))
    await settle()
    expect(selectionStore.state.hashes).toEqual([B, C])
    expect(dialog()).not.toBeNull()
  })

  it('a poll that empties the selection mid-send keeps the locked dialog until the answer', async () => {
    let finish: (value: unknown) => void = () => {}
    deleteCalls.answer = () =>
      new Promise((resolve) => {
        finish = resolve
      })
    await render()
    await select(A, B)
    await openConfirm()
    await act(async () => primary().click())
    await act(async () => pruneSelection(() => false))
    await settle()
    expect(dialog()).not.toBeNull()
    expect(primary().textContent).toBe('刪除中…')
    await act(async () => finish({ ok: true, data: { items: [] } }))
    await settle()
    expect(dialog()).toBeNull()
  })

  it('selected hashes maindata does not have yet: nothing to send, the primary does nothing', async () => {
    await render()
    await select(fakeHash(0x99))
    await openConfirm()
    expect(dialog()?.querySelector('h2')?.textContent).toBe('刪除 0 個種子？')
    expect(primary().getAttribute('aria-disabled')).toBe('true')
    await act(async () => primary().click())
    await settle()
    expect(deleteCalls.sent).toEqual([])
  })

  it('the list shrinking to 5 while expanded folds it, focus goes to the list, a regrow does not expand it again', async () => {
    torrents = Array.from({ length: 8 }, (_, index) =>
      t({ hash: fakeHash(0x60 + index), name: `F${index}` }),
    )
    const hashes = torrents.map((torrent) => torrent.hash)
    await render()
    await select(...hashes)
    await openConfirm()
    await act(async () => buttonNamed('還有 3 個').click())
    await settle()
    const scroller = dialog()?.querySelector(
      '[data-slot="delete-list-scroll"]',
    ) as HTMLElement
    expect(scroller.getAttribute('role')).toBe('group')
    expect(document.activeElement).toBe(scroller)
    const kept = new Set(hashes.slice(0, 5))
    await act(async () => pruneSelection((hash) => kept.has(hash)))
    await settle()
    expect(
      dialog()?.querySelector('[data-slot="delete-list-scroll"]'),
    ).toBeNull()
    expect(rows()).toHaveLength(5)
    expect(document.activeElement).toBe(rows()[0].parentElement)
    await select(...hashes.slice(5))
    await settle()
    expect(buttonNamed('還有 3 個')).toBeDefined()
    expect(
      dialog()?.querySelector('[data-slot="delete-list-scroll"]'),
    ).toBeNull()
  })

  it('phone: Esc while a delete is pending keeps the sheet open; it closes when the send finishes', async () => {
    let finish: (value: unknown) => void = () => {}
    deleteCalls.answer = () =>
      new Promise((resolve) => {
        finish = resolve
      })
    await render(false)
    await select(A)
    await openConfirm()
    await act(async () => primary().click())
    await press('Escape')
    await settle()
    expect(dialog()?.dataset.state).toBe('open')
    await act(async () => finish({ ok: true, data: { items: [] } }))
    await settle()
    expect(dialog()).toBeNull()
  })

  it('phone with motion: the closing sheet still shows the title, rows and button from before the delete', async () => {
    vi.mocked(window.matchMedia).mockImplementation(
      (query: string) =>
        ({
          matches: false,
          media: query,
          addEventListener: () => {},
          removeEventListener: () => {},
        }) as unknown as MediaQueryList,
    )
    // The sheet slides by its own height (happy-dom has no layout).
    vi.spyOn(HTMLElement.prototype, 'offsetHeight', 'get').mockImplementation(
      function (this: HTMLElement) {
        if (this.dataset.slot === 'bottom-sheet') return 800
        return this.parentElement?.dataset.slot === 'bottom-sheet-content'
          ? 300
          : 0
      },
    )
    // The slide never finishes, so the closing sheet stays for the check.
    Object.defineProperty(HTMLElement.prototype, 'animate', {
      configurable: true,
      value: () =>
        ({ onfinish: null, cancel: vi.fn() }) as unknown as Animation,
    })
    try {
      await render(false)
      await select(A, C)
      await openConfirm()
      await act(async () => primary().click())
      await settle()
      expect(selectionStore.state.hashes).toEqual([])
      const sheet = dialog() as HTMLElement
      expect(sheet.dataset.state).toBe('closing')
      expect(sheet.querySelector('h2')?.textContent).toBe('刪除 2 個種子？')
      expect(rowTexts()).toEqual([
        ['Alpha.Show', '100 GB'],
        ['Gamma.Show', '找不到檔案'],
      ])
      expect(primary().textContent).toBe('刪除 2 個種子和檔案（100 GB）')
    } finally {
      Reflect.deleteProperty(HTMLElement.prototype, 'animate')
    }
  })

  it('a moving torrent that was missingFiles before the move adds nothing to the size (4.1 deferred)', async () => {
    const MOVING = fakeHash(0x77)
    torrents = [
      ...baseTorrents(),
      t({
        hash: MOVING,
        name: 'Moving.Show',
        size: 30 * GB,
        state: 'missingFiles',
        progress: 1,
        private: true,
      }),
    ]
    await render()
    // The next maindata shows it moving; the merge remembers missingFiles.
    torrents = torrents.map((torrent) =>
      torrent.hash === MOVING ? { ...torrent, state: 'moving' } : torrent,
    )
    await act(async () => {
      await client.refetchQueries({ queryKey: MAINDATA_KEY })
    })
    await select(A, MOVING)
    await openConfirm()
    expect(rowTexts()).toEqual([
      ['Alpha.Show', '100 GB'],
      ['Moving.Show', '找不到檔案'],
    ])
    expect(primary().textContent).toBe('刪除 2 個種子和檔案（100 GB）')
  })
})

describe('while open', () => {
  it('the list and the count follow the selection; it closes when nothing is left', async () => {
    await render()
    await select(A, B, C)
    await openConfirm()
    await act(async () => pruneSelection((hash) => hash !== B))
    expect(dialog()?.querySelector('h2')?.textContent).toBe('刪除 2 個種子？')
    expect(rowTexts().map((row) => row[0])).toEqual([
      'Alpha.Show',
      'Gamma.Show',
    ])
    // Another device deleted the rest.
    await act(async () => pruneSelection(() => false))
    await settle()
    expect(dialog()).toBeNull()
    expect(deleteCalls.sent).toEqual([])
  })

  it('crossing 1024px swaps the dialog for the sheet and keeps it open', async () => {
    await render()
    await select(A)
    await openConfirm()
    expect(dialog()?.dataset.slot).toBe('dialog-content')
    await rerender(false)
    await settle()
    expect(dialog()?.dataset.slot).toBe('bottom-sheet')
  })
})
