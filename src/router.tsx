import { QueryClientProvider } from '@tanstack/react-query'
import { createRouter as createTanStackRouter } from '@tanstack/react-router'
import { getGlobalStartContext } from '@tanstack/react-start'
import { routeTree } from './routeTree.gen'
import { watchLoginRequired } from '#/features/login/watch-login-required'
import { releaseVelocity, settleSheet, sheetRestHeight } from '#/lib/sheet-snap'
import { getMaindata } from '#/server/functions/get-maindata'
import type { SheetRuntime } from '#/shared/sheet'
import { SheetRuntimeContext } from '#/shared/ui/bottom-sheet'
import { bindFetchMaindata } from '#/state/maindata'
import { holdOrderForSheet } from '#/state/order-freeze'
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

// Story 2.2: src/shared may not import src/lib or src/state, so the bottom
// sheet's snap decisions and its order freeze are bound here.
const SHEET_RUNTIME: SheetRuntime = {
  restHeight: sheetRestHeight,
  settle: settleSheet,
  releaseVelocity,
  holdOrder: holdOrderForSheet,
}

export function getRouter() {
  // src/state may not import server functions, so the maindata call is bound
  // here. This import is also what bundles getMaindata (smoke B9, B10).
  const queryClient = createQueryClient({
    fetchMaindata: bindFetchMaindata(getMaindata),
  })
  const router = createTanStackRouter({
    routeTree,
    context: { queryClient },
    Wrap: ({ children }) => (
      <QueryClientProvider client={queryClient}>
        <SheetRuntimeContext value={SHEET_RUNTIME}>
          {children}
        </SheetRuntimeContext>
      </QueryClientProvider>
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
