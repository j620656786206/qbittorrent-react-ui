import { describe, expect, it } from 'vitest'
import {
  FLICK_VELOCITY,
  releaseVelocity,
  settleSheet,
  sheetRestHeight,
} from '#/lib/sheet-snap'
import type { SheetMode, SheetRelease } from '#/shared/sheet'

// Spec 2.2 rows B6 to B8: where a released drag ends, per mode.

const VH = 1000

function release(
  mode: SheetMode,
  overrides: Partial<SheetRelease> = {},
): SheetRelease {
  const contentHeight = 400
  return {
    mode,
    expanded: false,
    restHeight: sheetRestHeight(mode, contentHeight, VH),
    viewportHeight: VH,
    distance: 0,
    velocity: 0,
    ...overrides,
  }
}

describe('sheetRestHeight', () => {
  it('fit: the content, at most 90%', () => {
    expect(sheetRestHeight('fit', 400, VH)).toBe(400)
    expect(sheetRestHeight('fit', 2000, VH)).toBe(900)
  })

  it('fixed90 90%, detail 70%, full the screen', () => {
    expect(sheetRestHeight('fixed90', 100, VH)).toBe(900)
    expect(sheetRestHeight('detail', 100, VH)).toBe(700)
    expect(sheetRestHeight('full', 100, VH)).toBe(VH)
  })
})

describe('B6 fit', () => {
  // Rest 400: closes below 300 (a quarter down), full past 100 up.
  it('a tap or a small drag springs back', () => {
    expect(settleSheet(release('fit'))).toBe('rest')
    expect(settleSheet(release('fit', { distance: 100 }))).toBe('rest')
    expect(settleSheet(release('fit', { distance: -100 }))).toBe('rest')
  })

  it('down past a quarter closes', () => {
    expect(settleSheet(release('fit', { distance: 101 }))).toBe('close')
  })

  it('a downward flick closes even after a short drag', () => {
    expect(settleSheet(release('fit', { distance: 10, velocity: 0.51 }))).toBe(
      'close',
    )
    expect(
      settleSheet(release('fit', { distance: 10, velocity: FLICK_VELOCITY })),
    ).toBe('rest')
  })

  it('up past a quarter or an upward flick goes full screen', () => {
    expect(settleSheet(release('fit', { distance: -101 }))).toBe('full')
    expect(settleSheet(release('fit', { distance: -5, velocity: -0.51 }))).toBe(
      'full',
    )
  })

  it('a 90% sheet reaches full screen past a quarter of the room above', () => {
    const tall = release('fit', { restHeight: 900 })
    expect(settleSheet({ ...tall, distance: -25 })).toBe('rest')
    expect(settleSheet({ ...tall, distance: -26 })).toBe('full')
  })

  it('from full screen: small drags stay, a quarter goes back, far closes', () => {
    const full = release('fit', { expanded: true })
    expect(settleSheet({ ...full, distance: 200 })).toBe('full')
    expect(settleSheet({ ...full, distance: 251 })).toBe('rest')
    expect(settleSheet({ ...full, distance: 20, velocity: 0.6 })).toBe('rest')
    expect(settleSheet({ ...full, distance: -20, velocity: -0.6 })).toBe('full')
    // Below the rest height's close line (300 visible).
    expect(settleSheet({ ...full, distance: 701 })).toBe('close')
    expect(settleSheet({ ...full, distance: 699 })).toBe('rest')
  })
})

describe('B7 detail', () => {
  // Rest 700: half is 350.
  it('released at 49% of its height down springs back, at 51% closes', () => {
    expect(settleSheet(release('detail', { distance: 343 }))).toBe('rest')
    expect(settleSheet(release('detail', { distance: 357 }))).toBe('close')
  })

  it('a downward flick alone does not close it', () => {
    expect(settleSheet(release('detail', { distance: 100, velocity: 2 }))).toBe(
      'rest',
    )
  })

  it('up past a quarter of the room above goes full screen', () => {
    // Room above 300, a quarter 75.
    expect(settleSheet(release('detail', { distance: -74 }))).toBe('rest')
    expect(settleSheet(release('detail', { distance: -76 }))).toBe('full')
  })

  it('from full screen it goes back to 70% or closes below half', () => {
    const full = release('detail', { expanded: true })
    expect(settleSheet({ ...full, distance: 300 })).toBe('rest')
    expect(settleSheet({ ...full, distance: 649 })).toBe('rest')
    expect(settleSheet({ ...full, distance: 651 })).toBe('close')
  })
})

describe('B8 fixed90 and full', () => {
  it('fixed90: rest 900, closes past 225 down or on a flick, full past 25 up', () => {
    expect(settleSheet(release('fixed90', { distance: 224 }))).toBe('rest')
    expect(settleSheet(release('fixed90', { distance: 226 }))).toBe('close')
    expect(settleSheet(release('fixed90', { distance: 5, velocity: 1 }))).toBe(
      'close',
    )
    expect(settleSheet(release('fixed90', { distance: -26 }))).toBe('full')
  })

  it('full: stays unless dragged a quarter down or flicked down', () => {
    expect(settleSheet(release('full', { distance: -100 }))).toBe('rest')
    expect(settleSheet(release('full', { distance: 250 }))).toBe('rest')
    expect(settleSheet(release('full', { distance: 251 }))).toBe('close')
    expect(settleSheet(release('full', { distance: 5, velocity: 0.6 }))).toBe(
      'close',
    )
    expect(
      settleSheet(release('full', { expanded: true, distance: 100 })),
    ).toBe('rest')
  })

  it('a fit sheet whose content fills the screen behaves like full', () => {
    expect(
      settleSheet(release('fit', { restHeight: VH, distance: -100 })),
    ).toBe('rest')
    expect(settleSheet(release('fit', { restHeight: VH, distance: 300 }))).toBe(
      'close',
    )
  })
})

describe('a flick against the drag', () => {
  it('dragged nearly closed, flicked up: back to rest, not full screen', () => {
    expect(settleSheet(release('fit', { distance: 350, velocity: -0.8 }))).toBe(
      'rest',
    )
    expect(
      settleSheet(release('detail', { distance: 600, velocity: -1 })),
    ).toBe('rest')
    expect(
      settleSheet(release('fixed90', { distance: 800, velocity: -0.6 })),
    ).toBe('rest')
  })

  it('dragged up past the threshold, flicked down: back to rest, not closed', () => {
    expect(settleSheet(release('fit', { distance: -200, velocity: 0.8 }))).toBe(
      'rest',
    )
  })

  it('from full screen: back to full screen; in full mode: stays', () => {
    const full = release('fit', { expanded: true })
    expect(settleSheet({ ...full, distance: 650, velocity: -0.9 })).toBe('full')
    expect(settleSheet(release('full', { distance: 600, velocity: -2 }))).toBe(
      'rest',
    )
  })

  it('a slow drift against the drag does not count', () => {
    expect(settleSheet(release('fit', { distance: 150, velocity: -0.2 }))).toBe(
      'close',
    )
  })
})

describe('releaseVelocity', () => {
  it('px/ms over the last 100 ms', () => {
    expect(
      releaseVelocity([
        { time: 0, y: 0 },
        { time: 300, y: 10 },
        { time: 350, y: 30 },
        { time: 400, y: 60 },
      ]),
    ).toBeCloseTo(50 / 100)
  })

  it('0 with one sample or no time between', () => {
    expect(releaseVelocity([])).toBe(0)
    expect(releaseVelocity([{ time: 5, y: 5 }])).toBe(0)
    expect(
      releaseVelocity([
        { time: 5, y: 5 },
        { time: 5, y: 9 },
      ]),
    ).toBe(0)
  })

  it('negative when moving up', () => {
    expect(
      releaseVelocity([
        { time: 0, y: 100 },
        { time: 50, y: 50 },
      ]),
    ).toBe(-1)
  })
})
