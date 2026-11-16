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
  /** `warning` uses `status-stalled`; `muted` is `text-muted`. */
  tone: 'warning' | 'muted'
}

const RETRY: AlertAction = { action: 'retry', label: '重試' }
const RELOAD: AlertAction = { action: 'reload', label: '重新登入' }

/** Every per-kind rule in one place; the helpers below only read it. */
const KIND_RULES: Readonly<Record<ConnectionAlertKind, KindRule>> = {
  cloudflare_expired: {
    surface: 'bar',
    action: RELOAD,
    icon: 'warning',
    dim: false,
    tone: 'warning',
  },
  home_unreachable: {
    surface: 'bar',
    action: RETRY,
    icon: 'offline',
    dim: true,
    tone: 'warning',
  },
  qbit_unreachable: {
    surface: 'bar',
    action: RETRY,
    icon: 'offline',
    dim: true,
    tone: 'warning',
  },
  disconnected: {
    surface: 'speed',
    action: null,
    icon: 'warning',
    dim: false,
    tone: 'warning',
  },
  firewalled: {
    surface: 'speed',
    action: null,
    icon: 'warning',
    dim: false,
    tone: 'warning',
  },
  stale: {
    surface: 'stale',
    action: null,
    icon: 'warning',
    dim: false,
    tone: 'muted',
  },
}

export function alertSurface(kind: ConnectionAlertKind): AlertSurface {
  return KIND_RULES[kind].surface
}

export function alertAction(kind: ConnectionAlertKind): AlertAction | null {
  return KIND_RULES[kind].action
}

export function alertIcon(kind: ConnectionAlertKind): 'offline' | 'warning' {
  return KIND_RULES[kind].icon
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
  const rule = KIND_RULES[alert.kind]
  if (rule.surface !== 'bar' || !rule.action) return null
  // Bar kinds are connection codes: their text starts with errorText(code).
  const base = errorText(alert.kind as ConnectionCode)
  const split = alert.text.startsWith(base)
  const rest = split ? alert.text.slice(base.length).replace(/^，/, '') : ''
  return {
    text: split ? base : alert.text,
    detail: rest === '' ? null : rest,
    icon: rule.icon,
    action: rule.action.action,
    actionLabel: rule.action.label,
  }
}

/** Runs the bar button's handler: the screen supplies what retry means. */
export function runBarAction(
  action: BarAction,
  handlers: { retry: () => void; reload: () => void },
): void {
  handlers[action]()
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
      tone: KIND_RULES[code].tone,
    }
  }
  if (connectionStatus === 'disconnected') {
    return {
      kind: 'disconnected',
      text: '斷線了',
      tone: KIND_RULES.disconnected.tone,
    }
  }
  if (connectionStatus === 'firewalled') {
    return {
      kind: 'firewalled',
      text: '防火牆擋住了',
      tone: KIND_RULES.firewalled.tone,
    }
  }
  if (updated && !isFetchStarting(fetchStartedAt, now)) {
    return { kind: 'stale', text: updated, tone: KIND_RULES.stale.tone }
  }
  return null
}
