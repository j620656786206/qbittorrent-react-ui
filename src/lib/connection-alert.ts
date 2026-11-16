import { errorText } from '#/lib/error-text'
import { formatAgo } from '#/lib/format'
import type { ConnectionCode } from '#/lib/app-error'
import type { ServerState } from '#/shared/maindata'

// FR-6, FR-7, AD-13: the one function that picks the connection alert. One
// alert at a time, highest first: Cloudflare expired > home unreachable =
// qBittorrent not responding > disconnected > firewalled > stale data.

/** Data older than this (strictly) reads 「最後更新 N 秒前」. */
export const STALE_AFTER_MS = 10_000

/**
 * For this long after a fetch starts the stale line waits (the answer may be
 * a moment away, e.g. on returning to the tab). A fetch that hangs longer
 * (qBittorrent stuck: 25 to 35 s) shows it again.
 */
export const FETCH_GRACE_MS = 2_000

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
  /**
   * Epoch ms when the maindata fetch in flight started; `null` when none is.
   * From `useMaindataFetchStartedAt()` in src/state/maindata.ts.
   */
  fetchStartedAt: number | null
  /** Epoch ms. */
  now: number
}

/** 「最後更新 N 前」, only once the data is older than the stale threshold. */
function lastUpdated(lastSuccessAt: number | null, now: number): string | null {
  if (lastSuccessAt === null || lastSuccessAt <= 0) return null
  if (now - lastSuccessAt <= STALE_AFTER_MS) return null
  return `最後更新 ${formatAgo(lastSuccessAt / 1000, now)}`
}

/** Lower rank wins. Every ConnectionCode needs a row (a new code fails to compile). */
type CodeRank = 0 | 1

interface CodeAlert {
  rank: CodeRank
  /** Adds 「，最後更新 N 前」 once the data is stale. */
  withLastUpdated: boolean
}

const CODE_ALERTS: Readonly<Record<ConnectionCode, CodeAlert>> = {
  cloudflare_expired: { rank: 0, withLastUpdated: false },
  home_unreachable: { rank: 1, withLastUpdated: true },
  qbit_unreachable: { rank: 1, withLastUpdated: true },
}

/** The highest active code; on equal rank the one listed first. */
function topCode(codes: ReadonlyArray<ConnectionCode>): ConnectionCode | null {
  let top: ConnectionCode | null = null
  for (const code of codes) {
    if (top === null || CODE_ALERTS[code].rank < CODE_ALERTS[top].rank) {
      top = code
    }
  }
  return top
}

function isFetchStarting(fetchStartedAt: number | null, now: number): boolean {
  return fetchStartedAt !== null && now - fetchStartedAt < FETCH_GRACE_MS
}

export function pickConnectionAlert({
  errorCodes,
  connectionStatus,
  lastSuccessAt,
  fetchStartedAt,
  now,
}: ConnectionAlertInput): ConnectionAlert | null {
  const updated = lastUpdated(lastSuccessAt, now)
  const code = topCode(errorCodes)
  if (code) {
    const text = errorText(code)
    return {
      kind: code,
      text:
        CODE_ALERTS[code].withLastUpdated && updated
          ? `${text}，${updated}`
          : text,
      tone: 'warning',
    }
  }
  if (connectionStatus === 'disconnected') {
    return { kind: 'disconnected', text: '斷線了', tone: 'warning' }
  }
  if (connectionStatus === 'firewalled') {
    return { kind: 'firewalled', text: '防火牆擋住了', tone: 'warning' }
  }
  if (updated && !isFetchStarting(fetchStartedAt, now)) {
    return { kind: 'stale', text: updated, tone: 'muted' }
  }
  return null
}
