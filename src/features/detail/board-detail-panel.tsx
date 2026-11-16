import { useCallback, useLayoutEffect, useRef } from 'react'
import { getMain } from '#/shared/ui/main-scroll'
import { useEscapeLayer } from '#/state/shortcuts'
import { useViewedHash } from '#/state/viewed-hash'
import { useBoardDetailTarget } from '#/features/detail/board-detail'
import {
  DetailPanelBody,
  DetailTop,
  useDetailIds,
} from '#/features/detail/detail-view'

// Story 2.4, DESIGN detail-panel (mockup SD-board-detail-desktop): desktop
// board mode's floating panel. It lies over the 完成 and 已整理 columns
// inside the board's `position: relative` wrapper: right edge and top and
// bottom aligned with the columns, as wide as one work column plus the 14px
// gap plus the 64px 已整理 strip; radius 22px, the float shadow, no scrim.
// It slides in from 24px right (0.3s, transform and opacity only; none with
// reduced motion) and stays mounted while Alex switches cards, so a switch
// does not replay it. The board stays clickable behind it. `Esc` (the
// shortcut registry), the ✕ and a click on empty board space (the route)
// close it and remove `hash`. A covered 完成 card is left as is.

export function BoardDetailPanel() {
  const target = useBoardDetailTarget()
  const { setHash } = useViewedHash()
  const ids = useDetailIds()
  const open = target !== null
  const asideRef = useRef<HTMLElement>(null)
  /** What had focus when the panel opened (the card), for the way back. */
  const openerRef = useRef<HTMLElement | null>(null)

  useLayoutEffect(() => {
    if (!open) return
    const active = document.activeElement
    openerRef.current =
      active instanceof HTMLElement && active !== document.body ? active : null
  }, [open])

  const close = useCallback(() => {
    const aside = asideRef.current
    const active = document.activeElement
    // Focus inside the panel would drop to `body` when it goes.
    const focusInside =
      aside !== null && active instanceof Node && aside.contains(active)
    setHash(null)
    if (!focusInside) return
    const opener = openerRef.current
    const back = opener?.isConnected ? opener : getMain()
    back?.focus({ preventScroll: true })
  }, [setHash])

  useEscapeLayer(open, close)

  if (!target) return null
  return (
    <aside
      ref={asideRef}
      aria-label="詳情"
      data-slot="board-detail"
      className="absolute top-0 right-0 bottom-0 z-10 flex w-[calc((100%-120px)/4+78px)] max-w-full animate-panel-in flex-col overflow-hidden rounded-panel bg-surface shadow-float"
    >
      <DetailTop
        layout="stacked"
        target={target}
        onNavigate={setHash}
        onClose={close}
        ids={ids}
      />
      <DetailPanelBody
        torrent={target.torrent}
        ids={ids}
        className="min-h-0 flex-1 overflow-y-auto px-[22px] pt-3 pb-[22px] [scrollbar-width:thin]"
      />
    </aside>
  )
}
