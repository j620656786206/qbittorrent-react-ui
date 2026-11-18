import { useCallback, useEffect, useMemo } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import {
  Outlet,
  createFileRoute,
  useLocation,
  useNavigate,
} from '@tanstack/react-router'
import { AppShell } from '#/features/header/app-shell'
import { requireSession } from '#/features/login/require-session'
import { sessionQueryOptions } from '#/features/login/session-query'
import { rememberedSortOf } from '#/lib/remembered-sort'
import { setCategorySort } from '#/server/functions/set-category-sort'
import { ALL } from '#/shared/categories'
import {
  fixListSearch,
  listSearchSchema,
  searchWithHash,
  sortViewOf,
} from '#/shared/list-search'
import type { SortView } from '#/shared/list-search'
import { resetListScroll } from '#/shared/ui/main-scroll'
import { callFn } from '#/state/call-fn'
import { ListViewContext } from '#/state/list-view'
import { loginStore } from '#/state/login-required'
import { useFollowRememberedSort } from '#/state/remembered-sort'
import { categorySortOp, useSettings } from '#/state/settings'
import { sendOp } from '#/state/tracked-op'
import { ViewedHashContext } from '#/state/viewed-hash'

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
// with `replace`; every sort change also uses `replace`. Story 2.4: the
// viewed torrent's `hash` too; opening, switching and closing the detail
// write it with `replace` and `resetScroll: false`, a sort change keeps it.
// https://tanstack.com/router/latest/docs/framework/react/guide/search-params
// Story 3.1 (AD-8, AD-13): 「全部」 remembers its sort in settings.json. A URL
// without `sort` shows the remembered one (else 「狀態」); a manual pick
// writes the URL and saves it (`setCategorySort` through `sendOp`); any
// later settings answer that changes the sort on screen (another device's
// change on window focus, or the remembered value of a URL without `sort`
// appearing or going) writes it with `replace` and scrolls to the top. The list and the
// board keep their skeleton until the settings answered (`viewReady`).
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

const saveSortOp = categorySortOp((values) => callFn(setCategorySort, values))

function AuthedLayout() {
  const { sort, dir, hash } = Route.useSearch()
  const navigate = useNavigate()
  const client = useQueryClient()
  const { settings, ready } = useSettings()
  // The only category until story 3.2 adds the tabs.
  const remembered = rememberedSortOf(settings, ALL)
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

  // Only a URL without `sort` reads the remembered sort, so with `sort` a
  // settings answer keeps `view` (and the visible list) as it is.
  const rememberedForView = sort === undefined ? remembered : null
  const view = useMemo(
    () => sortViewOf({ sort, dir }, rememberedForView),
    [sort, dir, rememberedForView],
  )
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
  const pickView = useCallback(
    (next: SortView) => {
      setView(next)
      sendOp(saveSortOp, client, {
        category: ALL,
        sort: next.sort,
        dir: next.dir,
      })
    },
    [setView, client],
  )
  const follow = useCallback(
    (next: SortView) => {
      resetListScroll()
      setView(next)
    },
    [setView],
  )
  useFollowRememberedSort(remembered, view, ready, follow)
  const control = useMemo(
    () => ({ view, viewReady: ready, setView, pickView }),
    [view, ready, setView, pickView],
  )

  const setHash = useCallback(
    (next: string | null) => {
      void navigate({
        to: '.',
        search: (previous) => searchWithHash(previous, next) as never,
        replace: true,
        // The detail never moves the list or the board.
        resetScroll: false,
      })
    },
    [navigate],
  )
  const viewed = useMemo(
    () => ({ hash: hash ?? null, setHash }),
    [hash, setHash],
  )

  return (
    <ListViewContext value={control}>
      <ViewedHashContext value={viewed}>
        <AppShell>
          <Outlet />
        </AppShell>
      </ViewedHashContext>
    </ListViewContext>
  )
}
