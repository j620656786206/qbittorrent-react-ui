import { AppError } from '#/lib/app-error'
import {
  OPERATION_FAILURE_CODES,
  setLocationFailureText,
} from '#/lib/error-text'
import type { OperationFailureCode } from '#/lib/error-text'
import type { BatchResult, SetLocationInput } from '#/shared/torrent-ops'
import { refreshMaindata } from '#/state/maindata'
import {
  MOVE_PENDING_OP,
  clearPendingAll,
  markPendingAll,
} from '#/state/pending-ops'
import type { TrackedOp } from '#/state/tracked-op'

// Story 5.2 (AD-7, AD-14): one `setLocation` through `sendOp`. The hashes go
// into `pendingOps` as `move` with their target on send; on success
// maindata refreshes and nothing local is edited (the container records
// `movingTo`, which the next maindata carries). A single torrent whose one
// item failed is that item's code failing (the container's pre-check:
// unknown is `invalid_input`, already moving `qbit_rejected`). The failure
// toast 「改路徑失敗：…」 with 重試 sends the same body; connection codes are
// the global handler's. The screen adds closing on success and a refresh
// on failure (a timeout may still have started the move).

export const MOVE_OP = 'set-location'

/**
 * A move's failure toast key: not the bare hash, which pause and delete
 * toasts of the same torrent use, so the change-path screen closing its own
 * toast never closes theirs.
 */
export function moveToastKey(hash: string): string {
  return `move:${hash}`
}

export interface MoveVariables {
  hashes: ReadonlyArray<string>
  /** Normalized. */
  location: string
}

export type SetLocationCall = (input: SetLocationInput) => Promise<BatchResult>

export type MoveOp = TrackedOp<MoveVariables, OperationFailureCode, BatchResult>

export function setLocationOp(call: SetLocationCall): MoveOp {
  return {
    name: MOVE_OP,
    call: async ({ hashes, location }) => {
      const result = await call({ hashes: [...hashes], location })
      if (hashes.length === 1 && result.items.length === 1) {
        const only = result.items[0]
        if (!only.ok) throw new AppError(only.code)
      }
      return result
    },
    keysOf: ({ hashes }) => hashes.map(moveToastKey),
    failureCodes: OPERATION_FAILURE_CODES,
    failureText: (_variables, code) => setLocationFailureText(code),
    onSend: ({ hashes, location }) =>
      markPendingAll(hashes, MOVE_PENDING_OP, location),
    onSuccess: (client) => {
      void refreshMaindata(client)
    },
    onFailure: ({ hashes }) => clearPendingAll(hashes),
  }
}
