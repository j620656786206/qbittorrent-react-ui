import { LIST_LOAD_FAILED } from '#/lib/error-text'
import {
  CENTER_BLOCK_BUTTON_CLASS,
  CENTER_BLOCK_CLASS,
  CENTER_BLOCK_TEXT_CLASS,
} from '#/shared/ui/center-block'
import { getMain } from '#/shared/ui/main-scroll'
import { useRestoreFocusOnUnmount } from '#/shared/ui/restore-focus'
import { Skeleton } from '#/shared/ui/skeleton'
import { ROW_HEIGHT, SKELETON_ROWS } from '#/features/list/list-model'

// The list's states other than rows (FR-15, UX-DR88, UX-DR90): row-sized
// skeletons on the first load (no spinner), the centered empty block and
// the first-load error block (spec 1.8 option A). The blocks follow
// S01-no-result-desktop / S02-no-result-phone.

/**
 * The list section box (S01/S02 list-mode), shared with the rows. Phone:
 * 4px wider on each side than the page column (12px from the screen edges,
 * DESIGN page-phone-list), square bottom corners.
 */
export const LIST_SECTION_CLASS =
  'min-h-full rounded-panel bg-surface p-1 max-lg:-mx-1 max-lg:rounded-b-none lg:p-2'

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

/** S01/S02 no-result block; phone edges and corners like the list section. */
const BLOCK_CLASS = `${CENTER_BLOCK_CLASS} max-lg:-mx-1 max-lg:rounded-b-none`

/** No visible torrent: 「這個分類沒有種子」 and the disabled 「新增種子」. */
export function ListEmpty() {
  return (
    <section aria-label="種子列表，共 0 個" className={BLOCK_CLASS}>
      <p role="status" className={CENTER_BLOCK_TEXT_CLASS}>
        這個分類沒有種子
      </p>
      {/* Epic 1 placeholder: native `disabled` like the header's 新增. */}
      <button type="button" disabled className={CENTER_BLOCK_BUTTON_CLASS}>
        新增種子
      </button>
    </section>
  )
}

/**
 * The first load failed with no alert of its own (option A). 「重試」 fetches
 * once; when the block goes while its button has focus, focus moves to
 * `main` (not `body`).
 */
export function ListLoadError({
  onRetry,
  busy,
}: {
  onRetry: () => void
  busy: boolean
}) {
  const focusProps = useRestoreFocusOnUnmount(getMain)

  return (
    <section aria-label="種子列表" className={BLOCK_CLASS}>
      <p role="alert" className={CENTER_BLOCK_TEXT_CLASS}>
        {LIST_LOAD_FAILED}
      </p>
      <button
        {...focusProps}
        type="button"
        onClick={onRetry}
        aria-busy={busy || undefined}
        className={CENTER_BLOCK_BUTTON_CLASS}
      >
        重試
      </button>
    </section>
  )
}
