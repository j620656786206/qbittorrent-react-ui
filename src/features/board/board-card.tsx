import { memo } from 'react'
import type { TagLocation } from '#/lib/paths'
import type { SlimTorrent } from '#/shared/maindata'
import { cn } from '#/shared/ui/cn'
import { Skeleton } from '#/shared/ui/skeleton'
import { LocationTag } from '#/shared/ui/location-tag'
import { StatusCircle } from '#/shared/ui/status-circle'
import { useLongPress } from '#/state/long-press'
import type { LongPressHandlers } from '#/state/long-press'
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
// stalled. The 4px progress bar for those three (its width is the
// progress; story 2.9's entrance grows the fill from the left with the
// ring, `data-progress-bar`, and raises the card, `data-entrance`). Then
// the category tag (only when there is one) and the location tag. Fixed
// heights (board-model.ts), so the column's virtualizer never measures.
// Story 2.4: the card is a button that opens the detail (`onOpen` sets the
// URL's `hash`), with the 1px `text-faint` inset hover ring. Story 4.1: a
// selected card has the `selection-row` background; its desktop checkbox
// sits outside the button, in card-list.tsx's wrapper (no control nested in
// a button, and the card's `overflow-hidden` would clip it). Story 4.2: on
// the phone a long press (src/state/long-press.ts) ticks the card and
// starts selection mode. Names and lines are JSX text, never HTML.

/** Status colour of the bar fill; Tailwind needs whole class names. */
const BAR_FILL: Readonly<Record<string, string>> = {
  downloading: 'bg-status-downloading',
  paused: 'bg-status-paused',
  stalled: 'bg-status-stalled',
}

const CARD_CLASS =
  'box-border flex flex-col gap-2 overflow-hidden rounded-card bg-surface px-3.5 py-3 shadow-card'

const CARD_BUTTON_CLASS = `${CARD_CLASS} w-full text-left text-text hover-ring`

/** Story 4.1: the ticked card's background. */
const CARD_SELECTED_CLASS = cn(CARD_BUTTON_CLASS, 'bg-selection-row')

/** The box both tags share; the category tag adds its outline and colour. */
const TAG_BOX_CLASS =
  'inline-flex h-5 min-w-0 items-center gap-1 rounded-full px-2 text-tag leading-4 whitespace-nowrap'

const CATEGORY_TAG_CLASS = cn(
  TAG_BOX_CLASS,
  'max-w-1/2 flex-none border text-text-muted',
)

export interface BoardCardProps {
  /** The merged object: unchanged torrents keep their reference. */
  torrent: SlimTorrent
  /** This torrent's `stateBeforeMove` entry, if it is moving. */
  stateBeforeMove: string | undefined
  /** Changes only at local midnight (`useDayClock().today`). */
  today: number
  /**
   * Story 2.10: this torrent's reason (a string, so the card re-renders
   * only when its own reason changes); `undefined` for none.
   */
  errorReason?: string
  /**
   * Story 5.1: the resolver's object for this torrent's `save_path`; a new
   * one (a changed path or common paths) re-renders the card.
   */
  location: TagLocation
  /** Story 4.1: the card is ticked (the `selection-row` background). */
  selected?: boolean
  /** Stable: opens this card's torrent in the detail (phone selecting: toggles it). */
  onOpen: (hash: string) => void
  /** Story 4.2: a long press is armed (phone, nothing selected). */
  longPress?: boolean
  /** Stable: what a long press does, with this card's hash. */
  onLongPress?: (hash: string) => void
}

const NOTHING = () => {}

/** Keyed by hash and memoized: a poll that leaves the torrent alone skips it. */
export const BoardCard = memo(function Card({
  torrent,
  stateBeforeMove,
  today,
  errorReason,
  location,
  selected = false,
  onOpen,
  longPress = false,
  onLongPress = NOTHING,
}: BoardCardProps) {
  const press = useLongPress({
    enabled: longPress,
    onFire: () => onLongPress(torrent.hash),
  })
  const model = cardModel(torrent, {
    now: today,
    stateBeforeMove:
      stateBeforeMove !== undefined ? { [torrent.hash]: stateBeforeMove } : {},
    errorReason,
    location,
  })
  return (
    <CardContent
      model={model}
      selected={selected}
      onOpen={() => onOpen(torrent.hash)}
      press={press}
    />
  )
})

/** The card from a fixed model (tests render this directly). */
export function CardContent({
  model,
  selected = false,
  onOpen,
  press,
}: {
  model: CardModel
  selected?: boolean
  onOpen?: () => void
  /** Story 4.2: the long press's pointer handlers. */
  press?: LongPressHandlers
}) {
  const { circle, progress } = model
  return (
    <button
      type="button"
      data-entrance=""
      onClick={onOpen}
      {...press}
      style={{ height: cardHeight(model) }}
      className={selected ? CARD_SELECTED_CLASS : CARD_BUTTON_CLASS}
    >
      <span className="flex h-[37px] w-full flex-none items-start gap-2.5">
        <StatusCircle {...circle} size={32} />
        <span className="flex min-w-0 flex-1 flex-col gap-0.5">
          <span
            title={model.name}
            className="truncate text-row-name leading-[18px]"
          >
            {model.name}
          </span>
          {/* `title`: a long reason (story 2.10) is cut on the card. */}
          <span
            title={model.detailTitle ?? undefined}
            className="truncate text-meta leading-[17px] text-text-muted tabular-nums"
          >
            {model.detail}
          </span>
        </span>
        {model.percent !== null && (
          <span className="flex-none text-card-value tabular-nums">
            {model.percent}
          </span>
        )}
      </span>
      {progress !== null && (
        <span
          aria-hidden="true"
          className="block h-1 w-full flex-none overflow-hidden rounded-bar bg-track"
        >
          <span
            data-progress-bar=""
            className={cn(
              'block h-full origin-left rounded-bar',
              BAR_FILL[circle.status],
            )}
            style={{ width: `${progress * 100}%` }}
          />
        </span>
      )}
      <span className="flex h-5 w-full min-w-0 flex-none gap-1.5 overflow-hidden">
        {model.category !== null && (
          <span className={CATEGORY_TAG_CLASS}>
            <span className="min-w-0 truncate">{model.category}</span>
          </span>
        )}
        <LocationTag
          label={model.location.name}
          mediaLibrary={model.location.mediaLibrary}
          className={cn(TAG_BOX_CLASS, 'flex-initial')}
        />
      </span>
    </button>
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
