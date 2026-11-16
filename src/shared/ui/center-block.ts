// The centered block on the surface (mockups S01-no-result-desktop,
// S02-no-result-phone): one line of text and one outline button. The list's
// empty and load-error states and the not-found page share it; each adds
// its own placement classes.

/** Fills its slot and centers its content on the surface. */
export const CENTER_BLOCK_CLASS =
  'flex h-full flex-col items-center justify-center gap-3.5 rounded-panel bg-surface p-6 text-center'

export const CENTER_BLOCK_TEXT_CLASS = 'm-0 text-[15px] leading-[1.2] font-bold'

/** The outline capsule button; on a `Link` add `inline-flex items-center`. */
export const CENTER_BLOCK_BUTTON_CLASS =
  'h-11 flex-none rounded-full border bg-surface px-[18px] font-semibold text-text hover-outline lg:h-9'
