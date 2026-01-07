import { useEffect, useState } from 'react';

export type MediaQueryString = `(min-width: ${number}px)` | `(max-width: ${number}px)`;

export function useMediaQuery(query: MediaQueryString): boolean {
  const [matches, setMatches] = useState(false);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      const mediaQuery = window.matchMedia(query);
      setMatches(mediaQuery.matches);

      const handler = (event: MediaQueryListEvent) => setMatches(event.matches);
      mediaQuery.addEventListener('change', handler);

      return () => mediaQuery.removeEventListener('change', handler);
    }
  }, [query]);

  return matches;
}
