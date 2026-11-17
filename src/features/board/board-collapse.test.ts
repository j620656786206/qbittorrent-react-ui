import { describe, expect, it } from 'vitest'
import {
  COLLAPSE_MS,
  EXPAND_MS,
  SPREAD_MS,
  anchoredScrollTop,
  cardWidth,
  cardsPerRow,
  collapseTotalMs,
  decideScroll,
  distanceToBox,
  expandTotalMs,
  groupRows,
  pickAnchor,
  rippleDelay,
  rowStarts,
  rowsBetween,
  wheelAtTop,
} from '#/features/board/board-collapse'
import type { CardBox, ScrollCheck } from '#/features/board/board-collapse'

// Spec 2.8 rows C1, C3, E1, E2, V1: the pure decisions behind the board's
// auto-collapse.

const check = (over: Partial<ScrollCheck>): ScrollCheck => ({
  focus: null,
  suppressed: null,
  column: 'seeding',
  top: 0,
  prevTop: 0,
  clientHeight: 600,
  enabled: true,
  ...over,
})

describe('timings', () => {
  it('step 1 380 ms, step 2 1300 ms, expand 0.75 x 1300 ms', () => {
    expect(COLLAPSE_MS).toBe(380)
    expect(SPREAD_MS).toBe(1300)
    expect(EXPAND_MS).toBe(975)
    expect(collapseTotalMs(false)).toBe(380 + 1300 + 300)
    expect(expandTotalMs(false)).toBe(975 + 100)
  })

  it('R1 reduced motion: no time at all', () => {
    expect(collapseTotalMs(true)).toBe(0)
    expect(expandTotalMs(true)).toBe(0)
  })
})

describe('decideScroll', () => {
  it('C1 past one column height collapses with that column', () => {
    expect(decideScroll(check({ top: 600 })).action).toBe('none')
    expect(decideScroll(check({ top: 601 })).action).toBe('collapse')
  })

  it('C2 the pref off never collapses', () => {
    expect(decideScroll(check({ top: 5000, enabled: false })).action).toBe(
      'none',
    )
  })

  it('a column without a height (not laid out) never collapses', () => {
    expect(decideScroll(check({ top: 5, clientHeight: 0 })).action).toBe('none')
  })

  it('E1 the wide column scrolled up to its top expands', () => {
    const focused = { focus: 'seeding' as const }
    expect(
      decideScroll(check({ ...focused, top: 7, prevTop: 40 })).action,
    ).toBe('expand')
    // At 8 it is not the top yet.
    expect(
      decideScroll(check({ ...focused, top: 8, prevTop: 40 })).action,
    ).toBe('none')
    // Not moving up (the code's own scroll to the top leaves prevTop 0).
    expect(decideScroll(check({ ...focused, top: 0, prevTop: 0 })).action).toBe(
      'none',
    )
    // Another column's scroll does nothing while collapsed.
    expect(
      decideScroll(check({ ...focused, column: 'done', top: 0, prevTop: 50 }))
        .action,
    ).toBe('none')
  })

  it('collapsed: scrolling the wide column further down does nothing', () => {
    expect(
      decideScroll(check({ focus: 'seeding', top: 9000, prevTop: 10 })).action,
    ).toBe('none')
  })

  it('E2 a suppressed column waits until it is back near its top', () => {
    const suppressed = 'seeding' as const
    const far = decideScroll(check({ suppressed, top: 5000 }))
    expect(far).toEqual({ action: 'none', suppressed })
    const near = decideScroll(check({ suppressed, top: 7 }))
    expect(near).toEqual({ action: 'none', suppressed: null })
    expect(decideScroll(check({ suppressed: null, top: 601 })).action).toBe(
      'collapse',
    )
  })

  it('E2 another column still collapses while one is suppressed', () => {
    expect(
      decideScroll(check({ suppressed: 'seeding', column: 'done', top: 700 })),
    ).toEqual({ action: 'collapse', suppressed: 'seeding' })
  })
})

describe('wheelAtTop', () => {
  const base = { acc: 0, focusedHere: true, atTop: true }

  it('E1 wheeling up past 60 px of deltaY at the top expands', () => {
    let step = wheelAtTop({ ...base, deltaY: -30 })
    expect(step).toEqual({ acc: -30, expand: false })
    step = wheelAtTop({ ...base, acc: step.acc, deltaY: -30 })
    expect(step).toEqual({ acc: -60, expand: false })
    step = wheelAtTop({ ...base, acc: step.acc, deltaY: -1 })
    expect(step).toEqual({ acc: 0, expand: true })
  })

  it('down, away from the top or another column resets', () => {
    expect(wheelAtTop({ ...base, acc: -50, deltaY: 10 })).toEqual({
      acc: 0,
      expand: false,
    })
    expect(
      wheelAtTop({ ...base, acc: -50, deltaY: -50, atTop: false }),
    ).toEqual({ acc: 0, expand: false })
    expect(
      wheelAtTop({ ...base, acc: -50, deltaY: -50, focusedHere: false }),
    ).toEqual({ acc: 0, expand: false })
  })
})

describe('pickAnchor', () => {
  const view = { top: 100, bottom: 500, left: 0, right: 300 }
  const card = (key: string, top: number, height = 89): CardBox => ({
    key,
    top,
    bottom: top + height,
    left: 12,
    right: 288,
  })
  // 10 px gaps: a 60..149, b 159..248, c 258..347, d 357..446, e 456..545.
  const cards = [
    card('a', 60),
    card('b', 159),
    card('c', 258),
    card('d', 357),
    card('e', 456),
  ]

  it('C3 the pointer inside a card picks that card', () => {
    expect(pickAnchor(cards, view, { x: 150, y: 300 })).toBe('c')
  })

  it('C3 the pointer in a gap picks the nearer edge', () => {
    // Gap 347..357: 349 is 2 from c, 8 from d.
    expect(pickAnchor(cards, view, { x: 150, y: 349 })).toBe('c')
    expect(pickAnchor(cards, view, { x: 150, y: 355 })).toBe('d')
  })

  it('C3 the pointer beside the cards (column padding) still picks by height', () => {
    expect(pickAnchor(cards, view, { x: 295, y: 200 })).toBe('b')
  })

  it('C3 without a pointer inside: the first fully visible card', () => {
    expect(pickAnchor(cards, view, null)).toBe('b')
    expect(pickAnchor(cards, view, { x: 900, y: 300 })).toBe('b')
  })

  it('C3 nothing fully visible: the first visible', () => {
    const tall = [card('x', 50, 600)]
    expect(pickAnchor(tall, view, null)).toBe('x')
  })

  it('C3 no visible cards: none', () => {
    expect(pickAnchor([], view, null)).toBeNull()
    expect(pickAnchor([card('z', 800)], view, null)).toBeNull()
  })

  it('a grid row: the pointer picks the card it is over', () => {
    const row = [
      { key: 'l', top: 200, bottom: 289, left: 12, right: 290 },
      { key: 'r', top: 200, bottom: 289, left: 300, right: 578 },
    ]
    const wide = { ...view, right: 600 }
    expect(pickAnchor(row, wide, { x: 400, y: 250 })).toBe('r')
  })

  it('distanceToBox: 0 inside, else the nearer edge', () => {
    const box = { top: 0, bottom: 10, left: 0, right: 10 }
    expect(distanceToBox(box, 5, 5)).toBe(0)
    expect(distanceToBox(box, 5, 13)).toBe(3)
    expect(distanceToBox(box, 13, 14)).toBe(5)
  })
})

describe('rippleDelay', () => {
  it('35 ms per card from the anchor, capped at 320 ms', () => {
    expect(rippleDelay(5, 5)).toBe(0)
    expect(rippleDelay(4, 5)).toBe(35)
    expect(rippleDelay(8, 5)).toBe(105)
    expect(rippleDelay(40, 5)).toBe(320)
  })

  it('without an anchor counts from the first card', () => {
    expect(rippleDelay(3, -1)).toBe(105)
    expect(rippleDelay(-1, 2)).toBe(0)
  })
})

describe('rows of the wide column (V1)', () => {
  it('cardsPerRow follows auto-fill minmax(270px, 1fr) with 10 px gaps', () => {
    expect(cardsPerRow(0)).toBe(1)
    expect(cardsPerRow(269)).toBe(1)
    expect(cardsPerRow(549)).toBe(1)
    expect(cardsPerRow(550)).toBe(2)
    expect(cardsPerRow(829)).toBe(2)
    expect(cardsPerRow(830)).toBe(3)
    expect(cardsPerRow(1100)).toBe(3)
    // Wide windows stay at three, with wider cards.
    expect(cardsPerRow(1600)).toBe(3)
    expect(cardsPerRow(2560)).toBe(3)
    expect(cardWidth(2560, 3)).toBeCloseTo((2560 - 20) / 3)
  })

  it('cardWidth shares the row', () => {
    expect(cardWidth(830, 3)).toBeCloseTo(270)
    expect(cardWidth(300, 1)).toBe(300)
  })

  it('groupRows: perRow cards to a row, each as tall as its tallest', () => {
    expect(groupRows([89, 101, 89, 89, 89], 3)).toEqual([
      { from: 0, to: 3, size: 101 },
      { from: 3, to: 5, size: 89 },
    ])
    expect(groupRows([89, 101], 1)).toEqual([
      { from: 0, to: 1, size: 89 },
      { from: 1, to: 2, size: 101 },
    ])
    expect(groupRows([], 3)).toEqual([])
  })

  it('rowStarts: padding, then each row and a gap', () => {
    const rows = groupRows([89, 101, 89], 1)
    expect(rowStarts(rows, 4)).toEqual([4, 103, 214])
  })

  it('anchoredScrollTop keeps a card at its offset, within the range', () => {
    const rows = groupRows(new Array<number>(30).fill(90), 3)
    const starts = rowStarts(rows, 4)
    // Card 14 is in row 4, which starts at 4 + 4 * 100 = 404.
    expect(
      anchoredScrollTop({
        rows,
        starts,
        index: 14,
        offset: 100,
        viewport: 300,
        paddingEnd: 12,
      }),
    ).toBe(304)
    // Near the top: never below 0.
    expect(
      anchoredScrollTop({
        rows,
        starts,
        index: 0,
        offset: 100,
        viewport: 300,
        paddingEnd: 12,
      }),
    ).toBe(0)
    // Near the end: never past the last row.
    expect(
      anchoredScrollTop({
        rows,
        starts,
        index: 29,
        offset: 0,
        viewport: 300,
        paddingEnd: 12,
      }),
    ).toBe(904 + 90 + 12 - 300)
  })

  it('rowsBetween: rows overlapping a window', () => {
    const rows = groupRows(new Array<number>(10).fill(90), 1)
    const starts = rowStarts(rows, 0)
    expect(rowsBetween(rows, starts, 150, 350)).toEqual([1, 2, 3])
    expect(rowsBetween(rows, starts, 5000, 6000)).toEqual([])
  })
})
