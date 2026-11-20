import { useLayoutEffect, useReducer, useRef } from 'react'
import type { RefObject } from 'react'
import { HOLD_SLACK_MS, intersectBoxes, isVisible } from '#/lib/entrance'
import type { Box } from '#/lib/entrance'
import { EXIT_EASING, FADE_MS, SLIDE_MS, exitShifts } from '#/lib/leaving'
import {
  canAnimate,
  clippingAncestors,
  prefersReducedMotion,
} from '#/shared/entrance-motion'
import { claimLeaving, finishLeaving, useActiveLeaving } from '#/state/leaving'
import { holdOrderForAnimation } from '#/state/order-freeze'

// Story 4.4 (EXPERIENCE 〔動態〕 delete fade-out, AD-7): the exit of the
// rows a delete removed, shared by the list and each board column. When
// the active leaving group (src/state/leaving.ts) has hashes in `order`,
// the layout effect of that commit reads the scroll box (cut down by every
// clipping ancestor, as the entrance does) and the boxes of their wrappers
// (`data-hash`) once. When none is visible they all leave the order at
// once. Otherwise the visible ones fade (`opacity`, FADE_MS, all together,
// `inert` meanwhile) while the order holds (`holdOrderForAnimation`), and
// the rest wait unanimated. When the fade ends they all leave the order,
// and in the layout effect after that commit every rendered wrapper below
// a removed row starts `translate`d down by what was removed above it
// (exitShifts) and slides to its place (SLIDE_MS); rows rendered only by
// that commit slide in too. When the shorter content made the browser
// clamp `scrollTop` (scrolled to the bottom), every row starts that much
// higher too, so rows above the removed ones slide down from where they
// were. The order hold ends with the slide, or on a backstop timer (one
// for the fade and the removal commit, another for the slide), or on
// unmount (which also lets the fading rows go). Only
// `opacity` and the `translate` property move: the virtualizer's inline
// `transform` on the wrapper is never animated, and nothing is measured
// per frame. Reduced motion, no Web Animations, or `disabled` (the board's
// collapse FLIP owns the wrappers): the rows leave at once, no hold.
// Docs: https://developer.mozilla.org/en-US/docs/Web/API/Element/animate ,
// https://developer.mozilla.org/en-US/docs/Web/CSS/translate ,
// https://developer.mozilla.org/en-US/docs/Web/CSS/@media/prefers-reduced-motion ,
// https://react.dev/reference/react/useLayoutEffect

export interface LeavingExitOptions {
  /** The hashes the surface shows, in order (leaving ones included). */
  order: ReadonlyArray<string>
  /** A row's height, px (a removed row is asked before it leaves). */
  sizeOf: (hash: string) => number
  /** The gap between rows, px. */
  gap: number
  /**
   * Asked when an exit would start: `true` drops the rows without
   * animation (the board's collapse FLIP is running, story 2.8).
   */
  disabled?: () => boolean
  /**
   * The rows below slide up (default). `false`: they take their place at
   * once (the board's grid layout, where rows hold several cards).
   */
  slide?: boolean
}

/** One surface's running exit. */
interface Run {
  /** `fade`, then `removing` (waiting for the commit without them), `slide`. */
  phase: 'fade' | 'removing' | 'slide'
  /**
   * Every leaving row of this surface: the fading ones and the ones out of
   * view, which leave with them at the fade's end.
   */
  hashes: ReadonlySet<string>
  /** The fading wrappers, `inert` while they fade. */
  fading: ReadonlyArray<HTMLElement>
  animations: Array<Animation>
  release: () => void
  backstop: ReturnType<typeof setTimeout> | undefined
  /** The order, the removed rows' sizes and the scroll when the fade ended. */
  before: ReadonlyArray<string>
  sizes: ReadonlyMap<string, number>
  scrollTop: number
}

/** Ends the order hold early and lets the fading rows go (unmount, cut). */
function stop(run: Run): void {
  clearTimeout(run.backstop)
  for (const animation of run.animations) animation.cancel()
  for (const element of run.fading) element.inert = false
  run.release()
  finishLeaving(run.hashes)
}

/** The box `container` shows through: its own, cut by clipping ancestors. */
function visibleBox(container: HTMLElement): Box {
  return clippingAncestors(container).reduce<Box>(
    (clip, element) => intersectBoxes(clip, element.getBoundingClientRect()),
    container.getBoundingClientRect(),
  )
}

/** The rendered wrappers of `hashes` in `container`, by hash. */
function wrappersOf(
  container: HTMLElement,
  hashes: ReadonlySet<string> | null,
): Map<string, HTMLElement> {
  const out = new Map<string, HTMLElement>()
  for (const element of container.querySelectorAll<HTMLElement>(
    '[data-hash]',
  )) {
    const hash = element.dataset.hash
    if (hash !== undefined && (hashes === null || hashes.has(hash))) {
      out.set(hash, element)
    }
  }
  return out
}

/**
 * Runs the delete exit on `containerRef` (a surface's scroll box). Call it
 * after the surface's virtualizer, so its layout effect sees this commit's
 * rows.
 */
export function useLeavingExit(
  containerRef: RefObject<HTMLElement | null>,
  { order, sizeOf, gap, disabled, slide = true }: LeavingExitOptions,
): void {
  const active = useActiveLeaving()
  const runRef = useRef<Run | null>(null)
  const latestRef = useRef({ order, sizeOf, gap, slide })
  // A finished run re-renders once, so a group that started meanwhile
  // (queued behind it, L12) gets its turn.
  const [, rerender] = useReducer((count: number) => count + 1, 0)

  useLayoutEffect(() => {
    latestRef.current = { order, sizeOf, gap, slide }
    // Should a `finished` never settle, the hold ends anyway.
    const armBackstop = (run: Run, ms: number) => {
      clearTimeout(run.backstop)
      run.backstop = setTimeout(() => {
        if (runRef.current !== run) return
        runRef.current = null
        stop(run)
        rerender()
      }, ms)
    }
    const end = (run: Run) => {
      clearTimeout(run.backstop)
      run.release()
      if (runRef.current !== run) return
      runRef.current = null
      rerender()
    }

    const run = runRef.current
    if (run) {
      const shown = order.some((hash) => run.hashes.has(hash))
      // Another category, sort or view dropped the fading rows: cut.
      if (run.phase === 'fade' && !shown) {
        runRef.current = null
        stop(run)
      }
      // The commit without the faded rows: slide the rest into place.
      if (run.phase === 'removing' && !shown) {
        for (const animation of run.animations) animation.cancel()
        run.animations = []
        run.phase = 'slide'
        const container = containerRef.current
        // A collapse FLIP that started during the fade owns the wrappers.
        if (!slide || !container || disabled?.() === true) return end(run)
        armBackstop(run, SLIDE_MS + HOLD_SLACK_MS)
        const shifts = exitShifts(
          run.before,
          order,
          (hash) => run.sizes.get(hash) ?? sizeOf(hash),
          gap,
        )
        // Scrolled to the bottom, the shorter content made the browser
        // clamp `scrollTop`: every row moved down by that much, so each
        // starts where it was (rows above the removed ones slide down).
        const clamp = run.scrollTop - container.scrollTop
        for (const [hash, element] of wrappersOf(container, null)) {
          const offset = (shifts.get(hash) ?? 0) - clamp
          if (offset === 0) continue
          run.animations.push(
            element.animate(
              [{ translate: `0px ${offset}px` }, { translate: '0px 0px' }],
              { duration: SLIDE_MS, easing: EXIT_EASING },
            ),
          )
        }
        if (run.animations.length === 0) return end(run)
        void Promise.allSettled(
          run.animations.map((animation) => animation.finished),
        ).then(() => end(run))
      }
      return
    }

    if (active.length === 0) return
    const activeSet = new Set(active)
    const mine = order.filter((hash) => activeSet.has(hash))
    if (mine.length === 0) return
    const container = containerRef.current
    if (
      !container ||
      disabled?.() === true ||
      prefersReducedMotion() ||
      !canAnimate(container)
    ) {
      finishLeaving(mine)
      return
    }
    // Every box is read before anything starts (one layout).
    const wrappers = wrappersOf(container, new Set(mine))
    const box = visibleBox(container)
    const viewport = { width: window.innerWidth, height: window.innerHeight }
    const fading = [...wrappers].filter(([, element]) =>
      isVisible(element.getBoundingClientRect(), box, viewport),
    )
    // Nothing visible: they all leave at once, no hold.
    if (fading.length === 0) {
      finishLeaving(mine)
      return
    }
    // The rows out of view stay in the order, unanimated, and leave with
    // the faded ones, so rows above the box never jump the visible ones
    // up mid-fade and the slide covers them too.
    const hashes = new Set(mine)
    claimLeaving(hashes)
    const animations = fading.map(([, element]) => {
      // A fading row can no longer be clicked, ticked or focused.
      element.inert = true
      // `forwards`: a faded row stays invisible until React removes it.
      return element.animate([{ opacity: 1 }, { opacity: 0 }], {
        duration: FADE_MS,
        easing: EXIT_EASING,
        fill: 'forwards',
      })
    })
    const started: Run = {
      phase: 'fade',
      hashes,
      fading: fading.map(([, element]) => element),
      animations,
      release: holdOrderForAnimation(),
      backstop: undefined,
      before: order,
      sizes: new Map(),
      scrollTop: 0,
    }
    // The fade and the removal commit; the slide arms its own.
    armBackstop(started, FADE_MS + SLIDE_MS + HOLD_SLACK_MS)
    runRef.current = started
    void Promise.allSettled(
      animations.map((animation) => animation.finished),
    ).then(() => {
      if (runRef.current !== started || started.phase !== 'fade') return
      const latest = latestRef.current
      started.before = latest.order
      started.sizes = new Map(
        [...hashes].map((hash) => [hash, latest.sizeOf(hash)]),
      )
      started.scrollTop = containerRef.current?.scrollTop ?? 0
      started.phase = 'removing'
      finishLeaving(hashes)
    })
  })

  useLayoutEffect(
    () => () => {
      const run = runRef.current
      runRef.current = null
      if (run) stop(run)
    },
    [],
  )
}
