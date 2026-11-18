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
import { nameMatches, searchNeedle } from '#/lib/name-search'
import { readPref, withViewedHash, writePref } from '#/lib/prefs'
import { rememberedSortOf, sameSort } from '#/lib/remembered-sort'
import { inCategory, listsIn } from '#/lib/visible-torrents'
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
  searchWithQuery,
  sortViewOf,
} from '#/shared/list-search'
import type { SortView } from '#/shared/list-search'
import { sortField } from '#/shared/sort-fields'
import type { Settings } from '#/shared/settings'
import { resetListScroll } from '#/shared/ui/main-scroll'
import { callFn } from '#/state/call-fn'
import { replayEntrance } from '#/state/entrance'
import { CategoryTabsContext, ListViewContext } from '#/state/list-view'
import type { ListView } from '#/state/list-view'
import { loginStore } from '#/state/login-required'
import { MAINDATA_KEY, useCategoryCounts } from '#/state/maindata'
import { useMaindataFailure } from '#/state/maindata-failure'
import { forgetOpeningSearch, openingSearch } from '#/state/opening-search'
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
// filter by it. The search box is open while a keyword is set (a reload
// with `q` opens it) and from the magnifier or `/` until ✕, 「取消」 or
// `Esc` closes it, which also removes `q`. Typing writes the list's URL
// (like the other setters) and puts the list back at the top; a category
// switch keeps the keyword (and the box), and so does the settings page
// round trip (the whole list search rides along).
// Story 3.6: this device remembers where Alex was (src/lib/prefs.ts, never
// the NAS). On the list route, once maindata has answered, every category
// on screen is stored as `lastCategory`, and a `hash` in the URL as that
// category's entry of `lastViewedHash` when it is one of that category's
// rows (a stale or foreign link never replaces a good entry). The app
// opening on the list with a bare URL (no `category`, `sort` or `hash` key,
// valid or not; `q` alone is still bare) goes back to `lastCategory` with
// its remembered sort (else 「狀態」), written once with `replace` when
// maindata and the settings answered; a category no torrent has any more
// stays 「全部」 (the bare URL already shows 「全部」 with its remembered
// sort). The list and the board keep their skeleton until then
// (`viewReady`), so the first entrance is the restored category's and no
// other plays; it is no tab switch, so no hint. Off the list (the settings
// page) the restore waits and nothing is recorded; back on the list it
// runs if the URL is still bare. A place written meanwhile cancels it, and
// so does a first maindata request that failed (the usual error state
// shows; a late answer never jumps to another category).
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
  onList: boolean
  settingsOpen: boolean
}

/**
 * Story 3.6: the open-time restore. `pending`: waiting for maindata and the
 * settings to go to `category`; `navigating`: the URL is being written;
 * `done`: nothing (left) to restore.
 */
type Restore =
  | { step: 'pending'; category: string }
  | { step: 'navigating'; category: string }
  | { step: 'done' }

const RESTORED: Restore = { step: 'done' }

/**
 * Story 3.6: the search string names no place: no `category`, `sort` or
 * `hash` key, even an invalid one (`q` alone does not count).
 */
function isBareSearch(searchStr: string): boolean {
  const params = new URLSearchParams(searchStr)
  return !params.has('category') && !params.has('sort') && !params.has('hash')
}

/**
 * Story 3.6: what the app opening on `searchStr` has to restore. `opening`
 * is the search as typed (src/state/opening-search.ts), before the router
 * dropped invalid params.
 */
function initialRestore(
  searchStr: string,
  opening: string | null,
  onList: boolean,
): Restore {
  if (
    !onList ||
    !isBareSearch(searchStr) ||
    (opening !== null && !isBareSearch(opening))
  ) {
    return RESTORED
  }
  const category = readPref('lastCategory')
  // A bare URL already is 「全部」 with its remembered sort.
  return category === ALL ? RESTORED : { step: 'pending', category }
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
  const query = listSearch.q ?? ''
  const [restore, setRestore] = useState<Restore>(() =>
    initialRestore(searchStr, openingSearch(), onList),
  )
  useEffect(() => forgetOpeningSearch(), [])
  const restoring =
    restore.step === 'pending' ||
    (restore.step === 'navigating' &&
      categoryOfSearch({ category: urlCategory }) !== restore.category)

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

  const countsKnown = counts !== undefined
  const maindataFailure = useMaindataFailure()
  useEffect(() => {
    if (restore.step !== 'pending') return
    // The first maindata request failed: give up, never jump later.
    if (counts === undefined && maindataFailure !== null) {
      setRestore(RESTORED)
      return
    }
    // Off the list (the settings page) the restore waits.
    if (!onList || !ready || counts === undefined) return
    const target = restore.category
    // A place written meanwhile wins; a vanished category stays 「全部」.
    if (
      !isBareSearch(searchStr) ||
      resolveCategory({ requested: target, counts, confirmed: null }).invalid
    ) {
      setRestore(RESTORED)
      return
    }
    const targetRemembered = rememberedSortOf(settings, target)
    const targetView = targetRemembered
      ? normalizeSortView(targetRemembered)
      : DEFAULT_SORT_VIEW
    setRestore({ step: 'navigating', category: target })
    const finish = () => setRestore(RESTORED)
    void navigate({
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
    }).then(finish, finish)
  }, [
    restore,
    ready,
    counts,
    maindataFailure,
    onList,
    searchStr,
    settings,
    navigate,
  ])

  // Story 3.6: record where Alex is, on the list only, never mid-restore.
  useEffect(() => {
    if (!onList || restoring || !countsKnown) return
    writePref('lastCategory', category)
  }, [onList, restoring, countsKnown, category])
  useEffect(() => {
    if (!onList || restoring || !countsKnown || hash === undefined) return
    // Only one of this category's rows: in maindata, in the category, not
    // 已整理 (a stale or foreign link keeps the entry it has).
    const data = client.getQueryData<Maindata>(MAINDATA_KEY)
    if (
      data === undefined ||
      !Object.hasOwn(data.torrents, hash) ||
      !listsIn(data.torrents[hash], category, data.stateBeforeMove)
    ) {
      return
    }
    writePref(
      'lastViewedHash',
      withViewedHash(readPref('lastViewedHash'), category, hash),
    )
  }, [client, onList, restoring, countsKnown, category, hash])
  // Off the list nothing waits on the restore (the settings page's header).
  const viewReady = ready && !(restoring && onList)

  const remembered = rememberedSortOf(settings, category)
  // Only a URL without `sort` reads the remembered sort, so with `sort` a
  // settings answer keeps `view` (and the visible list) as it is.
  const rememberedForView = sort === undefined ? remembered : null
  const view = useMemo<ListView>(
    () => ({
      ...sortViewOf({ sort, dir }, rememberedForView),
      category,
      query,
    }),
    [sort, dir, rememberedForView, category, query],
  )

  // Open while a keyword is set; the magnifier or `/` opens it without one.
  const [searchOpened, setSearchOpened] = useState(query !== '')
  if (query !== '' && !searchOpened) setSearchOpened(true)
  const searchOpen = searchOpened || query !== ''
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
    [client, navigate],
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

  const openSearch = useCallback(() => setSearchOpened(true), [])
  const setQuery = useCallback(
    (text: string) => {
      setSearchOpened(true)
      // A new filter goes back to the top (EXPERIENCE 換篩選回到最上面).
      if (text.trim() !== latestRef.current.view.query) resetListScroll()
      // Always written: the view can lag behind a keystroke still on its
      // way to the URL, and the same search again changes nothing.
      void navigate({
        to: LIST_PATH,
        search: (previous) => searchWithQuery(previous, text) as never,
        replace: true,
        resetScroll: false,
      })
    },
    [navigate],
  )
  const closeSearch = useCallback(() => {
    setSearchOpened(false)
    if (latestRef.current.view.query !== '') resetListScroll()
    // The page stays (the settings page keeps showing its list without it).
    void navigate({
      to: '.',
      search: (previous) => searchWithQuery(previous, '') as never,
      replace: true,
      resetScroll: false,
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

  const setHash = useCallback(
    (next: string | null) => {
      void navigate({
        to: LIST_PATH,
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
