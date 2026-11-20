import { useLayoutEffect, useReducer, useRef } from 'react'
import type { RefObject } from 'react'
import { HOLD_SLACK_MS, intersectBoxes, isVisible } from '#/lib/entrance'
import type { Box } from '#/lib/entrance'
import {
  EXIT_EASING,
  FADE_MS,
  SLIDE_MS,
  exitShifts,
  removedAbove,
} from '#/lib/leaving'
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
// that commit slide in too.
// Scroll anchoring (Alex, after 4.4): rows removed above the first row in
// view (`removedAbove`, read when the fade ends) take their height out of
// `scrollTop` in the removal commit, so the rows in view stay where they
// are; the virtualizer hears of the new `scrollTop` in that same commit
// (a `scroll` event), so it draws the rows in view before paint. Each row
// then starts from where it was on screen: its shift minus how far
// `scrollTop` moved, which also covers the browser clamping `scrollTop`
// when the shorter content ends above the view (scrolled to the bottom).
// The order hold ends with the slide, or on a backstop timer (one for the
// fade and the removal commit, another for the slide), or on unmount
// (which also lets the fading rows go). Only `opacity` and the `translate`
// property move: the virtualizer's inline `transform` on the wrapper is
// never animated, and nothing is measured per frame. Nothing in view to
// fade, reduced motion, or no Web Animations: the rows leave at once (no
// hold), still anchored. `disabled` (the board's collapse FLIP owns the
// wrappers and the scroll): they leave at once, not anchored. The grid
// layout (`slide: false`) is not anchored either.
// Docs: https://developer.mozilla.org/en-US/docs/Web/API/Element/animate ,
// https://developer.mozilla.org/en-US/docs/Web/CSS/translate ,
// https://developer.mozilla.org/en-US/docs/Web/CSS/@media/prefers-reduced-motion ,
// https://react.dev/reference/react/useLayoutEffect ,
// https://developer.mozilla.org/en-US/docs/Web/API/Element/scrollTop ,
// https://unpkg.com/@tanstack/virtual-core@3.19.11/src/index.ts
// (`observeElementOffset`: the range follows `scroll` events)

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
  /** What leaves above the first row in view, px (anchoring). */
  above: number
  /** The rows may slide (motion allowed, Web Animations there). */
  animate: boolean
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

/** The first hash of `order` whose wrapper shows in `container`. */
function firstInView(
  container: HTMLElement,
  order: ReadonlyArray<string>,
): string | null {
  const box = visibleBox(container)
  const viewport = { width: window.innerWidth, height: window.innerHeight }
  const index = new Map(order.map((hash, at) => [hash, at]))
  let first: string | null = null
  let best = Infinity
  for (const [hash, element] of wrappersOf(container, null)) {
    const at = index.get(hash)
    if (at === undefined || at >= best) continue
    if (isVisible(element.getBoundingClientRect(), box, viewport)) {
      best = at
      first = hash
    }
  }
  return first
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
    // The fade ended (or nothing fades): note what the slide and the
    // anchoring need, then let the rows leave the order.
    const startRemoval = (run: Run) => {
      const latest = latestRef.current
      const container = containerRef.current
      const sizeOf = (hash: string) =>
        run.sizes.get(hash) ?? latest.sizeOf(hash)
      run.before = latest.order
      run.sizes = new Map(
        [...run.hashes].map((hash) => [hash, latest.sizeOf(hash)]),
      )
      run.scrollTop = container?.scrollTop ?? 0
      run.above =
        container && latest.slide
          ? removedAbove(
              latest.order,
              firstInView(container, latest.order),
              run.hashes,
              sizeOf,
              latest.gap,
            )
          : 0
      run.phase = 'removing'
      finishLeaving(run.hashes)
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
        if (!container || disabled?.() === true) return end(run)
        if (run.above > 0) {
          container.scrollTop = run.scrollTop - run.above
          // Without it the virtualizer would draw the rows now in view
          // only after paint (its own listener hears the browser's event).
          container.dispatchEvent(new Event('scroll'))
        }
        if (!slide || !run.animate) return end(run)
        armBackstop(run, SLIDE_MS + HOLD_SLACK_MS)
        const shifts = exitShifts(
          run.before,
          order,
          (hash) => run.sizes.get(hash) ?? sizeOf(hash),
          gap,
        )
        // Each row starts where it was on screen: `scrollTop` moved by the
        // anchoring, and by the browser's clamp at the bottom (then rows
        // above the removed ones slide down).
        const moved = run.scrollTop - container.scrollTop
        for (const [hash, element] of wrappersOf(container, null)) {
          const offset = (shifts.get(hash) ?? 0) - moved
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
    if (!container || disabled?.() === true) {
      finishLeaving(mine)
      return
    }
    const hashes = new Set(mine)
    const animate = !prefersReducedMotion() && canAnimate(container)
    // Every box is read before anything starts (one layout).
    const box = visibleBox(container)
    const viewport = { width: window.innerWidth, height: window.innerHeight }
    const fading = animate
      ? [...wrappersOf(container, hashes)].filter(([, element]) =>
          isVisible(element.getBoundingClientRect(), box, viewport),
        )
      : []
    // Nothing fades: they all leave at once, no hold, the view anchored.
    if (fading.length === 0) {
      const instant: Run = {
        phase: 'removing',
        hashes,
        fading: [],
        animations: [],
        release: () => {},
        backstop: undefined,
        before: order,
        sizes: new Map(),
        scrollTop: 0,
        above: 0,
        animate,
      }
      armBackstop(instant, SLIDE_MS + HOLD_SLACK_MS)
      runRef.current = instant
      startRemoval(instant)
      return
    }
    // The rows out of view stay in the order, unanimated, and leave with
    // the faded ones, so rows above the box never jump the visible ones
    // up mid-fade and the slide covers them too.
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
      above: 0,
      animate,
    }
    // The fade and the removal commit; the slide arms its own.
    armBackstop(started, FADE_MS + SLIDE_MS + HOLD_SLACK_MS)
    runRef.current = started
    void Promise.allSettled(
      animations.map((animation) => animation.finished),
    ).then(() => {
      if (runRef.current !== started || started.phase !== 'fade') return
      startRemoval(started)
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
