import { pickConnectionAlert } from '#/lib/connection-alert'
import type { ConnectionCode } from '#/lib/app-error'
import type {
  ConnectionAlert,
  ConnectionAlertInput,
} from '#/lib/connection-alert'
import type { ServerState } from '#/shared/maindata'
import { useConnectionErrors } from '#/state/connection'
import {
  selectConnectionStatus,
  useMaindata,
  useMaindataFetchStartedAt,
} from '#/state/maindata'
import { useNow } from '#/state/now'

// Story 1.7, AD-13: the one connection alert on screen, always chosen by
// `pickConnectionAlert`. Both hooks tick or read stores, so call them only in
// small leaf components (the speed area, the bar, the content dim), never
// in one that renders the list.

export interface AlertSources {
  /** The active codes from src/state/connection.ts. */
  errorCodes: ReadonlyArray<ConnectionCode>
  /** `connection_status` of the data on screen; `undefined` before any. */
  connectionStatus: ServerState['connection_status'] | undefined
  /** Query's `dataUpdatedAt`: 0 until the first success. */
  dataUpdatedAt: number
  fetchStartedAt: number | null
  now: number
}

/** Pure: what the authed pages pass to `pickConnectionAlert`. */
export function connectionAlertInput({
  errorCodes,
  connectionStatus,
  dataUpdatedAt,
  fetchStartedAt,
  now,
}: AlertSources): ConnectionAlertInput {
  return {
    errorCodes,
    connectionStatus: connectionStatus ?? null,
    lastSuccessAt: dataUpdatedAt > 0 ? dataUpdatedAt : null,
    fetchStartedAt,
    now,
  }
}

/**
 * The login screen has no data: only the recorded codes, so no
 * 「最後更新」 suffix and no qBittorrent state. Pure.
 */
export function loginConnectionAlertInput(
  errorCodes: ReadonlyArray<ConnectionCode>,
): ConnectionAlertInput {
  return {
    errorCodes,
    connectionStatus: null,
    lastSuccessAt: null,
    fetchStartedAt: null,
    now: 0,
  }
}

/**
 * The alert for the authed pages, re-read every second so 「最後更新 N 秒前」
 * counts up. Mounting it also mounts the `['maindata']` poll.
 */
export function useConnectionAlert(): ConnectionAlert | null {
  const now = useNow(1000)
  const errorCodes = useConnectionErrors()
  const { data: connectionStatus, dataUpdatedAt } = useMaindata(
    selectConnectionStatus,
  )
  const fetchStartedAt = useMaindataFetchStartedAt()
  return pickConnectionAlert(
    connectionAlertInput({
      errorCodes,
      connectionStatus,
      dataUpdatedAt,
      fetchStartedAt,
      now,
    }),
  )
}

/** The alert for the login screen; mounts no maindata observer. */
export function useLoginConnectionAlert(): ConnectionAlert | null {
  const errorCodes = useConnectionErrors()
  return pickConnectionAlert(loginConnectionAlertInput(errorCodes))
}
