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

/** Story 2.7: the files tab's first load failed (any code, with 「重試」). */
export const FILES_LOAD_FAILED = '讀不到檔案清單'

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

/**
 * AD-8, AD-9, story 3.1: the codes a settings write handles itself (the
 * failure toast with 「重試」). Connection codes stay with the global
 * `onError`.
 */
export const SETTINGS_WRITE_FAILURE_CODES = [
  'settings_write_failed',
  'timeout',
  'invalid_input',
] as const satisfies ReadonlyArray<ErrorCode>

export type SettingsWriteFailureCode =
  (typeof SETTINGS_WRITE_FAILURE_CODES)[number]

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

/**
 * Story 2.7: the failure toast of a tick or a priority change in the files
 * tab, 「改檔案設定失敗：qBittorrent 拒絕這個操作」.
 */
export function fileActionFailureText(code: OperationFailureCode): string {
  return `改檔案設定失敗：${errorText(code)}`
}

/**
 * Story 3.1 (Claude 代決 wording): saving a picked sort failed,
 * 「排序沒記住：設定檔寫不進去」. The screen keeps the pick. A settings
 * write never touches qBittorrent, so its `timeout` names the container.
 */
export function sortSaveFailureText(code: SettingsWriteFailureCode): string {
  return `排序沒記住：${settingsWriteReason(code)}`
}

/**
 * Story 3.3 (Claude 代決 wording): saving the category order from the
 * settings page failed, 「順序沒存到：設定檔寫不進去」. The list keeps its
 * old order.
 */
export function orderSaveFailureText(code: SettingsWriteFailureCode): string {
  return `順序沒存到：${settingsWriteReason(code)}`
}

/** A settings write's reason; its `timeout` is the container's, not qBittorrent's. */
function settingsWriteReason(code: SettingsWriteFailureCode): string {
  return code === 'timeout' ? '容器沒有回應，請再試一次' : errorText(code)
}
