import { isFirstLoadError } from '#/lib/app-error'
import { reasonOf } from '#/lib/error-reason'
import {
  formatPercent,
  formatRatio,
  formatRowSpeed,
  formatSize,
  formatSortValue,
  hasNoSortValue,
  isGoodRatio,
} from '#/lib/format'
import { NO_COMMON_PATHS_RESOLVER } from '#/lib/paths'
import type { LocationResolver, TagLocation } from '#/lib/paths'
import { slimSortValue } from '#/lib/sort-values'
import { circleOf, classify } from '#/lib/torrent-status'
import type { Maindata } from '#/lib/maindata-merge'
import type {
  StatusCircleModel,
  TorrentClassification,
} from '#/lib/torrent-status'
import type { SortKeys } from '#/lib/visible-torrents'
import type { SlimTorrent } from '#/shared/maindata'
import { isExtraSortField, sortField } from '#/shared/sort-fields'
import type { SortFieldId } from '#/shared/sort-fields'
import type { SortValue } from '#/shared/sort-keys'

// Spec 1.8 rows R1 to R6, C1 to C3, V1 to V4, M1: everything a list row and
// the list's state show, pure, so the rows are tested in node. Status, word,
// ring and error text come only from classify(); numbers only from
// format.ts; the location only from src/lib/paths.ts (story 5.1: the common
// path's name, else the last two folders). All text is plain text.
// Story 2.1: the big number on the right follows the sort (EXPERIENCE 列表
// 右邊的大數字), and the 分享率 column hides while sorting by ratio.

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

/**
 * The sort a row model assumes when none is passed (tests): added time. The
 * list itself always passes the URL's sort, and never 「狀態」 (the board).
 */
const FALLBACK_SORT: SortFieldId = 'added_on'

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

/**
 * How the big number looks (DESIGN list-row): `number` is `row-value` 18px
 * bold; the others are `body` 13px `text-muted`, at most 160px, cut at the
 * end (`text`), from the front (`path`), or in the path font (`hash`).
 */
export type BigValueStyle = 'number' | 'text' | 'path' | 'hash'

export interface BigValue {
  /** The sort's name, read before the value by screen readers. */
  label: string
  text: string
  style: BigValueStyle
  /** `text-muted` (no value, a speed of 0, no limit); text styles always are. */
  muted: boolean
  /** An extra sort's first keys are loading: a small skeleton bar instead. */
  loading: boolean
  /** A ratio of 1.00 or more: the `good` colour, like the ratio column. */
  good?: boolean
  /** The tooltip when it differs from `text` (the full save path). */
  title?: string
}

export interface RowModel {
  circle: StatusCircleModel
  name: string
  /** The location tag (story 5.1): the common path's name, media library. */
  tag: TagLocation
  size: string
  /** Under 100%: ↓ download speed, otherwise ↑ upload; `null` at 0. */
  speed: RowSpeed | null
  ratio: { text: string; good: boolean }
  /** False while sorting by ratio: the big number is the ratio then. */
  showRatio: boolean
  /** The big value on the right, following the sort. */
  value: BigValue
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
  /** The active sort; added time when left out. */
  sort?: SortFieldId
  /**
   * An extra sort's value for this torrent (getSortKeys); `undefined` while
   * its keys are loading. Slim sorts read the torrent and ignore this.
   */
  sortValue?: SortValue
  /** Story 2.10: this torrent's reason from getErrorReasons, if any. */
  errorReason?: string
  /**
   * Story 5.1: this torrent's location (useLocationResolver); as with no
   * common paths when left out (tests).
   */
  location?: TagLocation
}

const TEXT_STYLES: Readonly<Partial<Record<string, BigValueStyle>>> = {
  text: 'text',
  location: 'text',
  path: 'path',
  hash: 'hash',
}

function bigValue(
  torrent: SlimTorrent,
  status: TorrentClassification,
  location: TagLocation,
  { now, timeZone, stateBeforeMove, sort, sortValue }: RowModelOptions,
): BigValue {
  const field = sortField(sort ?? FALLBACK_SORT)
  const id = field.id as SortFieldId
  const base = { label: field.label, loading: false }
  if (field.kind === 'status') {
    // Name (and state until the board): the progress where the row draws
    // one, otherwise the status word (13px).
    return id === 'name' && status.showsProgress
      ? {
          ...base,
          text: formatPercent(torrent.progress),
          style: 'number',
          muted: false,
        }
      : { ...base, text: status.word, style: 'text', muted: true }
  }
  const extra = isExtraSortField(id)
  if (extra && sortValue === undefined) {
    return { ...base, text: '', style: 'number', muted: true, loading: true }
  }
  const value = extra
    ? (sortValue ?? null)
    : slimSortValue(id, torrent, stateBeforeMove)
  const style = TEXT_STYLES[field.kind] ?? 'number'
  if (field.kind === 'location' && !hasNoSortValue(id, value)) {
    return {
      ...base,
      text: location.name,
      // The sort compares the full path; the tooltip shows it.
      title: torrent.save_path,
      style,
      muted: true,
    }
  }
  const formatted = formatSortValue(id, value, now, timeZone)
  return {
    ...base,
    text: formatted.text,
    style,
    muted: style !== 'number' || formatted.muted,
    ...(field.kind === 'ratio' && typeof value === 'number'
      ? { good: isGoodRatio(value) }
      : {}),
  }
}

export function rowModel(
  torrent: SlimTorrent,
  options: RowModelOptions,
): RowModel {
  const { now, timeZone, stateBeforeMove, errorReason } = options
  const status = classify(torrent, {
    now,
    timeZone,
    stateBeforeMove,
    errorReason,
  })
  const location =
    options.location ?? NO_COMMON_PATHS_RESOLVER(torrent.save_path)
  const downloading = torrent.progress < 1
  const speedText = formatRowSpeed(
    downloading ? torrent.dlspeed : torrent.upspeed,
  )
  return {
    circle: circleOf(status, torrent.progress),
    name: torrent.name,
    tag: location,
    size: formatSize(torrent.size),
    speed:
      speedText === null
        ? null
        : { direction: downloading ? 'down' : 'up', text: speedText },
    ratio: {
      text: formatRatio(torrent.ratio),
      good: isGoodRatio(torrent.ratio),
    },
    showRatio: (options.sort ?? FALLBACK_SORT) !== 'ratio',
    value: bigValue(torrent, status, location, options),
    // A move keeps the status but replaces the line with 「搬移中」 (once).
    errorDetail:
      status.status === 'error' && !status.moving ? status.detail : null,
    movingDetail: status.moving ? status.detail : null,
  }
}

/**
 * The clock a row reads: the minute tick (`now`) when the sort is shown as
 * how long ago (「3 小時前」), otherwise `today`, which changes only at local
 * midnight, so other sorts do not re-render every row every minute.
 */
export function rowClock(
  sort: SortFieldId,
  today: number,
  now: number,
): number {
  return sortField(sort).kind === 'ago' ? now : today
}

export interface RowProps {
  /** The merged object: unchanged torrents keep their reference (M1). */
  torrent: SlimTorrent
  /** This torrent's `stateBeforeMove` entry, if it is moving. */
  stateBeforeMove: string | undefined
  /**
   * `rowClock()`: changes only when the local date changes, or every minute
   * while the sort is shown as how long ago.
   */
  today: number
  sort: SortFieldId
  /** Extra sorts only: this torrent's key, `undefined` while loading. */
  sortValue: SortValue | undefined
  /**
   * Story 2.10: this torrent's reason (a string, so the row re-renders
   * only when its own reason changes); `undefined` for none.
   */
  errorReason: string | undefined
  /**
   * Story 5.1: the resolver's object for this torrent's `save_path`: the
   * same object while the path and the common paths stay, a new one when
   * either changes (the row re-renders with the new tag).
   */
  location: TagLocation
}

export interface RowPropsOptions {
  /** Local midnight, epoch ms. */
  today: number
  sort?: SortFieldId
  /** The active extra sort's keys; `undefined` while loading. */
  sortKeys?: SortKeys
  /** The first keys failed: no value instead of "loading". */
  keysFailed?: boolean
  /** Story 2.10: useErrorReasons' map; `undefined` for none. */
  errorReasons?: Readonly<Record<string, string>>
  /** Story 5.1: useLocationResolver(); as with no common paths when left out. */
  locate?: LocationResolver
}

/**
 * What the memoized row gets. Every prop keeps its identity across polls
 * when the torrent did not change, so the row does not re-render.
 */
export function rowProps(
  maindata: Pick<Maindata, 'torrents' | 'stateBeforeMove'>,
  hash: string,
  {
    today,
    sort = FALLBACK_SORT,
    sortKeys,
    keysFailed = false,
    errorReasons,
    locate = NO_COMMON_PATHS_RESOLVER,
  }: RowPropsOptions,
): RowProps | null {
  if (!Object.hasOwn(maindata.torrents, hash)) return null
  // Slim sorts read the torrent; only an extra sort's key is passed, so the
  // row re-renders only when its own value changes. A hash the keys lack (a
  // torrent added since the last sort-keys poll) is still loading
  // (`undefined`); `null` means qBittorrent has no value.
  let sortValue: SortValue | undefined
  if (isExtraSortField(sort)) {
    if (sortKeys && Object.hasOwn(sortKeys, hash)) sortValue = sortKeys[hash]
    else if (keysFailed) sortValue = null
  }
  const torrent = maindata.torrents[hash]
  return {
    sort,
    sortValue,
    errorReason: reasonOf(errorReasons, hash),
    location: locate(torrent.save_path),
    torrent,
    stateBeforeMove: Object.hasOwn(maindata.stateBeforeMove, hash)
      ? maindata.stateBeforeMove[hash]
      : undefined,
    today,
  }
}
