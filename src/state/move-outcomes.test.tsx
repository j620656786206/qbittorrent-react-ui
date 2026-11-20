// @vitest-environment happy-dom
import { StrictMode, act, createElement } from 'react'
import { createRoot } from 'react-dom/client'
import type { Root } from 'react-dom/client'
import { QueryClientProvider, notifyManager } from '@tanstack/react-query'
import type { QueryClient } from '@tanstack/react-query'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fakeHash, fakeResponse, t } from '#/lib/testing'
import { MOVING_TO_EXPIRY_MS } from '#/shared/maindata'
import type { SlimTorrent } from '#/shared/maindata'
import { defaultSettings } from '#/shared/settings'
import type { Settings } from '#/shared/settings'
import { MAINDATA_KEY } from '#/state/maindata'
import { useMoveOutcomes } from '#/state/move-outcomes'
import type { ResendMove } from '#/state/move-outcomes'
import {
  markPending,
  moveRecordOf,
  recordMoves,
  resetPendingOps,
} from '#/state/pending-ops'
import { createQueryClient } from '#/state/query-client'
import { SETTINGS_KEY } from '#/state/settings'

// Spec 5.3 rows O1 to O7 through the hook: the decision runs on every
// maindata change for each recorded hash; done shows 「已搬到 <name>」 once,
// failed 「沒有搬到 <target>」 with 重試 (the injected resend), a torrent
// with no record never toasts, a gone torrent or a stale record goes
// quietly.

const toastCalls = vi.hoisted(() => ({
  plain: vi.fn((_text: string) => {}),
  failure: vi.fn(
    (
      _text: string,
      _options: { keys: ReadonlyArray<string>; onRetry: () => void },
    ) => {},
  ),
  dismissFor: vi.fn(),
}))
vi.mock('#/lib/toast', () => ({ toast: toastCalls }))

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean | undefined
}

const A = fakeHash(0xa1)
const B = fakeHash(0xb1)
const OLD = '/data/torrents/tv'
const TV = '/data/media/tv'
const fromOld = () => OLD
const SETTINGS: Settings = {
  ...defaultSettings(),
  commonPaths: [
    { path: OLD, name: '下載區（影集）', mediaLibrary: false },
    { path: TV, name: '影集媒體庫', mediaLibrary: true },
  ],
}

let root: Root
let client: QueryClient
let torrents: Array<SlimTorrent>
let resend: ReturnType<typeof vi.fn<ResendMove>>

function Probe() {
  useMoveOutcomes(resend)
  return null
}

async function render({ strict = false } = {}) {
  client = createQueryClient({
    fetchMaindata: () => Promise.resolve(fakeResponse({ changed: torrents })),
    fetchSettings: () => Promise.resolve(SETTINGS),
    currentPath: () => '/',
  })
  await client.prefetchQuery({ queryKey: MAINDATA_KEY })
  await client.prefetchQuery({ queryKey: SETTINGS_KEY })
  root = createRoot(document.createElement('div'))
  const probe = createElement(Probe)
  await act(async () =>
    root.render(
      createElement(
        QueryClientProvider,
        { client },
        strict ? createElement(StrictMode, null, probe) : probe,
      ),
    ),
  )
}

/** The next maindata answer is `next`. */
async function poll(next: Array<SlimTorrent>) {
  torrents = next
  await act(async () => {
    await client.refetchQueries({ queryKey: MAINDATA_KEY })
  })
}

const at = (savePath: string, extra: Partial<SlimTorrent> = {}) =>
  t({
    hash: A,
    name: 'Fake Show S01',
    state: 'uploading',
    progress: 1,
    save_path: savePath,
    ...extra,
  })

beforeEach(() => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true
  notifyManager.setScheduler((callback) => callback())
  resetPendingOps()
  torrents = [at(OLD)]
  resend = vi.fn<ResendMove>()
  toastCalls.plain.mockClear()
  toastCalls.failure.mockClear()
})

afterEach(async () => {
  await act(async () => root.unmount())
  client.clear()
  resetPendingOps()
  vi.useRealTimers()
  notifyManager.setScheduler((callback) => setTimeout(callback, 0))
  globalThis.IS_REACT_ACT_ENVIRONMENT = false
})

describe('useMoveOutcomes (spec 5.3)', () => {
  it('O1 seen then at the target: one 「已搬到 影集媒體庫」, the record goes', async () => {
    await render()
    await act(async () => recordMoves([A], TV, fromOld))
    // O4: nothing visible yet.
    expect(moveRecordOf(A)?.seen).toBe(false)
    await poll([at(OLD, { movingTo: TV })])
    expect(moveRecordOf(A)?.seen).toBe(true)
    await poll([at(OLD, { movingTo: TV, state: 'moving' })])
    expect(toastCalls.plain).not.toHaveBeenCalled()
    await poll([at(`${TV}/`)])
    expect(toastCalls.plain).toHaveBeenCalledExactlyOnceWith(
      '已搬到 影集媒體庫',
    )
    expect(toastCalls.failure).not.toHaveBeenCalled()
    expect(moveRecordOf(A)).toBeNull()
    await poll([at(`${TV}/`, { upspeed: 10 })])
    expect(toastCalls.plain).toHaveBeenCalledTimes(1)
  })

  it('O2 seen then back where it was: 「沒有搬到 …」 with 重試 sending the same hash and target', async () => {
    await render()
    await act(async () => recordMoves([A], TV, fromOld))
    await poll([at(OLD, { state: 'moving', movingTo: TV })])
    await poll([at(OLD)])
    expect(toastCalls.plain).not.toHaveBeenCalled()
    expect(toastCalls.failure).toHaveBeenCalledTimes(1)
    const [text, options] = toastCalls.failure.mock.calls[0]
    expect(text).toBe(`沒有搬到 ${TV}`)
    expect(options.keys).toEqual([`move:${A}`])
    expect(moveRecordOf(A)).toBeNull()
    expect(resend).not.toHaveBeenCalled()
    options.onRetry()
    expect(resend).toHaveBeenCalledExactlyOnceWith(A, TV)
  })

  it('seen, then another client puts it in a third folder: the record goes, no toast', async () => {
    await render()
    await act(async () => recordMoves([A], TV, fromOld))
    await poll([at(OLD, { state: 'moving', movingTo: TV })])
    await poll([at('/data/media/anime')])
    expect(moveRecordOf(A)).toBeNull()
    expect(toastCalls.plain).not.toHaveBeenCalled()
    expect(toastCalls.failure).not.toHaveBeenCalled()
  })

  it('O3 never seen, already at the target on the next poll: done', async () => {
    await render()
    await act(async () => recordMoves([A], TV, fromOld))
    await poll([at(TV)])
    expect(toastCalls.plain).toHaveBeenCalledExactlyOnceWith(
      '已搬到 影集媒體庫',
    )
  })

  it('a record written when maindata already shows the target: done at once', async () => {
    torrents = [at(TV)]
    await render()
    await act(async () => recordMoves([A], TV, fromOld))
    expect(toastCalls.plain).toHaveBeenCalledExactlyOnceWith(
      '已搬到 影集媒體庫',
    )
  })

  it('O5 another device: no record, moving comes and goes, no toast', async () => {
    await render()
    await poll([at(OLD, { state: 'moving' })])
    await poll([at(TV)])
    await poll([at(TV, { movingTo: undefined })])
    expect(toastCalls.plain).not.toHaveBeenCalled()
    expect(toastCalls.failure).not.toHaveBeenCalled()
  })

  it('only the recorded hash toasts when two move', async () => {
    torrents = [at(OLD), at(OLD, { hash: B })]
    await render()
    await act(async () => recordMoves([A], TV, fromOld))
    await poll([
      at(OLD, { movingTo: TV }),
      at(OLD, { hash: B, state: 'moving' }),
    ])
    await poll([at(TV), at(TV, { hash: B })])
    expect(toastCalls.plain).toHaveBeenCalledTimes(1)
  })

  it('O6 a pause of the same torrent past 30 s: the record still decides', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'] })
    await render()
    await act(async () => recordMoves([A], TV, fromOld))
    await poll([at(OLD, { state: 'moving', movingTo: TV })])
    await act(async () => {
      markPending(A, 'stop')
      vi.advanceTimersByTime(45_000)
    })
    expect(moveRecordOf(A)?.seen).toBe(true)
    await poll([at(TV, { state: 'stoppedUP' })])
    expect(toastCalls.plain).toHaveBeenCalledExactlyOnceWith(
      '已搬到 影集媒體庫',
    )
  })

  it('O7 the torrent leaves maindata: the record goes, no toast', async () => {
    await render()
    await act(async () => recordMoves([A], TV, fromOld))
    await poll([at(OLD, { movingTo: TV })])
    await poll([])
    expect(moveRecordOf(A)).toBeNull()
    expect(toastCalls.plain).not.toHaveBeenCalled()
    expect(toastCalls.failure).not.toHaveBeenCalled()
  })

  it('O7 never seen for 10 minutes: the record goes, no toast', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'] })
    await render()
    await act(async () => recordMoves([A], TV, fromOld))
    await act(async () => vi.advanceTimersByTime(MOVING_TO_EXPIRY_MS))
    expect(moveRecordOf(A)).toBeNull()
    // The move showing late changes nothing.
    await poll([at(OLD, { state: 'moving' })])
    await poll([at(TV)])
    expect(toastCalls.plain).not.toHaveBeenCalled()
  })

  it('StrictMode runs the effect twice on mount: still one toast', async () => {
    torrents = [at(TV)]
    await act(async () => recordMoves([A], TV, fromOld))
    await render({ strict: true })
    expect(toastCalls.plain).toHaveBeenCalledTimes(1)
  })
})
