import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from 'react'
import { useVirtualizer } from '@tanstack/react-virtual'
import { formatDayKey } from '#/lib/format'
import type { SortKeys } from '#/lib/visible-torrents'
import { getSortKeys } from '#/server/functions/get-sort-keys'
import { isExtraSortField } from '#/shared/sort-fields'
import type { SortFieldId } from '#/shared/sort-fields'
import { getMain } from '#/shared/ui/main-scroll'
import { useListView, viewKeyOf } from '#/state/list-view'
import {
  selectStateBeforeMove,
  selectTorrents,
  useMaindata,
  useVisibleTorrents,
} from '#/state/maindata'
import { useMaindataFailure } from '#/state/maindata-failure'
import { useMaindataRetry } from '#/state/maindata-retry'
import { useNow } from '#/state/now'
import {
  noteScroll,
  resetListFreeze,
  setPointerInList,
  touchScrollEnd,
  touchScrollStart,
  useFrozenOrder,
} from '#/state/order-freeze'
import { bindFetchSortKeys, useSortKeys } from '#/state/sort-keys'
import {
  ROW_GAP,
  ROW_HEIGHT,
  listView,
  rowClock,
  rowProps,
} from '#/features/list/list-model'
import {
  LIST_SECTION_CLASS,
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
// rows are virtualized with `main` (the shell's scroll container) as the
// scroll element, fixed height, keyed by hash. Only the rows in view plus
// 10 above and below exist. Docs: TanStack Virtual `Virtualizer` options
// and the React adapter (https://tanstack.com/virtual/latest/docs/api/virtualizer,
// https://tanstack.com/virtual/latest/docs/framework/react/react-virtual).

/** Checks the local date once a minute; rows only see it change at midnight. */
const DAY_CHECK_MS = 60_000

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

/**
 * `today`: epoch ms that changes only when the local date does
 * (setState-in-render); `now`: the same minute tick, for 「3 小時前」.
 */
function useClock(): { today: number; now: number } {
  const now = useNow(DAY_CHECK_MS)
  // Rows take a `today` that changes only at local midnight, so dates never
  // re-render a row every minute.
  const key = formatDayKey(now)
  const [today, setToday] = useState(() => ({ key, now }))
  if (today.key !== key) {
    setToday({ key, now })
    return { today: now, now }
  }
  return { today: today.now, now }
}

const fetchSortKeys = bindFetchSortKeys(getSortKeys)

export function TorrentList() {
  const { view } = useListView()
  const extraField = isExtraSortField(view.sort) ? view.sort : null
  const { data: sortKeysData, isError: keysError } = useSortKeys(
    extraField,
    fetchSortKeys,
  )
  const sortKeys = extraField ? sortKeysData?.keys : undefined
  // The first keys failed: every value reads 「沒有」 (the connection alert,
  // if any, explains why) and the order shown stays, with new torrents on
  // top, until a later poll brings keys and the list sorts.
  const keysFailed = extraField !== null && sortKeys === undefined && keysError
  const { data: live } = useVisibleTorrents(view, sortKeys)
  // Sticky: Query clears its own `error` each time a fetch starts.
  const failure = useMaindataFailure()
  const shown = useFrozenOrder(live, {
    viewKey: viewKeyOf(view),
    hold: extraField !== null && sortKeys === undefined,
    holdAddsNew: keysFailed,
  })
  const { retry, retrying } = useMaindataRetry()

  const state = listView({
    hasData: shown !== undefined,
    visibleCount: shown?.length ?? 0,
    error: failure,
  })
  if (state === 'skeleton') return <ListSkeleton />
  if (state === 'error')
    return <ListLoadError onRetry={retry} busy={retrying} />
  if (state === 'empty' || !shown) return <ListEmpty />
  return (
    <TorrentRows
      shown={shown}
      sort={view.sort}
      sortKeys={sortKeys}
      keysFailed={keysFailed}
    />
  )
}

function TorrentRows({
  shown,
  sort,
  sortKeys,
  keysFailed,
}: {
  shown: ReadonlyArray<string>
  sort: SortFieldId
  /** The active extra sort's keys; `undefined` while loading or for a slim sort. */
  sortKeys: SortKeys | undefined
  /** The first keys failed: values read 「沒有」 instead of skeletons. */
  keysFailed: boolean
}) {
  const { data: torrents } = useMaindata(selectTorrents)
  const { data: stateBeforeMove } = useMaindata(selectStateBeforeMove)
  const clock = useClock()
  // Only a sort shown as 「N 前」 makes the rows read the minute tick.
  const today = rowClock(sort, clock.today, clock.now)
  const listRef = useRef<HTMLDivElement>(null)
  const sectionRef = useRef<HTMLElement>(null)
  const [scrollMargin, setScrollMargin] = useState(0)

  // Where the rows start inside `main` (the section's padding: 8px desktop,
  // 4px phone); re-measured when the width changes the breakpoint.
  useLayoutEffect(() => {
    const main = getMain()
    const list = listRef.current
    if (!main || !list) return
    const measure = () => {
      const offset =
        list.getBoundingClientRect().top -
        main.getBoundingClientRect().top +
        main.scrollTop
      setScrollMargin((previous) =>
        Math.abs(previous - offset) < 0.5 ? previous : offset,
      )
    }
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(main)
    return () => observer.disconnect()
  }, [])

  // Freeze reasons: a finger on `main` (until the last finger lifts and the
  // scroll settles), and the mouse on the section (events below). Rows that
  // replace a block under a resting mouse get no `pointerenter`, so check
  // `:hover` once on mount. Leaving the list clears both.
  useEffect(() => {
    const main = getMain()
    if (!main) return
    if (mouseRestsOn(sectionRef.current)) setPointerInList(true)
    const options = { passive: true } as const
    const onTouchEnd = (event: TouchEvent) => {
      if (event.touches.length === 0) touchScrollEnd()
    }
    main.addEventListener('touchstart', touchScrollStart, options)
    main.addEventListener('touchend', onTouchEnd, options)
    main.addEventListener('touchcancel', onTouchEnd, options)
    main.addEventListener('scroll', noteScroll, options)
    return () => {
      main.removeEventListener('touchstart', touchScrollStart)
      main.removeEventListener('touchend', onTouchEnd)
      main.removeEventListener('touchcancel', onTouchEnd)
      main.removeEventListener('scroll', noteScroll)
      resetListFreeze()
    }
  }, [])

  // A new `getItemKey` makes the virtualizer re-measure every row: keep it
  // stable (`shown` keeps its reference across polls and while frozen).
  const getItemKey = useCallback((index: number) => shown[index], [shown])
  const virtualizer = useVirtualizer({
    count: shown.length,
    getScrollElement: getMain,
    estimateSize,
    getItemKey,
    overscan: 10,
    gap: ROW_GAP,
    scrollMargin,
    // React 19 warns about flushSync inside lifecycle methods.
    useFlushSync: false,
  })

  const total = shown.length
  return (
    <section
      ref={sectionRef}
      aria-label={`種子列表，共 ${total} 個`}
      className={LIST_SECTION_CLASS}
      onPointerEnter={(event) => {
        if (event.pointerType === 'mouse') setPointerInList(true)
      }}
      onPointerLeave={(event) => {
        if (event.pointerType === 'mouse') setPointerInList(false)
      }}
    >
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
              ? rowProps(
                  { torrents, stateBeforeMove },
                  hash,
                  today,
                  sort,
                  sortKeys,
                  keysFailed,
                )
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
              {props && <TorrentRow {...props} />}
            </div>
          )
        })}
      </div>
    </section>
  )
}
