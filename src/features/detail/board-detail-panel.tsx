import { useCallback, useLayoutEffect, useRef } from 'react'
import { useIsDesktop } from '#/shared/ui/breakpoint'
import { getMain } from '#/shared/ui/main-scroll'
import { useEscapeLayer } from '#/state/shortcuts'
import { useViewedHash } from '#/state/viewed-hash'
import { useBoardDetailTarget } from '#/features/detail/board-detail'
import {
  DetailPanelBody,
  DetailTop,
  useDetailTabs,
} from '#/features/detail/detail-view'

// Story 2.4, DESIGN detail-panel (mockup SD-board-detail-desktop): desktop
// board mode's floating panel. It lies over the 完成 and 已整理 columns
// inside the board's `position: relative` wrapper: right edge and top and
// bottom aligned with the columns, as wide as one work column plus the 14px
// gap plus the 64px 已整理 strip (with 已整理 expanded: two columns and
// their gap); radius 22px, the float shadow, no scrim.
// It slides in from 24px right (0.3s, transform and opacity only; none with
// reduced motion) and stays mounted while Alex switches cards, so a switch
// does not replay it. The board stays clickable behind it. `Esc` (the
// shortcut registry), the ✕ and a click on empty board space (the route)
// close it and remove `hash`. A covered 完成 card is left as is.
// Story 3.7: while it is open on desktop, `↑` `↓` do what ‹ › do (the
// same column, never the next one), also with focus on ‹ › or ✕; with it
// closed, or with focus in its tabs or body, they are not taken.

export function BoardDetailPanel() {
  const target = useBoardDetailTarget({ phone: false })
  const { setHash } = useViewedHash()
  const desktop = useIsDesktop()
  const open = target !== null
  const tabs = useDetailTabs(open)
  const asideRef = useRef<HTMLElement>(null)
  /** The card focus goes back to when the panel closes. */
  const openerRef = useRef<HTMLElement | null>(null)

  // The card that opened it, or the one a later click switched to. A ‹ ›
  // press inside the panel keeps the last card.
  const shownHash = target?.torrent.hash ?? null
  useLayoutEffect(() => {
    if (shownHash === null) {
      openerRef.current = null
      return
    }
    const active = document.activeElement
    const aside = asideRef.current
    if (
      active instanceof HTMLElement &&
      active !== document.body &&
      !aside?.contains(active)
    ) {
      openerRef.current = active
    }
  }, [shownHash])

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

  // Story 3.5: below a dialog and the search box in `Esc`'s order.
  useEscapeLayer(open, close, 'detail')

  if (!target) return null
  return (
    <aside
      ref={asideRef}
      aria-label="詳情"
      data-slot="board-detail"
      // Collapsed 已整理: one work column + the 14px gap + the 64px strip.
      // Expanded (5 equal columns, 4 gaps of 14px): two columns + one gap.
      // The route's wrapper is `group/board`; the board grid says
      // `data-archived`.
      className="absolute top-0 right-0 bottom-0 z-10 flex w-[calc((100%-120px)/4+78px)] max-w-full animate-panel-in flex-col overflow-hidden rounded-panel bg-surface shadow-float group-has-[[data-archived=open]]/board:w-[calc((100%-56px)/5*2+14px)]"
    >
      <DetailTop
        layout="stacked"
        target={target}
        onNavigate={setHash}
        onClose={close}
        tabs={tabs}
        arrowKeys={desktop}
      />
      {/* Story 4.1: 110px at the bottom, clear of the selection bar. */}
      <DetailPanelBody
        torrent={target.torrent}
        tabs={tabs}
        className="min-h-0 flex-1 overflow-y-auto px-[22px] pt-3 pb-page-desktop-bottom [scrollbar-width:thin]"
      />
    </aside>
  )
}
