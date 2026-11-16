import { queryOptions } from '@tanstack/react-query'
import { getSession } from '#/server/functions/get-session'
import { callFn } from '#/state/call-fn'

export const SESSION_QUERY_KEY = ['session'] as const

/** Fresh until the session's own `exp`; after that the guard asks again. */
export function sessionStaleTime(data: { exp: number } | undefined): number {
  return data !== undefined && data.exp * 1000 > Date.now() ? Infinity : 0
}

// The `_authed` guard reads this with `fetchQuery`, which honours staleTime:
// no request while the cached session is unexpired, a new one after `exp`.
export function sessionQueryOptions() {
  return queryOptions({
    queryKey: SESSION_QUERY_KEY,
    queryFn: ({ signal }) => callFn(getSession, undefined, { signal }),
    staleTime: (query) => sessionStaleTime(query.state.data),
    retry: false,
  })
}
