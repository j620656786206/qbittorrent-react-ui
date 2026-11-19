// @vitest-environment happy-dom
import { act } from 'react'
import type { ComponentType } from 'react'
import { createRoot } from 'react-dom/client'
import type { Root } from 'react-dom/client'
import { QueryClientProvider, notifyManager } from '@tanstack/react-query'
import type { QueryClient } from '@tanstack/react-query'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fakeHash, fakeResponse, t } from '#/lib/testing'
import { DESKTOP_QUERY } from '#/shared/ui/breakpoint'
import { MAINDATA_KEY } from '#/state/maindata'
import { freezeStore, resetOrderFreeze } from '#/state/order-freeze'
import { createQueryClient } from '#/state/query-client'
import {
  resetSelection,
  selectionStore,
  toggleSelected,
} from '#/state/selection'
import { Route } from '#/routes/_authed/index'

// Spec 4.1 review: the home route drops a desktop selection when the width
// crosses below 1024px (no phone selection until story 4.2), so the phone
// list is not left frozen. The screens themselves are stubbed out.

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
vi.mock('#/features/selection/selection-bar', () => ({
  SelectionBar: () => null,
}))

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean | undefined
}

const A = fakeHash(1)
let desktop = true
const listeners = new Set<() => void>()
let root: Root
let client: QueryClient

beforeEach(async () => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true
  notifyManager.setScheduler((callback) => callback())
  resetSelection()
  resetOrderFreeze()
  desktop = true
  vi.spyOn(window, 'matchMedia').mockImplementation(
    (query: string) =>
      ({
        get matches() {
          return query === DESKTOP_QUERY ? desktop : false
        },
        media: query,
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
  const Home = Route.options.component as ComponentType
  root = createRoot(document.createElement('div'))
  await act(async () =>
    root.render(
      <QueryClientProvider client={client}>
        <Home />
      </QueryClientProvider>,
    ),
  )
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

  it('crossing below 1024px clears it and ends the freeze reason', async () => {
    await act(async () => toggleSelected(A))
    desktop = false
    await act(async () => {
      for (const listener of listeners) listener()
    })
    expect(selectionStore.state.hashes).toEqual([])
    expect(freezeStore.state.selection).toBe(false)
  })
})
