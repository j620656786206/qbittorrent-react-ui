import { createStore } from '@tanstack/react-store'

// AD-13, story 2.6: the one toast showing, read by the renderer
// (src/shared/ui/toaster.tsx) and written only through src/lib/toast.ts
// (lint: the boundaries element `toast-store` lets only src/lib and
// src/shared import this file). One toast at a time; a new one replaces the
// old. A toast names the things it is about (`keys`: a torrent hash, a file
// key), so a new operation on one of them closes it (its 重試 would resend
// an operation Alex has since replaced).

export interface ShownToast {
  id: number
  text: string
  /** The 「重試」 pill: closes the toast, then runs. */
  retry: () => void
  keys: ReadonlyArray<string>
}

interface ToastState {
  toast: ShownToast | null
}

export const toastStore = createStore<ToastState>({ toast: null })

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
  toastStore.setState(() => ({ toast: { id, text, retry, keys } }))
}

/** Closes the toast; with `id`, only if that one still shows. */
export function dismissToast(id?: number): void {
  const shown = toastStore.state.toast
  if (shown === null) return
  if (id !== undefined && shown.id !== id) return
  toastStore.setState(() => ({ toast: null }))
}

/** Closes the toast showing if it is about `key`. */
export function dismissToastFor(key: string): void {
  const shown = toastStore.state.toast
  if (shown?.keys.includes(key)) dismissToast(shown.id)
}

/** Tests: nothing shown. */
export function resetToasts(): void {
  toastStore.setState(() => ({ toast: null }))
}
