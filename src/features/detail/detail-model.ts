import {
  NO_VALUE,
  formatAgo,
  formatCount,
  formatDate,
  formatRatio,
  formatSize,
  formatSpeed,
  formatTimeLeft,
} from '#/lib/format'
import type { DetailPosition } from '#/lib/detail-position'
import type { SlimTorrent } from '#/shared/maindata'
import type { TorrentStatusId } from '#/shared/torrent-status'
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

export interface StatTile {
  title: string
  value: string
  /** No value (「沒有」, 「不明」, 「沒人抓過」) or 「…」: `text-muted`. */
  muted: boolean
}

const MUTED_TILE_VALUES: ReadonlySet<string> = new Set([
  NO_VALUE,
  LOADING_VALUE,
  '不明',
  '沒人抓過',
])

const tile = (title: string, value: string): StatTile => ({
  title,
  value,
  muted: MUTED_TILE_VALUES.has(value),
})

/** A peer count: qBittorrent's -1 or a missing value is 「沒有」. */
function peerCount(
  detail: TorrentDetail | null | undefined,
  name: 'num_seeds' | 'num_leechs',
): string {
  if (detail === undefined) return LOADING_VALUE
  const value = detail?.[name]
  return value === null || value === undefined || value < 0
    ? NO_VALUE
    : formatCount(value)
}

/**
 * Story 2.5, EXPERIENCE 「數字小卡依狀態換」: the three stat tiles by
 * status group. 下載中 (with 抓資訊, 排隊, 檢查), 已暫停, 停滯: 下載速度,
 * 剩餘時間, 來源數; 做種中, 已完成: 現在上傳, 在抓的人, 最後有人抓; 錯誤
 * (all three kinds) and 已整理: 大小, 完成時間, 分享率. 來源數 and 在抓的人
 * are qBittorrent's connected seeds and leechers from getTorrentDetail
 * (`undefined` before the first answer: 「…」). `today` is for dates,
 * `now` (the minute tick) for 「3 天前」.
 */
export function statTiles(
  torrent: SlimTorrent,
  status: TorrentStatusId,
  { today, now }: { today: number; now: number },
  detail: TorrentDetail | null | undefined,
): [StatTile, StatTile, StatTile] {
  switch (status) {
    case 'downloading':
    case 'paused':
    case 'stalled':
      return [
        tile('下載速度', formatSpeed(torrent.dlspeed)),
        tile('剩餘時間', formatTimeLeft(torrent.eta, torrent.dlspeed)),
        tile('來源數', peerCount(detail, 'num_seeds')),
      ]
    case 'seeding':
    case 'done':
      return [
        tile('現在上傳', formatSpeed(torrent.upspeed)),
        tile('在抓的人', peerCount(detail, 'num_leechs')),
        tile(
          '最後有人抓',
          torrent.last_activity > 0
            ? formatAgo(torrent.last_activity, now)
            : '沒人抓過',
        ),
      ]
    case 'error':
    case 'archived':
      return [
        tile('大小', formatSize(torrent.size)),
        tile('完成時間', formatDate(torrent.completion_on, today)),
        tile('分享率', formatRatio(torrent.ratio)),
      ]
  }
}
