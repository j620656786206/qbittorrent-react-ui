import { useLayoutEffect, useMemo, useRef } from 'react'
import { createStore, useSelector } from '@tanstack/react-store'

// AR-50, AD-13: the one owner of "do not reorder right now" (EXPERIENCE
// 「資料一直更新時先不重排」). While frozen, values keep updating but the shown
// positions hold; when the last reason ends the list reorders once. Torrents
// that left the data (deleted, archived) leave at once; new ones wait for
// the unfreeze.
//
// Alex's own sort change is not data: it reorders at once, frozen or not
// (story 2.1). Reasons in Epic 1: the mouse resting on the desktop list, and a phone
// finger scrolling it (from `touchstart` until TOUCH_SETTLE_MS after the
// last scroll once the finger lifted, so momentum scrolling counts). Story
// 2.2: an open bottom sheet (EXPERIENCE 「底部面板開著」). The selection and
// running animations join this store later as further reasons.

/** Quiet time after the last scroll before a touch scroll counts as over. */
export const TOUCH_SETTLE_MS = 300

export interface FreezeReasons {
  /** The mouse is inside the desktop list section. */
  pointerInList: boolean
  /** A finger is on the list, or its scroll has not settled yet. */
  touchScroll: boolean
  /** A bottom sheet is open (story 2.2). */
  sheetOpen: boolean
}

export function isOrderFrozen(reasons: FreezeReasons): boolean {
  return reasons.pointerInList || reasons.touchScroll || reasons.sheetOpen
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

export interface ShownOrderInput {
  live: ReadonlyArray<string> | undefined
  frozen: boolean
  /**
   * Alex changed the sort since the order shown last was taken (story 2.1):
   * his own action applies at once, frozen or not.
   */
  viewChanged?: boolean
  /**
   * The new sort's values are still loading (an extra sort's first keys):
   * keep the order shown, like a freeze, until they arrive.
   */
  hold?: boolean
  /**
   * While holding, new torrents go on top at once instead of waiting (the
   * first keys failed and may not come for a while). Only for `hold`, never
   * for the pointer or touch freeze.
   */
  holdAddsNew?: boolean
}

/** The order shown minus gone hashes, with new ones on top in live order. */
export function keepWithNewOnTop(
  shown: ReadonlyArray<string> | null,
  live: ReadonlyArray<string>,
): ReadonlyArray<string> {
  if (shown === null || shown === live) return live
  const alive = new Set(live)
  const known = new Set(shown)
  const fresh = live.filter((hash) => !known.has(hash))
  const kept = shown.filter((hash) => alive.has(hash))
  if (fresh.length === 0 && kept.length === shown.length) return shown
  return [...fresh, ...kept]
}

/**
 * The hook's update, pure: one step from the order shown last to the order
 * to show. No data resets it; a sort change does, once its values are there.
 */
export function shownOrderReducer(
  shown: ShownOrder,
  {
    live,
    frozen,
    viewChanged = false,
    hold = false,
    holdAddsNew = false,
  }: ShownOrderInput,
): ShownOrder {
  if (live === undefined) return null
  if (hold) {
    return holdAddsNew
      ? keepWithNewOnTop(shown, live)
      : nextShownOrder(shown, live, true)
  }
  if (viewChanged) return live
  return nextShownOrder(shown, live, frozen)
}

// Browser only, like the other stores in src/state.
export const freezeStore = createStore<FreezeReasons>({
  pointerInList: false,
  touchScroll: false,
  sheetOpen: false,
})

function setReason(name: keyof FreezeReasons, value: boolean): void {
  if (freezeStore.state[name] === value) return
  freezeStore.setState((state) => ({ ...state, [name]: value }))
}

export function setPointerInList(inside: boolean): void {
  setReason('pointerInList', inside)
}

/** Open sheets; a count so two at once (a later story) end the reason last. */
let openSheets = 0

/**
 * Counts an open bottom sheet as a reason until the returned function is
 * called (once; later calls do nothing).
 */
export function holdOrderForSheet(): () => void {
  openSheets += 1
  setReason('sheetOpen', true)
  let released = false
  return () => {
    if (released) return
    released = true
    openSheets = Math.max(0, openSheets - 1)
    setReason('sheetOpen', openSheets > 0)
  }
}

/**
 * Holds the list order while a bottom sheet over it is `open`: each
 * feature that opens one calls this next to its `<BottomSheet>`. A layout
 * effect, so the hold starts in the same commit as the sheet's own open.
 */
export function useSheetOrderHold(open: boolean): void {
  useLayoutEffect(() => (open ? holdOrderForSheet() : undefined), [open])
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

/** Clears the list's own reasons (the list unmounts); an open sheet stays. */
export function resetListFreeze(): void {
  clearSettleTimer()
  touch.touching = false
  touch.lastScrollAt = null
  freezeStore.setState((state) => ({
    ...state,
    pointerInList: false,
    touchScroll: false,
  }))
}

/** Clears every reason (tests). */
export function resetOrderFreeze(): void {
  resetListFreeze()
  openSheets = 0
  setReason('sheetOpen', false)
}

export function useOrderFrozen(): boolean {
  return useSelector(freezeStore, isOrderFrozen)
}

export interface FrozenOrderOptions {
  /** Changes when Alex picks another sort or direction (e.g. `sort:dir`). */
  viewKey?: string
  /** The view's values are still loading: keep the order shown. */
  hold?: boolean
  /** While holding, show new torrents on top at once. */
  holdAddsNew?: boolean
}

/**
 * The order to show: `live` (from `useVisibleTorrents`) passed through the
 * freeze. Keeps the last committed order in a ref; `undefined` before data.
 * A new `viewKey` applies at once even while frozen, as soon as `hold` ends.
 */
export function useFrozenOrder(
  live: ReadonlyArray<string> | undefined,
  { viewKey = '', hold = false, holdAddsNew = false }: FrozenOrderOptions = {},
): ReadonlyArray<string> | undefined {
  const frozen = useOrderFrozen()
  const shownRef = useRef<ShownOrder>(null)
  // The view the order shown last was sorted by; `null` until one was (a
  // first load that waits for an extra sort's keys must still apply them).
  const appliedKeyRef = useRef<string | null>(null)
  const shown = useMemo(
    () =>
      shownOrderReducer(shownRef.current, {
        live,
        frozen,
        hold,
        holdAddsNew,
        viewChanged: appliedKeyRef.current !== viewKey,
      }),
    [live, frozen, hold, holdAddsNew, viewKey],
  )
  // Only a committed order counts as "shown".
  useLayoutEffect(() => {
    shownRef.current = shown
    if (!hold && shown !== null) appliedKeyRef.current = viewKey
  }, [shown, hold, viewKey])
  return shown ?? undefined
}
