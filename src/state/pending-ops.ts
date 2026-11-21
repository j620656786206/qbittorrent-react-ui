import { useEffect } from 'react'
import { createStore, useSelector } from '@tanstack/react-store'
import type { MoveRecord } from '#/lib/move-outcome'
import { MOVING_TO_EXPIRY_MS } from '#/shared/maindata'
import { normalizeSavePath } from '#/shared/save-path'
import { selectTorrents, useMaindata } from '#/state/maindata'

// AD-7 / AD-13, story 2.6: the only record of "sent, qBittorrent has not
// shown it yet". One entry per torrent hash, the operation sent (`stop`,
// `start` now; later stories add theirs). An entry goes when:
// - the call failed (`clearPending`, `clearPendingAll`);
// - 30 s after it was marked, by a timer, so a control comes back even when
//   no new data arrives (and the fallback when no reader is mounted);
// - while a `usePendingOp` reader is mounted (only then): the screen sees
//   qBittorrent reflected it (the action it would offer for that torrent is
//   no longer the op sent, judged only for the ops that reader sends), or
//   the torrent is gone from maindata.
// While a hash has an entry, the control that sent it is disabled.
// Story 5.3: beside these, the moves this tab started (`moveRecordStore`,
// one per hash: target, start, seen), which decide the done or failed
// toast (src/state/move-outcomes.ts). A move marks no 30 s entry. A record
// is written when setLocation answers ok for that hash (with the
// `save_path` it was leaving when Alex pressed), replaced by a newer move
// of the same hash, and goes when the outcome is decided, when the torrent
// leaves maindata, or MOVING_TO_EXPIRY_MS after it started without the
// move ever showing. Per tab: a reload loses it (the move still shows as
// moving, with no toast).

export const PENDING_TIMEOUT_MS = 30_000

/**
 * Story 5.2: a move's failure toast key: not the bare hash, which pause and
 * delete toasts of the same torrent use, so the change-path screen closing
 * its own toast never closes theirs. Story 5.3's 「沒有搬到 …」 uses it too.
 */
export function moveToastKey(hash: string): string {
  return `move:${hash}`
}

interface PendingState {
  ops: Readonly<Record<string, string>>
}

export const pendingStore = createStore<PendingState>({ ops: {} })

/**
 * One 30 s timer per mark (a single hash, or a whole batch such as a
 * 3,626-torrent delete), so a big batch times out in one store update.
 * `owners` names the mark each hash belongs to now: a hash marked again
 * moves to the new mark, and the old timer leaves it alone.
 */
interface Mark {
  timer: ReturnType<typeof setTimeout> | undefined
  /** Hashes this mark still owns. */
  left: number
}

const owners = new Map<string, Mark>()
const marks = new Set<Mark>()

function setOps(update: (ops: Record<string, string>) => void): void {
  pendingStore.setState((state) => {
    const ops = { ...state.ops }
    update(ops)
    return { ops }
  })
}

/** `hash` no longer belongs to its mark; the last one out stops the timer. */
function release(hash: string): void {
  const mark = owners.get(hash)
  if (!mark) return
  owners.delete(hash)
  mark.left -= 1
  if (mark.left > 0) return
  clearTimeout(mark.timer)
  marks.delete(mark)
}

/** Arms one 30 s timer for `hashes`, which clears those it still owns. */
function arm(hashes: ReadonlyArray<string>): void {
  const mark: Mark = { timer: undefined, left: 0 }
  for (const hash of new Set(hashes)) {
    release(hash)
    owners.set(hash, mark)
    mark.left += 1
  }
  marks.add(mark)
  mark.timer = setTimeout(() => {
    marks.delete(mark)
    clearPendingAll(hashes.filter((hash) => owners.get(hash) === mark))
  }, PENDING_TIMEOUT_MS)
}

/** Marks `hash` as waiting for `op` to show; restarts its 30 s. */
export function markPending(hash: string, op: string): void {
  markPendingAll([hash], op)
}

/**
 * Story 4.3: marks many hashes at once (a delete of 3,626 torrents): one
 * store update and one timer.
 */
export function markPendingAll(
  hashes: ReadonlyArray<string>,
  op: string,
): void {
  // A module-level store on the server would leak across requests.
  if (typeof window === 'undefined' || hashes.length === 0) return
  arm(hashes)
  setOps((ops) => {
    for (const hash of hashes) ops[hash] = op
  })
}

/** Story 4.3: clears many hashes with one store update. */
export function clearPendingAll(hashes: ReadonlyArray<string>): void {
  const { ops } = pendingStore.state
  let changed = false
  for (const hash of hashes) {
    release(hash)
    if (Object.hasOwn(ops, hash)) changed = true
  }
  if (!changed) return
  setOps((next) => {
    for (const hash of hashes) delete next[hash]
  })
}

export function clearPending(hash: string): void {
  clearPendingAll([hash])
}

/** The op sent for `hash` that has not shown yet, or `null`. */
export function pendingOpOf(hash: string): string | null {
  const { ops } = pendingStore.state
  return Object.hasOwn(ops, hash) ? ops[hash] : null
}

/** Drops the entries of torrents `exists` no longer knows, in one update. */
export function prunePending(exists: (hash: string) => boolean): void {
  const gone = Object.keys(pendingStore.state.ops).filter(
    (hash) => !exists(hash),
  )
  if (gone.length > 0) clearPendingAll(gone)
}

/** Story 5.3: the moves this tab started, by hash. */
export const moveRecordStore = createStore<
  Readonly<Record<string, MoveRecord>>
>({})

const moveTimers = new Set<ReturnType<typeof setTimeout>>()

/** Drops the records that never showed within MOVING_TO_EXPIRY_MS. */
function expireMoveRecords(): void {
  const at = Date.now()
  const stale = Object.entries(moveRecordStore.state)
    .filter(
      ([, record]) =>
        !record.seen && at - record.startedAt >= MOVING_TO_EXPIRY_MS,
    )
    .map(([hash]) => hash)
  dropMoveRecords(stale)
}

/**
 * Story 5.3: setLocation answered ok for `hashes`, going to `target`
 * (normalized), each leaving `fromOf(hash)` (its `save_path` now, '' when
 * unknown): one record each, replacing an older move of the same hash.
 */
export function recordMoves(
  hashes: ReadonlyArray<string>,
  target: string,
  fromOf: (hash: string) => string,
): void {
  if (typeof window === 'undefined' || hashes.length === 0) return
  const startedAt = Date.now()
  moveRecordStore.setState((records) => {
    const next = { ...records }
    for (const hash of hashes) {
      const from = fromOf(hash)
      next[hash] = {
        target,
        from: from === '' ? '' : normalizeSavePath(from),
        startedAt,
        seen: false,
      }
    }
    return next
  })
  const timer = setTimeout(() => {
    moveTimers.delete(timer)
    expireMoveRecords()
  }, MOVING_TO_EXPIRY_MS)
  moveTimers.add(timer)
}

/** Story 5.3: the move this tab started for `hash`, or `null`. */
export function moveRecordOf(hash: string): MoveRecord | null {
  const records = moveRecordStore.state
  return Object.hasOwn(records, hash) ? records[hash] : null
}

/** Story 5.3: writes back records the outcome left waiting (`seen` set). */
export function updateMoveRecords(
  updates: Readonly<Record<string, MoveRecord>>,
): void {
  const hashes = Object.keys(updates).filter((hash) =>
    Object.hasOwn(moveRecordStore.state, hash),
  )
  if (hashes.length === 0) return
  moveRecordStore.setState((records) => {
    const next = { ...records }
    for (const hash of hashes) next[hash] = updates[hash]
    return next
  })
}

/** Story 5.3: drops these records (decided, or the torrent is gone). */
export function dropMoveRecords(hashes: ReadonlyArray<string>): void {
  const present = hashes.filter((hash) =>
    Object.hasOwn(moveRecordStore.state, hash),
  )
  if (present.length === 0) return
  moveRecordStore.setState((records) => {
    const next = { ...records }
    for (const hash of present) delete next[hash]
    return next
  })
}

/** Tests: no entries, no records, no timers. */
export function resetPendingOps(): void {
  for (const mark of marks) clearTimeout(mark.timer)
  marks.clear()
  owners.clear()
  pendingStore.setState(() => ({ ops: {} }))
  for (const timer of moveTimers) clearTimeout(timer)
  moveTimers.clear()
  moveRecordStore.setState(() => ({}))
}

/**
 * The op still pending for `hash`, given the action the screen would offer
 * now. `owned` lists the ops this caller sends; only those are judged: when
 * the action differs from such an op, qBittorrent reflected it and the
 * entry is cleared (reading `null` already in this render). An entry for
 * another op (a later story's delete or move) is returned and left alone.
 * Torrents gone from maindata lose their entries too.
 */
export function usePendingOp(
  hash: string,
  action: string,
  owned: ReadonlyArray<string>,
): string | null {
  const sent = useSelector(pendingStore, (state) =>
    Object.hasOwn(state.ops, hash) ? state.ops[hash] : null,
  )
  const reflected = sent !== null && owned.includes(sent) && sent !== action
  useEffect(() => {
    if (reflected) clearPending(hash)
  }, [reflected, hash])

  const { data: torrents } = useMaindata(selectTorrents)
  useEffect(() => {
    if (torrents) prunePending((key) => Object.hasOwn(torrents, key))
  }, [torrents])

  return reflected ? null : sent
}
