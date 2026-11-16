import { QueryClientProvider } from '@tanstack/react-query'
import { createRouter as createTanStackRouter } from '@tanstack/react-router'
import { getGlobalStartContext } from '@tanstack/react-start'
import { routeTree } from './routeTree.gen'
import { watchLoginRequired } from '#/features/login/watch-login-required'
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
  const queryClient = createQueryClient()
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
  if (typeof window !== 'undefined') watchLoginRequired(router)

  return router
}

declare module '@tanstack/react-router' {
  interface Register {
    router: ReturnType<typeof getRouter>
  }
}
