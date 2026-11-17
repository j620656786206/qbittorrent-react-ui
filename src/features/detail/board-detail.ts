import { useEffect } from 'react'
import { detailPosition } from '#/lib/detail-position'
import { BOARD_COLUMN_NAMES } from '#/lib/torrent-status'
import { boardColumnOf } from '#/lib/visible-torrents'
import { selectTorrents, useBoardColumns, useMaindata } from '#/state/maindata'
import { useViewedHash } from '#/state/viewed-hash'
import type { DetailTarget } from '#/features/detail/detail-view'

// Story 2.4: the board's detail target (desktop panel and phone sheet). The
// range is the torrent's column as the board shows it now (live, never
// frozen): N of M and ‹ › stay inside it and never jump to the next column.
// It is the torrent's live column, so after a reload on the phone it can
// differ from the status tab on screen (spec 2.4 review). A torrent that
// changes column keeps the detail open with the new column's name and N of
// M; one gone from every column (deleted) closes it, and so does a reloaded
// `hash` the board does not have. The phone board has no 已整理 tab, so
// there an archived torrent counts as gone: the sheet closes (D11).

export function useBoardDetailTarget({
  phone,
}: {
  phone: boolean
}): DetailTarget | null {
  const { hash, setHash } = useViewedHash()
  const { data: columns } = useBoardColumns()
  const { data: torrents } = useMaindata(selectTorrents)

  const found = hash !== null && columns ? boardColumnOf(columns, hash) : null
  const column = phone && found === 'archived' ? null : found
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
