import { NO_VALUE, formatCount, formatDate, formatSize } from '#/lib/format'
import type { DetailPosition } from '#/lib/detail-position'
import type { SlimTorrent } from '#/shared/maindata'
import type { TorrentDetail } from '#/shared/torrent-detail'

// Story 2.4: the detail's text, pure, so it is tested in node. Every value
// goes through src/lib/format.ts; names and categories stay plain text.

/**
 * 「第 4 個／共 19 個」; on the board the column comes first with a
 * full-width space (U+3000): 「做種中」 + space + 「第 3 個／共 80 個」.
 */
export function positionText(
  position: Pick<DetailPosition, 'index' | 'total'>,
  columnName?: string | null,
): string {
  const text = `第 ${formatCount(position.index + 1)} 個／共 ${formatCount(position.total)} 個`
  return columnName ? `${columnName}\u3000${text}` : text
}

export interface InfoRow {
  label: string
  value: string
  /** 「沒有」: drawn in `text-muted`. */
  muted: boolean
}

const row = (label: string, value: string): InfoRow => ({
  label,
  value,
  muted: value === NO_VALUE || value === LOADING_VALUE,
})

/** A detail field whose first answer has not come yet (Claude 代決). */
export const LOADING_VALUE = '…'

/**
 * UX-DR46, DESIGN 詳情由上到下: the overview's info list, in order. 分類
 * empty is 「沒有」; times of 0 or less (never completed) are 「沒有」.
 * 已下載 and 已上傳 come from getTorrentDetail (spine AD-6 detail exception,
 * Alex 2026-11-17), not the slim table: `undefined` while the first answer
 * is on its way (「…」), `null` when qBittorrent has not said (「沒有」).
 */
export function infoRows(
  torrent: SlimTorrent,
  now: number,
  detail: TorrentDetail | null | undefined,
): Array<InfoRow> {
  const traffic = (name: keyof TorrentDetail) =>
    detail === undefined ? LOADING_VALUE : formatSize(detail?.[name])
  return [
    row('分類', torrent.category === '' ? NO_VALUE : torrent.category),
    row('大小', formatSize(torrent.size)),
    row('加入時間', formatDate(torrent.added_on, now)),
    row('完成時間', formatDate(torrent.completion_on, now)),
    row('已下載', traffic('downloaded')),
    row('已上傳', traffic('uploaded')),
  ]
}
