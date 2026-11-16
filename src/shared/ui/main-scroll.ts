// The app shell's `main`: the only scroll container of a logged-in page.
// Shared because the header (focus target, dim) and the list (the
// virtualizer's scroll element) both need it, and features never import
// each other.

export const MAIN_ID = 'rt-main'

/**
 * `main`, or `null` before the shell mounts (and on the server). Also the
 * focus target when a focused button disappears (bar, retry block).
 */
export function getMain(): HTMLElement | null {
  if (typeof document === 'undefined') return null
  return document.getElementById(MAIN_ID)
}
