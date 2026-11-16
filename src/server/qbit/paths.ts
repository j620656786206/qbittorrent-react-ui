// AD-5 / AR-24: every qBittorrent path the container may call. Constants
// only; the session accepts nothing else (typed as `QbitPath`).
export const QBIT_PATHS = Object.freeze({
  login: '/api/v2/auth/login',
  syncMaindata: '/api/v2/sync/maindata',
} as const)

export type QbitPath = (typeof QBIT_PATHS)[keyof typeof QBIT_PATHS]
