// @vitest-environment happy-dom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { QueryClientProvider, notifyManager } from '@tanstack/react-query'
import type { QueryClient } from '@tanstack/react-query'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { fakeHash, fakeResponse, t } from '#/lib/testing'
import type { MaindataResponse } from '#/shared/maindata'
import { MAINDATA_KEY } from '#/state/maindata'
import {
  freezeStore,
  isBoardFrozen,
  isOrderFrozen,
  resetOrderFreeze,
} from '#/state/order-freeze'
import { createQueryClient } from '#/state/query-client'
import {
  clearSelection,
  pruneSelection,
  resetSelection,
  selectionStore,
  syncSelectionScope,
  toggleSelected,
  useIsSelected,
  useSelectionUpkeep,
} from '#/state/selection'

// Spec 4.1: the ordered selection, its scope, the prune after maindata
// and the list's freeze reason.

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean | undefined
}

const A = fakeHash(0xa)
const B = fakeHash(0xb)
const C = fakeHash(0xc)

const hashes = () => selectionStore.state.hashes

beforeEach(() => {
  resetSelection()
  resetOrderFreeze()
})

afterEach(() => {
  resetSelection()
  resetOrderFreeze()
})

describe('the selection store', () => {
  it('tick order: B, A, C is [B, A, C]; unticking A leaves [B, C]', () => {
    toggleSelected(B)
    toggleSelected(A)
    toggleSelected(C)
    expect(hashes()).toEqual([B, A, C])
    toggleSelected(A)
    expect(hashes()).toEqual([B, C])
  })

  it('gone hash: [B, A] without A in the data is [B]', () => {
    toggleSelected(B)
    toggleSelected(A)
    pruneSelection((hash) => hash === B)
    expect(hashes()).toEqual([B])
  })

  it('a prune that drops nothing keeps the same array', () => {
    toggleSelected(B)
    const before = hashes()
    pruneSelection(() => true)
    expect(hashes()).toBe(before)
  })

  it('another scope clears; the same scope keeps it', () => {
    syncSelectionScope('["",""]')
    toggleSelected(B)
    syncSelectionScope('["",""]')
    expect(hashes()).toEqual([B])
    syncSelectionScope('["X",""]')
    expect(hashes()).toEqual([])
    toggleSelected(A)
    syncSelectionScope('["X","show"]')
    expect(hashes()).toEqual([])
  })

  it('the list freezes while anything is selected; the board never does', () => {
    expect(isOrderFrozen(freezeStore.state)).toBe(false)
    toggleSelected(B)
    expect(freezeStore.state.selection).toBe(true)
    expect(isOrderFrozen(freezeStore.state)).toBe(true)
    expect(isBoardFrozen(freezeStore.state)).toBe(false)
    toggleSelected(A)
    toggleSelected(B)
    expect(isOrderFrozen(freezeStore.state)).toBe(true)
    toggleSelected(A)
    expect(isOrderFrozen(freezeStore.state)).toBe(false)
  })

  it('clearing, pruning everything and a new scope each end the reason', () => {
    toggleSelected(B)
    clearSelection()
    expect(freezeStore.state.selection).toBe(false)
    toggleSelected(B)
    pruneSelection(() => false)
    expect(hashes()).toEqual([])
    expect(freezeStore.state.selection).toBe(false)
    syncSelectionScope('a')
    toggleSelected(B)
    syncSelectionScope('b')
    expect(freezeStore.state.selection).toBe(false)
  })
})

describe('useSelectionUpkeep and useIsSelected', () => {
  let client: QueryClient
  let answers: Array<MaindataResponse>
  const seen: Array<boolean> = []

  function Probe({ category, query }: { category: string; query: string }) {
    useSelectionUpkeep(category, query)
    seen.push(useIsSelected(A))
    return null
  }

  async function mount() {
    globalThis.IS_REACT_ACT_ENVIRONMENT = true
    notifyManager.setScheduler((callback) => callback())
    seen.length = 0
    answers = [fakeResponse({ changed: [t({ hash: A }), t({ hash: B })] })]
    let count = 0
    client = createQueryClient({
      fetchMaindata: () => {
        count += 1
        return Promise.resolve(answers[Math.min(count, answers.length) - 1])
      },
      currentPath: () => '/',
    })
    await client.prefetchQuery({ queryKey: MAINDATA_KEY })
    const root = createRoot(document.createElement('div'))
    const render = (category: string, query = '') =>
      act(async () =>
        root.render(
          <QueryClientProvider client={client}>
            <Probe category={category} query={query} />
          </QueryClientProvider>,
        ),
      )
    return {
      render,
      unmount: () => act(async () => root.unmount()),
      poll: async (response: MaindataResponse) => {
        answers.push(response)
        await act(async () => {
          await client.refetchQueries({ queryKey: MAINDATA_KEY })
        })
      },
    }
  }

  afterEach(() => {
    client.clear()
    notifyManager.setScheduler((callback) => setTimeout(callback, 0))
    globalThis.IS_REACT_ACT_ENVIRONMENT = false
  })

  it('category change clears; the settings round trip (unmount, same scope) keeps it', async () => {
    const view = await mount()
    await view.render('X')
    await act(async () => toggleSelected(A))
    expect(seen.at(-1)).toBe(true)
    // /settings: the home route unmounts, then comes back to the same list.
    await view.unmount()
    const again = await mount()
    await again.render('X')
    expect(hashes()).toEqual([A])
    await again.render('mteam-X')
    expect(hashes()).toEqual([])
    expect(seen.at(-1)).toBe(false)
    await again.unmount()
  })

  it('a new keyword clears too', async () => {
    const view = await mount()
    await view.render('X')
    await act(async () => toggleSelected(A))
    await view.render('X', 'show')
    expect(hashes()).toEqual([])
    await view.unmount()
  })

  it('a torrent gone from maindata drops out; all gone ends the freeze', async () => {
    const view = await mount()
    await view.render('X')
    await act(async () => {
      toggleSelected(B)
      toggleSelected(A)
    })
    await view.poll(fakeResponse({ changed: [t({ hash: B })] }))
    expect(hashes()).toEqual([B])
    await view.poll(fakeResponse({ changed: [t({ hash: C })] }))
    expect(hashes()).toEqual([])
    expect(freezeStore.state.selection).toBe(false)
    await view.unmount()
  })
})
