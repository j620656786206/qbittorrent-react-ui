// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { EXPECT_LEAVING_MS, UNCLAIMED_LEAVING_MS } from '#/lib/leaving'
import { fakeHash, t } from '#/lib/testing'
import type { SlimTorrent } from '#/shared/maindata'
import {
  captureLeaving,
  claimLeaving,
  expectLeaving,
  finishLeaving,
  leavingStore,
  resetLeaving,
} from '#/state/leaving'
import { PENDING_TIMEOUT_MS } from '#/state/pending-ops'

// Story 4.4: the leaving store. Only hashes this tab deleted, and only once
// a maindata update lacks them, become leaving (with a snapshot); a second
// group waits for the first; an expectation lapses after 30 s.

const A = fakeHash(0xa1)
const B = fakeHash(0xb1)
const C = fakeHash(0xc1)
const D = fakeHash(0xd1)

function record(...hashes: Array<string>): Record<string, SlimTorrent> {
  return Object.fromEntries(
    hashes.map((hash) => [hash, t({ hash, name: `Fake.${hash.slice(-2)}` })]),
  )
}

function without(
  torrents: Record<string, SlimTorrent>,
  ...hashes: Array<string>
): Record<string, SlimTorrent> {
  const next = { ...torrents }
  for (const hash of hashes) delete next[hash]
  return next
}

const state = () => leavingStore.state
const NOW = 1_800_000_000_000

beforeEach(() => {
  vi.useFakeTimers()
  resetLeaving()
})

afterEach(() => {
  resetLeaving()
  vi.useRealTimers()
})

describe('the leaving store', () => {
  it('lapses with the pending-ops timeout', () => {
    expect(EXPECT_LEAVING_MS).toBe(PENDING_TIMEOUT_MS)
  })

  it('snapshots an expected hash once the data lacks it', () => {
    const before = record(A, B)
    expectLeaving([A], NOW)
    captureLeaving(before, without(before, A), NOW + 10)
    expect(state().active).toEqual([A])
    expect([...state().hashes]).toEqual([A])
    expect(state().snapshots[A]).toBe(before[A])
  })

  it('L5: nothing happens while the data still has the hash', () => {
    const before = record(A, B)
    expectLeaving([A], NOW)
    captureLeaving(before, { ...before }, NOW + 10)
    expect(state().hashes.size).toBe(0)
    // Still expected: the next update that lacks it captures it.
    captureLeaving(before, without(before, A), NOW + 20)
    expect(state().active).toEqual([A])
  })

  it('L4: a removal nobody expected never snapshots', () => {
    const before = record(A, B)
    expectLeaving([A], NOW)
    captureLeaving(before, without(before, B), NOW + 10)
    expect(state().hashes.size).toBe(0)
    expect(state().snapshots).toEqual({})
  })

  it('L6: an expectation lapses 30 s after the success', () => {
    const before = record(A)
    expectLeaving([A], NOW)
    captureLeaving(before, {}, NOW + EXPECT_LEAVING_MS)
    expect(state().hashes.size).toBe(0)
  })

  it('a hash already gone before the update (a poll beat the answer) drops', () => {
    expectLeaving([A], NOW)
    captureLeaving(record(B), record(B), NOW + 10)
    expect(state().hashes.size).toBe(0)
    // And it is no longer expected.
    captureLeaving(record(A), {}, NOW + 20)
    expect(state().hashes.size).toBe(0)
  })

  it('a data reset (no previous data) captures nothing', () => {
    expectLeaving([A], NOW)
    captureLeaving(undefined, {}, NOW + 10)
    captureLeaving(record(A), {}, NOW + 20)
    expect(state().hashes.size).toBe(0)
  })

  it('L12: a second group waits until the active one is finished', () => {
    const all = record(A, B, C, D)
    expectLeaving([A, B], NOW)
    const first = without(all, A, B)
    captureLeaving(all, first, NOW + 10)
    expectLeaving([C], NOW + 20)
    captureLeaving(first, without(first, C), NOW + 30)
    expect(state().active).toEqual([A, B])
    expect(state().queued).toEqual([[C]])
    expect([...state().hashes].sort()).toEqual([A, B, C].sort())
    expect(Object.keys(state().snapshots).sort()).toEqual([A, B, C].sort())

    finishLeaving([A])
    expect(state().active).toEqual([B])
    expect(state().snapshots[A]).toBeUndefined()
    finishLeaving([B])
    expect(state().active).toEqual([C])
    expect(state().queued).toEqual([])
    expect(state().snapshots[C]).toBe(all[C])
    finishLeaving([C])
    expect(state().active).toEqual([])
    expect(state().hashes.size).toBe(0)
  })

  it('finishes active hashes no surface claimed after a while', () => {
    const before = record(A, B)
    expectLeaving([A, B], NOW)
    captureLeaving(before, {}, NOW + 10)
    claimLeaving([A])
    vi.advanceTimersByTime(UNCLAIMED_LEAVING_MS - 1)
    expect(state().active).toEqual([A, B])
    vi.advanceTimersByTime(1)
    expect(state().active).toEqual([A])
    finishLeaving([A])
    expect(state().hashes.size).toBe(0)
  })

  it('the timer still finishes the rest after part of the group finished; the queued group starts', () => {
    const all = record(A, B, C)
    expectLeaving([A, B], NOW)
    const first = without(all, A, B)
    captureLeaving(all, first, NOW + 10)
    expectLeaving([C], NOW + 20)
    captureLeaving(first, {}, NOW + 30)
    // A surface fades and finishes A; B is shown nowhere.
    claimLeaving([A])
    finishLeaving([A])
    expect(state().active).toEqual([B])
    vi.advanceTimersByTime(UNCLAIMED_LEAVING_MS)
    expect(state().hashes.has(B)).toBe(false)
    expect(state().active).toEqual([C])
    expect(state().queued).toEqual([])
  })

  it('finishing unknown hashes changes nothing', () => {
    const before = state()
    finishLeaving([A])
    expect(state()).toBe(before)
  })
})
