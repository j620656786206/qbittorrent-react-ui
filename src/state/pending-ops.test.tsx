// @vitest-environment happy-dom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { QueryClientProvider, notifyManager } from '@tanstack/react-query'
import type { QueryClient } from '@tanstack/react-query'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fakeHash, fakeResponse, t } from '#/lib/testing'
import type { MaindataResponse } from '#/shared/maindata'
import { MAINDATA_KEY } from '#/state/maindata'
import {
  PENDING_TIMEOUT_MS,
  clearPending,
  filePendingKey,
  markPending,
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

  it('prune drops hashes that no longer exist', () => {
    markPending(A, 'stop')
    markPending(B, 'start')
    prunePending((hash) => hash === B)
    expect(pendingOpOf(A)).toBeNull()
    expect(pendingOpOf(B)).toBe('start')
  })

  it('story 2.7 file keys never meet a torrent hash and survive pruning', () => {
    const key = filePendingKey(A, 3)
    expect(key).toBe(`file:${A}:3`)
    expect(key).not.toBe(A)
    expect(filePendingKey(A, 3)).not.toBe(filePendingKey(A, 30))
    markPending(key, 'file')
    markPending(A, 'stop')
    prunePending(() => false)
    expect(pendingOpOf(key)).toBe('file')
    expect(pendingOpOf(A)).toBeNull()
  })

  it('story 2.7 a file key still clears itself after 30 s', () => {
    const key = filePendingKey(A, 0)
    markPending(key, 'file')
    vi.advanceTimersByTime(PENDING_TIMEOUT_MS)
    expect(pendingOpOf(key)).toBeNull()
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
      markPending(filePendingKey(A, 1), 'file')
    })
    await view.poll(fakeResponse({ changed: [t({ hash: A })] }))
    expect(pendingOpOf(B)).toBeNull()
    expect(pendingOpOf(A)).toBe('stop')
    // Story 2.7: a file key is not a torrent maindata knows; it stays.
    expect(pendingOpOf(filePendingKey(A, 1))).toBe('file')
    await view.unmount()
  })
})
