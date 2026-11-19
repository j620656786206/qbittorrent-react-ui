import { formatCount, formatSize } from '#/lib/format'
import { heroKindOf, statusOf } from '#/lib/torrent-status'
import type { SlimTorrent } from '#/shared/maindata'

// Story 4.1 (epic 4 「選取總大小只算檔案還在的」): what the selection bar
// counts. `count` is every selected torrent still in maindata; `bytes`
// sums `size` (the value the row shows) only over the ones whose files
// exist, so 已整理 (`statusOf` archived) and 找不到檔案 (`heroKindOf`
// missing_files) count in N but add nothing to the size. Story 4.3's delete
// size reads the same function.

export interface SelectionTotal {
  /** Selected torrents still in maindata. */
  count: number
  /** Their `size` summed, without 已整理 and 找不到檔案. */
  bytes: number
}

/** The count and size of `hashes` in `torrents`. */
export function selectionTotal(
  torrents: Readonly<Record<string, SlimTorrent>>,
  hashes: ReadonlyArray<string>,
  stateBeforeMove: Readonly<Record<string, string>>,
): SelectionTotal {
  let count = 0
  let bytes = 0
  for (const hash of hashes) {
    if (!Object.hasOwn(torrents, hash)) continue
    const torrent = torrents[hash]
    count += 1
    if (filesGone(torrent, stateBeforeMove)) continue
    bytes += torrent.size
  }
  return { count, bytes }
}

function filesGone(
  torrent: SlimTorrent,
  stateBeforeMove: Readonly<Record<string, string>>,
): boolean {
  return (
    statusOf(torrent, stateBeforeMove) === 'archived' ||
    heroKindOf(torrent, stateBeforeMove) === 'missing_files'
  )
}

/** The bar's two texts: 「已選 3,626 個」 and 「共 301.2 GB」. */
export function selectionBarText(total: SelectionTotal): {
  count: string
  size: string
} {
  return {
    count: `已選 ${formatCount(total.count)} 個`,
    size: `共 ${formatSize(total.bytes)}`,
  }
}
