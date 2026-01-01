import React from 'react'
import { useTranslation } from 'react-i18next'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  AlertCircle,
  Calendar,
  CheckCircle2,
  Circle,
  Clock,
  Download,
  FolderOpen,
  HardDrive,
  Hash as HashIcon,
  Loader2,
  MinusCircle,
  Pause,
  Play,
  Plus,
  Radio,
  RefreshCw,
  Tag as TagIcon,
  Trash2,
  Upload,
  XCircle,
} from 'lucide-react'

import type { Torrent } from '@/components/torrent-table'
import type { Tracker, TrackerStatusType } from '@/lib/api'
import type { Tag } from '@/types/tag'

import { TorrentFileList } from '@/components/TorrentFileList'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Progress } from '@/components/ui/progress'
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
import { TagChip, getColorClass } from '@/components/ui/tag-input'
import { TrackerStatus, addTorrentTags, addTrackers, getTrackers, reannounceTorrent, removeTorrentTags, removeTrackers } from '@/lib/api'
import { useMediaQuery } from '@/lib/hooks'
import { getTags, getTagsByNames, parseTagString } from '@/lib/tag-storage'

// Helper functions
function formatBytes(bytes: number, decimals = 2) {
  if (bytes === 0) return '0 B'
  const k = 1024
  const dm = decimals < 0 ? 0 : decimals
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i]
}

function formatEta(seconds: number) {
  if (seconds < 0 || seconds === 8640000) return '∞'
  if (seconds === 0) return '-'

  const days = Math.floor(seconds / 86400)
  const hours = Math.floor((seconds % 86400) / 3600)
  const minutes = Math.floor((seconds % 3600) / 60)
  const secs = seconds % 60

  const parts = []
  if (days > 0) parts.push(`${days}天`)
  if (hours > 0) parts.push(`${hours}時`)
  if (minutes > 0) parts.push(`${minutes}分`)
  if (secs > 0 && days === 0) parts.push(`${secs}秒`)

  return parts.join(' ') || '-'
}

function formatDate(timestamp: number) {
  if (timestamp <= 0) return '-'
  return new Date(timestamp * 1000).toLocaleString('zh-TW')
}

function getStateKey(state: string): string {
  return `torrent.status.${state}`
}

// Tracker status helper functions
function getTrackerStatusIcon(status: TrackerStatusType): React.ReactNode {
  switch (status) {
    case TrackerStatus.Disabled:
      return <MinusCircle className="h-4 w-4 text-slate-500" />
    case TrackerStatus.NotContacted:
      return <Circle className="h-4 w-4 text-slate-400" />
    case TrackerStatus.Working:
      return <CheckCircle2 className="h-4 w-4 text-green-500" />
    case TrackerStatus.Updating:
      return <RefreshCw className="h-4 w-4 text-yellow-500 animate-spin" />
    case TrackerStatus.NotWorking:
      return <XCircle className="h-4 w-4 text-red-500" />
    default:
      return <Circle className="h-4 w-4 text-slate-400" />
  }
}

function getTrackerStatusKey(status: TrackerStatusType): string {
  switch (status) {
    case TrackerStatus.Disabled:
      return 'trackers.status.disabled'
    case TrackerStatus.NotContacted:
      return 'trackers.status.notContacted'
    case TrackerStatus.Working:
      return 'trackers.status.working'
    case TrackerStatus.Updating:
      return 'trackers.status.updating'
    case TrackerStatus.NotWorking:
      return 'trackers.status.notWorking'
    default:
      return 'trackers.status.unknown'
  }
}

type TorrentDetailProps = {
  torrent: Torrent | null
  isOpen: boolean
  onClose: () => void
  onPause?: () => void
  onResume?: () => void
  onDelete?: () => void
  onRecheck?: () => void
  baseUrl?: string
}

export function TorrentDetail({
  torrent,
  isOpen,
  onClose,
  onPause,
  onResume,
  onDelete,
  onRecheck,
  baseUrl,
}: TorrentDetailProps) {
  const { t } = useTranslation()
  const isMobile = !useMediaQuery('(min-width: 768px)')

  if (!torrent) return null

  const isPaused = torrent.state.includes('paused')

  const detailContent = (
    <div className="space-y-6">
      {/* Progress Section */}
      <div className="space-y-2">
        <div className="flex items-center justify-between text-sm">
          <span className="text-slate-400">{t('torrent.details.progress')}</span>
          <span className="font-medium">{(torrent.progress * 100).toFixed(2)}%</span>
        </div>
        <Progress value={torrent.progress * 100} className="h-3" />
        <div className="flex items-center justify-between text-xs text-slate-400">
          <span>{formatBytes(torrent.completed)}</span>
          <span>{formatBytes(torrent.size)}</span>
        </div>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-2 gap-4">
        <div className="bg-slate-800/50 rounded-lg p-3">
          <div className="flex items-center gap-2 text-blue-400 mb-1">
            <Download className="h-4 w-4" />
            <span className="text-xs font-medium">{t('torrent.details.downloadSpeed')}</span>
          </div>
          <div className="text-lg font-semibold text-white">
            {formatBytes(torrent.dlspeed)}/s
          </div>
        </div>

        <div className="bg-slate-800/50 rounded-lg p-3">
          <div className="flex items-center gap-2 text-green-400 mb-1">
            <Upload className="h-4 w-4" />
            <span className="text-xs font-medium">{t('torrent.details.uploadSpeed')}</span>
          </div>
          <div className="text-lg font-semibold text-white">
            {formatBytes(torrent.upspeed)}/s
          </div>
        </div>

        <div className="bg-slate-800/50 rounded-lg p-3">
          <div className="flex items-center gap-2 text-slate-400 mb-1">
            <Clock className="h-4 w-4" />
            <span className="text-xs font-medium">{t('torrent.details.remainingTime')}</span>
          </div>
          <div className="text-sm font-semibold text-white">
            {formatEta(torrent.eta)}
          </div>
        </div>

        <div className="bg-slate-800/50 rounded-lg p-3">
          <div className="flex items-center gap-2 text-slate-400 mb-1">
            <HardDrive className="h-4 w-4" />
            <span className="text-xs font-medium">{t('torrent.details.size')}</span>
          </div>
          <div className="text-sm font-semibold text-white">
            {formatBytes(torrent.size)}
          </div>
        </div>
      </div>

      {/* Details List */}
      <div className="space-y-3 border-t border-slate-700 pt-4">
        <DetailRow icon={<HashIcon className="h-4 w-4" />} label={t('torrent.details.status')} value={t(getStateKey(torrent.state))} />
        <DetailRow
          icon={<Download className="h-4 w-4" />}
          label={t('torrent.details.downloaded')}
          value={`${formatBytes(torrent.downloaded)} (${t('torrent.details.thisSession')}: ${formatBytes(torrent.downloaded_session)})`}
        />
        <DetailRow
          icon={<Upload className="h-4 w-4" />}
          label={t('torrent.details.uploaded')}
          value={`${formatBytes(torrent.uploaded)} (${t('torrent.details.thisSession')}: ${formatBytes(torrent.uploaded_session)})`}
        />
        <DetailRow
          icon={<HashIcon className="h-4 w-4" />}
          label={t('torrent.details.ratio')}
          value={torrent.ratio.toFixed(2)}
        />
        <DetailRow
          icon={<Calendar className="h-4 w-4" />}
          label={t('torrent.details.addedOn')}
          value={formatDate(torrent.added_on)}
        />
        {torrent.completion_on > 0 && (
          <DetailRow
            icon={<Calendar className="h-4 w-4" />}
            label={t('torrent.details.completedOn')}
            value={formatDate(torrent.completion_on)}
          />
        )}
        {torrent.category && (
          <DetailRow
            icon={<FolderOpen className="h-4 w-4" />}
            label={t('torrent.category')}
            value={torrent.category}
          />
        )}
        {/* Tags Section */}
        {baseUrl && (
          <TorrentTagsEditor
            hash={torrent.hash}
            currentTags={torrent.tags || ''}
            baseUrl={baseUrl}
          />
        )}
        <DetailRow
          icon={<FolderOpen className="h-4 w-4" />}
          label={t('torrent.details.savePath')}
          value={torrent.save_path}
          valueClassName="text-xs break-all"
        />
        <DetailRow
          icon={<HashIcon className="h-4 w-4" />}
          label={t('torrent.details.hash')}
          value={torrent.hash}
          valueClassName="text-xs font-mono break-all"
        />
      </div>

      {/* Peers/Seeds Info */}
      <div className="grid grid-cols-2 gap-3 border-t border-slate-700 pt-4">
        <div className="text-sm">
          <div className="text-slate-400 mb-1">{t('torrent.details.connected')}</div>
          <div className="font-medium">
            {torrent.num_seeds} {t('torrent.details.seeds')} / {torrent.num_leechs} {t('torrent.details.leechers')}
          </div>
        </div>
        <div className="text-sm">
          <div className="text-slate-400 mb-1">{t('torrent.details.totalSwarm')}</div>
          <div className="font-medium">
            {torrent.num_complete} {t('torrent.details.seeds')} / {torrent.num_incomplete} {t('torrent.details.leechers')}
          </div>
        </div>
      </div>

      {/* File List */}
      {baseUrl && (
        <div className="border-t border-slate-700 pt-4">
          <h3 className="text-sm font-medium text-slate-300 mb-3">
            {t('torrent.details.files')}
          </h3>
          <TorrentFileList hash={torrent.hash} baseUrl={baseUrl} />
        </div>
      )}

      {/* Tracker List */}
      {baseUrl && (
        <div className="border-t border-slate-700 pt-4">
          <h3 className="text-sm font-medium text-slate-300 mb-3">
            {t('trackers.title')}
          </h3>
          <TrackerList hash={torrent.hash} baseUrl={baseUrl} />
        </div>
      )}

      {/* Actions */}
      <div className="flex gap-2 border-t border-slate-700 pt-4">
        {isPaused ? (
          <Button
            onClick={() => {
              onResume?.()
              onClose()
            }}
            className="flex-1"
            variant="default"
          >
            <Play className="h-4 w-4 mr-2" />
            {t('common.continue')}
          </Button>
        ) : (
          <Button
            onClick={() => {
              onPause?.()
              onClose()
            }}
            className="flex-1"
            variant="secondary"
          >
            <Pause className="h-4 w-4 mr-2" />
            {t('common.pause')}
          </Button>
        )}
        <Button
          onClick={() => {
            onRecheck?.()
            onClose()
          }}
          variant="outline"
          className="flex-1"
        >
          <RefreshCw className="h-4 w-4 mr-2" />
          {t('common.forceRecheck')}
        </Button>
        <Button
          onClick={() => {
            onDelete?.()
            onClose()
          }}
          variant="destructive"
          className="flex-1"
        >
          <Trash2 className="h-4 w-4 mr-2" />
          {t('common.delete')}
        </Button>
      </div>
    </div>
  )

  if (isMobile) {
    return (
      <Sheet open={isOpen} onOpenChange={onClose}>
        <SheetContent side="bottom" className="h-[90vh] overflow-y-auto">
          <SheetHeader>
            <SheetTitle className="text-left line-clamp-2">{torrent.name}</SheetTitle>
          </SheetHeader>
          <div className="mt-6">{detailContent}</div>
        </SheetContent>
      </Sheet>
    )
  }

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="line-clamp-2">{torrent.name}</DialogTitle>
        </DialogHeader>
        {detailContent}
      </DialogContent>
    </Dialog>
  )
}

function DetailRow({
  icon,
  label,
  value,
  valueClassName = '',
}: {
  icon: React.ReactNode
  label: string
  value: string
  valueClassName?: string
}) {
  return (
    <div className="flex items-start gap-3">
      <div className="text-slate-400 mt-0.5">{icon}</div>
      <div className="flex-1 min-w-0">
        <div className="text-xs text-slate-400 mb-0.5">{label}</div>
        <div className={`text-sm text-white ${valueClassName}`}>{value}</div>
      </div>
    </div>
  )
}

// TorrentTagsEditor component - allows editing tags on a torrent
type TorrentTagsEditorProps = {
  hash: string
  currentTags: string
  baseUrl: string
}

function TorrentTagsEditor({ hash, currentTags, baseUrl }: TorrentTagsEditorProps) {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const [isDropdownOpen, setIsDropdownOpen] = React.useState(false)
  const containerRef = React.useRef<HTMLDivElement>(null)

  // Get available tags from localStorage
  const availableTags = React.useMemo(() => getTags(), [])

  // Parse current tags from comma-separated string
  const currentTagNames = React.useMemo(
    () => parseTagString(currentTags),
    [currentTags]
  )

  // Get Tag objects for current tags (with color info)
  const currentTagObjects = React.useMemo(
    () => getTagsByNames(currentTagNames),
    [currentTagNames]
  )

  // Get unassigned tags for dropdown
  const unassignedTags = React.useMemo(() => {
    return availableTags.filter(
      (tag) => !currentTagNames.some(
        (name) => name.toLowerCase() === tag.name.toLowerCase()
      )
    )
  }, [availableTags, currentTagNames])

  // Close dropdown when clicking outside
  React.useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (
        containerRef.current &&
        !containerRef.current.contains(event.target as Node)
      ) {
        setIsDropdownOpen(false)
      }
    }

    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  // Add tag mutation
  const addTagMutation = useMutation({
    mutationFn: (tagName: string) => addTorrentTags(baseUrl, hash, tagName),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['maindata'] })
    },
  })

  // Remove tag mutation
  const removeTagMutation = useMutation({
    mutationFn: (tagName: string) => removeTorrentTags(baseUrl, hash, tagName),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['maindata'] })
    },
  })

  const handleAddTag = (tag: Tag) => {
    addTagMutation.mutate(tag.name)
    setIsDropdownOpen(false)
  }

  const handleRemoveTag = (tagName: string) => {
    removeTagMutation.mutate(tagName)
  }

  const isLoading = addTagMutation.isPending || removeTagMutation.isPending

  // Don't render if no available tags exist
  if (availableTags.length === 0 && currentTagObjects.length === 0) {
    return null
  }

  return (
    <div className="flex items-start gap-3" ref={containerRef}>
      <div className="text-slate-400 mt-0.5">
        <TagIcon className="h-4 w-4" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-xs text-slate-400 mb-1">{t('torrent.details.tags')}</div>
        <div className="flex flex-wrap items-center gap-1.5">
          {/* Display current tags */}
          {currentTagObjects.map((tag) => (
            <TagChip
              key={tag.id}
              tag={tag}
              onRemove={
                isLoading ? undefined : () => handleRemoveTag(tag.name)
              }
            />
          ))}

          {/* Display tag names that don't have metadata in localStorage */}
          {currentTagNames
            .filter(
              (name) => !currentTagObjects.some(
                (tag) => tag.name.toLowerCase() === name.toLowerCase()
              )
            )
            .map((name) => (
              <span
                key={name}
                className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium bg-slate-700/50 text-slate-200"
              >
                <span className="size-2 rounded-full shrink-0 bg-slate-500" />
                <span className="truncate max-w-[100px]" title={name}>
                  {name}
                </span>
                {!isLoading && (
                  <button
                    type="button"
                    onClick={() => handleRemoveTag(name)}
                    className="ml-0.5 rounded-full p-0.5 hover:bg-slate-600/50 transition-colors"
                  >
                    <XCircle className="size-3" />
                  </button>
                )}
              </span>
            ))}

          {/* Add tag button */}
          {unassignedTags.length > 0 && (
            <div className="relative">
              <button
                type="button"
                onClick={() => setIsDropdownOpen(!isDropdownOpen)}
                disabled={isLoading}
                className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium bg-slate-700/30 text-slate-400 hover:bg-slate-700/50 hover:text-slate-200 transition-colors disabled:opacity-50"
              >
                {isLoading ? (
                  <Loader2 className="size-3 animate-spin" />
                ) : (
                  <Plus className="size-3" />
                )}
                <span>{t('torrent.details.addTag')}</span>
              </button>

              {/* Dropdown menu for adding tags */}
              {isDropdownOpen && !isLoading && (
                <div className="absolute z-50 mt-1 left-0 min-w-[120px] rounded-md border bg-popover p-1 shadow-md animate-in fade-in-0 zoom-in-95">
                  <div className="max-h-[150px] overflow-y-auto">
                    {unassignedTags.map((tag) => (
                      <button
                        key={tag.id}
                        type="button"
                        onClick={() => handleAddTag(tag)}
                        className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-sm outline-none cursor-default select-none hover:bg-accent hover:text-accent-foreground focus:bg-accent focus:text-accent-foreground"
                      >
                        <span
                          className={`size-3 rounded-full shrink-0 ${getColorClass(tag.color)}`}
                        />
                        <span className="flex-1 truncate text-left">
                          {tag.name}
                        </span>
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Show placeholder if no tags */}
          {currentTagNames.length === 0 && unassignedTags.length === 0 && (
            <span className="text-xs text-slate-500">
              {t('tags.sidebar.noTags')}
            </span>
          )}
        </div>
      </div>
    </div>
  )
}

// TrackerList component - displays tracker list with status indicators
type TrackerListProps = {
  hash: string
  baseUrl: string
}

function TrackerList({ hash, baseUrl }: TrackerListProps) {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const [isAddDialogOpen, setIsAddDialogOpen] = React.useState(false)
  const [trackerToRemove, setTrackerToRemove] = React.useState<Tracker | null>(null)

  // Remove tracker mutation
  const removeTrackerMutation = useMutation({
    mutationFn: (url: string) => removeTrackers(baseUrl, hash, url),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['trackers', hash] })
      setTrackerToRemove(null)
    },
  })

  // Reannounce mutation
  const reannounceMutation = useMutation({
    mutationFn: () => reannounceTorrent(baseUrl, hash),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['trackers', hash] })
    },
  })

  const {
    data: trackers,
    isLoading,
    isError,
    error,
    refetch,
    isFetching,
  } = useQuery({
    queryKey: ['trackers', hash],
    queryFn: () => getTrackers(baseUrl, hash),
    refetchInterval: 10000, // Refresh every 10 seconds
    enabled: !!hash,
  })

  // Loading state
  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-6">
        <Loader2 className="h-5 w-5 animate-spin text-slate-400" />
        <span className="ml-2 text-slate-400 text-sm">
          {t('trackers.loading')}
        </span>
      </div>
    )
  }

  // Error state
  if (isError) {
    return (
      <div className="flex flex-col items-center justify-center py-6 text-center">
        <AlertCircle className="h-6 w-6 text-red-400 mb-2" />
        <p className="text-slate-300 text-sm mb-2">
          {t('trackers.error')}
        </p>
        <p className="text-slate-500 text-xs mb-3">
          {error instanceof Error ? error.message : String(error)}
        </p>
        <Button
          variant="outline"
          size="sm"
          onClick={() => refetch()}
          disabled={isFetching}
          className="text-xs"
        >
          {isFetching ? (
            <Loader2 className="h-3 w-3 animate-spin mr-1" />
          ) : (
            <RefreshCw className="h-3 w-3 mr-1" />
          )}
          {t('common.retry')}
        </Button>
      </div>
    )
  }

  // Empty state - still allow adding trackers and reannouncing
  if (!trackers || trackers.length === 0) {
    return (
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-sm text-slate-400">
            <Radio className="h-4 w-4" />
            <span>{t('trackers.noTrackers')}</span>
            {reannounceMutation.isPending && (
              <Loader2 className="h-3 w-3 animate-spin text-blue-400" />
            )}
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => reannounceMutation.mutate()}
              disabled={reannounceMutation.isPending}
              className="text-xs"
              title={t('trackers.reannounce.tooltip')}
            >
              {reannounceMutation.isPending ? (
                <Loader2 className="h-3 w-3 mr-1 animate-spin" />
              ) : (
                <RefreshCw className="h-3 w-3 mr-1" />
              )}
              {t('trackers.reannounce.button')}
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setIsAddDialogOpen(true)}
              className="text-xs"
            >
              <Plus className="h-3 w-3 mr-1" />
              {t('trackers.add.button')}
            </Button>
          </div>
        </div>

        {/* Add Tracker Dialog */}
        <AddTrackerDialog
          isOpen={isAddDialogOpen}
          onClose={() => setIsAddDialogOpen(false)}
          hash={hash}
          baseUrl={baseUrl}
        />
      </div>
    )
  }

  // Count user-added trackers (status > 0)
  const userTrackerCount = trackers.filter(tracker => tracker.status !== TrackerStatus.Disabled).length

  return (
    <div className="space-y-3">
      {/* Header with tracker count and action buttons */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-sm text-slate-400">
          <Radio className="h-4 w-4" />
          <span>
            {t('trackers.count', { count: userTrackerCount })}
          </span>
          {(isFetching || reannounceMutation.isPending) && (
            <Loader2 className="h-3 w-3 animate-spin text-blue-400" />
          )}
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => reannounceMutation.mutate()}
            disabled={reannounceMutation.isPending}
            className="text-xs"
            title={t('trackers.reannounce.tooltip')}
          >
            {reannounceMutation.isPending ? (
              <Loader2 className="h-3 w-3 mr-1 animate-spin" />
            ) : (
              <RefreshCw className="h-3 w-3 mr-1" />
            )}
            {t('trackers.reannounce.button')}
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setIsAddDialogOpen(true)}
            className="text-xs"
          >
            <Plus className="h-3 w-3 mr-1" />
            {t('trackers.add.button')}
          </Button>
        </div>
      </div>

      {/* Tracker Table */}
      <div className="bg-slate-900/50 rounded-lg border border-slate-700/50 overflow-hidden">
        <div className="max-h-[300px] overflow-y-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-800/50 sticky top-0">
              <tr className="text-left text-xs text-slate-400">
                <th className="px-3 py-2 font-medium">{t('trackers.table.status')}</th>
                <th className="px-3 py-2 font-medium">{t('trackers.table.url')}</th>
                <th className="px-3 py-2 font-medium text-center">{t('trackers.table.seeds')}</th>
                <th className="px-3 py-2 font-medium text-center">{t('trackers.table.peers')}</th>
                <th className="px-3 py-2 font-medium w-12"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-700/50">
              {trackers.map((tracker, index) => (
                <TrackerRow
                  key={`${tracker.url}-${index}`}
                  tracker={tracker}
                  t={t}
                  onRemove={() => setTrackerToRemove(tracker)}
                />
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Add Tracker Dialog */}
      <AddTrackerDialog
        isOpen={isAddDialogOpen}
        onClose={() => setIsAddDialogOpen(false)}
        hash={hash}
        baseUrl={baseUrl}
      />

      {/* Remove Tracker Confirmation Dialog */}
      <Dialog open={!!trackerToRemove} onOpenChange={() => setTrackerToRemove(null)}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle>{t('trackers.remove.title')}</DialogTitle>
            <DialogDescription>{t('trackers.remove.description')}</DialogDescription>
          </DialogHeader>

          <div className="py-4">
            <div className="text-sm text-slate-400 mb-1">{t('trackers.remove.url')}</div>
            <div className="text-sm font-mono text-white break-all bg-slate-800/50 rounded-md px-3 py-2">
              {trackerToRemove?.url}
            </div>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setTrackerToRemove(null)}
              disabled={removeTrackerMutation.isPending}
            >
              {t('common.cancel')}
            </Button>
            <Button
              variant="destructive"
              onClick={() => {
                if (trackerToRemove) {
                  removeTrackerMutation.mutate(trackerToRemove.url)
                }
              }}
              disabled={removeTrackerMutation.isPending}
            >
              {removeTrackerMutation.isPending ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  {t('trackers.remove.removing')}
                </>
              ) : (
                <>
                  <Trash2 className="h-4 w-4 mr-2" />
                  {t('trackers.remove.confirm')}
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

// Individual tracker row component
type TrackerRowProps = {
  tracker: Tracker
  t: (key: string) => string
  onRemove: () => void
}

function TrackerRow({ tracker, t, onRemove }: TrackerRowProps) {
  const isDisabled = tracker.status === TrackerStatus.Disabled
  const hasError = tracker.status === TrackerStatus.NotWorking && tracker.msg

  // Truncate long URLs for display
  const displayUrl = React.useMemo(() => {
    if (!tracker.url) return '-'
    // For DHT/PeX/LSD, show the descriptive name
    if (isDisabled && (tracker.url.includes('DHT') || tracker.url.includes('PeX') || tracker.url.includes('LSD'))) {
      return tracker.url
    }
    // For regular URLs, show a truncated version
    if (tracker.url.length > 50) {
      try {
        const url = new URL(tracker.url)
        return `${url.protocol}//${url.host}${url.pathname.length > 20 ? url.pathname.substring(0, 20) + '...' : url.pathname}`
      } catch {
        return tracker.url.substring(0, 50) + '...'
      }
    }
    return tracker.url
  }, [tracker.url, isDisabled])

  return (
    <tr className={`${isDisabled ? 'text-slate-500 bg-slate-800/20' : 'text-slate-200'} hover:bg-slate-800/30 transition-colors`}>
      {/* Status Column */}
      <td className="px-3 py-2">
        <div className="flex items-center gap-2" title={t(getTrackerStatusKey(tracker.status))}>
          {getTrackerStatusIcon(tracker.status)}
          <span className="text-xs hidden sm:inline">
            {t(getTrackerStatusKey(tracker.status))}
          </span>
        </div>
      </td>

      {/* URL Column */}
      <td className="px-3 py-2">
        <div className="flex flex-col gap-0.5">
          <span className="font-mono text-xs break-all" title={tracker.url}>
            {displayUrl}
          </span>
          {/* Show error message if tracker is not working */}
          {hasError && (
            <span className="text-xs text-red-400 break-all" title={tracker.msg}>
              {tracker.msg.length > 60 ? tracker.msg.substring(0, 60) + '...' : tracker.msg}
            </span>
          )}
        </div>
      </td>

      {/* Seeds Column */}
      <td className="px-3 py-2 text-center">
        <span className={isDisabled ? 'text-slate-600' : 'text-green-400'}>
          {tracker.num_seeds >= 0 ? tracker.num_seeds : '-'}
        </span>
      </td>

      {/* Peers Column */}
      <td className="px-3 py-2 text-center">
        <span className={isDisabled ? 'text-slate-600' : 'text-blue-400'}>
          {tracker.num_peers >= 0 ? tracker.num_peers : '-'}
        </span>
      </td>

      {/* Actions Column */}
      <td className="px-3 py-2 text-center">
        {!isDisabled && (
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6 text-slate-400 hover:text-red-400 hover:bg-red-400/10"
            onClick={onRemove}
            title={t('trackers.remove.button')}
          >
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        )}
      </td>
    </tr>
  )
}

// AddTrackerDialog component - dialog for adding new trackers
type AddTrackerDialogProps = {
  isOpen: boolean
  onClose: () => void
  hash: string
  baseUrl: string
}

function AddTrackerDialog({ isOpen, onClose, hash, baseUrl }: AddTrackerDialogProps) {
  const { t } = useTranslation()
  const queryClient = useQueryClient()

  // Form state
  const [trackerUrls, setTrackerUrls] = React.useState('')
  const [error, setError] = React.useState('')

  // Add trackers mutation
  const addTrackersMutation = useMutation({
    mutationFn: (urls: Array<string>) => addTrackers(baseUrl, hash, urls),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['trackers', hash] })
      handleClose()
    },
    onError: (err: Error) => {
      setError(err.message || t('trackers.add.error.failed'))
    },
  })

  // Reset form state
  const resetForm = () => {
    setTrackerUrls('')
    setError('')
  }

  // Handle modal close
  const handleClose = () => {
    resetForm()
    onClose()
  }

  // Validate tracker URL
  const isValidTrackerUrl = (url: string): boolean => {
    const trimmedUrl = url.trim()
    if (!trimmedUrl) return false

    // Check for common tracker URL protocols
    const validProtocols = ['http://', 'https://', 'udp://', 'wss://']
    return validProtocols.some((protocol) => trimmedUrl.toLowerCase().startsWith(protocol))
  }

  // Handle form submission
  const handleSubmit = () => {
    setError('')

    // Split URLs by newlines and filter out empty lines
    const urls = trackerUrls
      .split('\n')
      .map((url) => url.trim())
      .filter((url) => url.length > 0)

    // Check if there are any URLs
    if (urls.length === 0) {
      setError(t('trackers.add.error.empty'))
      return
    }

    // Validate each URL
    for (const url of urls) {
      if (!isValidTrackerUrl(url)) {
        setError(t('trackers.add.error.invalid', { url }))
        return
      }
    }

    // Submit the URLs
    addTrackersMutation.mutate(urls)
  }

  const isSubmitting = addTrackersMutation.isPending

  return (
    <Dialog open={isOpen} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>{t('trackers.add.title')}</DialogTitle>
          <DialogDescription>{t('trackers.add.description')}</DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 py-4">
          {/* Tracker URLs Input */}
          <div className="grid gap-2">
            <Label htmlFor="trackerUrls">{t('trackers.add.label')}</Label>
            <Textarea
              id="trackerUrls"
              value={trackerUrls}
              onChange={(e) => {
                setTrackerUrls(e.target.value)
                setError('')
              }}
              placeholder={t('trackers.add.placeholder')}
              className="font-mono text-sm min-h-[120px]"
              rows={5}
            />
          </div>

          {/* Error Message */}
          {error && (
            <div className="text-sm text-red-500 bg-red-500/10 rounded-md px-3 py-2">
              {error}
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={handleClose} disabled={isSubmitting}>
            {t('common.cancel')}
          </Button>
          <Button onClick={handleSubmit} disabled={isSubmitting}>
            {isSubmitting ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                {t('trackers.add.adding')}
              </>
            ) : (
              <>
                <Plus className="h-4 w-4 mr-2" />
                {t('trackers.add.submit')}
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
