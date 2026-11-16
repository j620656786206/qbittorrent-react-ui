// The app shell's `main` and, since story 2.4, the list's own scroller.
// Shared because the header (focus target, dim, sort changes), the bottom
// sheet (scroll lock) and the list (the virtualizer's scroll element) need
// them, and features never import each other. `main` fills the space under
// the header; the list and each board column scroll themselves inside it.

export const MAIN_ID = 'rt-main'
/** The list's scroll container (story 2.4: the list scrolls itself). */
export const LIST_SCROLL_ID = 'rt-list-scroll'

function byId(id: string): HTMLElement | null {
  if (typeof document === 'undefined') return null
  return document.getElementById(id)
}

/**
 * `main`, or `null` before the shell mounts (and on the server). Also the
 * focus target when a focused button disappears (bar, retry block).
 */
export function getMain(): HTMLElement | null {
  return byId(MAIN_ID)
}

/** The list's scroller, or `null` when no list is shown. */
export function getListScroll(): HTMLElement | null {
  return byId(LIST_SCROLL_ID)
}

/**
 * Any sort change goes back to the top (epic 2): the list's scroller and
 * `main`. Board columns start at the top when the board mounts.
 */
export function resetListScroll(): void {
  for (const element of [getListScroll(), getMain()]) {
    if (element) element.scrollTop = 0
  }
}
