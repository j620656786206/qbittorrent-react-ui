// AD-5 / AR-24: every qBittorrent path the container may call. Constants
// only; the session accepts nothing else (typed as `QbitPath`).
export const QBIT_PATHS = Object.freeze({
  login: '/api/v2/auth/login',
  syncMaindata: '/api/v2/sync/maindata',
  // WebAPI 2.11 (qBittorrent 5.0) renamed pause/resume to stop/start.
  // https://github.com/qbittorrent/qBittorrent/wiki/WebUI-API-(qBittorrent-5.0)
  torrentsStop: '/api/v2/torrents/stop',
  torrentsStart: '/api/v2/torrents/start',
  // Story 4.3: delete, with or without the files (same wiki page).
  // https://github.com/qbittorrent/qBittorrent/wiki/WebUI-API-(qBittorrent-5.0)#delete-torrents
  torrentsDelete: '/api/v2/torrents/delete',
  // Story 5.2: move torrents' files; `hashes` joined by `|`, `location`.
  // 400 empty save path, 409 cannot create the folder, 200 otherwise.
  // https://github.com/qbittorrent/qBittorrent/wiki/WebUI-API-(qBittorrent-5.0)#set-torrent-location
  torrentsSetLocation: '/api/v2/torrents/setLocation',
  // Story 4.7: add one magnet link or one .torrent file (multipart).
  // https://github.com/qbittorrent/qBittorrent/wiki/WebUI-API-(qBittorrent-5.0)#add-new-torrent
  torrentsAdd: '/api/v2/torrents/add',
  // Story 2.7: a torrent's files and their priority (same wiki page).
  torrentsFiles: '/api/v2/torrents/files',
  torrentsFilePrio: '/api/v2/torrents/filePrio',
  // Story 2.10: qBittorrent's own log, read only for errored torrents'
  // reasons (warning level, incremental by `last_known_id`).
  // https://github.com/qbittorrent/qBittorrent/wiki/WebUI-API-(qBittorrent-5.0)#get-log
  logMain: '/api/v2/log/main',
} as const)

export type QbitPath = (typeof QBIT_PATHS)[keyof typeof QBIT_PATHS]
