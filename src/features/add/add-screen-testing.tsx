import { act } from 'react'
import { createRoot } from 'react-dom/client'
import type { Root } from 'react-dom/client'
import { QueryClientProvider, notifyManager } from '@tanstack/react-query'
import type { QueryClient } from '@tanstack/react-query'
import { afterEach, beforeEach, vi } from 'vitest'
import { singleFileInfo, torrentBytes } from '#/lib/bencode-testing'
import { createSha1 } from '#/lib/sha1'
import { fakeCategories, fakeHash, fakeResponse, t } from '#/lib/testing'
import { ALL } from '#/shared/categories'
import { DESKTOP_QUERY } from '#/shared/ui/breakpoint'
import type { Category, SlimTorrent } from '#/shared/maindata'
import { defaultSettings } from '#/shared/settings'
import type { Settings } from '#/shared/settings'
import { MAIN_ID } from '#/shared/ui/main-scroll'
import { openAdd, resetAddOpen } from '#/state/add-open'
import { resetDetailOutside } from '#/state/detail-outside'
import { ListViewContext } from '#/state/list-view'
import type { ListViewControl } from '#/state/list-view'
import { MAINDATA_KEY } from '#/state/maindata'
import { resetOrderFreeze } from '#/state/order-freeze'
import { createQueryClient } from '#/state/query-client'
import { resetShortcuts } from '#/state/shortcuts'
import { ViewedHashContext } from '#/state/viewed-hash'
import { AddScreen } from '#/features/add/add-screen'

// Spec 4.6: the add screen's DOM test harness, shared by
// add-screen.dom.test.tsx and add-screen-more.dom.test.tsx (one file was
// past 1,000 lines). Maindata and the settings are faked; nothing is sent
// (AD-15, and submitting is story 4.7). Test torrents are generated with
// bencode. Importing it registers the shared beforeEach and afterEach.

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean | undefined
}

export const ARCHIVED = fakeHash(5)
export const LIVE = fakeHash(1)
export const NEW_A = fakeHash('a')
export const NEW_B = fakeHash('b')
export const NEW_C = fakeHash('c')

/** NEW_A's 32-char base32 form (the same torrent as its hex). */
export function base32(hex: string): string {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'
  let bits = ''
  for (const char of hex)
    bits += parseInt(char, 16).toString(2).padStart(4, '0')
  let out = ''
  for (let i = 0; i < bits.length; i += 5) {
    out += alphabet[parseInt(bits.slice(i, i + 5), 2)]
  }
  return out
}

/** What each test may change; reset before each test. */
interface Env {
  torrents: Array<SlimTorrent>
  categories: Record<string, Category>
  settings: Settings
  viewCategory: string
  desktop: boolean
  setHash: ReturnType<typeof vi.fn<(hash: string | null) => void>>
  client: QueryClient
  /** Resolves the first maindata answer of a `render({ loaded: false })`. */
  loadMaindata: () => void
}

export const env = { loadMaindata: () => {} } as Env
let root: Root

export function baseTorrents(): Array<SlimTorrent> {
  return [
    t({ hash: LIVE, name: 'Live.Show', category: 'X' }),
    // Non-private missingFiles: archived (已整理).
    t({
      hash: ARCHIVED,
      name: 'Archived.Show',
      state: 'missingFiles',
      progress: 1,
      private: false,
    }),
  ]
}

export function control(): ListViewControl {
  return {
    view: { sort: 'state', dir: 'desc', category: env.viewCategory, query: '' },
    viewReady: true,
    setView: () => {},
    pickView: () => {},
    selectCategory: () => {},
    rememberedHint: false,
    openSettings: () => {},
    settingsOpen: false,
    searchOpen: false,
    openSearch: () => {},
    setQuery: () => {},
    closeSearch: () => {},
  }
}

export function tree() {
  return (
    <QueryClientProvider client={env.client}>
      <ListViewContext value={control()}>
        <ViewedHashContext
          value={{ hash: null, setHash: env.setHash, followHash: () => {} }}
        >
          <AddScreen />
        </ViewedHashContext>
      </ListViewContext>
    </QueryClientProvider>
  )
}

export async function render({ loaded = true } = {}) {
  let first = true
  env.client = createQueryClient({
    fetchMaindata: () => {
      const answer = fakeResponse({
        changed: env.torrents,
        categories: env.categories,
      })
      if (loaded || !first) return Promise.resolve(answer)
      first = false
      return new Promise((resolve) => {
        env.loadMaindata = () => resolve(answer)
      })
    },
    fetchSettings: () => Promise.resolve(env.settings),
    currentPath: () => '/',
  })
  if (loaded) await env.client.prefetchQuery({ queryKey: MAINDATA_KEY })
  await env.client.prefetchQuery({ queryKey: ['settings'] })
  const host = document.createElement('div')
  document.body.append(host)
  root = createRoot(host)
  await act(async () => root.render(tree()))
}

export const settle = () =>
  act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0))
  })

/** Lets the file reads (which yield with timers) finish. */
export async function settleReads(rounds = 30) {
  for (let i = 0; i < rounds; i++) await settle()
}

export async function open() {
  await act(async () => openAdd())
  await settle()
}

export const screen = () =>
  document.querySelector<HTMLElement>('[role="dialog"]') as HTMLElement
export const textarea = () =>
  screen().querySelector<HTMLTextAreaElement>('textarea') as HTMLTextAreaElement
export const box = () => screen().querySelector('[data-add-box]')
export const rows = () => [
  ...screen().querySelectorAll<HTMLElement>('[data-add-row]'),
]
export const rowStatuses = () => rows().map((row) => row.dataset.addRow)
export const rowNames = () =>
  rows().map((row) => row.querySelector('[title]')?.textContent)
export const submit = () =>
  screen().querySelector<HTMLButtonElement>(
    '[data-add-submit]',
  ) as HTMLButtonElement
export const skipped = () =>
  screen().querySelector('[data-add-skipped]')?.textContent
export const select = () =>
  screen().querySelector<HTMLSelectElement>('select') as HTMLSelectElement
export const pathLine = () =>
  screen().querySelector('[data-add-path]')?.textContent
export const buttonNamed = (name: string) =>
  [...screen().querySelectorAll('button')].find(
    (each) =>
      each.textContent === name || each.getAttribute('aria-label') === name,
  ) as HTMLButtonElement

export async function paste(
  text: string,
  files: Array<File> = [],
  target: HTMLElement = textarea(),
) {
  const event = new Event('paste', { bubbles: true, cancelable: true })
  Object.defineProperty(event, 'clipboardData', {
    value: {
      files,
      getData: (format: string) => (format === 'text/plain' ? text : ''),
    },
  })
  await act(async () => {
    target.dispatchEvent(event)
  })
  await settle()
}

export async function pick(files: Array<File>) {
  const input = screen().querySelector<HTMLInputElement>(
    '[data-add-file-input]',
  ) as HTMLInputElement
  Object.defineProperty(input, 'files', { value: files, configurable: true })
  await act(async () => {
    input.dispatchEvent(new Event('change', { bubbles: true }))
  })
}

export async function click(element: HTMLElement) {
  await act(async () => element.click())
  await settle()
}

export const press = (
  key: string,
  target: Element = document.activeElement ?? document.body,
) =>
  act(async () => {
    target.dispatchEvent(
      new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }),
    )
  })

export function torrentFile(name: string, fileName = `${name}.torrent`) {
  const info = singleFileInfo({ name })
  const bytes = torrentBytes(info)
  return { file: new File([new Uint8Array(bytes)], fileName), bytes }
}

/** The info hash of a generated torrent, worked out the slow way. */
export function infoHashOf(name: string): string {
  // `info` is the last key, so its bytes run from after `4:info` to the
  // closing `e` of the outer dictionary.
  const bytes = torrentBytes(singleFileInfo({ name }))
  const marker = new TextEncoder().encode('4:info')
  let at = -1
  for (let i = 0; i < bytes.length - marker.length; i++) {
    if (marker.every((byte, j) => bytes[i + j] === byte)) at = i
  }
  const sha1 = createSha1()
  sha1.update(bytes.subarray(at + marker.length, bytes.length - 1))
  return sha1.digestHex()
}

const mediaListeners = new Set<() => void>()

export function setDesktop(on: boolean) {
  env.desktop = on
}

/** Crosses 1024px while mounted. */
export async function crossTo(on: boolean) {
  setDesktop(on)
  await act(async () => {
    for (const listener of [...mediaListeners]) listener()
  })
  await settle()
}

/** Types into the paste textarea (not confirmed). */
export async function type(text: string) {
  const area = textarea()
  await act(async () => {
    const setter = Object.getOwnPropertyDescriptor(
      HTMLTextAreaElement.prototype,
      'value',
    )?.set
    setter?.call(area, text)
    area.dispatchEvent(new Event('input', { bubbles: true }))
  })
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
        addEventListener: (_type: string, listener: () => void) =>
          mediaListeners.add(listener),
        removeEventListener: (_type: string, listener: () => void) =>
          mediaListeners.delete(listener),
      }) as unknown as MediaQueryList,
  )
  mediaListeners.clear()
  const main = document.createElement('main')
  main.id = MAIN_ID
  main.tabIndex = -1
  document.body.append(main)
  env.torrents = baseTorrents()
  env.categories = {
    ...fakeCategories(),
    'X-default': { name: 'X-default', savePath: '' },
  }
  env.settings = defaultSettings()
  env.viewCategory = ALL
  setDesktop(true)
  env.setHash = vi.fn<(hash: string | null) => void>()
  resetAddOpen()
  resetDetailOutside()
  resetOrderFreeze()
  resetShortcuts()
})

afterEach(async () => {
  await act(async () => root.unmount())
  env.client.clear()
  document.body.replaceChildren()
  resetAddOpen()
  resetDetailOutside()
  resetOrderFreeze()
  resetShortcuts()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
  notifyManager.setScheduler((callback) => setTimeout(callback, 0))
  globalThis.IS_REACT_ACT_ENVIRONMENT = false
})
