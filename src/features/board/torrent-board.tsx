import { useState } from 'react'
import { LIST_LOAD_FAILED } from '#/lib/error-text'
import { formatCount } from '#/lib/format'
import type { BoardColumn } from '#/lib/torrent-status'
import type { BoardColumns } from '#/lib/visible-torrents'
import type { SlimTorrent } from '#/shared/maindata'
import { useIsDesktop } from '#/shared/ui/breakpoint'
import { cn } from '#/shared/ui/cn'
import { ListEmpty, ListLoadError } from '#/shared/ui/list-blocks'
import { Skeleton } from '#/shared/ui/skeleton'
import { StatusCircle } from '#/shared/ui/status-circle'
import {
  selectStateBeforeMove,
  selectTorrents,
  useBoardColumns,
  useMaindata,
} from '#/state/maindata'
import { useEmptyEntrance } from '#/state/entrance'
import { useMaindataFailure } from '#/state/maindata-failure'
import { useMaindataRetry } from '#/state/maindata-retry'
import { useDayClock } from '#/state/now'
import { useBoardShownColumns } from '#/state/order-freeze'
import { ArchivedColumn } from '#/features/board/archived-column'
import { CardSkeleton } from '#/features/board/board-card'
import {
  BoardColumnView,
  COLUMN_CLASS,
  COLUMN_HEADER_CLASS,
  ColumnTitle,
} from '#/features/board/board-column'
import { CollapsedStrip } from '#/features/board/collapsed-strip'
import {
  COLUMN_META,
  WORK_COLUMNS,
  boardView,
  emptyText,
  totalOf,
} from '#/features/board/board-model'
import { PhoneBoard, PhoneBoardSkeleton } from '#/features/board/status-tabs'
import {
  useAutoCollapsePref,
  useBoardCollapse,
} from '#/features/board/use-board-collapse'

// Story 2.3, FR-15: the board, what the 「狀態」 sort shows (EXPERIENCE
// 排序決定長相). Columns and their orders come from `useBoardColumns()`
// (selectBoardColumns in src/lib), live: the board is never frozen and
// never sets the list's pointer freeze (EXPERIENCE 「看板不受影響」).
// Desktop (from 1024px, mockup S01-list-desktop): four equal work columns
// and the 64px 已整理 strip, 14px apart, filling `main`'s height; each
// column scrolls itself. Phone (mockup S02-list-phone): four status tabs and
// one column at a time (status-tabs.tsx). Only one of the two is rendered.
// First load: card-sized skeletons (S01-loading-desktop, S02-loading-phone),
// no spinner. The load error and the all-empty state are the list's blocks.
// Story 2.8: on desktop, with the pref on, scrolling a column past one
// column height collapses the others into 64px strips and spreads its
// cards 2 to 3 per row (board-collapse-controller.ts). The order shown
// holds while that animation runs (`useBoardShownColumns`, AD-7); the
// detail panel keeps its place and width (it reads `data-archived`, which
// only the 已整理 toggle changes).

const GRID_CLASS = 'grid h-full min-h-0 grid-rows-[minmax(0,1fr)] gap-board-gap'
/** The 已整理 strip is 64px; expanded it is as wide as the others. */
const GRID_COLLAPSED = 'grid-cols-[repeat(4,minmax(0,1fr))_64px]'
const GRID_EXPANDED = 'grid-cols-[repeat(5,minmax(0,1fr))]'

export function TorrentBoard() {
  const { data: liveColumns } = useBoardColumns()
  const columns = useBoardShownColumns(liveColumns)
  const { data: torrents } = useMaindata(selectTorrents)
  const { data: stateBeforeMove } = useMaindata(selectStateBeforeMove)
  // Sticky: Query clears its own `error` each time a fetch starts.
  const failure = useMaindataFailure()
  const { retry, retrying } = useMaindataRetry()
  const desktop = useIsDesktop()
  const { today } = useDayClock()

  const state = boardView({
    hasData: columns !== undefined,
    total: columns ? totalOf(columns) : 0,
    error: failure,
  })
  // Story 2.9: an empty board still has its entrance moment.
  useEmptyEntrance(state === 'empty')
  if (state === 'skeleton') return <BoardSkeleton desktop={desktop} />
  if (state === 'error') {
    return (
      <ListLoadError
        message={LIST_LOAD_FAILED}
        onRetry={retry}
        busy={retrying}
      />
    )
  }
  if (state === 'empty' || !columns || !torrents || !stateBeforeMove) {
    return <ListEmpty />
  }
  return desktop ? (
    <DesktopBoard
      columns={columns}
      torrents={torrents}
      stateBeforeMove={stateBeforeMove}
      today={today}
    />
  ) : (
    <PhoneBoard
      columns={columns}
      torrents={torrents}
      stateBeforeMove={stateBeforeMove}
      today={today}
    />
  )
}

interface BoardDataProps {
  columns: BoardColumns
  torrents: Readonly<Record<string, SlimTorrent>>
  stateBeforeMove: Readonly<Record<string, string>>
  today: number
}

/** Columns left to right, the 已整理 one last. */
const ALL_COLUMNS: ReadonlyArray<BoardColumn> = [...WORK_COLUMNS, 'archived']

function DesktopBoard({
  columns,
  torrents,
  stateBeforeMove,
  today,
}: BoardDataProps) {
  const [archivedOpen, setArchivedOpen] = useState(false)
  const autoCollapse = useAutoCollapsePref()
  const { view, controller } = useBoardCollapse(autoCollapse)
  const { focus } = view
  // Collapsed: the wide column takes the rest, every other one is 64px.
  const focusStyle =
    focus === null
      ? undefined
      : {
          gridTemplateColumns: ALL_COLUMNS.map((column) =>
            column === focus ? 'minmax(0,1fr)' : '64px',
          ).join(' '),
        }
  // The wide column's layout; the pin and the frame for the column they
  // belong to (it keeps them through the expand).
  const wide = (column: BoardColumn) => ({
    ...(focus === column ? { layout: view.layout } : null),
    ...(view.column === column
      ? { pin: view.pin, hereHash: view.hereHash, hereMs: view.hereMs }
      : null),
  })
  const strip = (column: BoardColumn) => (
    <CollapsedStrip
      key={column}
      column={column}
      count={columns[column].length}
      // Pressing any strip restores the four-column board.
      label={`回到看板，${COLUMN_META[column].name}，${formatCount(columns[column].length)} 個`}
      onPress={() => controller.pressStrip(column)}
      appear
    />
  )
  const onArchivedChange = (next: boolean) => {
    // Closing the wide 已整理 column ends the collapse at once.
    if (!next && focus === 'archived') controller.reset()
    setArchivedOpen(next)
  }
  return (
    <div
      ref={controller.setRoot}
      aria-label="看板"
      role="region"
      // The detail panel (story 2.4) reads this to keep covering 完成 and 已整理.
      data-archived={archivedOpen ? 'open' : 'closed'}
      data-focus={focus ?? undefined}
      className={cn(
        GRID_CLASS,
        focus === null && (archivedOpen ? GRID_EXPANDED : GRID_COLLAPSED),
      )}
      style={focusStyle}
    >
      {WORK_COLUMNS.map((column) =>
        focus !== null && focus !== column ? (
          strip(column)
        ) : (
          <BoardColumnView
            key={column}
            column={column}
            hashes={columns[column]}
            torrents={torrents}
            stateBeforeMove={stateBeforeMove}
            today={today}
            empty={emptyText(column, columns)}
            bodyRef={controller.scrollerRef(column)}
            {...wide(column)}
          />
        ),
      )}
      {focus !== null && focus !== 'archived' ? (
        strip('archived')
      ) : (
        <ArchivedColumn
          key="archived"
          hashes={columns.archived}
          torrents={torrents}
          stateBeforeMove={stateBeforeMove}
          today={today}
          expanded={archivedOpen}
          onExpandedChange={onArchivedChange}
          bodyRef={controller.scrollerRef('archived')}
          {...wide('archived')}
        />
      )}
    </div>
  )
}

/** Skeleton cards per desktop column: with a bar, without, with. */
const SKELETON_CARDS = [true, false, true] as const
const PHONE_SKELETON_CARDS = [true, false, true, false, true] as const

function BoardSkeleton({ desktop }: { desktop: boolean }) {
  if (!desktop) {
    return (
      <PhoneBoardSkeleton>
        {PHONE_SKELETON_CARDS.map((withBar, index) => (
          <CardSkeleton key={index} withBar={withBar} />
        ))}
      </PhoneBoardSkeleton>
    )
  }
  return (
    <div
      aria-label="看板，載入中"
      aria-busy="true"
      role="region"
      className={cn(GRID_CLASS, GRID_COLLAPSED)}
    >
      {WORK_COLUMNS.map((column) => (
        <section
          key={column}
          aria-label={`${COLUMN_META[column].name}，載入中`}
          className={cn(COLUMN_CLASS, 'overflow-hidden bg-surface-muted')}
        >
          <h2 title={COLUMN_META[column].order} className={COLUMN_HEADER_CLASS}>
            <ColumnTitle
              column={column}
              count={<Skeleton className="h-3 w-6 rounded-[6px] bg-border" />}
            />
          </h2>
          <div className="flex min-h-0 flex-1 flex-col gap-2.5 overflow-hidden px-3 pt-1 pb-3">
            {SKELETON_CARDS.map((withBar, index) => (
              <CardSkeleton key={index} withBar={withBar} />
            ))}
          </div>
        </section>
      ))}
      <section
        aria-label="已整理欄，載入中"
        className="flex min-h-0 min-w-0 flex-col items-center gap-2.5 rounded-panel bg-surface-muted py-3.5"
      >
        <StatusCircle status="archived" arcFraction={null} size={28} />
        <Skeleton className="h-3 w-6 rounded-[6px] bg-border" />
        <span className="text-[14px] leading-[1.2] font-bold tracking-[.08em] [writing-mode:vertical-rl]">
          {COLUMN_META.archived.name}
        </span>
      </section>
    </div>
  )
}
