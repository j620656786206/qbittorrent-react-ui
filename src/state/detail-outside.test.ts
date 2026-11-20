// @vitest-environment happy-dom
import { act, createElement } from 'react'
import { createRoot } from 'react-dom/client'
import type { Root } from 'react-dom/client'
import { QueryClientProvider, notifyManager } from '@tanstack/react-query'
import type { QueryClient } from '@tanstack/react-query'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { fakeHash, fakeResponse, t } from '#/lib/testing'
import type { MaindataResponse } from '#/shared/maindata'
import {
  detailOutsideStore,
  openDetailOutside,
  resetDetailOutside,
  useDetailOutsideUpkeep,
  useOutsideHash,
} from '#/state/detail-outside'
import { MAINDATA_KEY } from '#/state/maindata'
import { createQueryClient } from '#/state/query-client'
import { ViewedHashContext } from '#/state/viewed-hash'

// Spec 4.6: the torrent 「打開」 opened from outside the list. It shows while
// the URL's `hash` is it and maindata has it, and ends on another choice, a
// close, or the torrent leaving maindata.

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean | undefined
}

const OUT = fakeHash(30)
const OTHER = fakeHash(1)

let root: Root
let client: QueryClient
let answer: MaindataResponse
let seen: string | null

function Probe({ hash }: { hash: string | null }) {
  useDetailOutsideUpkeep(hash)
  seen = useOutsideHash()
  return null
}

function tree(hash: string | null) {
  return createElement(
    QueryClientProvider,
    { client },
    createElement(
      ViewedHashContext,
      { value: { hash, setHash: () => {}, followHash: () => {} } },
      createElement(Probe, { hash }),
    ),
  )
}

async function render(hash: string | null, { loaded = true } = {}) {
  client = createQueryClient({
    fetchMaindata: () =>
      loaded ? Promise.resolve(answer) : new Promise<never>(() => {}),
    currentPath: () => '/',
  })
  if (loaded) await client.prefetchQuery({ queryKey: MAINDATA_KEY })
  root = createRoot(document.createElement('div'))
  await act(async () => root.render(tree(hash)))
}

async function rerender(hash: string | null) {
  await act(async () => root.render(tree(hash)))
}

beforeEach(() => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true
  notifyManager.setScheduler((callback) => callback())
  answer = fakeResponse({
    changed: [t({ hash: OUT, name: 'Out' }), t({ hash: OTHER, name: 'Other' })],
  })
  seen = null
  resetDetailOutside()
})

afterEach(async () => {
  await act(async () => root.unmount())
  client.clear()
  resetDetailOutside()
  notifyManager.setScheduler((callback) => setTimeout(callback, 0))
  globalThis.IS_REACT_ACT_ENVIRONMENT = false
})

describe('detail-outside', () => {
  it('set: shows once the URL reaches it, not before', async () => {
    openDetailOutside(OUT)
    await render(OTHER)
    expect(seen).toBeNull()
    // Not reached yet: the mark waits for the URL.
    expect(detailOutsideStore.state).toEqual({ hash: OUT, seen: false })
    await rerender(OUT)
    expect(seen).toBe(OUT)
    expect(detailOutsideStore.state).toEqual({ hash: OUT, seen: true })
  })

  it('another choice ends it', async () => {
    openDetailOutside(OUT)
    await render(OUT)
    await rerender(OTHER)
    expect(seen).toBeNull()
    expect(detailOutsideStore.state.hash).toBeNull()
    // Back on the same torrent later: no longer from outside.
    await rerender(OUT)
    expect(seen).toBeNull()
  })

  it('closing the detail ends it', async () => {
    openDetailOutside(OUT)
    await render(OUT)
    await rerender(null)
    expect(detailOutsideStore.state.hash).toBeNull()
  })

  it('the torrent leaving maindata ends it', async () => {
    openDetailOutside(OUT)
    await render(OUT)
    expect(seen).toBe(OUT)
    answer = fakeResponse({
      version: 'abcdef12.2',
      full: false,
      changed: [],
      removed: [OUT],
    })
    await act(async () => {
      await client.refetchQueries({ queryKey: MAINDATA_KEY })
    })
    expect(seen).toBeNull()
    expect(detailOutsideStore.state.hash).toBeNull()
  })

  it('maindata not loaded yet: nothing shows and the mark stays', async () => {
    openDetailOutside(OUT)
    await render(OUT, { loaded: false })
    expect(seen).toBeNull()
    expect(detailOutsideStore.state.hash).toBe(OUT)
  })
})
