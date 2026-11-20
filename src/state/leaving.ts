import { createStore, useSelector } from '@tanstack/react-store'
import {
  EXPECT_LEAVING_MS,
  UNCLAIMED_LEAVING_MS,
  isExpectationLive,
} from '#/lib/leaving'
import type { SlimTorrent } from '#/shared/maindata'

// Story 4.4 (epic 4 「刪除淡出歸屬」, AD-7, AD-13): the rows on their way out.
// A delete that succeeded hands its hashes here as expected
// (`expectLeaving`, from delete-confirm). Nothing fades yet: only when the
// merged maindata no longer has an expected hash (`captureLeaving`, from
// the maindata query function) does it become leaving, with a snapshot of
// its last torrent, so the list and the board keep it in the order they
// show (order-freeze.ts) and can still draw it (`useShownTorrents` in
// maindata.ts) while it fades. A hash that leaves the data without being
// expected (another device, VueTorrent, a filter) never gets here and
// drops at once; an expectation also lapses 30 s after the success.
//
// Leaving hashes come in groups, one per maindata update that removed some.
// The first group is the active one: each mounted surface runs its exit on
// the active hashes it shows (src/state/leaving-exit.ts), claiming the ones
// it fades and finishing the rest at once. A group captured while another
// runs waits, rows and snapshots kept, until that one is finished (L12).
// Hashes no surface claimed within UNCLAIMED_LEAVING_MS (shown nowhere)
// are finished by a timer, so a later group never waits on them.
// Docs: TanStack Store `createStore` and `useSelector` as in
// src/state/order-freeze.ts, @tanstack/react-store 0.11.2 (pinned).

interface LeavingState {
  /** The last torrent of every leaving hash, active and queued. */
  snapshots: Readonly<Record<string, SlimTorrent>>
  /** Every leaving hash, active and queued. */
  hashes: ReadonlySet<string>
  /** The group whose exit runs now; empty when none. */
  active: ReadonlyArray<string>
  /** Groups waiting for the active one, oldest first. */
  queued: ReadonlyArray<ReadonlyArray<string>>
}

const NO_HASHES: ReadonlyArray<string> = Object.freeze([])
const NO_SNAPSHOTS: Readonly<Record<string, SlimTorrent>> = Object.freeze({})

const INITIAL: LeavingState = {
  snapshots: NO_SNAPSHOTS,
  hashes: new Set(),
  active: NO_HASHES,
  queued: [],
}

// Browser only, like the other stores in src/state.
export const leavingStore = createStore<LeavingState>(INITIAL)

/** Expected hashes and when each expectation lapses (epoch ms). */
const expected = new Map<string, number>()
/** Active hashes a surface is fading; the timer leaves them alone. */
const claimed = new Set<string>()
let unclaimedTimer: ReturnType<typeof setTimeout> | null = null

function clearUnclaimedTimer(): void {
  if (unclaimedTimer === null) return
  clearTimeout(unclaimedTimer)
  unclaimedTimer = null
}

/**
 * Bumped each time a group becomes active. `active` gets a new array
 * whenever part of it finishes, so the timer tells its group by this.
 */
let activeToken = 0

/** A group just became active: finish what nobody takes on in time. */
function armUnclaimedTimer(): void {
  clearUnclaimedTimer()
  activeToken += 1
  const token = activeToken
  unclaimedTimer = setTimeout(() => {
    unclaimedTimer = null
    if (token !== activeToken) return
    const { active } = leavingStore.state
    finishLeaving(active.filter((hash) => !claimed.has(hash)))
  }, UNCLAIMED_LEAVING_MS)
}

/**
 * A delete of `hashes` succeeded (one call of a batch): each one fades out
 * once a maindata update lacks it, within the next 30 s.
 */
export function expectLeaving(
  hashes: ReadonlyArray<string>,
  now: number = Date.now(),
): void {
  // A module-level store on the server would leak across requests.
  if (typeof window === 'undefined') return
  const expiresAt = now + EXPECT_LEAVING_MS
  for (const hash of hashes) expected.set(hash, expiresAt)
}

/**
 * Called by the maindata query function after each merge: expected hashes
 * that `previous` had and `next` lacks become leaving, with their last
 * torrent. Without `previous` (no data before: a reset) nothing does.
 */
export function captureLeaving(
  previous: Readonly<Record<string, SlimTorrent>> | undefined,
  next: Readonly<Record<string, SlimTorrent>>,
  now: number = Date.now(),
): void {
  if (expected.size === 0) return
  if (previous === undefined) {
    expected.clear()
    return
  }
  const group: Array<string> = []
  const snapshots: Record<string, SlimTorrent> = {}
  for (const [hash, expiresAt] of expected) {
    if (!isExpectationLive(expiresAt, now)) {
      expected.delete(hash)
      continue
    }
    if (Object.hasOwn(next, hash)) continue
    expected.delete(hash)
    // Already gone before this update (a poll beat the answer): it left
    // the order then.
    if (!Object.hasOwn(previous, hash)) continue
    group.push(hash)
    snapshots[hash] = previous[hash]
  }
  if (group.length === 0) return
  const startsNow = leavingStore.state.active.length === 0
  leavingStore.setState((state) => {
    const hashes = new Set(state.hashes)
    for (const hash of group) hashes.add(hash)
    return {
      snapshots: { ...state.snapshots, ...snapshots },
      hashes,
      active: startsNow ? group : state.active,
      queued: startsNow ? state.queued : [...state.queued, group],
    }
  })
  if (startsNow) armUnclaimedTimer()
}

/** A surface fades these active hashes; it finishes them itself. */
export function claimLeaving(hashes: Iterable<string>): void {
  for (const hash of hashes) claimed.add(hash)
}

/**
 * These hashes leave: out of the order, their snapshots dropped. When the
 * active group has none left, the next queued group starts.
 */
export function finishLeaving(hashes: Iterable<string>): void {
  const state = leavingStore.state
  const gone = new Set<string>()
  for (const hash of hashes) {
    if (state.hashes.has(hash)) gone.add(hash)
    claimed.delete(hash)
  }
  if (gone.size === 0) return
  const without = (group: ReadonlyArray<string>) =>
    group.some((hash) => gone.has(hash))
      ? group.filter((hash) => !gone.has(hash))
      : group
  let active = without(state.active)
  let queued = state.queued.map(without).filter((group) => group.length > 0)
  let started: ReadonlyArray<string> | null = null
  if (active.length === 0 && queued.length > 0) {
    started = queued[0]
    active = started
    queued = queued.slice(1)
  }
  const snapshots: Record<string, SlimTorrent> = { ...state.snapshots }
  const leaving = new Set(state.hashes)
  for (const hash of gone) {
    delete snapshots[hash]
    leaving.delete(hash)
  }
  leavingStore.setState(() => ({
    snapshots: leaving.size === 0 ? NO_SNAPSHOTS : snapshots,
    hashes: leaving,
    active: active.length === 0 ? NO_HASHES : active,
    queued,
  }))
  if (started) armUnclaimedTimer()
  else if (active.length === 0) clearUnclaimedTimer()
}

/** Every leaving hash (active and queued): the order keeps them. */
export function useLeavingHashes(): ReadonlySet<string> {
  return useSelector(leavingStore, (state) => state.hashes)
}

/** The group whose exit runs now; empty when none. */
export function useActiveLeaving(): ReadonlyArray<string> {
  return useSelector(leavingStore, (state) => state.active)
}

/** The last torrent of every leaving hash. */
export function useLeavingSnapshots(): Readonly<Record<string, SlimTorrent>> {
  return useSelector(leavingStore, (state) => state.snapshots)
}

/** Nothing expected or leaving, no timer (tests only). */
export function resetLeaving(): void {
  clearUnclaimedTimer()
  expected.clear()
  claimed.clear()
  leavingStore.setState(() => ({ ...INITIAL, hashes: new Set() }))
}
