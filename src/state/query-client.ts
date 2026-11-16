import { MutationCache, QueryCache, QueryClient } from '@tanstack/react-query'
import { isAppError, isLoginStopCode } from '#/lib/app-error'
import type { AppError, LoginStopReason } from '#/lib/app-error'
import type { ErrorCode } from '#/shared/errors'
import {
  isLoginRequired,
  loginStore,
  markLoginRequired,
} from '#/state/login-required'

// AR-35, AD-9: one QueryClient per router. The global `onError` is the only
// place that handles the login-stop codes and `bad_origin`; story 1.7 reads
// the connection codes from query state.

export interface RouterContext {
  queryClient: QueryClient
}

export interface CreateQueryClientOptions {
  /** Where to return after login. Defaults to the current same-site URL. */
  currentPath?: () => string
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

/** While the login screen is needed, nothing refetches on its own. */
const unlessLoginRequired = () => !isLoginRequired()

export function createQueryClient({
  currentPath = locationPath,
}: CreateQueryClientOptions = {}): QueryClient {
  const onError = (error: unknown) => {
    if (isLoginStop(error)) {
      markLoginRequired(error.code, currentPath())
      void client.cancelQueries()
      return
    }
    if (isAppError(error) && error.code === 'bad_origin') {
      // A programming error (gate rejected our own request), not a user state.
      console.error('bad_origin: the server gate rejected a request', error)
    }
  }

  const client: QueryClient = new QueryClient({
    queryCache: new QueryCache({ onError }),
    mutationCache: new MutationCache({ onError }),
    defaultOptions: {
      queries: {
        retry: (failureCount, error) =>
          isAppError(error) &&
          RETRY_CODES.has(error.code) &&
          failureCount < MAX_QUERY_RETRIES,
        refetchOnWindowFocus: unlessLoginRequired,
        refetchOnReconnect: unlessLoginRequired,
        refetchOnMount: unlessLoginRequired,
      },
    },
  })

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
