// Story 2.9: the DOM half of the entrance (rules in src/lib/entrance.ts,
// store and hook in src/state/entrance.ts). Finds what a surface could
// animate and starts Web Animations on elements React already rendered.
// Every animation is one from-keyframe at offset 0 with `fill: 'backwards'`:
// the end is implicit, so it lands on the element's live value (a ring whose
// progress changes mid-turn ends on the newest one without restarting).
// Only `transform`, `opacity` and the ring's `stroke-dashoffset` move.
// DOM only and free of state, in src/shared rather than src/shared/ui
// because src/state (the hook) may not import UI components (eslint).
// Docs: https://developer.mozilla.org/en-US/docs/Web/API/Element/animate ,
// https://developer.mozilla.org/en-US/docs/Web/API/Web_Animations_API/Keyframe_Formats#implicit_tofrom_keyframes ,
// https://developer.mozilla.org/en-US/docs/Web/CSS/stroke-dashoffset

/** The element that rises: a list row's or a board card's button. */
export const ENTRANCE_ATTR = 'data-entrance'
/** A status circle's progress arc (only drawn when progress is above 0). */
export const PROGRESS_ARC_ATTR = 'data-progress-arc'
/** A board card's progress bar fill. */
export const PROGRESS_BAR_ATTR = 'data-progress-bar'

export function prefersReducedMotion(): boolean {
  return (
    typeof window !== 'undefined' &&
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches
  )
}

/** The engine has the Web Animations API (old engines may not). */
export function canAnimate(element: Element): boolean {
  return typeof (element as Partial<Element>).animate === 'function'
}

export interface EntranceItem {
  /** Where it is, read once per sweep. */
  rect: DOMRect
  /** The element that rises; `null` for a ring on its own (detail hero). */
  rise: HTMLElement | null
  /** Its progress arcs. */
  arcs: Array<SVGElement>
  /** Its progress bar fills. */
  bars: Array<HTMLElement>
}

/**
 * What `container` could animate, with each one's box. `rise`: each
 * `[data-entrance]` element with the arcs and bars inside it; otherwise each
 * arc on its own.
 */
export function entranceItems(
  container: HTMLElement,
  rise: boolean,
): Array<EntranceItem> {
  if (!rise) {
    return [
      ...container.querySelectorAll<SVGElement>(`[${PROGRESS_ARC_ATTR}]`),
    ].map((arc) => ({
      rect: arc.getBoundingClientRect(),
      rise: null,
      arcs: [arc],
      bars: [],
    }))
  }
  return [...container.querySelectorAll<HTMLElement>(`[${ENTRANCE_ATTR}]`)].map(
    (element) => ({
      rect: element.getBoundingClientRect(),
      rise: element,
      arcs: [...element.querySelectorAll<SVGElement>(`[${PROGRESS_ARC_ATTR}]`)],
      bars: [
        ...element.querySelectorAll<HTMLElement>(`[${PROGRESS_BAR_ATTR}]`),
      ],
    }),
  )
}

export interface EntranceTiming {
  delay: number
  duration: number
  easing: string
}

function options({ delay, duration, easing }: EntranceTiming) {
  return { delay, duration, easing, fill: 'backwards' } as const
}

/** Rises `distance` px and fades in to the element's own values. */
export function riseIn(
  element: HTMLElement,
  timing: EntranceTiming,
  distance: number,
): Animation {
  return element.animate(
    [{ offset: 0, opacity: 0, transform: `translateY(${distance}px)` }],
    options(timing),
  )
}

/**
 * Turns the arc from empty (offset = its `stroke-dasharray`, the full
 * circumference) to its live `stroke-dashoffset`. `null` without a dash
 * array.
 */
export function spinIn(
  arc: SVGElement,
  timing: EntranceTiming,
): Animation | null {
  const circumference = Number(arc.getAttribute('stroke-dasharray'))
  if (!Number.isFinite(circumference) || circumference <= 0) return null
  return arc.animate(
    [{ offset: 0, strokeDashoffset: `${circumference}px` }],
    options(timing),
  )
}

/** Grows the bar fill from nothing (its `transform-origin` is the left). */
export function growIn(bar: HTMLElement, timing: EntranceTiming): Animation {
  return bar.animate([{ offset: 0, transform: 'scaleX(0)' }], options(timing))
}
