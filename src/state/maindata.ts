import { useCallback } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import type { QueryClient, QueryFunctionContext } from '@tanstack/react-query'
import { createStore, useSelector } from '@tanstack/react-store'
import { mergeMaindata } from '#/lib/maindata-merge'
import { selectVisibleTorrents } from '#/lib/visible-torrents'
import type { Maindata } from '#/lib/maindata-merge'
import type { TorrentView } from '#/lib/visible-torrents'
import type {
  GetMaindataInput,
  MaindataResponse,
  MaindataVersion,
} from '#/shared/maindata'
import { callFn } from '#/state/call-fn'
import { isLoginRequired, unlessLoginRequired } from '#/state/login-required'
import { pollInterval } from '#/state/polling'

// AD-6, AR-38, AR-42: the one `['maindata']` query. Its options are
// registered once per client (`setQueryDefaults` in query-client.ts), so
// every observer polls the same way; its query function is the only writer
// of the key, through `mergeMaindata`. On failure Query keeps the old data,
// and `dataUpdatedAt` is the last success time.
//
// src/state may not import server functions, so src/router.tsx passes
// `bindFetchMaindata(getMaindata)` to createQueryClient. Screens read the
// data with `useMaindata(select)` and the stable selectors below; the header
// alert uses `useConnectionAlert` from src/state/connection-alert.ts.

export const MAINDATA_KEY = ['maindata'] as const
export const MAINDATA_POLL_MS = 5000

export interface FetchMaindataOptions {
  /**
   * Ask the container for a pull that starts after this call arrives (no
   * reuse of a recent one). Set while `refreshMaindata` runs.
   */
  fresh: boolean
}

export type FetchMaindata = (
  since: MaindataVersion | undefined,
  signal: AbortSignal,
  options: FetchMaindataOptions,
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

/** Only the keys that are set, or nothing. */
function maindataInput(
  since: MaindataVersion | undefined,
  fresh: boolean,
): GetMaindataInput {
  if (!since && !fresh) return undefined
  return {
    ...(since ? { since } : {}),
    ...(fresh ? { fresh: true } : {}),
  }
}

/** The production fetcher: `since` only when there is a version. */
export function bindFetchMaindata(getMaindata: GetMaindataFn): FetchMaindata {
  return (since, signal, { fresh }) =>
    callFn(getMaindata, maindataInput(since, fresh), { signal })
}

// When the maindata fetch in flight started (epoch ms), for the alert's
// stale line (FETCH_GRACE_MS in src/lib/connection-alert.ts). Query keeps
// no start time of its own. Browser only, like the other stores.
const fetchStore = createStore<{ startedAt: number | null }>({
  startedAt: null,
})
let fetchSeq = 0

function trackFetch(): () => void {
  if (typeof window === 'undefined') return () => {}
  fetchSeq += 1
  const seq = fetchSeq
  fetchStore.setState(() => ({ startedAt: Date.now() }))
  return () => {
    // A cancelled fetch can settle after its replacement started.
    if (seq === fetchSeq) fetchStore.setState(() => ({ startedAt: null }))
  }
}

export function getMaindataFetchStartedAt(): number | null {
  return fetchStore.state.startedAt
}

export function useMaindataFetchStartedAt(): number | null {
  return useSelector(fetchStore, (state) => state.startedAt)
}

/** Clients with a `refreshMaindata` running: their fetches ask for `fresh`. */
const refreshing = new WeakMap<QueryClient, number>()

export function maindataQueryDefaults(fetchMaindata: FetchMaindata) {
  return {
    queryFn: async ({ client, signal }: QueryFunctionContext) => {
      const done = trackFetch()
      try {
        const previous = client.getQueryData<Maindata>(MAINDATA_KEY)
        const fresh = (refreshing.get(client) ?? 0) > 0
        const response = await fetchMaindata(previous?.version, signal, {
          fresh,
        })
        return mergeMaindata(previous, response)
      } finally {
        done()
      }
    },
    refetchInterval: pollInterval(MAINDATA_POLL_MS),
    // A hidden tab does not poll; coming back fetches at once.
    refetchIntervalInBackground: false,
    refetchOnWindowFocus: () => (isLoginRequired() ? false : 'always'),
    staleTime: MAINDATA_POLL_MS,
    // Also covers a fresh mount while the login screen is needed.
    enabled: unlessLoginRequired,
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

/**
 * Reads `['maindata']` through `select`; options come from the defaults.
 *
 * `select` must be stable: a module-level function (the `select*` below,
 * `countAll` from src/lib/visible-torrents.ts) or a `useCallback`. Query
 * reruns `select` whenever the function changes, so an inline arrow
 * reclassifies and resorts all ~4167 torrents on every render. Each poll
 * reruns it once (new data); its result keeps its reference when equal.
 *
 *   const { data: serverState } = useMaindata(selectServerState)
 *   const { data: count } = useMaindata(countAll)
 *   const { data: hashes } = useVisibleTorrents(EPIC1_VIEW)
 */
export function useMaindata<TSelected>(select: (data: Maindata) => TSelected) {
  assertMaindataRegistered(useQueryClient())
  return useQuery<Maindata, Error, TSelected, typeof MAINDATA_KEY>({
    queryKey: MAINDATA_KEY,
    select,
  })
}

export const selectServerState = (data: Maindata) => data.serverState
export const selectConnectionStatus = (data: Maindata) =>
  data.serverState.connection_status
export const selectCategories = (data: Maindata) => data.categories
/** Every torrent by hash, archived ones included. */
export const selectTorrents = (data: Maindata) => data.torrents
export const selectStateBeforeMove = (data: Maindata) => data.stateBeforeMove

/**
 * The visible hashes in order (AR-41). `view` must be stable too: a constant
 * like `EPIC1_VIEW`, or a `useMemo` once a view has filters.
 */
export function useVisibleTorrents(view: TorrentView) {
  const select = useCallback(
    (data: Maindata) => selectVisibleTorrents(data, view),
    [view],
  )
  return useMaindata(select)
}

/**
 * AD-7: the only "fetch now". Cancels a call in flight (its old data stays)
 * and fetches once with `fresh`, so the container answers from a qBittorrent
 * pull that started after this call (an operation's effect is in it).
 * Resolves when that fetch settles. A no-op while the login screen is
 * needed (the query is disabled).
 */
export async function refreshMaindata(client: QueryClient): Promise<void> {
  // `enabled` only applies through observers; with none mounted,
  // refetchQueries would still fetch.
  if (isLoginRequired()) return
  refreshing.set(client, (refreshing.get(client) ?? 0) + 1)
  try {
    await client.cancelQueries({ queryKey: MAINDATA_KEY, exact: true })
    await client.refetchQueries({ queryKey: MAINDATA_KEY, exact: true })
  } finally {
    const left = (refreshing.get(client) ?? 1) - 1
    if (left > 0) refreshing.set(client, left)
    else refreshing.delete(client)
  }
}
