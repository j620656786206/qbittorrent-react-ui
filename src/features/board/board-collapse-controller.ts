import type { BoardColumn } from '#/lib/torrent-status'
import { holdOrderForAnimation } from '#/state/order-freeze'
import {
  COLLAPSE_MS,
  EXPAND_MS,
  EXPAND_SETTLE_MS,
  FADE_NEW_AT,
  FLIP_EASING,
  FRAME_EXTRA_MS,
  REOPEN_AT,
  SPREAD_MS,
  SPREAD_SETTLE_MS,
  collapseTotalMs,
  decideScroll,
  expandTotalMs,
  pickAnchor,
  rippleDelay,
  wheelAtTop,
} from '#/features/board/board-collapse'
import type { CardLayout, CardPin } from '#/features/board/card-list'

// Story 2.8: the desktop board's auto-collapse, a small state machine
// (normal → collapsing → collapsed → expanding → normal) with a FLIP
// runner on the Web Animations API, ported from the approved demo
// (ux-react-torrent-2026-11-13/.working/demo-board: `check`, the wheel
// handler, the strip click, `visibleCards`, `flip`, `findAnchor`,
// `keepAnchor`, `setFocus`).
//
// FLIP: measure the elements (cards by `data-hash`, each column's
// background layer and header by `data-column`), change the layout once
// through React state, then in the layout effect after that commit measure
// again and animate each element from the inverted offset to its place,
// `transform` only (`opacity` only where new cards rise in and reopening
// columns fade in). A column's background widens or narrows with `scaleX`
// on its own layer, so text is never scaled. Cards are matched by hash,
// not by element, so a remount still animates. Only cards in view (plus a
// 40px margin) are measured and animated.
//
// While a transition runs (`busy`): the order freeze holds (AD-7, from the
// first measure to the end, released on unmount too), wheel, touch and
// scroll keys on the board are cancelled, and no other collapse or expand
// starts. The cancelling (non-passive) wheel and touchmove listeners are
// on the board only for that window, so ordinary scrolling never waits for
// the main thread. A step ends after its own length plus settle, or when
// its last animation does (the per-card delays included), whichever is
// later. Reduced motion has no animation, but still ends after the commit
// (`instant`), so the pin is applied before it is cleared. Scrolls the code
// makes itself (the pin, the scroll to the top) happen inside that window,
// so they never count as Alex's.
//
// Docs (AD-11): https://developer.mozilla.org/en-US/docs/Web/API/Element/animate,
// https://developer.mozilla.org/en-US/docs/Web/CSS/@media/prefers-reduced-motion

/** What the board renders for the auto-collapse. */
export interface CollapseView {
  /** The wide column; `null` is the normal board. */
  focus: BoardColumn | null
  /** The column the pin and the frame belong to (the last wide one). */
  column: BoardColumn | null
  /** The wide column's card layout (the others are strips). */
  layout: CardLayout
  /** Keep the anchor (or the top) in place in the wide column. */
  pin: CardPin | null
  /** The anchor card with the accent frame. */
  hereHash: string | null
  hereMs: number
}

const SINGLE: CardLayout = { kind: 'single' }
const GRID: CardLayout = { kind: 'grid' }

export const NORMAL_VIEW: CollapseView = Object.freeze({
  focus: null,
  column: null,
  layout: SINGLE,
  pin: null,
  hereHash: null,
  hereMs: 0,
})

/** Cards this far outside the scroll box still count as in view (demo). */
const VIEW_MARGIN_PX = 40
/** New cards rise in (demo `fadeNew`). */
const FADE_NEW_MS = 420
const FADE_NEW_STEP_MS = 30
/** Reopening columns fade in (demo, expand). */
const REOPEN_MS = 300
const SCROLL_KEYS = new Set([
  'ArrowUp',
  'ArrowDown',
  'PageUp',
  'PageDown',
  'Home',
  'End',
  ' ',
])

type Rects = Map<string, DOMRect>

type Pending =
  | { step: 'instant' }
  | { step: 'collapse'; column: BoardColumn; first: Rects }
  | { step: 'spread'; column: BoardColumn; first: Rects; anchorIndex: number }
  | { step: 'expand'; column: BoardColumn; first: Rects; anchorIndex: number }

function prefersReducedMotion(): boolean {
  return (
    typeof window !== 'undefined' &&
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches
  )
}

function canAnimate(element: Element): element is HTMLElement {
  return typeof (element as HTMLElement).animate === 'function'
}

/**
 * When the last of `started` ends (its delay included), but not before
 * `ms` (the step's own length plus its settle).
 */
function endOf(started: ReadonlyArray<Animation>, ms: number): number {
  let end = ms
  for (const animation of started) {
    const timing = animation.effect?.getComputedTiming()
    const at = Number(timing?.endTime)
    if (Number.isFinite(at)) end = Math.max(end, at)
  }
  return end
}

/** Demo `visibleCards`: the column's card wrappers in view, in order. */
function cardsInView(scroller: HTMLElement): Array<HTMLElement> {
  const box = scroller.getBoundingClientRect()
  const out: Array<HTMLElement> = []
  for (const card of scroller.querySelectorAll<HTMLElement>('[data-hash]')) {
    const rect = card.getBoundingClientRect()
    if (rect.bottom < box.top - VIEW_MARGIN_PX) continue
    if (rect.top > box.bottom + VIEW_MARGIN_PX) continue
    out.push(card)
  }
  return out.sort((a, b) => indexOf(a) - indexOf(b))
}

function indexOf(card: HTMLElement): number {
  return Number(card.dataset.index ?? -1)
}

function cardKey(card: HTMLElement): string {
  return `card:${card.dataset.hash ?? ''}`
}

/** Each column's background layer and header, keyed by column. */
function chromeOf(root: HTMLElement): Map<string, HTMLElement> {
  const out = new Map<string, HTMLElement>()
  for (const section of root.querySelectorAll<HTMLElement>(
    ':scope > section[data-column]',
  )) {
    const column = section.dataset.column ?? ''
    const bg = section.querySelector<HTMLElement>(':scope > [data-column-bg]')
    const head = section.querySelector<HTMLElement>('[data-column-head]')
    if (bg) out.set(`bg:${column}`, bg)
    if (head) out.set(`head:${column}`, head)
  }
  return out
}

function measure(elements: Map<string, HTMLElement>): Rects {
  const rects: Rects = new Map()
  for (const [key, element] of elements) {
    rects.set(key, element.getBoundingClientRect())
  }
  return rects
}

function withCards(
  elements: Map<string, HTMLElement>,
  cards: ReadonlyArray<HTMLElement>,
): Map<string, HTMLElement> {
  const out = new Map(elements)
  for (const card of cards) out.set(cardKey(card), card)
  return out
}

/**
 * The FLIP's play: from where each element was (`first`) to where it is,
 * `transform` only. Card wrappers keep their own `translate` positioning
 * as the base of both keyframes.
 */
function playMoves(
  first: Rects,
  elements: Map<string, HTMLElement>,
  duration: number,
  delayOf: (key: string, element: HTMLElement) => number = () => 0,
): Array<Animation> {
  const started: Array<Animation> = []
  for (const [key, element] of elements) {
    const from = first.get(key)
    if (!from || !element.isConnected || !canAnimate(element)) continue
    const to = element.getBoundingClientRect()
    const dx = from.left - to.left
    const dy = from.top - to.top
    if (key.startsWith('bg:')) {
      const scale = from.width / Math.max(1, to.width)
      if (Math.abs(dx) < 1 && Math.abs(dy) < 1 && Math.abs(scale - 1) < 0.001)
        continue
      started.push(
        element.animate(
          [
            { transform: `translate(${dx}px, ${dy}px) scaleX(${scale})` },
            { transform: 'none' },
          ],
          { duration, easing: FLIP_EASING },
        ),
      )
      continue
    }
    if (Math.abs(dx) < 1 && Math.abs(dy) < 1) continue
    const base = element.style.transform
    started.push(
      element.animate(
        [
          { transform: `translate(${dx}px, ${dy}px) ${base}`.trim() },
          { transform: base || 'none' },
        ],
        {
          duration,
          delay: delayOf(key, element),
          easing: FLIP_EASING,
          fill: 'backwards',
        },
      ),
    )
  }
  return started
}

/** Demo `fadeNew`: cards in view that were not before rise in. */
function riseNew(
  first: Rects,
  cards: ReadonlyArray<HTMLElement>,
  from: number,
): Array<Animation> {
  const started: Array<Animation> = []
  cards.forEach((card, position) => {
    if (first.has(cardKey(card)) || !canAnimate(card)) return
    const base = card.style.transform
    const animation = card.animate(
      [
        { opacity: 0, transform: `translateY(12px) ${base}`.trim() },
        { opacity: 1, transform: base || 'none' },
      ],
      {
        duration: FADE_NEW_MS,
        delay: from + position * FADE_NEW_STEP_MS,
        easing: 'ease-out',
        fill: 'backwards',
      },
    )
    started.push(animation)
  })
  return started
}

export class BoardCollapseController {
  /** The last committed view (set by the hook's layout effect). */
  view: CollapseView = NORMAL_VIEW
  enabled = true
  private root: HTMLElement | null = null
  private readonly scrollers = new Map<BoardColumn, HTMLElement>()
  private readonly lastTop = new Map<BoardColumn, number>()
  private readonly ticking = new Set<BoardColumn>()
  private readonly refCallbacks = new Map<
    BoardColumn,
    (element: HTMLDivElement | null) => void
  >()
  private readonly detachScroll = new Map<BoardColumn, () => void>()
  private detachRoot: (() => void) | null = null
  /** Removes the non-passive listeners that hold scrolling while busy. */
  private detachHold: (() => void) | null = null
  private pointer: { x: number; y: number } | null = null
  private suppressed: BoardColumn | null = null
  private wheelAcc = 0
  /** A finger pulling down at the top of the wide column, like `wheelAcc`. */
  private touchAcc = 0
  private lastTouchY: number | null = null
  private busy = false
  /** The pref went off while busy: restore the board once it ends. */
  private disableAfter = false
  /** Running animations, cancelled when a transition is cut short. */
  private readonly animations = new Set<Animation>()
  /**
   * Where focus goes after the commit if the element holding it went away
   * (a pressed strip, a column that became a strip).
   */
  private focusAfter: BoardColumn | null = null
  private release: (() => void) | null = null
  private pending: Pending | null = null
  /** The anchor of the running collapse, for step 2. */
  private anchor: string | null = null
  private stepTimer: ReturnType<typeof setTimeout> | null = null
  private frameTimer: ReturnType<typeof setTimeout> | null = null

  constructor(
    private readonly setView: (
      next: CollapseView | ((view: CollapseView) => CollapseView),
    ) => void,
  ) {}

  /** Story 4.4: a transition runs (the FLIP owns the card wrappers). */
  readonly isBusy = (): boolean => this.busy

  /** The board grid's callback ref: wheel, touch and keys on the board. */
  readonly setRoot = (element: HTMLElement | null): void => {
    this.detachRoot?.()
    this.detachRoot = null
    this.releaseScroll()
    this.root = element
    if (!element) return
    const onWheel = (event: WheelEvent) => this.onWheel(event)
    const onTouchStart = (event: TouchEvent) => {
      this.touchAcc = 0
      this.lastTouchY = event.touches.item(0)?.clientY ?? null
    }
    const onTouchMove = (event: TouchEvent) => {
      if (!this.busy) this.onTouchPull(event)
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (!this.busy || !SCROLL_KEYS.has(event.key)) return
      const target = event.target
      // Space on a button presses it; leave that alone.
      if (event.key === ' ' && target instanceof HTMLButtonElement) return
      event.preventDefault()
    }
    // Passive: they only read. `holdScroll` adds the cancelling ones.
    element.addEventListener('wheel', onWheel, { passive: true })
    element.addEventListener('touchstart', onTouchStart, { passive: true })
    element.addEventListener('touchmove', onTouchMove, { passive: true })
    element.addEventListener('keydown', onKeyDown)
    if (this.busy) this.holdScroll()
    this.detachRoot = () => {
      element.removeEventListener('wheel', onWheel)
      element.removeEventListener('touchstart', onTouchStart)
      element.removeEventListener('touchmove', onTouchMove)
      element.removeEventListener('keydown', onKeyDown)
    }
  }

  /** While busy: cancel wheel and touch scrolling on the board. */
  private holdScroll(): void {
    const root = this.root
    if (!root || this.detachHold) return
    const onWheel = (event: WheelEvent) => {
      // Only vertical scrolling is held; ctrl + wheel (and a trackpad
      // pinch, sent as one) zooms, and sideways wheels pass.
      const vertical = Math.abs(event.deltaY) >= Math.abs(event.deltaX)
      if (vertical && !event.ctrlKey) event.preventDefault()
    }
    const onTouchMove = (event: TouchEvent) => event.preventDefault()
    root.addEventListener('wheel', onWheel, { passive: false })
    root.addEventListener('touchmove', onTouchMove, { passive: false })
    this.detachHold = () => {
      root.removeEventListener('wheel', onWheel)
      root.removeEventListener('touchmove', onTouchMove)
    }
  }

  private releaseScroll(): void {
    this.detachHold?.()
    this.detachHold = null
  }

  /** A stable callback ref per column for its scroll body. */
  scrollerRef(column: BoardColumn): (element: HTMLDivElement | null) => void {
    let callback = this.refCallbacks.get(column)
    if (!callback) {
      callback = (element) => this.setScroller(column, element)
      this.refCallbacks.set(column, callback)
    }
    return callback
  }

  private setScroller(column: BoardColumn, element: HTMLElement | null) {
    this.detachScroll.get(column)?.()
    this.detachScroll.delete(column)
    if (!element) {
      this.scrollers.delete(column)
      return
    }
    this.scrollers.set(column, element)
    this.lastTop.set(column, element.scrollTop)
    // Checked once a frame, passive (demo `ticking`).
    const onScroll = () => {
      if (this.ticking.has(column)) return
      this.ticking.add(column)
      requestAnimationFrame(() => {
        this.ticking.delete(column)
        this.check(column)
      })
    }
    element.addEventListener('scroll', onScroll, { passive: true })
    this.detachScroll.set(column, () =>
      element.removeEventListener('scroll', onScroll),
    )
  }

  /** Document listeners; the returned function also ends a transition. */
  attach(): () => void {
    const onPointerMove = (event: PointerEvent) => {
      this.pointer = { x: event.clientX, y: event.clientY }
    }
    const onPointerLeave = () => {
      this.pointer = null
    }
    document.addEventListener('pointermove', onPointerMove, { passive: true })
    document.documentElement.addEventListener('pointerleave', onPointerLeave)
    return () => {
      document.removeEventListener('pointermove', onPointerMove)
      document.documentElement.removeEventListener(
        'pointerleave',
        onPointerLeave,
      )
      this.stop()
    }
  }

  /** Demo `check`: one column's scroll, at most once a frame. */
  check(column: BoardColumn): void {
    const scroller = this.scrollers.get(column)
    if (!scroller) return
    const top = scroller.scrollTop
    const prevTop = this.lastTop.get(column) ?? 0
    this.lastTop.set(column, top)
    if (this.busy) return
    const decision = decideScroll({
      focus: this.view.focus,
      suppressed: this.suppressed,
      column,
      top,
      prevTop,
      clientHeight: scroller.clientHeight,
      enabled: this.enabled,
    })
    this.suppressed = decision.suppressed
    if (decision.action === 'collapse') this.collapse(column)
    else if (decision.action === 'expand') this.expand(true)
  }

  private onWheel(event: WheelEvent): void {
    if (this.busy) return
    const step = wheelAtTop({
      acc: this.wheelAcc,
      deltaY: event.deltaY,
      ...this.atTopOfWide(event.target),
    })
    this.wheelAcc = step.acc
    if (step.expand) this.expand(true)
  }

  /**
   * A touch screen at desktop width (a tablet): a finger pulled down at the
   * top of the wide column sends no `scroll` there, so it counts like a
   * wheel up (finger moving down = negative `deltaY`).
   */
  private onTouchPull(event: TouchEvent): void {
    const touch = event.touches.item(0)
    if (touch === null || this.lastTouchY === null) return
    const y = touch.clientY
    const step = wheelAtTop({
      acc: this.touchAcc,
      deltaY: this.lastTouchY - y,
      ...this.atTopOfWide(event.target),
    })
    this.lastTouchY = y
    this.touchAcc = step.acc
    if (step.expand) this.expand(true)
  }

  private atTopOfWide(target: EventTarget | null): {
    focusedHere: boolean
    atTop: boolean
  } {
    const focus = this.view.focus
    const scroller = focus === null ? undefined : this.scrollers.get(focus)
    if (!scroller) return { focusedHere: false, atTop: false }
    return {
      focusedHere: target instanceof Node && scroller.contains(target),
      atTop: scroller.scrollTop <= 0,
    }
  }

  /**
   * Demo strip click: restore the board, keep the anchor, suppress the wide
   * column; focus goes to the column whose strip was pressed.
   */
  readonly pressStrip = (column: BoardColumn): void => {
    const focus = this.view.focus
    if (!this.expand(false)) return
    this.suppressed = focus
    this.focusAfter = column
  }

  /** After a commit: focus that fell off the board goes to `focusAfter`. */
  private restoreFocus(): void {
    const column = this.focusAfter
    const root = this.root
    this.focusAfter = null
    if (column === null || !root) return
    const active = document.activeElement
    if (active && active !== document.body && root.contains(active)) return
    const target =
      this.scrollers.get(column) ??
      root.querySelector<HTMLElement>(
        `:scope > section[data-column="${column}"] button`,
      )
    target?.focus({ preventScroll: true })
  }

  /** Demo `findAnchor` over the column's cards in view. */
  private findAnchor(
    scroller: HTMLElement,
  ): { hash: string; index: number; offset: number } | null {
    const box = scroller.getBoundingClientRect()
    const cards = cardsInView(scroller)
    const boxes = cards.map((card) => {
      const rect = card.getBoundingClientRect()
      return {
        key: card.dataset.hash ?? '',
        top: rect.top,
        bottom: rect.bottom,
        left: rect.left,
        right: rect.right,
      }
    })
    const hash = pickAnchor(boxes, box, this.pointer)
    if (hash === null) return null
    const position = boxes.findIndex((card) => card.key === hash)
    return {
      hash,
      index: indexOf(cards[position]),
      offset: boxes[position].top - box.top,
    }
  }

  /** Where a card currently sits in its column, for step 2's pin. */
  private locate(
    scroller: HTMLElement,
    hash: string | null,
  ): { index: number; offset: number } | null {
    if (hash === null) return null
    const card = scroller.querySelector<HTMLElement>(`[data-hash="${hash}"]`)
    if (!card) return null
    return {
      index: indexOf(card),
      offset:
        card.getBoundingClientRect().top - scroller.getBoundingClientRect().top,
    }
  }

  private begin(totalMs: number, anchor: string | null): void {
    this.busy = true
    this.holdScroll()
    this.wheelAcc = 0
    this.release?.()
    this.release = holdOrderForAnimation()
    this.anchor = anchor
    this.clearTimers()
    if (anchor !== null) {
      this.frameTimer = setTimeout(() => {
        this.frameTimer = null
        this.setView((view) =>
          view.hereHash === null ? view : { ...view, hereHash: null },
        )
      }, totalMs + FRAME_EXTRA_MS)
    }
  }

  private finish = (): void => {
    this.stepTimer = null
    this.pending = null
    this.busy = false
    this.releaseScroll()
    this.release?.()
    this.release = null
    this.animations.clear()
    for (const [column, scroller] of this.scrollers) {
      this.lastTop.set(column, scroller.scrollTop)
    }
    this.setView((view) => (view.pin === null ? view : { ...view, pin: null }))
    if (this.disableAfter) {
      this.disableAfter = false
      if (!this.enabled) this.expand(false)
    }
  }

  private track(started: ReadonlyArray<Animation>): void {
    for (const animation of started) this.animations.add(animation)
  }

  private schedule(ms: number, run: () => void): void {
    if (this.stepTimer !== null) clearTimeout(this.stepTimer)
    this.stepTimer = setTimeout(run, ms)
  }

  /** Normal board → the column wide, the others 64px strips. */
  collapse(column: BoardColumn): boolean {
    if (this.busy || this.view.focus !== null) return false
    const scroller = this.scrollers.get(column)
    const root = this.root
    if (!scroller || !root) return false
    const reduced = prefersReducedMotion()
    const anchor = this.findAnchor(scroller)
    const total = collapseTotalMs(reduced)
    this.begin(total, anchor?.hash ?? null)
    // Focus inside a column that becomes a strip goes to the wide column.
    if (root.contains(document.activeElement)) this.focusAfter = column
    const here = {
      hereHash: anchor?.hash ?? null,
      hereMs: total + FRAME_EXTRA_MS,
    }
    if (reduced) {
      // R1: both steps at once, the anchor kept, no animation.
      this.pending = { step: 'instant' }
      this.setView({
        focus: column,
        column,
        layout: GRID,
        pin: anchor ? { hash: anchor.hash, offset: anchor.offset } : null,
        ...here,
      })
      return true
    }
    const cards = cardsInView(scroller)
    const first = measure(withCards(chromeOf(root), cards))
    // Step 1 keeps the cards' one-per-row width (demo `cardW`).
    const width = cards.length > 0 ? cards[0].getBoundingClientRect().width : 0
    this.pending = { step: 'collapse', column, first }
    this.setView({
      focus: column,
      column,
      layout: width > 0 ? { kind: 'fixed', width } : SINGLE,
      pin: null,
      ...here,
    })
    return true
  }

  /** Step 2: the wide column's cards spread to 2 to 3 per row. */
  private spread(column: BoardColumn): void {
    const scroller = this.scrollers.get(column)
    if (!scroller || this.view.focus !== column) {
      this.finish()
      return
    }
    const cards = cardsInView(scroller)
    const first = measure(withCards(new Map(), cards))
    // The anchor can leave during step 1 (a poll removed it): pick a new
    // one from what is on screen, so step 2 still keeps Alex's place.
    const located = this.locate(scroller, this.anchor)
    const anchor =
      located && this.anchor !== null
        ? { hash: this.anchor, ...located }
        : this.findAnchor(scroller)
    this.anchor = anchor?.hash ?? null
    this.pending = {
      step: 'spread',
      column,
      first,
      anchorIndex: anchor?.index ?? -1,
    }
    this.setView((view) => ({
      ...view,
      layout: GRID,
      pin: anchor ? { hash: anchor.hash, offset: anchor.offset } : null,
      hereHash:
        view.hereHash === null || anchor === null ? view.hereHash : anchor.hash,
    }))
  }

  /**
   * Collapsed → the normal board. `toTop` scrolls the wide column to its
   * top (Alex scrolled or wheeled up there); otherwise the anchor stays.
   * `false` when nothing started (busy, or already normal).
   */
  expand(toTop: boolean): boolean {
    const column = this.view.focus
    if (this.busy || column === null) return false
    const scroller = this.scrollers.get(column)
    const root = this.root
    if (!root) return false
    const reduced = prefersReducedMotion()
    const anchor = toTop || !scroller ? null : this.findAnchor(scroller)
    const total = expandTotalMs(reduced)
    this.begin(total, anchor?.hash ?? null)
    if (root.contains(document.activeElement)) this.focusAfter = column
    const pin: CardPin | null = toTop
      ? { hash: null, offset: 0 }
      : anchor
        ? { hash: anchor.hash, offset: anchor.offset }
        : null
    const next: CollapseView = {
      focus: null,
      column,
      layout: SINGLE,
      pin,
      hereHash: anchor?.hash ?? null,
      hereMs: total + FRAME_EXTRA_MS,
    }
    if (reduced) {
      this.pending = { step: 'instant' }
      this.setView(next)
      return true
    }
    const cards = scroller ? cardsInView(scroller) : []
    this.pending = {
      step: 'expand',
      column,
      first: measure(withCards(chromeOf(root), cards)),
      anchorIndex: anchor?.index ?? -1,
    }
    this.setView(next)
    return true
  }

  /** The hook's layout effect after each committed view: the FLIP's play. */
  runPending(): void {
    this.restoreFocus()
    const pending = this.pending
    if (!pending) return
    this.pending = null
    const root = this.root
    // Nothing to play (reduced motion, or the board went away): end now,
    // after the commit, so the pin was applied.
    if (pending.step === 'instant' || !root) {
      this.finish()
      return
    }
    const scroller = this.scrollers.get(pending.column)
    const cards = scroller ? cardsInView(scroller) : []
    const ripple = (anchorIndex: number) => (key: string, el: HTMLElement) =>
      key.startsWith('card:') ? rippleDelay(indexOf(el), anchorIndex) : 0

    if (pending.step === 'collapse') {
      const started = playMoves(
        pending.first,
        withCards(chromeOf(root), cards),
        COLLAPSE_MS,
      )
      this.track(started)
      this.schedule(endOf(started, COLLAPSE_MS), () =>
        this.spread(pending.column),
      )
      return
    }
    if (pending.step === 'spread') {
      const started = [
        ...playMoves(
          pending.first,
          withCards(new Map(), cards),
          SPREAD_MS,
          ripple(pending.anchorIndex),
        ),
        ...riseNew(pending.first, cards, Math.round(SPREAD_MS * FADE_NEW_AT)),
      ]
      this.track(started)
      this.schedule(endOf(started, SPREAD_MS + SPREAD_SETTLE_MS), this.finish)
      return
    }
    // Expand: cards back to one per row, reopening columns fade in.
    const chrome = chromeOf(root)
    const started = playMoves(
      pending.first,
      withCards(chrome, cards),
      EXPAND_MS,
      ripple(pending.anchorIndex),
    )
    const reopenAt = Math.round(EXPAND_MS * REOPEN_AT)
    for (const [key, head] of chrome) {
      if (!key.startsWith('head:') || pending.first.has(key)) continue
      const column = key.slice('head:'.length) as BoardColumn
      for (const element of [head, this.scrollers.get(column)]) {
        if (!element || !canAnimate(element)) continue
        started.push(
          element.animate([{ opacity: 0 }, { opacity: 1 }], {
            duration: REOPEN_MS,
            delay: reopenAt,
            easing: 'ease-out',
            fill: 'backwards',
          }),
        )
      }
    }
    started.push(...riseNew(pending.first, cards, reopenAt))
    this.track(started)
    this.schedule(endOf(started, EXPAND_MS + EXPAND_SETTLE_MS), this.finish)
  }

  /**
   * The pref turned off: restore the board, keeping the anchor; while a
   * transition runs, once it ends.
   */
  disable(): void {
    if (this.busy) this.disableAfter = true
    else if (this.view.focus !== null) this.expand(false)
  }

  /** Back to the normal board at once, no animation (the 已整理 header). */
  readonly reset = (): void => {
    this.stop()
    this.suppressed = null
    this.setView(NORMAL_VIEW)
  }

  private clearTimers(): void {
    if (this.stepTimer !== null) clearTimeout(this.stepTimer)
    if (this.frameTimer !== null) clearTimeout(this.frameTimer)
    this.stepTimer = null
    this.frameTimer = null
  }

  /** Ends any transition: timers, the freeze hold, the scroll hold. */
  private stop(): void {
    this.clearTimers()
    for (const animation of this.animations) animation.cancel()
    this.animations.clear()
    this.pending = null
    this.disableAfter = false
    this.focusAfter = null
    this.busy = false
    this.releaseScroll()
    this.release?.()
    this.release = null
  }
}
