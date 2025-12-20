import { Button } from '@/components/ui/button'
import { Settings, Folder, Hash, Plus } from 'lucide-react'
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
import type { Torrent } from '@/components/torrent-table'
import { useTranslation } from 'react-i18next'

type Filter = string

const STATUS_FILTERS: { id: Filter; key: string }[] = [
  { id: 'all', key: 'torrent.status.all' },
  { id: 'downloading', key: 'torrent.status.downloading' },
  { id: 'uploading', key: 'torrent.status.uploading' },
  { id: 'pausedDL', key: 'torrent.status.pausedDL' },
  { id: 'pausedUP', key: 'torrent.status.pausedUP' },
  { id: 'stalledDL', key: 'torrent.status.stalledDL' },
  { id: 'stalledUP', key: 'torrent.status.stalledUP' },
  { id: 'checkingDL', key: 'torrent.status.checkingDL' },
  { id: 'error', key: 'torrent.status.error' },
]

type SidebarProps = {
  currentFilter: Filter
  setFilter: (filter: Filter) => void
  onOpenSettings: () => void
  onAddTorrent: () => void
  isMobile: boolean
  isMobileSidebarOpen: boolean
  onCloseMobileSidebar: () => void
  torrents: Torrent[] // Add torrents prop for counting
  categories: Record<string, any> // Add categories from maindata
}

export function Sidebar({
  currentFilter,
  setFilter,
  onOpenSettings,
  onAddTorrent,
  isMobile,
  isMobileSidebarOpen,
  onCloseMobileSidebar,
  torrents,
  categories
}: SidebarProps) {
  const { t } = useTranslation()

  // Count torrents by status
  const getStatusCount = (statusId: string) => {
    if (statusId === 'all') return torrents.length
    return torrents.filter(t => t.state === statusId).length
  }

  // Get unique categories from torrents
  const categoryCounts = torrents.reduce((acc, torrent) => {
    const cat = torrent.category || t('torrent.uncategorized')
    acc[cat] = (acc[cat] || 0) + 1
    return acc
  }, {} as Record<string, number>)

  const sidebarContent = (
    <>
      <h1 className="text-xl font-bold text-white mb-6">{t('sidebar.title')}</h1>

      {/* Status Filters */}
      <div className="mb-6">
        <h2 className="text-xs font-semibold text-slate-400 uppercase mb-2 flex items-center gap-2">
          <Hash className="h-3 w-3" />
          {t('sidebar.status')}
        </h2>
        <nav className="flex flex-col space-y-1">
          {STATUS_FILTERS.map((filter) => {
            const count = getStatusCount(filter.id)
            if (count === 0 && filter.id !== 'all') return null

            return (
              <Button
                key={filter.id}
                variant={currentFilter === filter.id ? 'secondary' : 'ghost'}
                className="justify-between text-sm h-9"
                onClick={() => {
                  setFilter(filter.id)
                  if (isMobile) onCloseMobileSidebar()
                }}
              >
                <span>{t(filter.key)}</span>
                <span className="text-xs text-slate-400">{count}</span>
              </Button>
            )
          })}
        </nav>
      </div>

      {/* Category Filters */}
      {Object.keys(categoryCounts).length > 0 && (
        <div className="mb-6">
          <h2 className="text-xs font-semibold text-slate-400 uppercase mb-2 flex items-center gap-2">
            <Folder className="h-3 w-3" />
            {t('sidebar.categories')}
          </h2>
          <nav className="flex flex-col space-y-1">
            {Object.entries(categoryCounts).map(([category, count]) => (
              <Button
                key={category}
                variant={currentFilter === `category:${category}` ? 'secondary' : 'ghost'}
                className="justify-between text-sm h-9"
                onClick={() => {
                  setFilter(`category:${category}`)
                  if (isMobile) onCloseMobileSidebar()
                }}
              >
                <span className="truncate">{category}</span>
                <span className="text-xs text-slate-400 shrink-0 ml-2">{count}</span>
              </Button>
            ))}
          </nav>
        </div>
      )}

      {/* Actions */}
      <div className="mt-auto pt-4 border-t border-slate-700 space-y-1">
        <Button
          variant="ghost"
          className="justify-start w-full text-sm"
          onClick={() => {
            onAddTorrent()
            if (isMobile) onCloseMobileSidebar()
          }}
        >
          <Plus className="mr-2 h-4 w-4" />
          {t('addTorrent.title')}
        </Button>
        <Button
          variant="ghost"
          className="justify-start w-full text-sm"
          onClick={() => {
            onOpenSettings()
            if (isMobile) onCloseMobileSidebar()
          }}
        >
          <Settings className="mr-2 h-4 w-4" />
          {t('common.settings')}
        </Button>
      </div>
    </>
  )

  if (isMobile) {
    return (
      <Sheet open={isMobileSidebarOpen} onOpenChange={onCloseMobileSidebar}>
        {/* Trigger will be handled by HomePage */}
        <SheetContent side="left" className="p-4 flex flex-col w-64">
          <SheetHeader>
            <SheetTitle>Navigation</SheetTitle>
          </SheetHeader>
          {sidebarContent}
        </SheetContent>
      </Sheet>
    );
  }

  return (
    <aside className="w-56 flex-shrink-0 bg-slate-800 p-4 flex flex-col">
      {sidebarContent}
    </aside>
  );
}