// Stories 4.1 and 4.2 (DESIGN selection-bar): where the selection bar
// sits, and the room the rest of the screen keeps so the bar never covers
// it. Every number about the bar lives here; the list, the board, the
// detail panels, the toasts and the bar itself read it.
// selection-bar-geometry.test.ts checks the relations (the room is at
// least the bar), not the values, so changing the bar means changing this
// file only.

/** The desktop pill sits 24px above the bottom (`bottom-6`). */
export const BAR_BOTTOM = 24
/** The desktop pill: 8px padding around the 36px buttons. */
export const BAR_HEIGHT = 52
/** The gap kept above the pill (a toast, a row scrolled into view). */
export const BAR_GAP = 16
/** How far the bars' shadow (`shadow-float`, 0 12px 32px) reaches. */
export const BAR_SHADOW = 48

/** The phone panel sits 16px above the bottom, plus the safe area. */
export const PHONE_BAR_BOTTOM = 16
/** The phone panel: 8px top, two 44px rows 8px apart, 12px bottom. */
export const PHONE_BAR_HEIGHT = 8 + 44 + 8 + 44 + 12

/** Desktop toasts move up by the pill and the gap. */
export const TOAST_LIFT = BAR_HEIGHT + BAR_GAP

/** A row or card scrolled into view stops the gap above the pill. */
export const BAR_SCROLL_PADDING_END = BAR_BOTTOM + BAR_HEIGHT + BAR_GAP

/**
 * Room under the last row, card or detail line on desktop (DESIGN
 * `page-desktop-bottom`, also the CSS token of that name).
 */
export const PAGE_BOTTOM_DESKTOP = 110

/** Room under the phone board panel's last card while selecting (S07). */
export const PHONE_SELECTING_BOTTOM = 140

// Tailwind finds class names only as literal text, so these spell the
// numbers out; the test checks they match the ones above.

/** The pill hidden below the viewport: its height, its gap, the shadow. */
export const BAR_HIDDEN_CLASS = 'translate-y-[calc(100%+72px)]'

/** The phone panel hidden: its height, its gap, the safe area, the shadow. */
export const PHONE_BAR_HIDDEN_CLASS =
  'translate-y-[calc(100%+64px+env(safe-area-inset-bottom))]'

/** Desktop toasts while the pill shows. */
export const TOAST_LIFT_CLASS = 'lg:-translate-y-[68px]'
