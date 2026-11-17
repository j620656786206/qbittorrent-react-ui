import { skipToken, useQuery } from '@tanstack/react-query'
import type {
  GetTorrentDetailInput,
  TorrentDetailResponse,
} from '#/shared/torrent-detail'
import { callFn } from '#/state/call-fn'
import { unlessLoginRequired } from '#/state/login-required'
import { MAINDATA_POLL_MS } from '#/state/maindata'
import { pollInterval } from '#/state/polling'

// AD-6 detail exception (2026-11-17, Alex), story 2.4: the shown torrent's
// detail fields, `['torrent-detail', hash]`. Only the detail observes it,
// so it polls every 5 s only while a detail is open, and only for the hash
// it shows (another torrent is another key: never the previous torrent's
// numbers). A failure keeps the old answer; the next poll is the retry, like
// maindata. src/state may not import server functions: the detail passes
// `bindFetchTorrentDetail(getTorrentDetail)`.

export const torrentDetailKey = (hash: string) =>
  ['torrent-detail', hash] as const

export type FetchTorrentDetail = (
  input: GetTorrentDetailInput,
  signal: AbortSignal,
) => Promise<TorrentDetailResponse>

/** The client half of the `getTorrentDetail` server function. */
export type GetTorrentDetailFn = (options: {
  data: GetTorrentDetailInput
  headers?: HeadersInit
  signal?: AbortSignal
}) => Promise<
  | { ok: true; data: TorrentDetailResponse }
  | { ok: false; error: { code: string; message: string } }
>

export function bindFetchTorrentDetail(
  getTorrentDetail: GetTorrentDetailFn,
): FetchTorrentDetail {
  return (input, signal) => callFn(getTorrentDetail, input, { signal })
}

export function torrentDetailQueryOptions(
  hash: string,
  fetchTorrentDetail: FetchTorrentDetail,
) {
  return {
    queryKey: torrentDetailKey(hash),
    queryFn: ({ signal }: { signal: AbortSignal }) =>
      fetchTorrentDetail({ hash }, signal),
    refetchInterval: pollInterval(MAINDATA_POLL_MS),
    refetchIntervalInBackground: false,
    staleTime: MAINDATA_POLL_MS,
    enabled: unlessLoginRequired,
    retry: false,
    networkMode: 'always',
  } as const
}

/** The detail fields of `hash`; `null` observes nothing and runs nothing. */
export function useTorrentDetail(
  hash: string | null,
  fetchTorrentDetail: FetchTorrentDetail,
) {
  return useQuery<TorrentDetailResponse>(
    hash === null
      ? { queryKey: ['torrent-detail', null], queryFn: skipToken }
      : torrentDetailQueryOptions(hash, fetchTorrentDetail),
  )
}
