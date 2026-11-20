import { useEffect, useRef } from 'react'
import { detailPosition } from '#/lib/detail-position'
import { BOARD_COLUMN_NAMES } from '#/lib/torrent-status'
import { boardColumnOf } from '#/lib/visible-torrents'
import { useListView } from '#/state/list-view'
import { useLeavingHashes } from '#/state/leaving'
import { useBoardColumns, useShownTorrents } from '#/state/maindata'
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
// Story 4.4: a torrent this tab deleted is still there while its card
// fades (leaving, src/state/leaving.ts): the detail keeps the last target
// it showed, from the snapshot, and closes when the card leaves (L9).

export function useBoardDetailTarget({
  phone,
}: {
  phone: boolean
}): DetailTarget | null {
  const { hash, setHash } = useViewedHash()
  // Story 3.2: the selected category's columns, like the board; story 3.5:
  // with the keyword's filter too, so a torrent it filters out closes it.
  const { view } = useListView()
  const { data: columns } = useBoardColumns(view.category, view.query)
  const torrents = useShownTorrents()
  const leaving = useLeavingHashes()
  /** The last target shown, for a deleted torrent still fading. */
  const lastRef = useRef<{ hash: string; target: DetailTarget } | null>(null)

  const found = hash !== null && columns ? boardColumnOf(columns, hash) : null
  const column = phone && found === 'archived' ? null : found
  const fading = hash !== null && column === null && leaving.has(hash)
  const gone =
    hash !== null && columns !== undefined && column === null && !fading

  useEffect(() => {
    if (gone) setHash(null)
  }, [gone, setHash])

  if (fading) {
    const last = lastRef.current
    return last !== null && last.hash === hash ? last.target : null
  }
  if (hash === null || column === null || !columns || !torrents) return null
  if (!Object.hasOwn(torrents, hash)) return null
  const position = detailPosition(columns[column], hash)
  if (!position) return null
  const target = {
    torrent: torrents[hash],
    position,
    columnName: BOARD_COLUMN_NAMES[column],
  }
  lastRef.current = { hash, target }
  return target
}
