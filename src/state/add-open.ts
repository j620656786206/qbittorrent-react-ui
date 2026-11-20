import { createStore, useSelector } from '@tanstack/react-store'

// Story 4.6 (EXPERIENCE add-torrent, drop-overlay): whether the add screen
// is open, and the files handed to it from outside (a drop on the desktop
// overlay). The header 「新增」, the phone round button and the empty
// states' 「新增種子」 open it through `openAdd()`; the drop overlay calls
// `openAdd(files)`, which queues the files and opens the screen, or only
// queues them when it is already open (they are appended to its list).
// The screen takes the queue (`takeQueuedFiles`) and reads the files
// itself. Closing drops the queue: the next open starts empty.
// Docs: TanStack Store 0.11 `createStore`, `useSelector`
// (https://tanstack.com/store/v0/docs/framework/react/quick-start).

interface AddOpenState {
  open: boolean
  /** Files handed over and not taken by the screen yet, in drop order. */
  queued: ReadonlyArray<File>
}

const NO_FILES: ReadonlyArray<File> = Object.freeze([])

// Browser only, like the other stores in src/state.
export const addOpenStore = createStore<AddOpenState>({
  open: false,
  queued: NO_FILES,
})

/** Opens the add screen; `files` join its list (appended when open). */
export function openAdd(files?: ReadonlyArray<File>): void {
  addOpenStore.setState((state) => ({
    open: true,
    queued:
      files === undefined || files.length === 0
        ? state.queued
        : [...state.queued, ...files],
  }))
}

/** Closes it; files still queued are dropped. */
export function closeAdd(): void {
  addOpenStore.setState(() => ({ open: false, queued: NO_FILES }))
}

/** The queued files, removed from the queue. */
export function takeQueuedFiles(): ReadonlyArray<File> {
  const { queued } = addOpenStore.state
  if (queued.length === 0) return NO_FILES
  addOpenStore.setState((state) => ({ ...state, queued: NO_FILES }))
  return queued
}

export function useAddOpen(): boolean {
  return useSelector(addOpenStore, (state) => state.open)
}

export function useQueuedFiles(): ReadonlyArray<File> {
  return useSelector(addOpenStore, (state) => state.queued)
}

/** Tests: closed, nothing queued. */
export function resetAddOpen(): void {
  addOpenStore.setState(() => ({ open: false, queued: NO_FILES }))
}
