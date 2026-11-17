// @vitest-environment happy-dom
import { act, useCallback, useState } from 'react'
import type { ReactNode } from 'react'
import { createRoot } from 'react-dom/client'
import type { Root } from 'react-dom/client'
import { QueryClientProvider, notifyManager } from '@tanstack/react-query'
import type { QueryClient } from '@tanstack/react-query'
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  onTestFinished,
  vi,
} from 'vitest'
import { fakeHash, fakeResponse, t } from '#/lib/testing'
import type { SlimTorrent } from '#/shared/maindata'
import type { TorrentFile } from '#/shared/torrent-files'
import { MAIN_ID } from '#/shared/ui/main-scroll'
import { clearConnectionErrors } from '#/state/connection'
import { clearLoginRequired } from '#/state/login-required'
import { MAINDATA_KEY } from '#/state/maindata'
import { clearMaindataFailure } from '#/state/maindata-failure'
import { resetOrderFreeze } from '#/state/order-freeze'
import { resetPendingOps } from '#/state/pending-ops'
import { createQueryClient } from '#/state/query-client'
import { resetShortcuts } from '#/state/shortcuts'
import { clearShownList, publishShownList } from '#/state/shown-order'
import { ViewedHashContext } from '#/state/viewed-hash'
import { BoardDetailPanel } from '#/features/detail/board-detail-panel'
import { ListDetailPanel } from '#/features/detail/list-detail-panel'
import { BoardDetailSheet } from '#/features/detail/phone-detail-sheet'

// Spec 2.7: the 檔案 tab in a DOM (happy-dom): the tab keyboard and its
// lifetime, the load states (L1), ticks and priorities (R1 to R3), the row
// lock (P1), failures with 重試 (F1), virtualisation (V1) and polling
// lifetime (Q1). Real layout, clicks and screenshots are in e2e/files.spec.ts.

// No server here: each test sets the answers.
const fileCalls = vi.hoisted(() => ({
  hashes: [] as Array<string>,
  answer: (_hash: string): Promise<unknown> =>
    Promise.resolve({ ok: true, data: [] }),
}))
vi.mock('#/server/functions/get-files', () => ({
  getFiles: (options: { data: { hash: string } }) => {
    fileCalls.hashes.push(options.data.hash)
    return fileCalls.answer(options.data.hash)
  },
}))
const prioCalls = vi.hoisted(() => ({
  sent: [] as Array<{ hash: string; ids: Array<number>; priority: number }>,
  answer: (): Promise<unknown> => Promise.resolve({ ok: true, data: null }),
}))
vi.mock('#/server/functions/set-file-priority', () => ({
  setFilePriority: (options: {
    data: { hash: string; ids: Array<number>; priority: number }
  }) => {
    prioCalls.sent.push(options.data)
    return prioCalls.answer()
  },
}))
const detailCalls = vi.hoisted(() => ({ count: 0 }))
vi.mock('#/server/functions/get-torrent-detail', () => ({
  getTorrentDetail: () => {
    detailCalls.count += 1
    return Promise.resolve({
      ok: true,
      data: {
        detail: { downloaded: 0, uploaded: 0, num_seeds: 0, num_leechs: 0 },
      },
    })
  },
}))
vi.mock('#/server/functions/stop-torrents', () => ({
  stopTorrents: () => Promise.resolve({ ok: true, data: { items: [] } }),
}))
vi.mock('#/server/functions/start-torrents', () => ({
  startTorrents: () => Promise.resolve({ ok: true, data: { items: [] } }),
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

const VIEWPORT = 800
const h = (n: number) => fakeHash(0x700 + n)

function torrents(): Array<SlimTorrent> {
  return [
    t({ hash: h(1), name: 'Down1', added_on: 10, category: '' }),
    t({ hash: h(2), name: 'Down2', added_on: 5 }),
    t({ hash: h(3), name: 'Meta', added_on: 3, state: 'metaDL', progress: 0 }),
  ]
}

const file = (
  index: number,
  priority = 1,
  name = `Fake.Show/Fake.Show.E${String(index + 1).padStart(2, '0')}.mkv`,
): TorrentFile => ({
  index,
  name,
  size: 1.2 * 1024 ** 3,
  progress: 0.42,
  priority,
})

/** Files by hash; tests replace entries. */
let files: Record<string, Array<TorrentFile>>
let main: HTMLElement
let root: Root
let client: QueryClient
let hashNow: string | null
let writeHash: (next: string | null) => void = () => {}

function Url({
  initial,
  children,
}: {
  initial: string | null
  children: ReactNode
}) {
  const [hash, setHashState] = useState(initial)
  hashNow = hash
  const setHash = useCallback((next: string | null) => setHashState(next), [])
  writeHash = setHash
  return (
    <ViewedHashContext value={{ hash, setHash }}>{children}</ViewedHashContext>
  )
}

async function render(ui: ReactNode, hash: string | null = null) {
  client = createQueryClient({
    fetchMaindata: () => Promise.resolve(fakeResponse({ changed: torrents() })),
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

/** The list panel showing `viewed`, switched to 檔案, first answer in. */
async function listPanelFiles(viewed = h(1)) {
  await render(<ListDetailPanel />)
  await act(async () => publishShownList({ order: [h(1), h(2), h(3)], viewed }))
  await act(async () => tab('檔案').click())
  await settle()
}

const q = <T extends Element = HTMLElement>(selector: string) =>
  document.querySelector<T>(selector)
const tab = (name: string) =>
  [...document.querySelectorAll<HTMLButtonElement>('[role="tab"]')].find(
    (button) => button.textContent === name,
  ) as HTMLButtonElement
const panel = () => q('[role="tabpanel"]') as HTMLElement
const rows = () => [
  ...document.querySelectorAll<HTMLElement>(
    '[aria-label="檔案清單"] [role="listitem"]',
  ),
]
const checkbox = (name: string) =>
  q<HTMLButtonElement>(
    `button[role="checkbox"][aria-label="下載這個檔案：${name}"]`,
  ) as HTMLButtonElement
const prio = (name: string) =>
  [...document.querySelectorAll<HTMLButtonElement>('button')].find(
    (button) =>
      button.getAttribute('aria-label')?.startsWith('優先順序：') &&
      button.getAttribute('aria-label')?.endsWith(`，${name}`),
  ) as HTMLButtonElement
const menu = () => q('[role="menu"]')
const E01 = file(0).name
const E02 = file(1).name

async function settle() {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0))
  })
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0))
  })
}

async function openMenu(name: string) {
  await act(async () => {
    prio(name).dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }),
    )
  })
  expect(menu()).not.toBeNull()
}

async function choose(word: string) {
  const item = [
    ...document.querySelectorAll<HTMLElement>('[role="menuitemradio"]'),
  ].find((element) => element.textContent === word) as HTMLElement
  await act(async () => item.click())
  await settle()
}

function key(target: Element, name: string) {
  return act(async () => {
    target.dispatchEvent(
      new KeyboardEvent('keydown', {
        key: name,
        bubbles: true,
        cancelable: true,
      }),
    )
  })
}

beforeEach(() => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true
  notifyManager.setScheduler((callback) => callback())
  files = {
    [h(1)]: [file(0), file(1, 0), file(2, 6)],
    [h(2)]: [file(0, 7, 'Other/Other.E01.mkv')],
  }
  fileCalls.hashes = []
  fileCalls.answer = (hash) =>
    Promise.resolve({ ok: true, data: files[hash] ?? [] })
  prioCalls.sent = []
  prioCalls.answer = () => Promise.resolve({ ok: true, data: null })
  toastCalls.failure.mockClear()
  toastCalls.dismissFor.mockClear()
  resetPendingOps()
  vi.spyOn(window, 'matchMedia').mockImplementation(
    (query: string) =>
      ({
        matches: query.includes('reduce'),
        media: query,
        addEventListener: () => {},
        removeEventListener: () => {},
      }) as unknown as MediaQueryList,
  )
  // The virtualizer reads its scroller's viewport (the panel on desktop,
  // the sheet's content on the phone) from clientHeight and clientWidth.
  const isScroller = (element: HTMLElement) =>
    element.getAttribute('role') === 'tabpanel' ||
    element.dataset.slot === 'bottom-sheet-content'
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
      return isScroller(this) ? VIEWPORT : (height?.get?.call(this) as number)
    },
  )
  vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockImplementation(
    function (this: HTMLElement) {
      return isScroller(this) ? 400 : (width?.get?.call(this) as number)
    },
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
  resetPendingOps()
  vi.restoreAllMocks()
  notifyManager.setScheduler((callback) => setTimeout(callback, 0))
  globalThis.IS_REACT_ACT_ENVIRONMENT = false
})

describe('the tabs', () => {
  it('檔案 is enabled; ← → Home End move and select with a roving tabIndex', async () => {
    await render(<ListDetailPanel />)
    await act(async () =>
      publishShownList({ order: [h(1), h(2)], viewed: h(1) }),
    )
    const tablist = q('[role="tablist"]') as HTMLElement
    tab('概覽').focus()
    await key(tab('概覽'), 'ArrowRight')
    expect(tab('檔案').getAttribute('aria-selected')).toBe('true')
    expect(document.activeElement).toBe(tab('檔案'))
    expect([tab('概覽').tabIndex, tab('檔案').tabIndex]).toEqual([-1, 0])
    expect(tab('檔案').className).toContain('bg-primary')
    expect(panel().getAttribute('aria-labelledby')).toBe(tab('檔案').id)
    await key(tablist, 'ArrowRight')
    expect(document.activeElement).toBe(tab('概覽'))
    await key(tablist, 'ArrowLeft')
    expect(document.activeElement).toBe(tab('檔案'))
    await key(tablist, 'Home')
    expect(tab('概覽').getAttribute('aria-selected')).toBe('true')
    await key(tablist, 'End')
    expect(tab('檔案').getAttribute('aria-selected')).toBe('true')
    await settle()
    expect(rows()).toHaveLength(3)
  })

  it('the tab stays across ‹ ›; the new torrent loads under its own key', async () => {
    await listPanelFiles()
    expect(checkbox(E01)).not.toBeNull()
    await act(async () =>
      (q('button[aria-label="下一個"]') as HTMLButtonElement).dispatchEvent(
        new MouseEvent('click', { bubbles: true }),
      ),
    )
    // The list panel follows the published list; publish the move.
    await act(async () =>
      publishShownList({ order: [h(1), h(2), h(3)], viewed: h(2) }),
    )
    await settle()
    expect(tab('檔案').getAttribute('aria-selected')).toBe('true')
    expect(checkbox('Other/Other.E01.mkv')).not.toBeNull()
    expect(checkbox(E01)).toBeNull()
    expect(fileCalls.hashes).toContain(h(2))
  })

  it.each([
    [
      'board panel (✕)',
      () => render(<BoardDetailPanel />, h(1)),
      () =>
        act(async () =>
          (q('button[aria-label="關閉"]') as HTMLButtonElement).click(),
        ),
      () => act(async () => writeHash(h(1))),
    ],
    [
      'phone sheet (hash removed)',
      () => render(<BoardDetailSheet />, h(1)),
      () => act(async () => writeHash(null)),
      () => act(async () => writeHash(h(1))),
    ],
    [
      'list panel (viewed becomes null)',
      async () => {
        await render(<ListDetailPanel />)
        await act(async () =>
          publishShownList({ order: [h(1), h(2)], viewed: h(1) }),
        )
      },
      () =>
        act(async () =>
          publishShownList({ order: [h(1), h(2)], viewed: null }),
        ),
      () =>
        act(async () =>
          publishShownList({ order: [h(1), h(2)], viewed: h(1) }),
        ),
    ],
  ])(
    '%s: a closed detail opens again on 概覽',
    async (_name, open, close, reopen) => {
      await open()
      await act(async () => tab('檔案').click())
      await settle()
      expect(rows()).toHaveLength(3)
      await close()
      expect(rows()).toHaveLength(0)
      await reopen()
      await settle()
      expect(tab('概覽').getAttribute('aria-selected')).toBe('true')
      expect(rows()).toHaveLength(0)
    },
  )

  it('the phone sheet keeps 檔案 while it slides out after closing', async () => {
    // Motion on, and a slide that never finishes: the sheet stays closing.
    vi.mocked(window.matchMedia).mockImplementation(
      (query: string) =>
        ({
          matches: false,
          media: query,
          addEventListener: () => {},
          removeEventListener: () => {},
        }) as unknown as MediaQueryList,
    )
    Object.defineProperty(HTMLElement.prototype, 'animate', {
      configurable: true,
      value: () =>
        ({ onfinish: null, cancel: () => {} }) as unknown as Animation,
    })
    // The sheet slides by its own height (like bottom-sheet.dom.test.tsx).
    const offset = Object.getOwnPropertyDescriptor(
      HTMLElement.prototype,
      'offsetHeight',
    )
    vi.spyOn(HTMLElement.prototype, 'offsetHeight', 'get').mockImplementation(
      function (this: HTMLElement) {
        return this.getAttribute('role') === 'dialog'
          ? VIEWPORT
          : (offset?.get?.call(this) as number)
      },
    )
    onTestFinished(() => {
      Reflect.deleteProperty(HTMLElement.prototype, 'animate')
    })
    await render(<BoardDetailSheet />, h(1))
    await act(async () => tab('檔案').click())
    await settle()
    expect(rows()).toHaveLength(3)
    const detailsBefore = detailCalls.count
    await act(async () =>
      (q('button[aria-label="關閉"]') as HTMLButtonElement).click(),
    )
    await settle()
    expect(hashNow).toBeNull()
    const dialog = q('[role="dialog"]') as HTMLElement
    expect(dialog.dataset.state).toBe('closing')
    expect(tab('檔案').getAttribute('aria-selected')).toBe('true')
    expect(rows()).toHaveLength(3)
    // The overview never came back, so it fetched nothing.
    expect(detailCalls.count).toBe(detailsBefore)
  })
})

describe('L1 load states', () => {
  it('first load: 5 skeleton rows; then the list', async () => {
    let finish: (value: unknown) => void = () => {}
    fileCalls.answer = () =>
      new Promise((resolve) => {
        finish = resolve
      })
    await listPanelFiles()
    const busy = q('[aria-busy="true"][aria-label="檔案清單"]') as HTMLElement
    expect(busy).not.toBeNull()
    expect(busy.children).toHaveLength(5)
    expect(
      (busy.children[0] as HTMLElement).style.height,
      'a skeleton row is a file row tall',
    ).toBe('66px')
    expect(busy.querySelectorAll('[data-slot="skeleton"]').length).toBe(20)
    await act(async () => finish({ ok: true, data: files[h(1)] }))
    await settle()
    expect(q('[aria-busy="true"]')).toBeNull()
    expect(rows()).toHaveLength(3)
  })

  it('first load failed: 讀不到檔案清單 and 重試, which fetches at once', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    fileCalls.answer = () =>
      Promise.resolve({
        ok: false,
        error: { code: 'qbit_rejected', message: 'x' },
      })
    await listPanelFiles()
    expect(q('[role="alert"]')?.textContent).toBe('讀不到檔案清單')
    const calls = fileCalls.hashes.length
    fileCalls.answer = (hash) =>
      Promise.resolve({ ok: true, data: files[hash] })
    const retry = [...document.querySelectorAll('button')].find(
      (button) => button.textContent === '重試',
    ) as HTMLButtonElement
    await act(async () => retry.click())
    await settle()
    expect(fileCalls.hashes.length).toBe(calls + 1)
    expect(rows()).toHaveLength(3)
  })

  it('a poll failure with data keeps the old list', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    await listPanelFiles()
    fileCalls.answer = () =>
      Promise.resolve({
        ok: false,
        error: { code: 'timeout', message: 'x' },
      })
    await act(async () => {
      await client.refetchQueries({ queryKey: ['files', h(1)] })
    })
    expect(rows()).toHaveLength(3)
    expect(q('[role="alert"]')).toBeNull()
  })

  it('a torrent still fetching its metadata: the wait text and no request', async () => {
    await listPanelFiles(h(3))
    expect(panel().textContent).toBe('還在抓種子資訊，檔案清單等一下才有')
    expect(fileCalls.hashes).not.toContain(h(3))
  })

  it('0 files: an empty list, no text', async () => {
    files[h(1)] = []
    await listPanelFiles()
    expect(q('[role="list"][aria-label="檔案清單"]')).not.toBeNull()
    expect(rows()).toHaveLength(0)
    expect(panel().textContent).toBe('')
  })
})

describe('rows', () => {
  it('name, 「<size> · <percent>」, checkbox and pill; unticked rows muted', async () => {
    await listPanelFiles()
    const [first, second] = rows()
    expect(first.textContent).toContain(E01)
    expect(first.textContent).toContain('1.2 GB · 42%')
    expect(checkbox(E01).getAttribute('aria-checked')).toBe('true')
    expect(checkbox(E02).getAttribute('aria-checked')).toBe('false')
    const name = first.querySelector(`[title="${E01}"]`) as HTMLElement
    expect(name.className).toContain('truncate')
    expect(name.className).not.toContain('text-text-muted')
    expect(
      (second.querySelector(`[title="${E02}"]`) as HTMLElement).className,
    ).toContain('text-text-muted')
    expect(prio(E01).textContent).toBe('一般')
    expect(prio(file(2).name).textContent).toBe('高')
    expect(prio(E01).getAttribute('aria-label')).toBe(`優先順序：一般，${E01}`)
  })

  it('R3 an unticked row: the pill reads 不下載 and is disabled', async () => {
    await listPanelFiles()
    expect(prio(E02).textContent).toBe('不下載')
    expect(prio(E02).disabled).toBe(true)
    expect(prio(E02).getAttribute('aria-label')).toBe(
      `優先順序：不下載，${E02}`,
    )
  })

  it('names with markup stay plain text', async () => {
    files[h(1)] = [file(0, 1, '<img src=x onerror=alert(1)>.mkv')]
    await listPanelFiles()
    expect(q('img')).toBeNull()
    expect(rows()[0].textContent).toContain('<img src=x onerror=alert(1)>.mkv')
  })
})

describe('changes', () => {
  it('R1 untick sends 0, no toast, the row follows the refetch; tick sends 1', async () => {
    await listPanelFiles()
    const before = fileCalls.hashes.length
    files[h(1)] = [file(0, 0), file(1, 0), file(2, 6)]
    await act(async () => checkbox(E01).click())
    await settle()
    expect(prioCalls.sent).toEqual([{ hash: h(1), ids: [0], priority: 0 }])
    expect(fileCalls.hashes.length).toBe(before + 1)
    expect(toastCalls.failure).not.toHaveBeenCalled()
    expect(checkbox(E01).getAttribute('aria-checked')).toBe('false')
    expect(prio(E01).textContent).toBe('不下載')

    files[h(1)] = [file(0, 1), file(1, 0), file(2, 6)]
    await act(async () => checkbox(E01).click())
    await settle()
    expect(prioCalls.sent.at(-1)).toEqual({ hash: h(1), ids: [0], priority: 1 })
    expect(checkbox(E01).getAttribute('aria-checked')).toBe('true')
  })

  it('R2 高 on a 一般 row sends 6; 一般 on a 一般 row sends nothing', async () => {
    await listPanelFiles()
    await openMenu(E01)
    const items = [
      ...document.querySelectorAll<HTMLElement>('[role="menuitemradio"]'),
    ]
    expect(items.map((item) => item.textContent)).toEqual([
      '一般',
      '高',
      '最高',
    ])
    expect(items[0].getAttribute('aria-checked')).toBe('true')
    await choose('一般')
    expect(prioCalls.sent).toEqual([])
    await openMenu(E01)
    await choose('高')
    expect(prioCalls.sent).toEqual([{ hash: h(1), ids: [0], priority: 6 }])
    // The menu stays closed once the row unlocks (it must not reopen).
    expect(menu()).toBeNull()
    expect(prio(E01).disabled).toBe(false)
    await openMenu(E01)
    await choose('最高')
    expect(prioCalls.sent.at(-1)?.priority).toBe(7)
  })

  it('P1 the row locks until the refetch after the call settles; other rows stay usable', async () => {
    await listPanelFiles()
    let finish: (value: unknown) => void = () => {}
    fileCalls.answer = () =>
      new Promise((resolve) => {
        finish = resolve
      })
    await act(async () => checkbox(E01).click())
    await settle()
    expect(prioCalls.sent).toHaveLength(1)
    expect(checkbox(E01).disabled).toBe(true)
    expect(prio(E01).disabled).toBe(true)
    expect(checkbox(E02).disabled).toBe(false)
    expect(prio(file(2).name).disabled).toBe(false)
    await act(async () => finish({ ok: true, data: files[h(1)] }))
    await settle()
    expect(checkbox(E01).disabled).toBe(false)
    expect(prio(E01).disabled).toBe(false)
  })

  it("P1 a call held open on one torrent never locks another torrent's same file", async () => {
    await listPanelFiles()
    prioCalls.answer = () => new Promise(() => {})
    await act(async () => checkbox(E01).click())
    await settle()
    expect(checkbox(E01).disabled).toBe(true)
    await act(async () =>
      publishShownList({ order: [h(1), h(2), h(3)], viewed: h(2) }),
    )
    await settle()
    const other = checkbox('Other/Other.E01.mkv')
    expect(other).not.toBeNull()
    expect(other.disabled).toBe(false)
    expect(prio('Other/Other.E01.mkv').disabled).toBe(false)
  })

  it('a settled call leaves no observer behind: the cache collects it', async () => {
    await listPanelFiles()
    client.setMutationDefaults(['set-file-priority'], { gcTime: 0 })
    await act(async () => checkbox(E01).click())
    await settle()
    expect(prioCalls.sent).toHaveLength(1)
    await settle()
    expect(
      client.getMutationCache().findAll({ mutationKey: ['set-file-priority'] }),
    ).toEqual([])
  })

  it.each([
    ['qbit_rejected', '改檔案設定失敗：qBittorrent 拒絕這個操作'],
    ['timeout', '改檔案設定失敗：qBittorrent 沒有回應，請再試一次'],
    ['invalid_input', '改檔案設定失敗：送出的資料格式不對'],
  ])(
    'F1 %s: a failure toast with 重試; the row is usable again; 重試 resends',
    async (code, text) => {
      await listPanelFiles()
      prioCalls.answer = () =>
        Promise.resolve({ ok: false, error: { code, message: 'x' } })
      await act(async () => checkbox(E01).click())
      await settle()
      expect(toastCalls.failure).toHaveBeenCalledOnce()
      const [shown, { onRetry }] = toastCalls.failure.mock.calls[0] as [
        string,
        { onRetry: () => void },
      ]
      expect(shown).toBe(text)
      expect(toastCalls.failure.mock.calls[0][1].keys).toEqual([
        `file:${h(1)}:0`,
      ])
      expect(checkbox(E01).disabled).toBe(false)
      // 重試 works even after the detail closed.
      await act(async () => root.unmount())
      prioCalls.answer = () => Promise.resolve({ ok: true, data: null })
      await act(async () => onRetry())
      await settle()
      expect(prioCalls.sent).toEqual([
        { hash: h(1), ids: [0], priority: 0 },
        { hash: h(1), ids: [0], priority: 0 },
      ])
      expect(toastCalls.failure).toHaveBeenCalledOnce()
    },
  )

  it.each(['home_unreachable', 'not_logged_in', 'bad_origin'])(
    '%s: no toast (the global onError has it); the row is usable again',
    async (code) => {
      vi.spyOn(console, 'error').mockImplementation(() => {})
      await listPanelFiles()
      prioCalls.answer = () =>
        Promise.resolve({ ok: false, error: { code, message: 'x' } })
      await act(async () => checkbox(E01).click())
      await settle()
      expect(toastCalls.failure).not.toHaveBeenCalled()
      expect(checkbox(E01).disabled).toBe(false)
    },
  )

  it('a new change to the same file closes its failure toast', async () => {
    await listPanelFiles()
    prioCalls.answer = () =>
      Promise.resolve({
        ok: false,
        error: { code: 'qbit_rejected', message: 'x' },
      })
    await act(async () => checkbox(E01).click())
    await settle()
    expect(toastCalls.failure).toHaveBeenCalledOnce()
    prioCalls.answer = () => Promise.resolve({ ok: true, data: null })
    // Each send closes the toast about its own file (the store matches it).
    await openMenu(file(2).name)
    await choose('最高')
    expect(toastCalls.dismissFor).toHaveBeenLastCalledWith(`file:${h(1)}:2`)
    await act(async () => checkbox(E01).click())
    await settle()
    expect(toastCalls.dismissFor).toHaveBeenLastCalledWith(`file:${h(1)}:0`)
  })
})

describe('V1 and Q1', () => {
  it('V1 1000 files: under 60 rows in the DOM', async () => {
    files[h(1)] = Array.from({ length: 1000 }, (_, index) => file(index))
    await listPanelFiles()
    const count = rows().length
    expect(count).toBeGreaterThanOrEqual(10)
    expect(count).toBeLessThan(60)
    expect(rows()[0].getAttribute('aria-setsize')).toBe('1000')
  })

  it('Q1 polling only while the tab shows: 概覽 drops the observer', async () => {
    await listPanelFiles()
    const query = () =>
      client.getQueryCache().find({ queryKey: ['files', h(1)] })
    expect(query()?.getObserversCount()).toBe(1)
    await act(async () => tab('概覽').click())
    expect(query()?.getObserversCount()).toBe(0)
  })
})

describe('phone', () => {
  it('44px hit areas; the priority menu portals into the sheet', async () => {
    await render(<BoardDetailSheet />, h(1))
    const dialog = q('[role="dialog"]') as HTMLElement
    await act(async () => tab('檔案').click())
    await settle()
    expect(tab('檔案').className).toContain('h-11')
    expect(rows()).toHaveLength(3)
    expect(checkbox(E01).className).toContain('after:-inset-3')
    expect(prio(E01).className).toContain('h-11')
    // The phone shows no hover title.
    expect(q(`[title="${E01}"]`)).toBeNull()
    await openMenu(E01)
    expect(dialog.contains(menu())).toBe(true)
    expect((q('[role="menuitemradio"]') as HTMLElement).className).toContain(
      'h-11',
    )
    await choose('最高')
    expect(prioCalls.sent).toEqual([{ hash: h(1), ids: [0], priority: 7 }])
  })
})
