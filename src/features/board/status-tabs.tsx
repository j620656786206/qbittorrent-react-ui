import { useId, useRef, useState } from 'react'
import type {
  KeyboardEvent,
  ReactNode,
  PointerEvent as ReactPointerEvent,
} from 'react'
import { formatCount } from '#/lib/format'
import type { BoardColumns } from '#/lib/visible-torrents'
import type { SlimTorrent } from '#/shared/maindata'
import { cn } from '#/shared/ui/cn'
import { Skeleton } from '#/shared/ui/skeleton'
import { PHONE_SELECTING_BOTTOM } from '#/shared/ui/selection-bar-geometry'
import { useListView } from '#/state/list-view'
import { useSelecting } from '#/state/selection'
import {
  COLUMN_META,
  WORK_COLUMNS,
  emptyText,
} from '#/features/board/board-model'
import type { WorkColumn } from '#/features/board/board-model'
import {
  settleSwipe,
  swipeIntent,
  swipeOffset,
  swipeVelocity,
  trackTransform,
} from '#/features/board/board-swipe'
import type { SwipeSample } from '#/features/board/board-swipe'
import { CardList } from '#/features/board/card-list'

// UX-DR25, DESIGN status-tabs, EXPERIENCE status-tabs (mockup S02-list-phone):
// the phone board under 1024px. A 4th top row of four status tabs (no
// 已整理, memlog #105): equal cells 6px apart, 56px tall, in a
// `surface-muted` bar (radius 16px, padding 4px); each an 8px status dot and
// the count (`stat-value`) over the name (`tag`); the selected one on
// `surface` with the card shadow and a bold name. Below, one column at a
// time, one card per row. A tap on a tab or a sideways swipe changes the
// column. Tabs follow the WAI-ARIA tabs pattern with automatic activation
// (https://www.w3.org/WAI/ARIA/apg/patterns/tabs/): arrow keys wrap,
// Home/End, only the selected tab is in the Tab order.
//
// The swipe: the four panels sit side by side on a track moved with
// `transform` only. Each panel scrolls itself with `touch-action: pan-y`
// (https://developer.mozilla.org/en-US/docs/Web/CSS/touch-action), so a
// vertical finger scrolls (the browser takes it and cancels the pointer)
// and only a sideways one reaches the swipe; the intent is decided after a
// slop (board-swipe.ts). While dragging the track follows the finger
// through the CSSOM (no re-render); on release it settles with a 0.3 s
// transition, none with `prefers-reduced-motion`. The selected column is
// component state and starts at 要處理 on every mount (Claude 代決).
//
// Story 4.2: the panels are selectable the phone way (card-list.tsx): a
// long press starts selection mode, a tap then toggles, and a swipe still
// changes the column (the ticks stay; taking the pointer for the swipe
// cancels a pending long press). Each panel keeps 10px above and 8px
// beside the cards, so the checkbox 6px out of a card's corner is never
// clipped, and 140px under the last card while selecting, for the bar.

/** The status dot colour; Tailwind needs whole class names. */
const DOT_CLASS: Readonly<Record<WorkColumn, string>> = {
  attention: 'fill-status-error',
  downloading: 'fill-status-downloading',
  seeding: 'fill-status-seeding',
  done: 'fill-status-done',
}

const TABLIST_CLASS =
  'grid flex-none grid-cols-4 gap-1.5 rounded-card bg-surface-muted p-1'

/** Story 4.2: room above the first card for its checkbox. */
export const PHONE_PANEL_PADDING_START = 10
/** Below the last card (while selecting, `PHONE_SELECTING_BOTTOM`). */
export const PHONE_PANEL_PADDING_END = 4

const TAB_CLASS =
  'flex h-14 min-w-0 flex-col items-center justify-center rounded-row text-text'

function Dot({ column }: { column: WorkColumn }) {
  return (
    <svg
      width="8"
      height="8"
      viewBox="0 0 8 8"
      aria-hidden="true"
      className="block flex-none"
    >
      <circle cx="4" cy="4" r="4" className={DOT_CLASS[column]} />
    </svg>
  )
}

function TabName({
  column,
  selected,
}: {
  column: WorkColumn
  selected: boolean
}) {
  return (
    <span
      className={cn(
        'text-tag',
        selected ? 'font-bold text-text' : 'text-text-muted',
      )}
    >
      {COLUMN_META[column].name}
    </span>
  )
}

interface Drag {
  pointerId: number
  startX: number
  startY: number
  intent: 'pending' | 'horizontal' | 'vertical'
  samples: Array<SwipeSample>
}

export interface PhoneBoardProps {
  columns: BoardColumns
  torrents: Readonly<Record<string, SlimTorrent>>
  stateBeforeMove: Readonly<Record<string, string>>
  today: number
}

export function PhoneBoard({
  columns,
  torrents,
  stateBeforeMove,
  today,
}: PhoneBoardProps) {
  // Story 3.5: while searching every empty column says 「沒有」.
  const searching = useListView().view.query !== ''
  const selecting = useSelecting()
  const [index, setIndex] = useState(0)
  const idPrefix = useId()
  const tabRefs = useRef<Array<HTMLButtonElement | null>>([])
  const viewportRef = useRef<HTMLDivElement>(null)
  const trackRef = useRef<HTMLDivElement>(null)
  const drag = useRef<Drag | null>(null)
  const count = WORK_COLUMNS.length

  const tabId = (column: WorkColumn) => `${idPrefix}-tab-${column}`
  const panelId = (column: WorkColumn) => `${idPrefix}-panel-${column}`

  const onTabKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const moves: Record<string, number> = {
      ArrowRight: (index + 1) % count,
      ArrowLeft: (index - 1 + count) % count,
      Home: 0,
      End: count - 1,
    }
    if (!(event.key in moves)) return
    event.preventDefault()
    const next = moves[event.key]
    setIndex(next)
    tabRefs.current[next]?.focus()
  }

  /** Puts the track where `next` is, animated by the CSS transition. */
  const settle = (next: number) => {
    const track = trackRef.current
    if (track) {
      track.style.transition = ''
      track.style.transform = trackTransform(next)
    }
    setIndex(next)
  }

  const onPointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!event.isPrimary) return
    if (event.pointerType === 'mouse' && event.button !== 0) return
    drag.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      intent: 'pending',
      samples: [{ time: event.timeStamp, x: event.clientX }],
    }
  }

  const onPointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    const current = drag.current
    // A mouse press released outside the area never sent its pointerup:
    // a later hover with no button down is not a drag.
    if (current && event.pointerType === 'mouse' && event.buttons === 0) {
      drag.current = null
      if (current.intent === 'horizontal') settle(index)
      return
    }
    if (!current || current.pointerId !== event.pointerId) return
    if (current.intent === 'vertical') return
    const dx = event.clientX - current.startX
    if (current.intent === 'pending') {
      current.intent = swipeIntent(dx, event.clientY - current.startY)
      if (current.intent !== 'horizontal') return
      event.currentTarget.setPointerCapture(event.pointerId)
      if (trackRef.current) trackRef.current.style.transition = 'none'
    }
    current.samples.push({ time: event.timeStamp, x: event.clientX })
    if (current.samples.length > 20) current.samples.shift()
    const track = trackRef.current
    if (track) {
      track.style.transform = trackTransform(
        index,
        swipeOffset({ dx, index, count }),
      )
    }
  }

  const onPointerEnd = (
    event: ReactPointerEvent<HTMLDivElement>,
    cancelled: boolean,
  ) => {
    const current = drag.current
    if (!current || current.pointerId !== event.pointerId) return
    drag.current = null
    if (current.intent !== 'horizontal') return
    if (cancelled) {
      settle(index)
      return
    }
    current.samples.push({ time: event.timeStamp, x: event.clientX })
    settle(
      settleSwipe({
        index,
        count,
        dx: event.clientX - current.startX,
        velocity: swipeVelocity(current.samples),
        width: viewportRef.current?.clientWidth ?? 0,
      }),
    )
  }

  return (
    <div className="flex h-full min-h-0 flex-col gap-3.5">
      <div
        role="tablist"
        aria-label="狀態"
        className={TABLIST_CLASS}
        onKeyDown={onTabKeyDown}
      >
        {WORK_COLUMNS.map((column, i) => {
          const selected = i === index
          const n = columns[column].length
          return (
            <button
              key={column}
              ref={(element) => {
                tabRefs.current[i] = element
              }}
              type="button"
              role="tab"
              id={tabId(column)}
              aria-selected={selected}
              aria-controls={panelId(column)}
              aria-label={`${COLUMN_META[column].name}，${formatCount(n)} 個`}
              tabIndex={selected ? 0 : -1}
              onClick={() => settle(i)}
              className={cn(TAB_CLASS, selected && 'bg-surface shadow-card')}
            >
              <span className="flex items-center gap-[5px]">
                <Dot column={column} />
                <span className="text-stat-value tabular-nums">
                  {formatCount(n)}
                </span>
              </span>
              <TabName column={column} selected={selected} />
            </button>
          )
        })}
      </div>
      <div
        ref={viewportRef}
        data-slot="board-swipe"
        className="relative min-h-0 flex-1 touch-pan-y overflow-hidden"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={(event) => onPointerEnd(event, false)}
        onPointerCancel={(event) => onPointerEnd(event, true)}
      >
        <div
          ref={trackRef}
          data-slot="board-track"
          className="flex h-full transition-transform duration-300 ease-[cubic-bezier(.2,.8,.2,1)] motion-reduce:transition-none"
          style={{ transform: trackTransform(index) }}
        >
          {WORK_COLUMNS.map((column, i) => (
            <CardList
              key={column}
              hashes={columns[column]}
              torrents={torrents}
              stateBeforeMove={stateBeforeMove}
              today={today}
              empty={emptyText(column, columns, searching)}
              label={COLUMN_META[column].name}
              paddingStart={PHONE_PANEL_PADDING_START}
              paddingEnd={
                selecting ? PHONE_SELECTING_BOTTOM : PHONE_PANEL_PADDING_END
              }
              className="h-full w-full flex-none touch-pan-y px-2"
              selectable
              phone
              bodyProps={{
                role: 'tabpanel',
                id: panelId(column),
                'aria-label': COLUMN_META[column].name,
                tabIndex: i === index ? 0 : -1,
                inert: i !== index,
              }}
            />
          ))}
        </div>
      </div>
    </div>
  )
}

/** S02-loading-phone: the tabs with count placeholders and one column. */
export function PhoneBoardSkeleton({ children }: { children: ReactNode }) {
  return (
    <div className="flex h-full min-h-0 flex-col gap-3.5">
      <div role="tablist" aria-label="狀態" className={TABLIST_CLASS}>
        {WORK_COLUMNS.map((column, i) => (
          <button
            key={column}
            type="button"
            role="tab"
            aria-selected={i === 0}
            aria-label={`${COLUMN_META[column].name}，載入中`}
            tabIndex={i === 0 ? 0 : -1}
            className={cn(TAB_CLASS, i === 0 && 'bg-surface shadow-card')}
          >
            <span className="flex items-center gap-[5px]">
              <Dot column={column} />
              <Skeleton
                className={cn(
                  'my-0.5 h-[18px] w-[26px] rounded-[6px]',
                  // On the muted bar a muted block would vanish.
                  i !== 0 && 'bg-border',
                )}
              />
            </span>
            <TabName column={column} selected={i === 0} />
          </button>
        ))}
      </div>
      <div
        role="tabpanel"
        aria-label={COLUMN_META.attention.name}
        aria-busy="true"
        className="flex min-h-0 flex-1 flex-col gap-2.5 overflow-hidden"
      >
        {children}
      </div>
    </div>
  )
}
