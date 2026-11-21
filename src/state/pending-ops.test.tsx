// @vitest-environment happy-dom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { QueryClientProvider, notifyManager } from '@tanstack/react-query'
import type { QueryClient } from '@tanstack/react-query'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fakeHash, fakeResponse, t } from '#/lib/testing'
import type { MaindataResponse } from '#/shared/maindata'
import { MOVING_TO_EXPIRY_MS } from '#/shared/maindata'
import { MAINDATA_KEY } from '#/state/maindata'
import {
  PENDING_TIMEOUT_MS,
  clearPending,
  clearPendingAll,
  markPending,
  markPendingAll,
  moveRecordOf,
  moveRecordStore,
  pendingStore,
  recordMoves,
  dropMoveRecords,
  updateMoveRecords,
  pendingOpOf,
  prunePending,
  resetPendingOps,
  usePendingOp,
} from '#/state/pending-ops'
import { createQueryClient } from '#/state/query-client'

// Spec 2.6 row P1: the in-flight record. Cleared when the action changes
// (qBittorrent reflected it), the torrent goes, the call fails, or 30 s
// pass (fake timers).

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean | undefined
}

const A = fakeHash(0xa1)
const B = fakeHash(0xb1)

beforeEach(() => {
  vi.useFakeTimers()
  resetPendingOps()
})

afterEach(() => {
  resetPendingOps()
  vi.useRealTimers()
})

describe('spec 5.3 the move records', () => {
  const TV = '/data/media/tv'
  const fromOld = () => '/data/torrents/tv/'

  it('a record per hash with target, normalized from, start and seen; apart from the 30 s ops', () => {
    vi.setSystemTime(5000)
    markPendingAll([A, B], 'stop')
    recordMoves([A, B], TV, fromOld)
    expect(moveRecordOf(A)).toEqual({
      target: TV,
      from: '/data/torrents/tv',
      startedAt: 5000,
      seen: false,
    })
    expect(moveRecordOf(B)).toEqual({
      target: TV,
      from: '/data/torrents/tv',
      startedAt: 5000,
      seen: false,
    })
    // O6: the 30 s timer clears the op, never the record.
    vi.advanceTimersByTime(PENDING_TIMEOUT_MS)
    expect(pendingOpOf(A)).toBeNull()
    expect(moveRecordOf(A)?.target).toBe(TV)
  })

  it('O6 another op on the same hash (a pause) and clearing it leave the record', () => {
    recordMoves([A], TV, fromOld)
    markPending(A, 'stop')
    clearPending(A)
    clearPendingAll([A])
    prunePending(() => false)
    expect(moveRecordOf(A)?.target).toBe(TV)
  })

  it('a newer move of the same hash replaces the record', () => {
    vi.setSystemTime(1000)
    recordMoves([A], TV, fromOld)
    updateMoveRecords({
      [A]: { target: TV, from: '', startedAt: 1000, seen: true },
    })
    vi.setSystemTime(2000)
    recordMoves([A], '/data/media/movies', fromOld)
    expect(moveRecordOf(A)).toEqual({
      target: '/data/media/movies',
      from: '/data/torrents/tv',
      startedAt: 2000,
      seen: false,
    })
  })

  it('O7 a record never seen goes after 10 minutes; a seen one stays', () => {
    recordMoves([A, B], TV, fromOld)
    updateMoveRecords({ [B]: { ...moveRecordOf(B)!, seen: true } })
    vi.advanceTimersByTime(MOVING_TO_EXPIRY_MS - 1)
    expect(moveRecordOf(A)).not.toBeNull()
    vi.advanceTimersByTime(1)
    expect(moveRecordOf(A)).toBeNull()
    expect(moveRecordOf(B)?.seen).toBe(true)
  })

  it('O7 an older timer leaves a newer record of the same hash alone', () => {
    recordMoves([A], TV, fromOld)
    vi.advanceTimersByTime(MOVING_TO_EXPIRY_MS / 2)
    recordMoves([A], '/data/media/movies', fromOld)
    vi.advanceTimersByTime(MOVING_TO_EXPIRY_MS / 2)
    expect(moveRecordOf(A)?.target).toBe('/data/media/movies')
    vi.advanceTimersByTime(MOVING_TO_EXPIRY_MS / 2)
    expect(moveRecordOf(A)).toBeNull()
  })

  it('drop removes only the named hashes, one update; nothing to drop: no update', () => {
    recordMoves([A, B], TV, fromOld)
    const updates = vi.fn()
    const subscription = moveRecordStore.subscribe(updates)
    dropMoveRecords([A])
    expect(updates).toHaveBeenCalledTimes(1)
    expect(moveRecordOf(A)).toBeNull()
    expect(moveRecordOf(B)).not.toBeNull()
    dropMoveRecords([A])
    updateMoveRecords({
      [A]: { target: TV, from: '', startedAt: 0, seen: true },
    })
    expect(updates).toHaveBeenCalledTimes(1)
    expect(moveRecordOf(A)).toBeNull()
    subscription.unsubscribe()
  })

  it('an unknown save_path records an empty from', () => {
    recordMoves([A], TV, () => '')
    expect(moveRecordOf(A)?.from).toBe('')
  })

  it('reset clears records and their timers', () => {
    recordMoves([A], TV, fromOld)
    resetPendingOps()
    expect(moveRecordOf(A)).toBeNull()
    expect(vi.getTimerCount()).toBe(0)
  })
})

describe('the pending store', () => {
  it('marks, reads and clears per hash', () => {
    markPending(A, 'stop')
    expect(pendingOpOf(A)).toBe('stop')
    expect(pendingOpOf(B)).toBeNull()
    clearPending(A)
    expect(pendingOpOf(A)).toBeNull()
  })

  it('clears itself 30 s after marking', () => {
    markPending(A, 'stop')
    vi.advanceTimersByTime(PENDING_TIMEOUT_MS - 1)
    expect(pendingOpOf(A)).toBe('stop')
    vi.advanceTimersByTime(1)
    expect(pendingOpOf(A)).toBeNull()
  })

  it('marking again restarts the 30 s', () => {
    markPending(A, 'stop')
    vi.advanceTimersByTime(20_000)
    markPending(A, 'start')
    vi.advanceTimersByTime(20_000)
    expect(pendingOpOf(A)).toBe('start')
    vi.advanceTimersByTime(10_000)
    expect(pendingOpOf(A)).toBeNull()
  })

  it('a cleared entry leaves no timer behind', () => {
    markPending(A, 'stop')
    clearPending(A)
    expect(vi.getTimerCount()).toBe(0)
  })

  it('4.3 marks and clears many hashes with one store update each', () => {
    const updates = vi.fn()
    const subscription = pendingStore.subscribe(updates)
    markPendingAll([A, B], 'delete')
    expect(updates).toHaveBeenCalledTimes(1)
    expect(pendingOpOf(A)).toBe('delete')
    expect(pendingOpOf(B)).toBe('delete')
    clearPendingAll([A, B])
    expect(updates).toHaveBeenCalledTimes(2)
    expect(pendingOpOf(A)).toBeNull()
    // Nothing left to clear: no update.
    clearPendingAll([A])
    expect(updates).toHaveBeenCalledTimes(2)
    subscription.unsubscribe()
  })

  it('4.3 a batch of N times out and prunes in one store update each', () => {
    const many = Array.from({ length: 500 }, (_, index) => fakeHash(index + 1))
    markPendingAll(many, 'delete')
    const updates = vi.fn()
    const subscription = pendingStore.subscribe(updates)
    vi.advanceTimersByTime(PENDING_TIMEOUT_MS)
    expect(updates).toHaveBeenCalledTimes(1)
    expect(pendingOpOf(many[0])).toBeNull()

    markPendingAll(many, 'delete')
    updates.mockClear()
    prunePending(() => false)
    expect(updates).toHaveBeenCalledTimes(1)
    expect(pendingOpOf(many[499])).toBeNull()
    // The batch's timer has nothing left to do.
    vi.advanceTimersByTime(PENDING_TIMEOUT_MS)
    expect(updates).toHaveBeenCalledTimes(1)
    subscription.unsubscribe()
  })

  it('4.3 a hash marked again leaves its batch: the old timer keeps it', () => {
    markPendingAll([A, B], 'delete')
    vi.advanceTimersByTime(20_000)
    markPending(A, 'stop')
    vi.advanceTimersByTime(10_000)
    expect(pendingOpOf(B)).toBeNull()
    expect(pendingOpOf(A)).toBe('stop')
    vi.advanceTimersByTime(20_000)
    expect(pendingOpOf(A)).toBeNull()
  })

  it('4.3 many marked hashes clear themselves after 30 s too', () => {
    markPendingAll([A, B], 'delete')
    vi.advanceTimersByTime(PENDING_TIMEOUT_MS)
    expect(pendingOpOf(A)).toBeNull()
    expect(pendingOpOf(B)).toBeNull()
  })

  it('prune drops hashes that no longer exist', () => {
    markPending(A, 'stop')
    markPending(B, 'start')
    prunePending((hash) => hash === B)
    expect(pendingOpOf(A)).toBeNull()
    expect(pendingOpOf(B)).toBe('start')
  })
})

describe('usePendingOp', () => {
  let client: QueryClient
  let answers: Array<MaindataResponse>
  let read: Array<string | null>

  const OWNED = ['stop', 'start']

  function Probe({ hash, action }: { hash: string; action: string }) {
    read.push(usePendingOp(hash, action, OWNED))
    return null
  }

  async function mount(action: string) {
    globalThis.IS_REACT_ACT_ENVIRONMENT = true
    notifyManager.setScheduler((callback) => callback())
    read = []
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
    const render = (next: string) =>
      act(async () =>
        root.render(
          <QueryClientProvider client={client}>
            <Probe hash={A} action={next} />
          </QueryClientProvider>,
        ),
      )
    await render(action)
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

  it('reads the op while the action is still the one sent', async () => {
    const view = await mount('stop')
    await act(async () => markPending(A, 'stop'))
    expect(read.at(-1)).toBe('stop')
    await view.unmount()
  })

  it('the action flips (qBittorrent reflected it): null at once, entry cleared', async () => {
    const view = await mount('stop')
    await act(async () => markPending(A, 'stop'))
    await view.render('start')
    expect(read.at(-1)).toBeNull()
    expect(pendingOpOf(A)).toBeNull()
    await view.unmount()
  })

  it('an op the reader does not send is returned and left alone', async () => {
    const view = await mount('stop')
    await act(async () => markPending(A, 'delete'))
    expect(read.at(-1)).toBe('delete')
    await view.render('start')
    expect(read.at(-1)).toBe('delete')
    expect(pendingOpOf(A)).toBe('delete')
    await view.unmount()
  })

  it('30 s pass: null without new data', async () => {
    const view = await mount('stop')
    await act(async () => markPending(A, 'stop'))
    await act(async () => vi.advanceTimersByTime(PENDING_TIMEOUT_MS))
    expect(read.at(-1)).toBeNull()
    await view.unmount()
  })

  it('a torrent gone from maindata loses its entry', async () => {
    const view = await mount('stop')
    await act(async () => {
      markPending(A, 'stop')
      markPending(B, 'start')
    })
    await view.poll(fakeResponse({ changed: [t({ hash: A })] }))
    expect(pendingOpOf(B)).toBeNull()
    expect(pendingOpOf(A)).toBe('stop')
    await view.unmount()
  })
})
