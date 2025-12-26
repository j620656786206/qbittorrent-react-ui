import React from 'react'
import { useTranslation } from 'react-i18next'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
import { Progress } from '@/components/ui/progress'
import { Button } from '@/components/ui/button'
import {
  Download,
  Upload,
  HardDrive,
  Clock,
  Calendar,
  Hash as HashIcon,
  FolderOpen,
  Pause,
  Play,
  Trash2,
} from 'lucide-react'
import { useMediaQuery } from '@/lib/hooks'
import type { Torrent } from '@/components/torrent-table'
import { TorrentFileList } from '@/components/TorrentFileList'

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

type TorrentDetailProps = {
  torrent: Torrent | null
  isOpen: boolean
  onClose: () => void
  onPause?: () => void
  onResume?: () => void
  onDelete?: () => void
  baseUrl?: string
}

export function TorrentDetail({
  torrent,
  isOpen,
  onClose,
  onPause,
  onResume,
  onDelete,
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
