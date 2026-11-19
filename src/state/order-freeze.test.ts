import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  TOUCH_SETTLE_MS,
  freezeStore,
  holdOrderForAnimation,
  holdOrderForSheet,
  isBoardFrozen,
  isOrderFrozen,
  nextBoardColumns,
  nextShownOrder,
  noteScroll,
  resetListFreeze,
  resetOrderFreeze,
  setPointerInList,
  setSelectionFreeze,
  keepWithNewOnTop,
  shownOrderReducer,
  touchFrozen,
  touchScrollEnd,
  touchScrollStart,
} from '#/state/order-freeze'

// Spec 1.8 rows F1 to F6: the one owner of the order freeze.

const frozenNow = () => isOrderFrozen(freezeStore.state)

describe('nextShownOrder', () => {
  it('F1 not frozen: the live order', () => {
    const live = ['c', 'b', 'a']
    expect(nextShownOrder(['a', 'b', 'c'], live, false)).toBe(live)
  })

  it('F2 frozen, same set reordered: the shown order, same reference', () => {
    const shown = ['a', 'b', 'c']
    expect(nextShownOrder(shown, ['c', 'a', 'b'], true)).toBe(shown)
  })

  it('F3 frozen, a shown hash left: shown minus that hash', () => {
    expect(nextShownOrder(['a', 'b', 'c'], ['c', 'a'], true)).toEqual([
      'a',
      'c',
    ])
  })

  it('F4 frozen, a new hash: held back until the unfreeze', () => {
    const shown = ['a', 'b']
    const live = ['new', 'b', 'a']
    expect(nextShownOrder(shown, live, true)).toBe(shown)
    expect(nextShownOrder(shown, live, false)).toBe(live)
  })

  it('F5 first render while frozen: the live order', () => {
    const live = ['a']
    expect(nextShownOrder(null, live, true)).toBe(live)
  })
})

describe('shownOrderReducer (the hook update)', () => {
  it('keeps positions while frozen, holds new hashes, drops gone ones, releases once', () => {
    let shown = shownOrderReducer(null, { live: ['b', 'a'], frozen: false })
    expect(shown).toEqual(['b', 'a'])
    const before = shown
    // Frozen: a value poll reorders and adds `c`; positions and set hold.
    shown = shownOrderReducer(shown, { live: ['a', 'c', 'b'], frozen: true })
    expect(shown).toBe(before)
    // Still frozen: `b` was deleted; it leaves at once, `c` still waits.
    shown = shownOrderReducer(shown, { live: ['c', 'a'], frozen: true })
    expect(shown).toEqual(['a'])
    // Unfrozen: one reorder to the live order, `c` on top.
    const live = ['c', 'a']
    shown = shownOrderReducer(shown, { live, frozen: false })
    expect(shown).toBe(live)
  })

  it('no data resets; the first data while frozen is shown as is', () => {
    expect(shownOrderReducer(['a'], { live: undefined, frozen: true })).toBe(
      null,
    )
    const live = ['x']
    expect(shownOrderReducer(null, { live, frozen: true })).toBe(live)
  })

  it('S9 a sort change applies at once even while frozen', () => {
    const live = ['c', 'b', 'a']
    expect(
      shownOrderReducer(['a', 'b', 'c'], {
        live,
        frozen: true,
        viewChanged: true,
      }),
    ).toBe(live)
  })

  it('S4 after failed keys the hold keeps the order but adds new torrents on top', () => {
    const shown = ['a', 'b', 'c']
    const input = {
      frozen: true,
      viewChanged: true,
      hold: true,
      holdAddsNew: true,
    }
    expect(shownOrderReducer(shown, { ...input, live: ['c', 'b', 'a'] })).toBe(
      shown,
    )
    expect(
      shownOrderReducer(shown, { ...input, live: ['c', 'new', 'a'] }),
    ).toEqual(['new', 'a', 'c'])
    expect(keepWithNewOnTop(null, ['x'])).toEqual(['x'])
  })

  it("S4 while the new sort's keys load, the order shown holds like a freeze", () => {
    const shown = ['a', 'b', 'c']
    expect(
      shownOrderReducer(shown, {
        live: ['c', 'new', 'b', 'a'],
        frozen: false,
        viewChanged: true,
        hold: true,
      }),
    ).toBe(shown)
    // A deleted torrent still leaves at once.
    expect(
      shownOrderReducer(shown, {
        live: ['c', 'a'],
        frozen: false,
        viewChanged: true,
        hold: true,
      }),
    ).toEqual(['a', 'c'])
  })
})

describe('a filter change (story 3.5)', () => {
  it('applies the live order at once, even while holding or frozen', () => {
    const shown = ['c', 'b']
    const live = ['a', 'c', 'b', 'd']
    expect(
      shownOrderReducer(shown, {
        live,
        frozen: true,
        hold: true,
        filterChanged: true,
      }),
    ).toBe(live)
    expect(
      shownOrderReducer(shown, {
        live,
        frozen: false,
        hold: true,
        holdAddsNew: true,
        filterChanged: true,
      }),
    ).toBe(live)
    // Without a filter change the hold keeps new matches hidden.
    expect(
      shownOrderReducer(shown, { live, frozen: false, hold: true }),
    ).toEqual(['c', 'b'])
  })
})

describe('F6 freeze reasons', () => {
  beforeEach(() => {
    // The settle check reads performance.now().
    vi.useFakeTimers({
      toFake: ['setTimeout', 'clearTimeout', 'Date', 'performance'],
    })
    resetOrderFreeze()
  })
  afterEach(() => {
    resetOrderFreeze()
    vi.useRealTimers()
  })

  it('touchFrozen: touching; 299 ms after the last scroll; not at 300 ms', () => {
    expect(TOUCH_SETTLE_MS).toBe(300)
    expect(touchFrozen({ touching: true, lastScrollAt: null, now: 0 })).toBe(
      true,
    )
    expect(
      touchFrozen({ touching: false, lastScrollAt: 1000, now: 1299 }),
    ).toBe(true)
    expect(
      touchFrozen({ touching: false, lastScrollAt: 1000, now: 1300 }),
    ).toBe(false)
    expect(touchFrozen({ touching: false, lastScrollAt: null, now: 0 })).toBe(
      false,
    )
  })

  it('mouse inside the list freezes; leaving unfreezes', () => {
    setPointerInList(true)
    expect(frozenNow()).toBe(true)
    setPointerInList(false)
    expect(frozenNow()).toBe(false)
  })

  it('a finger scrolling freezes until 300 ms after the last scroll after touchend', () => {
    touchScrollStart()
    expect(frozenNow()).toBe(true)
    vi.advanceTimersByTime(50)
    noteScroll()
    touchScrollEnd()
    // Momentum: scroll events keep coming after the finger lifted.
    vi.advanceTimersByTime(100)
    noteScroll()
    vi.advanceTimersByTime(TOUCH_SETTLE_MS - 1)
    expect(frozenNow()).toBe(true)
    vi.advanceTimersByTime(1)
    expect(frozenNow()).toBe(false)
  })

  it('a touch without scrolling ends with the finger', () => {
    touchScrollStart()
    touchScrollEnd()
    vi.advanceTimersByTime(0)
    expect(frozenNow()).toBe(false)
  })

  it('a scroll outside a touch (mouse wheel) does not freeze', () => {
    noteScroll()
    expect(frozenNow()).toBe(false)
  })

  it('a new touch during the settle time keeps it frozen', () => {
    touchScrollStart()
    noteScroll()
    touchScrollEnd()
    vi.advanceTimersByTime(200)
    touchScrollStart()
    vi.advanceTimersByTime(1000)
    expect(frozenNow()).toBe(true)
    touchScrollEnd()
    vi.advanceTimersByTime(0)
    expect(frozenNow()).toBe(false)
  })

  it('either reason keeps it frozen', () => {
    setPointerInList(true)
    touchScrollStart()
    touchScrollEnd()
    vi.advanceTimersByTime(TOUCH_SETTLE_MS)
    expect(frozenNow()).toBe(true)
    setPointerInList(false)
    expect(frozenNow()).toBe(false)
  })

  it('B9 an open sheet freezes until it is released; two sheets end with the last', () => {
    const release = holdOrderForSheet()
    expect(frozenNow()).toBe(true)
    const second = holdOrderForSheet()
    release()
    expect(frozenNow()).toBe(true)
    // A second call of the same release does not end the other sheet.
    release()
    expect(frozenNow()).toBe(true)
    second()
    expect(frozenNow()).toBe(false)
  })

  it('B9 the list unmounting keeps an open sheet as a reason', () => {
    const release = holdOrderForSheet()
    setPointerInList(true)
    resetListFreeze()
    expect(freezeStore.state).toEqual({
      pointerInList: false,
      touchScroll: false,
      sheetOpen: true,
      animation: false,
      selection: false,
    })
    release()
    expect(frozenNow()).toBe(false)
  })

  it('4.1 a selection freezes the list, not the board; the list unmounting keeps it', () => {
    setSelectionFreeze(true)
    expect(frozenNow()).toBe(true)
    expect(isBoardFrozen(freezeStore.state)).toBe(false)
    resetListFreeze()
    expect(freezeStore.state.selection).toBe(true)
    setSelectionFreeze(false)
    expect(frozenNow()).toBe(false)
  })

  it('4.1 a poll reorders under a selection: positions hold, the last clear reorders once', () => {
    let shown = shownOrderReducer(null, { live: ['a', 'b'], frozen: false })
    setSelectionFreeze(true)
    const held = shown
    shown = shownOrderReducer(shown, { live: ['b', 'a'], frozen: frozenNow() })
    shown = shownOrderReducer(shown, {
      live: ['b', 'c', 'a'],
      frozen: frozenNow(),
    })
    expect(shown).toBe(held)
    setSelectionFreeze(false)
    const live = ['b', 'c', 'a']
    shown = shownOrderReducer(shown, { live, frozen: frozenNow() })
    expect(shown).toBe(live)
  })

  it('B9 a poll reorders under an open sheet: positions hold, then one reorder', () => {
    let shown = shownOrderReducer(null, { live: ['a', 'b'], frozen: false })
    const release = holdOrderForSheet()
    const held = shown
    shown = shownOrderReducer(shown, {
      live: ['b', 'a'],
      frozen: frozenNow(),
    })
    expect(shown).toBe(held)
    release()
    const live = ['b', 'a']
    shown = shownOrderReducer(shown, { live, frozen: frozenNow() })
    expect(shown).toBe(live)
  })
})

describe('F1 the animation reason (spec 2.8)', () => {
  beforeEach(() => resetOrderFreeze())
  afterEach(() => resetOrderFreeze())

  const boardFrozen = () => isBoardFrozen(freezeStore.state)

  it('starts with the hold and ends with the last release', () => {
    expect(boardFrozen()).toBe(false)
    const release = holdOrderForAnimation()
    expect(freezeStore.state.animation).toBe(true)
    expect(boardFrozen()).toBe(true)
    expect(frozenNow()).toBe(true)
    const second = holdOrderForAnimation()
    release()
    release()
    expect(boardFrozen()).toBe(true)
    second()
    expect(boardFrozen()).toBe(false)
    expect(frozenNow()).toBe(false)
  })

  it('only the animation freezes the board; hover, touch and sheets do not', () => {
    setPointerInList(true)
    const releaseSheet = holdOrderForSheet()
    touchScrollStart()
    expect(boardFrozen()).toBe(false)
    releaseSheet()
    touchScrollEnd()
  })

  it('the list unmounting keeps a running animation', () => {
    const release = holdOrderForAnimation()
    resetListFreeze()
    expect(freezeStore.state.animation).toBe(true)
    release()
  })

  it('board order holds during the animation, then applies once', () => {
    type Columns = Record<'a' | 'b', ReadonlyArray<string>>
    const first: Columns = { a: ['1', '2'], b: ['3'] }
    let shown = nextBoardColumns<'a' | 'b'>(null, first, false)
    expect(shown).toBe(first)

    const release = holdOrderForAnimation()
    // A poll reorders column a, removes 3 and adds 4 (a new torrent).
    const polled: Columns = { a: ['2', '1', '4'], b: [] }
    const held = nextBoardColumns(shown ?? null, polled, boardFrozen())
    expect(held).toEqual({ a: ['1', '2'], b: [] })
    // The same live data again keeps the same object.
    expect(
      nextBoardColumns(held ?? null, { a: ['2', '1', '4'], b: [] }, true),
    ).toBe(held)
    shown = held

    release()
    const applied = nextBoardColumns(shown ?? null, polled, boardFrozen())
    expect(applied).toBe(polled)
  })

  it('no data: undefined', () => {
    expect(nextBoardColumns(null, undefined, true)).toBeUndefined()
  })
})
