import { useCallback } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import type { QueryClient, QueryFunctionContext } from '@tanstack/react-query'
import { createStore, useSelector } from '@tanstack/react-store'
import { selectCategoryCounts } from '#/lib/category-tabs'
import { mergeMaindata } from '#/lib/maindata-merge'
import {
  countMatches,
  selectBoardColumns,
  selectVisibleTorrents,
} from '#/lib/visible-torrents'
import type { Maindata } from '#/lib/maindata-merge'
import type {
  BoardColumns,
  SortKeys,
  TorrentView,
} from '#/lib/visible-torrents'
import { ALL } from '#/shared/categories'
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
 *   const { data: hashes } = useVisibleTorrents(view)
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
 * The visible hashes in order (AR-41). `view` must be stable too (the
 * `useListView()` value is), and so must `sortKeys` (the merged
 * `['sort-keys', field]` data keeps its reference while nothing changed).
 */
export function useVisibleTorrents(view: TorrentView, sortKeys?: SortKeys) {
  const select = useCallback(
    (data: Maindata) => selectVisibleTorrents(data, view, sortKeys),
    [view, sortKeys],
  )
  return useMaindata(select)
}

/**
 * One board computation per maindata snapshot, category and keyword,
 * however many observe it.
 */
const boardColumnsBySnapshot = new WeakMap<
  Maindata,
  Map<string, BoardColumns>
>()

function selectBoardColumnsOnce(
  data: Maindata,
  category: string,
  query: string,
): BoardColumns {
  let byFilter = boardColumnsBySnapshot.get(data)
  if (byFilter === undefined) {
    byFilter = new Map()
    boardColumnsBySnapshot.set(data, byFilter)
  }
  // Any text can be a category or a keyword: a JSON pair never collides.
  const key = JSON.stringify([category, query])
  let columns = byFilter.get(key)
  if (columns === undefined) {
    columns = selectBoardColumns(data, category, query)
    byFilter.set(key, columns)
  }
  return columns
}

/**
 * Story 2.3: the board's five columns (`selectBoardColumns`), each in its
 * fixed order. Live, never frozen (EXPERIENCE 「看板不受影響」). Query's
 * structural sharing keeps a column's array when its hashes did not change,
 * so an unchanged column does not re-render. The board and its detail
 * both observe it: Query runs `select` per observer, so the result is
 * cached per snapshot and ~4167 torrents are classified and sorted once a
 * poll, not once per observer. Story 3.2: only `category`'s torrents
 * (the selected tab, `useListView().view.category`). Story 3.5: only names
 * holding `query` (`view.query`; empty is every name).
 */
export function useBoardColumns(category: string = ALL, query = '') {
  const select = useCallback(
    (data: Maindata) => selectBoardColumnsOnce(data, category, query),
    [category, query],
  )
  return useMaindata(select)
}

/**
 * Story 3.5: how many of `category`'s torrents hold `query` (empty: all),
 * archived ones only with `withArchived` (countMatches). A number, so
 * re-renders only when it changes.
 */
export function useMatchCount(
  category: string,
  query: string,
  withArchived: boolean,
) {
  const select = useCallback(
    (data: Maindata) => countMatches(data, category, query, withArchived),
    [category, query, withArchived],
  )
  return useMaindata(select)
}

/**
 * Story 3.2: every category some torrent has, with its count without
 * archived torrents (selectCategoryCounts). Its result keeps its reference
 * while no count changes.
 */
export function useCategoryCounts() {
  return useMaindata(selectCategoryCounts)
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
