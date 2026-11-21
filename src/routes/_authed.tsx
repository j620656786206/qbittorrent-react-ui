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
import { AddScreen } from '#/features/add/add-screen'
import { DropOverlay } from '#/features/add/drop-overlay'
import { AppShell } from '#/features/header/app-shell'
import { requireSession } from '#/features/login/require-session'
import { ChangePathScreen } from '#/features/path/change-path-screen'
import { setLocationOp } from '#/features/path/set-location-op'
import { sessionQueryOptions } from '#/features/login/session-query'
import { categoryTabs, resolveCategory } from '#/lib/category-tabs'
import type { Maindata } from '#/lib/maindata-merge'
import { showsRememberedHint } from '#/lib/remembered-hint'
import type { SortChange } from '#/lib/remembered-hint'
import { nameMatches, searchNeedle } from '#/lib/name-search'
import { rememberedSortOf, sameSort } from '#/lib/remembered-sort'
import { inCategory } from '#/lib/visible-torrents'
import { addCommonPath } from '#/server/functions/add-common-path'
import { setCategorySort } from '#/server/functions/set-category-sort'
import { setLocation } from '#/server/functions/set-location'
import { ALL } from '#/shared/categories'
import {
  DEFAULT_SORT_VIEW,
  categoryOfSearch,
  fixListSearch,
  listSearchSchema,
  normalizeSortView,
  searchWithCategory,
  searchWithHash,
  searchWithQuery,
  sortViewOf,
} from '#/shared/list-search'
import type { SortView } from '#/shared/list-search'
import { sortField } from '#/shared/sort-fields'
import type { Settings } from '#/shared/settings'
import { resetListScroll } from '#/shared/ui/main-scroll'
import { callFn } from '#/state/call-fn'
import { replayEntrance } from '#/state/entrance'
import { useDetailOutsideUpkeep } from '#/state/detail-outside'
import { CategoryTabsContext, ListViewContext } from '#/state/list-view'
import type { ListView } from '#/state/list-view'
import { loginStore } from '#/state/login-required'
import { MAINDATA_KEY, useCategoryCounts } from '#/state/maindata'
import { useMoveOutcomes } from '#/state/move-outcomes'
import { useOpenWhenAddedUpkeep } from '#/state/open-when-added'
import { useFollowRememberedSort } from '#/state/remembered-sort'
import { useResumeLastPlace } from '#/state/resume-last-place'
import { useSearchOpen } from '#/state/search-open'
import { addCommonPathOp, categorySortOp, useSettings } from '#/state/settings'
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
// Story 3.3: `/settings` sits under this layout too (header as usual). The
// 設定 button opens it with the list's search in its URL and `fromList`
// in the history entry's state, so on `/settings` the header shows that
// list (its category tab and its sort) from the same URL, and the page's
// back button returns to it. The list setters (sort, category, viewed
// torrent) always write `/` on top of the current search, so a tab click
// (the pressed one too) or a sort pick on the settings page lands on the
// list, and a pick saves under that list's category. The follow rule only
// runs on the list: off it, a change made meanwhile is judged when the
// list is back.
// https://tanstack.com/router/latest/docs/framework/react/guide/navigation
// Story 3.5: `q`, the search keyword, in the URL too (trimmed; written with
// `replace`, removed when empty), in the view as `query` so the selectors
// filter by it. Typing writes the list's URL (like the other setters); a
// category switch keeps the keyword (and the box), and so does the settings
// page round trip (the whole list search rides along). Whether the box is
// open: src/state/search-open.ts.
// Story 3.6: the open-time restore and the record of where Alex was, on
// this device: src/state/resume-last-place.ts. The list and the board keep
// their skeleton while it restores (`viewReady`); a tab click cancels it.
// https://tanstack.com/router/latest/docs/framework/react/guide/search-params
// Story 4.6: the add screen and the desktop drop overlay are mounted here,
// over every page of the layout (features/add, opened through
// src/state/add-open.ts); a torrent its 「打開」 shows from outside the list
// is tracked against the URL's `hash` (src/state/detail-outside.ts).
// Story 5.2: the change-path screen is mounted here too (features/path,
// opened through src/state/change-path-open.ts), with the bound
// `setLocation` and `addCommonPath` calls. Story 5.3: the move outcome
// toasts (src/state/move-outcomes.ts) run here, their 重試 bound to the
// same move op.
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
const moveOp = setLocationOp((values) => callFn(setLocation, values))

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
  onList: boolean
  settingsOpen: boolean
}

/** The list route's path. */
const LIST_PATH = '/'
/** Story 3.3: the settings page's path. */
const SETTINGS_PATH = '/settings'

function AuthedLayout() {
  const navigate = useNavigate()
  const client = useQueryClient()
  const { settings, ready } = useSettings()
  const { data: counts } = useCategoryCounts()
  // The search as typed in the address bar, before validation.
  const rawSearch = useLocation({ select: (location) => location.search })
  const searchStr = useLocation({ select: (location) => location.searchStr })
  const onList = useLocation({
    select: (location) => location.pathname === LIST_PATH,
  })
  const settingsOpen = useLocation({
    select: (location) => location.pathname === SETTINGS_PATH,
  })
  // The search validated from the same location as `onList` (the route's
  // own search can lag one commit behind the path while history moves).
  // On the settings page it is the list Alex came from.
  const listSearch = useMemo(
    () => listSearchSchema.parse(rawSearch),
    [rawSearch],
  )
  const { sort, dir, hash, category: urlCategory } = listSearch
  const requestedCategory = categoryOfSearch({ category: urlCategory })

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
    requested: requestedCategory,
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

  const restoreTo = useCallback(
    (target: string, targetView: SortView) =>
      navigate({
        to: LIST_PATH,
        // Written as fixListSearch would leave it: no `dir` for 「狀態」.
        search: (previous) => {
          const { dir: _dir, ...rest } = searchWithCategory(previous, target)
          return sortField(targetView.sort).directional
            ? { ...rest, sort: targetView.sort, dir: targetView.dir }
            : { ...rest, sort: targetView.sort }
        },
        replace: true,
        resetScroll: false,
      }),
    [navigate],
  )
  const {
    restoring,
    cancel: cancelRestore,
    noteHashWrite,
  } = useResumeLastPlace({
    searchStr,
    onList,
    ready,
    settings,
    counts,
    requestedCategory,
    category,
    hash,
    restoreTo,
  })
  // Off the list nothing waits on the restore (the settings page's header).
  const viewReady = ready && !(restoring && onList)

  const remembered = rememberedSortOf(settings, category)
  // Only a URL without `sort` reads the remembered sort, so with `sort` a
  // settings answer keeps `view` (and the visible list) as it is.
  const rememberedForView = sort === undefined ? remembered : null

  const writeQuery = useCallback(
    (text: string) => {
      void navigate({
        to: LIST_PATH,
        search: (previous) => searchWithQuery(previous, text) as never,
        replace: true,
        resetScroll: false,
      })
    },
    [navigate],
  )
  const removeQuery = useCallback(() => {
    // The page stays (the settings page keeps showing its list without it).
    void navigate({
      to: '.',
      search: (previous) => searchWithQuery(previous, '') as never,
      replace: true,
      resetScroll: false,
    })
  }, [navigate])
  const {
    query,
    open: searchOpen,
    openSearch,
    setQuery,
    closeSearch,
  } = useSearchOpen({
    query: listSearch.q ?? '',
    onList,
    writeQuery,
    removeQuery,
    resetScroll: resetListScroll,
  })

  const view = useMemo<ListView>(
    () => ({
      ...sortViewOf({ sort, dir }, rememberedForView),
      category,
      query,
    }),
    [sort, dir, rememberedForView, category, query],
  )

  const latestRef = useRef<Latest>({
    category,
    settings,
    hash,
    view,
    onList,
    settingsOpen,
  })
  useLayoutEffect(() => {
    latestRef.current = {
      category,
      settings,
      hash,
      view,
      onList,
      settingsOpen,
    }
  })

  const rememberedHint =
    showsRememberedHint(sortChange) &&
    sortChange.category === category &&
    sameSort(view, sortChange.after)

  const setView = useCallback(
    (next: SortView) => {
      void navigate({
        to: LIST_PATH,
        search: (previous) => ({
          ...previous,
          sort: next.sort,
          dir: next.dir,
        }),
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
      cancelRestore()
      if (next === latest.category) {
        // On the settings page the pressed tab goes back to the list as
        // it was (its sort too); on the list it does nothing.
        if (!latest.onList) {
          void navigate({
            to: LIST_PATH,
            search: (previous) => previous,
            replace: true,
            resetScroll: false,
          })
        }
        return
      }
      const nextRemembered = rememberedSortOf(latest.settings, next)
      const nextView = nextRemembered
        ? normalizeSortView(nextRemembered)
        : DEFAULT_SORT_VIEW
      // The viewed torrent stays only when the new category holds it (and
      // its name holds the keyword).
      const torrents = client.getQueryData<Maindata>(MAINDATA_KEY)?.torrents
      const viewed = latest.hash
      const keepHash =
        viewed !== undefined &&
        torrents !== undefined &&
        Object.hasOwn(torrents, viewed) &&
        inCategory(torrents[viewed], next) &&
        nameMatches(torrents[viewed], searchNeedle(latest.view.query))
      setSortChange({
        before: { sort: latest.view.sort, dir: latest.view.dir },
        after: nextView,
        cause: nextRemembered ? 'category-switch' : 'category-default',
        category: next,
      })
      replayRef.current = next
      resetListScroll()
      void navigate({
        to: LIST_PATH,
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
    [client, navigate, cancelRestore],
  )

  const follow = useCallback(
    (next: SortView) => {
      if (!latestRef.current.onList) return
      resetListScroll()
      setView(next)
      // Another device's sort is not this category's switch: no hint.
      setSortChange(OPENED)
    },
    [setView],
  )
  useFollowRememberedSort(remembered, view, ready, follow, category, onList)

  const openSettings = useCallback(() => {
    const latest = latestRef.current
    if (latest.settingsOpen) return
    // The list's search rides along; `fromList` says the entry before is
    // that list (the back button then goes back instead of adding a copy).
    void navigate({
      to: SETTINGS_PATH,
      search: (previous) => previous,
      state: (previous) => ({ ...previous, fromList: latest.onList }),
    })
  }, [navigate])

  const control = useMemo(
    () => ({
      view,
      viewReady,
      setView,
      pickView,
      selectCategory,
      rememberedHint,
      openSettings,
      settingsOpen,
      searchOpen,
      openSearch,
      setQuery,
      closeSearch,
    }),
    [
      view,
      viewReady,
      setView,
      pickView,
      selectCategory,
      rememberedHint,
      openSettings,
      settingsOpen,
      searchOpen,
      openSearch,
      setQuery,
      closeSearch,
    ],
  )

  // The tab order waits for the settings (and the restore) like the list.
  const categoryOrder = settings?.categoryOrder
  const tabs = useMemo(
    () =>
      counts === undefined || !viewReady
        ? undefined
        : categoryTabs({
            counts,
            categoryOrder: categoryOrder ?? [],
            selected: category,
          }),
    [counts, viewReady, categoryOrder, category],
  )

  const writeHash = useCallback(
    (next: string | null, chosen: boolean) => {
      noteHashWrite(next, chosen)
      void navigate({
        to: LIST_PATH,
        search: (previous) => searchWithHash(previous, next) as never,
        replace: true,
        // The detail never moves the list or the board.
        resetScroll: false,
      })
    },
    [navigate, noteHashWrite],
  )
  const setHash = useCallback(
    (next: string | null) => writeHash(next, true),
    [writeHash],
  )
  const followHash = useCallback(
    (next: string | null) => writeHash(next, false),
    [writeHash],
  )
  const viewed = useMemo(
    () => ({ hash: hash ?? null, setHash, followHash }),
    [hash, setHash, followHash],
  )
  useDetailOutsideUpkeep(hash ?? null)
  // Story 4.7: 「去看」 outlives the add screen.
  useOpenWhenAddedUpkeep(category, hash ?? null, setHash)
  // Story 5.3: 「沒有搬到 …」's 重試 sends the same hash and target.
  const resendMove = useCallback(
    (moved: string, target: string) => {
      void sendOp(moveOp, client, { hashes: [moved], location: target })
    },
    [client],
  )
  useMoveOutcomes(resendMove)
  // The op reads how many common paths are listed for its failure text.
  const addPathOp = useMemo(
    () => addCommonPathOp((values) => callFn(addCommonPath, values), client),
    [client],
  )

  return (
    <ListViewContext value={control}>
      <CategoryTabsContext value={tabs}>
        <ViewedHashContext value={viewed}>
          <AppShell>
            <Outlet />
          </AppShell>
          <AddScreen />
          <ChangePathScreen moveOp={moveOp} addPathOp={addPathOp} />
          <DropOverlay />
        </ViewedHashContext>
      </CategoryTabsContext>
    </ListViewContext>
  )
}
