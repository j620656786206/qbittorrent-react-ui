import { memo } from 'react'
import { ArrowDown, ArrowUp } from 'lucide-react'
import { cn } from '#/shared/ui/cn'
import { Skeleton } from '#/shared/ui/skeleton'
import { LocationTag } from '#/shared/ui/location-tag'
import { StatusCircle } from '#/shared/ui/status-circle'
import { useLongPress } from '#/state/long-press'
import type { LongPressHandlers } from '#/state/long-press'
import type { SelectionShift } from '#/state/selection'
import { ROW_HEIGHT, rowModel } from '#/features/list/list-model'
import type { BigValue, RowModel, RowProps } from '#/features/list/list-model'

// DESIGN list-row (mockups S01-list-mode-desktop, S02-list-mode-phone).
// Story 2.4: a row is a button that opens the detail (`onOpen` sets the
// URL's `hash`); hover is `surface-muted`, the viewed row has
// `aria-current="true"` and the 2px inset brand-accent ring (keyboard focus
// is the outline outside, so the two never look alike). Desktop: the 20px
// checkbox slot (empty, `aria-hidden`), the circle, name and second line,
// the 「分享率」 column (hidden while sorting by ratio) and the big number,
// which follows the sort (story 2.1). Phone: no slot, no visible ratio
// column (screen readers keep it); the second line wraps inside a one-line
// box, so the speed drops first, then the size; the location tag always
// stays (at most half the line).
// Story 4.1: a selected row has the `selection-row` background, which hover
// never changes. The desktop checkbox is not in here (no control inside the
// row's button): torrent-list.tsx draws it in the row's `group/item`
// wrapper, over the 20px slot, so hovering it still shows the row's hover.
// Story 4.2: on the phone a long press (src/state/long-press.ts) ticks the
// row and starts selection mode, and while selecting the row makes 28px of
// room on its left for the checkbox torrent-list.tsx draws there (10px in,
// as in mockup S07-delete-phone). The room is padding, set at once; the
// content slides into it (`select-shift-in`, and `-out` back) only when
// the mode has just changed, so a row mounted later is already in place.
// Names and details are JSX text, never HTML or links.

export interface RowActionProps {
  /** The detail shows this row (the ring, `aria-current`). */
  viewing: boolean
  /** Story 4.1: the row is ticked (the `selection-row` background). */
  selected: boolean
  /** Stable: opens this row's torrent in the detail (phone selecting: toggles it). */
  onOpen: (hash: string) => void
  /** Story 4.2: a long press is armed (phone, nothing selected). */
  longPress?: boolean
  /** Stable: what a long press does, with this row's hash. */
  onLongPress?: (hash: string) => void
  /** Story 4.2: phone selection mode, the 28px room for the checkbox. */
  phoneSelecting?: boolean
  /** Story 4.2: the mode just changed on the phone (the content slides). */
  shift?: SelectionShift
}

const NOTHING = () => {}

/** Story 4.2: the content slide when phone selection mode just changed. */
export const SHIFT_CLASS: Readonly<Record<'in' | 'out', string>> = {
  in: 'animate-select-shift-in',
  out: 'animate-select-shift-out',
}

/** A box of fixed height on both breakpoints, so a short line cannot shrink it. */
export const TorrentRow = memo(function Row({
  torrent,
  stateBeforeMove,
  today,
  sort,
  sortValue,
  errorReason,
  viewing,
  selected,
  onOpen,
  longPress = false,
  onLongPress = NOTHING,
  phoneSelecting = false,
  shift = null,
}: RowProps & RowActionProps) {
  const press = useLongPress({
    enabled: longPress,
    onFire: () => onLongPress(torrent.hash),
  })
  const model = rowModel(torrent, {
    now: today,
    stateBeforeMove: stateBeforeMove ? { [torrent.hash]: stateBeforeMove } : {},
    sort,
    sortValue,
    errorReason,
  })
  return (
    <RowContent
      model={model}
      viewing={viewing}
      selected={selected}
      onOpen={() => onOpen(torrent.hash)}
      press={press}
      phoneSelecting={phoneSelecting}
      shift={shift}
    />
  )
})

/** The row from a fixed model (tests render this directly). */
export function RowContent({
  model,
  viewing = false,
  selected = false,
  onOpen,
  press,
  phoneSelecting = false,
  shift = null,
}: {
  model: RowModel
  viewing?: boolean
  selected?: boolean
  onOpen?: () => void
  /** Story 4.2: the long press's pointer handlers. */
  press?: LongPressHandlers
  phoneSelecting?: boolean
  shift?: SelectionShift
}) {
  return (
    <button
      type="button"
      aria-current={viewing ? 'true' : 'false'}
      // Story 2.9: the element that rises in the entrance.
      data-entrance=""
      onClick={onOpen}
      {...press}
      style={{ height: ROW_HEIGHT }}
      className={cn(
        'box-border flex w-full items-center gap-2 rounded-row px-2.5 py-[9px] text-left text-text lg:gap-2.5 lg:px-3',
        // 10px, the 20px checkbox and an 8px gap (S07-delete-phone).
        phoneSelecting && 'pl-[38px]',
        selected
          ? 'bg-selection-row'
          : 'hover-row lg:group-hover/item:bg-surface-muted',
        viewing && 'viewing-ring',
      )}
    >
      <span aria-hidden="true" className="hidden size-5 flex-none lg:block" />
      <span
        className={cn(
          'flex min-w-0 flex-1 items-center gap-2.5 lg:gap-3',
          shift !== null && SHIFT_CLASS[shift],
        )}
      >
        <StatusCircle {...model.circle} />
        <span className="flex min-w-0 flex-1 flex-col gap-[3px]">
          <span
            title={model.name}
            className="truncate text-row-name leading-[18px]"
          >
            {model.name}
          </span>
          <SecondLine model={model} />
        </span>
        {/* Phone has no column but screen readers still get the ratio.
            Sorting by ratio: the big number is the ratio, no column. */}
        {model.showRatio && (
          <span className="w-[76px] flex-none text-right text-[12px] leading-[1.4] whitespace-nowrap text-text-muted tabular-nums max-lg:sr-only">
            分享率{' '}
            <b
              className={cn(
                'font-semibold',
                model.ratio.good ? 'text-good' : 'text-text',
              )}
            >
              {model.ratio.text}
            </b>
          </span>
        )}
        <BigValueCell value={model.value} />
      </span>
    </button>
  )
}

const BIG_VALUE_CLASS: Record<BigValue['style'], string> = {
  number: 'text-row-value tabular-nums',
  text: 'text-body',
  path: 'text-body',
  hash: 'font-mono text-path',
}

/**
 * The big number (DESIGN list-row): at most 160px, cut with 「…」. A path
 * is cut from the front: the box runs right to left and the path inside is
 * an isolated left-to-right run, so the overflow drops its start.
 */
function BigValueCell({ value }: { value: BigValue }) {
  const isPath = value.style === 'path'
  return (
    <span
      dir={isPath ? 'rtl' : undefined}
      title={
        value.style === 'number' || value.loading
          ? undefined
          : (value.title ?? value.text)
      }
      className={cn(
        'max-w-[160px] flex-none truncate text-right',
        BIG_VALUE_CLASS[value.style],
        value.muted && 'text-text-muted',
        value.good && 'text-good',
      )}
    >
      <span className="sr-only">{value.label} </span>
      {value.loading ? (
        <Skeleton className="inline-block h-2.5 w-12 rounded-[5px] align-middle" />
      ) : isPath ? (
        <bdi dir="ltr">{value.text}</bdi>
      ) : (
        value.text
      )}
    </span>
  )
}

function SecondLine({ model }: { model: RowModel }) {
  const { errorDetail, movingDetail, speed } = model
  // An error row's reason replaces size and speed on phone (S02).
  const phoneHidden = errorDetail !== null ? 'max-lg:hidden' : undefined
  return (
    <span className="flex h-5 min-w-0 items-center gap-x-2 gap-y-0 overflow-hidden text-tag whitespace-nowrap text-text-muted tabular-nums max-lg:flex-wrap">
      <LocationTag
        label={model.tag}
        className="max-w-1/2 flex-none rounded-full border px-2 py-px lg:max-w-none"
      />
      {movingDetail !== null && (
        <span className="flex-none">{movingDetail}</span>
      )}
      <span className={cn('flex-none', phoneHidden)}>{model.size}</span>
      {errorDetail !== null && (
        // Phone: no width of its own when wrapping, so it stays on the line
        // and ellipsizes instead of dropping.
        // `title`: a long reason (story 2.10) is cut on the line.
        <span
          title={errorDetail}
          className="flex-none truncate max-lg:min-w-0 max-lg:flex-1 max-lg:basis-0"
        >
          {errorDetail}
        </span>
      )}
      {speed !== null && (
        <span
          className={cn(
            'inline-flex flex-none items-center gap-0.5',
            phoneHidden,
          )}
        >
          {speed.direction === 'down' ? (
            <ArrowDown
              size={11}
              strokeWidth={2.6}
              aria-hidden="true"
              className="flex-none text-status-downloading"
            />
          ) : (
            <ArrowUp
              size={11}
              strokeWidth={2.6}
              aria-hidden="true"
              className="flex-none text-status-seeding"
            />
          )}
          <span className="sr-only">
            {speed.direction === 'down' ? '下載' : '上傳'}
          </span>
          {speed.text}
        </span>
      )}
    </span>
  )
}
