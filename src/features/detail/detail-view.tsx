import { useId } from 'react'
import type { Ref } from 'react'
import type { DetailPosition } from '#/lib/detail-position'
import { getTorrentDetail } from '#/server/functions/get-torrent-detail'
import type { SlimTorrent } from '#/shared/maindata'
import { cn } from '#/shared/ui/cn'
import { useDayClock } from '#/state/now'
import {
  bindFetchTorrentDetail,
  useTorrentDetail,
} from '#/state/torrent-detail'
import { infoRows } from '#/features/detail/detail-model'
import { DetailHeader } from '#/features/detail/detail-header'
import type { DetailHeaderLayout } from '#/features/detail/detail-header'

// Story 2.4: what the three detail containers share (DESIGN 詳情由上到下):
// the sticky header and the tabs, which stay put, and the overview tab,
// which scrolls. Tabs follow the WAI-ARIA tabs pattern
// (https://www.w3.org/WAI/ARIA/apg/patterns/tabs/): 概覽 is selected; 檔案
// stays disabled until story 2.7, so arrow keys have nowhere to go. The
// overview starts with the info list (UX-DR46); story 2.5 adds the status
// hero, stat tiles and save-path block above it.

export interface DetailTarget {
  torrent: SlimTorrent
  position: DetailPosition
  columnName?: string | null
}

export interface DetailTabsProps {
  phone: boolean
  /** The overview panel's id (`aria-controls`). */
  panelId: string
  tabId: string
  className?: string
}

export function DetailTabs({
  phone,
  panelId,
  tabId,
  className,
}: DetailTabsProps) {
  const size = phone ? 'h-11 px-[18px]' : 'h-8 px-4'
  return (
    <div
      role="tablist"
      aria-label="詳情分頁"
      className={cn('flex flex-none gap-1.5', className)}
    >
      <button
        type="button"
        role="tab"
        id={tabId}
        aria-selected="true"
        aria-controls={panelId}
        className={cn(
          'rounded-full border border-primary bg-primary font-semibold text-primary-foreground',
          size,
        )}
      >
        概覽
      </button>
      <button
        type="button"
        role="tab"
        aria-selected="false"
        disabled
        className={cn('rounded-full border bg-surface text-text', size)}
      >
        檔案
      </button>
    </div>
  )
}

const fetchTorrentDetail = bindFetchTorrentDetail(getTorrentDetail)

/** UX-DR46: label on the left in `text-muted`, the value right after it. */
export function InfoList({ torrent }: { torrent: SlimTorrent }) {
  const { today } = useDayClock()
  // Polls every 5 s while this detail shows, for this hash only (AD-6).
  const { data } = useTorrentDetail(torrent.hash, fetchTorrentDetail)
  return (
    <dl className="m-0 grid grid-cols-[72px_minmax(0,1fr)] gap-x-3 gap-y-2 text-[13px] leading-[1.4] tabular-nums">
      {infoRows(torrent, today, data?.detail).map((row) => (
        <div key={row.label} className="contents">
          <dt className="text-text-muted">{row.label}</dt>
          <dd
            className={cn(
              'm-0 min-w-0 [overflow-wrap:anywhere]',
              row.muted && 'text-text-muted',
            )}
          >
            {row.value}
          </dd>
        </div>
      ))}
    </dl>
  )
}

/** The overview tab's content (the info list for now). */
export function Overview({ torrent }: { torrent: SlimTorrent }) {
  return (
    <div className="flex flex-col gap-3.5">
      <InfoList torrent={torrent} />
    </div>
  )
}

export interface DetailIds {
  tabId: string
  panelId: string
}

export function useDetailIds(): DetailIds {
  const prefix = useId()
  return { tabId: `${prefix}-tab`, panelId: `${prefix}-panel` }
}

export interface DetailParts {
  layout: DetailHeaderLayout
  target: DetailTarget
  onNavigate: (hash: string) => void
  onClose?: () => void
  closeRef?: Ref<HTMLButtonElement>
  titleId?: string
}

/** Header and tabs: the part that never scrolls. */
export function DetailTop({
  layout,
  target,
  onNavigate,
  onClose,
  closeRef,
  titleId,
  ids,
}: DetailParts & { ids: DetailIds }) {
  const phone = layout === 'phone'
  return (
    <>
      <DetailHeader
        layout={layout}
        hash={target.torrent.hash}
        name={target.torrent.name}
        titleId={titleId}
        position={target.position}
        columnName={target.columnName}
        onNavigate={onNavigate}
        onClose={onClose}
        closeRef={closeRef}
      />
      <DetailTabs
        phone={phone}
        tabId={ids.tabId}
        panelId={ids.panelId}
        className={phone ? 'px-4 pt-3 pb-1' : 'px-[22px] pt-3 pb-1'}
      />
    </>
  )
}

/** The selected tab's panel. */
export function DetailPanelBody({
  torrent,
  ids,
  className,
}: {
  torrent: SlimTorrent
  ids: DetailIds
  className?: string
}) {
  return (
    <div
      role="tabpanel"
      id={ids.panelId}
      aria-labelledby={ids.tabId}
      // Nothing in it takes focus yet: the panel itself is the tab stop.
      tabIndex={0}
      className={className}
    >
      <Overview torrent={torrent} />
    </div>
  )
}
