import { useId, useLayoutEffect, useRef, useState } from 'react'
import type { KeyboardEvent, Ref } from 'react'
import type { DetailPosition } from '#/lib/detail-position'
import type { SlimTorrent } from '#/shared/maindata'
import { cn } from '#/shared/ui/cn'
import { OWN_ARROWS } from '#/state/shortcuts'
import { DetailHeader } from '#/features/detail/detail-header'
import type { DetailHeaderLayout } from '#/features/detail/detail-header'
import { FilesTab } from '#/features/detail/files-tab'
import { Overview } from '#/features/detail/overview'

// Story 2.4: what the three detail containers share (DESIGN 詳情由上到下):
// the sticky header and the tabs, which stay put, and the selected tab's
// panel, which scrolls. Tabs follow the WAI-ARIA tabs pattern
// (https://www.w3.org/WAI/ARIA/apg/patterns/tabs/): roving `tabIndex`, ←
// → (wrapping) and Home/End move between 概覽 and 檔案 and select it
// (story 2.7). The selected tab is the container's own state: it stays
// across ‹ › and is 概覽 again when a closed detail opens. The overview
// (story 2.5) is in overview.tsx, the files tab (story 2.7) in
// files-tab.tsx.

export interface DetailTarget {
  torrent: SlimTorrent
  position: DetailPosition
  columnName?: string | null
}

export type DetailTab = 'overview' | 'files'

const TABS: ReadonlyArray<readonly [DetailTab, string]> = [
  ['overview', '概覽'],
  ['files', '檔案'],
]

export interface DetailIds {
  tabIds: Readonly<Record<DetailTab, string>>
  panelId: string
}

export interface DetailTabState {
  ids: DetailIds
  tab: DetailTab
  setTab: (tab: DetailTab) => void
}

/**
 * The tab ids and the selected tab of one container. `open`: whether it
 * shows a torrent now. A detail that opens again starts on 概覽; while it
 * closes (the phone sheet slides out with its last content) the tab stays.
 */
export function useDetailTabs(open: boolean): DetailTabState {
  const prefix = useId()
  const [tab, setTab] = useState<DetailTab>('overview')
  const [wasOpen, setWasOpen] = useState(open)
  // Adjusted while rendering (React's "storing information from previous
  // renders" pattern): closed to open starts on 概覽.
  if (open !== wasOpen) {
    setWasOpen(open)
    if (open) setTab('overview')
  }
  return {
    ids: {
      tabIds: { overview: `${prefix}-tab`, files: `${prefix}-files-tab` },
      panelId: `${prefix}-panel`,
    },
    tab,
    setTab,
  }
}

export interface DetailTabsProps {
  phone: boolean
  tabs: DetailTabState
  className?: string
}

export function DetailTabs({ phone, tabs, className }: DetailTabsProps) {
  const size = phone ? 'h-11 px-[18px]' : 'h-8 px-4'
  const refs = useRef<Partial<Record<DetailTab, HTMLButtonElement | null>>>({})
  const { ids, tab, setTab } = tabs

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const at = TABS.findIndex(([key]) => key === tab)
    let next: number
    if (event.key === 'ArrowRight') next = (at + 1) % TABS.length
    else if (event.key === 'ArrowLeft')
      next = (at - 1 + TABS.length) % TABS.length
    else if (event.key === 'Home') next = 0
    else if (event.key === 'End') next = TABS.length - 1
    else return
    event.preventDefault()
    const key = TABS[next][0]
    setTab(key)
    refs.current[key]?.focus()
  }

  return (
    <div
      role="tablist"
      aria-label="詳情分頁"
      // Story 3.7: focus here, `↑` `↓` are the tabs' own, not the torrent.
      {...OWN_ARROWS}
      onKeyDown={onKeyDown}
      className={cn('flex flex-none gap-1.5', className)}
    >
      {TABS.map(([key, label]) => {
        const selected = key === tab
        return (
          <button
            key={key}
            ref={(element) => {
              refs.current[key] = element
            }}
            type="button"
            role="tab"
            id={ids.tabIds[key]}
            aria-selected={selected}
            aria-controls={ids.panelId}
            tabIndex={selected ? 0 : -1}
            onClick={() => setTab(key)}
            className={cn(
              'rounded-full border',
              selected
                ? 'border-primary bg-primary font-semibold text-primary-foreground'
                : 'bg-surface text-text hover-outline',
              size,
            )}
          >
            {label}
          </button>
        )
      })}
    </div>
  )
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
  tabs,
  arrowKeys,
}: DetailParts & { tabs: DetailTabState; arrowKeys?: boolean }) {
  const phone = layout === 'phone'
  return (
    <>
      <DetailHeader
        layout={layout}
        torrent={target.torrent}
        titleId={titleId}
        position={target.position}
        columnName={target.columnName}
        onNavigate={onNavigate}
        onClose={onClose}
        closeRef={closeRef}
        arrowKeys={arrowKeys}
      />
      <DetailTabs
        phone={phone}
        tabs={tabs}
        className={phone ? 'px-4 pt-3 pb-1' : 'px-[22px] pt-3 pb-1'}
      />
    </>
  )
}

/** The selected tab's panel. */
export function DetailPanelBody({
  torrent,
  tabs,
  phone = false,
  className,
}: {
  torrent: SlimTorrent
  tabs: DetailTabState
  /** The phone sheet: 44px pills in a 2 x 2 grid, the path taps open. */
  phone?: boolean
  className?: string
}) {
  // ‹ ›, another card and another tab start from the top: the panel
  // scrolls itself on desktop, the sheet's content scrolls on the phone.
  const { ids, tab } = tabs
  const panelRef = useRef<HTMLDivElement>(null)
  const shownRef = useRef(`${torrent.hash}:${tab}`)
  useLayoutEffect(() => {
    const shown = `${torrent.hash}:${tab}`
    if (shownRef.current === shown) return
    shownRef.current = shown
    const scroller = scrollerOf(panelRef.current)
    if (scroller) scroller.scrollTop = 0
  }, [torrent.hash, tab])
  return (
    <div
      ref={panelRef}
      role="tabpanel"
      id={ids.panelId}
      aria-labelledby={ids.tabIds[tab]}
      // The panel is the scroller and the overview's first content (hero,
      // tiles) takes no focus, so the panel itself is a tab stop
      // (https://www.w3.org/WAI/ARIA/apg/patterns/tabs/).
      tabIndex={0}
      // Story 3.7: focus in the body (its scroll, the file list), `↑` `↓`
      // scroll it instead of changing the torrent.
      {...OWN_ARROWS}
      className={className}
    >
      {tab === 'files' ? (
        <FilesTab torrent={torrent} phone={phone} />
      ) : (
        <Overview torrent={torrent} phone={phone} />
      )}
    </div>
  )
}

/** The element itself or its nearest ancestor that scrolls vertically. */
function scrollerOf(element: HTMLElement | null): HTMLElement | null {
  for (let node = element; node !== null; node = node.parentElement) {
    const { overflowY } = getComputedStyle(node)
    if (overflowY === 'auto' || overflowY === 'scroll') return node
  }
  return null
}
