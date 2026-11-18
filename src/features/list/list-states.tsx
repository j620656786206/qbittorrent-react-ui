import { LIST_LOAD_FAILED } from '#/lib/error-text'
import { ListLoadError as LoadErrorBlock } from '#/shared/ui/list-blocks'
import { Skeleton } from '#/shared/ui/skeleton'
import { ROW_HEIGHT, SKELETON_ROWS } from '#/features/list/list-model'

// The list's states other than rows (FR-15, UX-DR88, UX-DR90): row-sized
// skeletons on the first load (no spinner), the centered empty block and
// the first-load error block (spec 1.8 option A). The two blocks live in
// src/shared/ui/list-blocks.tsx since story 2.3 (the board shows them too).

/**
 * The list section box (S01/S02 list-mode), shared with the rows. Phone:
 * 4px wider on each side than the page column (12px from the screen edges,
 * DESIGN page-phone-list), square bottom corners.
 */
export const LIST_SECTION_CLASS =
  'min-h-full rounded-panel bg-surface p-1 max-lg:-mx-1 max-lg:rounded-b-none lg:p-2'

/**
 * Story 2.4: the list with rows scrolls itself (`main` does not), so the
 * desktop detail panel beside it can fill the height. The section is the
 * same box, as tall as `main`; the padding moves to the scroller inside.
 */
export const LIST_ROWS_SECTION_CLASS =
  'flex h-full min-h-0 flex-col overflow-hidden rounded-panel bg-surface max-lg:-mx-1 max-lg:rounded-b-none'

export const LIST_SCROLL_CLASS =
  'min-h-0 flex-1 overflow-y-auto overscroll-contain p-1 [scrollbar-width:thin] lg:p-2'

/**
 * DESIGN 列表加詳情 (mockup S01-list-mode-desktop): the list at most 560px on
 * the left, the detail panel takes the rest, 16px apart; both as tall as
 * `main`, each scrolling itself.
 */
export const LIST_DETAIL_GRID_CLASS =
  'grid h-full min-h-0 grid-cols-[minmax(0,560px)_minmax(0,1fr)] grid-rows-[minmax(0,1fr)] gap-4'

/** The row box without content: same height and padding as a data row. */
function SkeletonRow() {
  return (
    <div
      style={{ height: ROW_HEIGHT }}
      className="box-border flex flex-none items-center gap-2 px-2.5 py-[9px] lg:gap-2.5 lg:px-3"
    >
      <span className="hidden size-5 flex-none lg:block" />
      <div className="flex min-w-0 flex-1 items-center gap-2.5 lg:gap-3">
        <Skeleton className="size-9 rounded-[18px]" />
        <span className="flex min-w-0 flex-1 flex-col gap-1.5">
          <Skeleton className="h-3 w-[88%] rounded-[6px]" />
          <Skeleton className="h-2.5 w-[52%] rounded-[5px]" />
        </span>
        <span className="hidden w-[76px] flex-none justify-end lg:flex">
          <Skeleton className="h-3 w-14 rounded-[6px]" />
        </span>
        <Skeleton className="h-[18px] w-[72px] rounded-[6px]" />
      </div>
    </div>
  )
}

export function ListSkeleton() {
  return (
    <section
      aria-label="種子列表，載入中"
      aria-busy="true"
      className={LIST_SECTION_CLASS}
    >
      <div aria-hidden="true" className="flex flex-col gap-0.5">
        {Array.from({ length: SKELETON_ROWS }, (_, index) => (
          <SkeletonRow key={index} />
        ))}
      </div>
    </section>
  )
}

export { ListEmpty, ListNoResult } from '#/shared/ui/list-blocks'

/** The first-load error block with the list's text. */
export function ListLoadError(props: { onRetry: () => void; busy: boolean }) {
  return <LoadErrorBlock message={LIST_LOAD_FAILED} {...props} />
}
