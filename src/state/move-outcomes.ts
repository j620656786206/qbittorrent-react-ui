import { useEffect, useLayoutEffect, useRef } from 'react'
import { useSelector } from '@tanstack/react-store'
import { moveOutcomeOf } from '#/lib/move-outcome'
import type { MoveRecord } from '#/lib/move-outcome'
import { toast } from '#/lib/toast'
import type { SlimTorrent } from '#/shared/maindata'
import { useLocationResolver } from '#/state/locations'
import { selectTorrents, useMaindata } from '#/state/maindata'
import {
  dropMoveRecords,
  moveRecordStore,
  moveToastKey,
  updateMoveRecords,
} from '#/state/pending-ops'

// Story 5.3 (FR-45, EXPERIENCE 「動作成功時」 改路徑): the done or failed
// toast for the moves this tab started. Mounted once by the `_authed`
// layout. On every maindata change (and every new record) each recorded
// hash goes through moveOutcomeOf (src/lib/move-outcome.ts) with the
// previous and the current torrent:
// - done: 「已搬到 <name>」 (plain, 4 s), the name the location tag shows for
//   the new `save_path` (story 5.8 adds 「接著改檔名」);
// - failed: 「沒有搬到 <target>」 with 重試, which sends the same hash and
//   target again through `resend` (the route binds it to the move op, so
//   src/state never imports server functions);
// - waiting: the record is kept, `seen` written back;
// - dropped (the move ended somewhere else, another client's doing): the
//   record goes with no toast.
// A decided record goes, and so does one whose torrent left maindata (no
// toast). A move with no record here (another device, or this tab before a
// reload) shows as moving and never toasts.

/** Sends setLocation again for one hash and its target. */
export type ResendMove = (hash: string, target: string) => void

export const doneText = (name: string) => `已搬到 ${name}`
export const failedText = (target: string) => `沒有搬到 ${target}`

export function useMoveOutcomes(resend: ResendMove): void {
  const records = useSelector(moveRecordStore, (state) => state)
  const { data: torrents } = useMaindata(selectTorrents)
  const resolve = useLocationResolver()

  const latestRef = useRef({ resend, resolve })
  useLayoutEffect(() => {
    latestRef.current = { resend, resolve }
  })
  const previousRef = useRef<Readonly<Record<string, SlimTorrent>> | undefined>(
    undefined,
  )

  useEffect(() => {
    if (torrents === undefined) return
    const previous = previousRef.current
    previousRef.current = torrents
    // The store, not the render's copy: a second run sees what the first
    // one already dropped, so a toast never shows twice.
    const current = moveRecordStore.state
    const gone: Array<string> = []
    const seen: Record<string, MoveRecord> = {}
    for (const [hash, record] of Object.entries(current)) {
      if (!Object.hasOwn(torrents, hash)) {
        gone.push(hash)
        continue
      }
      const torrent = torrents[hash]
      const before =
        previous && Object.hasOwn(previous, hash) ? previous[hash] : undefined
      const outcome = moveOutcomeOf(record, before, torrent)
      if (outcome.kind === 'waiting') {
        if (outcome.record !== record) seen[hash] = outcome.record
        continue
      }
      gone.push(hash)
      const { resend: send, resolve: locate } = latestRef.current
      if (outcome.kind === 'done') {
        toast.plain(doneText(locate(torrent.save_path).name))
      } else if (outcome.kind === 'failed') {
        const { target } = record
        toast.failure(failedText(target), {
          keys: [moveToastKey(hash)],
          onRetry: () => send(hash, target),
        })
      }
    }
    dropMoveRecords(gone)
    updateMoveRecords(seen)
  }, [torrents, records])
}
