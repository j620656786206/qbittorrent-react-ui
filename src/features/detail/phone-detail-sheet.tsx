import { useCallback, useRef } from 'react'
import { detailPosition } from '#/lib/detail-position'
import { BottomSheet } from '#/shared/ui/bottom-sheet'
import { selectTorrents, useMaindata } from '#/state/maindata'
import { useSheetLayer } from '#/state/sheet-layer'
import { useShownList } from '#/state/shown-order'
import { useViewedHash } from '#/state/viewed-hash'
import { useBoardDetailTarget } from '#/features/detail/board-detail'
import {
  DetailPanelBody,
  DetailTop,
  useDetailIds,
} from '#/features/detail/detail-view'
import type { DetailTarget } from '#/features/detail/detail-view'

// Story 2.4, DESIGN bottom-sheet (mockups S05-overview-phone,
// S05-name-expanded-phone): under 1024px a tapped row or card opens the
// shared bottom sheet in `detail` mode: 70% tall, released past half its
// height it closes, otherwise it springs back; dragged up it is the whole
// screen. The detail header and tabs replace the sheet's title row (the
// handle, drag, focus trap and scroll lock stay the sheet's; the name
// names the dialog) and the overview scrolls in the sheet's content. While
// open the list behind keeps its order and `Esc` closes it (useSheetLayer).
// Closing removes `hash`; a torrent that is gone closes it (the list hook
// or useBoardDetailTarget removes `hash`).

function useListDetailTarget(): DetailTarget | null {
  const { order, viewed } = useShownList()
  const { data: torrents } = useMaindata(selectTorrents)
  if (!order || viewed === null || !torrents) return null
  if (!Object.hasOwn(torrents, viewed)) return null
  const position = detailPosition(order, viewed)
  return position ? { torrent: torrents[viewed], position } : null
}

function PhoneDetailSheet({ target }: { target: DetailTarget | null }) {
  const { setHash } = useViewedHash()
  const ids = useDetailIds()
  const open = target !== null
  // The sheet keeps its content while it slides out after closing.
  const lastRef = useRef<DetailTarget | null>(null)
  const closeRef = useRef<HTMLButtonElement>(null)
  if (target) lastRef.current = target
  const shown = target ?? lastRef.current

  const close = useCallback(() => setHash(null), [setHash])
  useSheetLayer(open, close)

  return (
    <BottomSheet
      open={open}
      onOpenChange={(next) => {
        if (!next) close()
      }}
      mode="detail"
      // Like the sort sheet: focus starts on the ✕.
      initialFocus={() => closeRef.current}
      header={(titleId) =>
        shown && (
          <DetailTop
            layout="phone"
            target={shown}
            onNavigate={setHash}
            onClose={close}
            closeRef={closeRef}
            titleId={titleId}
            ids={ids}
          />
        )
      }
    >
      {shown && (
        <DetailPanelBody
          torrent={shown.torrent}
          ids={ids}
          className="px-4 pt-3 pb-8"
        />
      )}
    </BottomSheet>
  )
}

/** Phone list mode: the row tapped, in the list's frozen order. */
export function ListDetailSheet() {
  return <PhoneDetailSheet target={useListDetailTarget()} />
}

/** Phone board: the card tapped, in its column (the current status tab). */
export function BoardDetailSheet() {
  return <PhoneDetailSheet target={useBoardDetailTarget()} />
}
