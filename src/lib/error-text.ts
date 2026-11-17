import { ERROR_MESSAGES } from '#/shared/errors'
import type { ErrorCode } from '#/shared/errors'
import { PAUSE_ACTION_WORDS } from '#/lib/torrent-status'
import type { PauseAction } from '#/lib/torrent-status'

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

/**
 * AD-9: the codes an operation handles itself (with its failure toast and
 * 「重試」). Login-stop and connection codes and `bad_origin` belong to the
 * global `onError` only.
 */
export const OPERATION_FAILURE_CODES = [
  'qbit_rejected',
  'timeout',
  'invalid_input',
] as const satisfies ReadonlyArray<ErrorCode>

export type OperationFailureCode = (typeof OPERATION_FAILURE_CODES)[number]

export function isOperationFailureCode(
  code: ErrorCode,
): code is OperationFailureCode {
  return (OPERATION_FAILURE_CODES as ReadonlyArray<ErrorCode>).includes(code)
}

/**
 * Story 2.6: the failure toast of 暫停 or 繼續, 「暫停失敗：qBittorrent 拒絕這
 * 個操作」, the reason from the code's fixed text.
 */
export function pauseActionFailureText(
  action: PauseAction,
  code: OperationFailureCode,
): string {
  return `${PAUSE_ACTION_WORDS[action]}失敗：${errorText(code)}`
}
