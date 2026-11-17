import { useEffect } from 'react'
import { createStore, useSelector } from '@tanstack/react-store'
import { selectTorrents, useMaindata } from '#/state/maindata'

// AD-7 / AD-13, story 2.6: the only record of "sent, qBittorrent has not
// shown it yet". One entry per torrent hash, the operation sent (`stop`,
// `start` now; later stories add theirs). An entry goes when:
// - the call failed (`clearPending`);
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

const timers = new Map<string, ReturnType<typeof setTimeout>>()

function setOps(
  update: (ops: Record<string, string>) => Record<string, string>,
): void {
  pendingStore.setState((state) => ({ ops: update({ ...state.ops }) }))
}

/** Marks `hash` as waiting for `op` to show; restarts its 30 s. */
export function markPending(hash: string, op: string): void {
  // A module-level store on the server would leak across requests.
  if (typeof window === 'undefined') return
  clearTimeout(timers.get(hash))
  timers.set(
    hash,
    setTimeout(() => clearPending(hash), PENDING_TIMEOUT_MS),
  )
  setOps((ops) => {
    ops[hash] = op
    return ops
  })
}

export function clearPending(hash: string): void {
  clearTimeout(timers.get(hash))
  timers.delete(hash)
  if (!Object.hasOwn(pendingStore.state.ops, hash)) return
  setOps((ops) => {
    delete ops[hash]
    return ops
  })
}

/** The op sent for `hash` that has not shown yet, or `null`. */
export function pendingOpOf(hash: string): string | null {
  const { ops } = pendingStore.state
  return Object.hasOwn(ops, hash) ? ops[hash] : null
}

/** Drops the entries of torrents `exists` no longer knows. */
export function prunePending(exists: (hash: string) => boolean): void {
  for (const hash of Object.keys(pendingStore.state.ops)) {
    if (!exists(hash)) clearPending(hash)
  }
}

/** Tests: no entries, no timers. */
export function resetPendingOps(): void {
  for (const timer of timers.values()) clearTimeout(timer)
  timers.clear()
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
