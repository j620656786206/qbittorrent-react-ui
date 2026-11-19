// @vitest-environment happy-dom
import { act } from 'react'
import type { ComponentType } from 'react'
import { createRoot } from 'react-dom/client'
import type { Root } from 'react-dom/client'
import { QueryClientProvider, notifyManager } from '@tanstack/react-query'
import type { QueryClient } from '@tanstack/react-query'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fakeHash, fakeResponse, t } from '#/lib/testing'
import { ALL } from '#/shared/categories'
import { DESKTOP_QUERY } from '#/shared/ui/breakpoint'
import { ListViewContext } from '#/state/list-view'
import type { ListViewControl } from '#/state/list-view'
import { MAINDATA_KEY } from '#/state/maindata'
import { freezeStore, resetOrderFreeze } from '#/state/order-freeze'
import { createQueryClient } from '#/state/query-client'
import {
  resetSelection,
  selectionStore,
  toggleSelected,
} from '#/state/selection'
import { Route } from '#/routes/_authed/index'

// Spec 4.2 (replacing 4.1's clear below 1024px): the selection survives
// the width crossing 1024px either way, and the bar takes the layout of
// the side it is on. The screens themselves are stubbed out.

vi.mock('#/features/board/torrent-board', () => ({ TorrentBoard: () => null }))
vi.mock('#/features/list/torrent-list', () => ({ TorrentList: () => null }))
vi.mock('#/features/detail/board-detail-panel', () => ({
  BoardDetailPanel: () => null,
}))
vi.mock('#/features/detail/list-detail-panel', () => ({
  ListDetailPanel: () => null,
}))
vi.mock('#/features/detail/phone-detail-sheet', () => ({
  BoardDetailSheet: () => null,
  ListDetailSheet: () => null,
}))
const barLayouts = vi.hoisted(() => [] as Array<boolean>)
vi.mock('#/features/selection/selection-bar', () => ({
  SelectionBar: ({ desktop }: { desktop: boolean }) => {
    barLayouts.push(desktop)
    return null
  },
}))

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean | undefined
}

const A = fakeHash(1)
let desktop = true
const listeners = new Set<() => void>()
let root: Root
let client: QueryClient
/** The view Home reads; `query` is the URL's `q`. */
let query = ''

const control = (): ListViewControl => ({
  view: { sort: 'added_on', dir: 'desc', category: ALL, query },
  viewReady: true,
  setView: () => {},
  pickView: () => {},
  selectCategory: () => {},
  rememberedHint: false,
  openSettings: () => {},
  settingsOpen: false,
  searchOpen: query !== '',
  openSearch: () => {},
  setQuery: () => {},
  closeSearch: () => {},
})

function renderHome() {
  const Home = Route.options.component as ComponentType
  return act(async () =>
    root.render(
      <QueryClientProvider client={client}>
        <ListViewContext value={control()}>
          <Home />
        </ListViewContext>
      </QueryClientProvider>,
    ),
  )
}

beforeEach(async () => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true
  notifyManager.setScheduler((callback) => callback())
  resetSelection()
  resetOrderFreeze()
  barLayouts.length = 0
  desktop = true
  query = ''
  vi.spyOn(window, 'matchMedia').mockImplementation(
    (media: string) =>
      ({
        get matches() {
          return media === DESKTOP_QUERY ? desktop : false
        },
        media,
        addEventListener: (_: string, listener: () => void) =>
          listeners.add(listener),
        removeEventListener: (_: string, listener: () => void) =>
          listeners.delete(listener),
      }) as unknown as MediaQueryList,
  )
  client = createQueryClient({
    fetchMaindata: () =>
      Promise.resolve(fakeResponse({ changed: [t({ hash: A })] })),
    currentPath: () => '/',
  })
  await client.prefetchQuery({ queryKey: MAINDATA_KEY })
  root = createRoot(document.createElement('div'))
  await renderHome()
})

afterEach(async () => {
  await act(async () => root.unmount())
  client.clear()
  listeners.clear()
  resetSelection()
  resetOrderFreeze()
  vi.restoreAllMocks()
  notifyManager.setScheduler((callback) => setTimeout(callback, 0))
  globalThis.IS_REACT_ACT_ENVIRONMENT = false
})

describe('the home route and the width', () => {
  it('a desktop selection stays at desktop width', async () => {
    await act(async () => toggleSelected(A))
    expect(selectionStore.state.hashes).toEqual([A])
    expect(freezeStore.state.selection).toBe(true)
  })

  const cross = async (toDesktop: boolean) => {
    desktop = toDesktop
    await act(async () => {
      for (const listener of listeners) listener()
    })
  }

  it('crossing below 1024px keeps it (and the freeze); the bar takes the phone layout', async () => {
    const B = fakeHash(2)
    await act(async () => {
      toggleSelected(A)
      toggleSelected(B)
    })
    expect(barLayouts.at(-1)).toBe(true)
    await cross(false)
    expect(selectionStore.state.hashes).toEqual([A, B])
    expect(freezeStore.state.selection).toBe(true)
    expect(barLayouts.at(-1)).toBe(false)
  })

  it('a phone selection crossing to desktop is kept too', async () => {
    await cross(false)
    await act(async () => toggleSelected(A))
    await cross(true)
    expect(selectionStore.state.hashes).toEqual([A])
    expect(freezeStore.state.selection).toBe(true)
    expect(barLayouts.at(-1)).toBe(true)
  })

  it('a new search keyword (the view Home reads) clears it', async () => {
    await act(async () => toggleSelected(A))
    await renderHome()
    expect(selectionStore.state.hashes).toEqual([A])
    query = 'show'
    await renderHome()
    expect(selectionStore.state.hashes).toEqual([])
    expect(freezeStore.state.selection).toBe(false)
  })
})
