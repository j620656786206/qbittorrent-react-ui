import type { QueryClient } from '@tanstack/react-query'
import { AppError } from '#/lib/app-error'
import {
  OPERATION_FAILURE_CODES,
  setLocationFailureText,
} from '#/lib/error-text'
import type { OperationFailureCode } from '#/lib/error-text'
import type { Maindata } from '#/lib/maindata-merge'
import type { BatchResult, SetLocationInput } from '#/shared/torrent-ops'
import { MAINDATA_KEY, refreshMaindata } from '#/state/maindata'
import { moveToastKey, recordMoves } from '#/state/pending-ops'
import type { TrackedOp } from '#/state/tracked-op'

// Story 5.2 (AD-7, AD-14): one `setLocation` through `sendOp`. On success
// maindata refreshes and nothing local is edited (the container records
// `movingTo`, which the next maindata carries). Story 5.3: on success each
// hash whose item is ok gets a move record with the target and the
// `save_path` it leaves (`from`, read when Alex pressed, see
// moveVariables), which src/state/move-outcomes.ts turns into the done or
// failed toast; a refused item never toasts. A single torrent whose one
// item failed is that item's code failing (the container's pre-check:
// unknown is `invalid_input`, already moving `qbit_rejected`), thrown as
// MoveItemRefused so its text names the torrent, not the path or
// qBittorrent. The failure toast 「改路徑失敗：…」 with 重試 sends the same
// body; connection codes are the global handler's. The screen adds closing
// on success and a refresh on failure (a timeout may still have started
// the move).

export const MOVE_OP = 'set-location'

export interface MoveVariables {
  hashes: ReadonlyArray<string>
  /** Normalized. */
  location: string
  /** Each hash's `save_path` when Alex pressed (not sent). */
  from: Readonly<Record<string, string>>
}

/**
 * The variables of a move pressed now: `from` is each torrent's
 * `save_path` in maindata at this moment, before any answer or refresh.
 */
export function moveVariables(
  client: QueryClient,
  hashes: ReadonlyArray<string>,
  location: string,
): MoveVariables {
  const torrents = client.getQueryData<Maindata>(MAINDATA_KEY)?.torrents
  const from: Record<string, string> = {}
  for (const hash of hashes) {
    if (torrents && Object.hasOwn(torrents, hash)) {
      from[hash] = torrents[hash].save_path
    }
  }
  return { hashes, location, from }
}

/** A single torrent's own item refused by the container's pre-check. */
export class MoveItemRefused extends AppError {}

export type SetLocationCall = (input: SetLocationInput) => Promise<BatchResult>

export type MoveOp = TrackedOp<MoveVariables, OperationFailureCode, BatchResult>

export function setLocationOp(call: SetLocationCall): MoveOp {
  return {
    name: MOVE_OP,
    call: async ({ hashes, location }) => {
      const result = await call({ hashes: [...hashes], location })
      if (hashes.length === 1 && result.items.length === 1) {
        const only = result.items[0]
        if (!only.ok) throw new MoveItemRefused(only.code)
      }
      return result
    },
    keysOf: ({ hashes }) => hashes.map(moveToastKey),
    failureCodes: OPERATION_FAILURE_CODES,
    failureText: (_variables, code, error) =>
      setLocationFailureText(code, error instanceof MoveItemRefused),
    onSuccess: (client, { location, from }, result) => {
      recordMoves(
        result.items.filter((item) => item.ok).map((item) => item.key),
        location,
        (hash) => (Object.hasOwn(from, hash) ? from[hash] : ''),
      )
      void refreshMaindata(client)
    },
  }
}
