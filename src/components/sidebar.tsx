import { Button } from '@/components/ui/button'
import type { TorrentState } from '@ctrl/qbittorrent'

type Filter = TorrentState | 'all'

const FILTERS: { id: Filter; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'downloading', label: 'Downloading' },
  { id: 'pausedDL', label: 'Paused' },
  { id: 'uploading', label: 'Seeding' },
  { id: 'completed', label: 'Completed' },
  { id: 'checkingT', label: 'Checking' },
  { id: 'error', label: 'Error' },
]

type SidebarProps = {
  currentFilter: Filter
  setFilter: (filter: Filter) => void
}

export function Sidebar({ currentFilter, setFilter }: SidebarProps) {
  return (
    <aside className="w-56 flex-shrink-0 bg-slate-800 p-4 flex flex-col">
      <h1 className="text-2xl font-bold text-white mb-6">qB-React</h1>
      <nav className="flex flex-col space-y-2">
        {FILTERS.map((filter) => (
          <Button
            key={filter.id}
            variant={currentFilter === filter.id ? 'secondary' : 'ghost'}
            className="justify-start"
            onClick={() => setFilter(filter.id)}
          >
            {filter.label}
          </Button>
        ))}
      </nav>
    </aside>
  )
}