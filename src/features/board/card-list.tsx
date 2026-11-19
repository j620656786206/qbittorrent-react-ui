import { useCallback, useLayoutEffect, useMemo, useRef, useState } from 'react'
import type { CSSProperties, HTMLAttributes, ReactElement, Ref } from 'react'
import { defaultRangeExtractor, useVirtualizer } from '@tanstack/react-virtual'
import type { Range } from '@tanstack/react-virtual'
import { reasonOf } from '#/lib/error-reason'
import type { SlimTorrent } from '#/shared/maindata'
import { Checkbox } from '#/shared/ui/checkbox'
import { cn } from '#/shared/ui/cn'
import { useEntrance } from '#/state/entrance'
import { useErrorReasons } from '#/state/error-reasons'
import { toggleSelected, useSelectedHashes } from '#/state/selection'
import { useViewedHash } from '#/state/viewed-hash'
import { BoardCard } from '#/features/board/board-card'
import {
  anchoredScrollTop,
  cardWidth,
  cardsPerRow,
  groupRows,
  rowStarts,
  rowsBetween,
} from '#/features/board/board-collapse'
import {
  CARD_GAP,
  CARD_HEIGHT,
  cardHeightOf,
} from '#/features/board/board-model'

// AR-7, NFR-1: one column's cards, virtualized with the column's own body
// as the scroll element (each column scrolls itself; `main` does not). Card
// heights are fixed per kind (board-model.ts), so `estimateSize` is exact
// and nothing is measured. Cards are keyed by hash. The body is rendered
// here, next to `useVirtualizer`, so the scroll element exists when the
// virtualizer first reads it. Docs: TanStack Virtual `Virtualizer` options
// (https://tanstack.com/virtual/latest/docs/api/virtualizer).
//
// Story 2.8: the virtualizer counts rows, not cards. A row holds one card,
// except in the wide column of a collapsed board (`layout: grid`), where it
// holds as many as `repeat(auto-fill, minmax(270px, 1fr))` fits the list's
// width (recomputed on resize) and is as tall as its tallest card. TanStack
// `lanes` places each item in the shortest lane (masonry), so rows are
// grouped here instead. Every card is a direct child of the list, keyed by
// hash, so a layout change moves the same element (the board's FLIP reads
// `data-hash`). A `pin` scrolls the list so that one card keeps its offset
// from the top (demo `keepAnchor`), or to the top, and draws exactly the
// rows around that position in the same commit, so the cards the FLIP
// measures exist before any scroll event reaches the virtualizer.
// `rangeExtractor` and `defaultRangeExtractor` as in the installed
// @tanstack/virtual-core 3.19.11 (what @tanstack/react-virtual 3.14.26
// depends on): https://unpkg.com/@tanstack/virtual-core@3.19.11/src/index.ts
// (`Range`, `defaultRangeExtractor`, `getVirtualIndexes`).
//
// Story 4.1: a `selectable` list (the desktop columns, the expanded 已整理
// one too) puts the selection checkbox in each card's wrapper
// (`group/item`), before the card's button, 6px outside its top-left
// corner on a `surface` ring. It shows while the wrapper is hovered or
// holds focus, and on every card once anything is selected
// (`data-selecting` on the list). Clicking it only toggles the selection.
// The column gives `paddingStart` room for it above the first card.
//
// Story 4.2: a `phone` list (the phone board's panels) is selectable its
// own way. No hover: the checkbox shows on every card while anything is
// selected, and not at all otherwise. A long press on a card (armed while
// nothing is selected) ticks it and starts selection mode; while
// selecting, a tap toggles the card instead of opening the sheet. Phone
// cards keep the system callout and text selection away from a long press.

/**
 * Story 4.1: 6px out of the card's top-left corner, its own `surface`
 * backing (a 2px ring) over the card and the column; hidden until hovered,
 * focused or anything is selected; taps pass through while hidden.
 */
export const CARD_CHECKBOX_CLASS =
  'pointer-events-none absolute -top-1.5 -left-1.5 z-[1] bg-surface opacity-0 ring-2 ring-surface group-focus-within/item:pointer-events-auto group-focus-within/item:opacity-100 group-hover/item:pointer-events-auto group-hover/item:opacity-100 group-data-[selecting]/list:pointer-events-auto group-data-[selecting]/list:opacity-100'

/**
 * Story 4.1: while anything is selected, a card scrolled to stops 92px
 * above the column's bottom, above the floating selection bar.
 */
const SELECTION_SCROLL_PADDING_END = 92

/** Story 4.2: the phone checkbox, the same corner, shown while selecting. */
export const PHONE_CARD_CHECKBOX_CLASS =
  'absolute -top-1.5 -left-1.5 z-[1] bg-surface ring-2 ring-surface'

/** Cards drawn beyond the visible ones, above and below. */
const OVERSCAN = 4
/** The pinned window's margin, about `OVERSCAN` cards. */
const PIN_MARGIN_PX = OVERSCAN * (CARD_HEIGHT + CARD_GAP)

/** How the column lays out its cards (story 2.8). */
export type CardLayout =
  | { kind: 'single' }
  /** One per row at this width (step 1: the column is wide already). */
  | { kind: 'fixed'; width: number }
  /** As many per row as fit (step 2 and after). */
  | { kind: 'grid' }

/**
 * Story 2.8: keep card `hash` at `offset` px below the top of the scroll
 * box, or with `hash: null` scroll to the top. A new object applies again.
 */
export interface CardPin {
  hash: string | null
  offset: number
}

const SINGLE: CardLayout = { kind: 'single' }

function sameNumbers(
  a: ReadonlyArray<number>,
  b: ReadonlyArray<number>,
): boolean {
  return a.length === b.length && a.every((value, index) => value === b[index])
}

export interface CardListProps {
  /** The column's hashes in order. */
  hashes: ReadonlyArray<string>
  torrents: Readonly<Record<string, SlimTorrent>>
  stateBeforeMove: Readonly<Record<string, string>>
  /** `useDayClock().today`. */
  today: number
  /** Shown when `hashes` is empty: 「沒有」, 「都沒問題」. */
  empty: string
  /** The list's accessible name: 「下載中」. */
  label: string
  /** Space above the first and below the last card, px. */
  paddingStart: number
  paddingEnd: number
  /** The scroll body's own classes and attributes (tabpanel on the phone). */
  className?: string
  bodyProps?: HTMLAttributes<HTMLDivElement> & { inert?: boolean }
  bodyRef?: Ref<HTMLDivElement>
  /** Story 2.8: one card per row (default) or the wide column's grid. */
  layout?: CardLayout
  /** Story 2.8: the card (or the top) to keep in place. */
  pin?: CardPin | null
  /** Story 2.8: the anchor card with the accent frame. */
  hereHash?: string | null
  /** How long the frame shows, ms (its fade is part of it). */
  hereMs?: number
  /** Story 4.1: desktop cards get the selection checkbox. */
  selectable?: boolean
  /** Story 4.2: the phone's way of selecting (long press, tap toggles). */
  phone?: boolean
}

export function CardList({
  hashes,
  torrents,
  stateBeforeMove,
  today,
  empty,
  label,
  paddingStart,
  paddingEnd,
  className,
  bodyProps,
  bodyRef,
  layout = SINGLE,
  pin = null,
  hereHash = null,
  hereMs = 0,
  selectable = false,
  phone = false,
}: CardListProps) {
  // Story 2.4: a card opens its torrent in the detail.
  const { setHash } = useViewedHash()
  // Story 2.10: polled only while maindata has an errored torrent; every
  // column observes the same `['error-reasons']` query.
  const errorReasons = useErrorReasons()
  const selectedHashes = useSelectedHashes()
  const selected = useMemo(() => new Set(selectedHashes), [selectedHashes])
  const selecting = selected.size > 0
  const phoneSelecting = selectable && phone && selecting
  const scrollRef = useRef<HTMLDivElement | null>(null)
  const setRefs = useCallback(
    (element: HTMLDivElement | null) => {
      scrollRef.current = element
      if (typeof bodyRef === 'function') bodyRef(element)
      else if (bodyRef) bodyRef.current = element
    },
    [bodyRef],
  )
  // Heights follow the data: a torrent that turns from stalled to error
  // loses its bar without leaving the column. Every poll brings a new
  // `torrents`, so the previous array is kept while each height is equal:
  // only a real change re-measures.
  const heightsRef = useRef<ReadonlyArray<number>>([])
  const heights = useMemo(() => {
    const next = hashes.map((hash) =>
      cardHeightOf(torrents[hash], stateBeforeMove),
    )
    const previous = heightsRef.current
    if (sameNumbers(previous, next)) return previous
    heightsRef.current = next
    return next
  }, [hashes, torrents, stateBeforeMove])

  // The list's inner width, for the grid: read in a layout effect when the
  // layout changes (before paint) and again on resize.
  const listRef = useRef<HTMLDivElement | null>(null)
  const [listWidth, setListWidth] = useState(0)
  const hasCards = hashes.length > 0
  useLayoutEffect(() => {
    const list = listRef.current
    if (!list) return
    setListWidth(list.clientWidth)
    if (typeof ResizeObserver !== 'function') return
    const observer = new ResizeObserver(() => setListWidth(list.clientWidth))
    observer.observe(list)
    return () => observer.disconnect()
  }, [hasCards, layout])

  const perRow = layout.kind === 'grid' ? cardsPerRow(listWidth) : 1
  const width =
    layout.kind === 'grid'
      ? cardWidth(listWidth, perRow)
      : layout.kind === 'fixed'
        ? layout.width
        : null
  const rows = useMemo(() => groupRows(heights, perRow), [heights, perRow])
  const starts = useMemo(
    () => rowStarts(rows, paddingStart),
    [rows, paddingStart],
  )

  const estimateSize = useCallback((index: number) => rows[index].size, [rows])
  // A new `getItemKey` makes the virtualizer recompute every position: it
  // changes with the rows (the column's hashes, a height or the per-row
  // count changed). One card per row keeps the hash as the key.
  const getItemKey = useCallback(
    (index: number) => {
      const first = hashes[rows[index].from]
      return perRow === 1 ? first : `${perRow}:${first}`
    },
    [hashes, rows, perRow],
  )

  /** Where `pin` puts the scroll box, or `null` (no pin, unknown card). */
  const pinTarget = useCallback((): number | null => {
    if (pin === null) return null
    if (pin.hash === null) return 0
    const index = hashes.indexOf(pin.hash)
    if (index < 0) return null
    return anchoredScrollTop({
      rows,
      starts,
      index,
      offset: pin.offset,
      viewport: scrollRef.current?.clientHeight ?? 0,
      paddingEnd,
    })
  }, [pin, hashes, rows, starts, paddingEnd])

  const rangeExtractor = useCallback(
    (range: Range) => {
      const target = pinTarget()
      if (target === null) return defaultRangeExtractor(range)
      const viewport = scrollRef.current?.clientHeight ?? 0
      const pinned = rowsBetween(
        rows,
        starts,
        target - PIN_MARGIN_PX,
        target + viewport + PIN_MARGIN_PX,
      )
      return pinned.length > 0 ? pinned : defaultRangeExtractor(range)
    },
    [pinTarget, rows, starts],
  )

  const virtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => scrollRef.current,
    estimateSize,
    getItemKey,
    rangeExtractor,
    overscan: OVERSCAN,
    gap: CARD_GAP,
    paddingStart,
    paddingEnd,
    scrollPaddingEnd:
      selectable && !phone && selecting ? SELECTION_SCROLL_PADDING_END : 0,
    // React 19 warns about flushSync inside lifecycle methods.
    useFlushSync: false,
  })
  // Story 2.9: the cards in view rise (the inner card button, never the
  // wrapper the virtualizer and the FLIP move) and their rings and bars
  // grow, once the body is measured (`scrollRect`:
  // https://unpkg.com/@tanstack/virtual-core@3.19.11/src/index.ts). Each
  // column staggers from its own top; the phone's off-screen panels show
  // nothing, so they animate nothing.
  useEntrance(scrollRef, { ready: virtualizer.scrollRect !== null })

  // The pin's scroll, in a layout effect: before paint and before the
  // board's own layout effect measures where the cards went. Applied again
  // when the rows change under the same pin (the grid's width arriving).
  useLayoutEffect(() => {
    const scroller = scrollRef.current
    const target = pinTarget()
    if (!scroller || target === null) return
    if (Math.abs(scroller.scrollTop - target) >= 1) scroller.scrollTop = target
  }, [pinTarget])

  const hereStyle = useMemo(
    () => ({ '--here-ms': `${hereMs}ms` }) as CSSProperties,
    [hereMs],
  )

  return (
    <div
      ref={setRefs}
      {...bodyProps}
      className={cn(
        'min-h-0 overflow-y-auto [scrollbar-width:thin]',
        className,
      )}
    >
      {hashes.length === 0 ? (
        <p
          style={{ marginTop: paddingStart }}
          className="m-0 py-5 text-center text-body text-text-muted"
        >
          {empty}
        </p>
      ) : (
        <div
          ref={listRef}
          role="list"
          aria-label={label}
          data-card-list=""
          data-selecting={selecting ? '' : undefined}
          className="group/list relative w-full"
          style={{ height: virtualizer.getTotalSize() }}
        >
          {virtualizer.getVirtualItems().flatMap((item) => {
            const row = rows[item.index] as (typeof rows)[number] | undefined
            if (!row) return []
            const cards: Array<ReactElement> = []
            for (let index = row.from; index < row.to; index += 1) {
              const hash = hashes[index]
              const torrent = torrents[hash] as SlimTorrent | undefined
              const x =
                width === null ? 0 : (index - row.from) * (width + CARD_GAP)
              const here = hash === hereHash
              const isSelected = selected.has(hash)
              cards.push(
                <div
                  key={hash}
                  role="listitem"
                  aria-setsize={hashes.length}
                  aria-posinset={index + 1}
                  data-hash={hash}
                  data-index={index}
                  className={cn(
                    'group/item absolute top-0 left-0',
                    width === null && 'w-full',
                    phone && 'select-none [-webkit-touch-callout:none]',
                    here && 'anchor-frame',
                  )}
                  style={{
                    ...(here ? hereStyle : null),
                    height: heights[index],
                    width: width ?? undefined,
                    transform:
                      x === 0
                        ? `translateY(${item.start}px)`
                        : `translate(${x}px, ${item.start}px)`,
                  }}
                >
                  {torrent && phoneSelecting && (
                    <Checkbox
                      checked={isSelected}
                      onCheckedChange={() => toggleSelected(hash)}
                      aria-label={`選取 ${torrent.name}`}
                      className={PHONE_CARD_CHECKBOX_CLASS}
                    />
                  )}
                  {torrent && selectable && !phone && (
                    <Checkbox
                      checked={isSelected}
                      onCheckedChange={() => toggleSelected(hash)}
                      aria-label={`選取 ${torrent.name}`}
                      className={CARD_CHECKBOX_CLASS}
                    />
                  )}
                  {torrent && (
                    <BoardCard
                      torrent={torrent}
                      stateBeforeMove={
                        Object.hasOwn(stateBeforeMove, hash)
                          ? stateBeforeMove[hash]
                          : undefined
                      }
                      today={today}
                      errorReason={reasonOf(errorReasons, hash)}
                      selected={isSelected}
                      onOpen={phoneSelecting ? toggleSelected : setHash}
                      longPress={selectable && phone && !selecting}
                      onLongPress={toggleSelected}
                    />
                  )}
                </div>,
              )
            }
            return cards
          })}
        </div>
      )}
    </div>
  )
}
