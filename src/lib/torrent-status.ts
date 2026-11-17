import {
  formatDate,
  formatDuration,
  formatEta,
  formatPercent,
  formatSpeed,
} from '#/lib/format'
import type { SlimTorrent } from '#/shared/maindata'
import type { TorrentStatusId } from '#/shared/torrent-status'

// FR-8, AR-41, AD-13: the only mapping from qBittorrent's state codes to the
// 7 status words, the board column and the second line (EXPERIENCE
// 「qBittorrent 狀態對應」). Screens never compare `torrent.state` themselves
// (lint blocks it in src/features and src/routes). All text is plain text;
// numbers and times come from format.ts only.

export type { TorrentStatusId }

export type BoardColumn =
  'attention' | 'downloading' | 'seeding' | 'done' | 'archived'

export interface TorrentClassification {
  status: TorrentStatusId
  word: string
  column: BoardColumn
  /** The second line (plain text). */
  detail: string
  /** qBittorrent is moving the files; `status` is what it was before. */
  moving: boolean
  /** The status circle draws a progress ring. */
  showsProgress: boolean
}

export interface ClassifyOptions {
  /** Epoch ms. */
  now: number
  /** IANA zone for dates; the runtime's local zone when left out. */
  timeZone?: string
  /**
   * `Maindata.stateBeforeMove`. Required so a caller cannot forget it: without
   * it a paused torrent that is moving reads as 下載中. Pass `{}` only when
   * there is no Maindata (tests).
   */
  stateBeforeMove: Readonly<Record<string, string>>
  /**
   * Story 2.10: this torrent's reason from getErrorReasons (cleaned plain
   * text), used only while it is in the `error` state; without one the
   * fixed ERROR_FALLBACK_TEXT shows.
   */
  errorReason?: string
}

/** The `error` line when qBittorrent's log gave no reason (story 2.10). */
export const ERROR_FALLBACK_TEXT = 'qBittorrent 回報錯誤'

/** The `error` state's line: the torrent's reason, else the fixed text. */
export function errorLineOf(errorReason: string | undefined): string {
  return errorReason !== undefined && errorReason !== ''
    ? errorReason
    : ERROR_FALLBACK_TEXT
}

const WORDS: Readonly<Record<TorrentStatusId, string>> = {
  downloading: '下載中',
  seeding: '做種中',
  done: '已完成',
  paused: '已暫停',
  stalled: '停滯',
  error: '錯誤',
  archived: '已整理',
}

const COLUMNS: Readonly<Record<TorrentStatusId, BoardColumn>> = {
  downloading: 'downloading',
  seeding: 'seeding',
  done: 'done',
  paused: 'downloading',
  stalled: 'attention',
  error: 'attention',
  archived: 'archived',
}

/** The board column a status goes in. */
export function columnOf(status: TorrentStatusId): BoardColumn {
  return COLUMNS[status]
}

/**
 * The board columns' names (UX DESIGN board-column, status-tabs), for the
 * board and the detail header's column prefix (story 2.4).
 */
export const BOARD_COLUMN_NAMES: Readonly<Record<BoardColumn, string>> = {
  attention: '要處理',
  downloading: '下載中',
  seeding: '做種中',
  done: '完成',
  archived: '已整理',
}

const SHOWS_PROGRESS: ReadonlySet<TorrentStatusId> = new Set([
  'downloading',
  'paused',
  'stalled',
])

/** The status circle draws a progress ring (and a board card a bar). */
export function showsProgress(status: TorrentStatusId): boolean {
  return SHOWS_PROGRESS.has(status)
}

/** What a state means, before any text is built. */
type StateKind =
  | 'error'
  | 'missing_files'
  | 'stalled_dl'
  | 'downloading'
  | 'meta'
  | 'queued_dl'
  | 'checking_dl'
  | 'paused_dl'
  | 'seeding'
  | 'stalled_up'
  | 'paused_up'
  | 'moving'
  | 'unknown'

const STATE_KINDS: Readonly<Record<string, StateKind>> = {
  error: 'error',
  missingFiles: 'missing_files',
  stalledDL: 'stalled_dl',
  downloading: 'downloading',
  forcedDL: 'downloading',
  metaDL: 'meta',
  forcedMetaDL: 'meta',
  queuedDL: 'queued_dl',
  checkingDL: 'checking_dl',
  allocating: 'checking_dl',
  checkingResumeData: 'checking_dl',
  pausedDL: 'paused_dl',
  stoppedDL: 'paused_dl',
  uploading: 'seeding',
  forcedUP: 'seeding',
  queuedUP: 'seeding',
  checkingUP: 'seeding',
  stalledUP: 'stalled_up',
  pausedUP: 'paused_up',
  stoppedUP: 'paused_up',
  moving: 'moving',
  unknown: 'unknown',
}

/** Every qBittorrent state code the table knows (tests walk them all). */
export const KNOWN_STATE_CODES: ReadonlyArray<string> = Object.keys(STATE_KINDS)

/** Unlisted (future) codes read like `unknown`. */
function kindOf(state: string): StateKind {
  return Object.hasOwn(STATE_KINDS, state) ? STATE_KINDS[state] : 'unknown'
}

/**
 * Story 2.5: which row of EXPERIENCE 「詳情狀態區每種狀態寫什麼」 a torrent
 * reads as. Finer than the status (下載中 splits into 抓資訊, 排隊, 檢查;
 * 錯誤 into missing files, `error` and `unknown`). It is also where the
 * status comes from (HERO_STATUS), so the detail hero and classify() can
 * never disagree. Moving text itself is Epic 5.
 */
export type HeroKind =
  | 'downloading'
  | 'meta'
  | 'queued'
  | 'checking'
  | 'paused'
  | 'stalled'
  | 'seeding'
  | 'done'
  | 'missing_files'
  | 'error'
  | 'unknown'
  | 'archived'

/** The one place a state kind (plus `private`, `progress`) picks a row. */
function heroKindOfKind(kind: StateKind, torrent: SlimTorrent): HeroKind {
  switch (kind) {
    case 'error':
      return 'error'
    case 'unknown':
      return 'unknown'
    case 'missing_files':
      // AR-58: `private: null` (no metadata yet) counts as regular.
      return torrent.private === true ? 'missing_files' : 'archived'
    case 'stalled_dl':
      return 'stalled'
    case 'downloading':
      return 'downloading'
    case 'meta':
      return 'meta'
    case 'queued_dl':
      return 'queued'
    case 'checking_dl':
      return 'checking'
    case 'paused_dl':
      return 'paused'
    case 'seeding':
    case 'stalled_up':
      return 'seeding'
    case 'paused_up':
      return 'done'
    case 'moving':
      // Only reached without a remembered state: the progress decides.
      return torrent.progress >= 1 ? 'seeding' : 'downloading'
  }
}

const HERO_STATUS: Readonly<Record<HeroKind, TorrentStatusId>> = {
  downloading: 'downloading',
  meta: 'downloading',
  queued: 'downloading',
  checking: 'downloading',
  paused: 'paused',
  stalled: 'stalled',
  seeding: 'seeding',
  done: 'done',
  missing_files: 'error',
  error: 'error',
  unknown: 'error',
  archived: 'archived',
}

/** The status a hero row belongs to. */
export function statusOfHeroKind(kind: HeroKind): TorrentStatusId {
  return HERO_STATUS[kind]
}

function statusOfKind(kind: StateKind, torrent: SlimTorrent): TorrentStatusId {
  return HERO_STATUS[heroKindOfKind(kind, torrent)]
}

/** The hero row; a move keeps the row it had before. */
export function heroKindOf(
  torrent: SlimTorrent,
  stateBeforeMove: Readonly<Record<string, string>>,
): HeroKind {
  return heroKindOfKind(effectiveKind(torrent, stateBeforeMove).kind, torrent)
}

/** The state a moving torrent had before, when the merge remembered one. */
function rememberedKind(
  torrent: SlimTorrent,
  stateBeforeMove: Readonly<Record<string, string>>,
): StateKind | null {
  if (!Object.hasOwn(stateBeforeMove, torrent.hash)) return null
  const kind = kindOf(stateBeforeMove[torrent.hash])
  return kind === 'moving' ? null : kind
}

/** The effective kind: a move keeps the kind it had before. */
function effectiveKind(
  torrent: SlimTorrent,
  stateBeforeMove: Readonly<Record<string, string>>,
): { kind: StateKind; moving: boolean } {
  const kind = kindOf(torrent.state)
  if (kind !== 'moving') return { kind, moving: false }
  return {
    kind: rememberedKind(torrent, stateBeforeMove) ?? 'moving',
    moving: true,
  }
}

/** The status alone (no text): for filters and counts. */
export function statusOf(
  torrent: SlimTorrent,
  stateBeforeMove: Readonly<Record<string, string>>,
): TorrentStatusId {
  return statusOfKind(effectiveKind(torrent, stateBeforeMove).kind, torrent)
}

/** Story 2.6: what the detail's 「⋯」 menu item does. */
export type PauseAction = 'stop' | 'start'

/**
 * Story 2.6 (EXPERIENCE detail-header 「⋯」): 「繼續」 (`start`) for a torrent
 * that reads 已暫停 or 已完成 (`pausedDL`, `stoppedDL`, `pausedUP`,
 * `stoppedUP`, also while moving with such a remembered state), else
 * 「暫停」 (`stop`): every other status, 已整理 and errors included.
 */
export function pauseActionOf(
  torrent: SlimTorrent,
  stateBeforeMove: Readonly<Record<string, string>>,
): PauseAction {
  const status = statusOf(torrent, stateBeforeMove)
  return status === 'paused' || status === 'done' ? 'start' : 'stop'
}

/** State kinds qBittorrent keeps after a stop or start (they win over it). */
const KEPT_AFTER_PAUSE: ReadonlySet<StateKind> = new Set([
  'error',
  'missing_files',
  'unknown',
])

/**
 * Story 2.6: whether qBittorrent shows `pauseActionOf`'s action by flipping
 * it soon. Not for errors and missing files: qBittorrent's state checks
 * those before stopped, so after a stop the state code (and the action)
 * stays; not while moving (the code stays `moving` until the move ends);
 * nor for an unknown code, which cannot be judged.
 */
export function pauseActionFlips(
  torrent: SlimTorrent,
  stateBeforeMove: Readonly<Record<string, string>>,
): boolean {
  if (kindOf(torrent.state) === 'moving') return false
  return !KEPT_AFTER_PAUSE.has(effectiveKind(torrent, stateBeforeMove).kind)
}

/** The menu item's word for an action. */
export const PAUSE_ACTION_WORDS: Readonly<Record<PauseAction, string>> = {
  stop: '暫停',
  start: '繼續',
}

function detailOf(
  kind: StateKind,
  torrent: SlimTorrent,
  { now, timeZone, errorReason }: ClassifyOptions,
): string {
  switch (kind) {
    case 'error':
      // qBittorrent 5.1.4 sends no reason in maindata; story 2.10 reads it
      // from qBittorrent's log (getErrorReasons).
      return errorLineOf(errorReason)
    case 'unknown':
      return '狀態不明'
    case 'missing_files':
      return torrent.private === true ? '找不到檔案，做不了種' : '已整理'
    case 'stalled_dl':
      return `卡在 ${formatPercent(torrent.progress)}，沒有來源`
    case 'downloading': {
      const eta = formatEta(torrent.eta, torrent.dlspeed)
      if (!(torrent.dlspeed > 0)) return eta
      return `${eta} · ↓ ${formatSpeed(torrent.dlspeed)}`
    }
    case 'meta':
      return '抓種子資訊中'
    case 'queued_dl':
      return '排隊中'
    case 'checking_dl':
      return '檢查檔案中'
    case 'paused_dl':
      return '手動暫停'
    case 'seeding':
      return `做種 ${formatDuration(torrent.seeding_time)}`
    case 'stalled_up':
      return '沒人在抓'
    case 'paused_up':
      return torrent.completion_on > 0
        ? `${formatDate(torrent.completion_on, now, timeZone)} 下載好了`
        : '下載好了'
    case 'moving':
      return '搬移中'
  }
}

/** The status circle of a list row, a board card or the detail hero. */
export interface StatusCircleModel {
  status: TorrentStatusId
  /** Screen reader text: 「停滯，87%」 or 「做種中」. */
  label: string
  /** 0 to 1 for a progress ring (on `track`), `null` for a full ring. */
  arcFraction: number | null
}

/** `progress` as a 0 to 1 fraction for a ring or a bar. */
export function progressFraction(progress: number): number {
  if (!(progress > 0)) return 0
  return Math.min(1, progress)
}

export function circleOf(
  classification: Pick<
    TorrentClassification,
    'status' | 'word' | 'showsProgress'
  >,
  progress: number,
): StatusCircleModel {
  const { status, word } = classification
  if (!classification.showsProgress) {
    return { status, label: word, arcFraction: null }
  }
  return {
    status,
    label: `${word}，${formatPercent(progress)}`,
    arcFraction: progressFraction(progress),
  }
}

export function classify(
  torrent: SlimTorrent,
  options: ClassifyOptions,
): TorrentClassification {
  const { kind, moving } = effectiveKind(torrent, options.stateBeforeMove)
  const status = statusOfKind(kind, torrent)
  return {
    status,
    word: WORDS[status],
    column: COLUMNS[status],
    detail: moving ? '搬移中' : detailOf(kind, torrent, options),
    moving,
    showsProgress: showsProgress(status),
  }
}
