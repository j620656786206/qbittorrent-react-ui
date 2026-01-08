import { useEffect, useState } from 'react'

export type MediaQueryString =
  | `(min-width: ${number}px)`
  | `(max-width: ${number}px)`

export function useMediaQuery(query: MediaQueryString): boolean {
  const [matches, setMatches] = useState(false)

  useEffect(() => {
    if (typeof window !== 'undefined') {
      const mediaQuery = window.matchMedia(query)
      setMatches(mediaQuery.matches)

      const handler = (event: MediaQueryListEvent) => setMatches(event.matches)
      mediaQuery.addEventListener('change', handler)

      return () => mediaQuery.removeEventListener('change', handler)
    }
  }, [query])

  return matches
}

/**
 * Hook to detect the current platform (Mac vs Windows/Linux)
 * Used for displaying platform-appropriate modifier keys in UI (⌘ for Mac, Ctrl for Windows/Linux)
 *
 * @returns Object containing platform information
 */
export function usePlatform() {
  const [isMac, setIsMac] = useState(false)

  useEffect(() => {
    if (typeof window !== 'undefined' && typeof navigator !== 'undefined') {
      const platform = navigator.platform.toUpperCase()
      setIsMac(platform.indexOf('MAC') >= 0)
    }
  }, [])

  return { isMac }
}