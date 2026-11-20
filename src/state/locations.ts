import { useMemo } from 'react'
import { NO_COMMON_PATHS_RESOLVER, createLocationResolver } from '#/lib/paths'
import type { LocationResolver } from '#/lib/paths'
import { useSettings } from '#/state/settings'

// Story 5.1: the location tags' resolver, one per common-path list. Query's
// structural sharing keeps `commonPaths` the same array while a refetch
// (window focus) or a write's answer leaves it equal, so the resolver and
// its cached `{ name, mediaLibrary }` objects survive and memoized rows and
// cards skip their render. A changed list builds a new resolver, whose new
// objects re-render every tag. Before settings arrive (or when they never
// do) tags resolve as with no common paths: the last two folders.
// https://react.dev/reference/react/useMemo
// https://tanstack.com/query/v5/docs/framework/react/guides/render-optimizations#structural-sharing

export function useLocationResolver(): LocationResolver {
  const commonPaths = useSettings().settings?.commonPaths
  return useMemo(
    () =>
      commonPaths === undefined
        ? NO_COMMON_PATHS_RESOLVER
        : createLocationResolver(commonPaths),
    [commonPaths],
  )
}
