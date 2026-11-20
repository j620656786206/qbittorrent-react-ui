import { useState } from 'react'
import { LIST_LOAD_FAILED } from '#/lib/error-text'
import { formatCount } from '#/lib/format'
import { noResultText } from '#/lib/name-search'
import type { BoardColumn } from '#/lib/torrent-status'
import type { BoardColumns } from '#/lib/visible-torrents'
import { ALL } from '#/shared/categories'
import type { SlimTorrent } from '#/shared/maindata'
import { useIsDesktop } from '#/shared/ui/breakpoint'
import { cn } from '#/shared/ui/cn'
import { ListEmpty, ListLoadError, ListNoResult } from '#/shared/ui/list-blocks'
import { Skeleton } from '#/shared/ui/skeleton'
import { StatusCircle } from '#/shared/ui/status-circle'
import {
  selectStateBeforeMove,
  useBoardColumns,
  useMaindata,
  useMatchCount,
  useShownTorrents,
} from '#/state/maindata'
import { openAdd } from '#/state/add-open'
import { useAutoCollapse } from '#/state/auto-collapse'
import { useEmptyEntrance } from '#/state/entrance'
import { useListView } from '#/state/list-view'
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
import { useBoardCollapse } from '#/features/board/use-board-collapse'

/** Story 4.6: the empty state's 「新增種子」 opens the add screen. */
const openAddScreen = () => openAdd()

// Story 2.3, FR-15: the board, what the 「狀態」 sort shows (EXPERIENCE
// 排序決定長相). Columns and their orders come from `useBoardColumns(category)`
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
// only the 已整理 toggle changes). Story 3.2: only the selected category's
// torrents, the 已整理 column too; a category with only archived torrents
// shows the four work columns as 「沒有」 and 已整理 as usual, one with none
// the empty block 「這個分類沒有種子」. Story 3.5: with a keyword only the
// names holding it, 已整理 too (its collapsed count is the matches); a
// partly empty board keeps its four columns, each empty one 「沒有」; only
// when the four and 已整理 are all empty the no-result block covers it.
// The phone has no 已整理 column, so while searching there archived
// matches do not count (the block and the live region agree).
// The board stays mounted (hidden) under that block and its key is the
// category only, so a keyword that matches nothing for a moment keeps the
// open 已整理 column, the collapse and the scroll. A category with no
// torrent at all still says 「這個分類沒有種子」.
// Story 4.4: cards this tab deleted stay in their column
// (useBoardShownColumns) and draw from their snapshot (`useShownTorrents`)
// while each column runs their exit (card-list.tsx); they count, so the
// empty block waits for them. The collapse FLIP owns the wrappers while it
// runs: then deleted cards drop without a fade (`exitDisabled`).

const GRID_CLASS = 'grid h-full min-h-0 grid-rows-[minmax(0,1fr)] gap-board-gap'
/** The 已整理 strip is 64px; expanded it is as wide as the others. */
const GRID_COLLAPSED = 'grid-cols-[repeat(4,minmax(0,1fr))_64px]'
const GRID_EXPANDED = 'grid-cols-[repeat(5,minmax(0,1fr))]'

export function TorrentBoard() {
  const { view, viewReady, selectCategory } = useListView()
  const { data: liveColumns } = useBoardColumns(view.category, view.query)
  // Another category or keyword applies at once, even mid-animation.
  const columns = useBoardShownColumns(
    liveColumns,
    JSON.stringify([view.category, view.query]),
  )
  const torrents = useShownTorrents()
  const { data: stateBeforeMove } = useMaindata(selectStateBeforeMove)
  // Sticky: Query clears its own `error` each time a fetch starts.
  const failure = useMaindataFailure()
  const { retry, retrying } = useMaindataRetry()
  const desktop = useIsDesktop()
  const { today } = useDayClock()
  // Story 3.5: the category's own size, keyword aside (archived ones only
  // where the 已整理 column is: desktop).
  const { data: categoryTotal = 0 } = useMatchCount(view.category, '', desktop)
  const searching = view.query !== '' && categoryTotal > 0

  // Story 3.1 (AD-8): the first load also waits for the settings, which
  // may turn a URL without `sort` into the list.
  const state = boardView({
    hasData: columns !== undefined && viewReady,
    total: columns ? totalOf(columns, desktop || !searching) : 0,
    error: failure,
    searching,
  })
  // Story 2.9: an empty board still has its entrance moment.
  useEmptyEntrance(state === 'empty' || state === 'no-result')
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
    return <ListEmpty onAdd={openAddScreen} />
  }
  const noResult = state === 'no-result'
  // Story 3.2: another category is a new board, keyed on it: every column
  // back at the top, the auto-collapse and the 已整理 column reset.
  return (
    <div className="relative h-full min-h-0">
      <div className={cn('h-full min-h-0', noResult && 'invisible')}>
        {desktop ? (
          <DesktopBoard
            key={view.category}
            columns={columns}
            torrents={torrents}
            stateBeforeMove={stateBeforeMove}
            today={today}
          />
        ) : (
          <PhoneBoard
            key={view.category}
            columns={columns}
            torrents={torrents}
            stateBeforeMove={stateBeforeMove}
            today={today}
          />
        )}
      </div>
      {noResult && (
        <div className="absolute inset-0">
          <ListNoResult
            text={noResultText(view.query, view.category)}
            onSearchAll={
              view.category === ALL ? undefined : () => selectCategory(ALL)
            }
          />
        </div>
      )}
    </div>
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
  const searching = useListView().view.query !== ''
  const [archivedOpen, setArchivedOpen] = useState(false)
  const autoCollapse = useAutoCollapse()
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
            empty={emptyText(column, columns, searching)}
            bodyRef={controller.scrollerRef(column)}
            exitDisabled={controller.isBusy}
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
          exitDisabled={controller.isBusy}
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
