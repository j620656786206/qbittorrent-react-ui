import { createFileRoute } from '@tanstack/react-router'
import { useListView } from '#/state/list-view'
import { TorrentBoard } from '#/features/board/torrent-board'
import { TorrentList } from '#/features/list/torrent-list'

export const Route = createFileRoute('/_authed/')({ component: Home })

// The title and header are in the app shell; the page fills its `main`.
// EXPERIENCE 「排序決定長相」 (story 2.3): 「狀態」 is the board, every other
// sort the list.
function Home() {
  const { view } = useListView()
  return view.sort === 'state' ? <TorrentBoard /> : <TorrentList />
}
