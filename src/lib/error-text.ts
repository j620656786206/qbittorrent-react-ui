import { ERROR_MESSAGES } from '#/shared/errors'
import type { ErrorCode } from '#/shared/errors'
import { PAUSE_ACTION_WORDS } from '#/lib/torrent-status'
import type { PauseAction } from '#/lib/torrent-status'
import {
  MAX_SAVE_PATH,
  normalizeSavePath,
  savePathSchema,
} from '#/shared/save-path'

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
 * Story 4.3: the failure toast of a delete, 「刪除失敗：qBittorrent 拒絕這個
 * 操作」, the reason from the code's fixed text (2.6's pattern).
 */
export function deleteFailureText(code: OperationFailureCode): string {
  return `刪除失敗：${errorText(code)}`
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

/**
 * Story 4.7: the failure toast of an add that failed as a whole,
 * 「新增失敗：qBittorrent 拒絕這個操作」 (4.3's pattern).
 */
export function addFailureText(code: OperationFailureCode): string {
  return `新增失敗：${errorText(code)}`
}

/** Story 4.7 (Claude 代決): a rejected .torrent file's row reason. */
export const ADD_FILE_REJECTED = 'qBittorrent 讀不了這個檔案'
/** Story 4.7 (Claude 代決): a rejected magnet link's row reason. */
export const ADD_LINK_REJECTED = 'qBittorrent 拒絕這個連結'

/**
 * Story 4.7 (Claude 代決): a row whose request failed in the browser before
 * qBittorrent answered anything (never a qBittorrent refusal).
 */
export const ADD_NOT_SENT = '沒有送出，請再試一次'

/**
 * Story 4.7: why one entry of an add failed, shown under its row. A
 * rejection names what qBittorrent refused (the file or the link); any
 * other code is its fixed text (`timeout`: 「qBittorrent 沒有回應，請再試
 * 一次」).
 */
export function addItemFailureText(
  code: ErrorCode,
  kind: 'magnet' | 'file',
): string {
  if (code === 'qbit_rejected') {
    return kind === 'file' ? ADD_FILE_REJECTED : ADD_LINK_REJECTED
  }
  return errorText(code)
}

/**
 * Story 5.2 (Claude 代決): why a move the container refused as
 * `invalid_input` failed: the path passed the shared schema in the
 * browser, so it is outside `SAVE_ROOTS` (or the torrent is unknown).
 */
export const MOVE_OUTSIDE_ROOTS = '這個路徑不在允許的下載資料夾底下'

/**
 * Story 5.2: the failure toast of a move, 「改路徑失敗：qBittorrent 拒絕這
 * 個操作」 (4.3's pattern); `invalid_input` names the download folders.
 */
export function setLocationFailureText(code: OperationFailureCode): string {
  const reason = code === 'invalid_input' ? MOVE_OUTSIDE_ROOTS : errorText(code)
  return `改路徑失敗：${reason}`
}

/** Story 5.2: the 51st common path (`invalid_input` with 50 listed). */
export const COMMON_PATHS_FULL = '常用路徑最多 50 個'

/**
 * Story 5.2 (Claude 代決 wording): 「加到常用」 failed. With 50 paths
 * listed an `invalid_input` is the list being full, with fewer it is the
 * path outside the download folders (MOVE_OUTSIDE_ROOTS); any other answer
 * is a settings write's reason (3.1's), 「沒加到常用：設定檔寫不進去」.
 */
export function addCommonPathFailureText(
  code: SettingsWriteFailureCode,
  full: boolean,
): string {
  if (code === 'invalid_input') {
    // The name is built here, so a refused input is the path: outside
    // `SAVE_ROOTS` (the box already passed the shared schema).
    return full ? COMMON_PATHS_FULL : `沒加到常用：${MOVE_OUTSIDE_ROOTS}`
  }
  return `沒加到常用：${settingsWriteReason(code)}`
}

/** Story 5.2 (Claude 代決): why the 「會搬到」 box cannot be sent. */
export const SAVE_PATH_REASONS = Object.freeze({
  relative: '路徑要從 / 開頭',
  dotDot: '路徑不能有 ..',
  tooLong: '路徑太長',
  badCharacter: '路徑不能有反斜線或控制字元',
})

/**
 * Story 5.2: the line under the 「會搬到」 box, or `null` when the shared
 * path schema accepts the text. One reason, the first that applies in
 * this order: empty or relative, a `..` segment, over 1024 characters
 * (after normalizing, like the schema), a backslash or control character.
 */
export function savePathFormatReason(text: string): string | null {
  if (savePathSchema.safeParse(text).success) return null
  const path = normalizeSavePath(text)
  if (!path.startsWith('/')) return SAVE_PATH_REASONS.relative
  if (path.split('/').includes('..')) return SAVE_PATH_REASONS.dotDot
  if (path.length > MAX_SAVE_PATH) return SAVE_PATH_REASONS.tooLong
  // What is left for the schema to refuse: a backslash or control character.
  return SAVE_PATH_REASONS.badCharacter
}
