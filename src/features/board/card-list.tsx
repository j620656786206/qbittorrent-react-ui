import { useCallback, useMemo, useRef } from 'react'
import type { HTMLAttributes, Ref } from 'react'
import { useVirtualizer } from '@tanstack/react-virtual'
import type { SlimTorrent } from '#/shared/maindata'
import { cn } from '#/shared/ui/cn'
import { useViewedHash } from '#/state/viewed-hash'
import { BoardCard } from '#/features/board/board-card'
import { CARD_GAP, cardHeightOf } from '#/features/board/board-model'

// AR-7, NFR-1: one column's cards, virtualized with the column's own body
// as the scroll element (each column scrolls itself; `main` does not). Card
// heights are fixed per kind (board-model.ts), so `estimateSize` is exact
// and nothing is measured. Cards are keyed by hash. The body is rendered
// here, next to `useVirtualizer`, so the scroll element exists when the
// virtualizer first reads it. Docs: TanStack Virtual `Virtualizer` options
// (https://tanstack.com/virtual/latest/docs/api/virtualizer).

/** Cards drawn beyond the visible ones, above and below. */
const OVERSCAN = 4

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
}: CardListProps) {
  // Story 2.4: a card opens its torrent in the detail.
  const { setHash } = useViewedHash()
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
  const estimateSize = useCallback((index: number) => heights[index], [heights])
  // A new `getItemKey` makes the virtualizer recompute every position: it
  // changes with the heights (the column's hashes or the data changed).
  const getItemKey = useCallback(
    (index: number) => hashes[index],
    // `heights` on purpose: a height change must recompute the positions.
    [hashes, heights],
  )
  const virtualizer = useVirtualizer({
    count: hashes.length,
    getScrollElement: () => scrollRef.current,
    estimateSize,
    getItemKey,
    overscan: OVERSCAN,
    gap: CARD_GAP,
    paddingStart,
    paddingEnd,
    // React 19 warns about flushSync inside lifecycle methods.
    useFlushSync: false,
  })

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
          role="list"
          aria-label={label}
          className="relative w-full"
          style={{ height: virtualizer.getTotalSize() }}
        >
          {virtualizer.getVirtualItems().map((item) => {
            const hash = hashes[item.index]
            const torrent = torrents[hash] as SlimTorrent | undefined
            return (
              <div
                key={item.key}
                role="listitem"
                aria-setsize={hashes.length}
                aria-posinset={item.index + 1}
                className="absolute top-0 left-0 w-full"
                style={{
                  height: item.size,
                  transform: `translateY(${item.start}px)`,
                }}
              >
                {torrent && (
                  <BoardCard
                    torrent={torrent}
                    stateBeforeMove={
                      Object.hasOwn(stateBeforeMove, hash)
                        ? stateBeforeMove[hash]
                        : undefined
                    }
                    today={today}
                    onOpen={setHash}
                  />
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
