import { createStore, useSelector } from '@tanstack/react-store'

// Story 5.2 (EXPERIENCE change-path): which torrents the change-path screen
// is open for, or `null` when it is closed (like add-open.ts). The
// detail's 「改路徑」 opens it with its torrent's hash; story 5.5 opens it
// from the selection bar with many. The `_authed` layout renders the
// screen. Story 5.4: the detail's 「已加到常用」 toast's 「改名」 opens it
// with `editPath`, the common path whose name the screen opens for
// renaming in edit mode; a plain open carries none. Story 5.5: the
// selection bar's 「改路徑」 opens it with every selected hash and
// `fromSelection`, so the screen clears (or narrows) the selection after
// the move answered. Docs: TanStack Store 0.11 `createStore`, `useSelector`
// (https://tanstack.com/store/v0/docs/framework/react/quick-start).

export type ChangePathOpen = {
  hashes: ReadonlyArray<string>
  /** Story 5.4: open in edit mode, this common path's name being renamed. */
  editPath?: string
  /** Story 5.5: opened from the selection bar. */
  fromSelection?: true
} | null

// Browser only, like the other stores in src/state.
export const changePathOpenStore = createStore<{ open: ChangePathOpen }>({
  open: null,
})

/**
 * Opens the screen for `hashes` (at least one); replaces an open one.
 * `editPath` (story 5.4): in edit mode with that common path's name input
 * focused. `fromSelection` (story 5.5): opened from the selection bar.
 */
export function openChangePath(
  hashes: ReadonlyArray<string>,
  {
    editPath,
    fromSelection = false,
  }: { editPath?: string; fromSelection?: boolean } = {},
): void {
  if (hashes.length === 0) return
  changePathOpenStore.setState(() => ({
    open: {
      hashes: [...hashes],
      ...(editPath === undefined ? {} : { editPath }),
      ...(fromSelection ? { fromSelection: true as const } : {}),
    },
  }))
}

export function closeChangePath(): void {
  changePathOpenStore.setState(() => ({ open: null }))
}

export function useChangePathOpen(): ChangePathOpen {
  return useSelector(changePathOpenStore, (state) => state.open)
}

/** Tests: closed. */
export function resetChangePathOpen(): void {
  closeChangePath()
}
