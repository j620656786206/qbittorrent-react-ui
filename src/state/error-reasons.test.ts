import { QueryObserver, environmentManager } from '@tanstack/react-query'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { AppError } from '#/lib/app-error'
import type { ErrorReasonsResponse } from '#/shared/error-reasons'
import { clearConnectionErrors } from '#/state/connection'
import {
  ERROR_REASONS_KEY,
  ERROR_REASONS_POLL_MS,
  bindFetchErrorReasons,
  errorReasonsQueryOptions,
} from '#/state/error-reasons'
import type { FetchErrorReasons } from '#/state/error-reasons'
import { clearLoginRequired, markLoginRequired } from '#/state/login-required'
import { createQueryClient } from '#/state/query-client'

// Spec 2.10: `['error-reasons']`, polled every 60 s only while maindata has
// an errored torrent, no retry, a failure keeps the previous map.

const HASH = 'a'.repeat(40)
const answer = (reason: string): ErrorReasonsResponse => ({
  reasons: { [HASH]: reason },
})

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

function setup(fetchErrorReasons: FetchErrorReasons, hasErrored: boolean) {
  const client = createQueryClient({ currentPath: () => '/' })
  client.mount()
  const observer = new QueryObserver<ErrorReasonsResponse>(
    client,
    errorReasonsQueryOptions(fetchErrorReasons, hasErrored),
  )
  const unsubscribe = observer.subscribe(() => {})
  cleanups.push(() => {
    unsubscribe()
    client.unmount()
    client.clear()
  })
  return { client, observer }
}

describe('the error-reasons query', () => {
  it('with an errored torrent: fetches at once, then every 60 s', async () => {
    const fetchErrorReasons = vi
      .fn<FetchErrorReasons>()
      .mockResolvedValueOnce(answer('磁碟空間不足'))
      .mockResolvedValue(answer('沒有權限'))
    const { observer } = setup(fetchErrorReasons, true)
    await vi.advanceTimersByTimeAsync(0)
    expect(observer.getCurrentResult().data).toEqual(answer('磁碟空間不足'))
    await vi.advanceTimersByTimeAsync(ERROR_REASONS_POLL_MS - 1)
    expect(fetchErrorReasons).toHaveBeenCalledTimes(1)
    await vi.advanceTimersByTimeAsync(1)
    expect(fetchErrorReasons).toHaveBeenCalledTimes(2)
    expect(observer.getCurrentResult().data).toEqual(answer('沒有權限'))
  })

  it('matrix 8: without an errored torrent it never fetches', async () => {
    const fetchErrorReasons = vi.fn<FetchErrorReasons>(async () => answer('x'))
    setup(fetchErrorReasons, false)
    await vi.advanceTimersByTimeAsync(ERROR_REASONS_POLL_MS * 3)
    expect(fetchErrorReasons).not.toHaveBeenCalled()
  })

  it('stops when the errored torrent goes, and starts again when one comes back', async () => {
    const fetchErrorReasons = vi.fn<FetchErrorReasons>(async () => answer('x'))
    const { observer } = setup(fetchErrorReasons, true)
    await vi.advanceTimersByTimeAsync(0)
    observer.setOptions(errorReasonsQueryOptions(fetchErrorReasons, false))
    await vi.advanceTimersByTimeAsync(ERROR_REASONS_POLL_MS * 3)
    expect(fetchErrorReasons).toHaveBeenCalledTimes(1)
    observer.setOptions(errorReasonsQueryOptions(fetchErrorReasons, true))
    await vi.advanceTimersByTimeAsync(0)
    expect(fetchErrorReasons).toHaveBeenCalledTimes(2)
  })

  it('does not fetch while the login screen is needed', async () => {
    markLoginRequired('not_logged_in', '/')
    const fetchErrorReasons = vi.fn<FetchErrorReasons>(async () => answer('x'))
    setup(fetchErrorReasons, true)
    await vi.advanceTimersByTimeAsync(ERROR_REASONS_POLL_MS * 2)
    expect(fetchErrorReasons).not.toHaveBeenCalled()
  })

  it('matrix 11: a failure keeps the previous map and is not retried', async () => {
    const fetchErrorReasons = vi
      .fn<FetchErrorReasons>()
      .mockResolvedValueOnce(answer('磁碟空間不足'))
      .mockRejectedValue(new AppError('qbit_rejected'))
    const { observer } = setup(fetchErrorReasons, true)
    await vi.advanceTimersByTimeAsync(0)
    const first = observer.getCurrentResult().data
    await vi.advanceTimersByTimeAsync(ERROR_REASONS_POLL_MS)
    expect(fetchErrorReasons).toHaveBeenCalledTimes(2)
    expect(observer.getCurrentResult().data).toBe(first)
    // No retry: the next call is the next poll.
    await vi.advanceTimersByTimeAsync(ERROR_REASONS_POLL_MS - 1)
    expect(fetchErrorReasons).toHaveBeenCalledTimes(2)
  })

  it('the key; bindFetchErrorReasons goes through callFn with no data', async () => {
    expect(ERROR_REASONS_KEY).toEqual(['error-reasons'])
    const getErrorReasons = vi.fn(async () => ({
      ok: true as const,
      data: answer('檔案太大'),
    }))
    const fetch = bindFetchErrorReasons(getErrorReasons)
    expect(await fetch(new AbortController().signal)).toEqual(
      answer('檔案太大'),
    )
    expect(getErrorReasons).toHaveBeenCalledWith(
      expect.objectContaining({ data: undefined }),
    )
  })
})
