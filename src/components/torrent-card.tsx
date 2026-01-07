import React, { useRef } from 'react'
import { useVirtualizer } from '@tanstack/react-virtual'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { Progress } from '@/components/ui/progress'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { MoreHorizontal, Download, Upload, Clock, HardDrive, Pause, Play, Trash2 } from 'lucide-react'
import { pauseTorrent, resumeTorrent, deleteTorrent } from '@/lib/api'
import type { Torrent } from '@/types/torrent'
import { Checkbox } from '@/components/ui/checkbox'
import { formatBytes, formatEta } from '@/lib/utils'

// Virtual scrolling configuration for card view
const ESTIMATED_CARD_HEIGHT = 180 // Estimated height for dynamic measurement
const CARD_OVERSCAN = 3 // Extra cards to render above/below viewport
const CARD_GAP = 12 // Gap between cards (matches gap-3 = 0.75rem = 12px)

// Helper to get status color
function getStatusColor(state: string) {
  const stateColors: Record<string, string> = {
    downloading: 'text-blue-400',
    uploading: 'text-green-400',
    stalledDL: 'text-yellow-400',
    stalledUP: 'text-yellow-400',
    pausedDL: 'text-gray-400',
    pausedUP: 'text-gray-400',
    checkingDL: 'text-purple-400',
    checkingUP: 'text-purple-400',
    queuedDL: 'text-cyan-400',
    queuedUP: 'text-cyan-400',
    error: 'text-red-400',
    missingFiles: 'text-red-400',
  }
  return stateColors[state] || 'text-gray-400'
}

// Helper to get state translation key
function getStateKey(state: string): string {
  return `torrent.status.${state}`
}

interface TorrentCardProps {
  torrent: Torrent
  onClick?: () => void
  isSelected?: boolean
  onToggleSelection?: () => void
  isBatchPending?: boolean
}

export function TorrentCard({ torrent, onClick, isSelected, onToggleSelection, isBatchPending = false }: TorrentCardProps) {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = React.useState(false)

  const getBaseUrl = () => localStorage.getItem('qbit_baseUrl') || 'http://localhost:8080'

  const pauseMutation = useMutation({
    mutationFn: (hash: string) => pauseTorrent(getBaseUrl(), hash),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['maindata'] })
    },
  })

  const resumeMutation = useMutation({
    mutationFn: (hash: string) => resumeTorrent(getBaseUrl(), hash),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['maindata'] })
    },
  })

  const deleteMutation = useMutation({
    mutationFn: ({ hash, deleteFiles }: { hash: string; deleteFiles: boolean }) =>
      deleteTorrent(getBaseUrl(), hash, deleteFiles),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['maindata'] })
      setIsDeleteDialogOpen(false)
    },
  })

  const isPaused = torrent.state.includes('paused')

  return (
    <div
      className={`bg-slate-800/50 rounded-lg p-4 border transition-all cursor-pointer ${
        isSelected
          ? 'border-blue-500/50 bg-blue-900/20 hover:border-blue-400/50'
          : 'border-slate-700/50 hover:border-slate-600/50'
      }`}
      onClick={onClick}
    >
      {/* Header: Checkbox, Name, and Actions */}
      <div className="flex items-start gap-3 mb-3">
        {/* Checkbox */}
        <div
          className="flex-shrink-0 pt-0.5"
          onClick={(e) => e.stopPropagation()}
        >
          <Checkbox
            checked={isSelected ?? false}
            onCheckedChange={() => onToggleSelection?.()}
            disabled={isBatchPending}
            aria-label={t('torrent.table.selectTorrent', { name: torrent.name })}
          />
        </div>
        {/* Name */}
        <h3 className="font-medium text-white line-clamp-2 flex-1 text-sm min-w-0">
          {torrent.name}
        </h3>
        {/* Actions */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
            <Button variant="ghost" size="icon" className="h-8 w-8 flex-shrink-0">
              <MoreHorizontal className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            {isPaused ? (
              <DropdownMenuItem onClick={(e) => {
                e.stopPropagation()
                resumeMutation.mutate(torrent.hash)
              }}>
                <Play className="h-4 w-4 mr-2" />
                {t('common.resume')}
              </DropdownMenuItem>
            ) : (
              <DropdownMenuItem onClick={(e) => {
                e.stopPropagation()
                pauseMutation.mutate(torrent.hash)
              }}>
                <Pause className="h-4 w-4 mr-2" />
                {t('common.pause')}
              </DropdownMenuItem>
            )}
            <DropdownMenuItem
              onClick={(e) => {
                e.stopPropagation()
                setIsDeleteDialogOpen(true)
              }}
              className="text-red-400"
            >
              <Trash2 className="h-4 w-4 mr-2" />
              {t('common.delete')}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {/* Progress Bar */}
      <div className="mb-3">
        <div className="flex items-center justify-between mb-1">
          <span className={`text-xs font-medium ${getStatusColor(torrent.state)}`}>
            {t(getStateKey(torrent.state))}
          </span>
          <span className="text-xs text-slate-400">
            {(torrent.progress * 100).toFixed(1)}%
          </span>
        </div>
        <Progress value={torrent.progress * 100} className="h-2" />
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-2 gap-2 text-xs">
        <div className="flex items-center gap-2 text-slate-400">
          <HardDrive className="h-3.5 w-3.5" />
          <span>{formatBytes(torrent.size)}</span>
        </div>
        <div className="flex items-center gap-2 text-slate-400">
          <Clock className="h-3.5 w-3.5" />
          <span>{formatEta(torrent.eta)}</span>
        </div>
        <div className="flex items-center gap-2 text-blue-400">
          <Download className="h-3.5 w-3.5" />
          <span>{formatBytes(torrent.dlspeed)}/s</span>
        </div>
        <div className="flex items-center gap-2 text-green-400">
          <Upload className="h-3.5 w-3.5" />
          <span>{formatBytes(torrent.upspeed)}/s</span>
        </div>
      </div>

      {/* Category Tag */}
      {torrent.category && (
        <div className="mt-3 pt-3 border-t border-slate-700/50">
          <span className="inline-block px-2 py-0.5 text-xs bg-slate-700/50 text-slate-300 rounded">
            {torrent.category}
          </span>
        </div>
      )}

      {/* Delete Dialog */}
      <AlertDialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
        <AlertDialogContent onClick={(e) => e.stopPropagation()}>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('torrent.actions.confirmDelete')}</AlertDialogTitle>
            <AlertDialogDescription
              dangerouslySetInnerHTML={{
                __html: t('torrent.actions.confirmDeleteMessage', { name: torrent.name })
              }}
            />
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('common.cancel')}</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.stopPropagation()
                deleteMutation.mutate({ hash: torrent.hash, deleteFiles: false })
              }}
            >
              {t('torrent.actions.deleteKeepFiles')}
            </AlertDialogAction>
            <AlertDialogAction
              className="bg-red-500 hover:bg-red-600"
              onClick={(e) => {
                e.stopPropagation()
                deleteMutation.mutate({ hash: torrent.hash, deleteFiles: true })
              }}
            >
              {t('torrent.actions.deleteRemoveFiles')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}

// Virtualized card list component for mobile view
interface VirtualizedTorrentCardListProps {
  torrents: Torrent[]
  onTorrentClick?: (torrent: Torrent) => void
  selectedHashes?: Set<string>
  toggleSelection?: (hash: string) => void
  isBatchPending?: boolean
}

export function VirtualizedTorrentCardList({
  torrents,
  onTorrentClick,
  selectedHashes,
  toggleSelection,
  isBatchPending = false,
}: VirtualizedTorrentCardListProps) {
  // Ref for virtual scroll container
  const parentRef = useRef<HTMLDivElement>(null)

  // Virtual scrolling for card view - renders only visible cards with dynamic height measurement
  const virtualizer = useVirtualizer({
    count: torrents.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => ESTIMATED_CARD_HEIGHT,
    overscan: CARD_OVERSCAN,
    gap: CARD_GAP,
  })

  return (
    <div
      ref={parentRef}
      className="h-full overflow-auto"
      style={{ contain: 'strict' }}
    >
      <div
        style={{
          height: `${virtualizer.getTotalSize()}px`,
          width: '100%',
          position: 'relative',
        }}
      >
        {virtualizer.getVirtualItems().map((virtualItem) => {
          const torrent = torrents[virtualItem.index]

          return (
            <div
              key={torrent.hash}
              ref={virtualizer.measureElement}
              data-index={virtualItem.index}
              style={{
                position: 'absolute',
                top: 0,
                left: 0,
                width: '100%',
                transform: `translateY(${virtualItem.start}px)`,
              }}
            >
              <TorrentCard
                torrent={torrent}
                onClick={() => onTorrentClick?.(torrent)}
                isSelected={selectedHashes?.has(torrent.hash)}
                onToggleSelection={() => toggleSelection?.(torrent.hash)}
                isBatchPending={isBatchPending}
              />
            </div>
          )
        })}
      </div>
    </div>
  )
}
