import { useState } from 'react'
import { LIST_LOAD_FAILED } from '#/lib/error-text'
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
import { useMaindataFailure } from '#/state/maindata-failure'
import { useMaindataRetry } from '#/state/maindata-retry'
import { useDayClock } from '#/state/now'
import { ArchivedColumn } from '#/features/board/archived-column'
import { CardSkeleton } from '#/features/board/board-card'
import {
  BoardColumnView,
  COLUMN_CLASS,
  COLUMN_HEADER_CLASS,
  ColumnTitle,
} from '#/features/board/board-column'
import {
  COLUMN_META,
  WORK_COLUMNS,
  boardView,
  emptyText,
  totalOf,
} from '#/features/board/board-model'
import { PhoneBoard, PhoneBoardSkeleton } from '#/features/board/status-tabs'

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

const GRID_CLASS = 'grid h-full min-h-0 grid-rows-[minmax(0,1fr)] gap-board-gap'
/** The 已整理 strip is 64px; expanded it is as wide as the others. */
const GRID_COLLAPSED = 'grid-cols-[repeat(4,minmax(0,1fr))_64px]'
const GRID_EXPANDED = 'grid-cols-[repeat(5,minmax(0,1fr))]'

export function TorrentBoard() {
  const { data: columns } = useBoardColumns()
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

function DesktopBoard({
  columns,
  torrents,
  stateBeforeMove,
  today,
}: BoardDataProps) {
  const [archivedOpen, setArchivedOpen] = useState(false)
  return (
    <div
      aria-label="看板"
      role="region"
      className={cn(GRID_CLASS, archivedOpen ? GRID_EXPANDED : GRID_COLLAPSED)}
    >
      {WORK_COLUMNS.map((column) => (
        <BoardColumnView
          key={column}
          column={column}
          hashes={columns[column]}
          torrents={torrents}
          stateBeforeMove={stateBeforeMove}
          today={today}
          empty={emptyText(column, columns)}
        />
      ))}
      <ArchivedColumn
        hashes={columns.archived}
        torrents={torrents}
        stateBeforeMove={stateBeforeMove}
        today={today}
        expanded={archivedOpen}
        onExpandedChange={setArchivedOpen}
      />
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
          className={COLUMN_CLASS}
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
