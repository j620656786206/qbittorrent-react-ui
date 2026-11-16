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
  /** The problem itself (for `stale`, the 「最後更新」 line, which ticks). */
  text: string
  /**
   * 「最後更新 N 前」 next to a problem, once the data is stale; it ticks, so
   * the bar keeps it out of its live region. `null` otherwise.
   */
  detail: string | null
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

function isFetchStarting(fetchStartedAt: number | null, now: number): boolean {
  return fetchStartedAt !== null && now - fetchStartedAt < FETCH_GRACE_MS
}

/**
 * Story 1.7: where an alert shows. The three codes get the alert bar under
 * the header; qBittorrent's own connection state replaces the speeds; stale
 * data adds the muted 「最後更新 N 前」 next to them.
 */
export type AlertSurface = 'bar' | 'speed' | 'stale'

export type BarAction = 'retry' | 'reload'

export interface AlertAction {
  /**
   * `retry` fetches again now (`refreshMaindata`, or the login form's
   * resubmit); `reload` reloads so Cloudflare Access can ask for its login.
   */
  action: BarAction
  label: '重試' | '重新登入'
}

interface KindRule {
  surface: AlertSurface
  /** The bar's button; `null` for the kinds without a bar. */
  action: AlertAction | null
  /** `offline` is the mockup's icon for a broken chain to home. */
  icon: 'offline' | 'warning'
  /** Content at 50%: the data on screen may be old. */
  dim: boolean
  /** Lower wins; on equal rank the one found first. */
  rank: number
  /** Adds 「最後更新 N 前」 as `detail` once the data is stale. */
  withLastUpdated: boolean
}

const RETRY: AlertAction = { action: 'retry', label: '重試' }
const RELOAD: AlertAction = { action: 'reload', label: '重新登入' }

/**
 * Every per-kind rule in one place; the helpers below only read it. Every
 * kind needs a row (a new code fails to compile).
 */
const KIND_RULES: Readonly<Record<ConnectionAlertKind, KindRule>> = {
  cloudflare_expired: {
    surface: 'bar',
    action: RELOAD,
    icon: 'warning',
    dim: false,
    rank: 0,
    withLastUpdated: false,
  },
  home_unreachable: {
    surface: 'bar',
    action: RETRY,
    icon: 'offline',
    dim: true,
    rank: 1,
    withLastUpdated: true,
  },
  qbit_unreachable: {
    surface: 'bar',
    action: RETRY,
    icon: 'offline',
    dim: true,
    rank: 1,
    withLastUpdated: true,
  },
  disconnected: {
    surface: 'speed',
    action: null,
    icon: 'warning',
    dim: false,
    rank: 2,
    withLastUpdated: false,
  },
  firewalled: {
    surface: 'speed',
    action: null,
    icon: 'warning',
    dim: false,
    rank: 3,
    withLastUpdated: false,
  },
  stale: {
    surface: 'stale',
    action: null,
    icon: 'warning',
    dim: false,
    rank: 4,
    withLastUpdated: false,
  },
}

export function alertSurface(kind: ConnectionAlertKind): AlertSurface {
  return KIND_RULES[kind].surface
}

export function dimsContent(kind: ConnectionAlertKind): boolean {
  return KIND_RULES[kind].dim
}

/** The alert bar, the same on the header and the login screen. */
export interface ConnectionBar {
  /** The problem itself; stable, so it is the bar's live region. */
  text: string
  /** 「最後更新 N 前」 once stale; it ticks, so it stays out of the live region. */
  detail: string | null
  icon: 'offline' | 'warning'
  action: BarAction
  actionLabel: string
}

/** The bar for an alert, or `null` when it does not use the bar. */
export function barFor(alert: ConnectionAlert | null): ConnectionBar | null {
  if (!alert) return null
  const { surface, action, icon } = KIND_RULES[alert.kind]
  if (surface !== 'bar' || !action) return null
  return {
    text: alert.text,
    detail: alert.detail,
    icon,
    action: action.action,
    actionLabel: action.label,
  }
}

const STATUS_TEXT = {
  disconnected: '斷線了',
  firewalled: '防火牆擋住了',
} as const

/** Every alert that applies now, in the order found (codes first). */
function activeKinds(
  { errorCodes, connectionStatus, fetchStartedAt, now }: ConnectionAlertInput,
  updated: string | null,
): Array<ConnectionAlertKind> {
  const kinds: Array<ConnectionAlertKind> = [...errorCodes]
  if (
    connectionStatus === 'disconnected' ||
    connectionStatus === 'firewalled'
  ) {
    kinds.push(connectionStatus)
  }
  if (updated && !isFetchStarting(fetchStartedAt, now)) kinds.push('stale')
  return kinds
}

export function pickConnectionAlert(
  input: ConnectionAlertInput,
): ConnectionAlert | null {
  const updated = lastUpdated(input.lastSuccessAt, input.now)
  let kind: ConnectionAlertKind | null = null
  for (const candidate of activeKinds(input, updated)) {
    if (kind === null || KIND_RULES[candidate].rank < KIND_RULES[kind].rank) {
      kind = candidate
    }
  }
  if (kind === null) return null
  if (kind === 'stale') return { kind, text: updated ?? '', detail: null }
  return {
    kind,
    text:
      kind === 'disconnected' || kind === 'firewalled'
        ? STATUS_TEXT[kind]
        : errorText(kind),
    detail: KIND_RULES[kind].withLastUpdated ? updated : null,
  }
}
