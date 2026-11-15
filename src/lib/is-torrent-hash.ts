const TORRENT_HASH = /^(?:[0-9a-f]{40}|[0-9a-f]{64})$/

export function isTorrentHash(value: string): boolean {
  return TORRENT_HASH.test(value)
}
