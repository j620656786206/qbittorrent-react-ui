import type { ReactNode, Ref } from 'react'
import { formatCount } from '#/lib/format'
import type { BoardColumn } from '#/lib/torrent-status'
import type { SlimTorrent } from '#/shared/maindata'
import { StatusCircle } from '#/shared/ui/status-circle'
import { COLUMN_META } from '#/features/board/board-model'
import { CardList } from '#/features/board/card-list'

// DESIGN board-column (mockup S01-list-desktop): `surface-muted`, radius
// 22px; the header is the 28px status circle, the column name
// (`column-title`) and the muted count, with the order as its tooltip (an
// explanation, not a control: memlog #127). The body scrolls by itself
// (padding 4px 12px 12px, cards 10px apart) and is virtualized.

export const COLUMN_CLASS =
  'flex min-h-0 min-w-0 flex-col overflow-hidden rounded-panel bg-surface-muted'

export const COLUMN_HEADER_CLASS =
  'm-0 flex flex-none items-center gap-2 px-4 pt-3.5 pb-2 text-column-title'

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
}: BoardColumnViewProps) {
  const meta = COLUMN_META[column]
  return (
    <section
      ref={sectionRef}
      aria-label={`${meta.name}，${formatCount(hashes.length)} 個`}
      className={COLUMN_CLASS}
    >
      {header ?? (
        <h2 title={meta.order} className={COLUMN_HEADER_CLASS}>
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
        paddingStart={4}
        paddingEnd={12}
        className="flex-1 px-3"
        // Keyboard users scroll the column like a phone panel.
        bodyProps={{ role: 'group', tabIndex: 0, 'aria-label': meta.name }}
      />
    </section>
  )
}
