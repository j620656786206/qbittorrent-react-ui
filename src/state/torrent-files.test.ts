import {
  QueryObserver,
  environmentManager,
  focusManager,
} from '@tanstack/react-query'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { AppError } from '#/lib/app-error'
import type { TorrentFile } from '#/shared/torrent-files'
import { clearConnectionErrors, connectionStore } from '#/state/connection'
import { clearLoginRequired, markLoginRequired } from '#/state/login-required'
import { createQueryClient } from '#/state/query-client'
import {
  bindFetchFiles,
  filesKey,
  torrentFilesQueryOptions,
} from '#/state/torrent-files'
import type { FetchFiles } from '#/state/torrent-files'

// Spec 2.7 rows L1 (a failed poll keeps the list) and Q1: `['files', hash]`
// polled every 5 s only while observed, never in the background, once on
// focus, its own key per torrent.

const HASH = 'a'.repeat(40)
const OTHER = 'b'.repeat(40)

const file = (index: number, priority = 1): TorrentFile => ({
  index,
  name: `Fake/${index}.mkv`,
  size: 1024,
  progress: 0.5,
  priority,
})

let cleanups: Array<() => void> = []

beforeEach(() => {
  vi.useFakeTimers()
  vi.stubGlobal('window', {
    location: { pathname: '/', search: '', hash: '' },
    addEventListener: () => {},
    removeEventListener: () => {},
  })
  environmentManager.setIsServer(() => false)
  clearLoginRequired()
  clearConnectionErrors()
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

afterEach(() => {
  for (const cleanup of cleanups) cleanup()
  cleanups = []
  focusManager.setFocused(undefined)
  environmentManager.setIsServer(() => typeof window === 'undefined')
  clearLoginRequired()
  clearConnectionErrors()
  vi.useRealTimers()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

function setup(fetchFiles: FetchFiles, hash = HASH) {
  const client = createQueryClient({ currentPath: () => '/' })
  client.mount()
  const observer = new QueryObserver<Array<TorrentFile>>(
    client,
    torrentFilesQueryOptions(hash, fetchFiles),
  )
  const unsubscribe = observer.subscribe(() => {})
  cleanups.push(() => {
    unsubscribe()
    client.unmount()
    client.clear()
  })
  return { client, observer, unsubscribe }
}

describe('the files query', () => {
  it('asks for the one hash and polls every 5 s', async () => {
    const fetchFiles = vi
      .fn<FetchFiles>()
      .mockResolvedValueOnce([file(0)])
      .mockResolvedValue([file(0, 0)])
    const { observer } = setup(fetchFiles)
    await vi.advanceTimersByTimeAsync(0)
    expect(fetchFiles).toHaveBeenLastCalledWith(
      { hash: HASH },
      expect.any(AbortSignal),
    )
    expect(observer.getCurrentResult().data).toEqual([file(0)])
    await vi.advanceTimersByTimeAsync(5_000)
    expect(fetchFiles).toHaveBeenCalledTimes(2)
    expect(observer.getCurrentResult().data).toEqual([file(0, 0)])
  })

  it('Q1 stops polling once nothing observes it (tab switched, detail closed)', async () => {
    const fetchFiles = vi.fn<FetchFiles>(async () => [file(0)])
    const { unsubscribe } = setup(fetchFiles)
    await vi.advanceTimersByTimeAsync(0)
    unsubscribe()
    await vi.advanceTimersByTimeAsync(20_000)
    expect(fetchFiles).toHaveBeenCalledTimes(1)
  })

  it('Q1 hidden page: no polls; back in front: one fetch', async () => {
    const fetchFiles = vi.fn<FetchFiles>(async () => [file(0)])
    setup(fetchFiles)
    await vi.advanceTimersByTimeAsync(0)
    focusManager.setFocused(false)
    await vi.advanceTimersByTimeAsync(20_000)
    expect(fetchFiles).toHaveBeenCalledTimes(1)
    focusManager.setFocused(true)
    await vi.advanceTimersByTimeAsync(0)
    expect(fetchFiles).toHaveBeenCalledTimes(2)
  })

  it('Q1 back in front under 5 s still fetches at once; not while login is needed', async () => {
    const fetchFiles = vi.fn<FetchFiles>(async () => [file(0)])
    setup(fetchFiles)
    await vi.advanceTimersByTimeAsync(0)
    focusManager.setFocused(false)
    await vi.advanceTimersByTimeAsync(1_000)
    focusManager.setFocused(true)
    await vi.advanceTimersByTimeAsync(0)
    expect(fetchFiles).toHaveBeenCalledTimes(2)
    markLoginRequired('not_logged_in', '/')
    focusManager.setFocused(false)
    focusManager.setFocused(true)
    await vi.advanceTimersByTimeAsync(0)
    expect(fetchFiles).toHaveBeenCalledTimes(2)
  })

  it('Q1 another torrent is another key: its own fetch, never the old list', async () => {
    const fetchFiles = vi.fn<FetchFiles>(async ({ hash }) =>
      hash === HASH ? [file(0)] : [file(9)],
    )
    const { observer } = setup(fetchFiles)
    await vi.advanceTimersByTimeAsync(0)
    observer.setOptions(torrentFilesQueryOptions(OTHER, fetchFiles))
    expect(observer.getCurrentResult().data).toBeUndefined()
    await vi.advanceTimersByTimeAsync(0)
    expect(fetchFiles).toHaveBeenLastCalledWith(
      { hash: OTHER },
      expect.any(AbortSignal),
    )
    expect(observer.getCurrentResult().data).toEqual([file(9)])
  })

  it('does not poll while the login screen is needed', async () => {
    const fetchFiles = vi.fn<FetchFiles>(async () => [file(0)])
    const { observer } = setup(fetchFiles)
    await vi.advanceTimersByTimeAsync(0)
    markLoginRequired('not_logged_in', '/')
    observer.setOptions(observer.options)
    await vi.advanceTimersByTimeAsync(20_000)
    expect(fetchFiles).toHaveBeenCalledTimes(1)
  })

  it('L1 a failed poll keeps the old list, no retry; a connection code reaches the global alert', async () => {
    const fetchFiles = vi
      .fn<FetchFiles>()
      .mockResolvedValueOnce([file(0)])
      .mockRejectedValue(new AppError('home_unreachable'))
    const { observer } = setup(fetchFiles)
    await vi.advanceTimersByTimeAsync(0)
    const first = observer.getCurrentResult().data
    await vi.advanceTimersByTimeAsync(5_000)
    expect(fetchFiles).toHaveBeenCalledTimes(2)
    expect(observer.getCurrentResult().data).toBe(first)
    expect(connectionStore.state.errors).toEqual(['home_unreachable'])
  })

  it('the key names the hash; bindFetchFiles goes through callFn', async () => {
    expect(filesKey(HASH)).toEqual(['files', HASH])
    const getFiles = vi.fn(async () => ({
      ok: true as const,
      data: [file(3)],
    }))
    const fetch = bindFetchFiles(getFiles)
    expect(await fetch({ hash: HASH }, new AbortController().signal)).toEqual([
      file(3),
    ])
    expect(getFiles).toHaveBeenCalledWith(
      expect.objectContaining({ data: { hash: HASH } }),
    )
  })
})
