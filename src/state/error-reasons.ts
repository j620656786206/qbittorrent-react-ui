import { useQuery } from '@tanstack/react-query'
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
// reads qBittorrent's log at most once a minute anyway. No retry: a failure
// keeps the previous map (the fixed text shows meanwhile) and the next poll
// is the retry. src/state may not import server functions: features pass
// `bindFetchErrorReasons(getErrorReasons)`.

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

export function errorReasonsQueryOptions(
  fetchErrorReasons: FetchErrorReasons,
  hasErrored: boolean,
) {
  return {
    queryKey: ERROR_REASONS_KEY,
    queryFn: ({ signal }: { signal: AbortSignal }) => fetchErrorReasons(signal),
    refetchInterval: pollInterval(ERROR_REASONS_POLL_MS),
    refetchIntervalInBackground: false,
    staleTime: ERROR_REASONS_POLL_MS,
    enabled: () => hasErrored && !isLoginRequired(),
    retry: false,
    networkMode: 'always',
  } as const
}

const selectHasErrored = (data: Maindata) => hasErroredTorrent(data)

/**
 * Hash to reason for the errored torrents qBittorrent's log explains;
 * `undefined` before the first answer. The map keeps its identity across
 * polls while nothing changed (structural sharing), and callers pass one
 * torrent's string down, so a memoized row re-renders only when its own
 * reason changes.
 */
export function useErrorReasons(
  fetchErrorReasons: FetchErrorReasons,
): ErrorReasons | undefined {
  const { data: hasErrored = false } = useMaindata(selectHasErrored)
  const query = useQuery<ErrorReasonsResponse>(
    errorReasonsQueryOptions(fetchErrorReasons, hasErrored),
  )
  return query.data?.reasons
}
