import type { ReactNode, Ref } from 'react'
import { formatCount } from '#/lib/format'
import { cn } from '#/shared/ui/cn'
import type { BoardColumn } from '#/lib/torrent-status'
import type { SlimTorrent } from '#/shared/maindata'
import { StatusCircle } from '#/shared/ui/status-circle'
import { COLUMN_META } from '#/features/board/board-model'
import { CardList } from '#/features/board/card-list'
import type { CardLayout, CardPin } from '#/features/board/card-list'

// DESIGN board-column (mockup S01-list-desktop): `surface-muted`, radius
// 22px; the header is the 28px status circle, the column name
// (`column-title`) and the muted count, with the order as its tooltip (an
// explanation, not a control: memlog #127). The body scrolls by itself
// (12px sides, cards 10px apart) and is virtualized. Story 4.1: the cards
// carry the selection checkbox, so the first card starts 10px down (the
// checkbox pokes 6px above it, plus its focus outline), and 110px stay
// under the last one so the selection bar never covers it.
//
// Story 2.8 (demo `.col .bg`): the `surface-muted` background is its own
// layer behind the content, so the auto-collapse can widen or narrow it
// with `scaleX` while text is never scaled. The content sits above every
// column's background (z 1 over z 0), so a strip's background still
// shrinking never covers its neighbour's cards.

/** Room above a desktop column's first card (story 4.1: its checkbox). */
export const COLUMN_PADDING_START = 10
/** Room under the last card: the selection bar's 110px (story 4.1). */
export const COLUMN_PADDING_END = 110

export const COLUMN_CLASS =
  'relative flex min-h-0 min-w-0 flex-col rounded-panel'

export const COLUMN_HEADER_CLASS =
  'relative z-[1] m-0 flex flex-none items-center gap-2 px-4 pt-3.5 pb-2 text-column-title'

/** A column's section with its background layer (`data-column-bg`). */
export function ColumnShell({
  column,
  label,
  className,
  sectionRef,
  children,
}: {
  column: BoardColumn
  label: string
  className?: string
  sectionRef?: Ref<HTMLElement>
  children: ReactNode
}) {
  return (
    <section
      ref={sectionRef}
      aria-label={label}
      data-column={column}
      className={cn(COLUMN_CLASS, className)}
    >
      <div
        aria-hidden="true"
        data-column-bg=""
        className="pointer-events-none absolute inset-0 z-0 origin-top-left rounded-panel bg-surface-muted"
      />
      {children}
    </section>
  )
}

/** The header's inside: circle, name, count. */
export function ColumnTitle({
  column,
  count,
}: {
  column: BoardColumn
  /** `null` while loading: a 24 x 12 placeholder. */
  count: ReactNode
}) {
  const meta = COLUMN_META[column]
  return (
    <>
      <StatusCircle status={meta.circle} arcFraction={null} size={28} />
      <span>{meta.name}</span>
      {count}
    </>
  )
}

export function CountText({ count }: { count: number }) {
  return (
    <span className="font-normal text-text-muted tabular-nums">
      {formatCount(count)}
    </span>
  )
}

export interface BoardColumnViewProps {
  column: BoardColumn
  hashes: ReadonlyArray<string>
  torrents: Readonly<Record<string, SlimTorrent>>
  stateBeforeMove: Readonly<Record<string, string>>
  today: number
  /** What the column says when empty (`emptyText`). */
  empty: string
  /** Replaces the plain header (the expanded 已整理 header is a button). */
  header?: ReactNode
  sectionRef?: Ref<HTMLElement>
  /** Story 2.8: the column's scroll body, for the auto-collapse. */
  bodyRef?: Ref<HTMLDivElement>
  layout?: CardLayout
  pin?: CardPin | null
  hereHash?: string | null
  hereMs?: number
}

export function BoardColumnView({
  column,
  hashes,
  torrents,
  stateBeforeMove,
  today,
  empty,
  header,
  sectionRef,
  bodyRef,
  layout,
  pin,
  hereHash,
  hereMs,
}: BoardColumnViewProps) {
  const meta = COLUMN_META[column]
  return (
    <ColumnShell
      column={column}
      sectionRef={sectionRef}
      label={`${meta.name}，${formatCount(hashes.length)} 個`}
    >
      {header ?? (
        <h2
          title={meta.order}
          data-column-head=""
          className={COLUMN_HEADER_CLASS}
        >
          <ColumnTitle
            column={column}
            count={<CountText count={hashes.length} />}
          />
        </h2>
      )}
      <CardList
        hashes={hashes}
        torrents={torrents}
        stateBeforeMove={stateBeforeMove}
        today={today}
        empty={empty}
        label={meta.name}
        paddingStart={COLUMN_PADDING_START}
        paddingEnd={COLUMN_PADDING_END}
        selectable
        // The section no longer clips (its background layer scales past it
        // during the collapse), so the body clips itself to the column's
        // rounded bottom corners, scrollbar included.
        className="relative z-[1] flex-1 rounded-b-panel px-3"
        // Keyboard users scroll the column like a phone panel.
        bodyProps={{ role: 'group', tabIndex: 0, 'aria-label': meta.name }}
        bodyRef={bodyRef}
        layout={layout}
        pin={pin}
        hereHash={hereHash}
        hereMs={hereMs}
      />
    </ColumnShell>
  )
}
