import { TORRENT_HASH_PATTERN } from '#/shared/torrent-hash'

export function isTorrentHash(value: string): boolean {
  return TORRENT_HASH_PATTERN.test(value)
}
