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
// through the caller (src/shared may not import src/lib). Story 3.5: the
// search's no-result block (EXPERIENCE 搜尋沒結果), its text from
// src/lib/name-search.ts through the caller too. Story 4.6: 「新增種子」
// opens the add screen through the caller's `onAdd` (src/shared may not
// import src/state).

/** S01/S02 no-result block; phone edges and corners like the list section. */
const BLOCK_CLASS = `${CENTER_BLOCK_CLASS} max-lg:-mx-1 max-lg:rounded-b-none`

/** No visible torrent: 「這個分類沒有種子」 and 「新增種子」 (`onAdd`). */
export function ListEmpty({ onAdd }: { onAdd: () => void }) {
  return (
    <section aria-label="種子列表，共 0 個" className={BLOCK_CLASS}>
      <p role="status" className={CENTER_BLOCK_TEXT_CLASS}>
        這個分類沒有種子
      </p>
      <button
        type="button"
        aria-haspopup="dialog"
        onClick={onAdd}
        className={CENTER_BLOCK_BUTTON_CLASS}
      >
        新增種子
      </button>
    </section>
  )
}

/**
 * Story 3.5, mockups S01-no-result-desktop, S02-no-result-phone: no name
 * holds the keyword. One line (plain text) and, outside 「全部」, the
 * outline button 「在全部裡找」 (`onSearchAll`). When the block goes while
 * its button has focus, focus moves to `main` (not `body`).
 */
export function ListNoResult({
  text,
  onSearchAll,
}: {
  /** `noResultText(query, category)` from src/lib/name-search.ts. */
  text: string
  /** Switches to 「全部」 keeping the keyword; absent in 「全部」. */
  onSearchAll?: () => void
}) {
  const focusProps = useRestoreFocusOnUnmount(getMain)
  return (
    <section aria-label="搜尋結果" className={BLOCK_CLASS}>
      {/* A long keyword without spaces wraps anywhere (no sideways scroll). */}
      <p
        role="status"
        className={`${CENTER_BLOCK_TEXT_CLASS} max-w-full [overflow-wrap:anywhere]`}
      >
        {text}
      </p>
      {onSearchAll && (
        <button
          {...focusProps}
          type="button"
          onClick={onSearchAll}
          className={CENTER_BLOCK_BUTTON_CLASS}
        >
          在全部裡找
        </button>
      )}
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
