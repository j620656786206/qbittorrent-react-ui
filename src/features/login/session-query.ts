import { queryOptions } from '@tanstack/react-query'
import { getSession } from '#/server/functions/get-session'
import { callFn } from '#/state/call-fn'
import { isLoginRequired } from '#/state/login-required'

export const SESSION_QUERY_KEY = ['session'] as const

/** Fresh until the session's own `exp`; after that the guard asks again. */
export function sessionStaleTime(data: { exp: number } | undefined): number {
  return data !== undefined && data.exp * 1000 > Date.now() ? Infinity : 0
}

// The `_authed` guard reads this with `fetchQuery`, which resolves staleTime
// at call time: no request while the cached session is unexpired, a new one
// after `exp`. While the login store is set, some function has just said
// not_logged_in, so the cached session is not trusted and the server is asked.
// https://tanstack.com/query/v5/docs/reference/QueryClient
// https://tanstack.com/query/v5/docs/framework/react/reference/useQuery
export function sessionQueryOptions() {
  return queryOptions({
    queryKey: SESSION_QUERY_KEY,
    queryFn: ({ signal }) => callFn(getSession, undefined, { signal }),
    staleTime: (query) =>
      isLoginRequired() ? 0 : sessionStaleTime(query.state.data),
    retry: false,
  })
}
