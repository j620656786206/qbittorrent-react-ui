import { alertSurface, barFor, dimsContent } from '#/lib/connection-alert'
import type { ConnectionAlert, ConnectionBar } from '#/lib/connection-alert'
import {
  formatSpeed,
  formatSpeedLimit,
  formatSpeedLimitFull,
} from '#/lib/format'
import type { ServerState } from '#/shared/maindata'

// Spec 1.7 rows H1 to H11: everything the header shows, from the server
// state, the one connection alert and the 「全部」 count. Pure, so the rows
// are tested in node; the components only lay it out. Spec 1.8 row H1: when
// the first load failed with a code that has no alert (`loadFailed`), the
// skeletons go: each speed group reads 「沒有」 and the count is left out.

export interface SpeedGroup {
  /** 「9.95 MB/s」 */
  speed: string
  /** 「不限速」 or 「上限 32.7」 (`text-muted`). */
  limit: string
  /** For screen readers, unit kept: 「下載 9.95 MB/s，上限 32.7 MB/s」. */
  spoken: string
}

export interface HeaderModel {
  /**
   * Download and upload; `null` without data (skeleton bars while `loading`,
   * otherwise 「沒有」).
   */
  speeds: { down: SpeedGroup; up: SpeedGroup } | null
  /** No data yet and the first load has not failed: skeletons, `aria-busy`. */
  loading: boolean
  /**
   * qBittorrent's own connection problem (「防火牆擋住了」 「斷線了」): one
   * warning pill instead of both speed pills, and the phone line's text.
   */
  warning: string | null
  /** 「最後更新 N 前」 (`text-muted`) after the pills or the phone speeds. */
  staleText: string | null
  /** What the phone's second row shows. */
  phoneLine: 'speeds' | 'warning' | 'bar'
  /** The alert bar under the header (desktop) or as the phone's second row. */
  bar: ConnectionBar | null
  /** Content (`main`) at 50% opacity. */
  dim: boolean
  /**
   * The 「全部」 count without archived torrents; `null` is a skeleton while
   * `loading`, otherwise left out.
   */
  allCount: number | null
}

function speedGroup(
  direction: '下載' | '上傳',
  speed: number,
  limit: number,
): SpeedGroup {
  const shown = formatSpeed(speed)
  return {
    speed: shown,
    limit: formatSpeedLimit(limit),
    spoken: `${direction} ${shown}，${formatSpeedLimitFull(limit)}`,
  }
}

export function headerModel({
  serverState,
  alert,
  allCount,
  loadFailed = false,
}: {
  serverState: ServerState | undefined
  alert: ConnectionAlert | null
  allCount: number | undefined
  /**
   * No data and the maindata query failed with a first-load error
   * (`isFirstLoadError` in src/lib/app-error.ts).
   */
  loadFailed?: boolean
}): HeaderModel {
  const surface = alert ? alertSurface(alert.kind) : null
  const bar = barFor(alert)
  const warning = alert && surface === 'speed' ? alert.text : null
  return {
    speeds: serverState
      ? {
          down: speedGroup(
            '下載',
            serverState.dl_info_speed,
            serverState.dl_rate_limit,
          ),
          up: speedGroup(
            '上傳',
            serverState.up_info_speed,
            serverState.up_rate_limit,
          ),
        }
      : null,
    loading: !serverState && !loadFailed,
    warning,
    staleText: alert && surface === 'stale' ? alert.text : null,
    phoneLine: bar ? 'bar' : warning ? 'warning' : 'speeds',
    bar,
    dim: alert ? dimsContent(alert.kind) : false,
    allCount: allCount ?? null,
  }
}
