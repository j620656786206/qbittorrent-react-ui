// AD-5 / AR-24: every qBittorrent path the container may call. Constants
// only; the session accepts nothing else (typed as `QbitPath`).
export const QBIT_PATHS = Object.freeze({
  login: '/api/v2/auth/login',
  syncMaindata: '/api/v2/sync/maindata',
  // WebAPI 2.11 (qBittorrent 5.0) renamed pause/resume to stop/start.
  // https://github.com/qbittorrent/qBittorrent/wiki/WebUI-API-(qBittorrent-5.0)
  torrentsStop: '/api/v2/torrents/stop',
  torrentsStart: '/api/v2/torrents/start',
  // Story 2.7: a torrent's files and their priority (same wiki page).
  torrentsFiles: '/api/v2/torrents/files',
  torrentsFilePrio: '/api/v2/torrents/filePrio',
} as const)

export type QbitPath = (typeof QBIT_PATHS)[keyof typeof QBIT_PATHS]
