import { createFileRoute } from '@tanstack/react-router'
import { TorrentList } from '#/features/list/torrent-list'

export const Route = createFileRoute('/_authed/')({ component: Home })

// The title and header are in the app shell; the list fills its `main`.
function Home() {
  return <TorrentList />
}
