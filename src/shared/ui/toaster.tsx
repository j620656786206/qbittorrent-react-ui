import { useSyncExternalStore } from 'react'
import { X } from 'lucide-react'
import { cn } from '#/shared/ui/cn'
import { TOAST_REGION_ATTR } from '#/shared/ui/toast-region'

// Story 2.6, DESIGN toast (mockups S06-add-success-desktop, S08-done-desktop),
// EXPERIENCE toast: the 「底層 toast」. Features never import this file
// (lint): they call src/lib/toast.ts, which drives the store below; the
// root mounts <Toaster /> once. No toast package (spine: no animation
// packages; Claude 代決 in spec 2.6).
//
// - One toast at a time; a new one replaces the old and replays the
//   entrance (keyed by id).
// - `info` closes after 4 s; `action` after 8 s, the countdown paused while
//   the pointer is over it and resumed with the time left; `failure` stays
//   until ✕ or 「重試」.
// - Every toast has ✕; `action` and `failure` have a 32px outline pill.
//   Pressing the pill closes the toast, then runs its callback.
// - Desktop (>= 1024px): bottom right, 24px in, 356px wide; a lift (the
//   Epic 4 selection bar's height) puts it 16px above that bar. Phone: at
//   the top, 16px in (plus the safe area), above the bottom sheet and its
//   scrim (z-index over `z-50`).
// - `info` and `action` render inside an always-mounted `aria-live="polite"`
//   region, `failure` inside an always-mounted `role="alert"` one, so the
//   change is announced (https://developer.mozilla.org/en-US/docs/Web/Accessibility/ARIA/Reference/Attributes/aria-live,
//   https://developer.mozilla.org/en-US/docs/Web/Accessibility/ARIA/Reference/Roles/alert_role).
// - The region is marked TOAST_REGION_ATTR: an open bottom sheet leaves it
//   out of its modal session.
// CSP (AD-10, no style-src): this renders in the server shell, so nothing
// here may carry a `style` attribute there; the lift is set only in the
// browser, through React's CSSOM `style`.

export type ToastKind = 'info' | 'action' | 'failure'

export interface ToastInput {
  kind: ToastKind
  text: string
  /** The pill (`action`, `failure`). */
  button?: { label: string; onPress: () => void }
}

export interface ShownToast extends ToastInput {
  id: number
}

export const TOAST_DURATION_MS: Readonly<Record<ToastKind, number | null>> = {
  info: 4000,
  action: 8000,
  failure: null,
}

/** Gap between the toast and a bar it is lifted above, px. */
export const TOAST_LIFT_GAP = 16

interface ToastState {
  toast: ShownToast | null
  /** Height of the bar the desktop toast sits above; 0 for none. */
  lift: number
}

let state: ToastState = { toast: null, lift: 0 }
const listeners = new Set<() => void>()
let nextId = 1
let timer: ReturnType<typeof setTimeout> | undefined
/** When the running countdown ends (Date.now ms). */
let deadline = 0
/** Time left of a paused countdown, ms; null when not paused. */
let pausedLeft: number | null = null

function setState(next: Partial<ToastState>): void {
  state = { ...state, ...next }
  for (const listener of listeners) listener()
}

function stopTimer(): void {
  clearTimeout(timer)
  timer = undefined
  pausedLeft = null
}

function startTimer(ms: number, id: number): void {
  deadline = Date.now() + ms
  timer = setTimeout(() => dismissToast(id), ms)
}

/** Shows `input`, replacing whatever shows; returns its id (0 on the server). */
export function showToast(input: ToastInput): number {
  if (typeof window === 'undefined') return 0
  stopTimer()
  const id = nextId
  nextId += 1
  setState({ toast: { ...input, id } })
  const duration = TOAST_DURATION_MS[input.kind]
  if (duration !== null) startTimer(duration, id)
  return id
}

/** Closes the toast; with `id`, only if that one still shows. */
export function dismissToast(id?: number): void {
  if (state.toast === null) return
  if (id !== undefined && state.toast.id !== id) return
  stopTimer()
  setState({ toast: null })
}

/** The pointer is over an `action` toast: hold its countdown. */
export function pauseToast(): void {
  if (state.toast?.kind !== 'action' || timer === undefined) return
  clearTimeout(timer)
  timer = undefined
  pausedLeft = Math.max(0, deadline - Date.now())
}

/** The pointer left: count down the time that was left. */
export function resumeToast(): void {
  const toast = state.toast
  if (toast === null || pausedLeft === null) return
  const left = pausedLeft
  pausedLeft = null
  startTimer(left, toast.id)
}

/** Desktop: sit `TOAST_LIFT_GAP` above a bar `px` tall (0: the corner). */
export function setToastLift(px: number): void {
  const lift = Number.isFinite(px) && px > 0 ? Math.round(px) : 0
  if (lift !== state.lift) setState({ lift })
}

export function getToastState(): ToastState {
  return state
}

/** Tests: nothing shown, no timer, no lift. */
export function resetToasts(): void {
  stopTimer()
  setState({ toast: null, lift: 0 })
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

const SERVER_STATE: ToastState = { toast: null, lift: 0 }

function ToastCard({ toast }: { toast: ShownToast }) {
  const { button } = toast
  const hover = toast.kind === 'action'
  return (
    <div
      data-slot="toast"
      data-kind={toast.kind}
      onPointerEnter={hover ? pauseToast : undefined}
      onPointerLeave={hover ? resumeToast : undefined}
      className="pointer-events-auto flex w-full animate-rise items-center gap-3 rounded-card border bg-surface py-3 pr-2 pl-[18px] text-text shadow-float"
    >
      <p className="m-0 min-w-0 flex-1 text-[13px] leading-[1.4] font-semibold [overflow-wrap:anywhere]">
        {toast.text}
      </p>
      {button && (
        <button
          type="button"
          onClick={() => {
            dismissToast(toast.id)
            button.onPress()
          }}
          className="h-8 flex-none rounded-full border bg-surface px-3.5 text-[13px] font-semibold whitespace-nowrap text-text hover-outline"
        >
          {button.label}
        </button>
      )}
      <button
        type="button"
        aria-label="關閉"
        onClick={() => dismissToast(toast.id)}
        className="inline-flex size-7 flex-none items-center justify-center rounded-full text-text-muted hover-row"
      >
        <X size={14} strokeWidth={2.4} aria-hidden="true" />
      </button>
    </div>
  )
}

export function Toaster() {
  const { toast, lift } = useSyncExternalStore(
    subscribe,
    getToastState,
    () => SERVER_STATE,
  )
  const card = toast && <ToastCard key={toast.id} toast={toast} />
  return (
    <div
      {...{ [TOAST_REGION_ATTR]: '' }}
      // A CSS variable through the CSSOM, browser only (lift starts at 0).
      style={
        lift > 0
          ? ({ '--toast-bottom': `${lift + TOAST_LIFT_GAP}px` } as never)
          : undefined
      }
      className={cn(
        'pointer-events-none fixed inset-x-4 top-[calc(16px+env(safe-area-inset-top))] z-[60] flex flex-col',
        'lg:top-auto lg:right-6 lg:bottom-[var(--toast-bottom,24px)] lg:left-auto lg:w-[356px]',
      )}
    >
      <div aria-live="polite">{toast?.kind === 'failure' ? null : card}</div>
      <div role="alert">{toast?.kind === 'failure' ? card : null}</div>
    </div>
  )
}
