import {
  MutationCache,
  QueryCache,
  QueryClient,
  hashKey,
} from '@tanstack/react-query'
import { isAppError, isConnectionCode, isLoginStopCode } from '#/lib/app-error'
import type { AppError, LoginStopReason } from '#/lib/app-error'
import type { ErrorCode } from '#/shared/errors'
import {
  clearConnectionErrors,
  clearUnreachable,
  markConnectionError,
} from '#/state/connection'
import {
  loginStore,
  markLoginRequired,
  unlessLoginRequired,
} from '#/state/login-required'
import { MAINDATA_KEY, maindataQueryDefaults } from '#/state/maindata'
import type { FetchMaindata } from '#/state/maindata'

// AR-35, AD-9: one QueryClient per router. The global `onError` is the only
// place that handles the login-stop codes, the connection codes and
// `bad_origin`. Connection codes are recorded in src/state/connection.ts;
// a successful `['maindata']` fetch clears them, and a maindata failure the
// container answered (any other code) clears the unreachable one.

export interface RouterContext {
  queryClient: QueryClient
}

export interface CreateQueryClientOptions {
  /** Where to return after login. Defaults to the current same-site URL. */
  currentPath?: () => string
  /**
   * The `getMaindata` call (bound in src/router.tsx). When given, the
   * `['maindata']` query options are registered on the client.
   */
  fetchMaindata?: FetchMaindata
}

function locationPath(): string {
  if (typeof window === 'undefined') return '/'
  const { pathname, search, hash } = window.location
  return pathname + search + hash
}

function isLoginStop(
  error: unknown,
): error is AppError & { code: LoginStopReason } {
  return isAppError(error) && isLoginStopCode(error.code)
}

/** Only connection-class failures can succeed on a second try. */
const RETRY_CODES: ReadonlySet<ErrorCode> = new Set<ErrorCode>([
  'home_unreachable',
  'qbit_unreachable',
  'timeout',
])
const MAX_QUERY_RETRIES = 3

const MAINDATA_HASH = hashKey(MAINDATA_KEY)

export function createQueryClient({
  currentPath = locationPath,
  fetchMaindata,
}: CreateQueryClientOptions = {}): QueryClient {
  // bad_origin repeats on every poll; once per client is enough to see it.
  let badOriginLogged = false

  const onError = (error: unknown, fromMaindata: boolean) => {
    // The container answered this maindata call: home and qBittorrent are
    // reachable, whatever else went wrong.
    if (
      fromMaindata &&
      isAppError(error) &&
      !isConnectionCode(error.code) &&
      error.code !== 'timeout'
    ) {
      clearUnreachable()
    }
    if (isLoginStop(error)) {
      // The container answered (spec 1.7 row LA4): any recorded Cloudflare
      // or unreachable code is out of date.
      clearConnectionErrors()
      markLoginRequired(error.code, currentPath())
      void client.cancelQueries()
      return
    }
    if (isAppError(error) && isConnectionCode(error.code)) {
      markConnectionError(error.code)
      return
    }
    // The container gave up on a hung qBittorrent: for the torrent list that
    // is "qBittorrent not responding". An operation's timeout stays with
    // that operation's own failure handling.
    if (isAppError(error) && error.code === 'timeout' && fromMaindata) {
      markConnectionError('qbit_unreachable')
      return
    }
    if (isAppError(error) && error.code === 'bad_origin' && !badOriginLogged) {
      // A programming error (gate rejected our own request), not a user state.
      badOriginLogged = true
      console.error('bad_origin: the server gate rejected a request', error)
    }
  }

  const client: QueryClient = new QueryClient({
    queryCache: new QueryCache({
      onError: (error, query) =>
        onError(error, query.queryHash === MAINDATA_HASH),
      onSuccess: (_data, query) => {
        if (query.queryHash === MAINDATA_HASH) clearConnectionErrors()
      },
    }),
    mutationCache: new MutationCache({
      onError: (error) => onError(error, false),
    }),
    defaultOptions: {
      queries: {
        retry: (failureCount, error) =>
          isAppError(error) &&
          RETRY_CODES.has(error.code) &&
          failureCount < MAX_QUERY_RETRIES,
        // While the login screen is needed, nothing refetches on its own.
        refetchOnWindowFocus: unlessLoginRequired,
        refetchOnReconnect: unlessLoginRequired,
        refetchOnMount: unlessLoginRequired,
      },
    },
  })

  if (fetchMaindata) {
    client.setQueryDefaults(MAINDATA_KEY, maindataQueryDefaults(fetchMaindata))
  }

  // The server builds a router (and so a client) for every request, /healthz
  // included, and the store lives as long as the process: a subscription here
  // would keep every one of those clients alive. Nothing polls on the server.
  if (typeof window === 'undefined') return client

  // When login becomes required (polling stops) or is cleared (polling
  // resumes), make every observer re-read `pollInterval` now: an observer
  // only recomputes `refetchInterval` when its options are set.
  loginStore.subscribe(() => {
    for (const query of client.getQueryCache().getAll()) {
      for (const observer of query.observers) {
        observer.setOptions(observer.options)
      }
    }
  })
  return client
}
