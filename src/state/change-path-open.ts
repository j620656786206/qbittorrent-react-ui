import { createStore, useSelector } from '@tanstack/react-store'

// Story 5.2 (EXPERIENCE change-path): which torrents the change-path screen
// is open for, or `null` when it is closed (like add-open.ts). The
// detail's 「改路徑」 opens it with its torrent's hash; story 5.5 opens it
// from the selection bar with many. The `_authed` layout renders the
// screen. Docs: TanStack Store 0.11 `createStore`, `useSelector`
// (https://tanstack.com/store/v0/docs/framework/react/quick-start).

export type ChangePathOpen = { hashes: ReadonlyArray<string> } | null

// Browser only, like the other stores in src/state.
export const changePathOpenStore = createStore<{ open: ChangePathOpen }>({
  open: null,
})

/** Opens the screen for `hashes` (at least one); replaces an open one. */
export function openChangePath(hashes: ReadonlyArray<string>): void {
  if (hashes.length === 0) return
  changePathOpenStore.setState(() => ({ open: { hashes: [...hashes] } }))
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
