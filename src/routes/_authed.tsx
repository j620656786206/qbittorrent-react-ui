import { useCallback, useEffect, useMemo } from 'react'
import {
  Outlet,
  createFileRoute,
  useLocation,
  useNavigate,
} from '@tanstack/react-router'
import { AppShell } from '#/features/header/app-shell'
import { requireSession } from '#/features/login/require-session'
import { sessionQueryOptions } from '#/features/login/session-query'
import {
  fixListSearch,
  listSearchSchema,
  sortViewOf,
} from '#/shared/list-search'
import type { SortView } from '#/shared/list-search'
import { ListViewContext } from '#/state/list-view'
import { loginStore } from '#/state/login-required'

// Every page that shows data sits under this pathless layout (Start auth
// guide). `ssr: false`: the built server would run beforeLoad without the
// gate's context and always see "not logged in"; client-only keeps dev and
// prod the same.
// https://tanstack.com/start/latest/docs/framework/react/guide/authentication
// https://tanstack.com/start/latest/docs/framework/react/guide/selective-ssr
// The layout is the app shell (story 1.7): header, speeds, alert bar and the
// scrolling `main` the child route renders into.
// https://tanstack.com/router/latest/docs/framework/react/routing/routing-concepts
// Story 2.1, AD-13: the list's `sort` and `dir` live in the URL. A bad value
// reads as missing (the schema's `.catch`), and the address bar is fixed
// with `replace`; every sort change also uses `replace`.
// https://tanstack.com/router/latest/docs/framework/react/guide/search-params
export const Route = createFileRoute('/_authed')({
  ssr: false,
  validateSearch: listSearchSchema,
  beforeLoad: ({ context, location }) =>
    requireSession({
      location,
      loginRequired: loginStore.state.loginRequired,
      fetchSession: () => context.queryClient.fetchQuery(sessionQueryOptions()),
    }),
  component: AuthedLayout,
})

function AuthedLayout() {
  const { sort, dir } = Route.useSearch()
  const navigate = useNavigate()
  // The search as typed in the address bar, before validation.
  const rawSearch = useLocation({ select: (location) => location.search })

  useEffect(() => {
    const fixed = fixListSearch(rawSearch)
    if (fixed) {
      void navigate({
        to: '.',
        search: fixed as never,
        replace: true,
        resetScroll: false,
      })
    }
  }, [rawSearch, navigate])

  const view = useMemo(() => sortViewOf({ sort, dir }), [sort, dir])
  const setView = useCallback(
    (next: SortView) => {
      void navigate({
        to: '.',
        search: (previous) => ({ ...previous, sort: next.sort, dir: next.dir }),
        replace: true,
        // The sort menu puts `main` back at the top itself; the router's
        // scroll restoration would put back the position it saved before.
        resetScroll: false,
      })
    },
    [navigate],
  )
  const control = useMemo(() => ({ view, setView }), [view, setView])

  return (
    <ListViewContext value={control}>
      <AppShell>
        <Outlet />
      </AppShell>
    </ListViewContext>
  )
}
