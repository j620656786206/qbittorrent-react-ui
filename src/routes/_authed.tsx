import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
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
import { categoryTabs, resolveCategory } from '#/lib/category-tabs'
import type { Maindata } from '#/lib/maindata-merge'
import { showsRememberedHint } from '#/lib/remembered-hint'
import type { SortChange } from '#/lib/remembered-hint'
import { rememberedSortOf, sameSort } from '#/lib/remembered-sort'
import { inCategory } from '#/lib/visible-torrents'
import { setCategorySort } from '#/server/functions/set-category-sort'
import { ALL } from '#/shared/categories'
import {
  DEFAULT_SORT_VIEW,
  categoryOfSearch,
  fixListSearch,
  listSearchSchema,
  normalizeSortView,
  searchWithCategory,
  searchWithHash,
  sortViewOf,
} from '#/shared/list-search'
import type { SortView } from '#/shared/list-search'
import type { Settings } from '#/shared/settings'
import { resetListScroll } from '#/shared/ui/main-scroll'
import { callFn } from '#/state/call-fn'
import { replayEntrance } from '#/state/entrance'
import { CategoryTabsContext, ListViewContext } from '#/state/list-view'
import type { ListView } from '#/state/list-view'
import { loginStore } from '#/state/login-required'
import { MAINDATA_KEY, useCategoryCounts } from '#/state/maindata'
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
// Story 3.2: `category` in the URL too (absent is 「全部」), resolved against
// the torrents present (resolveCategory): a category no torrent has falls
// back to 「全部」 and the URL is fixed with `replace` once maindata has
// answered, except the selected one emptying on screen, which keeps its
// tab. A tab click writes `category` and that category's remembered sort
// (else 「狀態」) with `replace`, scrolls to the top and replays the entrance
// (story 2.9) from a layout effect keyed on the category, after the new
// rows committed. Who changed the sort last (open, category switch, manual
// pick) decides the 「（這個分類記住的）」 hint (showsRememberedHint). A
// manual pick saves the current category's sort, and the follow rule
// watches the current category's remembered value.
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

/** A sort change and the category it happened on (`null`: none). */
type SortChangeOn = SortChange & { category: string | null }

const OPENED: SortChangeOn = {
  before: null,
  after: null,
  cause: 'open',
  category: null,
}

/** The layout's latest values, for callbacks that stay stable. */
interface Latest {
  category: string
  settings: Settings | undefined
  hash: string | undefined
  view: ListView
}

function AuthedLayout() {
  const { sort, dir, hash, category: urlCategory } = Route.useSearch()
  const navigate = useNavigate()
  const client = useQueryClient()
  const { settings, ready } = useSettings()
  const { data: counts } = useCategoryCounts()
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

  // The category confirmed on screen (it keeps its tab once it empties).
  const confirmedRef = useRef<string | null>(null)
  const resolved = resolveCategory({
    requested: categoryOfSearch({ category: urlCategory }),
    counts,
    confirmed: confirmedRef.current,
  })
  const { category, invalid } = resolved
  useLayoutEffect(() => {
    confirmedRef.current = resolved.confirmed
  })
  // Who changed the sort last, and for which category (the hint shows only
  // on the category a tab click switched to).
  const [sortChange, setSortChange] = useState<SortChangeOn>(OPENED)
  // The category a tab click switched to; the layout effect below replays
  // the entrance once that category's rows have committed
  // (src/state/entrance.ts). Any other category change (a fallback to
  // 「全部」) only drops it.
  const replayRef = useRef<string | null>(null)

  useEffect(() => {
    if (!invalid) return
    // Not a click: no hint, no replay left waiting.
    setSortChange(OPENED)
    replayRef.current = null
    void navigate({
      to: '.',
      search: (previous) => searchWithCategory(previous, ALL) as never,
      replace: true,
      resetScroll: false,
    })
  }, [invalid, navigate])

  const remembered = rememberedSortOf(settings, category)
  // Only a URL without `sort` reads the remembered sort, so with `sort` a
  // settings answer keeps `view` (and the visible list) as it is.
  const rememberedForView = sort === undefined ? remembered : null
  const view = useMemo<ListView>(
    () => ({ ...sortViewOf({ sort, dir }, rememberedForView), category }),
    [sort, dir, rememberedForView, category],
  )
  const latestRef = useRef<Latest>({ category, settings, hash, view })
  useLayoutEffect(() => {
    latestRef.current = { category, settings, hash, view }
  })

  const rememberedHint =
    showsRememberedHint(sortChange) &&
    sortChange.category === category &&
    sameSort(view, sortChange.after)

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
      const { category: current } = latestRef.current
      setSortChange({
        before: null,
        after: null,
        cause: 'manual',
        category: current,
      })
      sendOp(saveSortOp, client, {
        category: current,
        sort: next.sort,
        dir: next.dir,
      })
    },
    [setView, client],
  )

  useLayoutEffect(() => {
    const target = replayRef.current
    replayRef.current = null
    if (target === category) replayEntrance()
  }, [category])

  const selectCategory = useCallback(
    (next: string) => {
      const latest = latestRef.current
      if (next === latest.category) return
      const nextRemembered = rememberedSortOf(latest.settings, next)
      const nextView = nextRemembered
        ? normalizeSortView(nextRemembered)
        : DEFAULT_SORT_VIEW
      // The viewed torrent stays only when the new category holds it.
      const torrents = client.getQueryData<Maindata>(MAINDATA_KEY)?.torrents
      const viewed = latest.hash
      const keepHash =
        viewed !== undefined &&
        torrents !== undefined &&
        Object.hasOwn(torrents, viewed) &&
        inCategory(torrents[viewed], next)
      setSortChange({
        before: { sort: latest.view.sort, dir: latest.view.dir },
        after: nextView,
        cause: nextRemembered ? 'category-switch' : 'category-default',
        category: next,
      })
      replayRef.current = next
      resetListScroll()
      void navigate({
        to: '.',
        search: (previous) => {
          const withCategory = searchWithCategory(previous, next)
          const search = keepHash
            ? withCategory
            : searchWithHash(withCategory, null)
          return { ...search, sort: nextView.sort, dir: nextView.dir }
        },
        replace: true,
        resetScroll: false,
      })
    },
    [client, navigate],
  )

  const follow = useCallback(
    (next: SortView) => {
      resetListScroll()
      setView(next)
      // Another device's sort is not this category's switch: no hint.
      setSortChange(OPENED)
    },
    [setView],
  )
  useFollowRememberedSort(remembered, view, ready, follow, category)
  const control = useMemo(
    () => ({
      view,
      viewReady: ready,
      setView,
      pickView,
      selectCategory,
      rememberedHint,
    }),
    [view, ready, setView, pickView, selectCategory, rememberedHint],
  )

  // The tab order waits for the settings like the list does.
  const categoryOrder = settings?.categoryOrder
  const tabs = useMemo(
    () =>
      counts === undefined || !ready
        ? undefined
        : categoryTabs({
            counts,
            categoryOrder: categoryOrder ?? [],
            selected: category,
          }),
    [counts, ready, categoryOrder, category],
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
      <CategoryTabsContext value={tabs}>
        <ViewedHashContext value={viewed}>
          <AppShell>
            <Outlet />
          </AppShell>
        </ViewedHashContext>
      </CategoryTabsContext>
    </ListViewContext>
  )
}
