// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { AppError } from '#/lib/app-error'
import { fakeHash, fakeResponse, t } from '#/lib/testing'
import type { BatchResult, SetLocationInput } from '#/shared/torrent-ops'
import { clearLoginRequired } from '#/state/login-required'
import { MAINDATA_KEY } from '#/state/maindata'
import {
  markPending,
  moveRecordOf,
  pendingOpOf,
  resetPendingOps,
} from '#/state/pending-ops'
import { createQueryClient } from '#/state/query-client'
import { sendOp } from '#/state/tracked-op'
import { moveVariables, setLocationOp } from '#/features/path/set-location-op'

// Spec 5.3: the move op records a move per ok hash with its target (and
// the save_path it left when Alex pressed) once setLocation answers, never
// on send and never for a refused item. A move marks no 30 s pending entry.

const toastCalls = vi.hoisted(() => ({
  failure: vi.fn(),
  dismissFor: vi.fn(),
}))
vi.mock('#/lib/toast', () => ({ toast: toastCalls }))

const A = fakeHash(0xa1)
const B = fakeHash(0xb1)
const TV = '/data/media/tv'

let maindataFetches = 0
let savePathNow = '/data/torrents/tv/'

function client() {
  const queryClient = createQueryClient({
    fetchMaindata: () => {
      maindataFetches += 1
      return Promise.resolve(
        fakeResponse({
          changed: [t({ hash: A, save_path: savePathNow })],
        }),
      )
    },
    currentPath: () => '/',
  })
  return queryClient
}

beforeEach(() => {
  clearLoginRequired()
  resetPendingOps()
  maindataFetches = 0
  savePathNow = '/data/torrents/tv/'
  toastCalls.failure.mockClear()
})

afterEach(() => {
  resetPendingOps()
})

describe('setLocationOp move records (spec 5.3)', () => {
  it('records each ok hash with the target on success, not on send', async () => {
    let answer: (value: BatchResult) => void = () => {}
    const sent: Array<SetLocationInput> = []
    const op = setLocationOp((input) => {
      sent.push(input)
      return new Promise((resolve) => {
        answer = resolve
      })
    })
    const queryClient = client()
    await queryClient.prefetchQuery({ queryKey: MAINDATA_KEY })
    const done = sendOp(op, queryClient, moveVariables(queryClient, [A, B], TV))
    await vi.waitFor(() => expect(sent).toHaveLength(1))
    expect(sent[0]).toEqual({ hashes: [A, B], location: TV })
    expect(pendingOpOf(A)).toBeNull()
    expect(moveRecordOf(A)).toBeNull()
    const before = maindataFetches
    answer({
      items: [
        { key: A, ok: true },
        { key: B, ok: false, code: 'qbit_rejected', message: 'x' },
      ],
    })
    await done
    // `from` is the save_path maindata had when pressed, normalized.
    expect(moveRecordOf(A)).toMatchObject({
      target: TV,
      from: '/data/torrents/tv',
      seen: false,
    })
    expect(moveRecordOf(B)).toBeNull()
    await vi.waitFor(() => expect(maindataFetches).toBeGreaterThan(before))
  })

  it.each([
    ['qbit_rejected', '改路徑失敗：這個種子正在搬'],
    ['invalid_input', '改路徑失敗：找不到這個種子'],
  ] as const)(
    'a single item refused as %s is a failure naming the torrent: no record',
    async (code, text) => {
      const op = setLocationOp(() =>
        Promise.resolve({ items: [{ key: A, ok: false, code, message: 'x' }] }),
      )
      await sendOp(op, client(), { hashes: [A], location: TV, from: {} })
      expect(moveRecordOf(A)).toBeNull()
      expect(toastCalls.failure).toHaveBeenCalledTimes(1)
      expect(toastCalls.failure.mock.calls[0][0]).toBe(text)
    },
  )

  it.each([
    ['qbit_rejected', '改路徑失敗：qBittorrent 拒絕這個操作'],
    ['invalid_input', '改路徑失敗：這個路徑不在允許的下載資料夾底下'],
  ] as const)(
    'the whole call refused as %s keeps the call-level text',
    async (code, text) => {
      const op = setLocationOp(() => Promise.reject(new AppError(code)))
      await sendOp(op, client(), { hashes: [A], location: TV, from: {} })
      expect(toastCalls.failure.mock.calls[0][0]).toBe(text)
    },
  )

  it('from is read when pressed: a refresh before the answer does not change it', async () => {
    let answer: (value: BatchResult) => void = () => {}
    let called = false
    const op = setLocationOp(
      () =>
        new Promise((resolve) => {
          called = true
          answer = resolve
        }),
    )
    const queryClient = client()
    await queryClient.prefetchQuery({ queryKey: MAINDATA_KEY })
    const done = sendOp(op, queryClient, moveVariables(queryClient, [A], TV))
    await vi.waitFor(() => expect(called).toBe(true))
    // A poll lands before the answer, already at the target.
    savePathNow = TV
    await queryClient.refetchQueries({ queryKey: MAINDATA_KEY })
    answer({ items: [{ key: A, ok: true }] })
    await done
    expect(moveRecordOf(A)?.from).toBe('/data/torrents/tv')
  })

  it('a move leaves a pending pause of the same torrent alone', async () => {
    const op = setLocationOp(() =>
      Promise.resolve({ items: [{ key: A, ok: true }] }),
    )
    markPending(A, 'stop')
    await sendOp(op, client(), { hashes: [A], location: TV, from: {} })
    expect(pendingOpOf(A)).toBe('stop')
  })

  it('a failed call records nothing', async () => {
    const op = setLocationOp(() => Promise.reject(new AppError('timeout')))
    await sendOp(op, client(), { hashes: [A], location: TV, from: {} })
    expect(moveRecordOf(A)).toBeNull()
  })

  it('a second move of the same hash replaces the record', async () => {
    const op = setLocationOp(({ hashes }) =>
      Promise.resolve({ items: hashes.map((key) => ({ key, ok: true })) }),
    )
    const queryClient = client()
    await sendOp(op, queryClient, { hashes: [A], location: TV, from: {} })
    await sendOp(op, queryClient, {
      hashes: [A],
      location: '/data/media/movies',
      from: {},
    })
    expect(moveRecordOf(A)?.target).toBe('/data/media/movies')
  })
})
