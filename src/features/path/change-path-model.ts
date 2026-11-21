import { savePathFormatReason } from '#/lib/error-text'
import { currentCommonPath, listedCommonPath } from '#/lib/paths'
import { normalizeSavePath } from '#/shared/save-path'
import { commonPathNameSchema } from '#/shared/settings'
import type { CommonPath } from '#/shared/settings'

// Story 5.2 (EXPERIENCE change-path): what the change-path screen shows for
// one torrent, from the 「會搬到」 box, the torrent's save path and the
// common paths. Path matching only through src/lib/paths.ts. Story 5.4:
// edit mode's texts and what a finished inline rename does. Story 5.5: the
// many-torrent view (two or more hashes, from the selection bar).

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

/** Story 5.5: the title of a many-torrent move, 「搬 5 個種子」. */
export const manyTitle = (count: number) => `搬 ${count} 個種子`
/** Story 5.5: under it, 「5 個種子現在在 2 個位置」. */
export const manySubtitle = (count: number, locations: number) =>
  `${count} 個種子現在在 ${locations} 個位置`
/** Story 5.5: a row holding `count` torrents of the batch, 「目前 3 個」. */
export const currentCountTag = (count: number) => `${CURRENT_TAG} ${count} 個`
/** Story 5.5: the failure view's primary, 「重試 2 個」. */
export const retryManyLabel = (count: number) => `重試 ${count} 個`

/** What both modes answer about the 「會搬到」 box. */
export interface PathBoxView {
  /** The box, trimmed and normalized: what 搬過去 and 加到常用 send. */
  target: string
  /** The line under the box, `null` when the format is fine. */
  reason: string | null
  /** The row whose path is the box's (the first of duplicates), or `null`. */
  selected: CommonPath | null
  /** 搬過去 cannot be pressed. */
  moveDisabled: boolean
}

export interface ChangePathView extends PathBoxView {
  /** The row the torrent is in now (longest match), or `null`. */
  current: CommonPath | null
  /** MOVING_NOTE while the torrent moves and the format is fine, else `null`. */
  movingNote: string | null
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

/** Story 5.5: one torrent of a many-torrent move, as the view needs it. */
export interface BatchTorrent {
  hash: string
  save_path: string
}

export interface ManyChangePathView extends PathBoxView {
  /**
   * 「目前 K 個」: how many torrents of the batch each row holds now, by
   * the same longest match as 「目前」; rows holding none are absent.
   */
  currentCounts: ReadonlyMap<CommonPath, number>
  /** Distinct normalized save paths in the batch. */
  locationCount: number
  /** The hashes not already at the target, in batch order: what is sent. */
  toSend: Array<string>
}

/**
 * Story 5.5: the many-torrent view. The box starts empty, and empty is no
 * reason line (nothing typed yet) but cannot be sent. 搬過去 is disabled
 * when the box is empty, fails the shared path schema, or every torrent
 * is already at the target. Torrents already moving are sent anyway: the
 * container refuses them, and the failure view names them.
 */
export function manyChangePathView({
  box,
  torrents,
  commonPaths,
}: {
  box: string
  torrents: ReadonlyArray<BatchTorrent>
  commonPaths: ReadonlyArray<CommonPath>
}): ManyChangePathView {
  const typed = box.trim()
  const target = normalizeSavePath(typed)
  const reason = typed === '' ? null : savePathFormatReason(typed)
  // Each distinct raw save path is normalized and matched once.
  const byRaw = new Map<string, { path: string; count: number }>()
  for (const torrent of torrents) {
    const seen = byRaw.get(torrent.save_path)
    if (seen) seen.count += 1
    else {
      byRaw.set(torrent.save_path, {
        path: normalizeSavePath(torrent.save_path),
        count: 1,
      })
    }
  }
  const locations = new Set<string>()
  const currentCounts = new Map<CommonPath, number>()
  for (const [raw, { path, count }] of byRaw) {
    locations.add(path)
    const current = currentCommonPath(raw, commonPaths)
    if (current !== null) {
      currentCounts.set(current, (currentCounts.get(current) ?? 0) + count)
    }
  }
  const toSend =
    typed === '' || reason !== null
      ? []
      : torrents
          .filter((torrent) => byRaw.get(torrent.save_path)?.path !== target)
          .map((torrent) => torrent.hash)
  return {
    target,
    reason,
    selected: listedCommonPath(target, commonPaths),
    currentCounts,
    locationCount: locations.size,
    toSend,
    moveDisabled: toSend.length === 0,
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
