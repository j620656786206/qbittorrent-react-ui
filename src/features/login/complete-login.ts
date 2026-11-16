import type { QueryClient } from '@tanstack/react-query'
import { safeReturnTo } from '#/lib/return-to'
import { clearLoginRequired } from '#/state/login-required'
import { SESSION_QUERY_KEY } from '#/features/login/session-query'

export interface CompleteLoginArgs {
  data: { exp: number }
  /** `?redirect=` from the URL; only a same-site path is followed. */
  redirect: string | undefined
  queryClient: QueryClient
  /** Replaces the current history entry (the login page). */
  navigate: (to: string) => void
}

/**
 * After a successful login: clear the login-required store (else `_authed`
 * redirects straight back here), seed the session so the guard needs no
 * second request, refetch everything else, and go back to the original
 * page. Returns the target.
 */
export function completeLogin({
  data,
  redirect,
  queryClient,
  navigate,
}: CompleteLoginArgs): string {
  clearLoginRequired()
  queryClient.setQueryData(SESSION_QUERY_KEY, data)
  // Queries that failed with not_logged_in refetch now instead of staying in
  // error; the session just seeded is left alone.
  void queryClient.invalidateQueries({
    predicate: (query) => query.queryKey[0] !== SESSION_QUERY_KEY[0],
  })
  const target = safeReturnTo(redirect)
  navigate(target)
  return target
}
