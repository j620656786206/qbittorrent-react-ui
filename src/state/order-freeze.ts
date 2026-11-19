import { useLayoutEffect, useMemo, useRef } from 'react'
import { createStore, useSelector } from '@tanstack/react-store'
import { ALL } from '#/shared/categories'

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
// 2.2: an open bottom sheet (EXPERIENCE 「底部面板開著」). Story 2.8: a
// running board animation (AD-7 「動畫進行中」; the auto-collapse FLIP holds
// it from its first measure to its end). Story 4.1: a selection (any hash
// ticked, src/state/selection.ts) holds the list, never the board.

/** Quiet time after the last scroll before a touch scroll counts as over. */
export const TOUCH_SETTLE_MS = 300

export interface FreezeReasons {
  /** The mouse is inside the desktop list section. */
  pointerInList: boolean
  /** A finger is on the list, or its scroll has not settled yet. */
  touchScroll: boolean
  /** A bottom sheet is open (story 2.2). */
  sheetOpen: boolean
  /** A board animation runs (story 2.8, auto-collapse). */
  animation: boolean
  /** At least one torrent is selected (story 4.1); the list only. */
  selection: boolean
}

export function isOrderFrozen(reasons: FreezeReasons): boolean {
  return (
    reasons.pointerInList ||
    reasons.touchScroll ||
    reasons.sheetOpen ||
    reasons.animation ||
    reasons.selection
  )
}

/**
 * The board's own freeze (story 2.8): only a running animation. Hover,
 * touch, sheets and a selection never freeze the board (EXPERIENCE
 * 「看板不受影響」, story 2.3).
 */
export function isBoardFrozen(reasons: FreezeReasons): boolean {
  return reasons.animation
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
   * Story 3.5: Alex changed the filter (the category or the search
   * keyword) since the order shown last: the live order applies at once,
   * even while holding for an extra sort's keys (matches never stay hidden).
   */
  filterChanged?: boolean
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
    filterChanged = false,
    hold = false,
    holdAddsNew = false,
  }: ShownOrderInput,
): ShownOrder {
  if (live === undefined) return null
  if (filterChanged) return live
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
  animation: false,
  selection: false,
})

function setReason(name: keyof FreezeReasons, value: boolean): void {
  if (freezeStore.state[name] === value) return
  freezeStore.setState((state) => ({ ...state, [name]: value }))
}

export function setPointerInList(inside: boolean): void {
  setReason('pointerInList', inside)
}

/**
 * Story 4.1: the selection store's reason (written only by
 * src/state/selection.ts). Clearing the last selection reorders once.
 */
export function setSelectionFreeze(selecting: boolean): void {
  setReason('selection', selecting)
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

/** Running animations; a count so overlapping ones end the reason last. */
let runningAnimations = 0

/**
 * Story 2.8, AD-7: counts a running animation as a reason until the
 * returned function is called (once; later calls do nothing). Values keep
 * updating; shown positions hold and new torrents wait for the release.
 */
export function holdOrderForAnimation(): () => void {
  runningAnimations += 1
  setReason('animation', true)
  let released = false
  return () => {
    if (released) return
    released = true
    runningAnimations = Math.max(0, runningAnimations - 1)
    setReason('animation', runningAnimations > 0)
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

/**
 * Clears the list's own reasons (the list unmounts); an open sheet, a
 * running animation and the selection stay.
 */
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
  runningAnimations = 0
  setReason('animation', false)
  setReason('selection', false)
}

export function useOrderFrozen(): boolean {
  return useSelector(freezeStore, isOrderFrozen)
}

/** One step of a board column order through the board freeze, pure. */
export function nextBoardColumns<TKey extends string>(
  shown: Readonly<Record<TKey, ReadonlyArray<string>>> | null,
  live: Readonly<Record<TKey, ReadonlyArray<string>>> | undefined,
  frozen: boolean,
): Readonly<Record<TKey, ReadonlyArray<string>>> | undefined {
  if (live === undefined) return undefined
  if (!frozen || shown === null) return live
  let same = true
  const next = {} as Record<TKey, ReadonlyArray<string>>
  for (const key of Object.keys(live) as Array<TKey>) {
    next[key] = nextShownOrder(shown[key], live[key], true)
    if (next[key] !== shown[key]) same = false
  }
  return same ? shown : next
}

/**
 * Story 2.8, AR-50: the board columns to show. Live, except while a board
 * animation holds the order: then each column keeps the order shown last
 * (gone torrents leave, new ones wait) and applies the live one once the
 * hold ends.
 */
export function useBoardShownColumns<TKey extends string>(
  live: Readonly<Record<TKey, ReadonlyArray<string>>> | undefined,
  /**
   * Story 3.2: the columns' category. A new key applies the live columns
   * at once, even while held (another category's torrents never wait).
   */
  viewKey: string = ALL,
): Readonly<Record<TKey, ReadonlyArray<string>>> | undefined {
  const frozen = useSelector(freezeStore, isBoardFrozen)
  const shownRef = useRef<Readonly<Record<TKey, ReadonlyArray<string>>> | null>(
    null,
  )
  const appliedKeyRef = useRef(viewKey)
  const shown = useMemo(
    () =>
      nextBoardColumns(
        shownRef.current,
        live,
        frozen && appliedKeyRef.current === viewKey,
      ),
    [live, frozen, viewKey],
  )
  useLayoutEffect(() => {
    shownRef.current = shown ?? null
    if (shown !== undefined) appliedKeyRef.current = viewKey
  }, [shown, viewKey])
  return shown
}

export interface FrozenOrderOptions {
  /** Changes when Alex picks another sort or direction (e.g. `sort:dir`). */
  viewKey?: string
  /**
   * Story 3.5: changes when Alex changes the filter (category, keyword);
   * applies at once even while `hold`.
   */
  filterKey?: string
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
  {
    viewKey = '',
    filterKey = '',
    hold = false,
    holdAddsNew = false,
  }: FrozenOrderOptions = {},
): ReadonlyArray<string> | undefined {
  const frozen = useOrderFrozen()
  const shownRef = useRef<ShownOrder>(null)
  // The view the order shown last was sorted by; `null` until one was (a
  // first load that waits for an extra sort's keys must still apply them).
  const appliedKeyRef = useRef<string | null>(null)
  // The filter of the order shown last (`null` before any).
  const appliedFilterRef = useRef<string | null>(null)
  const shown = useMemo(
    () =>
      shownOrderReducer(shownRef.current, {
        live,
        frozen,
        hold,
        holdAddsNew,
        viewChanged: appliedKeyRef.current !== viewKey,
        filterChanged:
          appliedFilterRef.current !== null &&
          appliedFilterRef.current !== filterKey,
      }),
    [live, frozen, hold, holdAddsNew, viewKey, filterKey],
  )
  // Only a committed order counts as "shown".
  useLayoutEffect(() => {
    shownRef.current = shown
    if (shown !== null) appliedFilterRef.current = filterKey
    if (!hold && shown !== null) appliedKeyRef.current = viewKey
  }, [shown, hold, viewKey, filterKey])
  return shown ?? undefined
}
