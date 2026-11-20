// @vitest-environment happy-dom
import { act, createElement } from 'react'
import { createRoot } from 'react-dom/client'
import type { Root } from 'react-dom/client'
import { QueryClientProvider, notifyManager } from '@tanstack/react-query'
import type { QueryClient } from '@tanstack/react-query'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fakeHash, fakeResponse, t } from '#/lib/testing'
import { ALL } from '#/shared/categories'
import type { MaindataResponse } from '#/shared/maindata'
import { detailOutsideStore, resetDetailOutside } from '#/state/detail-outside'
import { ListViewContext } from '#/state/list-view'
import type { ListViewControl } from '#/state/list-view'
import { MAINDATA_KEY } from '#/state/maindata'
import {
  OPEN_WHEN_ADDED_MS,
  openWhenAdded,
  openWhenAddedStore,
  cancelOpenWhenAdded,
  resetOpenWhenAdded,
  useOpenWhenAddedUpkeep,
} from '#/state/open-when-added'
import { createQueryClient } from '#/state/query-client'
import { ViewedHashContext } from '#/state/viewed-hash'

// Spec 4.7 C5: 「去看」 with one torrent added opens its detail once it is
// in maindata, after the category switch reached the screen; 30 s cap;
// another choice or a new add ends it.

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean | undefined
}

const NEW = fakeHash('e')
const OLD = fakeHash(1)

let root: Root
let client: QueryClient
let answer: MaindataResponse
let setHash: ReturnType<typeof vi.fn<(hash: string | null) => void>>

function Probe() {
  useOpenWhenAddedUpkeep()
  return null
}

function control(category: string): ListViewControl {
  return {
    view: { sort: 'state', dir: 'desc', category, query: '' },
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

function tree(category: string, hash: string | null) {
  return createElement(
    QueryClientProvider,
    { client },
    createElement(
      ListViewContext,
      { value: control(category) },
      createElement(
        ViewedHashContext,
        { value: { hash, setHash, followHash: () => {} } },
        createElement(Probe),
      ),
    ),
  )
}

async function render(category: string, hash: string | null = null) {
  client = createQueryClient({
    fetchMaindata: () => Promise.resolve(answer),
    currentPath: () => '/',
  })
  await client.prefetchQuery({ queryKey: MAINDATA_KEY })
  root = createRoot(document.createElement('div'))
  await act(async () => root.render(tree(category, hash)))
}

const rerender = (category: string, hash: string | null = null) =>
  act(async () => root.render(tree(category, hash)))

async function addToMaindata() {
  answer = fakeResponse({
    changed: [t({ hash: OLD }), t({ hash: NEW, category: 'X' })],
  })
  await act(async () => {
    await client.refetchQueries({ queryKey: MAINDATA_KEY })
  })
}

beforeEach(() => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true
  notifyManager.setScheduler((callback) => callback())
  answer = fakeResponse({ changed: [t({ hash: OLD })] })
  setHash = vi.fn<(hash: string | null) => void>()
  resetOpenWhenAdded()
  resetDetailOutside()
})

afterEach(async () => {
  await act(async () => root.unmount())
  client.clear()
  resetOpenWhenAdded()
  resetDetailOutside()
  vi.useRealTimers()
  notifyManager.setScheduler((callback) => setTimeout(callback, 0))
  globalThis.IS_REACT_ACT_ENVIRONMENT = false
})

describe('open-when-added (spec 4.7 C5)', () => {
  it('waits for the category, then opens the torrent once maindata has it', async () => {
    await render(ALL)
    await act(async () => openWhenAdded(NEW, 'X'))
    expect(openWhenAddedStore.state?.reached).toBe(false)
    await rerender('X')
    expect(openWhenAddedStore.state?.reached).toBe(true)
    expect(setHash).not.toHaveBeenCalled()
    await addToMaindata()
    expect(setHash).toHaveBeenCalledExactlyOnceWith(NEW)
    expect(detailOutsideStore.state.hash).toBe(NEW)
    expect(openWhenAddedStore.state).toBeNull()
  })

  it('opens at once when the torrent is already there', async () => {
    answer = fakeResponse({ changed: [t({ hash: NEW, category: 'X' })] })
    await render('X')
    await act(async () => openWhenAdded(NEW, 'X'))
    expect(setHash).toHaveBeenCalledExactlyOnceWith(NEW)
  })

  it('gives up after 30 s', async () => {
    vi.useFakeTimers()
    await render('X')
    await act(async () => openWhenAdded(NEW, 'X'))
    await act(async () => vi.advanceTimersByTime(OPEN_WHEN_ADDED_MS))
    expect(openWhenAddedStore.state).toBeNull()
    vi.useRealTimers()
    await addToMaindata()
    expect(setHash).not.toHaveBeenCalled()
  })

  it('another category after reaching it ends the wish', async () => {
    await render('X')
    await act(async () => openWhenAdded(NEW, 'X'))
    await rerender('mteam-X')
    expect(openWhenAddedStore.state).toBeNull()
    await rerender('X')
    await addToMaindata()
    expect(setHash).not.toHaveBeenCalled()
  })

  it('another row chosen after reaching it ends the wish', async () => {
    await render('X')
    await act(async () => openWhenAdded(NEW, 'X'))
    await rerender('X', OLD)
    expect(openWhenAddedStore.state).toBeNull()
    await addToMaindata()
    expect(setHash).not.toHaveBeenCalled()
  })

  it('a new add cancels it', async () => {
    await render('X')
    await act(async () => openWhenAdded(NEW, 'X'))
    await act(async () => cancelOpenWhenAdded())
    await addToMaindata()
    expect(setHash).not.toHaveBeenCalled()
  })
})
