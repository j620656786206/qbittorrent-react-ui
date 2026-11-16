import { errorText } from '#/lib/error-text'
import { formatAgo } from '#/lib/format'
import type { ConnectionCode } from '#/lib/app-error'
import type { ServerState } from '#/shared/maindata'

// FR-6, FR-7, AD-13: the one function that picks the connection alert. One
// alert at a time, highest first: Cloudflare expired > home unreachable =
// qBittorrent not responding > disconnected > firewalled > stale data.

/** Data older than this (strictly) reads 「最後更新 N 秒前」. */
export const STALE_AFTER_MS = 10_000

export type ConnectionAlertKind =
  ConnectionCode | 'disconnected' | 'firewalled' | 'stale'

export interface ConnectionAlert {
  kind: ConnectionAlertKind
  text: string
  /** `warning` uses `status-stalled`; `muted` is `text-muted`. */
  tone: 'warning' | 'muted'
}

export interface ConnectionAlertInput {
  /** Every active code, from src/state/connection.ts. */
  errorCodes: ReadonlyArray<ConnectionCode>
  /** `serverState.connection_status` of the data on screen, if any. */
  connectionStatus: ServerState['connection_status'] | null | undefined
  /**
   * Epoch ms of the last successful fetch (`dataUpdatedAt`); `null`, or 0 or
   * less (Query's value before the first success), means never.
   */
  lastSuccessAt: number | null
  /** A fetch is in flight (e.g. the refetch on returning to the tab). */
  isFetching: boolean
  /** Epoch ms. */
  now: number
}

/** 「最後更新 N 前」, only once the data is older than the stale threshold. */
function lastUpdated(lastSuccessAt: number | null, now: number): string | null {
  if (lastSuccessAt === null || lastSuccessAt <= 0) return null
  if (now - lastSuccessAt <= STALE_AFTER_MS) return null
  return `最後更新 ${formatAgo(lastSuccessAt / 1000, now)}`
}

/** Unreachable codes, highest first; equal rank, so the order is stable. */
const UNREACHABLE: ReadonlyArray<ConnectionCode> = [
  'home_unreachable',
  'qbit_unreachable',
]

export function pickConnectionAlert({
  errorCodes,
  connectionStatus,
  lastSuccessAt,
  isFetching,
  now,
}: ConnectionAlertInput): ConnectionAlert | null {
  const updated = lastUpdated(lastSuccessAt, now)
  if (errorCodes.includes('cloudflare_expired')) {
    return {
      kind: 'cloudflare_expired',
      text: errorText('cloudflare_expired'),
      tone: 'warning',
    }
  }
  const unreachable = UNREACHABLE.find((code) => errorCodes.includes(code))
  if (unreachable) {
    return {
      kind: unreachable,
      text: updated
        ? `${errorText(unreachable)}，${updated}`
        : errorText(unreachable),
      tone: 'warning',
    }
  }
  if (connectionStatus === 'disconnected') {
    return { kind: 'disconnected', text: '斷線了', tone: 'warning' }
  }
  if (connectionStatus === 'firewalled') {
    return { kind: 'firewalled', text: '防火牆擋住了', tone: 'warning' }
  }
  // While a fetch is in flight the data may be fresh in a moment.
  if (updated && !isFetching) {
    return { kind: 'stale', text: updated, tone: 'muted' }
  }
  return null
}
