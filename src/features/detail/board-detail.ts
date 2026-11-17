import { useEffect } from 'react'
import { detailPosition } from '#/lib/detail-position'
import { BOARD_COLUMN_NAMES } from '#/lib/torrent-status'
import { boardColumnOf } from '#/lib/visible-torrents'
import { selectTorrents, useBoardColumns, useMaindata } from '#/state/maindata'
import { useViewedHash } from '#/state/viewed-hash'
import type { DetailTarget } from '#/features/detail/detail-view'

// Story 2.4: the board's detail target (desktop panel and phone sheet). The
// range is the torrent's column as the board shows it now (live, never
// frozen): N of M and ‹ › stay inside it and never jump to the next column;
// on the phone that column is the status tab it was opened from. A torrent
// that changes column keeps the detail open with the new column's name and
// N of M; one gone from every column (deleted) closes it, and so does a
// reloaded `hash` the board does not have.

export function useBoardDetailTarget(): DetailTarget | null {
  const { hash, setHash } = useViewedHash()
  const { data: columns } = useBoardColumns()
  const { data: torrents } = useMaindata(selectTorrents)

  const column = hash !== null && columns ? boardColumnOf(columns, hash) : null
  const gone = hash !== null && columns !== undefined && column === null

  useEffect(() => {
    if (gone) setHash(null)
  }, [gone, setHash])

  if (hash === null || column === null || !columns || !torrents) return null
  if (!Object.hasOwn(torrents, hash)) return null
  const position = detailPosition(columns[column], hash)
  if (!position) return null
  return {
    torrent: torrents[hash],
    position,
    columnName: BOARD_COLUMN_NAMES[column],
  }
}
