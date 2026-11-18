import { isFirstLoadError } from '#/lib/app-error'
import { formatPercent } from '#/lib/format'
import { locationLabel } from '#/lib/paths'
import {
  BOARD_COLUMN_NAMES,
  circleOf,
  classify,
  showsProgress,
  statusOf,
} from '#/lib/torrent-status'
import type {
  BoardColumn,
  StatusCircleModel,
  TorrentStatusId,
} from '#/lib/torrent-status'
import type { BoardColumns } from '#/lib/visible-torrents'
import type { SlimTorrent } from '#/shared/maindata'

// Story 2.3: everything the board shows, pure, so it is tested in node.
// Column membership and order come from `selectBoardColumns`
// (src/lib/visible-torrents.ts); status, word, ring and the second line
// only from classify(); the location only from locationLabel(). All text
// is plain text. Values from UX DESIGN.md (board-column, board-card,
// status-tabs) and the mockups S01-list-desktop, S02-list-phone.

/** The four work columns, left to right (the phone's four tabs). */
export const WORK_COLUMNS = [
  'attention',
  'downloading',
  'seeding',
  'done',
] as const satisfies ReadonlyArray<BoardColumn>

export type WorkColumn = (typeof WORK_COLUMNS)[number]

export interface ColumnMeta {
  /** The column name: 「要處理」. */
  name: string
  /** The header tooltip: how the column is ordered (not clickable). */
  order: string
  /** The status the 28px header circle shows. */
  circle: TorrentStatusId
  /** What an empty column says. */
  empty: string
}

export const COLUMN_META: Readonly<Record<BoardColumn, ColumnMeta>> = {
  attention: {
    name: BOARD_COLUMN_NAMES.attention,
    order: '最新出問題的在前',
    circle: 'error',
    empty: '都沒問題',
  },
  downloading: {
    name: BOARD_COLUMN_NAMES.downloading,
    order: '新加入的在前',
    circle: 'downloading',
    empty: '沒有',
  },
  seeding: {
    name: BOARD_COLUMN_NAMES.seeding,
    order: '做種最久的在前',
    circle: 'seeding',
    empty: '沒有',
  },
  done: {
    name: BOARD_COLUMN_NAMES.done,
    order: '剛完成的在前',
    circle: 'done',
    empty: '沒有',
  },
  archived: {
    name: BOARD_COLUMN_NAMES.archived,
    order: '完成時間新的在前',
    circle: 'archived',
    empty: '沒有',
  },
}

/**
 * What an empty column says (EXPERIENCE State Patterns): 「沒有」, and
 * 「都沒問題」 for an empty 要處理 while other work columns have torrents.
 * With all four work columns empty (only archived ones, or none) every one
 * says 「沒有」 (Claude 代決, memlog #124). Story 3.5: while searching every
 * empty column says 「沒有」 (nothing matched, not "no problem").
 */
export function emptyText(
  column: BoardColumn,
  columns: BoardColumns,
  searching = false,
): string {
  if (searching) return '沒有'
  if (column !== 'attention') return COLUMN_META[column].empty
  const othersEmpty = WORK_COLUMNS.every(
    (work) => work === 'attention' || columns[work].length === 0,
  )
  return othersEmpty ? '沒有' : COLUMN_META.attention.empty
}

/**
 * Card heights in whole pixels (fixed, so the virtualizer never measures):
 * 12 + 12 padding, a 37px first row (18px name line, 2px gap, 17px second
 * line), 8px gap, the 20px tag row; a progress card adds the 4px bar and
 * another 8px gap.
 */
export const CARD_HEIGHT = 89
export const CARD_HEIGHT_WITH_BAR = 101
/** The gap between cards. */
export const CARD_GAP = 10

/** The board's state before the columns (spec 2.3 K11, K14). */
export type BoardView = 'skeleton' | 'error' | 'empty' | 'no-result' | 'board'

/**
 * Like the list: without data the first-load error block when the failure
 * has no other surface, skeletons otherwise. With data and no torrent at
 * all (archived ones count: they fill the 已整理 column), the list's empty
 * block; story 3.5: while searching, the no-result block instead (only
 * when the four columns and 已整理 are all empty).
 */
export function boardView({
  hasData,
  total,
  error,
  searching = false,
}: {
  hasData: boolean
  /** Every torrent, archived ones included. */
  total: number
  error: unknown
  /** A search keyword is set. */
  searching?: boolean
}): BoardView {
  if (!hasData) return isFirstLoadError(error) ? 'error' : 'skeleton'
  if (total > 0) return 'board'
  return searching ? 'no-result' : 'empty'
}

export function totalOf(columns: BoardColumns): number {
  return (
    columns.attention.length +
    columns.downloading.length +
    columns.seeding.length +
    columns.done.length +
    columns.archived.length
  )
}

export interface CardModel {
  circle: StatusCircleModel
  name: string
  /** 「87%」 at the right: only downloading, paused and stalled. */
  percent: string | null
  /** Remaining time and speed, or classify()'s line (「搬移中」 while moving). */
  detail: string
  /**
   * Story 2.10: the line's tooltip on an error card (a long reason is cut),
   * like the list row's error line; `null` otherwise.
   */
  detailTitle: string | null
  /** 0 to 1 for the 4px bar (same statuses as `percent`), else `null`. */
  progress: number | null
  /** The category tag; `null` when the torrent has none. */
  category: string | null
  /** The location tag: the last two path segments. */
  location: string
}

export interface CardModelOptions {
  /** Epoch ms; any instant of the current local day. */
  now: number
  timeZone?: string
  stateBeforeMove: Readonly<Record<string, string>>
  /** Story 2.10: this torrent's reason from getErrorReasons, if any. */
  errorReason?: string
}

export function cardModel(
  torrent: SlimTorrent,
  { now, timeZone, stateBeforeMove, errorReason }: CardModelOptions,
): CardModel {
  const status = classify(torrent, {
    now,
    timeZone,
    stateBeforeMove,
    errorReason,
  })
  const circle = circleOf(status, torrent.progress)
  return {
    circle,
    name: torrent.name,
    percent: status.showsProgress ? formatPercent(torrent.progress) : null,
    detail: status.detail,
    detailTitle:
      status.status === 'error' && !status.moving ? status.detail : null,
    progress: circle.arcFraction,
    category: torrent.category === '' ? null : torrent.category,
    location: locationLabel(torrent.save_path),
  }
}

/** The fixed height of a card: taller with the progress bar. */
export function cardHeight(model: Pick<CardModel, 'progress'>): number {
  return model.progress === null ? CARD_HEIGHT : CARD_HEIGHT_WITH_BAR
}

/**
 * A card's height without building its text (the virtualizer asks for
 * every card in a column): the same rule as `cardModel`'s bar.
 */
export function cardHeightOf(
  torrent: SlimTorrent | undefined,
  stateBeforeMove: Readonly<Record<string, string>>,
): number {
  if (!torrent) return CARD_HEIGHT
  return showsProgress(statusOf(torrent, stateBeforeMove))
    ? CARD_HEIGHT_WITH_BAR
    : CARD_HEIGHT
}
