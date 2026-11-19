import { detailPosition } from '#/lib/detail-position'
import { selectTorrents, useMaindata } from '#/state/maindata'
import { useShownList } from '#/state/shown-order'
import { useViewedHash } from '#/state/viewed-hash'
import {
  DetailPanelBody,
  DetailTop,
  useDetailTabs,
} from '#/features/detail/detail-view'

// Story 2.4, DESIGN detail-panel (mockup S01-list-mode-desktop): desktop
// list mode's permanent right panel, `surface`, radius 22px. It shows the
// row the list marks as viewed (published with the order it shows, so N of
// M and ‹ › follow exactly the rows on screen, frozen or not). The header
// and tabs stay; the overview scrolls by itself.

export function ListDetailPanel() {
  const { order, viewed } = useShownList()
  const { setHash } = useViewedHash()
  const { data: torrents } = useMaindata(selectTorrents)
  const torrent =
    viewed !== null && torrents && Object.hasOwn(torrents, viewed)
      ? torrents[viewed]
      : undefined
  const position = order ? detailPosition(order, viewed) : null
  const tabs = useDetailTabs(torrent !== undefined && position !== null)

  return (
    <aside
      aria-label="詳情"
      className="flex min-h-0 min-w-0 flex-col overflow-hidden rounded-panel bg-surface"
    >
      {torrent && position && (
        <>
          <DetailTop
            layout="row"
            target={{ torrent, position }}
            onNavigate={setHash}
            tabs={tabs}
          />
          <DetailPanelBody
            torrent={torrent}
            tabs={tabs}
            className="min-h-0 flex-1 overflow-y-auto px-[22px] pt-3 pb-page-desktop-bottom [scrollbar-width:thin]"
          />
        </>
      )}
    </aside>
  )
}
