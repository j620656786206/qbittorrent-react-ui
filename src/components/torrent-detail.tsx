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
import { useToast } from '@/lib/use-toast'

// Helper functions
function formatDate(timestamp: number) {
  if (timestamp <= 0) return '-'
  return new Date(timestamp * 1000).toLocaleString('zh-TW')
}

function getStateKey(state: string): string {
  return `torrent.status.${state}`
}

// Helper to get progress bar color based on torrent state
function getProgressColor(state: string): string {
  // Green: seeding/uploading/complete
  if (['uploading', 'forcedUP', 'queuedUP', 'pausedUP', 'stalledUP'].includes(state)) {
    return 'bg-green-500'
  }
  // Red: errors
  if (['error', 'missingFiles'].includes(state)) {
    return 'bg-red-500'
  }
  // Yellow: stalled downloading
  if (state === 'stalledDL') {
    return 'bg-yellow-500'
  }
  // Blue: downloading (default active)
  return 'bg-blue-500'
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
        <Progress value={torrent.progress * 100} className="h-3" indicatorClassName={getProgressColor(torrent.state)} />
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
  const { showSuccess, showError } = useToast()
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
      showSuccess('toast.success.addTag')
    },
    onError: (error: Error, tagName: string) => {
      showError('toast.error.addTag', {
        description: error.message,
        onRetry: () => addTagMutation.mutate(tagName),
      })
    },
  })

  // Remove tag mutation
  // TODO: Implement removeTorrentTags API function
  const removeTagMutation = useMutation({
    mutationFn: (_tagName: string) => Promise.reject(new Error('Not implemented')),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['maindata'] })
      showSuccess('toast.success.removeTag')
    },
    onError: (error: Error, tagName: string) => {
      showError('toast.error.removeTag', {
        description: error.message,
        onRetry: () => removeTagMutation.mutate(tagName),
      })
    },
  })

  const handleAddTag = (tag: Tag) => {
    addTagMutation.mutate(tag.name)
    setIsDropdownOpen(false)
  }

  const handleRemoveTag = (tagName: string) => {
    removeTagMutation.mutate(tagName)
  }

  return (
    <div className="relative" ref={containerRef}>
      <div className="flex items-start gap-3">
        <div className="text-slate-400 mt-0.5">
          <TagIcon className="h-4 w-4" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-xs text-slate-400 mb-2">
            {t('torrent.tags')}
          </div>
          <div className="flex flex-wrap gap-2 mb-2">
            {currentTagObjects.map((tag) => (
              <TagChip
                key={tag.name}
                tag={tag}
                onRemove={() => handleRemoveTag(tag.name)}
              />
            ))}
          </div>
          <Button
            size="sm"
            variant="outline"
            onClick={() => setIsDropdownOpen(!isDropdownOpen)}
            className="h-7 text-xs"
          >
            <Plus className="h-3 w-3 mr-1" />
            {t('common.add')}
          </Button>

          {/* Dropdown for unassigned tags */}
          {isDropdownOpen && unassignedTags.length > 0 && (
            <div className="absolute top-full mt-1 left-0 bg-slate-700 border border-slate-600 rounded-md shadow-lg z-10 w-48 max-h-48 overflow-y-auto">
              {unassignedTags.map((tag) => (
                <button
                  key={tag.name}
                  onClick={() => handleAddTag(tag)}
                  className="w-full text-left px-3 py-2 hover:bg-slate-600 text-sm text-white flex items-center gap-2 border-b border-slate-600 last:border-b-0"
                >
                  <div
                    className={`w-2 h-2 rounded-full ${getColorClass(tag.color)}`}
                  />
                  {tag.name}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function TrackerList({ hash, baseUrl }: { hash: string; baseUrl: string }) {
  const { t } = useTranslation()
  const { data: trackers, isLoading } = useQuery({
    queryKey: ['trackers', hash],
    queryFn: () => getTrackers(hash, baseUrl),
  })

  if (isLoading) {
    return (
      <div className="flex justify-center py-4">
        <Loader2 className="h-5 w-5 animate-spin text-slate-400" />
      </div>
    )
  }

  if (!trackers || trackers.length === 0) {
    return (
      <div className="text-center py-4 text-slate-400 text-sm">
        {t('common.noData')}
      </div>
    )
  }

  return (
    <div className="space-y-2">
      {trackers.map((tracker, index) => (
        <div key={index} className="bg-slate-800/30 rounded p-2 text-sm">
          <div className="flex items-center gap-2 mb-1">
            {getTrackerStatusIcon(tracker.status)}
            <span className="text-slate-300 flex-1">{tracker.url}</span>
          </div>
          <div className="text-xs text-slate-400 ml-6">
            {t(getTrackerStatusKey(tracker.status))}
          </div>
        </div>
      ))}
    </div>
  )
}