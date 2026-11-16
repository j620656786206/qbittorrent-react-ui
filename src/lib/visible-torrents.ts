import { statusOf } from '#/lib/torrent-status'
import type { Maindata } from '#/lib/maindata-merge'
import type { SlimTorrent } from '#/shared/maindata'

// AR-41, AD-13: the only place torrents are ordered. Every screen that needs
// "the torrents you can see, in order" (list, board, detail's "N of M",
// arrow keys) takes this hash array. Archived torrents (non-private
// `missingFiles`) are never visible and never counted.

/**
 * What the visible list depends on. Epic 1 has one fixed order; category,
 * search and the other 50 sorts extend this object later.
 */
export interface TorrentView {
  sort: 'added_on_desc'
}

export const EPIC1_VIEW: TorrentView = Object.freeze({ sort: 'added_on_desc' })

function isVisible(
  torrent: SlimTorrent,
  stateBeforeMove: Maindata['stateBeforeMove'],
): boolean {
  return statusOf(torrent, stateBeforeMove) !== 'archived'
}

/** Newest first; equal times by hash, ascending. */
function byAddedOnDesc(a: SlimTorrent, b: SlimTorrent): number {
  if (a.added_on !== b.added_on) return b.added_on - a.added_on
  if (a.hash === b.hash) return 0
  return a.hash < b.hash ? -1 : 1
}

export function selectVisibleTorrents(
  maindata: Maindata,
  // Only one sort exists in Epic 1; the parameter keeps every caller ready.
  _view: TorrentView,
): Array<string> {
  const { torrents, stateBeforeMove } = maindata
  return Object.values(torrents)
    .filter((torrent) => isVisible(torrent, stateBeforeMove))
    .sort(byAddedOnDesc)
    .map((torrent) => torrent.hash)
}

/** The 「全部」 count: every torrent except archived ones. */
export function countAll(maindata: Maindata): number {
  let count = 0
  for (const torrent of Object.values(maindata.torrents)) {
    if (isVisible(torrent, maindata.stateBeforeMove)) count += 1
  }
  return count
}
