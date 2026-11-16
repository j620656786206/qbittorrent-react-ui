import { QueryObserver, environmentManager } from '@tanstack/react-query'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { AppError } from '#/lib/app-error'
import type { SortKeysData } from '#/lib/sort-keys-merge'
import type { ExtraSortFieldId, SortKeysResponse } from '#/shared/sort-keys'
import { clearConnectionErrors, connectionStore } from '#/state/connection'
import { clearLoginRequired, markLoginRequired } from '#/state/login-required'
import { createQueryClient } from '#/state/query-client'
import {
  bindFetchSortKeys,
  sortKeysKey,
  sortKeysQueryOptions,
} from '#/state/sort-keys'
import type { FetchSortKeys } from '#/state/sort-keys'

// Spec 2.1: `['sort-keys', field]`, polled every 5 s only while observed,
// merged by mergeSortKeys, a failure keeps the old keys.

let counter = 0
function answer(keys: Record<string, number>, full = counter === 0) {
  counter += 1
  return { version: `abcdef12.${counter}`, full, keys } as SortKeysResponse
}

let cleanups: Array<() => void> = []

beforeEach(() => {
  counter = 0
  vi.useFakeTimers()
  vi.stubGlobal('window', { location: { pathname: '/', search: '', hash: '' } })
  environmentManager.setIsServer(() => false)
  clearLoginRequired()
  clearConnectionErrors()
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

afterEach(() => {
  for (const cleanup of cleanups) cleanup()
  cleanups = []
  environmentManager.setIsServer(() => typeof window === 'undefined')
  clearLoginRequired()
  clearConnectionErrors()
  vi.useRealTimers()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

function setup(
  fetchSortKeys: FetchSortKeys,
  field: ExtraSortFieldId = 'num_seeds',
) {
  const client = createQueryClient({ currentPath: () => '/' })
  client.mount()
  const observer = new QueryObserver<SortKeysData>(
    client,
    sortKeysQueryOptions(field, fetchSortKeys),
  )
  const unsubscribe = observer.subscribe(() => {})
  cleanups.push(() => {
    unsubscribe()
    client.unmount()
    client.clear()
  })
  return { client, observer, unsubscribe }
}

describe('the sort-keys query', () => {
  it('polls every 5 s with the last version and merges deltas', async () => {
    const fetchSortKeys = vi
      .fn<FetchSortKeys>()
      .mockResolvedValueOnce(answer({ a: 1, b: 2 }))
      .mockResolvedValue(answer({ b: 5 }, false))
    const { observer } = setup(fetchSortKeys)
    await vi.advanceTimersByTimeAsync(0)
    expect(fetchSortKeys).toHaveBeenLastCalledWith(
      { field: 'num_seeds' },
      expect.any(AbortSignal),
    )
    expect(observer.getCurrentResult().data?.keys).toEqual({ a: 1, b: 2 })

    await vi.advanceTimersByTimeAsync(5_000)
    expect(fetchSortKeys).toHaveBeenCalledTimes(2)
    expect(fetchSortKeys).toHaveBeenLastCalledWith(
      { field: 'num_seeds', since: 'abcdef12.1' },
      expect.any(AbortSignal),
    )
    expect(observer.getCurrentResult().data?.keys).toEqual({ a: 1, b: 5 })
  })

  it('stops polling once nothing observes it (the sort changed)', async () => {
    const fetchSortKeys = vi.fn<FetchSortKeys>(async () => answer({ a: 1 }))
    const { unsubscribe } = setup(fetchSortKeys)
    await vi.advanceTimersByTimeAsync(0)
    expect(fetchSortKeys).toHaveBeenCalledTimes(1)
    unsubscribe()
    await vi.advanceTimersByTimeAsync(20_000)
    expect(fetchSortKeys).toHaveBeenCalledTimes(1)
  })

  it('does not poll while the login screen is needed', async () => {
    const fetchSortKeys = vi.fn<FetchSortKeys>(async () => answer({ a: 1 }))
    const { observer } = setup(fetchSortKeys)
    await vi.advanceTimersByTimeAsync(0)
    markLoginRequired('not_logged_in', '/')
    observer.setOptions(observer.options)
    await vi.advanceTimersByTimeAsync(20_000)
    expect(fetchSortKeys).toHaveBeenCalledTimes(1)
  })

  it('S4 a failure keeps the old keys; a connection code reaches the global alert', async () => {
    const fetchSortKeys = vi
      .fn<FetchSortKeys>()
      .mockResolvedValueOnce(answer({ a: 1 }))
      .mockRejectedValue(new AppError('home_unreachable'))
    const { observer } = setup(fetchSortKeys)
    await vi.advanceTimersByTimeAsync(0)
    const first = observer.getCurrentResult().data
    await vi.advanceTimersByTimeAsync(5_000)
    expect(observer.getCurrentResult().data).toBe(first)
    expect(connectionStore.state.errors).toEqual(['home_unreachable'])
  })

  it('the key names the field; bindFetchSortKeys goes through callFn', async () => {
    expect(sortKeysKey('comment')).toEqual(['sort-keys', 'comment'])
    const getSortKeys = vi.fn(async () => ({
      ok: true as const,
      data: answer({ a: 1 }),
    }))
    const fetch = bindFetchSortKeys(getSortKeys)
    const result = await fetch(
      { field: 'comment' },
      new AbortController().signal,
    )
    expect(result.keys).toEqual({ a: 1 })
    expect(getSortKeys).toHaveBeenCalledWith(
      expect.objectContaining({ data: { field: 'comment' } }),
    )
  })
})
