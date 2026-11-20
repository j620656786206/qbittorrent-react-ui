import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  BAR_BOTTOM,
  BAR_GAP,
  BAR_HEIGHT,
  BAR_HIDDEN_CLASS,
  BAR_SCROLL_PADDING_END,
  BAR_SHADOW,
  PAGE_BOTTOM_DESKTOP,
  PHONE_BAR_BOTTOM,
  PHONE_BAR_HEIGHT,
  PHONE_BAR_HIDDEN_CLASS,
  PHONE_SELECTING_BOTTOM,
  TOAST_LIFT,
  TOAST_LIFT_CLASS,
} from '#/shared/ui/selection-bar-geometry'

// Multi-model review of 4.1 to 4.3: the room around the selection bar is
// checked against the bar, so a taller bar fails here instead of covering
// rows. The bar's real size is measured in e2e/selection.spec.ts.

describe('the room around the selection bar', () => {
  it('desktop: the last row, card or detail line stays above the pill and its gap', () => {
    expect(PAGE_BOTTOM_DESKTOP).toBeGreaterThanOrEqual(
      BAR_BOTTOM + BAR_HEIGHT + BAR_GAP,
    )
    expect(BAR_SCROLL_PADDING_END).toBe(BAR_BOTTOM + BAR_HEIGHT + BAR_GAP)
  })

  it('phone: the last card while selecting stays above the panel', () => {
    expect(PHONE_SELECTING_BOTTOM).toBeGreaterThanOrEqual(
      PHONE_BAR_BOTTOM + PHONE_BAR_HEIGHT,
    )
  })

  it('the CSS token page-desktop-bottom is the same room', () => {
    const css = readFileSync(
      join(import.meta.dirname, '../../styles.css'),
      'utf8',
    )
    expect(css).toContain(
      `--spacing-page-desktop-bottom: ${PAGE_BOTTOM_DESKTOP}px;`,
    )
  })

  it('the class names spell out the same numbers', () => {
    expect(BAR_HIDDEN_CLASS).toBe(
      `translate-y-[calc(100%+${BAR_BOTTOM + BAR_SHADOW}px)]`,
    )
    expect(PHONE_BAR_HIDDEN_CLASS).toBe(
      `translate-y-[calc(100%+${PHONE_BAR_BOTTOM + BAR_SHADOW}px+env(safe-area-inset-bottom))]`,
    )
    expect(TOAST_LIFT_CLASS).toBe(`lg:-translate-y-[${TOAST_LIFT}px]`)
  })
})
