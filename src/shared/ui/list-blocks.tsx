import {
  CENTER_BLOCK_BUTTON_CLASS,
  CENTER_BLOCK_CLASS,
  CENTER_BLOCK_TEXT_CLASS,
} from '#/shared/ui/center-block'
import { getMain } from '#/shared/ui/main-scroll'
import { useRestoreFocusOnUnmount } from '#/shared/ui/restore-focus'

// The torrent content's empty and first-load error blocks (spec 1.8 option
// A, mockups S01-no-result-desktop / S02-no-result-phone). Shared because
// the list and the board (story 2.3) show the same two blocks and features
// never import each other. The error text comes from src/lib/error-text.ts
// through the caller (src/shared may not import src/lib).

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
  message,
  onRetry,
  busy,
}: {
  /** `LIST_LOAD_FAILED` from src/lib/error-text.ts. */
  message: string
  onRetry: () => void
  busy: boolean
}) {
  const focusProps = useRestoreFocusOnUnmount(getMain)

  return (
    <section aria-label="種子列表" className={BLOCK_CLASS}>
      <p role="alert" className={CENTER_BLOCK_TEXT_CLASS}>
        {message}
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
