import { createStore } from '@tanstack/react-store'

// AD-13, story 2.6: the one toast showing, read by the renderer
// (src/shared/ui/toaster.tsx) and written only through src/lib/toast.ts
// (lint: the boundaries element `toast-store` lets only src/lib and
// src/shared import this file). One toast at a time; a new one replaces the
// old. A toast names the things it is about (`keys`: a torrent hash, a file
// key), so a new operation on one of them closes it (its 重試 would resend
// an operation Alex has since replaced).

export type ShownToast =
  | {
      id: number
      kind: 'failure'
      text: string
      /** The 「重試」 pill: closes the toast, then runs. */
      retry: () => void
      keys: ReadonlyArray<string>
    }
  | {
      /** Story 4.3: plain text, gone after `PLAIN_TOAST_MS`, no button. */
      id: number
      kind: 'plain'
      text: string
      keys: ReadonlyArray<string>
    }
  | {
      /**
       * Story 4.7: text with one button (「去看」), gone after
       * `ACTION_TOAST_MS`. The button closes the toast, then runs.
       */
      id: number
      kind: 'action'
      text: string
      label: string
      run: () => void
      keys: ReadonlyArray<string>
    }

/** Story 4.3: the spine's plain-text toast lasts 4 s. */
export const PLAIN_TOAST_MS = 4000

/** Story 4.7: the spine's toast with a button lasts 8 s. */
export const ACTION_TOAST_MS = 8000

/** Closes the plain or action toast showing when its time is up. */
let autoTimer: ReturnType<typeof setTimeout> | undefined

interface ToastState {
  toast: ShownToast | null
  /**
   * Story 4.1: the desktop selection bar shows, so the toast sits 16px
   * above it instead of 24px from the bottom.
   */
  lifted: boolean
}

export const toastStore = createStore<ToastState>({
  toast: null,
  lifted: false,
})

let nextId = 1

/** Shows a failure toast, replacing whatever shows (nothing on the server). */
export function showFailureToast(
  text: string,
  keys: ReadonlyArray<string>,
  retry: () => void,
): void {
  if (typeof window === 'undefined') return
  const id = nextId
  nextId += 1
  toastStore.setState((state) => ({
    ...state,
    toast: { id, kind: 'failure', text, retry, keys },
  }))
}

/**
 * Story 4.3: shows a plain toast, replacing whatever shows; it closes
 * itself after 4 s unless something replaced it (nothing on the server).
 */
export function showPlainToast(text: string): void {
  if (typeof window === 'undefined') return
  const id = nextId
  nextId += 1
  toastStore.setState((state) => ({
    ...state,
    toast: { id, kind: 'plain', text, keys: [] },
  }))
  clearTimeout(autoTimer)
  autoTimer = setTimeout(() => dismissToast(id), PLAIN_TOAST_MS)
}

/**
 * Story 4.7: shows a toast with one button, replacing whatever shows; it
 * closes itself after 8 s unless something replaced it (nothing on the
 * server).
 */
export function showActionToast(
  text: string,
  label: string,
  run: () => void,
): void {
  if (typeof window === 'undefined') return
  const id = nextId
  nextId += 1
  toastStore.setState((state) => ({
    ...state,
    toast: { id, kind: 'action', text, label, run, keys: [] },
  }))
  clearTimeout(autoTimer)
  autoTimer = setTimeout(() => dismissToast(id), ACTION_TOAST_MS)
}

/** Closes the toast; with `id`, only if that one still shows. */
export function dismissToast(id?: number): void {
  const shown = toastStore.state.toast
  if (shown === null) return
  if (id !== undefined && shown.id !== id) return
  toastStore.setState((state) => ({ ...state, toast: null }))
}

/** Closes the toast showing if it is about `key`. */
export function dismissToastFor(key: string): void {
  const shown = toastStore.state.toast
  if (shown?.keys.includes(key)) dismissToast(shown.id)
}

/** Story 4.1: lifts the toast above the selection bar, or puts it back. */
export function setToastLift(lifted: boolean): void {
  if (toastStore.state.lifted === lifted) return
  toastStore.setState((state) => ({ ...state, lifted }))
}

/** Tests: nothing shown, not lifted. */
export function resetToasts(): void {
  clearTimeout(autoTimer)
  toastStore.setState(() => ({ toast: null, lifted: false }))
}
