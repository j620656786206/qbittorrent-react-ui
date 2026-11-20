// @vitest-environment happy-dom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import type { Root } from 'react-dom/client'
import { QueryClientProvider, focusManager } from '@tanstack/react-query'
import type { QueryClient } from '@tanstack/react-query'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { LocationResolver } from '#/lib/paths'
import { defaultSettings } from '#/shared/settings'
import type { CommonPath, Settings } from '#/shared/settings'
import { useLocationResolver } from '#/state/locations'
import { createQueryClient } from '#/state/query-client'
import { SETTINGS_KEY } from '#/state/settings'
import type { FetchSettings } from '#/state/settings'

// Story 5.1: one resolver per common-path list. Stable while the list is
// unchanged (a refetch that answers the same list included), new when it
// changes, and with settings not loaded it resolves like no common paths.

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean | undefined
}

const TV: CommonPath = {
  path: '/data/media/tv',
  name: '影集媒體庫',
  mediaLibrary: true,
}
const withPaths = (commonPaths: Array<CommonPath>): Settings => ({
  ...defaultSettings(),
  commonPaths,
})

let root: Root
let client: QueryClient
const seen: Array<LocationResolver> = []

function Probe() {
  seen.push(useLocationResolver())
  return null
}

async function render(fetchSettings: FetchSettings) {
  client = createQueryClient({ currentPath: () => '/', fetchSettings })
  const container = document.createElement('div')
  document.body.append(container)
  root = createRoot(container)
  await act(async () => {
    root.render(
      <QueryClientProvider client={client}>
        <Probe />
      </QueryClientProvider>,
    )
  })
  await settle()
}

async function settle() {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0))
  })
}

const latest = () => seen[seen.length - 1]

beforeEach(() => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true
  seen.length = 0
})

afterEach(() => {
  act(() => root.unmount())
  client.clear()
  focusManager.setFocused(undefined)
  document.body.replaceChildren()
})

describe('useLocationResolver', () => {
  it('before settings answer: the last two folders', async () => {
    await render(() => new Promise(() => {}))
    expect(latest()('/data/media/tv/x')).toEqual({
      name: 'tv/x',
      mediaLibrary: false,
    })
  })

  it('a failed read: the last two folders', async () => {
    await render(() => Promise.reject(new Error('down')))
    expect(latest()('/data/media/tv/x').name).toBe('tv/x')
  })

  it('matches the common paths once they arrive', async () => {
    await render(() => Promise.resolve(withPaths([TV])))
    expect(latest()('/data/media/tv/x')).toEqual({
      name: '影集媒體庫',
      mediaLibrary: true,
    })
  })

  it('stays the same resolver while the list is unchanged', async () => {
    const fetchSettings = vi
      .fn<FetchSettings>()
      .mockImplementation(() => Promise.resolve(withPaths([TV])))
    await render(fetchSettings)
    const first = latest()
    const tag = first('/data/media/tv/x')
    // A focus refetch answering an equal list (a new object).
    await act(async () => {
      focusManager.setFocused(false)
      focusManager.setFocused(true)
      await new Promise((resolve) => setTimeout(resolve, 0))
    })
    expect(fetchSettings).toHaveBeenCalledTimes(2)
    expect(latest()).toBe(first)
    expect(latest()('/data/media/tv/x')).toBe(tag)
    // Another settings field changing keeps it too.
    const rendersBefore = seen.length
    await act(async () => {
      client.setQueryData(SETTINGS_KEY, {
        ...withPaths([{ ...TV }]),
        categoryOrder: ['X'],
      })
    })
    await settle()
    expect(seen.length).toBeGreaterThan(rendersBefore)
    expect(latest()).toBe(first)
  })

  it('R1: a changed list gives a new resolver and new tags', async () => {
    await render(() => Promise.resolve(withPaths([TV])))
    const first = latest()
    await act(async () => {
      client.setQueryData(
        SETTINGS_KEY,
        withPaths([{ ...TV, name: '影集', mediaLibrary: false }]),
      )
    })
    await settle()
    expect(latest()).not.toBe(first)
    expect(latest()('/data/media/tv/x')).toEqual({
      name: '影集',
      mediaLibrary: false,
    })
  })
})
