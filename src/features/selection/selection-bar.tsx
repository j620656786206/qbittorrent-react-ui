import { useEffect, useMemo, useState } from 'react'
import { selectionBarText, selectionTotal } from '#/lib/selection-total'
import { toast } from '#/lib/toast'
import { cn } from '#/shared/ui/cn'
import {
  selectStateBeforeMove,
  selectTorrents,
  useMaindata,
} from '#/state/maindata'
import { clearSelection, useSelectedHashes } from '#/state/selection'

// Story 4.1, DESIGN selection-bar (mockup S07-delete-desktop): the desktop
// selection bar, a pill floating 24px above the bottom, centred, in the
// `selection-bar` colours. Left to right: 「已選 N 個」 (700), 「共 X GB」
// (12px, 70%), 取消 (text only), 改路徑 (1px outline pill, disabled until
// Epic 5) and 刪除（含檔案） (solid `delete`, disabled until story 4.3).
// The size counts only torrents whose files exist (src/lib/selection-total.ts).
// Story 4.2 (DESIGN selection-bar, mockup S07-delete-phone): below 1024px
// the same bar is a two-row panel 16px from the sides and the bottom (plus
// the safe area), radius 22px. Row 1: 「已選 N 個」 and 「共 X GB」 on the
// left, 取消 on the right (44px); row 2: 改路徑 and 刪除（含檔案） share
// the width, 44px tall, 8px apart. The home route picks the layout
// (`desktop`); both stay mounted the same way and slide the same way.
//
// It stays mounted: with nothing selected it sits below the viewport,
// `inert` and hidden from screen readers, keeping the last numbers it
// showed, so it slides out with them. Only `transform` moves (0.3s, the
// repo's curve; at once under reduced motion). While the desktop pill
// shows, toasts sit 16px above it (`toast.setLift`; the phone's toasts are
// at the top). No keyboard shortcut clears it. The
// count and size sit in a polite `status` region, so changes are read out.

/** 52px tall: 8px padding around the 36px buttons. */
const BAR_CLASS =
  'fixed bottom-6 left-1/2 z-40 flex -translate-x-1/2 items-center gap-3.5 rounded-full bg-selection-bar py-2 pr-2 pl-[22px] text-body whitespace-nowrap text-selection-bar-foreground tabular-nums shadow-float transition-transform duration-300 ease-[cubic-bezier(0.2,0.8,0.2,1)] motion-reduce:transition-none'

/** Below the viewport: its own height, the 24px gap and the shadow. */
export const BAR_HIDDEN_CLASS = 'translate-y-[calc(100%+72px)]'

/**
 * Story 4.2: the phone panel, 16px from the sides and from the bottom plus
 * the safe area, 8/12/12/18px padding, its two rows 8px apart.
 */
const PHONE_BAR_CLASS =
  'fixed right-4 bottom-[calc(16px+env(safe-area-inset-bottom))] left-4 z-40 flex flex-col gap-2 rounded-panel bg-selection-bar pt-2 pr-3 pb-3 pl-[18px] text-body text-selection-bar-foreground tabular-nums shadow-float transition-transform duration-300 ease-[cubic-bezier(0.2,0.8,0.2,1)] motion-reduce:transition-none'

/** Below the viewport: its height, the 16px gap, the safe area and the shadow. */
export const PHONE_BAR_HIDDEN_CLASS =
  'translate-y-[calc(100%+64px+env(safe-area-inset-bottom))]'

const FOCUS_CLASS = 'focus-visible:outline-selection-bar-foreground'

const DISABLED_CLASS = 'disabled:cursor-not-allowed disabled:opacity-50'

export function SelectionBar({ desktop }: { desktop: boolean }) {
  const hashes = useSelectedHashes()
  const { data: torrents } = useMaindata(selectTorrents)
  const { data: stateBeforeMove } = useMaindata(selectStateBeforeMove)
  const total = useMemo(
    () => selectionTotal(torrents ?? {}, hashes, stateBeforeMove ?? {}),
    [torrents, hashes, stateBeforeMove],
  )
  // The same test as the list's freeze and `data-selecting`.
  const visible = hashes.length > 0
  // The numbers last shown, kept while the bar slides out.
  const [kept, setKept] = useState(total)
  if (visible && kept !== total) setKept(total)
  const text = selectionBarText(visible ? total : kept)

  // Only the desktop toasts sit at the bottom, where the bar is.
  const lift = visible && desktop
  useEffect(() => {
    if (!lift) return
    toast.setLift(true)
    return () => toast.setLift(false)
  }, [lift])

  // Each layout is its own element (`key`): crossing 1024px swaps them
  // in place, with no slide between the two.
  if (!desktop) {
    return (
      <div
        key="phone"
        role="region"
        aria-label="選取的種子"
        aria-hidden={visible ? undefined : true}
        inert={!visible}
        data-selection-bar=""
        className={cn(PHONE_BAR_CLASS, !visible && PHONE_BAR_HIDDEN_CLASS)}
      >
        <div className="flex items-center gap-3">
          <span
            role="status"
            className="min-w-0 flex-1 overflow-hidden whitespace-nowrap"
          >
            <b className="font-bold">{text.count}</b>
            <span className="sr-only">，</span>
            <span className="ml-3 text-[12px] opacity-70">{text.size}</span>
          </span>
          <button
            type="button"
            onClick={clearSelection}
            className={cn(
              'h-11 min-w-11 flex-none px-2 font-semibold',
              FOCUS_CLASS,
            )}
          >
            取消
          </button>
        </div>
        {/* 6px back left, so both buttons sit 12px from the sides (S07). */}
        <div className="-ml-1.5 grid grid-cols-2 gap-2">
          <button
            type="button"
            disabled
            className={cn(
              'h-11 rounded-full border border-selection-bar-foreground font-semibold',
              FOCUS_CLASS,
              DISABLED_CLASS,
            )}
          >
            改路徑
          </button>
          <button
            type="button"
            disabled
            className={cn(
              'h-11 rounded-full bg-delete font-bold text-delete-foreground',
              FOCUS_CLASS,
              DISABLED_CLASS,
            )}
          >
            刪除（含檔案）
          </button>
        </div>
      </div>
    )
  }

  return (
    <div
      key="desktop"
      role="region"
      aria-label="選取的種子"
      aria-hidden={visible ? undefined : true}
      inert={!visible}
      data-selection-bar=""
      className={cn(BAR_CLASS, !visible && BAR_HIDDEN_CLASS)}
    >
      {/* Announced when the count or size changes. */}
      <span role="status" className="contents">
        <b className="font-bold">{text.count}</b>
        <span className="sr-only">，</span>
        <span className="text-[12px] opacity-70">{text.size}</span>
      </span>
      <button
        type="button"
        onClick={clearSelection}
        className={cn('h-9 px-2 font-semibold', FOCUS_CLASS)}
      >
        取消
      </button>
      <button
        type="button"
        disabled
        className={cn(
          'h-9 rounded-full border border-selection-bar-foreground px-4 font-semibold',
          FOCUS_CLASS,
          DISABLED_CLASS,
        )}
      >
        改路徑
      </button>
      <button
        type="button"
        disabled
        className={cn(
          'h-9 rounded-full bg-delete px-[18px] font-bold text-delete-foreground',
          FOCUS_CLASS,
          DISABLED_CLASS,
        )}
      >
        刪除（含檔案）
      </button>
    </div>
  )
}
