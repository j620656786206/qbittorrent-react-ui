import { useEffect, useLayoutEffect, useState } from 'react'
import { createStore, useSelector } from '@tanstack/react-store'
import { selectTorrents, useMaindata } from '#/state/maindata'
import { setSelectionFreeze } from '#/state/order-freeze'

// Story 4.1 (epic 4 「選取」): the selected torrents, an ordered hash array
// with the earliest tick first (story 4.3's delete list follows it). The
// selection belongs to one scope, the category and search keyword it was
// made in: another scope clears it (a tab click, a digit, the restore,
// back and forward, 「在全部裡找」), and the same scope keeps it, so a round
// trip to /settings changes nothing. After every maindata update, hashes
// no longer in `torrents` drop out. While anything is selected the list
// order holds (order-freeze's `selection` reason); the board never does.
// Story 4.2: selection mode is "anything selected", the same on desktop
// and phone (the breakpoint is the features' business), so a selection
// survives crossing 1024px. `useSelectionShift` tells the phone rows that
// the mode has just changed, so only the rows on screen then slide.
// Docs: TanStack Store 0.11 `createStore`, `useSelector`
// (https://tanstack.com/store/v0/docs/framework/react/quick-start).

interface SelectionState {
  hashes: ReadonlyArray<string>
  /** The scope the selection was made in; `null` before the first sync. */
  scope: string | null
}

const EMPTY: ReadonlyArray<string> = Object.freeze([])

// Browser only, like the other stores in src/state.
export const selectionStore = createStore<SelectionState>({
  hashes: EMPTY,
  scope: null,
})

function setHashes(hashes: ReadonlyArray<string>, scope?: string): void {
  selectionStore.setState((state) => ({
    hashes,
    scope: scope ?? state.scope,
  }))
  setSelectionFreeze(hashes.length > 0)
}

/** Ticks `hash` (last in the order) or unticks it. */
export function toggleSelected(hash: string): void {
  const { hashes } = selectionStore.state
  setHashes(
    hashes.includes(hash)
      ? hashes.filter((each) => each !== hash)
      : [...hashes, hash],
  )
}

export function clearSelection(): void {
  if (selectionStore.state.hashes.length === 0) return
  setHashes(EMPTY)
}

/** Drops the hashes `exists` no longer knows; the rest keep their order. */
export function pruneSelection(exists: (hash: string) => boolean): void {
  const { hashes } = selectionStore.state
  const kept = hashes.filter(exists)
  if (kept.length !== hashes.length) setHashes(kept.length > 0 ? kept : EMPTY)
}

/**
 * Another scope than the stored one clears the selection, then becomes the
 * stored one; the same scope does nothing.
 */
export function syncSelectionScope(scopeKey: string): void {
  if (selectionStore.state.scope === scopeKey) return
  setHashes(EMPTY, scopeKey)
}

export function useSelectedHashes(): ReadonlyArray<string> {
  return useSelector(selectionStore, (state) => state.hashes)
}

/** Story 4.2: selection mode, which is anything selected. */
export function useSelecting(): boolean {
  return useSelector(selectionStore, (state) => state.hashes.length > 0)
}

/** Story 4.2: how long the phone rows' shift takes, ms. */
export const SELECTION_SHIFT_MS = 200

/**
 * The shift is cleared this long after the mode change: the 0.2s keyframes
 * start at commit and this timer a little later, so a late first frame
 * still finishes before the class goes.
 */
export const SELECTION_SHIFT_CLEAR_MS = SELECTION_SHIFT_MS + 50

/** `in`: the mode just started; `out`: it just ended; `null`: settled. */
export type SelectionShift = 'in' | 'out' | null

/**
 * Story 4.2: `in` or `out` for `SELECTION_SHIFT_CLEAR_MS` after the mode changes
 * while the caller is mounted, then `null`. A caller mounted later (a
 * crossing of 1024px that swaps trees, a new list) starts settled.
 */
export function useSelectionShift(): SelectionShift {
  const selecting = useSelecting()
  const [seen, setSeen] = useState(selecting)
  const [shift, setShift] = useState<SelectionShift>(null)
  if (seen !== selecting) {
    setSeen(selecting)
    setShift(selecting ? 'in' : 'out')
  }
  useEffect(() => {
    if (shift === null) return
    const timer = setTimeout(() => setShift(null), SELECTION_SHIFT_CLEAR_MS)
    return () => clearTimeout(timer)
  }, [shift])
  return shift
}

/** Tests: nothing selected, no scope, no freeze reason. */
export function resetSelection(): void {
  selectionStore.setState(() => ({ hashes: EMPTY, scope: null }))
  setSelectionFreeze(false)
}

/**
 * The home route's upkeep: the scope check for `category` and `query`
 * (before paint, so another category never shows the old selection), and
 * the prune after each maindata update.
 */
export function useSelectionUpkeep(category: string, query: string): void {
  const scopeKey = JSON.stringify([category, query])
  useLayoutEffect(() => {
    syncSelectionScope(scopeKey)
  }, [scopeKey])

  const { data: torrents } = useMaindata(selectTorrents)
  useEffect(() => {
    if (torrents) pruneSelection((hash) => Object.hasOwn(torrents, hash))
  }, [torrents])
}
