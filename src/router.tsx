import { QueryClientProvider } from '@tanstack/react-query'
import { createRouter as createTanStackRouter } from '@tanstack/react-router'
import { getGlobalStartContext } from '@tanstack/react-start'
import { routeTree } from './routeTree.gen'
import { watchLoginRequired } from '#/features/login/watch-login-required'
import { getErrorReasons } from '#/server/functions/get-error-reasons'
import { getMaindata } from '#/server/functions/get-maindata'
import { getSettings } from '#/server/functions/get-settings'
import { bindFetchErrorReasons } from '#/state/error-reasons'
import { bindFetchMaindata } from '#/state/maindata'
import { noteOpeningSearch } from '#/state/opening-search'
import { bindFetchSettings } from '#/state/settings'
import { createQueryClient } from '#/state/query-client'

// AD-10: the request middleware's per-request CSP nonce goes on Start's inline
// scripts. It must be passed here, at router creation (TanStack/router#8789).
// On the client getGlobalStartContext() is undefined.
function cspNonce(): string | undefined {
  try {
    return getGlobalStartContext()?.cspNonce
  } catch {
    // Server code outside a request (no global context yet).
    return undefined
  }
}

export function getRouter() {
  // src/state may not import server functions, so the maindata, error
  // reason and settings calls are bound here. This import is also what bundles
  // getMaindata (smoke B9, B10).
  const queryClient = createQueryClient({
    fetchMaindata: bindFetchMaindata(getMaindata),
    fetchErrorReasons: bindFetchErrorReasons(getErrorReasons),
    fetchSettings: bindFetchSettings(getSettings),
  })
  const router = createTanStackRouter({
    routeTree,
    context: { queryClient },
    Wrap: ({ children }) => (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    ),
    scrollRestoration: true,
    defaultPreload: 'intent',
    defaultPreloadStaleTime: 0,
    ssr: { nonce: cspNonce() },
  })

  // Browser only, so server renders add no subscription to the module-level store.
  if (typeof window !== 'undefined') {
    watchLoginRequired(router)
    noteOpeningSearch(router)
  }

  return router
}

declare module '@tanstack/react-router' {
  interface Register {
    router: ReturnType<typeof getRouter>
  }
}

// Story 3.3: the 設定 button marks the settings page's history entry: the
// entry before it is the list (the page's back button goes back to it).
// https://tanstack.com/router/latest/docs/framework/react/guide/navigation
declare module '@tanstack/history' {
  interface HistoryState {
    fromList?: boolean
  }
}
