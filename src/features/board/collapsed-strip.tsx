import type { Ref } from 'react'
import { formatCount } from '#/lib/format'
import type { BoardColumn } from '#/lib/torrent-status'
import { cn } from '#/shared/ui/cn'
import { StatusCircle } from '#/shared/ui/status-circle'
import { ColumnShell } from '#/features/board/board-column'
import { COLUMN_META } from '#/features/board/board-model'

// DESIGN board-column-collapsed (mockup S01-list-desktop): a 64px strip, one
// real button (focusable, Enter and Space): the 28px status circle, the
// count (12px, `text-muted`) and the column name written vertically
// (14px/700, `writing-mode: vertical-rl`); hover adds the 1px `text-faint`
// inset ring. Story 2.3's collapsed 已整理 column, and since story 2.8 every
// column the auto-collapse narrows (`appear` fades its content in once the
// column has shrunk, demo `.col.collapsed .strip`).

export interface CollapsedStripProps {
  column: BoardColumn
  count: number
  /** The button's accessible name: 「展開已整理欄，3,737 個」. */
  label: string
  onPress: () => void
  /** The section's accessible name. */
  sectionLabel?: string
  appear?: boolean
  buttonRef?: Ref<HTMLButtonElement>
}

export function CollapsedStrip({
  column,
  count,
  label,
  onPress,
  sectionLabel,
  appear = false,
  buttonRef,
}: CollapsedStripProps) {
  const meta = COLUMN_META[column]
  return (
    <ColumnShell
      column={column}
      label={sectionLabel ?? `${meta.name}欄`}
      className="flex-row"
    >
      <button
        ref={buttonRef}
        type="button"
        aria-expanded="false"
        aria-label={label}
        title={meta.order}
        onClick={onPress}
        className={cn(
          'relative z-[1] flex flex-1 flex-col items-center gap-2.5 rounded-panel py-3.5 text-text hover-ring',
          appear && 'animate-strip-in',
        )}
      >
        <StatusCircle status={meta.circle} arcFraction={null} size={28} />
        <span className="text-meta whitespace-nowrap text-text-muted tabular-nums">
          {formatCount(count)}
        </span>
        <span className="text-[14px] leading-[1.2] font-bold tracking-[.08em] [writing-mode:vertical-rl]">
          {meta.name}
        </span>
      </button>
    </ColumnShell>
  )
}
