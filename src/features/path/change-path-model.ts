import { savePathFormatReason } from '#/lib/error-text'
import { currentCommonPath, listedCommonPath, locationLabel } from '#/lib/paths'
import { normalizeSavePath } from '#/shared/save-path'
import { MAX_COMMON_PATH_NAME } from '#/shared/settings'
import type { AddCommonPathInput, CommonPath } from '#/shared/settings'

// Story 5.2 (EXPERIENCE change-path): what the change-path screen shows for
// one torrent, from the 「會搬到」 box, the torrent's save path and the
// common paths. Path matching only through src/lib/paths.ts.

export const CHANGE_PATH_TITLE = '改路徑'
export const MOVE_BUTTON_TEXT = '搬過去'
export const MOVE_SENDING_TEXT = '搬移中…'
export const COMMON_PATHS_HEADER = '常用路徑'
export const ADD_COMMON_PATH_TEXT = '加到常用'
export const BOX_LABEL = '會搬到'
export const MEDIA_LIBRARY_TAG = '媒體庫'
export const CURRENT_TAG = '目前'
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
  /** 搬過去 cannot be pressed (bad format, or the box is where it is). */
  moveDisabled: boolean
}

export function changePathView({
  box,
  savePath,
  commonPaths,
}: {
  box: string
  savePath: string
  commonPaths: ReadonlyArray<CommonPath>
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
    moveDisabled: reason !== null || target === normalizeSavePath(savePath),
  }
}

/** At most MAX_COMMON_PATH_NAME UTF-16 units, never half a character. */
function fitName(name: string): string {
  const characters = Array.from(name)
  while (characters.join('').length > MAX_COMMON_PATH_NAME) characters.pop()
  return characters.join('')
}

/**
 * What 「加到常用」 sends: the normalized box path, named by its last two
 * folders (cut to the 50-character name bound, Claude 代決), not a media
 * library.
 */
export function addCommonPathInput(target: string): AddCommonPathInput {
  return {
    path: target,
    name: fitName(locationLabel(target)),
    mediaLibrary: false,
  }
}
