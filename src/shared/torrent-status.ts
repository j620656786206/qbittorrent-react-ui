// The 7 status ids, shared because src/lib (classify) and src/shared/ui (the
// status circle) both need them, and src/shared may import only itself.
// What each id means is src/lib/torrent-status.ts's job (AR-41).

/** Matches the `status-*` design tokens. */
export type TorrentStatusId =
  | 'downloading'
  | 'seeding'
  | 'done'
  | 'paused'
  | 'stalled'
  | 'error'
  | 'archived'
