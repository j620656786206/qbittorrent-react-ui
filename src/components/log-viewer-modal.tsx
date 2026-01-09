import React from 'react'
import { useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { Download, Search } from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Checkbox } from '@/components/ui/checkbox'
import { LogType, getLogs } from '@/lib/api'

interface LogViewerModalProps {
  isOpen: boolean
  onClose: () => void
}

export function LogViewerModal({ isOpen, onClose }: LogViewerModalProps) {
  const { t } = useTranslation()

  // Filter state
  const [showNormal, setShowNormal] = React.useState(true)
  const [showInfo, setShowInfo] = React.useState(true)
  const [showWarning, setShowWarning] = React.useState(true)
  const [showCritical, setShowCritical] = React.useState(true)
  const [searchQuery, setSearchQuery] = React.useState('')
  const [autoScroll, setAutoScroll] = React.useState(true)

  // Ref for scrolling to bottom
  const scrollRef = React.useRef<HTMLDivElement>(null)

  // Helper to get baseUrl from localStorage
  const getBaseUrl = () =>
    localStorage.getItem('qbit_baseUrl') || 'http://localhost:8080'

  // Fetch logs with auto-refresh every 2 seconds
  const { data: logs, isLoading, error } = useQuery({
    queryKey: ['logs'],
    queryFn: () =>
      getLogs(getBaseUrl(), {
        normal: showNormal,
        info: showInfo,
        warning: showWarning,
        critical: showCritical,
      }),
    enabled: isOpen,
    refetchInterval: 2000, // Refresh every 2 seconds
  })

  // Auto-scroll to bottom when new logs arrive
  React.useEffect(() => {
    if (autoScroll && scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [logs, autoScroll])

  // Filter logs by search query
  const filteredLogs = React.useMemo(() => {
    if (!logs) return []
    if (!searchQuery.trim()) return logs

    const query = searchQuery.toLowerCase()
    return logs.filter((log) => log.message.toLowerCase().includes(query))
  }, [logs, searchQuery])

  // Get log level color class
  const getLogLevelColor = (type: number): string => {
    switch (type) {
      case LogType.Normal:
        return 'text-muted-foreground'
      case LogType.Info:
        return 'text-blue-500'
      case LogType.Warning:
        return 'text-yellow-500'
      case LogType.Critical:
        return 'text-red-500'
      default:
        return 'text-muted-foreground'
    }
  }

  // Get log level label
  const getLogLevelLabel = (type: number): string => {
    switch (type) {
      case LogType.Normal:
        return t('logViewer.levels.normal')
      case LogType.Info:
        return t('logViewer.levels.info')
      case LogType.Warning:
        return t('logViewer.levels.warning')
      case LogType.Critical:
        return t('logViewer.levels.critical')
      default:
        return 'UNKNOWN'
    }
  }

  // Format timestamp
  const formatTimestamp = (timestamp: number): string => {
    const date = new Date(timestamp)
    return date.toLocaleString()
  }

  // Export logs to text file
  const handleExport = () => {
    if (!logs || logs.length === 0) return

    const logText = logs
      .map((log) => {
        const timestamp = formatTimestamp(log.timestamp)
        const level = getLogLevelLabel(log.type)
        return `[${timestamp}] [${level}] ${log.message}`
      })
      .join('\n')

    const blob = new Blob([logText], { type: 'text/plain' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `qbittorrent-logs-${Date.now()}.txt`
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    URL.revokeObjectURL(url)
  }

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[800px] max-h-[80vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>{t('logViewer.title')}</DialogTitle>
          <DialogDescription>{t('logViewer.description')}</DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 py-4 flex-1 min-h-0">
          {/* Filters and Controls */}
          <div className="grid gap-4">
            {/* Log Level Filters */}
            <div className="grid gap-2">
              <Label>{t('logViewer.filters.label')}</Label>
              <div className="flex flex-wrap gap-4">
                <div className="flex items-center gap-2">
                  <Checkbox
                    id="filter-normal"
                    checked={showNormal}
                    onCheckedChange={(checked) =>
                      setShowNormal(checked === true)
                    }
                  />
                  <Label
                    htmlFor="filter-normal"
                    className="cursor-pointer font-normal"
                  >
                    {t('logViewer.levels.normal')}
                  </Label>
                </div>
                <div className="flex items-center gap-2">
                  <Checkbox
                    id="filter-info"
                    checked={showInfo}
                    onCheckedChange={(checked) =>
                      setShowInfo(checked === true)
                    }
                  />
                  <Label
                    htmlFor="filter-info"
                    className="cursor-pointer font-normal"
                  >
                    {t('logViewer.levels.info')}
                  </Label>
                </div>
                <div className="flex items-center gap-2">
                  <Checkbox
                    id="filter-warning"
                    checked={showWarning}
                    onCheckedChange={(checked) =>
                      setShowWarning(checked === true)
                    }
                  />
                  <Label
                    htmlFor="filter-warning"
                    className="cursor-pointer font-normal"
                  >
                    {t('logViewer.levels.warning')}
                  </Label>
                </div>
                <div className="flex items-center gap-2">
                  <Checkbox
                    id="filter-critical"
                    checked={showCritical}
                    onCheckedChange={(checked) =>
                      setShowCritical(checked === true)
                    }
                  />
                  <Label
                    htmlFor="filter-critical"
                    className="cursor-pointer font-normal"
                  >
                    {t('logViewer.levels.critical')}
                  </Label>
                </div>
              </div>
            </div>

            {/* Search and Controls */}
            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label htmlFor="search">{t('logViewer.search.label')}</Label>
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    id="search"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder={t('logViewer.search.placeholder')}
                    className="pl-9"
                  />
                </div>
              </div>
              <div className="grid gap-2">
                <Label className="invisible">Actions</Label>
                <div className="flex gap-2">
                  <div className="flex items-center gap-2 flex-1">
                    <Checkbox
                      id="auto-scroll"
                      checked={autoScroll}
                      onCheckedChange={(checked) =>
                        setAutoScroll(checked === true)
                      }
                    />
                    <Label
                      htmlFor="auto-scroll"
                      className="cursor-pointer font-normal"
                    >
                      {t('logViewer.autoScroll')}
                    </Label>
                  </div>
                  <Button
                    variant="outline"
                    size="default"
                    onClick={handleExport}
                    disabled={!logs || logs.length === 0}
                  >
                    <Download className="h-4 w-4 mr-2" />
                    {t('logViewer.export')}
                  </Button>
                </div>
              </div>
            </div>
          </div>

          {/* Log Display */}
          <div className="flex-1 min-h-0">
            <div
              ref={scrollRef}
              className="h-[400px] overflow-y-auto rounded-md border bg-muted/30 p-4 font-mono text-xs"
            >
              {isLoading && (
                <div className="text-muted-foreground">
                  {t('logViewer.loading')}
                </div>
              )}
              {error && (
                <div className="text-red-500">
                  {t('logViewer.error')}: {(error).message}
                </div>
              )}
              {!isLoading && !error && filteredLogs.length === 0 && (
                <div className="text-muted-foreground">
                  {t('logViewer.noLogs')}
                </div>
              )}
              {!isLoading &&
                !error &&
                filteredLogs.map((log) => (
                  <div key={log.id} className="mb-2 last:mb-0">
                    <span className="text-muted-foreground">
                      [{formatTimestamp(log.timestamp)}]
                    </span>{' '}
                    <span className={getLogLevelColor(log.type)}>
                      [{getLogLevelLabel(log.type).toUpperCase()}]
                    </span>{' '}
                    <span className="text-foreground">{log.message}</span>
                  </div>
                ))}
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
