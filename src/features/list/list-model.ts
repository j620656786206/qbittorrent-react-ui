import { isFirstLoadError } from '#/lib/app-error'
import {
  formatDate,
  formatPercent,
  formatRatio,
  formatRowSpeed,
  formatSize,
  isGoodRatio,
} from '#/lib/format'
import { locationLabel } from '#/lib/paths'
import { classify } from '#/lib/torrent-status'
import type { Maindata } from '#/lib/maindata-merge'
import type { TorrentStatusId } from '#/lib/torrent-status'
import type { SlimTorrent } from '#/shared/maindata'

// Spec 1.8 rows R1 to R6, C1 to C3, V1 to V4, M1: everything a list row and
// the list's state show, pure, so the rows are tested in node. Status, word,
// ring and error text come only from classify(); numbers only from
// format.ts; the location only from locationLabel(). All text is plain text.

/**
 * One row box, skeleton and data, both breakpoints: whole pixels so rows
 * never sit on half pixels (S01/S02 list-mode draw about 58.6px):
 * 18 name line + 3 gap + 20 second line + 18 padding.
 */
export const ROW_HEIGHT = 59
/** The gap between rows. */
export const ROW_GAP = 2
/** Skeleton rows on the first load. */
export const SKELETON_ROWS = 12

/** The ring's circumference: radius 16.5 in the 36px circle. */
export const RING_RADIUS = 16.5
export const RING_CIRCUMFERENCE = 2 * Math.PI * RING_RADIUS

export type ListView = 'skeleton' | 'error' | 'empty' | 'rows'

/**
 * V1 to V4. Without data: the first-load error state when the failure has
 * no other surface (option A), skeletons otherwise (pending, or a code the
 * alert bar or the login screen shows). With data a failed poll changes
 * nothing (old data stays).
 */
export function listView({
  hasData,
  visibleCount,
  error,
}: {
  hasData: boolean
  visibleCount: number
  /** The maindata query's error (`null` when the last fetch succeeded). */
  error: unknown
}): ListView {
  if (!hasData) return isFirstLoadError(error) ? 'error' : 'skeleton'
  return visibleCount === 0 ? 'empty' : 'rows'
}

export interface RowSpeed {
  direction: 'down' | 'up'
  /** 「6.21 MB/s」 */
  text: string
}

export interface RowModel {
  circle: {
    status: TorrentStatusId
    /** Screen reader text: 「停滯，87%」 or 「做種中」. */
    label: string
    /** 0 to 1 for a progress ring (on `track`), `null` for a full ring. */
    arcFraction: number | null
  }
  name: string
  /** The location tag: the last two path segments. */
  tag: string
  size: string
  /** Under 100%: ↓ download speed, otherwise ↑ upload; `null` at 0. */
  speed: RowSpeed | null
  ratio: { text: string; good: boolean }
  /** The big value on the right: the added time (Epic 1's fixed sort). */
  value: string
  /** classify()'s reason on an error row; replaces size and speed on phone. */
  errorDetail: string | null
  /** 「搬移中」 while qBittorrent moves the files (EXPERIENCE 搬移中). */
  movingDetail: string | null
}

export interface RowModelOptions {
  /** Epoch ms; any instant of the current local day. */
  now: number
  /** IANA zone; the runtime's local zone when left out. */
  timeZone?: string
  /** `Maindata.stateBeforeMove` (or just this torrent's entry). */
  stateBeforeMove: Readonly<Record<string, string>>
}

function clampFraction(progress: number): number {
  if (!(progress > 0)) return 0
  return Math.min(1, progress)
}

export function rowModel(
  torrent: SlimTorrent,
  { now, timeZone, stateBeforeMove }: RowModelOptions,
): RowModel {
  const status = classify(torrent, { now, timeZone, stateBeforeMove })
  const downloading = torrent.progress < 1
  const speedText = formatRowSpeed(
    downloading ? torrent.dlspeed : torrent.upspeed,
  )
  return {
    circle: {
      status: status.status,
      label: status.showsProgress
        ? `${status.word}，${formatPercent(torrent.progress)}`
        : status.word,
      arcFraction: status.showsProgress
        ? clampFraction(torrent.progress)
        : null,
    },
    name: torrent.name,
    tag: locationLabel(torrent.save_path),
    size: formatSize(torrent.size),
    speed:
      speedText === null
        ? null
        : { direction: downloading ? 'down' : 'up', text: speedText },
    ratio: {
      text: formatRatio(torrent.ratio),
      good: isGoodRatio(torrent.ratio),
    },
    value: formatDate(torrent.added_on, now, timeZone),
    // A move keeps the status but replaces the line with 「搬移中」 (once).
    errorDetail:
      status.status === 'error' && !status.moving ? status.detail : null,
    movingDetail: status.moving ? status.detail : null,
  }
}

/** The ring's `stroke-dashoffset` for a fraction: C x (1 - fraction). */
export function ringOffset(arcFraction: number): number {
  return RING_CIRCUMFERENCE * (1 - arcFraction)
}

export interface RowProps {
  /** The merged object: unchanged torrents keep their reference (M1). */
  torrent: SlimTorrent
  /** This torrent's `stateBeforeMove` entry, if it is moving. */
  stateBeforeMove: string | undefined
  /** `today()`'s value: changes only when the local date changes. */
  today: number
}

/**
 * What the memoized row gets. Every prop keeps its identity across polls
 * when the torrent did not change, so the row does not re-render.
 */
export function rowProps(
  maindata: Pick<Maindata, 'torrents' | 'stateBeforeMove'>,
  hash: string,
  today: number,
): RowProps | null {
  if (!Object.hasOwn(maindata.torrents, hash)) return null
  return {
    torrent: maindata.torrents[hash],
    stateBeforeMove: Object.hasOwn(maindata.stateBeforeMove, hash)
      ? maindata.stateBeforeMove[hash]
      : undefined,
    today,
  }
}
