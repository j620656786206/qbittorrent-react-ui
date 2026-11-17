import { createFileRoute } from '@tanstack/react-router'
import type { MouseEvent } from 'react'
import { useIsDesktop } from '#/shared/ui/breakpoint'
import { useListView } from '#/state/list-view'
import { useViewedHash } from '#/state/viewed-hash'
import { TorrentBoard } from '#/features/board/torrent-board'
import { BoardDetailPanel } from '#/features/detail/board-detail-panel'
import { ListDetailPanel } from '#/features/detail/list-detail-panel'
import {
  BoardDetailSheet,
  ListDetailSheet,
} from '#/features/detail/phone-detail-sheet'
import { TorrentList } from '#/features/list/torrent-list'

export const Route = createFileRoute('/_authed/')({ component: Home })

// The title and header are in the app shell; the page fills its `main`.
// EXPERIENCE 「排序決定長相」 (story 2.3): 「狀態」 is the board, every other
// sort the list. Story 2.4 composes the detail here (features never import
// each other): desktop list mode puts the permanent panel right of the
// rows, desktop board mode floats the panel over the 完成 and 已整理 columns
// (a click on empty board space closes it), the phone opens the bottom
// sheet over either. The trees keep their shape across the 1024px line, so
// crossing it does not remount the list or the board.
function Home() {
  const { view } = useListView()
  const desktop = useIsDesktop()
  if (view.sort === 'state') return <BoardHome desktop={desktop} />
  return (
    <>
      <TorrentList panel={desktop ? <ListDetailPanel /> : undefined} />
      {!desktop && <ListDetailSheet />}
    </>
  )
}

/** A click that lands on no control and not in the panel. */
function isEmptySpace(target: EventTarget): boolean {
  return (
    target instanceof Element &&
    target.closest('button, a, input, select, textarea, aside') === null
  )
}

function BoardHome({ desktop }: { desktop: boolean }) {
  const { hash, setHash } = useViewedHash()
  const onClick = (event: MouseEvent<HTMLDivElement>) => {
    if (hash !== null && isEmptySpace(event.target)) setHash(null)
  }
  return (
    // The board's own keyboard and buttons stay; the wrapper only catches
    // clicks that fell through to empty space.
    <div
      className="group/board relative h-full min-h-0"
      onClick={desktop ? onClick : undefined}
    >
      <TorrentBoard />
      {desktop ? <BoardDetailPanel /> : <BoardDetailSheet />}
    </div>
  )
}
