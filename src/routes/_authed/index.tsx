import { createFileRoute } from '@tanstack/react-router'
import { useRef } from 'react'
import type { MouseEvent, PointerEvent } from 'react'
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
// sheet over either. The list keeps its tree across the 1024px line, so
// crossing it does not remount it; the board swaps its desktop and phone
// trees (the open 已整理 column and the phone tab start over).
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

/**
 * A target on no control and not in the panel. Story 2.6: only the board's
 * own DOM counts; a portaled menu (the panel's 「⋯」) bubbles here through
 * React but lies outside the wrapper.
 */
function isEmptySpace(target: EventTarget, board: Element): boolean {
  return (
    target instanceof Element &&
    board.contains(target) &&
    target.closest('button, a, input, select, textarea, aside') === null
  )
}

/**
 * A press on a scroller's own scrollbar, outside its content box. Chromium
 * sends no `click` for a scrollbar (e2e/board-scrollbar.spec.ts); this
 * covers a browser that does.
 */
function onScrollbar(event: PointerEvent<HTMLElement>): boolean {
  const target = event.target
  if (!(target instanceof HTMLElement)) return false
  const box = target.getBoundingClientRect()
  return (
    event.clientX - box.left - target.clientLeft >= target.clientWidth ||
    event.clientY - box.top - target.clientTop >= target.clientHeight
  )
}

/**
 * Story 2.4: a click on empty board space closes the panel. Both the press
 * and the release must be on empty space: the browser sends `click` to the
 * common ancestor, so a drag that selects the panel's text, or a press on
 * one card released on another, would otherwise look empty. A press on a
 * column's scrollbar, or a click that ends a text selection, keeps it too.
 */
function BoardHome({ desktop }: { desktop: boolean }) {
  const { hash, setHash } = useViewedHash()
  const pressedEmptyRef = useRef(false)
  const onPointerDown = (event: PointerEvent<HTMLDivElement>) => {
    pressedEmptyRef.current =
      isEmptySpace(event.target, event.currentTarget) && !onScrollbar(event)
  }
  const onClick = (event: MouseEvent<HTMLDivElement>) => {
    const pressedEmpty = pressedEmptyRef.current
    pressedEmptyRef.current = false
    if (
      hash === null ||
      !pressedEmpty ||
      !isEmptySpace(event.target, event.currentTarget)
    ) {
      return
    }
    if (window.getSelection()?.isCollapsed === false) return
    setHash(null)
  }
  return (
    // The board's own keyboard and buttons stay; the wrapper only catches
    // clicks that fell through to empty space.
    <div
      className="group/board relative h-full min-h-0"
      onPointerDown={desktop ? onPointerDown : undefined}
      onClick={desktop ? onClick : undefined}
    >
      <TorrentBoard />
      {desktop ? <BoardDetailPanel /> : <BoardDetailSheet />}
    </div>
  )
}
