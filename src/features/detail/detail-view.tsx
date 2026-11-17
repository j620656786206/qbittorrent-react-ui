import { useId } from 'react'
import type { Ref } from 'react'
import type { DetailPosition } from '#/lib/detail-position'
import type { SlimTorrent } from '#/shared/maindata'
import { cn } from '#/shared/ui/cn'
import { DetailHeader } from '#/features/detail/detail-header'
import type { DetailHeaderLayout } from '#/features/detail/detail-header'
import { Overview } from '#/features/detail/overview'

// Story 2.4: what the three detail containers share (DESIGN 詳情由上到下):
// the sticky header and the tabs, which stay put, and the overview tab,
// which scrolls. Tabs follow the WAI-ARIA tabs pattern
// (https://www.w3.org/WAI/ARIA/apg/patterns/tabs/): 概覽 is selected; 檔案
// stays disabled until story 2.7, so arrow keys have nowhere to go. The
// overview (story 2.5: hero, stat tiles, save-path block, info list) is in
// overview.tsx.

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
  phone = false,
  className,
}: {
  torrent: SlimTorrent
  ids: DetailIds
  /** The phone sheet: 44px pills in a 2 x 2 grid, the path taps open. */
  phone?: boolean
  className?: string
}) {
  return (
    <div
      role="tabpanel"
      id={ids.panelId}
      aria-labelledby={ids.tabId}
      // The panel is the scroller and its first content (hero, tiles) takes
      // no focus, so the panel itself is a tab stop
      // (https://www.w3.org/WAI/ARIA/apg/patterns/tabs/).
      tabIndex={0}
      className={className}
    >
      <Overview torrent={torrent} phone={phone} />
    </div>
  )
}
