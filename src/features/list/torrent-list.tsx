import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from 'react'
import type { ReactNode } from 'react'
import { useVirtualizer } from '@tanstack/react-virtual'
import { detailPosition } from '#/lib/detail-position'
import { noResultText } from '#/lib/name-search'
import type { SortKeys } from '#/lib/visible-torrents'
import { ALL } from '#/shared/categories'
import { getSortKeys } from '#/server/functions/get-sort-keys'
import { isExtraSortField } from '#/shared/sort-fields'
import type { SortFieldId } from '#/shared/sort-fields'
import { useIsDesktop } from '#/shared/ui/breakpoint'
import { LIST_SCROLL_ID } from '#/shared/ui/main-scroll'
import { useEmptyEntrance, useEntrance } from '#/state/entrance'
import { useErrorReasons } from '#/state/error-reasons'
import { useListView, viewKeyOf } from '#/state/list-view'
import { useListViewed } from '#/state/list-viewed'
import {
  selectStateBeforeMove,
  selectTorrents,
  useMaindata,
  useMatchCount,
  useVisibleTorrents,
} from '#/state/maindata'
import { useMaindataFailure } from '#/state/maindata-failure'
import { useMaindataRetry } from '#/state/maindata-retry'
import { useDayClock } from '#/state/now'
import {
  noteScroll,
  resetListFreeze,
  setPointerInList,
  touchScrollEnd,
  touchScrollStart,
  useFrozenOrder,
} from '#/state/order-freeze'
import { focusedElement, useShortcutAction } from '#/state/shortcuts'
import { usePublishShownList } from '#/state/shown-order'
import { bindFetchSortKeys, useSortKeys } from '#/state/sort-keys'
import { useViewedHash } from '#/state/viewed-hash'
import {
  ROW_GAP,
  ROW_HEIGHT,
  listView,
  rowClock,
  rowProps,
} from '#/features/list/list-model'
import {
  LIST_DETAIL_GRID_CLASS,
  LIST_ROWS_SECTION_CLASS,
  LIST_SCROLL_CLASS,
  ListEmpty,
  ListLoadError,
  ListNoResult,
  ListSkeleton,
} from '#/features/list/list-states'
import { TorrentRow } from '#/features/list/torrent-row'

// FR-15, NFR-1, AR-7, AR-50: the torrent list. Order only from
// `useVisibleTorrents(view, sortKeys)` through the freeze (`useFrozenOrder`);
// the view is the URL's sort (`useListView`). An extra sort's keys come from
// `['sort-keys', field]`, polled only while that sort is active; until its
// first keys arrive the order shown stays and the big numbers are skeletons.
// Rows are virtualized with the list's own scroller as the scroll element
// (story 2.4: `main` no longer scrolls, so the desktop detail panel beside
// the list fills the height), fixed height, keyed by hash. Only the rows in
// view plus 10 above and below exist. Docs: TanStack Virtual `Virtualizer`
// options and the React adapter
// (https://tanstack.com/virtual/latest/docs/api/virtualizer,
// https://tanstack.com/virtual/latest/docs/framework/react/react-virtual).
//
// Story 2.4: the row the detail shows comes from the URL's `hash` and this
// order (`useListViewed`); the order shown and that row are published for
// the detail (`usePublishShownList`), which never runs a second freeze.
// Desktop list mode passes the detail panel as `panel`: it sits right of
// the rows; the empty, error and loading blocks replace both. Story 3.5:
// with a keyword the order is already filtered by name (the view's
// `query`); no match shows the no-result block, with 「在全部裡找」 outside
// 「全部」, unless the category has no torrent at all (then still
// 「這個分類沒有種子」).
//
// Story 3.7: on desktop `↑` `↓` (the shortcut registry) view the row before
// or after the viewed one in the order shown, as Alex's own pick
// (`setHash`, remembered as last viewed). The row is brought into view
// only when it is off screen (`scrollToIndex`, `align: 'auto'`) and its
// button takes focus, so focus follows the viewed row. At the first or
// last row nothing changes and the key is still taken, so the list does
// not scroll instead. The restored row on open is never scrolled to
// (story 3.6); only these keys scroll. Focus in the detail's tabs or body
// keeps the arrows for them (the registry's `OWN_ARROWS`); from its ‹ ›
// they still step.
// https://tanstack.com/virtual/v3/docs/api/virtualizer#scrolltoindex

const estimateSize = () => ROW_HEIGHT

/**
 * Only a real mouse can rest on the list: a phone keeps a sticky `:hover`
 * where it was last tapped, and only a mouse `pointerleave` clears the freeze.
 */
function mouseRestsOn(element: HTMLElement | null): boolean {
  if (!element || typeof window.matchMedia !== 'function') return false
  return (
    window.matchMedia('(hover: hover) and (pointer: fine)').matches &&
    element.matches(':hover')
  )
}

const fetchSortKeys = bindFetchSortKeys(getSortKeys)

export interface TorrentListProps {
  /**
   * Desktop list mode: the detail panel, drawn right of the rows. With it,
   * no usable `hash` means the first row is viewed.
   */
  panel?: ReactNode
}

export function TorrentList({ panel }: TorrentListProps) {
  const { view, viewReady, selectCategory } = useListView()
  const extraField = isExtraSortField(view.sort) ? view.sort : null
  const { data: sortKeysData, errorUpdateCount } = useSortKeys(
    extraField,
    fetchSortKeys,
  )
  const sortKeys = extraField ? sortKeysData?.keys : undefined
  // The first keys failed: every value reads 「沒有」 (the connection alert,
  // if any, explains why) and the order shown stays, with new torrents on
  // top, until a later poll brings keys and the list sorts. Sticky: with no
  // data Query resets `isError` each time a poll starts, while
  // `errorUpdateCount` only grows (epic 2 review).
  const keysFailed =
    extraField !== null && sortKeys === undefined && errorUpdateCount > 0
  const { data: live } = useVisibleTorrents(view, sortKeys)
  // Story 3.5: the category's own size, keyword aside.
  const { data: categorySize = 0 } = useMatchCount(view.category, '', false)
  // Sticky: Query clears its own `error` each time a fetch starts.
  const failure = useMaindataFailure()
  const shown = useFrozenOrder(live, {
    viewKey: viewKeyOf(view),
    // Story 3.5: another category or keyword applies even while holding.
    filterKey: JSON.stringify([view.category, view.query]),
    hold: extraField !== null && sortKeys === undefined,
    holdAddsNew: keysFailed,
  })
  const { retry, retrying } = useMaindataRetry()
  // Story 3.1: no row is viewed (nothing published for the detail, no
  // `hash` written) while the skeleton still waits for the settings, so the
  // detail's hero mounts after the rows, as on any first load, and joins
  // their entrance (story 2.9).
  const order = viewReady ? shown : undefined
  const viewed = useListViewed(order, {
    fallbackFirst: panel !== undefined,
    scope: view.category,
  })
  usePublishShownList(order, viewed)

  // Story 3.1 (AD-8): the first load also waits for the settings, which
  // may change the sort of a URL without one.
  const state = listView({
    hasData: shown !== undefined && viewReady,
    visibleCount: shown?.length ?? 0,
    error: failure,
  })
  // Story 2.9: an empty list still has its entrance moment.
  useEmptyEntrance(state === 'empty')
  if (state === 'skeleton') return <ListSkeleton />
  if (state === 'error')
    return <ListLoadError onRetry={retry} busy={retrying} />
  if (state === 'empty' || !shown) {
    if (view.query === '' || categorySize === 0) return <ListEmpty />
    return (
      <ListNoResult
        text={noResultText(view.query, view.category)}
        onSearchAll={
          view.category === ALL ? undefined : () => selectCategory(ALL)
        }
      />
    )
  }
  const rows = (
    <TorrentRows
      shown={shown}
      sort={view.sort}
      sortKeys={sortKeys}
      keysFailed={keysFailed}
      viewed={viewed}
    />
  )
  // One wrapper either way, so crossing 1024px keeps the rows mounted
  // (scroll, virtualizer and freeze); without a panel it adds no box.
  return (
    <div className={panel === undefined ? 'contents' : LIST_DETAIL_GRID_CLASS}>
      {rows}
      {panel}
    </div>
  )
}

function TorrentRows({
  shown,
  sort,
  sortKeys,
  keysFailed,
  viewed,
}: {
  shown: ReadonlyArray<string>
  sort: SortFieldId
  /** The active extra sort's keys; `undefined` while loading or for a slim sort. */
  sortKeys: SortKeys | undefined
  /** The first keys failed: values read 「沒有」 instead of skeletons. */
  keysFailed: boolean
  /** The row the detail shows, `null` for none. */
  viewed: string | null
}) {
  const { setHash } = useViewedHash()
  const { data: torrents } = useMaindata(selectTorrents)
  const { data: stateBeforeMove } = useMaindata(selectStateBeforeMove)
  // Story 2.10: polled only while maindata has an errored torrent.
  const errorReasons = useErrorReasons()
  const clock = useDayClock()
  // Only a sort shown as 「N 前」 makes the rows read the minute tick.
  const today = rowClock(sort, clock.today, clock.now)
  const listRef = useRef<HTMLDivElement>(null)
  const scrollRef = useRef<HTMLDivElement>(null)
  const sectionRef = useRef<HTMLElement>(null)
  const [scrollMargin, setScrollMargin] = useState(0)

  // Where the rows start inside the scroller (its padding: 8px desktop,
  // 4px phone); re-measured when the width changes the breakpoint.
  useLayoutEffect(() => {
    const scroller = scrollRef.current
    const list = listRef.current
    if (!scroller || !list) return
    const measure = () => {
      const offset =
        list.getBoundingClientRect().top -
        scroller.getBoundingClientRect().top +
        scroller.scrollTop
      setScrollMargin((previous) =>
        Math.abs(previous - offset) < 0.5 ? previous : offset,
      )
    }
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(scroller)
    return () => observer.disconnect()
  }, [])

  // Freeze reasons: a finger on the scroller (until the last finger lifts
  // and the scroll settles), and the mouse on the section (events below).
  // Rows that replace a block under a resting mouse get no `pointerenter`,
  // so check `:hover` once on mount. Leaving the list clears both.
  useEffect(() => {
    const scroller = scrollRef.current
    if (!scroller) return
    if (mouseRestsOn(sectionRef.current)) setPointerInList(true)
    const options = { passive: true } as const
    const onTouchEnd = (event: TouchEvent) => {
      if (event.touches.length === 0) touchScrollEnd()
    }
    scroller.addEventListener('touchstart', touchScrollStart, options)
    scroller.addEventListener('touchend', onTouchEnd, options)
    scroller.addEventListener('touchcancel', onTouchEnd, options)
    scroller.addEventListener('scroll', noteScroll, options)
    return () => {
      scroller.removeEventListener('touchstart', touchScrollStart)
      scroller.removeEventListener('touchend', onTouchEnd)
      scroller.removeEventListener('touchcancel', onTouchEnd)
      scroller.removeEventListener('scroll', noteScroll)
      resetListFreeze()
    }
  }, [])

  // A new `getItemKey` makes the virtualizer re-measure every row: keep it
  // stable (`shown` keeps its reference across polls and while frozen).
  const getItemKey = useCallback((index: number) => shown[index], [shown])
  const virtualizer = useVirtualizer({
    count: shown.length,
    getScrollElement: () => scrollRef.current,
    estimateSize,
    getItemKey,
    overscan: 10,
    gap: ROW_GAP,
    scrollMargin,
    // React 19 warns about flushSync inside lifecycle methods.
    useFlushSync: false,
  })
  // Story 3.7: `↑` `↓` on desktop. The row to focus once it is rendered
  // (it may only appear after the scroll), and what had focus at the press:
  // focus moved anywhere else since (`/` into the search box) cancels it,
  // and so does any other key or a press. The row last stepped to: a held
  // key repeats faster than the URL comes back, so the next step starts
  // there until `viewed` catches up (or another key or a press).
  const desktop = useIsDesktop()
  const focusNextRef = useRef<{
    hash: string
    from: HTMLElement | null
  } | null>(null)
  const steppedRef = useRef<string | null>(null)
  const step = (by: -1 | 1) => {
    const stepped = steppedRef.current
    const from = stepped !== null && shown.includes(stepped) ? stepped : viewed
    const position = detailPosition(shown, from)
    if (position === null) return false
    const target = by < 0 ? position.prev : position.next
    if (target === null) return true
    focusNextRef.current = { hash: target, from: focusedElement() }
    steppedRef.current = target
    setHash(target)
    virtualizer.scrollToIndex(position.index + by, { align: 'auto' })
    return true
  }
  useShortcutAction('prevItem', desktop ? () => step(-1) : null)
  useShortcutAction('nextItem', desktop ? () => step(1) : null)
  useLayoutEffect(() => {
    if (viewed === steppedRef.current) steppedRef.current = null
  }, [viewed])
  useEffect(() => {
    const forget = (event: Event) => {
      const key = event instanceof KeyboardEvent ? event.key : null
      if (key === 'ArrowUp' || key === 'ArrowDown') return
      focusNextRef.current = null
      steppedRef.current = null
    }
    // Capture: before the registry's own listener sees the key.
    document.addEventListener('keydown', forget, true)
    document.addEventListener('pointerdown', forget, true)
    return () => {
      document.removeEventListener('keydown', forget, true)
      document.removeEventListener('pointerdown', forget, true)
    }
  }, [])
  useLayoutEffect(() => {
    const pending = focusNextRef.current
    if (pending === null) return
    const active = focusedElement()
    const focusStayed =
      active === null ||
      active === pending.from ||
      listRef.current?.contains(active) === true
    if (!focusStayed || !shown.includes(pending.hash)) {
      focusNextRef.current = null
      return
    }
    const button = listRef.current?.querySelector<HTMLButtonElement>(
      `[data-hash="${pending.hash}"] button`,
    )
    if (!button) return
    focusNextRef.current = null
    button.focus({ preventScroll: true })
  })

  // Story 2.9: the rows in view rise and their rings turn in once the
  // virtualizer has measured the scroller (`scrollRect`, the rows of that
  // commit cover the view); after the virtualizer, so its layout effect ran
  // first. https://unpkg.com/@tanstack/virtual-core@3.19.11/src/index.ts
  useEntrance(scrollRef, { ready: virtualizer.scrollRect !== null })

  const total = shown.length
  return (
    <section
      ref={sectionRef}
      aria-label={`種子列表，共 ${total} 個`}
      className={LIST_ROWS_SECTION_CLASS}
      onPointerEnter={(event) => {
        if (event.pointerType === 'mouse') setPointerInList(true)
      }}
      onPointerLeave={(event) => {
        if (event.pointerType === 'mouse') setPointerInList(false)
      }}
    >
      <div ref={scrollRef} id={LIST_SCROLL_ID} className={LIST_SCROLL_CLASS}>
        <div
          ref={listRef}
          role="list"
          className="relative w-full"
          style={{ height: virtualizer.getTotalSize() }}
        >
          {virtualizer.getVirtualItems().map((item) => {
            const hash = shown[item.index]
            const props =
              torrents && stateBeforeMove
                ? rowProps({ torrents, stateBeforeMove }, hash, {
                    today,
                    sort,
                    sortKeys,
                    keysFailed,
                    errorReasons,
                  })
                : null
            return (
              <div
                key={item.key}
                role="listitem"
                data-hash={hash}
                aria-setsize={total}
                aria-posinset={item.index + 1}
                className="absolute top-0 left-0 w-full"
                style={{
                  height: ROW_HEIGHT,
                  transform: `translateY(${item.start - scrollMargin}px)`,
                }}
              >
                {props && (
                  <TorrentRow
                    {...props}
                    viewing={hash === viewed}
                    onOpen={setHash}
                  />
                )}
              </div>
            )
          })}
        </div>
      </div>
    </section>
  )
}
