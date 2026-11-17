import { QueryObserver, environmentManager } from '@tanstack/react-query'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { AppError } from '#/lib/app-error'
import type { TorrentDetailResponse } from '#/shared/torrent-detail'
import { clearConnectionErrors, connectionStore } from '#/state/connection'
import { clearLoginRequired, markLoginRequired } from '#/state/login-required'
import { createQueryClient } from '#/state/query-client'
import {
  bindFetchTorrentDetail,
  torrentDetailKey,
  torrentDetailQueryOptions,
} from '#/state/torrent-detail'
import type { FetchTorrentDetail } from '#/state/torrent-detail'

// Spec 2.4 (AD-6 detail exception): `['torrent-detail', hash]`, polled
// every 5 s only while observed, a failure keeps the old answer.

const HASH = 'a'.repeat(40)

function answer(downloaded: number, uploaded = 0): TorrentDetailResponse {
  return {
    detail: { downloaded, uploaded, num_seeds: 3, num_leechs: 1 },
  }
}

let cleanups: Array<() => void> = []

beforeEach(() => {
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

function setup(fetchTorrentDetail: FetchTorrentDetail, hash = HASH) {
  const client = createQueryClient({ currentPath: () => '/' })
  client.mount()
  const observer = new QueryObserver<TorrentDetailResponse>(
    client,
    torrentDetailQueryOptions(hash, fetchTorrentDetail),
  )
  const unsubscribe = observer.subscribe(() => {})
  cleanups.push(() => {
    unsubscribe()
    client.unmount()
    client.clear()
  })
  return { client, observer, unsubscribe }
}

describe('the torrent-detail query', () => {
  it('asks for the one hash and polls every 5 s', async () => {
    const fetchTorrentDetail = vi
      .fn<FetchTorrentDetail>()
      .mockResolvedValueOnce(answer(1))
      .mockResolvedValue(answer(2))
    const { observer } = setup(fetchTorrentDetail)
    await vi.advanceTimersByTimeAsync(0)
    expect(fetchTorrentDetail).toHaveBeenLastCalledWith(
      { hash: HASH },
      expect.any(AbortSignal),
    )
    expect(observer.getCurrentResult().data).toEqual(answer(1))
    await vi.advanceTimersByTimeAsync(5_000)
    expect(fetchTorrentDetail).toHaveBeenCalledTimes(2)
    expect(observer.getCurrentResult().data).toEqual(answer(2))
  })

  it('stops polling once nothing observes it (the detail closed)', async () => {
    const fetchTorrentDetail = vi.fn<FetchTorrentDetail>(async () => answer(1))
    const { unsubscribe } = setup(fetchTorrentDetail)
    await vi.advanceTimersByTimeAsync(0)
    unsubscribe()
    await vi.advanceTimersByTimeAsync(20_000)
    expect(fetchTorrentDetail).toHaveBeenCalledTimes(1)
  })

  it('does not poll while the login screen is needed', async () => {
    const fetchTorrentDetail = vi.fn<FetchTorrentDetail>(async () => answer(1))
    const { observer } = setup(fetchTorrentDetail)
    await vi.advanceTimersByTimeAsync(0)
    markLoginRequired('not_logged_in', '/')
    observer.setOptions(observer.options)
    await vi.advanceTimersByTimeAsync(20_000)
    expect(fetchTorrentDetail).toHaveBeenCalledTimes(1)
  })

  it('a failure keeps the old answer; a connection code reaches the global alert', async () => {
    const fetchTorrentDetail = vi
      .fn<FetchTorrentDetail>()
      .mockResolvedValueOnce(answer(1))
      .mockRejectedValue(new AppError('home_unreachable'))
    const { observer } = setup(fetchTorrentDetail)
    await vi.advanceTimersByTimeAsync(0)
    const first = observer.getCurrentResult().data
    await vi.advanceTimersByTimeAsync(5_000)
    expect(observer.getCurrentResult().data).toBe(first)
    expect(connectionStore.state.errors).toEqual(['home_unreachable'])
  })

  it('the key names the hash; bindFetchTorrentDetail goes through callFn', async () => {
    expect(torrentDetailKey(HASH)).toEqual(['torrent-detail', HASH])
    const getTorrentDetail = vi.fn(async () => ({
      ok: true as const,
      data: answer(7),
    }))
    const fetch = bindFetchTorrentDetail(getTorrentDetail)
    const result = await fetch({ hash: HASH }, new AbortController().signal)
    expect(result).toEqual(answer(7))
    expect(getTorrentDetail).toHaveBeenCalledWith(
      expect.objectContaining({ data: { hash: HASH } }),
    )
  })
})
