import {
  dismissToast,
  setToastLift as setLift,
  showToast,
} from '#/shared/ui/toaster'

// AD-13, story 2.6: the only toast API features use, the three kinds the
// spine allows: plain text (4 s), with a button (8 s, held while the
// pointer is over it) and a failure with 「重試」 (stays until closed). The
// renderer and its store live in src/shared/ui/toaster.tsx, which only this
// file and the root import (lint). No success toast for pause, resume or
// file actions (EXPERIENCE): the next refresh is the feedback.

/** A plain line, gone after 4 s. */
function info(text: string): void {
  showToast({ kind: 'info', text })
}

/** A line with a pill (「去看」, 「接著改檔名」), gone after 8 s. */
function action(
  text: string,
  { label, onAction }: { label: string; onAction: () => void },
): void {
  showToast({ kind: 'action', text, button: { label, onPress: onAction } })
}

/**
 * A failure with 「重試」; stays until ✕ or 重試 (which then runs). Returns
 * `dismiss`, which closes this toast only if it is still the one showing
 * (a newer toast is never closed by it).
 */
function failure(
  text: string,
  { onRetry }: { onRetry: () => void },
): { dismiss: () => void } {
  const id = showToast({
    kind: 'failure',
    text,
    button: { label: '重試', onPress: onRetry },
  })
  return { dismiss: () => dismissToast(id) }
}

export const toast = Object.freeze({ info, action, failure })

/**
 * Desktop: lift the toast 16px above a bar `px` tall (Epic 4's selection
 * bar); 0 puts it back in the corner.
 */
export function setToastLift(px: number): void {
  setLift(px)
}
