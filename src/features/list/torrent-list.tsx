import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from 'react'
import type { ReactNode } from 'react'
import { useVirtualizer } from '@tanstack/react-virtual'
import type { SortKeys } from '#/lib/visible-torrents'
import { getSortKeys } from '#/server/functions/get-sort-keys'
import { isExtraSortField } from '#/shared/sort-fields'
import type { SortFieldId } from '#/shared/sort-fields'
import { LIST_SCROLL_ID } from '#/shared/ui/main-scroll'
import { useEmptyEntrance, useEntrance } from '#/state/entrance'
import { useErrorReasons } from '#/state/error-reasons'
import { useListView, viewKeyOf } from '#/state/list-view'
import { useListViewed } from '#/state/list-viewed'
import {
  selectStateBeforeMove,
  selectTorrents,
  useMaindata,
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
// the rows; the empty, error and loading blocks replace both.

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
  const { view, viewReady } = useListView()
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
  // Sticky: Query clears its own `error` each time a fetch starts.
  const failure = useMaindataFailure()
  const shown = useFrozenOrder(live, {
    viewKey: viewKeyOf(view),
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
  if (state === 'empty' || !shown) return <ListEmpty />
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
