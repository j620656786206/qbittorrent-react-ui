import React from 'react'
import {
  Folder,
  Hash,
  Plus,
  Search,
  Settings,
  Tag as TagIcon,
  X,
} from 'lucide-react'
import { useTranslation } from 'react-i18next'
import type { Torrent } from '@/types/torrent'
import type { Tag } from '@/types/tag'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
import { getTags, parseTagString } from '@/lib/tag-storage'
import { TagManagerModal } from '@/components/tag-manager-modal'
import { getColorClass } from '@/components/ui/tag-input'

type Filter = string

const STATUS_FILTERS: Array<{ id: Filter; key: string }> = [
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
  torrents: Array<Torrent>
  categories: Record<string, any>
  searchQuery: string
  setSearchQuery: (query: string) => void
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
  categories: _categories,
  searchQuery,
  setSearchQuery,
}: SidebarProps) {
  const { t } = useTranslation()

  // Tag manager modal state
  const [isTagManagerOpen, setIsTagManagerOpen] = React.useState(false)

  // Tags from localStorage (refreshed when modal closes)
  const [storedTags, setStoredTags] = React.useState<Array<Tag>>(() =>
    getTags(),
  )

  // Multi-tag filter state
  const [selectedTagFilters, setSelectedTagFilters] = React.useState<
    Set<string>
  >(new Set())

  // Refresh tags from localStorage
  const refreshTags = React.useCallback(() => {
    setStoredTags(getTags())
  }, [])

  // Sync selectedTagFilters with currentFilter
  React.useEffect(() => {
    if (currentFilter.startsWith('tag:')) {
      const tagNames = currentFilter
        .substring(4)
        .split(',')
        .map((tagName) => tagName.trim())
      setSelectedTagFilters(new Set(tagNames))
    } else {
      setSelectedTagFilters(new Set())
    }
  }, [currentFilter])

  // Count torrents by status
  const getStatusCount = (statusId: string) => {
    if (statusId === 'all') return torrents.length
    return torrents.filter((torrent) => torrent.state === statusId).length
  }

  // Get unique categories from torrents
  const categoryCounts = torrents.reduce(
    (acc, torrent) => {
      const cat = torrent.category || t('torrent.uncategorized')
      acc[cat] = (acc[cat] || 0) + 1
      return acc
    },
    {} as Record<string, number>,
  )

  // Count torrents by tag
  const tagCounts = React.useMemo(() => {
    const counts: Record<string, number> = {}
    torrents.forEach((torrent) => {
      const torrentTags = parseTagString(torrent.tags || '')
      torrentTags.forEach((tagName) => {
        counts[tagName] = (counts[tagName] || 0) + 1
      })
    })
    return counts
  }, [torrents])

  // Get tags with their counts (only show tags that exist in localStorage and have torrents)
  const tagsWithCounts = React.useMemo(() => {
    return storedTags
      .map((tag) => ({
        tag,
        count: tagCounts[tag.name] || 0,
      }))
      .sort((a, b) => b.count - a.count || a.tag.name.localeCompare(b.tag.name))
  }, [storedTags, tagCounts])

  const sidebarContent = (
    <>
      <h1 className="text-xl font-bold text-white mb-6">
        {t('sidebar.title')}
      </h1>

      {/* Search Input */}
      <div className="mb-6">
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
          <Input
            type="text"
            placeholder={t('sidebar.searchPlaceholder')}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9 pr-9 bg-slate-700 border-slate-600 text-white placeholder:text-slate-400"
          />
          {searchQuery && (
            <button
              type="button"
              onClick={() => setSearchQuery('')}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>
      </div>

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
                variant={
                  currentFilter === `category:${category}`
                    ? 'secondary'
                    : 'ghost'
                }
                className="justify-between text-sm h-9"
                onClick={() => {
                  setFilter(`category:${category}`)
                  if (isMobile) onCloseMobileSidebar()
                }}
              >
                <span className="truncate">{category}</span>
                <span className="text-xs text-slate-400 shrink-0 ml-2">
                  {count}
                </span>
              </Button>
            ))}
          </nav>
        </div>
      )}

      {/* Tag Filters */}
      <div className="mb-6">
        <h2 className="text-xs font-semibold text-slate-400 uppercase mb-2 flex items-center gap-2">
          <TagIcon className="h-3 w-3" />
          {t('sidebar.tags')}
        </h2>
        <nav className="flex flex-col space-y-1">
          {tagsWithCounts.length > 0 ? (
            tagsWithCounts.map(({ tag, count }) => (
              <Button
                key={tag.id}
                variant={
                  selectedTagFilters.has(tag.name) ? 'secondary' : 'ghost'
                }
                className="justify-between text-sm h-9"
                onClick={() => {
                  const newSelected = new Set(selectedTagFilters)

                  // Toggle tag selection
                  if (newSelected.has(tag.name)) {
                    newSelected.delete(tag.name)
                  } else {
                    newSelected.add(tag.name)
                  }

                  // Update filter based on selection
                  if (newSelected.size === 0) {
                    setFilter('all')
                  } else {
                    const tagList = Array.from(newSelected).join(',')
                    setFilter(`tag:${tagList}`)
                  }

                  if (isMobile) onCloseMobileSidebar()
                }}
              >
                <span className="flex items-center gap-2 truncate min-w-0">
                  <span
                    className={`h-2 w-2 rounded-full shrink-0 ${getColorClass(tag.color)}`}
                  />
                  <span className="truncate">{tag.name}</span>
                </span>
                <span className="text-xs text-slate-400 shrink-0 ml-2">
                  {count}
                </span>
              </Button>
            ))
          ) : (
            <div className="text-xs text-slate-500 py-2 px-2">
              {t('tags.sidebar.noTags')}
            </div>
          )}
          <Button
            variant="ghost"
            className="justify-start text-sm h-9 text-slate-400 hover:text-white"
            onClick={() => {
              setIsTagManagerOpen(true)
              if (isMobile) onCloseMobileSidebar()
            }}
          >
            <Plus className="mr-2 h-3 w-3" />
            {t('tags.sidebar.manageTags')}
          </Button>
        </nav>
      </div>

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
      <>
        <Sheet open={isMobileSidebarOpen} onOpenChange={onCloseMobileSidebar}>
          {/* Trigger will be handled by HomePage */}
          <SheetContent side="left" className="p-4 flex flex-col w-64">
            <SheetHeader>
              <SheetTitle>Navigation</SheetTitle>
            </SheetHeader>
            {sidebarContent}
          </SheetContent>
        </Sheet>
        <TagManagerModal
          isOpen={isTagManagerOpen}
          onClose={() => setIsTagManagerOpen(false)}
          onTagsChange={refreshTags}
        />
      </>
    )
  }

  return (
    <>
      <aside className="w-56 flex-shrink-0 bg-slate-800 p-4 flex flex-col">
        {sidebarContent}
      </aside>
      <TagManagerModal
        isOpen={isTagManagerOpen}
        onClose={() => setIsTagManagerOpen(false)}
        onTagsChange={refreshTags}
      />
    </>
  )
}