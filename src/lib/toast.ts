import {
  dismissToastFor,
  setToastLift,
  showFailureToast,
} from '#/shared/toast-store'

// AD-13, story 2.6: the only toast API. The spine allows three kinds: plain
// text (4 s), with a button (8 s) and a failure with 「重試」. Only the
// failure has a caller so far; the other two come with their first caller
// (Epic 3 and 4), not before. No success toast for pause, resume or file
// actions (EXPERIENCE): the next refresh is the feedback.

/**
 * A failure with 「重試」; stays until ✕ or 重試 (which closes it, then runs
 * `onRetry`). `keys` name what it is about, for `dismissFor`.
 */
function failure(
  text: string,
  { keys, onRetry }: { keys: ReadonlyArray<string>; onRetry: () => void },
): void {
  showFailureToast(text, keys, onRetry)
}

/** Closes the failure toast about `key`, if it still shows. */
function dismissFor(key: string): void {
  dismissToastFor(key)
}

/**
 * Story 4.1: while the desktop selection bar shows (`on`), toasts sit 16px
 * above it; `false` puts them back at the bottom.
 */
function setLift(on: boolean): void {
  setToastLift(on)
}

export const toast = Object.freeze({ failure, dismissFor, setLift })
