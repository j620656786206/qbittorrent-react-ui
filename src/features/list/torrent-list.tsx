import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import type { ReactNode } from 'react'
import { useVirtualizer } from '@tanstack/react-virtual'
import { noResultText } from '#/lib/name-search'
import type { SortKeys } from '#/lib/visible-torrents'
import { ALL } from '#/shared/categories'
import { getSortKeys } from '#/server/functions/get-sort-keys'
import { isExtraSortField } from '#/shared/sort-fields'
import type { SortFieldId } from '#/shared/sort-fields'
import { useIsDesktop } from '#/shared/ui/breakpoint'
import { Checkbox } from '#/shared/ui/checkbox'
import { cn } from '#/shared/ui/cn'
import { LIST_SCROLL_ID } from '#/shared/ui/main-scroll'
import { BAR_SCROLL_PADDING_END } from '#/shared/ui/selection-bar-geometry'
import { useEmptyEntrance, useEntrance } from '#/state/entrance'
import { useErrorReasons } from '#/state/error-reasons'
import { useLeavingExit } from '#/state/leaving-exit'
import { useListView, viewKeyOf } from '#/state/list-view'
import { useListViewed } from '#/state/list-viewed'
import {
  selectStateBeforeMove,
  useMaindata,
  useMatchCount,
  useShownTorrents,
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
import {
  toggleSelected,
  useSelectedHashes,
  useSelectionShift,
} from '#/state/selection'
import { usePublishShownList } from '#/state/shown-order'
import { bindFetchSortKeys, useSortKeys } from '#/state/sort-keys'
import { openAdd } from '#/state/add-open'
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
import { SHIFT_CLASS, TorrentRow } from '#/features/list/torrent-row'
import { useArrowStepping } from '#/features/list/use-arrow-stepping'

/** Story 4.6: the empty state's 「新增種子」 opens the add screen. */
const openAddScreen = () => openAdd()

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
// Story 3.7: on desktop `↑` `↓` step the viewed row (use-arrow-stepping.ts).
//
// Story 4.1: on desktop each row's wrapper (`group/item`) holds the
// selection checkbox before the row's button (tab order, and no control
// nested in a button), placed over the row's empty 20px slot so nothing
// shifts. It shows while the wrapper is hovered or holds focus, and on
// every row once anything is selected (`data-selecting` on the list).
// Clicking it only toggles the selection (src/state/selection.ts); the rest
// of the row still opens the detail. The scroller keeps
// `page-desktop-bottom` under the last row on desktop, always, so the
// selection bar never covers it and the list never jumps when the bar
// comes.
//
// Story 4.2: below 1024px a long press on a row (enabled while nothing is
// selected) ticks it and starts selection mode, which is simply anything
// selected, so a desktop selection carries over when the width crosses
// 1024px. While selecting on the phone a tap toggles the row instead of
// opening the sheet, every row shows its checkbox 10px in (no hover on a
// phone) and makes 28px of room for it (torrent-row.tsx), and the
// scroller keeps 140px under the last row for the two-row bar. The slide
// plays only on the rows mounted when the mode changes
// (`useSelectionShift`): at the crossing or after a scroll they are
// already in place. The leaving checkbox slides out too. Each phone row
// clips its own overflow, so nothing ever scrolls sideways. Phone rows
// keep the system callout and text selection away from a long press.
//
// Story 4.4: rows this tab deleted stay in the order (order-freeze) and
// draw from their snapshot (`useShownTorrents`) until their exit ends
// (`useLeavingExit`: the visible ones fade, then the rows below slide up).
// Until then they count as shown, so a category emptied this way shows
// 「這個分類沒有種子」 only after the fade, and the detail moves on then.

const estimateSize = () => ROW_HEIGHT
const rowSize = () => ROW_HEIGHT

/**
 * Story 4.2: the scroller while selecting on the phone, 140px under the
 * last row (mockup S07-delete-phone) so the two-row bar never covers it.
 * Only while selecting: it extends the scroll, nothing visible moves.
 */
export const PHONE_SELECTING_SCROLL_CLASS = `${LIST_SCROLL_CLASS} max-lg:pb-[140px]`

/**
 * Story 4.2: the phone rows clip their own overflow (the content sliding
 * back never makes the scroller scroll sideways) and keep the system
 * callout and text selection away from a long press. The clip leaves 4px
 * for the focus outline (2px, 2px out), which fits the scroller's 4px
 * padding.
 */
export const ROW_ITEM_CLASS =
  'group/item absolute top-0 left-0 w-full max-lg:overflow-x-clip max-lg:[overflow-clip-margin:4px] max-lg:select-none max-lg:[-webkit-touch-callout:none]'

/** Story 4.2: the phone checkbox, 10px in, vertically centred. */
export const PHONE_ROW_CHECKBOX_CLASS =
  'absolute top-1/2 left-2.5 z-[1] -translate-y-1/2'

/**
 * Story 4.1: over the row's 20px slot (12px in, centred), above the row's
 * button; hidden until the row is hovered or focused, or anything is
 * selected. Still focusable while hidden, so Tab reaches it; taps pass
 * through while hidden (a touch screen at desktop width opens the row).
 */
export const ROW_CHECKBOX_CLASS =
  'pointer-events-none absolute top-1/2 left-3 z-[1] -translate-y-1/2 opacity-0 group-focus-within/item:pointer-events-auto group-focus-within/item:opacity-100 group-hover/item:pointer-events-auto group-hover/item:opacity-100 group-data-[selecting]/list:pointer-events-auto group-data-[selecting]/list:opacity-100'

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
    if (view.query === '' || categorySize === 0)
      return <ListEmpty onAdd={openAddScreen} />
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
  const torrents = useShownTorrents()
  const { data: stateBeforeMove } = useMaindata(selectStateBeforeMove)
  const selectedHashes = useSelectedHashes()
  const selected = useMemo(() => new Set(selectedHashes), [selectedHashes])
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

  const desktop = useIsDesktop()
  const selecting = selected.size > 0
  const phoneSelecting = !desktop && selecting
  const modeShift = useSelectionShift()
  const shift = desktop ? null : modeShift
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
    // Story 4.1: a row scrolled to (`↑` `↓`) while anything is selected
    // lands above the floating selection bar.
    scrollPaddingEnd: desktop && selecting ? BAR_SCROLL_PADDING_END : 0,
    // React 19 warns about flushSync inside lifecycle methods.
    useFlushSync: false,
  })
  // Story 3.7: `↑` `↓` on desktop (use-arrow-stepping.ts).
  useArrowStepping({
    enabled: desktop,
    shown,
    viewed,
    setHash,
    scrollToIndex: (index) =>
      virtualizer.scrollToIndex(index, { align: 'auto' }),
    listRef,
  })

  // Story 2.9: the rows in view rise and their rings turn in once the
  // virtualizer has measured the scroller (`scrollRect`, the rows of that
  // commit cover the view); after the virtualizer, so its layout effect ran
  // first. https://unpkg.com/@tanstack/virtual-core@3.19.11/src/index.ts
  useEntrance(scrollRef, { ready: virtualizer.scrollRect !== null })
  // Story 4.4: the delete exit, after the virtualizer like the entrance.
  useLeavingExit(scrollRef, { order: shown, sizeOf: rowSize, gap: ROW_GAP })

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
      <div
        ref={scrollRef}
        id={LIST_SCROLL_ID}
        className={
          phoneSelecting ? PHONE_SELECTING_SCROLL_CLASS : LIST_SCROLL_CLASS
        }
      >
        <div
          ref={listRef}
          role="list"
          data-selecting={selecting ? '' : undefined}
          className="group/list relative w-full"
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
            const isSelected = selected.has(hash)
            return (
              <div
                key={item.key}
                role="listitem"
                data-hash={hash}
                aria-setsize={total}
                aria-posinset={item.index + 1}
                className={ROW_ITEM_CLASS}
                style={{
                  height: ROW_HEIGHT,
                  transform: `translateY(${item.start - scrollMargin}px)`,
                }}
              >
                {props && (desktop || phoneSelecting) && (
                  <Checkbox
                    checked={isSelected}
                    onCheckedChange={() => toggleSelected(hash)}
                    aria-label={`選取 ${props.torrent.name}`}
                    className={
                      desktop
                        ? ROW_CHECKBOX_CLASS
                        : cn(
                            PHONE_ROW_CHECKBOX_CLASS,
                            shift === 'in' && SHIFT_CLASS.in,
                          )
                    }
                  />
                )}
                {props && !desktop && !selecting && shift === 'out' && (
                  // The mode just ended: the checkbox slides out of the
                  // row, then goes (at once under reduced motion).
                  <Checkbox
                    checked={false}
                    tabIndex={-1}
                    aria-hidden="true"
                    className={cn(
                      PHONE_ROW_CHECKBOX_CLASS,
                      'pointer-events-none animate-select-shift-away motion-reduce:hidden',
                    )}
                  />
                )}
                {props && (
                  <TorrentRow
                    {...props}
                    viewing={hash === viewed}
                    selected={isSelected}
                    onOpen={phoneSelecting ? toggleSelected : setHash}
                    longPress={!desktop && !selecting}
                    onLongPress={toggleSelected}
                    phoneSelecting={phoneSelecting}
                    shift={shift}
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
