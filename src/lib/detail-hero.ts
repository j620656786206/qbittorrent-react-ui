import {
  formatDate,
  formatDuration,
  formatEta,
  formatPercent,
  formatRatio,
  formatSize,
  formatSpeed,
} from '#/lib/format'
import { classify, heroKindOf, statusOfHeroKind } from '#/lib/torrent-status'
import type { ClassifyOptions, HeroKind } from '#/lib/torrent-status'
import type { SlimTorrent } from '#/shared/maindata'
import type { TorrentStatusId } from '#/shared/torrent-status'

// Story 2.5, EXPERIENCE 「詳情狀態區每種狀態寫什麼」: the detail hero's
// headline (status colour) and its one muted summary line, pure. The row
// comes from heroKindOf() in torrent-status.ts (never `torrent.state`);
// every number goes through format.ts; names and categories stay plain text.

/** Before getTorrentDetail's first answer (same as the info list). */
const LOADING = '…'

/** The headline's word and the number, with a full-width space between. */
const withNumber = (word: string, number: string) => `${word}\u3000${number}`

export interface DetailHero {
  /** The `status-*` colour of the headline and the circle. */
  status: TorrentStatusId
  headline: string
  /** The summary's parts (each one kept together on screen when it fits). */
  summaryParts: Array<string>
  /** The parts joined by 「 · 」. */
  summary: string
  circle: {
    status: TorrentStatusId
    /** 「下載中，87%」 or 「做種中」, like a list row's circle. */
    label: string
    /** 0 to 1 on the track for statuses that show progress, else `null`. */
    arcFraction: number | null
  }
}

export interface DetailHeroOptions extends ClassifyOptions {
  /**
   * getTorrentDetail's `uploaded` (the 做種中 summary): `undefined` before
   * the first answer (「…」), `null` when unknown (the part is left out).
   */
  uploaded: number | null | undefined
}

function clampFraction(progress: number): number {
  if (!(progress > 0)) return 0
  return Math.min(1, progress)
}

function headlineOf(kind: HeroKind, torrent: SlimTorrent): string {
  const percent = formatPercent(torrent.progress)
  switch (kind) {
    case 'downloading':
      return withNumber('下載中', percent)
    case 'meta':
      return '抓種子資訊中'
    case 'queued':
      return withNumber('排隊中', percent)
    case 'checking':
      return withNumber('檢查檔案中', percent)
    case 'paused':
      return withNumber('已暫停', percent)
    case 'stalled':
      return withNumber('停滯', percent)
    case 'seeding':
      return `做種 ${formatDuration(torrent.seeding_time)}`
    case 'done':
      return '已完成'
    case 'missing_files':
      return '找不到檔案'
    case 'error':
      return '錯誤'
    case 'unknown':
      return '狀態不明'
    case 'archived':
      return '已整理'
  }
}

/** The parts before size and category; `null` parts are left out. */
function leadOf(
  kind: HeroKind,
  torrent: SlimTorrent,
  { now, timeZone, uploaded }: DetailHeroOptions,
): Array<string | null> {
  const finished =
    torrent.completion_on > 0
      ? `${formatDate(torrent.completion_on, now, timeZone)} 下載好了`
      : '下載好了'
  const ratio = `分享率 ${formatRatio(torrent.ratio)}`
  switch (kind) {
    case 'downloading':
      return [
        formatEta(torrent.eta, torrent.dlspeed),
        torrent.dlspeed > 0 ? `↓ ${formatSpeed(torrent.dlspeed)}` : null,
      ]
    case 'paused':
      return ['手動暫停']
    case 'stalled':
      return ['沒有來源']
    case 'seeding':
      return [
        ratio,
        uploaded === undefined
          ? `已上傳 ${LOADING}`
          : uploaded === null
            ? null
            : `已上傳 ${formatSize(uploaded)}`,
      ]
    case 'done':
      return [finished, ratio]
    case 'missing_files':
      return ['做不了種']
    case 'archived':
      return ['留著當紀錄', torrent.completion_on > 0 ? finished : null]
    case 'meta':
    case 'queued':
    case 'checking':
    case 'unknown':
    case 'error':
      return []
  }
}

function summaryPartsOf(
  kind: HeroKind,
  torrent: SlimTorrent,
  options: DetailHeroOptions,
): Array<string> {
  // The fixed text until story 2.10, the same as classify().detail.
  if (kind === 'error') return ['qBittorrent 回報錯誤']
  const category = torrent.category === '' ? null : torrent.category
  const size = kind === 'meta' ? '還不知道大小' : formatSize(torrent.size)
  return [...leadOf(kind, torrent, options), size, category].filter(
    (part) => part !== null,
  )
}

export function detailHero(
  torrent: SlimTorrent,
  options: DetailHeroOptions,
): DetailHero {
  // The row decides the colour; classify() (whose status comes from the
  // same row) adds the word and whether a ring shows.
  const kind = heroKindOf(torrent, options.stateBeforeMove)
  const colour = statusOfHeroKind(kind)
  const status = classify(torrent, options)
  const summaryParts = summaryPartsOf(kind, torrent, options)
  return {
    status: colour,
    headline: headlineOf(kind, torrent),
    summaryParts,
    summary: summaryParts.join(' · '),
    circle: {
      status: colour,
      label: status.showsProgress
        ? `${status.word}，${formatPercent(torrent.progress)}`
        : status.word,
      arcFraction: status.showsProgress
        ? clampFraction(torrent.progress)
        : null,
    },
  }
}
