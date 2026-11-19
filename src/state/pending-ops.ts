import { useEffect } from 'react'
import { createStore, useSelector } from '@tanstack/react-store'
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

export const PENDING_TIMEOUT_MS = 30_000

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

function setOps(
  update: (ops: Record<string, string>) => Record<string, string>,
): void {
  pendingStore.setState((state) => ({ ops: update({ ...state.ops }) }))
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
    return ops
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
    return next
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

/** Tests: no entries, no timers. */
export function resetPendingOps(): void {
  for (const mark of marks) clearTimeout(mark.timer)
  marks.clear()
  owners.clear()
  pendingStore.setState(() => ({ ops: {} }))
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
