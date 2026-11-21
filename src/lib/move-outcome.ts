import { isMovingTorrent } from '#/lib/torrent-status'
import type { SlimTorrent } from '#/shared/maindata'
import { normalizeSavePath } from '#/shared/save-path'

// Story 5.3 (FR-45, AR-43): whether a move this tab started is done, failed
// or still running, from the tab's record of it plus the previous and the
// current torrent. Pure; src/state/move-outcomes.ts runs it on every
// maindata change and shows the toasts. "Moving" is isMovingTorrent's
// (`movingTo` or qBittorrent's `moving`), and paths compare normalized.

/** A move this tab started (src/state/pending-ops.ts keeps one per hash). */
export interface MoveRecord {
  /** Normalized target. */
  target: string
  /** Normalized `save_path` when the move was recorded ('' if unknown). */
  from: string
  /** Epoch ms when setLocation answered ok. */
  startedAt: number
  /** The move has shown in maindata (`movingTo` or `moving`) at least once. */
  seen: boolean
}

export type MoveOutcome =
  | { kind: 'waiting'; record: MoveRecord }
  | { kind: 'done' }
  | { kind: 'failed' }
  /** Over, but somewhere else (another client moved it): no toast. */
  | { kind: 'dropped' }

/**
 * - moving now: `waiting`, `seen` set;
 * - seen before (in the record, or moving in the previous torrent), now
 *   not: `done` at the target, `failed` back at `from` (qBittorrent did
 *   not move it, or the container's `movingTo` expired), `dropped`
 *   anywhere else (another client moved it; a retry would move it back);
 * - never seen, now not moving: `done` at the target (it finished between
 *   two polls), else `waiting` (the move has not shown yet).
 *
 * A `waiting` answer returns the same record when nothing changed.
 */
export function moveOutcomeOf(
  record: MoveRecord,
  previous: SlimTorrent | undefined,
  current: SlimTorrent,
): MoveOutcome {
  if (isMovingTorrent(current)) {
    return {
      kind: 'waiting',
      record: record.seen ? record : { ...record, seen: true },
    }
  }
  const savePath = normalizeSavePath(current.save_path)
  if (savePath === normalizeSavePath(record.target)) return { kind: 'done' }
  const seen =
    record.seen || (previous !== undefined && isMovingTorrent(previous))
  if (!seen) return { kind: 'waiting', record }
  return savePath === record.from ? { kind: 'failed' } : { kind: 'dropped' }
}
