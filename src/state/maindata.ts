import { useQuery, useQueryClient } from '@tanstack/react-query'
import type { QueryClient, QueryFunctionContext } from '@tanstack/react-query'
import { mergeMaindata } from '#/lib/maindata-merge'
import type { Maindata } from '#/lib/maindata-merge'
import type {
  GetMaindataInput,
  MaindataResponse,
  MaindataVersion,
} from '#/shared/maindata'
import { callFn } from '#/state/call-fn'
import { isLoginRequired } from '#/state/login-required'
import { pollInterval } from '#/state/polling'

// AD-6, AR-38, AR-42: the one `['maindata']` query. Its options are
// registered once per client (`setQueryDefaults` in query-client.ts), so
// every observer polls the same way; its query function is the only writer
// of the key, through `mergeMaindata`. On failure Query keeps the old data,
// and `dataUpdatedAt` is the last success time.
//
// src/state may not import server functions, so src/router.tsx passes
// `bindFetchMaindata(getMaindata)` to createQueryClient.

export const MAINDATA_KEY = ['maindata'] as const
export const MAINDATA_POLL_MS = 5000

export type FetchMaindata = (
  since: MaindataVersion | undefined,
  signal: AbortSignal,
) => Promise<MaindataResponse>

/** The client half of the `getMaindata` server function, as callFn sees it. */
export type GetMaindataFn = (options: {
  data?: GetMaindataInput
  headers?: HeadersInit
  signal?: AbortSignal
}) => Promise<
  | { ok: true; data: MaindataResponse }
  | { ok: false; error: { code: string; message: string } }
>

/** The production fetcher: `since` only when there is a version. */
export function bindFetchMaindata(getMaindata: GetMaindataFn): FetchMaindata {
  return (since, signal) =>
    callFn(getMaindata, since ? { since } : undefined, { signal })
}

export function maindataQueryDefaults(fetchMaindata: FetchMaindata) {
  return {
    queryFn: async ({ client, signal }: QueryFunctionContext) => {
      const previous = client.getQueryData<Maindata>(MAINDATA_KEY)
      const response = await fetchMaindata(previous?.version, signal)
      return mergeMaindata(previous, response)
    },
    refetchInterval: pollInterval(MAINDATA_POLL_MS),
    // A hidden tab does not poll; coming back fetches at once.
    refetchIntervalInBackground: false,
    refetchOnWindowFocus: () => (isLoginRequired() ? false : 'always'),
    staleTime: MAINDATA_POLL_MS,
    // Also covers a fresh mount while the login screen is needed.
    enabled: () => !isLoginRequired(),
    // The next poll is the retry: the alert shows after one failed call.
    retry: false,
    // Never pause for `navigator.onLine`: a phone without signal must fail
    // the call (callFn: home_unreachable) so the alert shows and
    // refreshMaindata settles. Structural sharing stays on: the merge keeps
    // references, so it short-circuits, and `select` results keep theirs.
    networkMode: 'always',
  } as const
}

/**
 * Throws a clear error when the client was built without `fetchMaindata`
 * (Query alone would only say "Missing queryFn").
 */
export function assertMaindataRegistered(client: QueryClient): void {
  if (client.getQueryDefaults(MAINDATA_KEY).queryFn) return
  throw new Error(
    "['maindata'] has no query function: build the QueryClient with createQueryClient({ fetchMaindata }) (src/router.tsx does).",
  )
}

/** Reads `['maindata']` through `select`; options come from the defaults. */
export function useMaindata<TSelected>(select: (data: Maindata) => TSelected) {
  assertMaindataRegistered(useQueryClient())
  return useQuery<Maindata, Error, TSelected, typeof MAINDATA_KEY>({
    queryKey: MAINDATA_KEY,
    select,
  })
}

/**
 * AD-7: the only "fetch now". Cancels a call in flight (its old data stays)
 * and fetches once; resolves when that fetch settles. A no-op while the
 * login screen is needed (the query is disabled).
 */
export async function refreshMaindata(client: QueryClient): Promise<void> {
  // `enabled` only applies through observers; with none mounted,
  // refetchQueries would still fetch.
  if (isLoginRequired()) return
  await client.cancelQueries({ queryKey: MAINDATA_KEY, exact: true })
  await client.refetchQueries({ queryKey: MAINDATA_KEY, exact: true })
}
