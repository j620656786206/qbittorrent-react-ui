import { useLayoutEffect, useMemo, useRef } from 'react'
import { createStore, useSelector } from '@tanstack/react-store'

// AR-50, AD-13: the one owner of "do not reorder right now" (EXPERIENCE
// 「資料一直更新時先不重排」). While frozen, values keep updating but the shown
// positions hold; when the last reason ends the list reorders once. Torrents
// that left the data (deleted, archived) leave at once; new ones wait for
// the unfreeze.
//
// Reasons in Epic 1: the mouse resting on the desktop list, and a phone
// finger scrolling it (from `touchstart` until TOUCH_SETTLE_MS after the
// last scroll once the finger lifted, so momentum scrolling counts). The
// selection, an open bottom sheet and running animations join this store
// later as further reasons.

/** Quiet time after the last scroll before a touch scroll counts as over. */
export const TOUCH_SETTLE_MS = 300

export interface FreezeReasons {
  /** The mouse is inside the desktop list section. */
  pointerInList: boolean
  /** A finger is on the list, or its scroll has not settled yet. */
  touchScroll: boolean
}

export function isOrderFrozen(reasons: FreezeReasons): boolean {
  return reasons.pointerInList || reasons.touchScroll
}

/** Spec 1.8 row F6: still touching, or the last scroll is under 300 ms old. */
export function touchFrozen({
  touching,
  lastScrollAt,
  now,
}: {
  touching: boolean
  /** `performance.now()` of the last scroll in this touch session, if any. */
  lastScrollAt: number | null
  now: number
}): boolean {
  if (touching) return true
  return lastScrollAt !== null && now - lastScrollAt < TOUCH_SETTLE_MS
}

/**
 * Spec 1.8 rows F1 to F5. Not frozen: the live order. Frozen: the order last
 * shown, minus hashes no longer live; the same array when nothing left.
 */
export function nextShownOrder(
  shown: ReadonlyArray<string> | null,
  live: ReadonlyArray<string>,
  frozen: boolean,
): ReadonlyArray<string> {
  if (!frozen || shown === null) return live
  if (shown === live) return shown
  const alive = new Set(live)
  const kept = shown.filter((hash) => alive.has(hash))
  return kept.length === shown.length ? shown : kept
}

/** What the list showed last; `null` before any data. */
export type ShownOrder = ReadonlyArray<string> | null

/**
 * The hook's update, pure: one step from the order shown last to the order
 * to show for this `live` and `frozen`. No data resets it.
 */
export function shownOrderReducer(
  shown: ShownOrder,
  {
    live,
    frozen,
  }: { live: ReadonlyArray<string> | undefined; frozen: boolean },
): ShownOrder {
  if (live === undefined) return null
  return nextShownOrder(shown, live, frozen)
}

// Browser only, like the other stores in src/state.
export const freezeStore = createStore<FreezeReasons>({
  pointerInList: false,
  touchScroll: false,
})

function setReason(name: keyof FreezeReasons, value: boolean): void {
  if (freezeStore.state[name] === value) return
  freezeStore.setState((state) => ({ ...state, [name]: value }))
}

export function setPointerInList(inside: boolean): void {
  setReason('pointerInList', inside)
}

// The touch session: `touching` while a finger is down, `lastScrollAt` for
// the settle time after it lifts.
const touch = {
  touching: false,
  /** `performance.now()` of the last scroll (monotonic, unlike Date.now). */
  lastScrollAt: null as number | null,
  timer: null as ReturnType<typeof setTimeout> | null,
}

function clearSettleTimer(): void {
  if (touch.timer === null) return
  clearTimeout(touch.timer)
  touch.timer = null
}

/** Ends the touch reason once the scroll settled, or checks again later. */
function settle(): void {
  clearSettleTimer()
  const now = performance.now()
  if (touchFrozen({ ...touch, now })) {
    const wait = (touch.lastScrollAt ?? now) + TOUCH_SETTLE_MS - now
    touch.timer = setTimeout(settle, Math.max(0, wait))
    return
  }
  touch.lastScrollAt = null
  setReason('touchScroll', false)
}

export function touchScrollStart(): void {
  clearSettleTimer()
  touch.touching = true
  setReason('touchScroll', true)
}

export function touchScrollEnd(): void {
  if (!touch.touching) return
  touch.touching = false
  settle()
}

/** A scroll event on the list's scroll container; counts during a touch. */
export function noteScroll(): void {
  if (!freezeStore.state.touchScroll) return
  touch.lastScrollAt = performance.now()
  if (!touch.touching) settle()
}

/** Clears every reason (the list unmounts, tests). */
export function resetOrderFreeze(): void {
  clearSettleTimer()
  touch.touching = false
  touch.lastScrollAt = null
  freezeStore.setState(() => ({ pointerInList: false, touchScroll: false }))
}

export function useOrderFrozen(): boolean {
  return useSelector(freezeStore, isOrderFrozen)
}

/**
 * The order to show: `live` (from `useVisibleTorrents`) passed through the
 * freeze. Keeps the last committed order in a ref; `undefined` before data.
 */
export function useFrozenOrder(
  live: ReadonlyArray<string> | undefined,
): ReadonlyArray<string> | undefined {
  const frozen = useOrderFrozen()
  const shownRef = useRef<ShownOrder>(null)
  const shown = useMemo(
    () => shownOrderReducer(shownRef.current, { live, frozen }),
    [live, frozen],
  )
  // Only a committed order counts as "shown".
  useLayoutEffect(() => {
    shownRef.current = shown
  }, [shown])
  return shown ?? undefined
}
