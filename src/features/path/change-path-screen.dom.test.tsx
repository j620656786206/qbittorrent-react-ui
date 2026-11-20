// @vitest-environment happy-dom
import { act, useState } from 'react'
import { createRoot } from 'react-dom/client'
import type { Root } from 'react-dom/client'
import { QueryClientProvider, notifyManager } from '@tanstack/react-query'
import type { QueryClient } from '@tanstack/react-query'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { AppError } from '#/lib/app-error'
import { fakeHash, fakeResponse, t } from '#/lib/testing'
import type { SlimTorrent } from '#/shared/maindata'
import { defaultSettings } from '#/shared/settings'
import type {
  AddCommonPathInput,
  CommonPath,
  Settings,
} from '#/shared/settings'
import type { BatchResult, SetLocationInput } from '#/shared/torrent-ops'
import { BottomSheet } from '#/shared/ui/bottom-sheet'
import { DESKTOP_QUERY } from '#/shared/ui/breakpoint'
import { STILL_WAITING_TEXT } from '#/shared/ui/confirm-shell'
import { MAIN_ID } from '#/shared/ui/main-scroll'
import {
  changePathOpenStore,
  openChangePath,
  resetChangePathOpen,
} from '#/state/change-path-open'
import { clearLoginRequired } from '#/state/login-required'
import { MAINDATA_KEY } from '#/state/maindata'
import { resetOrderFreeze } from '#/state/order-freeze'
import {
  pendingOpOf,
  pendingTargetOf,
  resetPendingOps,
} from '#/state/pending-ops'
import { createQueryClient } from '#/state/query-client'
import { SETTINGS_KEY, addCommonPathOp } from '#/state/settings'
import { resetShortcuts } from '#/state/shortcuts'
import { ChangePathScreen } from '#/features/path/change-path-screen'
import { setLocationOp } from '#/features/path/set-location-op'

// Spec 5.2 rows U1 to U4 and the Always rules of the change-path screen, in
// a DOM: the list (selection, 「目前」, the media tag), the box and its
// reasons, 「加到常用」, the send (one call, the normalized path, pending
// with the target, the refresh, the close), the sending lock, the failure
// toast with 重試 (same body), connection codes, the phone sheet over a
// detail sheet. The server functions are fakes passed in (AD-15).

const toastCalls = vi.hoisted(() => ({
  plain: vi.fn((_text: string) => {}),
  action: vi.fn(),
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

const A = fakeHash(0xa1)
const TV_DOWNLOADS: CommonPath = {
  path: '/data/torrents/tv',
  name: '下載區（影集）',
  mediaLibrary: false,
}
const TV_LIBRARY: CommonPath = {
  path: '/data/media/tv',
  name: '影集媒體庫',
  mediaLibrary: true,
}
const MOVIE_LIBRARY: CommonPath = {
  path: '/data/media/movies',
  name: '電影媒體庫',
  mediaLibrary: true,
}

interface Env {
  torrents: Array<SlimTorrent>
  settings: Settings
  desktop: boolean
  /** `null`: the settings read never answers. */
  settingsAnswer: Promise<Settings> | null
  moveSent: Array<SetLocationInput>
  moveAnswer: (input: SetLocationInput) => Promise<BatchResult>
  addSent: Array<AddCommonPathInput>
  addAnswer: (input: AddCommonPathInput) => Promise<Settings>
  maindataFetches: number
  client: QueryClient
  withDetailSheet: boolean
}

const env = {} as Env
let root: Root

function Tree() {
  const [moveOp] = useState(() =>
    setLocationOp((input) => {
      env.moveSent.push(input)
      return env.moveAnswer(input)
    }),
  )
  const [addPathOp] = useState(() =>
    addCommonPathOp((input) => {
      env.addSent.push(input)
      return env.addAnswer(input)
    }, env.client),
  )
  return (
    <>
      {env.withDetailSheet && (
        <BottomSheet open onOpenChange={() => {}} mode="detail" title="詳情">
          <button type="button" data-open-path="">
            改路徑
          </button>
        </BottomSheet>
      )}
      <ChangePathScreen moveOp={moveOp} addPathOp={addPathOp} />
    </>
  )
}

async function render() {
  env.client = createQueryClient({
    fetchMaindata: () => {
      env.maindataFetches += 1
      return Promise.resolve(fakeResponse({ changed: env.torrents }))
    },
    fetchSettings: () => env.settingsAnswer ?? new Promise<Settings>(() => {}),
    currentPath: () => '/',
  })
  await env.client.prefetchQuery({ queryKey: MAINDATA_KEY })
  if (env.settingsAnswer !== null) {
    await env.client.prefetchQuery({ queryKey: SETTINGS_KEY })
  }
  const host = document.createElement('div')
  document.body.append(host)
  root = createRoot(host)
  await act(async () =>
    root.render(
      <QueryClientProvider client={env.client}>
        <Tree />
      </QueryClientProvider>,
    ),
  )
}

const settle = () =>
  act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0))
  })

async function openFor(hash = A) {
  await act(async () => openChangePath([hash]))
  await settle()
}

const dialog = () =>
  [...document.querySelectorAll<HTMLElement>('[role="dialog"]')].find(
    (element) => element.textContent.includes('會搬到'),
  ) ?? null
const buttons = () => [...(dialog()?.querySelectorAll('button') ?? [])]
const buttonNamed = (name: string) =>
  buttons().find(
    (each) =>
      each.textContent === name || each.getAttribute('aria-label') === name,
  )
const primary = () => buttons()[buttons().length - 1]
const rows = () => [
  ...(dialog()?.querySelectorAll<HTMLButtonElement>('[role="radio"]') ?? []),
]
const rowNamed = (name: string) =>
  rows().find((row) => row.textContent.includes(name)) as HTMLButtonElement
const selectedNames = () =>
  rows()
    .filter((row) => row.getAttribute('aria-checked') === 'true')
    .map((row) => row.querySelector('[data-path-name]')?.textContent)
const currentNames = () =>
  rows()
    .filter((row) => row.querySelector('[data-current-tag]'))
    .map((row) => row.querySelector('[data-path-name]')?.textContent)
const addRow = () =>
  buttons().find((each) =>
    each.textContent.startsWith('加到常用'),
  ) as HTMLButtonElement
const input = () =>
  dialog()?.querySelector<HTMLInputElement>('input') as HTMLInputElement
const reason = () =>
  input().getAttribute('aria-describedby')
    ? document.getElementById(input().getAttribute('aria-describedby') ?? '')
        ?.textContent
    : null
const lastFailure = () => toastCalls.failure.mock.lastCall

async function type(text: string) {
  await act(async () => {
    const setter = Object.getOwnPropertyDescriptor(
      HTMLInputElement.prototype,
      'value',
    )?.set
    setter?.call(input(), text)
    input().dispatchEvent(new Event('input', { bubbles: true }))
  })
}

const press = (key: string, target?: Element | null) =>
  act(async () => {
    ;(target ?? document.activeElement ?? document.body).dispatchEvent(
      new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }),
    )
  })

async function click(element: HTMLElement) {
  await act(async () => element.click())
  await settle()
}

beforeEach(() => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true
  notifyManager.setScheduler((callback) => callback())
  vi.stubGlobal('requestAnimationFrame', (callback: () => void) =>
    setTimeout(callback, 0),
  )
  vi.spyOn(window, 'matchMedia').mockImplementation(
    (query: string) =>
      ({
        matches:
          query === DESKTOP_QUERY ? env.desktop : query.includes('reduce'),
        media: query,
        addEventListener: () => {},
        removeEventListener: () => {},
      }) as unknown as MediaQueryList,
  )
  const main = document.createElement('main')
  main.id = MAIN_ID
  main.tabIndex = -1
  document.body.append(main)
  env.torrents = [
    t({
      hash: A,
      name: 'Fake.Drama.S02.1080p.WEB-DL',
      save_path: '/data/torrents/tv/',
      state: 'stalledUP',
      progress: 1,
    }),
  ]
  env.settings = {
    ...defaultSettings(),
    commonPaths: [TV_DOWNLOADS, TV_LIBRARY, MOVIE_LIBRARY],
  }
  env.settingsAnswer = Promise.resolve(env.settings)
  env.desktop = true
  env.moveSent = []
  env.moveAnswer = (values) =>
    Promise.resolve({
      items: values.hashes.map((key) => ({ key, ok: true as const })),
    })
  env.addSent = []
  env.addAnswer = (values) =>
    Promise.resolve({
      ...env.settings,
      commonPaths: [...env.settings.commonPaths, values],
    })
  env.maindataFetches = 0
  env.withDetailSheet = false
  for (const mock of Object.values(toastCalls)) mock.mockClear()
  clearLoginRequired()
  resetChangePathOpen()
  resetPendingOps()
  resetOrderFreeze()
  resetShortcuts()
})

afterEach(async () => {
  await act(async () => root.unmount())
  env.client.clear()
  document.body.replaceChildren()
  resetChangePathOpen()
  resetPendingOps()
  resetOrderFreeze()
  resetShortcuts()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
  notifyManager.setScheduler((callback) => setTimeout(callback, 0))
  globalThis.IS_REACT_ACT_ENVIRONMENT = false
})

describe('change path, one torrent (spec 5.2)', () => {
  it('U1 open: a 560px dialog 「改路徑」 with the name, the box at the save path, its row 「目前」 and selected, 搬過去 disabled', async () => {
    await render()
    expect(dialog()).toBeNull()
    await openFor()
    const shell = dialog() as HTMLElement
    expect(shell.className).toContain('w-[560px]')
    expect(shell.querySelector('h2')?.textContent).toBe('改路徑')
    expect(shell.textContent).toContain('Fake.Drama.S02.1080p.WEB-DL')
    expect(shell.textContent).toContain('常用路徑')
    expect(input().value).toBe('/data/torrents/tv/')
    expect(input().className).toContain('font-mono')
    expect(input().className).toContain('h-9')
    expect(
      rows().map((row) => row.querySelector('[data-path-name]')?.textContent),
    ).toEqual(['下載區（影集）', '影集媒體庫', '電影媒體庫'])
    expect(currentNames()).toEqual(['下載區（影集）'])
    expect(selectedNames()).toEqual(['下載區（影集）'])
    expect(rowNamed('下載區（影集）').className).toContain('bg-selection-row')
    expect(primary().textContent).toBe('搬過去')
    expect(primary().getAttribute('aria-disabled')).toBe('true')
    // The path is listed: 加到常用 is disabled with the note.
    expect(addRow().disabled).toBe(true)
    expect(addRow().textContent).toContain('框裡的路徑已經在清單裡')
    // No 編輯 pill in 5.2.
    expect(buttonNamed('編輯')).toBeUndefined()
  })

  it('the media library rows carry one 「媒體庫」 tag, read once; 「目前」 is only an outline tag', async () => {
    await render()
    await openFor()
    const tag = rowNamed('影集媒體庫').querySelector('[data-media-library]')
    expect(tag?.textContent).toBe('媒體庫')
    expect(rowNamed('影集媒體庫').querySelector('.sr-only')).toBeNull()
    expect(
      rowNamed('下載區（影集）').querySelector('[data-media-library]'),
    ).toBeNull()
    const current = rowNamed('下載區（影集）').querySelector(
      '[data-current-tag]',
    ) as HTMLElement
    expect(current.textContent).toBe('目前')
    expect(current.className).toContain('border')
    expect(current.className).not.toContain('bg-')
  })

  it('U2 pick the library: the box fills, that row is selected, 「目前」 stays, 搬過去 enabled, 加到常用 disabled with the note', async () => {
    await render()
    await openFor()
    await click(rowNamed('影集媒體庫'))
    expect(input().value).toBe('/data/media/tv')
    expect(selectedNames()).toEqual(['影集媒體庫'])
    expect(currentNames()).toEqual(['下載區（影集）'])
    expect(rowNamed('下載區（影集）').className).not.toContain(
      'bg-selection-row',
    )
    expect(primary().hasAttribute('aria-disabled')).toBe(false)
    expect(addRow().disabled).toBe(true)
    expect(addRow().textContent).toContain('框裡的路徑已經在清單裡')
  })

  it('arrow keys step through the rows (one tab stop) and pick them', async () => {
    await render()
    await openFor()
    expect(rows().map((row) => row.tabIndex)).toEqual([0, -1, -1])
    await press('ArrowDown', rowNamed('下載區（影集）'))
    expect(input().value).toBe('/data/media/tv')
    expect(document.activeElement).toBe(rowNamed('影集媒體庫'))
    expect(rows().map((row) => row.tabIndex)).toEqual([-1, 0, -1])
    await press('ArrowUp')
    await press('ArrowUp')
    expect(input().value).toBe('/data/media/movies')
    expect(document.activeElement).toBe(rowNamed('電影媒體庫'))
  })

  it('typing: selected only when the normalized box equals a row; no row selected otherwise', async () => {
    await render()
    await openFor()
    await type('/data//media/tv/')
    expect(selectedNames()).toEqual(['影集媒體庫'])
    await type('/data/media/anime')
    expect(selectedNames()).toEqual([])
    expect(addRow().disabled).toBe(false)
    expect(addRow().textContent).toBe('加到常用')
    // The torrent's own path, written differently: still nothing to move.
    await type('/data/torrents//tv')
    expect(primary().getAttribute('aria-disabled')).toBe('true')
  })

  it.each([
    ['data/tv', '路徑要從 / 開頭'],
    ['', '路徑要從 / 開頭'],
    ['/data/../x', '路徑不能有 ..'],
    [`/${'x'.repeat(1025)}`, '路徑太長'],
  ])(
    'U3 bad format %j: the delete border, the reason, 搬過去 and 加到常用 disabled',
    async (text, why) => {
      await render()
      await openFor()
      await type(text)
      expect(input().getAttribute('aria-invalid')).toBe('true')
      expect(input().className).toContain('aria-invalid:border-destructive')
      expect(reason()).toBe(why)
      expect(primary().getAttribute('aria-disabled')).toBe('true')
      expect(addRow().disabled).toBe(true)
      await click(primary())
      expect(env.moveSent).toEqual([])
    },
  )

  it('send: one call with the hash and the normalized path, pending with the target, then closed and refreshed', async () => {
    await render()
    await openFor()
    await type('/data/media/tv/')
    const before = env.maindataFetches
    let answer: (value: BatchResult) => void = () => {}
    env.moveAnswer = () =>
      new Promise((resolve) => {
        answer = resolve
      })
    await click(primary())
    expect(env.moveSent).toEqual([{ hashes: [A], location: '/data/media/tv' }])
    expect(pendingOpOf(A)).toBe('move')
    expect(pendingTargetOf(A)).toBe('/data/media/tv')
    expect(primary().textContent).toBe('搬移中…')
    // No second send, no close meanwhile.
    await click(primary())
    await press('Escape')
    expect(env.moveSent).toHaveLength(1)
    expect(dialog()).not.toBeNull()
    expect(buttonNamed('取消')?.getAttribute('aria-disabled')).toBe('true')
    await act(async () => answer({ items: [{ key: A, ok: true }] }))
    await settle()
    await settle()
    expect(dialog()).toBeNull()
    expect(changePathOpenStore.state.open).toBeNull()
    expect(env.maindataFetches).toBeGreaterThan(before)
    expect(toastCalls.failure).not.toHaveBeenCalled()
    // The local torrent is never edited.
    expect(env.torrents[0].save_path).toBe('/data/torrents/tv/')
  })

  it('Enter in the box presses 搬過去 when enabled, never when disabled', async () => {
    await render()
    await openFor()
    await press('Enter', input())
    expect(env.moveSent).toEqual([])
    await type('/data/media/movies')
    await press('Enter', input())
    await settle()
    expect(env.moveSent).toEqual([
      { hashes: [A], location: '/data/media/movies' },
    ])
  })

  it('after 10 s of sending: 「還在等 NAS 回應」', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
    try {
      await render()
      await act(async () => openChangePath([A]))
      await act(async () => {
        await vi.advanceTimersByTimeAsync(0)
      })
      env.moveAnswer = () => new Promise(() => {})
      await act(async () => rowNamed('影集媒體庫').click())
      await act(async () => primary().click())
      expect(dialog()?.textContent).not.toContain(STILL_WAITING_TEXT)
      await act(async () => {
        await vi.advanceTimersByTimeAsync(10_000)
      })
      expect(dialog()?.textContent).toContain(STILL_WAITING_TEXT)
    } finally {
      vi.useRealTimers()
    }
  })

  it.each([
    ['qbit_rejected', '改路徑失敗：qBittorrent 拒絕這個操作'],
    ['timeout', '改路徑失敗：qBittorrent 沒有回應，請再試一次'],
    ['invalid_input', '改路徑失敗：這個路徑不在允許的下載資料夾底下'],
  ] as const)(
    'U4 %s: the failure toast with 重試, the screen open with the box kept; 重試 sends the same body',
    async (code, text) => {
      await render()
      await openFor()
      await type('/data/media/tv')
      env.moveAnswer = () => Promise.reject(new AppError(code))
      const before = env.maindataFetches
      await click(primary())
      await settle()
      expect(lastFailure()?.[0]).toBe(text)
      // A timeout may still have started the move: maindata refreshes.
      expect(env.maindataFetches).toBeGreaterThan(before)
      expect(lastFailure()?.[1].keys).toEqual([`move:${A}`])
      expect(dialog()).not.toBeNull()
      expect(input().value).toBe('/data/media/tv')
      expect(primary().textContent).toBe('搬過去')
      expect(pendingOpOf(A)).toBeNull()
      env.moveAnswer = (values) =>
        Promise.resolve({ items: [{ key: values.hashes[0], ok: true }] })
      await act(async () => lastFailure()?.[1].onRetry())
      await settle()
      await settle()
      expect(env.moveSent).toEqual([
        { hashes: [A], location: '/data/media/tv' },
        { hashes: [A], location: '/data/media/tv' },
      ])
      // The retry went through: the screen closes.
      expect(dialog()).toBeNull()
    },
  )

  it('a single failed item (the container pre-check) is that code failing', async () => {
    await render()
    await openFor()
    await type('/data/media/tv')
    env.moveAnswer = () =>
      Promise.resolve({
        items: [
          {
            key: A,
            ok: false,
            code: 'qbit_rejected',
            message: 'qBittorrent 拒絕這個操作',
          },
        ],
      })
    await click(primary())
    await settle()
    expect(lastFailure()?.[0]).toBe('改路徑失敗：qBittorrent 拒絕這個操作')
    expect(dialog()).not.toBeNull()
  })

  it('a connection code: no toast (the global handler), the screen stays', async () => {
    await render()
    await openFor()
    await type('/data/media/tv')
    env.moveAnswer = () => Promise.reject(new AppError('home_unreachable'))
    await click(primary())
    await settle()
    expect(toastCalls.failure).not.toHaveBeenCalled()
    expect(dialog()).not.toBeNull()
    expect(input().value).toBe('/data/media/tv')
  })

  it('editing the box closes an old failure toast, so 重試 never sends a path no longer on screen', async () => {
    await render()
    await openFor()
    await type('/data/media/tv')
    toastCalls.dismissFor.mockClear()
    await type('/data/media/tv2')
    expect(toastCalls.dismissFor).toHaveBeenCalledWith(`move:${A}`)
    // A pause or delete toast of the same torrent (keyed by the hash) stays.
    expect(toastCalls.dismissFor).not.toHaveBeenCalledWith(A)
  })

  it('重試 in flight, then Enter in the box sends nothing', async () => {
    await render()
    await openFor()
    await type('/data/media/tv')
    env.moveAnswer = () => Promise.reject(new AppError('qbit_rejected'))
    await click(primary())
    await settle()
    let answer: (value: BatchResult) => void = () => {}
    env.moveAnswer = () =>
      new Promise((resolve) => {
        answer = resolve
      })
    await act(async () => lastFailure()?.[1].onRetry())
    await settle()
    expect(env.moveSent).toHaveLength(2)
    expect(primary().textContent).toBe('搬移中…')
    await press('Enter', input())
    await click(primary())
    await settle()
    expect(env.moveSent).toHaveLength(2)
    await act(async () => answer({ items: [{ key: A, ok: true }] }))
    await settle()
  })

  it('after a failed move, 取消 and opening again close the move toast (its key only)', async () => {
    await render()
    await openFor()
    await type('/data/media/tv')
    env.moveAnswer = () => Promise.reject(new AppError('qbit_rejected'))
    await click(primary())
    await settle()
    toastCalls.dismissFor.mockClear()
    await click(buttonNamed('取消') as HTMLButtonElement)
    expect(toastCalls.dismissFor).toHaveBeenCalledWith(`move:${A}`)
    toastCalls.dismissFor.mockClear()
    await openFor()
    expect(toastCalls.dismissFor).toHaveBeenCalledWith(`move:${A}`)
    expect(toastCalls.dismissFor).not.toHaveBeenCalledWith(A)
  })

  it('while sending, a row click or typing leaves the box as it was', async () => {
    await render()
    await openFor()
    await type('/data/media/tv')
    env.moveAnswer = () => new Promise(() => {})
    await click(primary())
    expect(primary().textContent).toBe('搬移中…')
    await click(rowNamed('電影媒體庫'))
    expect(input().value).toBe('/data/media/tv')
    await type('/data/other')
    expect(input().value).toBe('/data/media/tv')
  })

  it('a pasted path with outer spaces is sent trimmed', async () => {
    await render()
    await openFor()
    await type(' /data/media/movies ')
    await click(primary())
    expect(env.moveSent).toEqual([
      { hashes: [A], location: '/data/media/movies' },
    ])
  })

  it('加到常用: the normalized box path named by its last two folders, not a media library; the new row from the answer is selected', async () => {
    await render()
    await openFor()
    await type('/data/media/anime/')
    await click(addRow())
    await settle()
    expect(env.addSent).toEqual([
      { path: '/data/media/anime', name: 'media/anime', mediaLibrary: false },
    ])
    expect(rows()).toHaveLength(4)
    expect(selectedNames()).toEqual(['media/anime'])
    expect(
      rowNamed('media/anime').querySelector('[data-media-library]'),
    ).toBeNull()
    expect(addRow().disabled).toBe(true)
    expect(addRow().textContent).toContain('框裡的路徑已經在清單裡')
    expect(toastCalls.plain).not.toHaveBeenCalled()
  })

  it('加到常用 is disabled while its own request is out', async () => {
    await render()
    await openFor()
    await type('/data/media/anime')
    let answer: (value: Settings) => void = () => {}
    env.addAnswer = () =>
      new Promise((resolve) => {
        answer = resolve
      })
    await click(addRow())
    expect(addRow().disabled).toBe(true)
    await click(addRow())
    expect(env.addSent).toHaveLength(1)
    await act(async () =>
      answer({
        ...env.settings,
        commonPaths: [
          ...env.settings.commonPaths,
          {
            path: '/data/media/anime',
            name: 'media/anime',
            mediaLibrary: false,
          },
        ],
      }),
    )
    await settle()
    expect(rows()).toHaveLength(4)
  })

  it('加到常用 refused with 50 listed: 「常用路徑最多 50 個」', async () => {
    env.settings = {
      ...defaultSettings(),
      commonPaths: Array.from({ length: 50 }, (_, index) => ({
        path: `/data/p${index}`,
        name: `p${index}`,
        mediaLibrary: false,
      })),
    }
    env.settingsAnswer = Promise.resolve(env.settings)
    await render()
    await openFor()
    await type('/data/new')
    env.addAnswer = () => Promise.reject(new AppError('invalid_input'))
    await click(addRow())
    await settle()
    expect(lastFailure()?.[0]).toBe('常用路徑最多 50 個')
  })

  it('settings not answered yet: the list is empty and 加到常用 disabled', async () => {
    env.settingsAnswer = null
    await render()
    await openFor()
    expect(rows()).toEqual([])
    await type('/data/media/anime')
    expect(addRow().disabled).toBe(true)
    // Moving still works from the box.
    expect(primary().hasAttribute('aria-disabled')).toBe(false)
  })

  it('取消 and Esc close it, nothing sent; a new open starts from the save path', async () => {
    await render()
    await openFor()
    await type('/data/media/tv')
    await click(buttonNamed('取消') as HTMLButtonElement)
    expect(dialog()).toBeNull()
    await openFor()
    expect(input().value).toBe('/data/torrents/tv/')
    await press('Escape')
    await settle()
    expect(dialog()).toBeNull()
    expect(env.moveSent).toEqual([])
  })

  it('the torrent leaves maindata: the screen closes', async () => {
    await render()
    await openFor()
    env.torrents = []
    await act(async () => {
      await env.client.refetchQueries({ queryKey: MAINDATA_KEY })
    })
    await settle()
    expect(changePathOpenStore.state.open).toBeNull()
    expect(dialog()).toBeNull()
  })
})

describe('change path on the phone (spec 5.2)', () => {
  beforeEach(() => {
    env.desktop = false
  })

  it('a content-height sheet with no cancel: the name, 56px rows, a 44px 16px box, 「已在清單裡」', async () => {
    await render()
    await openFor()
    const sheet = dialog() as HTMLElement
    expect(sheet.dataset.slot).toBe('bottom-sheet')
    expect(buttonNamed('取消')).toBeUndefined()
    expect(sheet.textContent).toContain('Fake.Drama.S02.1080p.WEB-DL')
    expect(rowNamed('影集媒體庫').className).toContain('min-h-14')
    expect(input().className).toContain('h-11')
    expect(input().className).toContain('text-[16px]')
    expect(addRow().textContent).toContain('已在清單裡')
    expect(addRow().textContent).not.toContain('框裡的路徑已經在清單裡')
    await click(buttonNamed('關閉') as HTMLButtonElement)
    expect(dialog()).toBeNull()
  })

  it('over the detail sheet: the detail sheet is inert meanwhile and comes back intact', async () => {
    env.withDetailSheet = true
    await render()
    await settle()
    const detail = document.querySelector<HTMLElement>(
      '[data-slot="bottom-sheet"]',
    ) as HTMLElement
    const opener = detail.querySelector<HTMLButtonElement>(
      '[data-open-path]',
    ) as HTMLButtonElement
    opener.focus()
    await openFor()
    expect(dialog()).not.toBeNull()
    const outside = (element: Element) => {
      let node: Element | null = element
      while (node && node.parentElement !== document.body) {
        node = node.parentElement
      }
      return node
    }
    expect(outside(detail)?.hasAttribute('inert')).toBe(true)
    await click(buttonNamed('關閉') as HTMLButtonElement)
    expect(dialog()).toBeNull()
    expect(detail.isConnected).toBe(true)
    expect(outside(detail)?.hasAttribute('inert')).toBe(false)
    expect(detail.textContent).toContain('改路徑')
    expect(document.activeElement).toBe(opener)
  })
})
