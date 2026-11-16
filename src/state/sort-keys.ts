import { skipToken, useQuery } from '@tanstack/react-query'
import type { QueryFunctionContext } from '@tanstack/react-query'
import { mergeSortKeys } from '#/lib/sort-keys-merge'
import type { SortKeysData } from '#/lib/sort-keys-merge'
import type { MaindataVersion } from '#/shared/maindata'
import type {
  ExtraSortFieldId,
  GetSortKeysInput,
  SortKeysResponse,
} from '#/shared/sort-keys'
import { callFn } from '#/state/call-fn'
import { unlessLoginRequired } from '#/state/login-required'
import { MAINDATA_POLL_MS } from '#/state/maindata'
import { pollInterval } from '#/state/polling'

// AD-6 (2026-11-16, Alex), story 2.1: an extra sort's values, one query per
// field, `['sort-keys', field]`. Only the list observes it, and only while
// that field is the active sort, so it polls every 5 s only then (a query
// nobody observes does not poll). Its query function is the only writer,
// through `mergeSortKeys`. A failure keeps the old keys; connection codes
// go to the global `onError` like every query. src/state may not import
// server functions: the list passes `bindFetchSortKeys(getSortKeys)`.

export const sortKeysKey = (field: ExtraSortFieldId) =>
  ['sort-keys', field] as const

export type FetchSortKeys = (
  input: GetSortKeysInput,
  signal: AbortSignal,
) => Promise<SortKeysResponse>

/** The client half of the `getSortKeys` server function, as callFn sees it. */
export type GetSortKeysFn = (options: {
  data: GetSortKeysInput
  headers?: HeadersInit
  signal?: AbortSignal
}) => Promise<
  | { ok: true; data: SortKeysResponse }
  | { ok: false; error: { code: string; message: string } }
>

export function bindFetchSortKeys(getSortKeys: GetSortKeysFn): FetchSortKeys {
  return (input, signal) => callFn(getSortKeys, input, { signal })
}

function sortKeysInput(
  field: ExtraSortFieldId,
  since: MaindataVersion | undefined,
): GetSortKeysInput {
  return since ? { field, since } : { field }
}

export function sortKeysQueryOptions(
  field: ExtraSortFieldId,
  fetchSortKeys: FetchSortKeys,
) {
  const queryKey = sortKeysKey(field)
  return {
    queryKey,
    queryFn: async ({ client, signal }: QueryFunctionContext) => {
      const previous = client.getQueryData<SortKeysData>(queryKey)
      const response = await fetchSortKeys(
        sortKeysInput(field, previous?.version),
        signal,
      )
      return mergeSortKeys(previous, response)
    },
    refetchInterval: pollInterval(MAINDATA_POLL_MS),
    refetchIntervalInBackground: false,
    staleTime: MAINDATA_POLL_MS,
    enabled: unlessLoginRequired,
    // The next poll is the retry, like maindata.
    retry: false,
    networkMode: 'always',
  } as const
}

/**
 * The active extra sort's keys; pass `null` when the sort is a slim one:
 * then a key no real field uses is observed and nothing runs, so no real
 * field's cache is kept alive by it.
 */
export function useSortKeys(
  field: ExtraSortFieldId | null,
  fetchSortKeys: FetchSortKeys,
) {
  return useQuery<SortKeysData>(
    field === null
      ? { queryKey: ['sort-keys', null], queryFn: skipToken }
      : sortKeysQueryOptions(field, fetchSortKeys),
  )
}
