import React, { useRef } from 'react'
import { useVirtualizer } from '@tanstack/react-virtual'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
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
import { MoreHorizontal, Download, Upload, Play, Pause, Trash2, RefreshCw } from 'lucide-react'
import { pauseTorrent, resumeTorrent, deleteTorrent, recheckTorrent } from '@/lib/api'
import { VirtualizedTorrentCardList } from '@/components/torrent-card'
import { useMediaQuery } from '@/lib/hooks'
import { Checkbox } from '@/components/ui/checkbox'
import { cn, formatBytes, formatEta } from '@/lib/utils'
import type { Torrent } from '@/types/torrent';

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

// Grid column template for consistent layout (mimics table column widths)
// Columns: checkbox(40px) | name(35%) | status(20%) | speed(15%) | stats(22%) | actions(8%)
const gridTemplateColumns = '40px minmax(200px, 35fr) minmax(160px, 20fr) minmax(110px, 15fr) minmax(180px, 22fr) minmax(60px, 8fr)'

// Virtual scrolling configuration
const ROW_HEIGHT = 50 // Fixed height for virtualization
const OVERSCAN = 5 // Extra rows to render above/below viewport for smooth scrolling

// Div-based table components for virtual scrolling compatibility
// Native <table> elements don't support CSS transform, which is required for virtualization

interface DivTableProps extends React.HTMLAttributes<HTMLDivElement> {
  children: React.ReactNode
}

function DivTable({ className, children, ...props }: DivTableProps) {
  return (
    <div
      data-slot="div-table"
      className={cn("relative w-full text-sm", className)}
      role="table"
      {...props}
    >
      {children}
    </div>
  )
}

function DivTableHeader({ className, children, ...props }: DivTableProps) {
  return (
    <div
      data-slot="div-table-header"
      className={cn("border-b", className)}
      role="rowgroup"
      {...props}
    >
      {children}
    </div>
  )
}

function DivTableBody({ className, children, ...props }: DivTableProps) {
  return (
    <div
      data-slot="div-table-body"
      className={cn("[&>[data-slot=div-table-row]:last-child]:border-0", className)}
      role="rowgroup"
      {...props}
    >
      {children}
    </div>
  )
}

interface DivTableRowProps extends React.HTMLAttributes<HTMLDivElement> {
  children: React.ReactNode
}

function DivTableRow({ className, children, style, ...props }: DivTableRowProps & { style?: React.CSSProperties }) {
  return (
    <div
      data-slot="div-table-row"
      className={cn(
        "grid border-b transition-colors",
        "hover:bg-muted/50 data-[state=selected]:bg-muted",
        className
      )}
      style={{ gridTemplateColumns, height: `${ROW_HEIGHT}px`, ...style }}
      role="row"
      {...props}
    >
      {children}
    </div>
  )
}

interface DivTableHeadProps extends React.HTMLAttributes<HTMLDivElement> {
  children?: React.ReactNode
}

function DivTableHead({ className, children, ...props }: DivTableHeadProps) {
  return (
    <div
      data-slot="div-table-head"
      className={cn(
        "text-foreground h-10 px-2 flex items-center font-medium whitespace-nowrap",
        "[&:has([role=checkbox])]:pr-0 [&>[role=checkbox]]:translate-y-[2px]",
        className
      )}
      role="columnheader"
      {...props}
    >
      {children}
    </div>
  )
}

interface DivTableCellProps extends React.HTMLAttributes<HTMLDivElement> {
  children?: React.ReactNode
}

function DivTableCell({ className, children, ...props }: DivTableCellProps) {
  return (
    <div
      data-slot="div-table-cell"
      className={cn(
        "p-2 flex items-center whitespace-nowrap",
        "[&:has([role=checkbox])]:pr-0 [&>[role=checkbox]]:translate-y-[2px]",
        className
      )}
      role="cell"
      {...props}
    >
      {children}
    </div>
  )
}

interface TorrentTableProps {
  torrents: Torrent[]
  onTorrentClick?: (torrent: Torrent) => void
  selectedHashes?: Set<string>
  toggleSelection?: (hash: string) => void
  selectAll?: () => void
  clearSelection?: () => void
  isBatchPending?: boolean
}

export function TorrentTable({
  torrents,
  onTorrentClick,
  selectedHashes,
  toggleSelection,
  selectAll,
  clearSelection,
  isBatchPending = false,
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

  const recheckMutation = useMutation({
    mutationFn: (hash: string) => recheckTorrent(getBaseUrl(), hash),
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

  // Ref for virtual scroll container
  const parentRef = useRef<HTMLDivElement>(null)

  // Virtual scrolling for table view - renders only visible rows
  const virtualizer = useVirtualizer({
    count: torrents.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => ROW_HEIGHT,
    overscan: OVERSCAN,
  })

  // Mobile card layout with virtualized scrolling
  if (isMobile) {
    return (
      <VirtualizedTorrentCardList
        torrents={torrents}
        onTorrentClick={onTorrentClick}
        selectedHashes={selectedHashes}
        toggleSelection={toggleSelection}
        isBatchPending={isBatchPending}
      />
    )
  }

  // Desktop table layout using div-based structure with virtual scrolling
  return (
    <div className="flex flex-col h-full">
      <DivTable>
        {/* Fixed header - always visible */}
        <DivTableHeader className="sticky top-0 z-10 bg-background">
          <DivTableRow style={{ height: 'auto' }}>
            <DivTableHead className="px-3">
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
                disabled={isBatchPending}
                aria-label={t('torrent.table.selectAll')}
              />
            </DivTableHead>
            <DivTableHead>{t('torrent.table.name')}</DivTableHead>
            <DivTableHead>{t('torrent.table.statusAndProgress')}</DivTableHead>
            <DivTableHead>{t('torrent.table.speed')}</DivTableHead>
            <DivTableHead>{t('torrent.table.stats')}</DivTableHead>
            <DivTableHead className="justify-end">{t('torrent.table.actions')}</DivTableHead>
          </DivTableRow>
        </DivTableHeader>
      </DivTable>

      {/* Virtualized scrollable body */}
      <div
        ref={parentRef}
        className="flex-1 overflow-auto"
        style={{ contain: 'strict' }}
      >
        <DivTable>
          <DivTableBody
            style={{
              height: `${virtualizer.getTotalSize()}px`,
              width: '100%',
              position: 'relative',
            }}
          >
            {virtualizer.getVirtualItems().map((virtualRow) => {
              const torrent = torrents[virtualRow.index]
              const isPaused = torrent.state.includes('paused')
              const isSelected = selectedHashes?.has(torrent.hash) ?? false

              return (
                <DivTableRow
                  key={torrent.hash}
                  className={cn(
                    "cursor-pointer hover:bg-slate-800/50",
                    isSelected && "bg-blue-900/30 hover:bg-blue-900/40"
                  )}
                  style={{
                    position: 'absolute',
                    top: 0,
                    left: 0,
                    width: '100%',
                    transform: `translateY(${virtualRow.start}px)`,
                  }}
                  onClick={() => onTorrentClick?.(torrent)}
                  data-state={isSelected ? "selected" : undefined}
                >
                  {/* Checkbox */}
                  <DivTableCell className="px-3" onClick={(e) => e.stopPropagation()}>
                    <Checkbox
                      checked={isSelected}
                      onCheckedChange={() => toggleSelection?.(torrent.hash)}
                      disabled={isBatchPending}
                      aria-label={t('torrent.table.selectTorrent', { name: torrent.name })}
                    />
                  </DivTableCell>

                  {/* Name + Category */}
                  <DivTableCell className="font-medium">
                    <div className="space-y-1 min-w-0 w-full">
                      <div className="truncate" title={torrent.name}>
                        {torrent.name}
                      </div>
                      {torrent.category && (
                        <span className="inline-block px-2 py-0.5 text-xs bg-slate-700/50 text-slate-300 rounded">
                          {torrent.category}
                        </span>
                      )}
                    </div>
                  </DivTableCell>

                  {/* Status + Progress */}
                  <DivTableCell>
                    <div className="space-y-1.5 w-full">
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
                  </DivTableCell>

                  {/* Speed */}
                  <DivTableCell>
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
                  </DivTableCell>

                  {/* Stats: Size, ETA, Ratio, Peers */}
                  <DivTableCell>
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
                  </DivTableCell>
                  <DivTableCell className="justify-end">
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
                        <DropdownMenuItem
                          onClick={(e) => {
                            e.stopPropagation()
                            recheckMutation.mutate(torrent.hash)
                          }}
                        >
                          <RefreshCw className="h-4 w-4 mr-2" />
                          {t('common.forceRecheck')}
                        </DropdownMenuItem>
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
                  </DivTableCell>
                </DivTableRow>
              )
            })}
          </DivTableBody>
        </DivTable>
      </div>
    </div>
  )
}
