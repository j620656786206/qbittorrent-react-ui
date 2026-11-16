import { memo } from 'react'
import { ArrowDown, ArrowUp } from 'lucide-react'
import { cn } from '#/shared/ui/cn'
import { Skeleton } from '#/shared/ui/skeleton'
import { ROW_HEIGHT, rowModel } from '#/features/list/list-model'
import type { BigValue, RowModel, RowProps } from '#/features/list/list-model'
import { StatusCircle } from '#/features/list/status-circle'

// DESIGN list-row (mockups S01-list-mode-desktop, S02-list-mode-phone).
// Epic 1 rows have no click, no hover, no cursor change and are not
// focusable: plain boxes, Epic 2 adds the click. Desktop: the 20px
// checkbox slot (empty, `aria-hidden`), the circle, name and second line,
// the 「分享率」 column (hidden while sorting by ratio) and the big number,
// which follows the sort (story 2.1). Phone: no slot, no visible ratio
// column (screen readers keep it); the second line wraps inside a one-line
// box, so the speed drops first, then the size; the location tag always
// stays (at most half the line).
// Names and details are JSX text, never HTML or links.

/** A box of fixed height on both breakpoints, so a short line cannot shrink it. */
export const TorrentRow = memo(function Row({
  torrent,
  stateBeforeMove,
  today,
  sort,
  sortValue,
}: RowProps) {
  const model = rowModel(torrent, {
    now: today,
    stateBeforeMove: stateBeforeMove ? { [torrent.hash]: stateBeforeMove } : {},
    sort,
    sortValue,
  })
  return <RowContent model={model} />
})

/** The row from a fixed model (tests render this directly). */
export function RowContent({ model }: { model: RowModel }) {
  return (
    <div
      style={{ height: ROW_HEIGHT }}
      className="box-border flex items-center gap-2 rounded-row px-2.5 py-[9px] lg:gap-2.5 lg:px-3"
    >
      <span aria-hidden="true" className="hidden size-5 flex-none lg:block" />
      <div className="flex min-w-0 flex-1 items-center gap-2.5 lg:gap-3">
        <StatusCircle {...model.circle} />
        <div className="flex min-w-0 flex-1 flex-col gap-[3px]">
          <span
            title={model.name}
            className="truncate text-row-name leading-[18px]"
          >
            {model.name}
          </span>
          <SecondLine model={model} />
        </div>
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
      </div>
    </div>
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
      <span className="inline-flex max-w-1/2 min-w-0 flex-none items-center gap-1 rounded-full border px-2 py-px lg:max-w-none">
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
        <span className="min-w-0 truncate">{model.tag}</span>
      </span>
      {movingDetail !== null && (
        <span className="flex-none">{movingDetail}</span>
      )}
      <span className={cn('flex-none', phoneHidden)}>{model.size}</span>
      {errorDetail !== null && (
        // Phone: no width of its own when wrapping, so it stays on the line
        // and ellipsizes instead of dropping.
        <span className="flex-none truncate max-lg:min-w-0 max-lg:flex-1 max-lg:basis-0">
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
