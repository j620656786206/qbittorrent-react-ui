import React from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Button } from '@/components/ui/button'
import { Progress } from '@/components/ui/progress'
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
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog'
import { MoreHorizontal, Download, Upload, Play, Pause, Trash2 } from 'lucide-react'
import { pauseTorrent, resumeTorrent, deleteTorrent } from '@/lib/api'
import { TorrentCard } from '@/components/torrent-card'
import { useMediaQuery } from '@/lib/hooks'
import { Checkbox } from '@/components/ui/checkbox'

// A basic type for the torrent object, we can expand this later
export type Torrent = {
  added_on: number; // Unix timestamp
  amount_left: number; // bytes
  auto_tmm: boolean;
  availability: number; // eg. 0.0071655581634163
  category: string;
  comment: string;
  completed: number; // bytes
  completion_on: number; // Unix timestamp
  content_path: string;
  dl_limit: number; // bytes/s
  dlspeed: number; // bytes/s
  download_path: string;
  downloaded: number; // bytes
  downloaded_session: number; // bytes
  eta: number; // seconds (remaining time)
  f_l_piece_prio: boolean; // First Last Piece Priority
  force_start: boolean;
  has_metadata: boolean;
  hash: string;
  inactive_seeding_time_limit: number;
  infohash_v1: string;
  infohash_v2: string;
  last_activity: number; // Unix timestamp
  magnet_uri: string;
  max_inactive_seeding_time: number; // minutes, -1 for infinite
  max_ratio: number; // eg. -1 (infinite)
  max_seeding_time: number; // minutes, -1 for infinite
  name: string;
  num_complete: number; // number of seeds in the swarm
  num_incomplete: number; // number of leechers in the swarm
  num_leechs: number; // number of leechers connected to
  num_seeds: number; // number of seeds connected to
  popularity: number;
  priority: number;
  private: boolean;
  progress: number; // [0, 1]
  ratio: number;
  ratio_limit: number;
  reannounce: number; // seconds
  root_path: string;
  save_path: string;
  seeding_time: number; // seconds
  seeding_time_limit: number; // seconds, -2 for infinite
  seen_complete: number; // Unix timestamp
  seq_dl: boolean; // Sequential Download
  size: number; // bytes (total size of torrent)
  state: string; // e.g., "downloading", "uploading", "pausedDL", "missingFiles"
  super_seeding: boolean;
  tags: string;
  time_active: number; // seconds
  total_size: number; // bytes
  tracker: string;
  trackers_count: number;
  up_limit: number; // bytes/s
  uploaded: number; // bytes
  uploaded_session: number; // bytes
  upspeed: number; // bytes/s
};


// Helper function to format bytes into KB, MB, GB, etc.
function formatBytes(bytes: number, decimals = 2) {
  if (bytes === 0) return '0 B'
  const k = 1024
  const dm = decimals < 0 ? 0 : decimals
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i]
}

// Helper function to format ETA
function formatEta(seconds: number) {
  if (seconds < 0 || seconds === 8640000) return '∞'
  if (seconds === 0) return '-'

  const days = Math.floor(seconds / 86400)
  const hours = Math.floor((seconds % 86400) / 3600)
  const minutes = Math.floor((seconds % 3600) / 60)

  if (days > 0) return `${days}d ${hours}h`
  if (hours > 0) return `${hours}h ${minutes}m`
  return `${minutes}m`
}

// Helper to get state translation key
function getStateKey(state: string): string {
  return `torrent.status.${state}`
}

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

interface TorrentTableProps {
  torrents: Torrent[]
  onTorrentClick?: (torrent: Torrent) => void
  selectedHashes?: Set<string>
  toggleSelection?: (hash: string) => void
  selectAll?: () => void
  clearSelection?: () => void
}

export function TorrentTable({
  torrents,
  onTorrentClick,
  selectedHashes,
  toggleSelection,
  selectAll,
  clearSelection,
}: TorrentTableProps) {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const isMobile = !useMediaQuery('(min-width: 768px)') // md breakpoint

  // Helper to get baseUrl from localStorage
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
    },
  })

  // Mobile card layout
  if (isMobile) {
    return (
      <div className="grid gap-3">
        {torrents.map((torrent) => (
          <TorrentCard
            key={torrent.hash}
            torrent={torrent}
            onClick={() => onTorrentClick?.(torrent)}
            isSelected={selectedHashes?.has(torrent.hash)}
            onToggleSelection={() => toggleSelection?.(torrent.hash)}
          />
        ))}
      </div>
    )
  }

  // Desktop table layout
  return (
    <div className="overflow-x-auto">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-10 px-3">
              <Checkbox
                checked={
                  selectedHashes && torrents.length > 0
                    ? selectedHashes.size === torrents.length
                      ? true
                      : selectedHashes.size > 0
                        ? "indeterminate"
                        : false
                    : false
                }
                onCheckedChange={() => {
                  if (selectedHashes && selectedHashes.size === torrents.length) {
                    clearSelection?.()
                  } else {
                    selectAll?.()
                  }
                }}
                aria-label={t('torrent.table.selectAll')}
              />
            </TableHead>
            <TableHead className="w-[35%] min-w-[200px]">{t('torrent.table.name')}</TableHead>
            <TableHead className="w-[20%] min-w-[160px]">{t('torrent.table.statusAndProgress')}</TableHead>
            <TableHead className="w-[15%] min-w-[110px]">{t('torrent.table.speed')}</TableHead>
            <TableHead className="w-[22%] min-w-[180px]">{t('torrent.table.stats')}</TableHead>
            <TableHead className="w-[8%] text-right">{t('torrent.table.actions')}</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {torrents.map((torrent) => {
            const isPaused = torrent.state.includes('paused')
            const isSelected = selectedHashes?.has(torrent.hash) ?? false

            return (
              <TableRow
                key={torrent.hash}
                className={`cursor-pointer hover:bg-slate-800/50 transition-colors ${
                  isSelected ? 'bg-blue-900/30 hover:bg-blue-900/40' : ''
                }`}
                onClick={() => onTorrentClick?.(torrent)}
              >
                {/* Checkbox */}
                <TableCell className="w-10 px-3" onClick={(e) => e.stopPropagation()}>
                  <Checkbox
                    checked={isSelected}
                    onCheckedChange={() => toggleSelection?.(torrent.hash)}
                    aria-label={t('torrent.table.selectTorrent', { name: torrent.name })}
                  />
                </TableCell>

                {/* Name + Category */}
                <TableCell className="font-medium">
                  <div className="space-y-1">
                    <div className="truncate max-w-full" title={torrent.name}>
                      {torrent.name}
                    </div>
                    {torrent.category && (
                      <span className="inline-block px-2 py-0.5 text-xs bg-slate-700/50 text-slate-300 rounded">
                        {torrent.category}
                      </span>
                    )}
                  </div>
                </TableCell>

                {/* Status + Progress */}
                <TableCell>
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between text-xs">
                      <span className={`font-medium ${getStatusColor(torrent.state)}`}>
                        {t(getStateKey(torrent.state))}
                      </span>
                      <span className="text-slate-400">
                        {(torrent.progress * 100).toFixed(1)}%
                      </span>
                    </div>
                    <Progress value={torrent.progress * 100} className="h-1.5" />
                  </div>
                </TableCell>

                {/* Speed */}
                <TableCell>
                  <div className="flex flex-col gap-0.5 text-xs">
                    <div className="flex items-center gap-1 text-blue-400">
                      <Download className="h-3 w-3" />
                      <span>{formatBytes(torrent.dlspeed)}/s</span>
                    </div>
                    <div className="flex items-center gap-1 text-green-400">
                      <Upload className="h-3 w-3" />
                      <span>{formatBytes(torrent.upspeed)}/s</span>
                    </div>
                  </div>
                </TableCell>

                {/* Stats: Size, ETA, Ratio, Peers */}
                <TableCell>
                  <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-xs">
                    <div className="flex items-center gap-1 text-slate-400">
                      <span className="text-slate-500">{t('torrent.table.size')}:</span>
                      <span>{formatBytes(torrent.size)}</span>
                    </div>
                    <div className="flex items-center gap-1 text-slate-400">
                      <span className="text-slate-500">{t('torrent.table.eta')}:</span>
                      <span>{formatEta(torrent.eta)}</span>
                    </div>
                    <div className="flex items-center gap-1 text-slate-400">
                      <span className="text-slate-500">{t('torrent.table.ratio')}:</span>
                      <span className={torrent.ratio >= 1 ? 'text-green-400' : ''}>
                        {torrent.ratio.toFixed(2)}
                      </span>
                    </div>
                    <div className="flex items-center gap-1 text-slate-400">
                      <span className="text-slate-500">{t('torrent.table.peers')}:</span>
                      <span>{torrent.num_seeds}↑ / {torrent.num_leechs}↓</span>
                    </div>
                  </div>
                </TableCell>
                <TableCell className="text-right">
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
                      <Button variant="ghost" size="icon" className="h-8 w-8">
                        <MoreHorizontal className="h-4 w-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      {isPaused ? (
                        <DropdownMenuItem
                          onClick={(e) => {
                            e.stopPropagation()
                            resumeMutation.mutate(torrent.hash)
                          }}
                        >
                          <Play className="h-4 w-4 mr-2" />
                          {t('common.resume')}
                        </DropdownMenuItem>
                      ) : (
                        <DropdownMenuItem
                          onClick={(e) => {
                            e.stopPropagation()
                            pauseMutation.mutate(torrent.hash)
                          }}
                        >
                          <Pause className="h-4 w-4 mr-2" />
                          {t('common.pause')}
                        </DropdownMenuItem>
                      )}
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <DropdownMenuItem
                            onSelect={(e) => e.preventDefault()}
                            className="text-red-400"
                          >
                            <Trash2 className="h-4 w-4 mr-2" />
                            {t('common.delete')}
                          </DropdownMenuItem>
                        </AlertDialogTrigger>
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
                    </DropdownMenuContent>
                  </DropdownMenu>
                </TableCell>
              </TableRow>
            )
          })}
        </TableBody>
      </Table>
    </div>
  )
}