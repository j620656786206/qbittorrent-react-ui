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

import type { Torrent } from '@/types/torrent'
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
import { TrackerStatus, getTrackers } from '@/lib/api'
import { useMediaQuery } from '@/lib/hooks'
import { getTags, getTagsByNames, parseTagString } from '@/lib/tag-storage'
import { formatBytes, formatEta } from '@/lib/utils'

// Helper functions
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
          <span className="text-slate-400">
            {t('torrent.details.progress')}
          </span>
          <span className="font-medium">
            {(torrent.progress * 100).toFixed(2)}%
          </span>
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
            <span className="text-xs font-medium">
              {t('torrent.details.downloadSpeed')}
            </span>
          </div>
          <div className="text-lg font-semibold text-white">
            {formatBytes(torrent.dlspeed)}/s
          </div>
        </div>

        <div className="bg-slate-800/50 rounded-lg p-3">
          <div className="flex items-center gap-2 text-green-400 mb-1">
            <Upload className="h-4 w-4" />
            <span className="text-xs font-medium">
              {t('torrent.details.uploadSpeed')}
            </span>
          </div>
          <div className="text-lg font-semibold text-white">
            {formatBytes(torrent.upspeed)}/s
          </div>
        </div>

        <div className="bg-slate-800/50 rounded-lg p-3">
          <div className="flex items-center gap-2 text-slate-400 mb-1">
            <Clock className="h-4 w-4" />
            <span className="text-xs font-medium">
              {t('torrent.details.remainingTime')}
            </span>
          </div>
          <div className="text-sm font-semibold text-white">
            {formatEta(torrent.eta)}
          </div>
        </div>

        <div className="bg-slate-800/50 rounded-lg p-3">
          <div className="flex items-center gap-2 text-slate-400 mb-1">
            <HardDrive className="h-4 w-4" />
            <span className="text-xs font-medium">
              {t('torrent.details.size')}
            </span>
          </div>
          <div className="text-sm font-semibold text-white">
            {formatBytes(torrent.size)}
          </div>
        </div>
      </div>

      {/* Details List */}
      <div className="space-y-3 border-t border-slate-700 pt-4">
        <DetailRow
          icon={<HashIcon className="h-4 w-4" />}
          label={t('torrent.details.status')}
          value={t(getStateKey(torrent.state))}
        />
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
          <div className="text-slate-400 mb-1">
            {t('torrent.details.connected')}
          </div>
          <div className="font-medium">
            {torrent.num_seeds} {t('torrent.details.seeds')} /{' '}
            {torrent.num_leechs} {t('torrent.details.leechers')}
          </div>
        </div>
        <div className="text-sm">
          <div className="text-slate-400 mb-1">
            {t('torrent.details.totalSwarm')}
          </div>
          <div className="font-medium">
            {torrent.num_complete} {t('torrent.details.seeds')} /{' '}
            {torrent.num_incomplete} {t('torrent.details.leechers')}
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
            <SheetTitle className="text-left line-clamp-2">
              {torrent.name}
            </SheetTitle>
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

function TorrentTagsEditor({
  hash: _hash,
  currentTags,
  baseUrl: _baseUrl,
}: TorrentTagsEditorProps) {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const [isDropdownOpen, setIsDropdownOpen] = React.useState(false)
  const containerRef = React.useRef<HTMLDivElement>(null)

  // Get available tags from localStorage
  const availableTags = React.useMemo(() => getTags(), [])

  // Parse current tags from comma-separated string
  const currentTagNames = React.useMemo(
    () => parseTagString(currentTags),
    [currentTags],
  )

  // Get Tag objects for current tags (with color info)
  const currentTagObjects = React.useMemo(
    () => getTagsByNames(currentTagNames),
    [currentTagNames],
  )

  // Get unassigned tags for dropdown
  const unassignedTags = React.useMemo(() => {
    return availableTags.filter(
      (tag) =>
        !currentTagNames.some(
          (name) => name.toLowerCase() === tag.name.toLowerCase(),
        ),
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
  // TODO: Implement addTorrentTags API function
  const addTagMutation = useMutation({
    mutationFn: (_tagName: string) => Promise.reject(new Error('Not implemented')),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['maindata'] })
    },
  })

  // Remove tag mutation
  // TODO: Implement removeTorrentTags API function
  const removeTagMutation = useMutation({
    mutationFn: (_tagName: string) => Promise.reject(new Error('Not implemented')),
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

  return (
    <div className="flex items-start gap-3" ref={containerRef}>
      <div className="text-slate-400 mt-0.5">
        <TagIcon className="h-4 w-4" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-xs text-slate-400 mb-0.5">{t('torrent.tags')}</div>
        <div className="flex flex-wrap gap-2 items-center relative">
          {currentTagObjects.map((tag) => (
            <TagChip
              key={tag.name}
              tag={tag}
              onRemove={() => handleRemoveTag(tag.name)}
            />
          ))}

          {/* Add Tag Button */}
          <div className="relative">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setIsDropdownOpen(!isDropdownOpen)}
              disabled={isLoading}
              className="h-6 px-2 text-xs"
            >
              <Plus className="h-3 w-3 mr-1" />
              {t('torrent.addTag')}
            </Button>

            {/* Dropdown Menu */}
            {isDropdownOpen && unassignedTags.length > 0 && (
              <div className="absolute top-full left-0 mt-1 bg-slate-800 border border-slate-700 rounded-md shadow-lg z-10 min-w-max">
                {unassignedTags.map((tag) => (
                  <button
                    key={tag.name}
                    onClick={() => handleAddTag(tag)}
                    disabled={isLoading}
                    className="w-full text-left px-3 py-2 text-xs hover:bg-slate-700 disabled:opacity-50 first:rounded-t-md last:rounded-b-md"
                  >
                    <span
                      className={`inline-block w-2 h-2 rounded-full mr-2 ${getColorClass(tag.color)}`}
                    ></span>
                    {tag.name}
                  </button>
                ))}
              </div>
            )}
          </div>

          {isLoading && (
            <Loader2 className="h-3 w-3 animate-spin text-blue-400" />
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
  const [trackerToRemove, setTrackerToRemove] = React.useState<Tracker | null>(
    null,
  )
  const [newTrackerUrl, setNewTrackerUrl] = React.useState('')

  // Remove tracker mutation
  // TODO: Implement removeTrackers API function
  const removeTrackerMutation = useMutation({
    mutationFn: (_url: string) => Promise.reject(new Error('Not implemented')),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['trackers', hash] })
      setTrackerToRemove(null)
    },
  })

  // Add tracker mutation
  // TODO: Implement addTrackers API function
  const addTrackerMutation = useMutation({
    mutationFn: (_url: string) => Promise.reject(new Error('Not implemented')),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['trackers', hash] })
      setIsAddDialogOpen(false)
      setNewTrackerUrl('')
    },
  })

  // Reannounce mutation
  // TODO: Implement reannounceTorrent API function
  const reannounceMutation = useMutation({
    mutationFn: () => Promise.reject(new Error('Not implemented')),
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
        <p className="text-slate-300 text-sm mb-2">{t('trackers.error')}</p>
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
              onClick={() => setIsAddDialogOpen(true)}
              disabled={addTrackerMutation.isPending}
              className="text-xs"
            >
              <Plus className="h-3 w-3 mr-1" />
              {t('trackers.add')}
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => reannounceMutation.mutate()}
              disabled={reannounceMutation.isPending}
              className="text-xs"
            >
              {reannounceMutation.isPending ? (
                <Loader2 className="h-3 w-3 animate-spin mr-1" />
              ) : (
                <Radio className="h-3 w-3 mr-1" />
              )}
              {t('trackers.reannounce')}
            </Button>
          </div>
        </div>

        {/* Add Tracker Dialog */}
        <Dialog open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>{t('trackers.addTracker')}</DialogTitle>
              <DialogDescription>
                {t('trackers.addTrackerDescription')}
              </DialogDescription>
            </DialogHeader>
            <div className="grid gap-4 py-4">
              <div className="grid gap-2">
                <Label htmlFor="tracker-url">{t('trackers.trackerUrl')}</Label>
                <Textarea
                  id="tracker-url"
                  placeholder="http://tracker.example.com:6969/announce"
                  value={newTrackerUrl}
                  onChange={(e) => setNewTrackerUrl(e.target.value)}
                  className="font-mono text-xs"
                />
              </div>
            </div>
            <DialogFooter>
              <Button
                variant="outline"
                onClick={() => {
                  setIsAddDialogOpen(false)
                  setNewTrackerUrl('')
                }}
                disabled={addTrackerMutation.isPending}
              >
                {t('common.cancel')}
              </Button>
              <Button
                onClick={() => {
                  if (newTrackerUrl.trim()) {
                    addTrackerMutation.mutate(newTrackerUrl)
                  }
                }}
                disabled={addTrackerMutation.isPending || !newTrackerUrl.trim()}
              >
                {addTrackerMutation.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                ) : (
                  <Plus className="h-4 w-4 mr-2" />
                )}
                {t('trackers.add')}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    )
  }

  // Tracker list
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2 text-sm text-slate-400">
          <span>
            {trackers.length} {t('trackers.title')}
          </span>
          {isFetching && (
            <Loader2 className="h-3 w-3 animate-spin text-blue-400" />
          )}
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setIsAddDialogOpen(true)}
            disabled={addTrackerMutation.isPending}
            className="text-xs"
          >
            <Plus className="h-3 w-3 mr-1" />
            {t('trackers.add')}
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => reannounceMutation.mutate()}
            disabled={reannounceMutation.isPending}
            className="text-xs"
          >
            {reannounceMutation.isPending ? (
              <Loader2 className="h-3 w-3 animate-spin mr-1" />
            ) : (
              <Radio className="h-3 w-3 mr-1" />
            )}
            {t('trackers.reannounce')}
          </Button>
        </div>
      </div>

      {/* Tracker list items */}
      <div className="space-y-2 max-h-96 overflow-y-auto">
        {trackers.map((tracker) => (
          <div
            key={tracker.url}
            className="flex items-center justify-between gap-3 p-2 bg-slate-800/50 rounded-lg text-sm"
          >
            <div className="flex items-center gap-2 flex-1 min-w-0">
              {getTrackerStatusIcon(tracker.status)}
              <div className="flex-1 min-w-0">
                <div className="font-medium text-white truncate">
                  {tracker.url}
                </div>
                <div className="text-xs text-slate-400">
                  {t(getTrackerStatusKey(tracker.status))}
                </div>
              </div>
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setTrackerToRemove(tracker)}
              disabled={removeTrackerMutation.isPending}
              className="text-xs text-red-400 hover:text-red-300 hover:bg-red-900/20"
            >
              {removeTrackerMutation.isPending &&
              trackerToRemove?.url === tracker.url ? (
                <Loader2 className="h-3 w-3 animate-spin" />
              ) : (
                <Trash2 className="h-3 w-3" />
              )}
            </Button>
          </div>
        ))}
      </div>

      {/* Add Tracker Dialog */}
      <Dialog open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{t('trackers.addTracker')}</DialogTitle>
            <DialogDescription>
              {t('trackers.addTrackerDescription')}
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label htmlFor="tracker-url">{t('trackers.trackerUrl')}</Label>
              <Textarea
                id="tracker-url"
                placeholder="http://tracker.example.com:6969/announce"
                value={newTrackerUrl}
                onChange={(e) => setNewTrackerUrl(e.target.value)}
                className="font-mono text-xs"
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setIsAddDialogOpen(false)
                setNewTrackerUrl('')
              }}
              disabled={addTrackerMutation.isPending}
            >
              {t('common.cancel')}
            </Button>
            <Button
              onClick={() => {
                if (newTrackerUrl.trim()) {
                  addTrackerMutation.mutate(newTrackerUrl)
                }
              }}
              disabled={addTrackerMutation.isPending || !newTrackerUrl.trim()}
            >
              {addTrackerMutation.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
              ) : (
                <Plus className="h-4 w-4 mr-2" />
              )}
              {t('trackers.add')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Remove Tracker Confirmation Dialog */}
      <Dialog
        open={trackerToRemove !== null}
        onOpenChange={() => setTrackerToRemove(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('trackers.removeTracker')}</DialogTitle>
            <DialogDescription>
              {t('trackers.removeTrackerConfirmation')}
            </DialogDescription>
          </DialogHeader>
          <div className="py-4">
            <p className="text-sm text-slate-300 font-mono break-all">
              {trackerToRemove?.url}
            </p>
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
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
              ) : (
                <Trash2 className="h-4 w-4 mr-2" />
              )}
              {t('common.delete')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
