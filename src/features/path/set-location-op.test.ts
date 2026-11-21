// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { AppError } from '#/lib/app-error'
import { fakeHash, fakeResponse, t } from '#/lib/testing'
import type { BatchResult, SetLocationInput } from '#/shared/torrent-ops'
import { clearLoginRequired } from '#/state/login-required'
import { MAINDATA_KEY } from '#/state/maindata'
import {
  MOVE_PENDING_OP,
  moveRecordOf,
  pendingOpOf,
  resetPendingOps,
} from '#/state/pending-ops'
import { createQueryClient } from '#/state/query-client'
import { sendOp } from '#/state/tracked-op'
import { setLocationOp } from '#/features/path/set-location-op'

// Spec 5.3: the move op records a move per ok hash with its target (and
// the save_path it leaves) once
// setLocation answers, never on send and never for a refused item.

const toastCalls = vi.hoisted(() => ({
  failure: vi.fn(),
  dismissFor: vi.fn(),
}))
vi.mock('#/lib/toast', () => ({ toast: toastCalls }))

const A = fakeHash(0xa1)
const B = fakeHash(0xb1)
const TV = '/data/media/tv'

let maindataFetches = 0

function client() {
  const queryClient = createQueryClient({
    fetchMaindata: () => {
      maindataFetches += 1
      return Promise.resolve(
        fakeResponse({
          changed: [t({ hash: A, save_path: '/data/torrents/tv/' })],
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
    const done = sendOp(op, queryClient, { hashes: [A, B], location: TV })
    await vi.waitFor(() => expect(sent).toHaveLength(1))
    expect(pendingOpOf(A)).toBe(MOVE_PENDING_OP)
    expect(moveRecordOf(A)).toBeNull()
    const before = maindataFetches
    answer({
      items: [
        { key: A, ok: true },
        { key: B, ok: false, code: 'qbit_rejected', message: 'x' },
      ],
    })
    await done
    // `from` is the save_path maindata had before the refresh, normalized.
    expect(moveRecordOf(A)).toMatchObject({
      target: TV,
      from: '/data/torrents/tv',
      seen: false,
    })
    expect(moveRecordOf(B)).toBeNull()
    await vi.waitFor(() => expect(maindataFetches).toBeGreaterThan(before))
  })

  it('a single refused item is a failure: no record, the pending entry goes', async () => {
    const op = setLocationOp(() =>
      Promise.resolve({
        items: [{ key: A, ok: false, code: 'qbit_rejected', message: 'x' }],
      }),
    )
    await sendOp(op, client(), { hashes: [A], location: TV })
    expect(moveRecordOf(A)).toBeNull()
    expect(pendingOpOf(A)).toBeNull()
    expect(toastCalls.failure).toHaveBeenCalledTimes(1)
  })

  it('a failed call records nothing', async () => {
    const op = setLocationOp(() => Promise.reject(new AppError('timeout')))
    await sendOp(op, client(), { hashes: [A], location: TV })
    expect(moveRecordOf(A)).toBeNull()
  })

  it('a second move of the same hash replaces the record', async () => {
    const op = setLocationOp(({ hashes }) =>
      Promise.resolve({ items: hashes.map((key) => ({ key, ok: true })) }),
    )
    const queryClient = client()
    await sendOp(op, queryClient, { hashes: [A], location: TV })
    await sendOp(op, queryClient, {
      hashes: [A],
      location: '/data/media/movies',
    })
    expect(moveRecordOf(A)?.target).toBe('/data/media/movies')
  })
})
