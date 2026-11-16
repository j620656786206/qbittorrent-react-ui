import { ERROR_MESSAGES } from '#/shared/errors'
import type { ErrorCode } from '#/shared/errors'

// AR-33, UX-DR96: the only place screen text for an error code comes from.
// The wording lives once, in the error contract's fixed messages; later
// stories add per-operation text here, on top of this table.
export const ERROR_TEXT: Readonly<Record<ErrorCode, string>> = ERROR_MESSAGES

export function errorText(code: ErrorCode): string {
  return ERROR_TEXT[code]
}

/**
 * Spec 1.8 option A: the list's first load failed with a code that has no
 * alert (the files tab's 「讀不到檔案清單」 wording).
 */
export const LIST_LOAD_FAILED = '讀不到種子清單'
