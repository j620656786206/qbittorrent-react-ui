import { useEffect, useRef } from 'react'
import type { Ref } from 'react'
import { formatCount } from '#/lib/format'
import type { SlimTorrent } from '#/shared/maindata'
import {
  BoardColumnView,
  COLUMN_HEADER_CLASS,
  ColumnTitle,
  CountText,
} from '#/features/board/board-column'
import { COLUMN_META } from '#/features/board/board-model'
import type { CardLayout, CardPin } from '#/features/board/card-list'
import { CollapsedStrip } from '#/features/board/collapsed-strip'

// The 已整理 column (EXPERIENCE 已整理欄, DESIGN board-column-collapsed,
// mockup S01-list-desktop): desktop only, the 5th column, collapsed by
// default into a 64px strip: the grey archive-box circle, the count (12px,
// `text-muted`) and 「已整理」 written vertically (14px/700). The strip is one
// button (`aria-expanded`); click or Enter expands it into a normal column
// as wide as the other four, ordered by completion time. Its header is then
// a button that collapses it again (Claude 代決 in the epic). Focus moves to
// the other button each time, so it never drops to `body`.

const META = COLUMN_META.archived

export interface ArchivedColumnProps {
  hashes: ReadonlyArray<string>
  torrents: Readonly<Record<string, SlimTorrent>>
  stateBeforeMove: Readonly<Record<string, string>>
  today: number
  expanded: boolean
  onExpandedChange: (expanded: boolean) => void
  /** Story 2.8: expanded, it can be the auto-collapse's wide column. */
  bodyRef?: Ref<HTMLDivElement>
  layout?: CardLayout
  pin?: CardPin | null
  hereHash?: string | null
  hereMs?: number
}

export function ArchivedColumn({
  hashes,
  torrents,
  stateBeforeMove,
  today,
  expanded,
  onExpandedChange,
  bodyRef,
  layout,
  pin,
  hereHash,
  hereMs,
}: ArchivedColumnProps) {
  const toggleRef = useRef<HTMLButtonElement>(null)
  const toggled = useRef(false)
  const count = formatCount(hashes.length)

  // After Alex toggles, focus follows to the button that is there now.
  useEffect(() => {
    if (!toggled.current) return
    toggled.current = false
    toggleRef.current?.focus()
  }, [expanded])

  const toggle = (next: boolean) => {
    toggled.current = true
    onExpandedChange(next)
  }

  if (expanded) {
    return (
      <BoardColumnView
        column="archived"
        hashes={hashes}
        torrents={torrents}
        stateBeforeMove={stateBeforeMove}
        today={today}
        empty={META.empty}
        bodyRef={bodyRef}
        layout={layout}
        pin={pin}
        hereHash={hereHash}
        hereMs={hereMs}
        header={
          <h2 data-column-head="" className="relative z-[1] m-0 flex flex-none">
            <button
              ref={toggleRef}
              type="button"
              aria-expanded="true"
              aria-label={`收合已整理欄，${count} 個`}
              title={META.order}
              onClick={() => toggle(false)}
              className={`${COLUMN_HEADER_CLASS} w-full rounded-panel text-left text-text hover-ring`}
            >
              <ColumnTitle
                column="archived"
                count={<CountText count={hashes.length} />}
              />
            </button>
          </h2>
        }
      />
    )
  }

  return (
    <CollapsedStrip
      column="archived"
      count={hashes.length}
      label={`展開已整理欄，${count} 個`}
      sectionLabel="已整理欄"
      onPress={() => toggle(true)}
      expands
      buttonRef={toggleRef}
    />
  )
}
