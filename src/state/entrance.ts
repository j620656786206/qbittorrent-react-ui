import { useLayoutEffect, useRef } from 'react'
import type { RefObject } from 'react'
import { createStore, useSelector } from '@tanstack/react-store'
import {
  ENTRANCE_EASING,
  RING_MS,
  RISE_MS,
  RISE_PX,
  entranceDelay,
  isVisible,
  rowOrdinals,
  sweepDecision,
} from '#/lib/entrance'
import {
  canAnimate,
  entranceItems,
  growIn,
  prefersReducedMotion,
  riseIn,
  spinIn,
} from '#/shared/entrance-motion'
import { holdOrderForAnimation } from '#/state/order-freeze'

// Story 2.9, EXPERIENCE 〔動態〕「驚艷的那一下：進度環轉進來」: the entrance
// store. A generation starts unplayed; the first surface (the list, one
// board column's card list, the detail hero) ready while it has no
// `startedAt` claims it, surfaces ready within JOIN_MS join with their
// delays shifted, and any surface ready or mounted later draws its current
// state without animation. `replayEntrance()` (Epic 3 calls it on a
// category change, once the new rows have committed) starts a new,
// unclaimed generation: every mounted surface sweeps the rows it has on its
// next commit, the first one claiming it and the others joining as on the
// first load. A surface not ready then (no data yet) claims or joins once
// it is.
//
// A sweep runs in a layout effect, so the first painted frame of the rows
// is already the animation's first frame. It reads every box once, keeps
// what shows (its scroll box and the window), staggers rows 60ms apart and
// holds the list and board order (AD-7 「動畫進行中」) until its animations
// settle, a replay, or unmount. Reduced motion or no Web Animations: no
// sweep, no hold. Docs: https://react.dev/reference/react/useLayoutEffect ,
// https://developer.mozilla.org/en-US/docs/Web/API/Animation/finished ,
// TanStack Store `createStore` and `useSelector` as in
// src/state/order-freeze.ts, @tanstack/react-store 0.11.2 (pinned):
// https://unpkg.com/@tanstack/react-store@0.11.2/src/useSelector.ts and
// https://unpkg.com/@tanstack/store@0.11.2/src/store.ts .
// React StrictMode (the dev client entry) mounts, cleans up and mounts each
// effect again: a cleanup that cancels an unsettled run forgets the
// generation, so the second mount sweeps it again (it joins).
// https://react.dev/reference/react/StrictMode

interface EntranceState {
  /** Starts at 1; each `replayEntrance()` adds one. */
  generation: number
  /** `performance.now()` of the generation's first sweep; `null` before. */
  startedAt: number | null
}

const INITIAL: EntranceState = { generation: 1, startedAt: null }

// Browser only, like the other stores in src/state.
export const entranceStore = createStore<EntranceState>(INITIAL)

/**
 * Epic 3's trigger (category change): the rows and rings in view play the
 * entrance again on every mounted surface.
 *
 * Call it after the new category's rows have committed, e.g. from a layout
 * effect keyed on the category. The surfaces' `ready` stays true across a
 * category change (their scroll boxes stay measured; the hero is always
 * ready), so they sweep whatever rows they hold on the commit right after
 * this call: from a layout effect that commit runs before paint, and every
 * mounted surface (the detail hero too) sweeps the new rows. Called before
 * the new rows commit, it would play on the old rows and the new ones would
 * appear unanimated.
 */
export function replayEntrance(): void {
  entranceStore.setState((state) => ({
    generation: state.generation + 1,
    startedAt: null,
  }))
}

/** Back to a first, unplayed generation (tests). */
export function resetEntrance(): void {
  entranceStore.setState(() => INITIAL)
}

/** One surface's running entrance. */
interface Run {
  animations: ReadonlyArray<Animation>
  release: () => void
}

function stop(run: Run | null): void {
  if (!run) return
  for (const animation of run.animations) animation.cancel()
  run.release()
}

/** Starts the entrance on what `container` shows; one layout read. */
function sweep(
  container: HTMLElement,
  rise: boolean,
  elapsed: number,
): Array<Animation> {
  const items = entranceItems(container, rise)
  if (items.length === 0) return []
  const box = container.getBoundingClientRect()
  const viewport = { width: window.innerWidth, height: window.innerHeight }
  const visible = (element: Element) =>
    isVisible(element.getBoundingClientRect(), box, viewport)
  // All boxes are read before any animation starts (one layout). A row only
  // partly in the box can hold an arc or bar outside it: those stay put.
  const shown = items
    .filter((item) => isVisible(item.rect, box, viewport))
    .map((item) =>
      item.rise
        ? {
            ...item,
            arcs: item.arcs.filter(visible),
            bars: item.bars.filter(visible),
          }
        : item,
    )
  const rows = rowOrdinals(shown.map((item) => item.rect.top))
  const started: Array<Animation> = []
  shown.forEach((item, index) => {
    const delay = entranceDelay(rows[index], elapsed)
    const ring = { delay, duration: RING_MS, easing: ENTRANCE_EASING }
    if (item.rise) {
      started.push(
        riseIn(
          item.rise,
          { delay, duration: RISE_MS, easing: ENTRANCE_EASING },
          RISE_PX,
        ),
      )
    }
    for (const arc of item.arcs) {
      const animation = spinIn(arc, ring)
      if (animation) started.push(animation)
    }
    for (const bar of item.bars) started.push(growIn(bar, ring))
  })
  return started
}

export interface EntranceOptions {
  /**
   * The surface has data and its scroll box is measured (a virtualizer's
   * `scrollRect`, set from the scroll element's size when the virtualizer
   * mounts: https://unpkg.com/@tanstack/virtual-core@3.19.11/src/index.ts ),
   * so the rows that cover the view are in the DOM.
   */
  ready: boolean
  /** Rows rise (default); `false`: only the rings turn (detail hero). */
  rise?: boolean
}

/**
 * Plays the entrance on `containerRef` (a surface's scroll box, or the
 * detail hero) when the store says so. Call it after the surface's
 * virtualizer, so its layout effect sees the rows of this commit.
 */
export function useEntrance(
  containerRef: RefObject<HTMLElement | null>,
  { ready, rise = true }: EntranceOptions,
): void {
  const generation = useSelector(entranceStore, (state) => state.generation)
  /** The last generation this surface handled; 0 for none. */
  const playedRef = useRef(0)
  const runRef = useRef<Run | null>(null)

  // Every commit until this generation is handled: cheap once it is.
  useLayoutEffect(() => {
    if (playedRef.current >= generation) return
    // A replay restarts from scratch: the previous animations go first, so
    // the boxes read below are the rows' own.
    stop(runRef.current)
    runRef.current = null
    const now = performance.now()
    const decision = sweepDecision({
      generation,
      played: playedRef.current,
      ready,
      startedAt: entranceStore.state.startedAt,
      now,
    })
    if (decision.kind === 'wait') return
    playedRef.current = generation
    if (decision.kind === 'skip') return
    if (decision.kind === 'claim') {
      entranceStore.setState((state) =>
        state.generation === generation && state.startedAt === null
          ? { ...state, startedAt: now }
          : state,
      )
    }
    const container = containerRef.current
    if (!container || prefersReducedMotion() || !canAnimate(container)) return
    const animations = sweep(
      container,
      rise,
      decision.kind === 'join' ? decision.elapsed : 0,
    )
    if (animations.length === 0) return
    const run: Run = { animations, release: holdOrderForAnimation() }
    runRef.current = run
    // A cancelled animation (replay, unmount, a removed arc) rejects its
    // `finished`; every outcome counts as settled.
    void Promise.allSettled(
      animations.map((animation) => animation.finished),
    ).then(() => {
      run.release()
      if (runRef.current === run) runRef.current = null
    })
  })

  useLayoutEffect(
    () => () => {
      // Unsettled: a StrictMode remount must decide this generation again.
      if (runRef.current) playedRef.current = 0
      stop(runRef.current)
      runRef.current = null
    },
    [],
  )
}
