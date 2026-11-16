import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from 'react'
import { useVirtualizer } from '@tanstack/react-virtual'
import { formatDayKey } from '#/lib/format'
import { EPIC1_VIEW } from '#/lib/visible-torrents'
import { getMain } from '#/shared/ui/main-scroll'
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
  resetOrderFreeze,
  setPointerInList,
  touchScrollEnd,
  touchScrollStart,
  useFrozenOrder,
} from '#/state/order-freeze'
import {
  ROW_GAP,
  ROW_HEIGHT,
  listView,
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
// `useVisibleTorrents(EPIC1_VIEW)` through the freeze (`useFrozenOrder`);
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

/** Epoch ms that changes only when the local date does (setState-in-render). */
function useToday(): number {
  const now = useNow(DAY_CHECK_MS)
  // Rows take a `today` that changes only at local midnight, so dates never
  // re-render a row every minute.
  const key = formatDayKey(now)
  const [today, setToday] = useState(() => ({ key, now }))
  if (today.key !== key) {
    setToday({ key, now })
    return now
  }
  return today.now
}

export function TorrentList() {
  const { data: live } = useVisibleTorrents(EPIC1_VIEW)
  // Sticky: Query clears its own `error` each time a fetch starts.
  const failure = useMaindataFailure()
  const shown = useFrozenOrder(live)
  const { retry, retrying } = useMaindataRetry()

  const view = listView({
    hasData: shown !== undefined,
    visibleCount: shown?.length ?? 0,
    error: failure,
  })
  if (view === 'skeleton') return <ListSkeleton />
  if (view === 'error') return <ListLoadError onRetry={retry} busy={retrying} />
  if (view === 'empty' || !shown) return <ListEmpty />
  return <TorrentRows shown={shown} />
}

function TorrentRows({ shown }: { shown: ReadonlyArray<string> }) {
  const { data: torrents } = useMaindata(selectTorrents)
  const { data: stateBeforeMove } = useMaindata(selectStateBeforeMove)
  const today = useToday()
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
      resetOrderFreeze()
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
              ? rowProps({ torrents, stateBeforeMove }, hash, today)
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
