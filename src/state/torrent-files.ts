import { useQuery } from '@tanstack/react-query'
import type { GetFilesInput, TorrentFile } from '#/shared/torrent-files'
import { callFn } from '#/state/call-fn'
import { isLoginRequired, unlessLoginRequired } from '#/state/login-required'
import { MAINDATA_POLL_MS } from '#/state/maindata'
import { pollInterval } from '#/state/polling'

// AD-6 files exception, story 2.7: the shown torrent's files, `['files',
// hash]`. Only the files tab observes it, so it polls every 5 s only while
// that tab shows, only for that torrent (another torrent is another key),
// not while the page is in the background, and at once when the window
// gets focus back (even under 5 s, like maindata). A failed poll keeps the last answer; the next poll is
// the retry. src/state may not import server functions: the tab passes
// `bindFetchFiles(getFiles)`.
// https://tanstack.com/query/v5/docs/framework/react/reference/useQuery

export const filesKey = (hash: string) => ['files', hash] as const

export type FetchFiles = (
  input: GetFilesInput,
  signal: AbortSignal,
) => Promise<Array<TorrentFile>>

/** The client half of the `getFiles` server function. */
export type GetFilesFn = (options: {
  data: GetFilesInput
  headers?: HeadersInit
  signal?: AbortSignal
}) => Promise<
  | { ok: true; data: Array<TorrentFile> }
  | { ok: false; error: { code: string; message: string } }
>

export function bindFetchFiles(getFiles: GetFilesFn): FetchFiles {
  return (input, signal) => callFn(getFiles, input, { signal })
}

export function torrentFilesQueryOptions(hash: string, fetchFiles: FetchFiles) {
  return {
    queryKey: filesKey(hash),
    queryFn: ({ signal }: { signal: AbortSignal }) =>
      fetchFiles({ hash }, signal),
    refetchInterval: pollInterval(MAINDATA_POLL_MS),
    refetchIntervalInBackground: false,
    refetchOnWindowFocus: () => (isLoginRequired() ? false : 'always'),
    staleTime: MAINDATA_POLL_MS,
    enabled: unlessLoginRequired,
    retry: false,
    networkMode: 'always',
  } as const
}

/**
 * The files of `hash`. `failed`: a call failed and none has answered yet
 * (sticky like the detail's values: Query resets `isError` when a poll
 * starts with no data, `errorUpdateCount` only grows). `retry` fetches at
 * once; `retrying` is true while that fetch runs.
 */
export function useTorrentFiles(hash: string, fetchFiles: FetchFiles) {
  const query = useQuery<Array<TorrentFile>>(
    torrentFilesQueryOptions(hash, fetchFiles),
  )
  return {
    data: query.data,
    failed: query.data === undefined && query.errorUpdateCount > 0,
    retrying: query.isFetching,
    retry: () => {
      void query.refetch()
    },
  }
}
