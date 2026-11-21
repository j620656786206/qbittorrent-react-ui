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
  RemoveCommonPathInput,
  Settings,
  UpdateCommonPathInput,
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
import { moveRecordOf, pendingOpOf, resetPendingOps } from '#/state/pending-ops'
import { createQueryClient } from '#/state/query-client'
import {
  SETTINGS_KEY,
  addCommonPathOp,
  removeCommonPathOp,
  updateCommonPathOp,
} from '#/state/settings'
import { resetShortcuts } from '#/state/shortcuts'
import { ChangePathScreen } from '#/features/path/change-path-screen'
import { setLocationOp } from '#/features/path/set-location-op'

// Spec 5.2 rows U1 to U4 and the Always rules of the change-path screen, in
// a DOM: the list (selection, 「目前」, the media tag), the box and its
// reasons, 「加到常用」, the send (one call, the normalized path, pending,
// the move record on success, the refresh, the close), the sending lock, the failure
// toast with 重試 (same body), connection codes, the phone sheet over a
// detail sheet. The server functions are fakes passed in (AD-15). Spec 5.4
// rows E1 to E4, A1 and D2's opening: edit mode, inline rename, 「媒體庫」,
// ✕, the per-row locks.

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
  updateSent: Array<UpdateCommonPathInput>
  updateAnswer: (input: UpdateCommonPathInput) => Promise<Settings>
  removeSent: Array<RemoveCommonPathInput>
  removeAnswer: (input: RemoveCommonPathInput) => Promise<Settings>
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
  const [updatePathOp] = useState(() =>
    updateCommonPathOp((input) => {
      env.updateSent.push(input)
      return env.updateAnswer(input)
    }),
  )
  const [removePathOp] = useState(() =>
    removeCommonPathOp((input) => {
      env.removeSent.push(input)
      return env.removeAnswer(input)
    }),
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
      <ChangePathScreen
        moveOp={moveOp}
        addPathOp={addPathOp}
        updatePathOp={updatePathOp}
        removePathOp={removePathOp}
      />
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
  dialog()?.querySelector<HTMLInputElement>(
    'input:not([data-rename-input])',
  ) as HTMLInputElement
const reason = () =>
  input().getAttribute('aria-describedby')
    ? document.getElementById(input().getAttribute('aria-describedby') ?? '')
        ?.textContent
    : null
const lastFailure = () => toastCalls.failure.mock.lastCall
const editPill = () =>
  dialog()?.querySelector<HTMLButtonElement>(
    '[data-edit-pill]',
  ) as HTMLButtonElement
const editRows = () => [
  ...(dialog()?.querySelectorAll<HTMLElement>('[data-edit-row]') ?? []),
]
const editRowNamed = (name: string) =>
  editRows().find((row) =>
    row.querySelector('[data-path-name]')
      ? row.querySelector('[data-path-name]')?.textContent === name
      : row.querySelector<HTMLInputElement>('[data-rename-input]')?.value ===
        name,
  ) as HTMLElement
const nameButton = (name: string) =>
  editRowNamed(name).querySelector<HTMLButtonElement>(
    '[data-path-name]',
  ) as HTMLButtonElement
const checkboxOf = (row: HTMLElement) =>
  row.querySelector<HTMLButtonElement>('[role="checkbox"]') as HTMLButtonElement
const removeOf = (row: HTMLElement) =>
  row.querySelector<HTMLButtonElement>(
    'button[title="從常用拿掉（不動檔案）"]',
  ) as HTMLButtonElement
const renameInput = () =>
  dialog()?.querySelector<HTMLInputElement>('[data-rename-input]') ?? null

async function typeInto(element: HTMLInputElement, text: string) {
  await act(async () => {
    const setter = Object.getOwnPropertyDescriptor(
      HTMLInputElement.prototype,
      'value',
    )?.set
    setter?.call(element, text)
    element.dispatchEvent(new Event('input', { bubbles: true }))
  })
}

async function enterEditMode() {
  await click(editPill())
  expect(editPill().textContent).toBe('完成')
}

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
  env.addAnswer = (values) => {
    env.settings = {
      ...env.settings,
      commonPaths: [...env.settings.commonPaths, values],
    }
    return Promise.resolve(env.settings)
  }
  env.updateSent = []
  env.updateAnswer = (values) => {
    env.settings = {
      ...env.settings,
      commonPaths: env.settings.commonPaths.map((common) =>
        common.path === values.path
          ? {
              ...common,
              ...(values.name === undefined
                ? {}
                : { name: values.name.trim() }),
              ...(values.mediaLibrary === undefined
                ? {}
                : { mediaLibrary: values.mediaLibrary }),
            }
          : common,
      ),
    }
    return Promise.resolve(env.settings)
  }
  env.removeSent = []
  env.removeAnswer = (values) => {
    env.settings = {
      ...env.settings,
      commonPaths: env.settings.commonPaths.filter(
        (common) => common.path !== values.path,
      ),
    }
    return Promise.resolve(env.settings)
  }
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
    // Story 5.4: the 編輯 pill, normal mode.
    expect(editPill().textContent).toBe('編輯')
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

  it('send: one call with the hash and the normalized path, no 30 s entry, then recorded, closed and refreshed', async () => {
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
    expect(pendingOpOf(A)).toBeNull()
    // Spec 5.3: the move record waits for the ok answer.
    expect(moveRecordOf(A)).toBeNull()
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
    expect(moveRecordOf(A)?.target).toBe('/data/media/tv')
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

  it('an Enter that commits an IME candidate (composing, or keyCode 229) sends nothing; a plain Enter sends', async () => {
    await render()
    await openFor()
    await type('/data/media/電影')
    const composingEnter = (init: KeyboardEventInit) =>
      act(async () => {
        input().dispatchEvent(
          new KeyboardEvent('keydown', {
            key: 'Enter',
            bubbles: true,
            cancelable: true,
            ...init,
          }),
        )
      })
    await composingEnter({ isComposing: true })
    await composingEnter({ keyCode: 229 })
    await settle()
    expect(env.moveSent).toEqual([])
    await press('Enter', input())
    await settle()
    expect(env.moveSent).toEqual([
      { hashes: [A], location: '/data/media/電影' },
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

  it('a single failed item (the container pre-check) is that code failing, named for the torrent', async () => {
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
    expect(lastFailure()?.[0]).toBe('改路徑失敗：這個種子正在搬')
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
    // Story 5.4: the new row's name opens for renaming; Enter keeps it.
    await press('Enter', renameInput())
    await settle()
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
    expect(dialog()?.querySelectorAll('[data-path-row]')).toHaveLength(4)
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

describe('change path while the torrent moves (review of 5.1 to 5.3)', () => {
  it('a moving torrent: 搬過去 stays disabled with the note, nothing is sent', async () => {
    env.torrents = [{ ...env.torrents[0], movingTo: '/data/media/movies' }]
    await render()
    await openFor()
    await type('/data/media/tv')
    expect(primary().getAttribute('aria-disabled')).toBe('true')
    expect(dialog()?.textContent).toContain('正在搬移中，搬完才能再改路徑')
    await click(primary())
    await settle()
    expect(env.moveSent).toEqual([])
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

describe('edit mode (spec 5.4)', () => {
  it('E1 編輯: 完成 (700), no radios, dotted names, a 媒體庫 checkbox and a ✕ per row, 加到常用 hidden; 完成 brings the radios back', async () => {
    await render()
    await openFor()
    expect(editPill().className).toContain('h-7')
    expect(editPill().className).toContain('font-semibold')
    expect(editPill().className).toContain('border')
    await enterEditMode()
    expect(editPill().className).toContain('font-bold')
    expect(rows()).toEqual([])
    expect(dialog()?.querySelector('[role="radiogroup"]')).toBeNull()
    expect(editRows()).toHaveLength(3)
    for (const row of editRows()) {
      expect(row.className).toContain('min-h-[52px]')
      const name = row.querySelector('[data-path-name]') as HTMLElement
      expect(name.className).toContain('decoration-dotted')
      expect(name.getAttribute('aria-label')).toBe(`改名：${name.textContent}`)
      expect(checkboxOf(row).getAttribute('aria-label')).toBe(
        `媒體庫：${name.textContent}`,
      )
      expect(checkboxOf(row).className).toContain('size-5')
      expect(removeOf(row).className).toContain('size-8')
      expect(removeOf(row).getAttribute('aria-label')).toBe(
        `從常用拿掉：${name.textContent}`,
      )
    }
    expect(
      editRows().map((row) => checkboxOf(row).getAttribute('aria-checked')),
    ).toEqual(['false', 'true', 'true'])
    // 「目前」 stays beside the name; no 媒體庫 tag (the checkbox says it).
    expect(
      editRowNamed('下載區（影集）').querySelector('[data-current-tag]'),
    ).not.toBeNull()
    expect(dialog()?.querySelector('[data-media-library]')).toBeNull()
    expect(addRow()).toBeUndefined()
    await click(editPill())
    expect(editPill().textContent).toBe('編輯')
    expect(rows()).toHaveLength(3)
    expect(addRow()).toBeDefined()
    expect(selectedNames()).toEqual(['下載區（影集）'])
  })

  it('E1 a row click in edit mode does not fill the box', async () => {
    await render()
    await openFor()
    await enterEditMode()
    const row = editRowNamed('影集媒體庫')
    await click(row)
    await click(row.querySelector('[title="/data/media/tv"]') as HTMLElement)
    expect(input().value).toBe('/data/torrents/tv/')
  })

  it('E2 rename with Enter: the name becomes an input (text selected), one updateCommonPath with the trimmed name, then the new name with focus back', async () => {
    await render()
    await openFor()
    await enterEditMode()
    await click(nameButton('影集媒體庫'))
    const field = renameInput() as HTMLInputElement
    expect(field.value).toBe('影集媒體庫')
    expect(document.activeElement).toBe(field)
    expect([field.selectionStart, field.selectionEnd]).toEqual([0, 5])
    expect(field.className).toContain('h-9')
    expect(field.getAttribute('aria-label')).toBe('/data/media/tv 的名稱')
    await typeInto(field, '  影集  ')
    await press('Enter', field)
    await settle()
    expect(env.updateSent).toEqual([{ path: '/data/media/tv', name: '影集' }])
    expect(renameInput()).toBeNull()
    expect(nameButton('影集').textContent).toBe('影集')
    expect(document.activeElement).toBe(nameButton('影集'))
    expect(dialog()).not.toBeNull()
  })

  it('E2 blur saves like Enter; an unchanged name sends nothing', async () => {
    await render()
    await openFor()
    await enterEditMode()
    await click(nameButton('電影媒體庫'))
    await act(async () => (renameInput() as HTMLInputElement).blur())
    await settle()
    expect(renameInput()).toBeNull()
    expect(env.updateSent).toEqual([])
    await click(nameButton('電影媒體庫'))
    await typeInto(renameInput() as HTMLInputElement, '電影')
    await act(async () => (renameInput() as HTMLInputElement).blur())
    await settle()
    expect(env.updateSent).toEqual([
      { path: '/data/media/movies', name: '電影' },
    ])
    expect(nameButton('電影').textContent).toBe('電影')
  })

  it.each([
    ['blank', '   '],
    ['51 characters', 'n'.repeat(51)],
  ])(
    'E2 a %s name: the delete border, not sent, the input stays',
    async (_name, text) => {
      await render()
      await openFor()
      await enterEditMode()
      await click(nameButton('影集媒體庫'))
      const field = renameInput() as HTMLInputElement
      await typeInto(field, text)
      expect(field.getAttribute('aria-invalid')).toBe('true')
      expect(field.className).toContain('aria-invalid:border-destructive')
      await press('Enter', field)
      await act(async () => field.blur())
      await settle()
      expect(env.updateSent).toEqual([])
      expect(renameInput()?.value).toBe(text)
    },
  )

  it('E2 Esc cancels that rename only: the name back, nothing sent, the screen open', async () => {
    await render()
    await openFor()
    await enterEditMode()
    await click(nameButton('影集媒體庫'))
    await typeInto(renameInput() as HTMLInputElement, '別的名字')
    await press('Escape', renameInput())
    await settle()
    expect(renameInput()).toBeNull()
    expect(nameButton('影集媒體庫').textContent).toBe('影集媒體庫')
    expect(document.activeElement).toBe(nameButton('影集媒體庫'))
    expect(env.updateSent).toEqual([])
    expect(dialog()).not.toBeNull()
    expect(changePathOpenStore.state.open).not.toBeNull()
    // The next Esc closes the screen.
    await press('Escape', nameButton('影集媒體庫'))
    await settle()
    expect(dialog()).toBeNull()
  })

  it('E2 a failed rename: the toast with 重試, the input keeps the typed name; 重試 sends it again and closes the input', async () => {
    await render()
    await openFor()
    await enterEditMode()
    const answer = env.updateAnswer
    env.updateAnswer = () =>
      Promise.reject(new AppError('settings_write_failed'))
    await click(nameButton('影集媒體庫'))
    await typeInto(renameInput() as HTMLInputElement, '影集')
    await press('Enter', renameInput())
    await settle()
    expect(lastFailure()?.[0]).toBe('名稱沒改到：設定檔寫不進去')
    expect(lastFailure()?.[1].keys).toEqual([
      'settings:common-path:/data/media/tv',
    ])
    expect(renameInput()?.value).toBe('影集')
    expect(renameInput()?.disabled).toBe(false)
    env.updateAnswer = answer
    await act(async () => lastFailure()?.[1].onRetry())
    await settle()
    expect(env.updateSent).toEqual([
      { path: '/data/media/tv', name: '影集' },
      { path: '/data/media/tv', name: '影集' },
    ])
    expect(renameInput()).toBeNull()
    expect(nameButton('影集').textContent).toBe('影集')
  })

  it('ticking 媒體庫 saves at once; the list follows the answer', async () => {
    await render()
    await openFor()
    await enterEditMode()
    await click(checkboxOf(editRowNamed('下載區（影集）')))
    await settle()
    expect(env.updateSent).toEqual([
      { path: '/data/torrents/tv', mediaLibrary: true },
    ])
    expect(
      checkboxOf(editRowNamed('下載區（影集）')).getAttribute('aria-checked'),
    ).toBe('true')
    await click(checkboxOf(editRowNamed('電影媒體庫')))
    await settle()
    expect(env.updateSent[1]).toEqual({
      path: '/data/media/movies',
      mediaLibrary: false,
    })
    await click(editPill())
    expect(
      rowNamed('下載區（影集）').querySelector('[data-media-library]'),
    ).not.toBeNull()
    expect(
      rowNamed('電影媒體庫').querySelector('[data-media-library]'),
    ).toBeNull()
  })

  it('a failed tick: 「媒體庫沒改到：…」 with 重試, the box unticked', async () => {
    await render()
    await openFor()
    await enterEditMode()
    env.updateAnswer = () => Promise.reject(new AppError('timeout'))
    await click(checkboxOf(editRowNamed('下載區（影集）')))
    await settle()
    expect(lastFailure()?.[0]).toBe('媒體庫沒改到：容器沒有回應，請再試一次')
    expect(
      checkboxOf(editRowNamed('下載區（影集）')).getAttribute('aria-checked'),
    ).toBe('false')
  })

  it('E3 ✕ on the selected row: no confirmation, the entry gone, the box keeps its path, no row selected', async () => {
    await render()
    await openFor()
    expect(selectedNames()).toEqual(['下載區（影集）'])
    await enterEditMode()
    await click(removeOf(editRowNamed('下載區（影集）')))
    await settle()
    expect(env.removeSent).toEqual([{ path: '/data/torrents/tv' }])
    expect(editRows()).toHaveLength(2)
    expect(document.querySelector('[role="alertdialog"]')).toBeNull()
    expect(input().value).toBe('/data/torrents/tv/')
    await click(editPill())
    expect(rows()).toHaveLength(2)
    expect(selectedNames()).toEqual([])
    expect(addRow().disabled).toBe(false)
  })

  it('E3 a failed ✕: 「沒從常用拿掉：…」 with 重試, the row stays', async () => {
    await render()
    await openFor()
    await enterEditMode()
    env.removeAnswer = () =>
      Promise.reject(new AppError('settings_write_failed'))
    await click(removeOf(editRowNamed('影集媒體庫')))
    await settle()
    expect(lastFailure()?.[0]).toBe('沒從常用拿掉：設定檔寫不進去')
    expect(editRows()).toHaveLength(3)
  })

  it("E4 while a row's write is in flight its name, checkbox and ✕ are disabled; other rows are not", async () => {
    await render()
    await openFor()
    await enterEditMode()
    let finish: (value: Settings) => void = () => {}
    env.updateAnswer = () =>
      new Promise((resolve) => {
        finish = resolve
      })
    await click(checkboxOf(editRowNamed('影集媒體庫')))
    const busy = editRowNamed('影集媒體庫')
    expect(nameButton('影集媒體庫').disabled).toBe(true)
    expect(checkboxOf(busy).disabled).toBe(true)
    expect(removeOf(busy).disabled).toBe(true)
    const other = editRowNamed('電影媒體庫')
    expect(checkboxOf(other).disabled).toBe(false)
    expect(removeOf(other).disabled).toBe(false)
    // A second press on the busy row sends nothing.
    await click(removeOf(busy))
    expect(env.removeSent).toEqual([])
    await act(async () =>
      finish({
        ...env.settings,
        commonPaths: [
          TV_DOWNLOADS,
          { ...TV_LIBRARY, mediaLibrary: false },
          MOVIE_LIBRARY,
        ],
      }),
    )
    await settle()
    expect(checkboxOf(editRowNamed('影集媒體庫')).disabled).toBe(false)
  })

  it('E4 a rename in flight disables its input', async () => {
    await render()
    await openFor()
    await enterEditMode()
    let finish: (value: Settings) => void = () => {}
    env.updateAnswer = () =>
      new Promise((resolve) => {
        finish = resolve
      })
    await click(nameButton('影集媒體庫'))
    await typeInto(renameInput() as HTMLInputElement, '影集')
    await press('Enter', renameInput())
    expect(renameInput()?.disabled).toBe(true)
    expect(checkboxOf(editRows()[1]).disabled).toBe(true)
    // A blur meanwhile sends nothing more.
    await act(async () => (renameInput() as HTMLInputElement).blur())
    expect(env.updateSent).toHaveLength(1)
    await act(async () =>
      finish({
        ...env.settings,
        commonPaths: [
          TV_DOWNLOADS,
          { ...TV_LIBRARY, name: '影集' },
          MOVIE_LIBRARY,
        ],
      }),
    )
    await settle()
    expect(renameInput()).toBeNull()
    expect(nameButton('影集').disabled).toBe(false)
  })

  it("A1 加到常用 succeeded: the new row's name is an input with its text selected; leaving it unchanged keeps the name", async () => {
    await render()
    await openFor()
    await type('/data/media/anime/')
    await click(addRow())
    await settle()
    const field = renameInput() as HTMLInputElement
    expect(field.value).toBe('media/anime')
    expect(document.activeElement).toBe(field)
    expect([field.selectionStart, field.selectionEnd]).toEqual([0, 11])
    // Normal mode: the row keeps its selected look (no radio button).
    const row = field.closest('[data-path-row]') as HTMLElement
    expect(row.dataset.selected).toBe('true')
    expect(row.getAttribute('role')).toBeNull()
    await press('Enter', field)
    await settle()
    expect(env.updateSent).toEqual([])
    expect(renameInput()).toBeNull()
    expect(selectedNames()).toEqual(['media/anime'])
    expect(document.activeElement).toBe(rowNamed('media/anime'))
  })

  it('A1 renaming right after 加到常用 sends updateCommonPath for the new path', async () => {
    await render()
    await openFor()
    await type('/data/media/anime')
    await click(addRow())
    await settle()
    await typeInto(renameInput() as HTMLInputElement, '動畫媒體庫')
    await press('Enter', renameInput())
    await settle()
    expect(env.updateSent).toEqual([
      { path: '/data/media/anime', name: '動畫媒體庫' },
    ])
    expect(rowNamed('動畫媒體庫').getAttribute('aria-checked')).toBe('true')
  })

  it('A1 arrow keys step over a row whose rename stays open (an invalid name)', async () => {
    await render()
    await openFor()
    await type('/data/media/anime')
    await click(addRow())
    await settle()
    // Blank: the blur below keeps the input.
    await typeInto(renameInput() as HTMLInputElement, ' ')
    const last = rowNamed('電影媒體庫')
    await act(async () => last.focus())
    await press('ArrowDown', last)
    expect(renameInput()).not.toBeNull()
    // Wraps to the first radio, past the renaming row.
    expect(input().value).toBe('/data/torrents/tv')
  })

  it("D2 an open with editPath: edit mode, that row's name input focused; a plain open is normal mode", async () => {
    await render()
    await act(async () => openChangePath([A], { editPath: '/data/media/tv/' }))
    await settle()
    expect(editPill().textContent).toBe('完成')
    const field = renameInput() as HTMLInputElement
    expect(field.value).toBe('影集媒體庫')
    expect(document.activeElement).toBe(field)
    await press('Escape', field)
    await settle()
    expect(dialog()).not.toBeNull()
    await press('Escape')
    await settle()
    expect(dialog()).toBeNull()
    await openFor()
    expect(editPill().textContent).toBe('編輯')
    expect(renameInput()).toBeNull()
    expect(rows()).toHaveLength(3)
  })

  it('a failed rename gives focus back to its input (it lost focus while disabled), so Esc cancels only the rename', async () => {
    await render()
    await openFor()
    await enterEditMode()
    let fail: (error: Error) => void = () => {}
    env.updateAnswer = () =>
      new Promise((_resolve, reject) => {
        fail = reject
      })
    await click(nameButton('影集媒體庫'))
    await typeInto(renameInput() as HTMLInputElement, '影集')
    await press('Enter', renameInput())
    // Disabled while out, a browser moves focus off it (happy-dom keeps it,
    // so the lost focus is stubbed and the refocus is watched).
    const field = renameInput() as HTMLInputElement
    const focus = vi.spyOn(field, 'focus')
    const active = vi
      .spyOn(document, 'activeElement', 'get')
      .mockReturnValue(document.body)
    await act(async () => fail(new AppError('settings_write_failed')))
    active.mockRestore()
    await settle()
    expect(focus).toHaveBeenCalled()
    expect(document.activeElement).toBe(renameInput())
    expect(renameInput()?.value).toBe('影集')
    await press('Escape', renameInput())
    await settle()
    expect(dialog()).not.toBeNull()
    expect(renameInput()).toBeNull()
    expect(env.updateSent).toHaveLength(1)
  })

  it('a failed ✕ gives focus back to the ✕', async () => {
    await render()
    await openFor()
    await enterEditMode()
    let fail: (error: Error) => void = () => {}
    env.removeAnswer = () =>
      new Promise((_resolve, reject) => {
        fail = reject
      })
    const remove = removeOf(editRowNamed('影集媒體庫'))
    await click(remove)
    const focus = vi.spyOn(remove, 'focus')
    const active = vi
      .spyOn(document, 'activeElement', 'get')
      .mockReturnValue(document.body)
    await act(async () => fail(new AppError('settings_write_failed')))
    active.mockRestore()
    await settle()
    expect(focus).toHaveBeenCalled()
    expect(document.activeElement).toBe(removeOf(editRowNamed('影集媒體庫')))
  })

  it('closing and opening again dismiss the common-path failure toasts of the listed paths', async () => {
    await render()
    await openFor()
    await enterEditMode()
    env.updateAnswer = () =>
      Promise.reject(new AppError('settings_write_failed'))
    await click(checkboxOf(editRowNamed('影集媒體庫')))
    await settle()
    expect(lastFailure()?.[1].keys).toEqual([
      'settings:common-path:/data/media/tv',
    ])
    const dismissedTv = () =>
      toastCalls.dismissFor.mock.calls.filter(
        ([key]) => key === 'settings:common-path:/data/media/tv',
      ).length
    const before = dismissedTv()
    await click(buttonNamed('取消') as HTMLButtonElement)
    expect(dialog()).toBeNull()
    expect(dismissedTv()).toBe(before + 1)
    expect(toastCalls.dismissFor).toHaveBeenCalledWith(
      'settings:common-path:/data/torrents/tv',
    )
    await openFor()
    expect(dismissedTv()).toBe(before + 2)
  })

  it('完成 closes an open rename without saving (an invalid name too)', async () => {
    await render()
    await openFor()
    await enterEditMode()
    await click(nameButton('影集媒體庫'))
    await typeInto(renameInput() as HTMLInputElement, '   ')
    await click(editPill())
    expect(editPill().textContent).toBe('編輯')
    expect(renameInput()).toBeNull()
    expect(rowNamed('影集媒體庫')).toBeDefined()
    // Into edit mode again: no input left over.
    await click(editPill())
    expect(renameInput()).toBeNull()
    expect(env.updateSent).toEqual([])
  })

  it('no common paths: 編輯 is disabled; removing the last one leaves edit mode', async () => {
    env.settings = { ...defaultSettings(), commonPaths: [TV_LIBRARY] }
    env.settingsAnswer = Promise.resolve(env.settings)
    await render()
    await openFor()
    await enterEditMode()
    await click(removeOf(editRowNamed('影集媒體庫')))
    await settle()
    expect(editPill().textContent).toBe('編輯')
    expect(editPill().disabled).toBe(true)
    expect(editRows()).toEqual([])
    expect(addRow()).toBeDefined()
  })

  it('the selected row being renamed: the first radio is the tab stop', async () => {
    await render()
    await openFor()
    await type('/data/media/anime')
    await click(addRow())
    await settle()
    expect(renameInput()).not.toBeNull()
    expect(rows().map((row) => row.tabIndex)).toEqual([0, -1, -1])
  })

  it('the 編輯 pill is disabled before settings answer', async () => {
    env.settingsAnswer = null
    await render()
    await openFor()
    expect(editPill().disabled).toBe(true)
  })
})

describe('edit mode on the phone (spec 5.4)', () => {
  beforeEach(() => {
    env.desktop = false
  })

  it('a 44px pill, 56px rows, a 44px 16px name input', async () => {
    await render()
    await openFor()
    expect(editPill().className).toContain('h-11')
    await enterEditMode()
    expect(editRows()[0].className).toContain('min-h-14')
    await click(nameButton('影集媒體庫'))
    const field = renameInput() as HTMLInputElement
    expect(field.className).toContain('h-11')
    expect(field.className).toContain('text-[16px]')
    expect(document.activeElement).toBe(field)
    // Esc cancels the rename; the sheet stays.
    await press('Escape', field)
    await settle()
    expect(renameInput()).toBeNull()
    expect(dialog()).not.toBeNull()
  })

  it("D2 on the phone: the sheet opens in edit mode with that row's input focused", async () => {
    await render()
    await act(async () =>
      openChangePath([A], { editPath: '/data/media/movies' }),
    )
    await settle()
    await settle()
    const field = renameInput() as HTMLInputElement
    expect(field.value).toBe('電影媒體庫')
    expect(document.activeElement).toBe(field)
  })
})
