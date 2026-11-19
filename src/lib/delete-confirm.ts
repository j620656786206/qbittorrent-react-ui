import { formatCount, formatSize } from '#/lib/format'
import { goneKindOf, selectionTotal } from '#/lib/selection-total'
import type { GoneKind } from '#/lib/selection-total'
import type { SlimTorrent } from '#/shared/maindata'

// Story 4.3 (DESIGN and EXPERIENCE delete-confirm): every text the delete
// confirmation shows, and its rows. The rows follow the selection order
// (earliest tick first, never by size). The size counts only torrents whose
// files exist (`selectionTotal`): 已整理 and 找不到檔案 rows read their
// word in the size slot and add nothing.

export interface DeleteRow {
  hash: string
  name: string
  size: number
  /** Why its files are not there, or `null` when they are. */
  gone: GoneKind | null
}

export interface DeleteSummary {
  /** Selected torrents still in maindata. */
  count: number
  /** Their size, without 已整理 and 找不到檔案. */
  bytes: number
  /** How many are 找不到檔案. */
  missing: number
  /** How many are 已整理. */
  archived: number
}

type Torrents = Readonly<Record<string, SlimTorrent>>
type StateBeforeMove = Readonly<Record<string, string>>

/** The rows, in selection order; hashes gone from maindata are skipped. */
export function deleteRows(
  torrents: Torrents,
  hashes: ReadonlyArray<string>,
  stateBeforeMove: StateBeforeMove,
): Array<DeleteRow> {
  const rows: Array<DeleteRow> = []
  for (const hash of hashes) {
    if (!Object.hasOwn(torrents, hash)) continue
    const torrent = torrents[hash]
    rows.push({
      hash,
      name: torrent.name,
      size: torrent.size,
      gone: goneKindOf(torrent, stateBeforeMove),
    })
  }
  return rows
}

/** The count, the size and the gone-files counts per kind. */
export function deleteSummary(
  torrents: Torrents,
  hashes: ReadonlyArray<string>,
  stateBeforeMove: StateBeforeMove,
): DeleteSummary {
  const { count, bytes } = selectionTotal(torrents, hashes, stateBeforeMove)
  let missing = 0
  let archived = 0
  for (const hash of hashes) {
    if (!Object.hasOwn(torrents, hash)) continue
    const gone = goneKindOf(torrents[hash], stateBeforeMove)
    if (gone === 'missing') missing += 1
    else if (gone === 'archived') archived += 1
  }
  return { count, bytes, missing, archived }
}

/**
 * Every selected torrent's files are already gone. The delete then never
 * asks qBittorrent to delete files: a stale `missingFiles` (the NAS mount
 * came back) must not lose real files the button said were not there.
 */
export function filesAllGone(summary: DeleteSummary): boolean {
  return (
    summary.count > 0 && summary.missing + summary.archived === summary.count
  )
}

/** 「刪除 3,626 個種子？」 */
export function deleteTitle(count: number): string {
  return `刪除 ${formatCount(count)} 個種子？`
}

/**
 * The delete button: 「刪除 3 個種子和檔案（301.2 GB）」, 「只刪 3 個種子，
 * 檔案留著」, or 「刪除 3 個種子（檔案已經不在）」 with files when every
 * torrent's files are already gone (it never promises files that are not
 * there).
 */
export function deleteButtonText(
  summary: DeleteSummary,
  deleteFiles: boolean,
): string {
  const count = formatCount(summary.count)
  if (!deleteFiles) return `只刪 ${count} 個種子，檔案留著`
  if (filesAllGone(summary)) return `刪除 ${count} 個種子（檔案已經不在）`
  return `刪除 ${count} 個種子和檔案（${formatSize(summary.bytes)}）`
}

/** The pressed button while the call is out. */
export const DELETE_SENDING_TEXT = '刪除中…'

/**
 * The plain toast after a delete: 「已刪除 3 個種子和檔案（301.2 GB）」,
 * 「已刪除 3 個種子，檔案留著」, or 「已刪除 3 個種子」 when every torrent's
 * files were already gone.
 */
export function deleteSuccessText(
  summary: DeleteSummary,
  deleteFiles: boolean,
): string {
  const count = formatCount(summary.count)
  if (!deleteFiles) return `已刪除 ${count} 個種子，檔案留著`
  if (filesAllGone(summary)) return `已刪除 ${count} 個種子`
  return `已刪除 ${count} 個種子和檔案（${formatSize(summary.bytes)}）`
}

/**
 * The notes under the list, one per kind present: 「其中 2 個找不到檔案，
 * 只會刪種子」 and 「其中 1 個已整理，只會刪種子」.
 */
export function deleteGoneNotes(summary: DeleteSummary): Array<string> {
  const notes: Array<string> = []
  if (summary.missing > 0) {
    notes.push(`其中 ${formatCount(summary.missing)} 個找不到檔案，只會刪種子`)
  }
  if (summary.archived > 0) {
    notes.push(`其中 ${formatCount(summary.archived)} 個已整理，只會刪種子`)
  }
  return notes
}

/** What a gone row shows in its size slot. */
export const GONE_WORDS: Readonly<Record<GoneKind, string>> = {
  missing: '找不到檔案',
  archived: '已整理',
}

/** How many rows show before 「還有 N 個 ▾」. */
export const DELETE_PREVIEW_ROWS = 5

/** 「還有 3,621 個」, or `null` when every row already shows. */
export function deleteMoreText(count: number): string | null {
  const more = count - DELETE_PREVIEW_ROWS
  return more > 0 ? `還有 ${formatCount(more)} 個` : null
}
