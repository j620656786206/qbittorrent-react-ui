import {
  dismissToastFor,
  setToastLift,
  showFailureToast,
  showPlainToast,
} from '#/shared/toast-store'

// AD-13, story 2.6: the only toast API. The spine allows three kinds: plain
// text (4 s), with a button (8 s) and a failure with 「重試」. Story 4.3
// adds the plain kind (its first caller: 「已刪除 …」); the one with a
// button comes with its first caller. No success toast for pause, resume
// or file actions (EXPERIENCE): the next refresh is the feedback.

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

/** Plain text for 4 s, no button but ✕; replaces whatever shows. */
function plain(text: string): void {
  showPlainToast(text)
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

export const toast = Object.freeze({ failure, plain, dismissFor, setLift })
