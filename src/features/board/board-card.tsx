import { memo } from 'react'
import type { SlimTorrent } from '#/shared/maindata'
import { cn } from '#/shared/ui/cn'
import { Skeleton } from '#/shared/ui/skeleton'
import { StatusCircle } from '#/shared/ui/status-circle'
import {
  CARD_HEIGHT,
  CARD_HEIGHT_WITH_BAR,
  cardHeight,
  cardModel,
} from '#/features/board/board-model'
import type { CardModel } from '#/features/board/board-model'

// UX-DR29, DESIGN board-card (mockups S01-list-desktop, S02-list-phone):
// `surface`, radius 16px, padding 12px 14px, the card shadow. Row 1: the
// 32px status circle, the one-line name (`title` is the full name) over
// the second line, the percent at the right for downloading, paused and
// stalled. The 4px progress bar for those three (a static width: the fill
// animation is Story 2.9). Then the category tag (only when there is one)
// and the location tag. Fixed heights (board-model.ts), so the column's
// virtualizer never measures. Not clickable yet (detail is Story 2.4), no
// checkbox (Epic 4). Names and lines are JSX text, never HTML.

/** Status colour of the bar fill; Tailwind needs whole class names. */
const BAR_FILL: Readonly<Record<string, string>> = {
  downloading: 'bg-status-downloading',
  paused: 'bg-status-paused',
  stalled: 'bg-status-stalled',
}

const CARD_CLASS =
  'box-border flex flex-col gap-2 overflow-hidden rounded-card bg-surface px-3.5 py-3 shadow-card'

const TAG_CLASS =
  'inline-flex h-5 min-w-0 items-center gap-1 rounded-full border px-2 text-tag leading-4 whitespace-nowrap text-text-muted'

export interface BoardCardProps {
  /** The merged object: unchanged torrents keep their reference. */
  torrent: SlimTorrent
  /** This torrent's `stateBeforeMove` entry, if it is moving. */
  stateBeforeMove: string | undefined
  /** Changes only at local midnight (`useDayClock().today`). */
  today: number
}

/** Keyed by hash and memoized: a poll that leaves the torrent alone skips it. */
export const BoardCard = memo(function Card({
  torrent,
  stateBeforeMove,
  today,
}: BoardCardProps) {
  const model = cardModel(torrent, {
    now: today,
    stateBeforeMove:
      stateBeforeMove !== undefined ? { [torrent.hash]: stateBeforeMove } : {},
  })
  return <CardContent model={model} />
})

/** The card from a fixed model (tests render this directly). */
export function CardContent({ model }: { model: CardModel }) {
  const { circle, progress } = model
  return (
    <div style={{ height: cardHeight(model) }} className={CARD_CLASS}>
      <div className="flex h-[37px] flex-none items-start gap-2.5">
        <StatusCircle {...circle} size={32} />
        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
          <span
            title={model.name}
            className="truncate text-row-name leading-[18px]"
          >
            {model.name}
          </span>
          <span className="truncate text-meta leading-[17px] text-text-muted tabular-nums">
            {model.detail}
          </span>
        </div>
        {model.percent !== null && (
          <span className="flex-none text-card-value tabular-nums">
            {model.percent}
          </span>
        )}
      </div>
      {progress !== null && (
        <span
          aria-hidden="true"
          className="block h-1 w-full flex-none overflow-hidden rounded-bar bg-track"
        >
          <span
            className={cn('block h-full rounded-bar', BAR_FILL[circle.status])}
            style={{ width: `${progress * 100}%` }}
          />
        </span>
      )}
      <div className="flex h-5 min-w-0 flex-none gap-1.5 overflow-hidden">
        {model.category !== null && (
          <span className={cn(TAG_CLASS, 'max-w-1/2 flex-none')}>
            <span className="min-w-0 truncate">{model.category}</span>
          </span>
        )}
        <span className={cn(TAG_CLASS, 'flex-initial')}>
          <svg
            width="12"
            height="12"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.4"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
            className="flex-none"
          >
            <path d="M3 7h6l2 2h10v10H3z" />
          </svg>
          <span className="min-w-0 truncate">{model.location}</span>
        </span>
      </div>
    </div>
  )
}

/**
 * S01-loading-desktop, S02-loading-phone: a card box with the 32px circle,
 * two bars (88% x 12, 52% x 10), the percent block and, for a progress card,
 * the bar; then two tag blocks. Same heights as real cards.
 */
export function CardSkeleton({ withBar }: { withBar: boolean }) {
  return (
    <div
      aria-hidden="true"
      style={{ height: withBar ? CARD_HEIGHT_WITH_BAR : CARD_HEIGHT }}
      className={CARD_CLASS}
    >
      <div className="flex h-[37px] flex-none items-start gap-2.5">
        <Skeleton className="size-8 rounded-[16px]" />
        <span className="flex min-w-0 flex-1 flex-col gap-1.5 pt-0.5">
          <Skeleton className="h-3 w-[88%] rounded-[6px]" />
          <Skeleton className="h-2.5 w-[52%] rounded-[5px]" />
        </span>
        {withBar && <Skeleton className="h-4 w-[34px] rounded-[6px]" />}
      </div>
      {withBar && <Skeleton className="h-1 w-full rounded-bar" />}
      <span className="flex h-5 flex-none gap-1.5">
        <Skeleton className="h-[18px] w-16 rounded-bar" />
        <Skeleton className="h-[18px] w-24 rounded-bar" />
      </span>
    </div>
  )
}
