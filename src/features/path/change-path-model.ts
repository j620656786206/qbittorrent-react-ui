import { savePathFormatReason } from '#/lib/error-text'
import { currentCommonPath, listedCommonPath } from '#/lib/paths'
import { normalizeSavePath } from '#/shared/save-path'
import { commonPathNameSchema } from '#/shared/settings'
import type { CommonPath } from '#/shared/settings'

// Story 5.2 (EXPERIENCE change-path): what the change-path screen shows for
// one torrent, from the 「會搬到」 box, the torrent's save path and the
// common paths. Path matching only through src/lib/paths.ts. Story 5.4:
// edit mode's texts and what a finished inline rename does.

export const CHANGE_PATH_TITLE = '改路徑'
export const MOVE_BUTTON_TEXT = '搬過去'
export const MOVE_SENDING_TEXT = '搬移中…'
export const COMMON_PATHS_HEADER = '常用路徑'
export const ADD_COMMON_PATH_TEXT = '加到常用'
export const BOX_LABEL = '會搬到'
export const MEDIA_LIBRARY_TAG = '媒體庫'
export const CURRENT_TAG = '目前'
/**
 * Review of 5.1 to 5.3 (Claude 代決): under the box while the torrent is
 * moving (isMovingTorrent), when 「搬過去」 waits for the move to end.
 */
export const MOVING_NOTE = '正在搬移中，搬完才能再改路徑'
/** Story 5.4: the pill right of 「常用路徑」, and while in edit mode. */
export const EDIT_TEXT = '編輯'
export const DONE_TEXT = '完成'
/** Story 5.4: the ✕'s tooltip in edit mode. */
export const REMOVE_TOOLTIP = '從常用拿掉（不動檔案）'
/** Story 5.4: the accessible names in edit mode, per row. */
export const renameLabel = (name: string) => `改名：${name}`
export const mediaLibraryLabel = (name: string) => `媒體庫：${name}`
export const removeLabel = (name: string) => `從常用拿掉：${name}`
export const nameInputLabel = (path: string) => `${path} 的名稱`
/** Beside a disabled 「加到常用」 whose path is already listed. */
export const ALREADY_LISTED_TEXT = {
  desktop: '框裡的路徑已經在清單裡',
  phone: '已在清單裡',
} as const

export interface ChangePathView {
  /** The box, trimmed and normalized: what 搬過去 and 加到常用 send. */
  target: string
  /** The line under the box, `null` when the format is fine. */
  reason: string | null
  /** The row whose path is the box's (the first of duplicates), or `null`. */
  selected: CommonPath | null
  /** The row the torrent is in now (longest match), or `null`. */
  current: CommonPath | null
  /** MOVING_NOTE while the torrent moves and the format is fine, else `null`. */
  movingNote: string | null
  /**
   * 搬過去 cannot be pressed (bad format, the box is where it is, or the
   * torrent is moving).
   */
  moveDisabled: boolean
}

export function changePathView({
  box,
  savePath,
  commonPaths,
  moving,
}: {
  box: string
  savePath: string
  commonPaths: ReadonlyArray<CommonPath>
  /** isMovingTorrent of the torrent. */
  moving: boolean
}): ChangePathView {
  // A pasted path's outer spaces never reach qBittorrent (a folder name
  // ending in a space).
  const typed = box.trim()
  const target = normalizeSavePath(typed)
  const reason = savePathFormatReason(typed)
  return {
    target,
    reason,
    selected: listedCommonPath(target, commonPaths),
    current: currentCommonPath(savePath, commonPaths),
    movingNote: moving && reason === null ? MOVING_NOTE : null,
    moveDisabled:
      moving || reason !== null || target === normalizeSavePath(savePath),
  }
}

/**
 * Story 5.4: what Enter or blur does with an inline rename. The name is
 * trimmed; the same name as now sends nothing (the input just closes), a
 * name the shared schema refuses (blank, over 50 characters, a control
 * character) is not sent and the input stays with the `delete` border.
 */
export type RenameOutcome =
  { kind: 'unchanged' } | { kind: 'invalid' } | { kind: 'send'; name: string }

export function renameOutcome(text: string, name: string): RenameOutcome {
  const trimmed = text.trim()
  if (trimmed === name) return { kind: 'unchanged' }
  return commonPathNameSchema.safeParse(trimmed).success
    ? { kind: 'send', name: trimmed }
    : { kind: 'invalid' }
}
