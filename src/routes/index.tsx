import React from 'react'
import { createFileRoute } from '@tanstack/react-router'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'

import { Menu, Search, X } from 'lucide-react' // Import Menu, Search, X icons
import { useTranslation } from 'react-i18next'
import type { Torrent } from '@/types/torrent'
import { parseTagString } from '@/lib/tag-storage'
import { Sidebar } from '@/components/sidebar'
import { TorrentTable } from '@/components/torrent-table'
import { TorrentDetail } from '@/components/torrent-detail'
import { BatchActionsToolbar } from '@/components/batch-actions-toolbar'
import { LoadingSkeleton } from '@/components/loading-skeleton'
import {
  deleteTorrent,
  getCategories,
  getMaindata,
  login,
  pauseTorrent,
  recheckTorrent,
  resumeTorrent,
  setTorrentCategory,
} from '@/lib/api'
import { SettingsModal } from '@/components/settings-modal'
import { AddTorrentModal } from '@/components/add-torrent-modal'
import { LogViewerModal } from '@/components/log-viewer-modal'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { LoginForm } from '@/components/login-form'
import { useMediaQuery } from '@/lib/hooks' // Import the new hook
import { useKeyboardShortcuts } from '@/lib/use-keyboard-shortcuts'
import { KeyboardHelpModal } from '@/components/keyboard-help-modal'
import { useDragAndDrop } from '@/lib/use-drag-drop'
import { DropZoneOverlay } from '@/components/drop-zone-overlay'
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

type Filter = string // Changed from TorrentState to string as TorrentState came from @ctrl/qbittorrent

export const Route = createFileRoute('/')({ component: HomePage })

function HomePage() {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const [filter, setFilter] = React.useState<Filter>('all')
  const [searchQuery, setSearchQuery] = React.useState('')
  const [isSettingsModalOpen, setIsSettingsModalOpen] = React.useState(false)
  const [isAddTorrentOpen, setIsAddTorrentOpen] = React.useState(false)
  const [isLogViewerOpen, setIsLogViewerOpen] = React.useState(false)
  const [selectedTorrent, setSelectedTorrent] = React.useState<Torrent | null>(
    null,
  )

  const isDesktop = useMediaQuery('(min-width: 768px)') // md breakpoint
  const [isMobileSidebarOpen, setIsMobileSidebarOpen] = React.useState(false)

  // --- Selection State for Bulk Operations ---
  const [selectedHashes, setSelectedHashes] = React.useState<Set<string>>(
    new Set(),
  )
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = React.useState(false)
  const [_batchError, setBatchError] = React.useState<string | null>(null)

  // --- Keyboard Navigation State ---
  const [focusedIndex, setFocusedIndex] = React.useState<number | null>(null)
  const [isKeyboardHelpOpen, setIsKeyboardHelpOpen] = React.useState(false)

  // --- Drag and Drop State ---
  const [droppedFiles, setDroppedFiles] = React.useState<Array<File>>([])
  const [pastedMagnet, setPastedMagnet] = React.useState<string | null>(null)
  const [initialQueueSize, setInitialQueueSize] = React.useState(0)

  // Handle drag-and-drop file uploads
  const { isDragging } = useDragAndDrop({
    onDrop: (files) => {
      // Add dropped files to the queue
      setDroppedFiles((prev) => {
        const newQueue = [...prev, ...files]
        // Set initial queue size if this is the first batch of files
        if (prev.length === 0) {
          setInitialQueueSize(newQueue.length)
        }
        return newQueue
      })
    },
  })

  // Handle paste events for magnet links
  React.useEffect(() => {
    const handlePaste = (event: ClipboardEvent) => {
      // Don't interfere when focus is on input/textarea/contenteditable elements
      const target = event.target as HTMLElement
      if (
        target.tagName === 'INPUT' ||
        target.tagName === 'TEXTAREA' ||
        target.isContentEditable
      ) {
        return
      }

      // Get clipboard text
      const clipboardText = event.clipboardData?.getData('text/plain')
      if (!clipboardText) return

      // Check if it's a magnet link
      const trimmedText = clipboardText.trim()
      if (trimmedText.startsWith('magnet:?')) {
        event.preventDefault()
        setPastedMagnet(trimmedText)
      }
    }

    // Add paste event listener
    document.addEventListener('paste', handlePaste)

    // Cleanup
    return () => {
      document.removeEventListener('paste', handlePaste)
    }
  }, [])

  // Auto-open AddTorrentModal when files are dropped or magnet pasted
  React.useEffect(() => {
    if ((droppedFiles.length > 0 || pastedMagnet) && !isAddTorrentOpen) {
      setIsAddTorrentOpen(true)
    }
  }, [droppedFiles, pastedMagnet, isAddTorrentOpen])

  // Handle AddTorrentModal close - process next file in queue or clear magnet
  const handleAddTorrentClose = React.useCallback(() => {
    setIsAddTorrentOpen(false)

    // Clear pasted magnet link if present
    if (pastedMagnet) {
      setPastedMagnet(null)
    }

    // Remove the first file from the queue (the one we just processed)
    setDroppedFiles((prev) => {
      const newQueue = prev.slice(1)
      // Reset initial queue size when queue is empty
      if (newQueue.length === 0) {
        setInitialQueueSize(0)
      }
      return newQueue
    })
  }, [pastedMagnet])

  // Selection helper functions
  const toggleSelection = React.useCallback((hash: string) => {
    setSelectedHashes((prev) => {
      const next = new Set(prev)
      if (next.has(hash)) {
        next.delete(hash)
      } else {
        next.add(hash)
      }
      return next
    })
  }, [])

  const selectAll = React.useCallback((torrents: Array<Torrent>) => {
    setSelectedHashes(new Set(torrents.map((torrent) => torrent.hash)))
  }, [])

  const clearSelection = React.useCallback(() => {
    setSelectedHashes(new Set())
  }, [])

  const getBaseUrl = () =>
    credentials.baseUrl ||
    localStorage.getItem('qbit_baseUrl') ||
    'http://localhost:8080'

  // --- State for sync/maindata ---
  const [_rid, setRid] = React.useState<number | undefined>(undefined)
  const [allTorrentsMap, setAllTorrentsMap] = React.useState<
    Map<string, Torrent>
  >(new Map()) // Store torrents as a Map for efficient updates

  // --- Step 1: Handle Credentials ---
  const credentials = {
    baseUrl:
      import.meta.env.VITE_QBIT_BASE_URL ||
      localStorage.getItem('qbit_baseUrl') ||
      window.location.origin,
    username:
      import.meta.env.VITE_QBIT_USERNAME ||
      localStorage.getItem('qbit_username') ||
      '',
    password:
      import.meta.env.VITE_QBIT_PASSWORD ||
      localStorage.getItem('qbit_password') ||
      '',
  }

  const areCredentialsSet = !!(credentials.username && credentials.password)

  // --- Step 2: Login Query ---
  const {
    isSuccess: loginSuccess,
    isError: isLoginError,
    error: loginError,
    isLoading: isLoggingIn,
  } = useQuery({
    queryKey: [
      'login',
      credentials.baseUrl,
      localStorage.getItem('qbit_username'),
    ],
    queryFn: () =>
      login(
        credentials.baseUrl,
        localStorage.getItem('qbit_username') || '',
        localStorage.getItem('qbit_password') || '',
      ),
    staleTime: Infinity,
    retry: 1,
    enabled: areCredentialsSet,
  })

  // --- Step 3: Maindata Query ---
  const ridRef = React.useRef<number | undefined>(undefined)

  const {
    data: maindata,
    isLoading: isLoadingTorrents,
    isError: isMaindataError,
    error: maindataError,
  } = useQuery({
    queryKey: ['maindata'], // Single query key, rid is managed internally
    queryFn: async () => {
      const response = await getMaindata(credentials.baseUrl, ridRef.current)
      ridRef.current = response.rid // Update ref immediately
      return response
    },
    refetchInterval: 5000,
    enabled: loginSuccess, // Only enabled if logged in
  })

  // Process maindata response using useEffect
  React.useEffect(() => {
    if (!maindata) {
      return
    }

    // Update rid state for display purposes
    setRid(maindata.rid)

    // Update torrents map
    if (maindata.full_update) {
      // Full update: replace all torrents
      const newMap = new Map<string, Torrent>()
      if (maindata.torrents) {
        Object.entries(maindata.torrents).forEach(([hash, torrentData]) => {
          newMap.set(hash, { ...torrentData, hash } as Torrent)
        })
      }
      setAllTorrentsMap(newMap)
    } else {
      // Incremental update: merge changes
      setAllTorrentsMap((prevMap) => {
        const newMap = new Map(prevMap)

        // Add or update torrents
        if (maindata.torrents) {
          Object.entries(maindata.torrents).forEach(([hash, torrentData]) => {
            const existing = newMap.get(hash)
            newMap.set(hash, { ...existing, ...torrentData, hash } as Torrent)
          })
        }

        // Remove deleted torrents
        if (maindata.torrents_removed) {
          maindata.torrents_removed.forEach((hash) => {
            newMap.delete(hash)
          })
        }

        return newMap
      })
    }
  }, [maindata])

  // --- Categories Query ---
  const { data: categoriesData } = useQuery({
    queryKey: ['categories'],
    queryFn: () => getCategories(credentials.baseUrl),
    enabled: loginSuccess,
    staleTime: 30000, // Refresh every 30 seconds
  })

  // Extract category names from the response
  const categoryNames = React.useMemo(() => {
    if (!categoriesData) return []
    return Object.keys(categoriesData)
  }, [categoriesData])

  // --- Step 4: Client-side Filtering ---
  const allTorrents = React.useMemo(() => {
    return Array.from(allTorrentsMap.values())
  }, [allTorrentsMap])

  const filteredTorrents = React.useMemo(() => {
    // First, apply search filter
    const trimmedSearch = searchQuery.trim().toLowerCase()
    let result = allTorrents

    if (trimmedSearch) {
      result = result.filter((torrent: Torrent) =>
        torrent.name.toLowerCase().includes(trimmedSearch),
      )
    }

    // Then, apply status/category filter
    if (filter === 'all') return result

    // Category filter
    if (filter.startsWith('category:')) {
      const category = filter.substring(9) // Remove 'category:' prefix
      return result.filter((torrent: Torrent) => {
        const torrentCategory = torrent.category || '未分類'
        return torrentCategory === category
      })
    }

    // Tag filter (supports multi-tag with OR logic)
    if (filter.startsWith('tag:')) {
      const tagNames = filter
        .substring(4)
        .split(',')
        .map((tagStr) => tagStr.trim().toLowerCase())
      return result.filter((torrent: Torrent) => {
        const torrentTags = parseTagString(torrent.tags || '').map((tag) =>
          tag.toLowerCase(),
        )
        // OR logic: show torrents with ANY of the selected tags
        return tagNames.some((tagName) => torrentTags.includes(tagName))
      })
    }

    // Status filter
    return result.filter((torrent: Torrent) => torrent.state === filter)
  }, [allTorrents, filter, searchQuery])

  // --- Clear selections that are no longer visible when filter/search changes ---
  const prevFilterRef = React.useRef<string>(filter)
  const prevSearchRef = React.useRef<string>(searchQuery)

  React.useEffect(() => {
    // Only run when filter or search actually changes
    if (
      prevFilterRef.current !== filter ||
      prevSearchRef.current !== searchQuery
    ) {
      prevFilterRef.current = filter
      prevSearchRef.current = searchQuery

      // Clear selections for torrents that are no longer visible
      if (selectedHashes.size > 0) {
        const visibleHashes = new Set(
          filteredTorrents.map((torrent) => torrent.hash),
        )
        const newSelectedHashes = new Set<string>()

        selectedHashes.forEach((hash) => {
          if (visibleHashes.has(hash)) {
            newSelectedHashes.add(hash)
          }
        })

        // Only update if selections changed
        if (newSelectedHashes.size !== selectedHashes.size) {
          setSelectedHashes(newSelectedHashes)
        }
      }
    }
  }, [filter, searchQuery, filteredTorrents, selectedHashes])

  const handleSettingsSave = () => {
    queryClient.invalidateQueries({ queryKey: ['login'] })
    queryClient.invalidateQueries({ queryKey: ['maindata'] }) // Invalidate maindata query too
    ridRef.current = undefined // Reset ridRef to force a full update on next fetch
    setRid(undefined) // Reset rid state
    setAllTorrentsMap(new Map()) // Clear torrents data
  }

  const handleLoginSuccess = () => {
    setIsSettingsModalOpen(false)
    // After successful login, ensure maindata query is re-enabled and potentially refetched
    queryClient.invalidateQueries({ queryKey: ['maindata'] })
  }

  // Mutations for torrent actions
  const pauseMutation = useMutation({
    mutationFn: (hash: string) => pauseTorrent(getBaseUrl(), hash),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['maindata'] })
      toast.success(t('toast.torrent.pauseSuccess'))
    },
    onError: (error: Error) => {
      toast.error(t('toast.torrent.pauseError'), {
        description: error.message,
      })
    },
  })

  const resumeMutation = useMutation({
    mutationFn: (hash: string) => resumeTorrent(getBaseUrl(), hash),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['maindata'] })
      toast.success(t('toast.torrent.resumeSuccess'))
    },
    onError: (error: Error) => {
      toast.error(t('toast.torrent.resumeError'), {
        description: error.message,
      })
    },
  })

  const recheckMutation = useMutation({
    mutationFn: (hash: string) => recheckTorrent(getBaseUrl(), hash),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['maindata'] })
      toast.success(t('toast.torrent.recheckSuccess'))
    },
    onError: (error: Error) => {
      toast.error(t('toast.torrent.recheckError'), {
        description: error.message,
      })
    },
  })

  const deleteMutation = useMutation({
    mutationFn: ({
      hash,
      deleteFiles,
    }: {
      hash: string
      deleteFiles: boolean
    }) => deleteTorrent(getBaseUrl(), hash, deleteFiles),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['maindata'] })
      setSelectedTorrent(null)
      toast.success(t('toast.torrent.deleteSuccess'))
    },
    onError: (error: Error) => {
      toast.error(t('toast.torrent.deleteError'), {
        description: error.message,
      })
    },
  })

  // --- Batch Mutations for Bulk Operations ---
  const batchPauseMutation = useMutation({
    mutationFn: (hashes: Array<string>) => pauseTorrent(getBaseUrl(), hashes),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['maindata'] })
      clearSelection()
      setBatchError(null)
    },
    onError: (error: Error) => {
      setBatchError(t('batch.error.pause', { message: error.message }))
    },
  })

  const batchResumeMutation = useMutation({
    mutationFn: (hashes: Array<string>) => resumeTorrent(getBaseUrl(), hashes),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['maindata'] })
      clearSelection()
      setBatchError(null)
    },
    onError: (error: Error) => {
      setBatchError(t('batch.error.resume', { message: error.message }))
    },
  })

  const batchRecheckMutation = useMutation({
    mutationFn: (hashes: Array<string>) => recheckTorrent(getBaseUrl(), hashes),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['maindata'] })
      clearSelection()
      setBatchError(null)
    },
    onError: (error: Error) => {
      setBatchError(t('batch.error.recheck', { message: error.message }))
    },
  })

  const batchDeleteMutation = useMutation({
    mutationFn: ({
      hashes,
      deleteFiles,
    }: {
      hashes: Array<string>
      deleteFiles: boolean
    }) => deleteTorrent(getBaseUrl(), hashes, deleteFiles),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['maindata'] })
      clearSelection()
      setIsDeleteDialogOpen(false)
      setBatchError(null)
    },
    onError: (error: Error) => {
      setIsDeleteDialogOpen(false)
      setBatchError(t('batch.error.delete', { message: error.message }))
    },
  })

  const batchSetCategoryMutation = useMutation({
    mutationFn: ({
      hashes,
      category,
    }: {
      hashes: Array<string>
      category: string
    }) => setTorrentCategory(getBaseUrl(), hashes, category),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['maindata'] })
      clearSelection()
      setBatchError(null)
    },
    onError: (error: Error) => {
      setBatchError(t('batch.error.category', { message: error.message }))
    },
  })

  // --- Keyboard Shortcuts Integration ---
  useKeyboardShortcuts({
    // Space: Toggle pause/resume on selected torrents
    onSpace: React.useCallback(() => {
      if (selectedHashes.size === 0) return

      // Get selected torrents
      const selectedTorrents = filteredTorrents.filter((torrent) =>
        selectedHashes.has(torrent.hash),
      )

      // Check if all selected torrents are paused
      const allPaused = selectedTorrents.every(
        (torrent) => torrent.state === 'pausedUP' || torrent.state === 'pausedDL',
      )

      // If all are paused, resume them; otherwise pause them
      if (allPaused) {
        batchResumeMutation.mutate(Array.from(selectedHashes))
      } else {
        batchPauseMutation.mutate(Array.from(selectedHashes))
      }
    }, [selectedHashes, filteredTorrents, batchResumeMutation, batchPauseMutation]),

    // Delete: Open delete confirmation dialog
    onDelete: React.useCallback(() => {
      if (selectedHashes.size > 0) {
        setIsDeleteDialogOpen(true)
      }
    }, [selectedHashes]),

    // Ctrl/Cmd+A: Select all visible torrents
    onSelectAll: React.useCallback(() => {
      selectAll(filteredTorrents)
    }, [selectAll, filteredTorrents]),

    // Escape: Clear selection
    onEscape: React.useCallback(() => {
      clearSelection()
    }, [clearSelection]),

    // Arrow Up: Navigate to previous torrent
    onArrowUp: React.useCallback(() => {
      if (filteredTorrents.length === 0) return

      setFocusedIndex((prev) => {
        if (prev === null || prev === 0) {
          // Wrap to last item
          return filteredTorrents.length - 1
        }
        return prev - 1
      })
    }, [filteredTorrents]),

    // Arrow Down: Navigate to next torrent
    onArrowDown: React.useCallback(() => {
      if (filteredTorrents.length === 0) return

      setFocusedIndex((prev) => {
        if (prev === null || prev === filteredTorrents.length - 1) {
          // Wrap to first item
          return 0
        }
        return prev + 1
      })
    }, [filteredTorrents]),

    // Enter: Toggle selection of focused torrent
    onEnter: React.useCallback(() => {
      if (focusedIndex !== null && filteredTorrents[focusedIndex]) {
        toggleSelection(filteredTorrents[focusedIndex].hash)
      }
    }, [focusedIndex, filteredTorrents, toggleSelection]),

    // F1: Open keyboard help modal
    onF1: React.useCallback(() => {
      setIsKeyboardHelpOpen(true)
    }, []),

    // L: Open log viewer modal
    onL: React.useCallback(() => {
      setIsLogViewerOpen(true)
    }, []),
  })

  // Auto-close delete dialog when deletion is complete
  React.useEffect(() => {
    if (batchDeleteMutation.isSuccess) {
      setIsDeleteDialogOpen(false)
    }
  }, [batchDeleteMutation.isSuccess])

  // Handle individual torrent action
  const handleTorrentAction = React.useCallback(
    (
      action: 'pause' | 'resume' | 'recheck' | 'delete',
      hash: string,
      deleteFiles?: boolean,
    ) => {
      switch (action) {
        case 'pause':
          pauseMutation.mutate(hash)
          break
        case 'resume':
          resumeMutation.mutate(hash)
          break
        case 'recheck':
          recheckMutation.mutate(hash)
          break
        case 'delete':
          deleteMutation.mutate({ hash, deleteFiles: deleteFiles || false })
          break
      }
    },
    [pauseMutation, resumeMutation, recheckMutation, deleteMutation],
  )

  // Handle batch torrent action
  const handleBatchAction = React.useCallback(
    (
      action: 'pause' | 'resume' | 'recheck' | 'delete' | 'category',
      hashes: Array<string>,
      options?: { deleteFiles?: boolean; category?: string },
    ) => {
      switch (action) {
        case 'pause':
          batchPauseMutation.mutate(hashes)
          break
        case 'resume':
          batchResumeMutation.mutate(hashes)
          break
        case 'recheck':
          batchRecheckMutation.mutate(hashes)
          break
        case 'delete':
          batchDeleteMutation.mutate({
            hashes,
            deleteFiles: options?.deleteFiles || false,
          })
          break
        case 'category':
          if (options?.category) {
            batchSetCategoryMutation.mutate({
              hashes,
              category: options.category,
            })
          }
          break
      }
    },
    [
      batchPauseMutation,
      batchResumeMutation,
      batchRecheckMutation,
      batchDeleteMutation,
      batchSetCategoryMutation,
    ],
  )

  if (!areCredentialsSet) {
    return (
      <div className="flex h-screen items-center justify-center">
        <SettingsModal
          isOpen={true}
          onClose={() => {}}
          categories={categoryNames}
        />
      </div>
    )
  }

  if (isLoggingIn) {
    return (
      <div className="flex h-screen items-center justify-center">
        <LoadingSkeleton />
      </div>
    )
  }

  if (isLoginError) {
    return (
      <div className="flex h-screen flex-col items-center justify-center gap-4">
        <div className="text-center">
          <h1 className="mb-2 text-2xl font-bold">{t('login.failed')}</h1>
          <p className="mb-4 text-gray-600">
            {loginError?.message || t('login.unknownError')}
          </p>
        </div>
        <Button onClick={() => setIsSettingsModalOpen(true)}>
          {t('login.settings')}
        </Button>
        <SettingsModal
          isOpen={isSettingsModalOpen}
          onClose={() => setIsSettingsModalOpen(false)}
          onLoginSuccess={handleLoginSuccess}
          categories={categoryNames}
        />
      </div>
    )
  }

  if (!loginSuccess) {
    return (
      <div className="flex h-screen items-center justify-center">
        <LoginForm
          onSuccess={() => {
            queryClient.invalidateQueries({ queryKey: ['maindata'] })
          }}
        />
      </div>
    )
  }

  return (
    <div className="flex h-screen overflow-hidden bg-background">
      {/* Desktop Sidebar */}
      {isDesktop && (
        <Sidebar
          filter={filter}
          setFilter={setFilter}
          categories={categoryNames}
          selectedCount={selectedHashes.size}
          onOpenSettings={() => setIsSettingsModalOpen(true)}
          onOpenLogViewer={() => setIsLogViewerOpen(true)}
        />
      )}

      {/* Mobile Sidebar */}
      {!isDesktop && isMobileSidebarOpen && (
        <Sidebar
          filter={filter}
          setFilter={setFilter}
          categories={categoryNames}
          selectedCount={selectedHashes.size}
          onOpenSettings={() => setIsSettingsModalOpen(true)}
          onOpenLogViewer={() => setIsLogViewerOpen(true)}
        />
      )}

      {/* Drop Zone Overlay */}
      {isDragging && <DropZoneOverlay />}

      {/* Main Content */}
      <div className="flex flex-1 flex-col overflow-hidden">
        {/* Header */}
        <div className="border-b bg-card">
          <div className="flex items-center gap-2 p-4">
            {!isDesktop && (
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setIsMobileSidebarOpen(!isMobileSidebarOpen)}
              >
                <Menu className="h-6 w-6" />
              </Button>
            )}

            <Input
              type="text"
              placeholder={t('search.placeholder')}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="flex-1"
              icon={<Search className="h-4 w-4 text-muted-foreground" />}
              clearIcon={
                searchQuery && (
                  <button onClick={() => setSearchQuery('')}>
                    <X className="h-4 w-4 text-muted-foreground" />
                  </button>
                )
              }
            />
          </div>
        </div>

        {/* Batch Actions Toolbar */}
        {selectedHashes.size > 0 && (
          <BatchActionsToolbar
            selectedCount={selectedHashes.size}
            totalCount={filteredTorrents.length}
            onSelectAll={() => selectAll(filteredTorrents)}
            onClearSelection={clearSelection}
            onPause={() =>
              handleBatchAction('pause', Array.from(selectedHashes))
            }
            onResume={() =>
              handleBatchAction('resume', Array.from(selectedHashes))
            }
            onRecheck={() =>
              handleBatchAction('recheck', Array.from(selectedHashes))
            }
            onDelete={() => setIsDeleteDialogOpen(true)}
            categories={categoryNames}
            onSetCategory={(category) =>
              handleBatchAction('category', Array.from(selectedHashes), {
                category,
              })
            }
            onError={_batchError}
            isLoading={
              batchPauseMutation.isPending ||
              batchResumeMutation.isPending ||
              batchRecheckMutation.isPending ||
              batchDeleteMutation.isPending
            }
          />
        )}

        {/* Torrents Table */}
        <div className="flex-1 overflow-auto">
          {isLoadingTorrents && filteredTorrents.length === 0 ? (
            <LoadingSkeleton />
          ) : (
            <TorrentTable
              torrents={filteredTorrents}
              selectedHashes={selectedHashes}
              onToggleSelection={toggleSelection}
              onSelectTorrent={setSelectedTorrent}
              onTorrentAction={handleTorrentAction}
              focusedIndex={focusedIndex}
              categories={categoryNames}
            />
          )}
        </div>
      </div>

      {/* Detail Panel */}
      {selectedTorrent && (
        <TorrentDetail
          torrent={selectedTorrent}
          onClose={() => setSelectedTorrent(null)}
          onAction={handleTorrentAction}
          categories={categoryNames}
        />
      )}

      {/* Modals */}
      <SettingsModal
        isOpen={isSettingsModalOpen}
        onClose={() => setIsSettingsModalOpen(false)}
        onLoginSuccess={handleLoginSuccess}
        categories={categoryNames}
      />

      <AddTorrentModal
        isOpen={isAddTorrentOpen}
        onClose={handleAddTorrentClose}
        droppedFile={droppedFiles[0] || null}
        pastedMagnet={pastedMagnet}
        queueProgress={
          initialQueueSize > 0
            ? {
                current: initialQueueSize - droppedFiles.length,
                total: initialQueueSize,
              }
            : undefined
        }
      />

      <LogViewerModal
        isOpen={isLogViewerOpen}
        onClose={() => setIsLogViewerOpen(false)}
      />

      <KeyboardHelpModal
        isOpen={isKeyboardHelpOpen}
        onClose={() => setIsKeyboardHelpOpen(false)}
      />

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('dialog.delete.title')}</AlertDialogTitle>
            <AlertDialogDescription>
              {t('dialog.delete.description', {
                count: selectedHashes.size,
              })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="my-4 space-y-3">
            <label className="flex items-center gap-2">
              <input type="checkbox" id="deleteFiles" defaultChecked={false} />
              <span className="text-sm">{t('dialog.delete.deleteFiles')}</span>
            </label>
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('dialog.cancel')}</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                const deleteFilesCheckbox = document.getElementById(
                  'deleteFiles',
                ) as HTMLInputElement
                handleBatchAction('delete', Array.from(selectedHashes), {
                  deleteFiles: deleteFilesCheckbox?.checked || false,
                })
              }}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {t('dialog.delete')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}