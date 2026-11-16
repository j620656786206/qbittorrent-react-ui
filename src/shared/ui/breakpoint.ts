import { useSyncExternalStore } from 'react'

// The one breakpoint (EXPERIENCE Responsive & Platform): desktop from
// 1024px (Tailwind `lg`), phone below. CSS uses `lg:`; code that must pick
// one tree (the board's desktop columns or phone tabs, the phone sheet that
// closes at desktop width) uses this query.

/** Tailwind `lg`, where the desktop layout takes over. */
export const DESKTOP_QUERY = '(min-width: 1024px)'

function subscribe(onChange: () => void): () => void {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function')
    return () => {}
  const query = window.matchMedia(DESKTOP_QUERY)
  query.addEventListener('change', onChange)
  return () => query.removeEventListener('change', onChange)
}

/** Without `matchMedia` (node tests) the desktop layout. */
function isDesktop(): boolean {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function')
    return true
  return window.matchMedia(DESKTOP_QUERY).matches
}

/** Re-renders the caller when the width crosses 1024px. */
export function useIsDesktop(): boolean {
  return useSyncExternalStore(subscribe, isDesktop, isDesktop)
}
