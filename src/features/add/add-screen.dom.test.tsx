// @vitest-environment happy-dom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import type { Root } from 'react-dom/client'
import { QueryClientProvider, notifyManager } from '@tanstack/react-query'
import type { QueryClient } from '@tanstack/react-query'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { singleFileInfo, torrentBytes } from '#/lib/bencode-testing'
import { createSha1 } from '#/lib/sha1'
import { fakeCategories, fakeHash, fakeResponse, t } from '#/lib/testing'
import { ALL, UNCATEGORIZED } from '#/shared/categories'
import { DESKTOP_QUERY } from '#/shared/ui/breakpoint'
import type { Category, SlimTorrent } from '#/shared/maindata'
import { defaultSettings } from '#/shared/settings'
import type { Settings } from '#/shared/settings'
import { MAIN_ID } from '#/shared/ui/main-scroll'
import { addOpenStore, closeAdd, openAdd, resetAddOpen } from '#/state/add-open'
import { detailOutsideStore, resetDetailOutside } from '#/state/detail-outside'
import { ListViewContext } from '#/state/list-view'
import type { ListViewControl } from '#/state/list-view'
import { MAINDATA_KEY } from '#/state/maindata'
import { resetOrderFreeze } from '#/state/order-freeze'
import { createQueryClient } from '#/state/query-client'
import { resetShortcuts, setShortcutAction } from '#/state/shortcuts'
import { ViewedHashContext } from '#/state/viewed-hash'
import { AddScreen } from '#/features/add/add-screen'

// Spec 4.6: the add screen in a DOM (A1 to A10, C1, C2, R1, the dialog
// layer). Maindata and the settings are faked; nothing is sent (AD-15, and
// submitting is story 4.7). Test torrents are generated with bencode.

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean | undefined
}

const ARCHIVED = fakeHash(5)
const LIVE = fakeHash(1)
const NEW_A = fakeHash('a')
const NEW_B = fakeHash('b')
const NEW_C = fakeHash('c')

/** NEW_A's 32-char base32 form (the same torrent as its hex). */
function base32(hex: string): string {
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

let torrents: Array<SlimTorrent>
let categories: Record<string, Category>
let settings: Settings
let viewCategory: string
let desktop: boolean
let setHash: ReturnType<typeof vi.fn<(hash: string | null) => void>>
let root: Root
let client: QueryClient

function baseTorrents(): Array<SlimTorrent> {
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

function control(): ListViewControl {
  return {
    view: { sort: 'state', dir: 'desc', category: viewCategory, query: '' },
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

function tree() {
  return (
    <QueryClientProvider client={client}>
      <ListViewContext value={control()}>
        <ViewedHashContext
          value={{ hash: null, setHash, followHash: () => {} }}
        >
          <AddScreen />
        </ViewedHashContext>
      </ListViewContext>
    </QueryClientProvider>
  )
}

async function render() {
  client = createQueryClient({
    fetchMaindata: () =>
      Promise.resolve(fakeResponse({ changed: torrents, categories })),
    fetchSettings: () => Promise.resolve(settings),
    currentPath: () => '/',
  })
  await client.prefetchQuery({ queryKey: MAINDATA_KEY })
  await client.prefetchQuery({ queryKey: ['settings'] })
  const host = document.createElement('div')
  document.body.append(host)
  root = createRoot(host)
  await act(async () => root.render(tree()))
}

const settle = () =>
  act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0))
  })

/** Lets the file reads (which yield with timers) finish. */
async function settleReads(rounds = 30) {
  for (let i = 0; i < rounds; i++) await settle()
}

async function open() {
  await act(async () => openAdd())
  await settle()
}

const screen = () =>
  document.querySelector<HTMLElement>('[role="dialog"]') as HTMLElement
const textarea = () =>
  screen().querySelector<HTMLTextAreaElement>('textarea') as HTMLTextAreaElement
const box = () => screen().querySelector('[data-add-box]')
const rows = () => [...screen().querySelectorAll<HTMLElement>('[data-add-row]')]
const rowStatuses = () => rows().map((row) => row.dataset.addRow)
const rowNames = () =>
  rows().map((row) => row.querySelector('[title]')?.textContent)
const submit = () =>
  screen().querySelector<HTMLButtonElement>(
    '[data-add-submit]',
  ) as HTMLButtonElement
const skipped = () => screen().querySelector('[data-add-skipped]')?.textContent
const select = () =>
  screen().querySelector<HTMLSelectElement>('select') as HTMLSelectElement
const pathLine = () => screen().querySelector('[data-add-path]')?.textContent
const buttonNamed = (name: string) =>
  [...screen().querySelectorAll('button')].find(
    (each) =>
      each.textContent === name || each.getAttribute('aria-label') === name,
  ) as HTMLButtonElement

async function paste(
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

async function pick(files: Array<File>) {
  const input = screen().querySelector<HTMLInputElement>(
    '[data-add-file-input]',
  ) as HTMLInputElement
  Object.defineProperty(input, 'files', { value: files, configurable: true })
  await act(async () => {
    input.dispatchEvent(new Event('change', { bubbles: true }))
  })
}

async function click(element: HTMLElement) {
  await act(async () => element.click())
  await settle()
}

const press = (
  key: string,
  target: Element = document.activeElement ?? document.body,
) =>
  act(async () => {
    target.dispatchEvent(
      new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }),
    )
  })

function torrentFile(name: string, fileName = `${name}.torrent`) {
  const info = singleFileInfo({ name })
  const bytes = torrentBytes(info)
  return { file: new File([new Uint8Array(bytes)], fileName), bytes }
}

/** The info hash of a generated torrent, worked out the slow way. */
function infoHashOf(name: string): string {
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

function setDesktop(on: boolean) {
  desktop = on
}

/** Crosses 1024px while mounted. */
async function crossTo(on: boolean) {
  setDesktop(on)
  await act(async () => {
    for (const listener of [...mediaListeners]) listener()
  })
  await settle()
}

/** Types into the paste textarea (not confirmed). */
async function type(text: string) {
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
        matches: query === DESKTOP_QUERY ? desktop : query.includes('reduce'),
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
  torrents = baseTorrents()
  categories = {
    ...fakeCategories(),
    'X-default': { name: 'X-default', savePath: '' },
  }
  settings = defaultSettings()
  viewCategory = ALL
  setDesktop(true)
  setHash = vi.fn<(hash: string | null) => void>()
  resetAddOpen()
  resetDetailOutside()
  resetOrderFreeze()
  resetShortcuts()
})

afterEach(async () => {
  await act(async () => root.unmount())
  client.clear()
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

describe('A1 open', () => {
  it('opens the 640px dialog empty, focus in the paste box, 新增 disabled', async () => {
    await render()
    expect(screen()).toBeNull()
    await open()
    expect(screen().querySelector('h2')?.textContent).toBe('新增種子')
    expect(screen().className).toContain('w-[640px]')
    expect(box()).not.toBeNull()
    expect(textarea().getAttribute('aria-label')).toBe(
      '貼上磁力連結，或把 .torrent 檔拖進來',
    )
    expect(document.activeElement).toBe(textarea())
    expect(submit().textContent).toBe('新增')
    expect(submit().getAttribute('aria-disabled')).toBe('true')
    expect(buttonNamed('取消')).toBeDefined()
    expect(buttonNamed('關閉')).toBeDefined()
    const input = screen().querySelector<HTMLInputElement>('input[type="file"]')
    expect(input?.multiple).toBe(true)
    expect(input?.accept).toBe('.torrent,application/x-bittorrent')
  })

  it('a press on 新增 does nothing yet (story 4.7)', async () => {
    await render()
    await open()
    await paste(`magnet:?xt=urn:btih:${NEW_A}`)
    await click(submit())
    expect(screen()).not.toBeNull()
    expect(rows()).toHaveLength(1)
  })
})

describe('A2 paste', () => {
  it('judges 10 lines: unreadable first, then existing, then addable; a duplicate merges', async () => {
    await render()
    await open()
    await paste(
      [
        `magnet:?xt=urn:btih:${NEW_A}&dn=Fake.A`,
        `magnet:?xt=urn:btih:${base32(NEW_A)}`,
        `magnet:?xt=urn:btih:${NEW_B}`,
        'https://example.invalid/fake.torrent',
        'just words',
        `magnet:?xt=urn:btih:${ARCHIVED}&dn=Archived.Show`,
        `magnet:?xt=urn:btih:${NEW_C}&dn=Fake.C`,
        `magnet:?xt=urn:btih:${NEW_B}`,
        'magnet:?xt=urn:btmh:1220abcd',
        `magnet:?xt=urn:btih:${LIVE}`,
      ].join('\n'),
    )
    expect(box()).toBeNull()
    expect(rowStatuses()).toEqual([
      'unreadable',
      'unreadable',
      'unreadable',
      'unreadable',
      'existing',
      'existing',
      'addable',
      'addable',
      'addable',
    ])
    expect(rowNames()).toEqual([
      'https://example.invalid/fake.torrent',
      'just',
      'words',
      'magnet:?xt=urn:btmh:1220abcd',
      'Archived.Show',
      `magnet:?xt=urn:btih:${LIVE}`,
      'Fake.A',
      `magnet:?xt=urn:btih:${NEW_B}`,
      'Fake.C',
    ])
    expect(
      screen().querySelector('[data-add-list]')?.getAttribute('aria-label'),
    ).toBe('要新增的種子，9 個')
    // Labels and their buttons.
    const first = rows()[0]
    expect(first.querySelector('[data-add-label]')?.textContent).toBe(
      '看不懂這個連結',
    )
    expect(first.textContent).toContain('拿掉')
    expect(rows()[4].textContent).toContain('以前下載過，已整理好')
    expect(rows()[4].textContent).toContain('打開')
    // A link without a name is mono; problem rows are muted.
    expect(rows()[7].querySelector('[title]')?.className).toContain('font-mono')
    expect(rows()[0].querySelector('[title]')?.className).toContain(
      'text-text-muted',
    )
    expect(skipped()).toBe('有 6 個不會加')
    expect(submit().textContent).toBe('新增 3 個')
  })

  it('typed text confirmed with Enter counts as a paste; Shift+Enter does not', async () => {
    await render()
    await open()
    const area = textarea()
    await act(async () => {
      const setter = Object.getOwnPropertyDescriptor(
        HTMLTextAreaElement.prototype,
        'value',
      )?.set
      setter?.call(area, `magnet:?xt=urn:btih:${NEW_A}`)
      area.dispatchEvent(new Event('input', { bubbles: true }))
    })
    await act(async () => {
      area.dispatchEvent(
        new KeyboardEvent('keydown', {
          key: 'Enter',
          shiftKey: true,
          bubbles: true,
          cancelable: true,
        }),
      )
    })
    expect(rows()).toHaveLength(0)
    await press('Enter', area)
    await settle()
    expect(rowStatuses()).toEqual(['addable'])
    // The strip's textarea is empty again.
    expect(textarea().value).toBe('')
  })

  it('never reads the clipboard API', async () => {
    const readText = vi.fn()
    vi.stubGlobal('navigator', { ...navigator, clipboard: { readText } })
    await render()
    await open()
    await paste(`magnet:?xt=urn:btih:${NEW_A}`)
    expect(readText).not.toHaveBeenCalled()
  })

  it('names render as text, never HTML', async () => {
    await render()
    await open()
    await paste(
      `magnet:?xt=urn:btih:${NEW_A}&dn=${encodeURIComponent('<img src=x onerror=alert(1)>')}`,
    )
    expect(screen().querySelector('img')).toBeNull()
    expect(rowNames()).toEqual(['<img src=x onerror=alert(1)>'])
  })
})

describe('A3 files', () => {
  it('reads picked files: a torrent, a non-torrent, an 11 MB file', async () => {
    await render()
    await open()
    const good = torrentFile('Fake.File.S01')
    await pick([
      good.file,
      new File(['hello'], 'notes.txt'),
      new File([new Uint8Array(11 * 1024 * 1024)], 'huge.torrent'),
    ])
    await settleReads()
    expect(rowStatuses()).toEqual(['unreadable', 'unreadable', 'addable'])
    expect(
      rows().map(
        (row) => row.querySelector('[data-add-label]')?.textContent ?? null,
      ),
    ).toEqual(['看不懂這個檔案', '檔案超過 10 MB', null])
    expect(rowNames()).toEqual(['notes.txt', 'huge.torrent', 'Fake.File.S01'])
  })

  it('pasted files are read like picked ones', async () => {
    await render()
    await open()
    await paste('Fake.File.S01.torrent', [torrentFile('Fake.File.S01').file])
    await settleReads()
    expect(rowNames()).toEqual(['Fake.File.S01'])
  })

  it('shows 讀取中… while files are read', async () => {
    let finish: (buffer: ArrayBuffer) => void = () => {}
    const slow = {
      name: 'slow.torrent',
      size: 10,
      arrayBuffer: () =>
        new Promise<ArrayBuffer>((resolve) => {
          finish = resolve
        }),
    } as unknown as File
    await render()
    await open()
    await pick([slow])
    await settle()
    expect(box()?.textContent).toContain('讀取中…')
    await act(async () => finish(new ArrayBuffer(0)))
    await settleReads()
    expect(rowStatuses()).toEqual(['unreadable'])
    expect(
      screen().querySelector('[data-add-strip]')?.textContent,
    ).not.toContain('讀取中…')
  })
})

describe('A4 and A6 existing', () => {
  it('a magnet of an archived torrent is 以前下載過 with 打開, which closes and opens the detail', async () => {
    await render()
    await open()
    await paste(`magnet:?xt=urn:btih:${ARCHIVED.toUpperCase()}`)
    expect(rowStatuses()).toEqual(['existing'])
    await click(
      buttonNamed(`打開 magnet:?xt=urn:btih:${ARCHIVED.toUpperCase()}`),
    )
    expect(addOpenStore.state.open).toBe(false)
    expect(setHash).toHaveBeenCalledWith(ARCHIVED)
    expect(detailOutsideStore.state.hash).toBe(ARCHIVED)
  })
})

describe('A5 remove', () => {
  it('✕ and 拿掉 remove a row; the last one gone brings the box back', async () => {
    await render()
    await open()
    await paste(
      `junk\nmagnet:?xt=urn:btih:${NEW_A}\nmagnet:?xt=urn:btih:${NEW_B}`,
    )
    expect(rows()).toHaveLength(3)
    buttonNamed('拿掉').focus()
    await click(buttonNamed('拿掉'))
    expect(rowStatuses()).toEqual(['addable', 'addable'])
    expect(skipped()).toBe('')
    // Focus moved to a remaining ✕, never to body.
    expect(document.activeElement?.hasAttribute('data-add-remove')).toBe(true)
    const removes = () => [
      ...screen().querySelectorAll<HTMLElement>('[data-add-remove]'),
    ]
    await click(removes()[0])
    expect(submit().textContent).toBe('新增 1 個')
    await click(removes()[0])
    expect(rows()).toHaveLength(0)
    expect(box()).not.toBeNull()
    expect(submit().textContent).toBe('新增')
    // Focus is back on the box's textarea.
    expect(document.activeElement).toBe(textarea())
    expect(box()?.contains(document.activeElement)).toBe(true)
  })

  it('removing a row also removes the copies of its hash merged into it', async () => {
    await render()
    await open()
    await paste(`magnet:?xt=urn:btih:${NEW_A}`)
    await paste(`magnet:?xt=urn:btih:${base32(NEW_A)}`)
    expect(rows()).toHaveLength(1)
    await click(
      screen().querySelector<HTMLElement>('[data-add-remove]') as HTMLElement,
    )
    expect(rows()).toHaveLength(0)
    expect(box()).not.toBeNull()
  })
})

describe('A7 and A8 category', () => {
  it.each([
    ['mteam-X', 'mteam-X'],
    [ALL, ''],
    [UNCATEGORIZED, ''],
  ])('opened in %s the menu starts at %j', async (view, expected) => {
    viewCategory = view
    await render()
    await open()
    expect(select().value).toBe(expected)
  })

  it('lists every qBittorrent category in tab order; the path line follows', async () => {
    settings = { ...defaultSettings(), categoryOrder: ['mteam-tv'] }
    await render()
    await open()
    const values = [...select().options].map((option) => option.value)
    expect(values).toEqual(['', 'mteam-tv', 'mteam-X', 'X', 'X-default'])
    expect(pathLine()).toBe('')
    await act(async () => {
      select().value = 'X'
      select().dispatchEvent(new Event('change', { bubbles: true }))
    })
    expect(pathLine()).toBe('會存到 /data/media/X')
    expect(
      screen().querySelector('[data-add-path] .font-mono')?.textContent,
    ).toBe('/data/media/X')
    await act(async () => {
      select().value = 'X-default'
      select().dispatchEvent(new Event('change', { bubbles: true }))
    })
    expect(pathLine()).toBe('會存到 qBittorrent 的預設位置')
  })
})

describe('A9 footer', () => {
  it('7 addable and 3 not: 有 3 個不會加 and 新增 7 個; disabled without a category', async () => {
    await render()
    await open()
    await paste(
      [
        ...Array.from(
          { length: 7 },
          (_, index) => `magnet:?xt=urn:btih:${fakeHash(100 + index)}`,
        ),
        'junk',
        'http://example.invalid',
        `magnet:?xt=urn:btih:${ARCHIVED}`,
      ].join('\n'),
    )
    expect(skipped()).toBe('有 3 個不會加')
    expect(submit().textContent).toBe('新增 7 個')
    expect(submit().getAttribute('aria-disabled')).toBe('true')
    await act(async () => {
      select().value = 'X'
      select().dispatchEvent(new Event('change', { bubbles: true }))
    })
    expect(submit().hasAttribute('aria-disabled')).toBe(false)
  })

  it('0 addable stays disabled with a category', async () => {
    viewCategory = 'X'
    await render()
    await open()
    await paste('junk')
    expect(submit().textContent).toBe('新增')
    expect(submit().getAttribute('aria-disabled')).toBe('true')
  })
})

describe('A10 append', () => {
  it('a second paste and a pick are judged with the rows already there', async () => {
    await render()
    await open()
    await paste(`magnet:?xt=urn:btih:${NEW_A}&dn=Fake.A`)
    await paste(
      `junk\nmagnet:?xt=urn:btih:${NEW_A}\nmagnet:?xt=urn:btih:${NEW_B}`,
    )
    expect(rowStatuses()).toEqual(['unreadable', 'addable', 'addable'])
    expect(rowNames()).toEqual([
      'junk',
      'Fake.A',
      `magnet:?xt=urn:btih:${NEW_B}`,
    ])
    await pick([torrentFile('Fake.File.S01').file])
    await settleReads()
    expect(rowNames()).toEqual([
      'junk',
      'Fake.A',
      `magnet:?xt=urn:btih:${NEW_B}`,
      'Fake.File.S01',
    ])
  })

  it('files dropped while open are appended (the queue)', async () => {
    await render()
    await open()
    await paste(`magnet:?xt=urn:btih:${NEW_A}`)
    await act(async () => openAdd([torrentFile('Fake.Dropped').file]))
    await settleReads()
    expect(rowNames()).toEqual([`magnet:?xt=urn:btih:${NEW_A}`, 'Fake.Dropped'])
  })
})

describe('C1 close', () => {
  it.each(['取消', '關閉', 'Escape'])(
    '%s closes and the next open is empty',
    async (how) => {
      await render()
      await open()
      await paste(`magnet:?xt=urn:btih:${NEW_A}`)
      if (how === 'Escape') await press('Escape', textarea())
      else await click(buttonNamed(how))
      await settle()
      expect(addOpenStore.state.open).toBe(false)
      expect(screen()).toBeNull()
      await open()
      expect(rows()).toHaveLength(0)
      expect(box()).not.toBeNull()
    },
  )

  it('a press outside leaves it open', async () => {
    await render()
    await open()
    const scrim = document.querySelector<HTMLElement>(
      '[data-slot="dialog-overlay"]',
    )
    await act(async () => {
      scrim?.dispatchEvent(
        new PointerEvent('pointerdown', { bubbles: true, cancelable: true }),
      )
    })
    await settle()
    expect(addOpenStore.state.open).toBe(true)
  })
})

describe('C2 late read', () => {
  it('files still being read when it closes are dropped', async () => {
    let finish: (buffer: ArrayBuffer) => void = () => {}
    const bytes = torrentFile('Fake.Late').bytes
    const slow = {
      name: 'late.torrent',
      size: bytes.length,
      arrayBuffer: () =>
        new Promise<ArrayBuffer>((resolve) => {
          finish = resolve
        }),
    } as unknown as File
    await render()
    await open()
    await pick([slow])
    await settle()
    await act(async () => closeAdd())
    await open()
    await act(async () => finish(bytes.slice().buffer))
    await settleReads()
    expect(rows()).toHaveLength(0)
    expect(box()).not.toBeNull()
  })
})

describe('R1 maindata change', () => {
  it('a pasted addable torrent that appears in maindata turns 以前下載過', async () => {
    const hash = infoHashOf('Fake.File.S01')
    await render()
    await open()
    await pick([torrentFile('Fake.File.S01').file])
    await settleReads()
    expect(rowStatuses()).toEqual(['addable'])
    torrents = [...baseTorrents(), t({ hash, name: 'Fake.File.S01' })]
    await act(async () => {
      await client.refetchQueries({ queryKey: MAINDATA_KEY })
    })
    await settle()
    expect(rowStatuses()).toEqual(['existing'])
  })
})

describe('the dialog layer', () => {
  it('no shortcut runs while it is open; Esc closes it', async () => {
    const openSearch = vi.fn(() => true)
    setShortcutAction('openSearch', openSearch)
    await render()
    await open()
    await act(async () => buttonNamed('取消').focus())
    await press('/')
    expect(openSearch).not.toHaveBeenCalled()
    await press('Escape')
    expect(addOpenStore.state.open).toBe(false)
    await press('/')
    expect(openSearch).toHaveBeenCalledTimes(1)
  })
})

describe('the phone sheet', () => {
  it('a 90% sheet titled 新增種子 with the button pinned under it and no cancel', async () => {
    setDesktop(false)
    await render()
    await open()
    const sheet = document.querySelector<HTMLElement>(
      '[data-slot="bottom-sheet"]',
    )
    expect(sheet).not.toBeNull()
    expect(sheet?.querySelector('h2')?.textContent).toBe('新增種子')
    expect(textarea().getAttribute('aria-label')).toBe('貼上磁力連結')
    expect(box()?.textContent).toContain('貼上磁力連結')
    expect(box()?.textContent).not.toContain('拖')
    const footer = sheet?.querySelector('[data-slot="bottom-sheet-footer"]')
    expect(footer?.querySelector('[data-add-submit]')).not.toBeNull()
    // The category and 會存到 stay in view in the pinned footer; the list is
    // the sheet's scrolling content.
    expect(footer?.querySelector('select')).not.toBeNull()
    expect(footer?.querySelector('[data-add-path]')).not.toBeNull()
    const content = sheet?.querySelector('[data-slot="bottom-sheet-content"]')
    expect(content?.querySelector('[data-add-box]')).not.toBeNull()
    expect(buttonNamed('取消')).toBeUndefined()
    await paste(`junk\nmagnet:?xt=urn:btih:${ARCHIVED}`)
    expect(content?.querySelector('[data-add-frame]')).not.toBeNull()
    expect(screen().querySelector('[data-add-strip]')?.className).toContain(
      'sticky',
    )
    // Labels sit on the line under the name; 44px buttons.
    const row = rows()[0]
    expect(row.className).toContain('min-h-12')
    expect(row.querySelector('[data-add-remove]')?.className).toContain(
      'size-11',
    )
    await press('Escape')
    await settle()
    expect(addOpenStore.state.open).toBe(false)
  })
})

describe('the typed draft', () => {
  it('survives a pick that turns the box into the list', async () => {
    await render()
    await open()
    await type('magnet:?xt=urn:btih:')
    await pick([torrentFile('Fake.File.S01').file])
    await settleReads()
    expect(box()).toBeNull()
    expect(rows()).toHaveLength(1)
    expect(textarea().value).toBe('magnet:?xt=urn:btih:')
  })

  it('survives crossing 1024px', async () => {
    await render()
    await open()
    await paste(`magnet:?xt=urn:btih:${NEW_A}`)
    await type('half typed')
    await crossTo(false)
    expect(document.querySelector('[data-slot="bottom-sheet"]')).not.toBeNull()
    expect(rows()).toHaveLength(1)
    expect(textarea().value).toBe('half typed')
  })

  it('a paste while typing goes into the draft at the caret, judged on Enter', async () => {
    await render()
    await open()
    await type('magnet:?xt=urn:btih:&dn=Fake.A')
    const area = textarea()
    area.setSelectionRange(20, 20)
    await paste(NEW_A, [], area)
    expect(rows()).toHaveLength(0)
    expect(textarea().value).toBe(`magnet:?xt=urn:btih:${NEW_A}&dn=Fake.A`)
    expect(textarea().selectionStart).toBe(20 + NEW_A.length)
    await press('Enter', textarea())
    await settle()
    expect(rowNames()).toEqual(['Fake.A'])
    expect(textarea().value).toBe('')
  })

  it('every open starts with an empty draft, the phone sheet too', async () => {
    await render()
    await open()
    await type('left over')
    await click(buttonNamed('取消'))
    await open()
    expect(textarea().value).toBe('')
    await act(async () => closeAdd())
    await crossTo(false)
    await open()
    await type('left over')
    await act(async () => closeAdd())
    await open()
    expect(textarea().value).toBe('')
  })
})

describe('focus when the box and the list swap', () => {
  it('after the first paste focus is on the strip, so a second paste works', async () => {
    await render()
    await open()
    expect(document.activeElement).toBe(textarea())
    await paste(`magnet:?xt=urn:btih:${NEW_A}`)
    expect(box()).toBeNull()
    const strip = screen().querySelector('[data-add-strip]')
    expect(strip?.contains(document.activeElement)).toBe(true)
    await paste(
      `magnet:?xt=urn:btih:${NEW_B}`,
      [],
      document.activeElement as HTMLElement,
    )
    expect(rows()).toHaveLength(2)
  })
})

describe('the read queue', () => {
  it('a pick after close and reopen is read without waiting for the old one', async () => {
    const stuck = {
      name: 'stuck.torrent',
      size: 10,
      arrayBuffer: () => new Promise<ArrayBuffer>(() => {}),
    } as unknown as File
    await render()
    await open()
    await pick([stuck])
    await settle()
    await act(async () => closeAdd())
    await open()
    await pick([torrentFile('Fake.File.S01').file])
    await settleReads()
    expect(rowNames()).toEqual(['Fake.File.S01'])
  })
})

describe('the category resets', () => {
  it('a pick is forgotten on close: the next open has the preset again', async () => {
    viewCategory = 'mteam-X'
    await render()
    await open()
    await act(async () => {
      select().value = 'X'
      select().dispatchEvent(new Event('change', { bubbles: true }))
    })
    expect(select().value).toBe('X')
    await click(buttonNamed('取消'))
    await open()
    expect(select().value).toBe('mteam-X')
  })
})

describe('the submit button', () => {
  it('has the solid hover like the other primary buttons', async () => {
    await render()
    await open()
    expect(submit().className).toContain('hover-solid')
  })
})
