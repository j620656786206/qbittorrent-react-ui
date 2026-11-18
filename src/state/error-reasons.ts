import { useQuery, useQueryClient } from '@tanstack/react-query'
import type { QueryClient } from '@tanstack/react-query'
import { useEffect } from 'react'
import { hasErroredTorrent } from '#/lib/error-reason'
import type { Maindata } from '#/lib/maindata-merge'
import type {
  ErrorReasonsResponse,
  GetErrorReasonsInput,
} from '#/shared/error-reasons'
import { callFn } from '#/state/call-fn'
import { isLoginRequired } from '#/state/login-required'
import { useMaindata } from '#/state/maindata'
import { pollInterval } from '#/state/polling'

// Story 2.10: `['error-reasons']`, the reason text of each errored torrent
// (getErrorReasons). Polled every 60 s, only while `['maindata']` has a
// torrent in the `error` state and login is not required; the container
// reads qBittorrent's log at most once a window anyway. No retry: a failure
// keeps the previous map (the fixed text shows meanwhile) and the next poll
// is the retry. With no errored torrent the map is dropped, so a torrent
// that errors again never shows the reason of its earlier error. src/state
// may not import server functions: src/router.tsx passes
// `bindFetchErrorReasons(getErrorReasons)` to createQueryClient, like
// maindata.

export const ERROR_REASONS_KEY = ['error-reasons'] as const
export const ERROR_REASONS_POLL_MS = 60_000

export type ErrorReasons = ErrorReasonsResponse['reasons']

export type FetchErrorReasons = (
  signal: AbortSignal,
) => Promise<ErrorReasonsResponse>

/** The client half of the `getErrorReasons` server function. */
export type GetErrorReasonsFn = (options: {
  data?: GetErrorReasonsInput
  headers?: HeadersInit
  signal?: AbortSignal
}) => Promise<
  | { ok: true; data: ErrorReasonsResponse }
  | { ok: false; error: { code: string; message: string } }
>

export function bindFetchErrorReasons(
  getErrorReasons: GetErrorReasonsFn,
): FetchErrorReasons {
  return (signal) => callFn(getErrorReasons, undefined, { signal })
}

/** Registered on the client by createQueryClient({ fetchErrorReasons }). */
export function errorReasonsQueryDefaults(
  fetchErrorReasons: FetchErrorReasons,
) {
  return {
    queryFn: ({ signal }: { signal: AbortSignal }) => fetchErrorReasons(signal),
    refetchInterval: pollInterval(ERROR_REASONS_POLL_MS),
    refetchIntervalInBackground: false,
    staleTime: ERROR_REASONS_POLL_MS,
    retry: false,
    networkMode: 'always',
  } as const
}

/** What each reader asks for: polled only while a torrent is errored. */
function errorReasonsObserverOptions(hasErrored: boolean) {
  return {
    queryKey: ERROR_REASONS_KEY,
    enabled: () => hasErrored && !isLoginRequired(),
  } as const
}

/** The full options (defaults plus a reader's), for tests. */
export function errorReasonsQueryOptions(
  fetchErrorReasons: FetchErrorReasons,
  hasErrored: boolean,
) {
  return {
    ...errorReasonsQueryDefaults(fetchErrorReasons),
    ...errorReasonsObserverOptions(hasErrored),
  }
}

function assertErrorReasonsRegistered(client: QueryClient): void {
  if (client.getQueryDefaults(ERROR_REASONS_KEY).queryFn) return
  throw new Error(
    "['error-reasons'] has no query function: build the QueryClient with createQueryClient({ fetchErrorReasons }) (src/router.tsx does).",
  )
}

const selectHasErrored = (data: Maindata) => hasErroredTorrent(data)

/**
 * Hash to reason for the errored torrents qBittorrent's log explains;
 * `undefined` before the first answer and while no torrent is errored. The
 * map keeps its identity across polls while nothing changed (structural
 * sharing), and callers pass one torrent's string down (`reasonOf` in src/lib/error-reason.ts), so a
 * memoized row re-renders only when its own reason changes.
 */
export function useErrorReasons(): ErrorReasons | undefined {
  const client = useQueryClient()
  const { data: hasErrored = false } = useMaindata(selectHasErrored)
  if (hasErrored) assertErrorReasonsRegistered(client)
  const query = useQuery<ErrorReasonsResponse>(
    errorReasonsObserverOptions(hasErrored),
  )
  useEffect(() => {
    // Disabled, so a reset only drops the map; nothing is fetched.
    if (!hasErrored) {
      void client.resetQueries({ queryKey: ERROR_REASONS_KEY, exact: true })
    }
  }, [client, hasErrored])
  return hasErrored ? query.data?.reasons : undefined
}
