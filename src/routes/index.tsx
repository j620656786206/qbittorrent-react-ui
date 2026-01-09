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
    onSuccess: (_data, hashes) => {
      queryClient.invalidateQueries({ queryKey: ['maindata'] })
      clearSelection()
      setBatchError(null)
      toast.success(t('toast.torrent.pauseSuccessPlural', { count: hashes.length }))
    },
    onError: (error: Error) => {
      setBatchError(t('batch.error.pause', { message: error.message }))
      toast.error(t('toast.torrent.pauseErrorPlural'), {
        description: error.message,
      })
    },
  })

  const batchResumeMutation = useMutation({
    mutationFn: (hashes: Array<string>) => resumeTorrent(getBaseUrl(), hashes),
    onSuccess: (_data, hashes) => {
      queryClient.invalidateQueries({ queryKey: ['maindata'] })
      clearSelection()
      setBatchError(null)
      toast.success(t('toast.torrent.resumeSuccessPlural', { count: hashes.length }))
    },
    onError: (error: Error) => {
      setBatchError(t('batch.error.resume', { message: error.message }))
      toast.error(t('toast.torrent.resumeErrorPlural'), {
        description: error.message,
      })
    },
  })

  const batchRecheckMutation = useMutation({
    mutationFn: (hashes: Array<string>) => recheckTorrent(getBaseUrl(), hashes),
    onSuccess: (_data, hashes) => {
      queryClient.invalidateQueries({ queryKey: ['maindata'] })
      clearSelection()
      setBatchError(null)
      toast.success(t('toast.torrent.recheckSuccessPlural', { count: hashes.length }))
    },
    onError: (error: Error) => {
      setBatchError(t('batch.error.recheck', { message: error.message }))
      toast.error(t('toast.torrent.recheckErrorPlural'), {
        description: error.message,
      })
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
    onSuccess: (_data, { hashes }) => {
      queryClient.invalidateQueries({ queryKey: ['maindata'] })
      clearSelection()
      setIsDeleteDialogOpen(false)
      setBatchError(null)
      toast.success(t('toast.torrent.deleteSuccessPlural', { count: hashes.length }))
    },
    onError: (error: Error) => {
      setIsDeleteDialogOpen(false)
      setBatchError(t('batch.error.delete', { message: error.message }))
      toast.error(t('toast.torrent.deleteErrorPlural'), {
        description: error.message,
      })
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
    onSuccess: (_data, { hashes }) => {
      queryClient.invalidateQueries({ queryKey: ['maindata'] })
      clearSelection()
      setBatchError(null)
      toast.success(t('toast.torrent.setCategorySuccess', { count: hashes.length }))
    },
    onError: (error: Error) => {
      setBatchError(t('batch.error.setCategory', { message: error.message }))
      toast.error(t('toast.torrent.setCategoryError'), {
        description: error.message,
      })
    },
  })

  // --- Mutation Handlers ---
  const handlePauseTorrent = (hash: string) => pauseMutation.mutate(hash)
  const handleResumeTorrent = (hash: string) => resumeMutation.mutate(hash)
  const handleRecheckTorrent = (hash: string) => recheckMutation.mutate(hash)
  const handleDeleteTorrent = (deleteFiles: boolean) => {
    if (!selectedTorrent) return
    deleteMutation.mutate({
      hash: selectedTorrent.hash,
      deleteFiles,
    })
  }

  const handleBatchPause = () => {
    batchPauseMutation.mutate(Array.from(selectedHashes))
  }

  const handleBatchResume = () => {
    batchResumeMutation.mutate(Array.from(selectedHashes))
  }

  const handleBatchRecheck = () => {
    batchRecheckMutation.mutate(Array.from(selectedHashes))
  }

  const handleBatchDelete = (deleteFiles: boolean) => {
    batchDeleteMutation.mutate({
      hashes: Array.from(selectedHashes),
      deleteFiles,
    })
  }

  const handleBatchSetCategory = (category: string) => {
    batchSetCategoryMutation.mutate({
      hashes: Array.from(selectedHashes),
      category,
    })
  }

  // --- Keyboard Shortcuts ---
  useKeyboardShortcuts({
    onSelectAll: () => selectAll(filteredTorrents),
    onClearSelection: () => clearSelection(),
    onToggleSelection: (hash) => toggleSelection(hash),
    onHelp: () => setIsKeyboardHelpOpen(true),
    onAddTorrent: () => setIsAddTorrentOpen(true),
  })

  // --- Error State Display ---
  const loginErrorMessage =
    isLoginError && loginError instanceof Error ? loginError.message : null
  const maindataErrorMessage =
    isMaindataError && maindataError instanceof Error ? maindataError.message : null

  // --- Render ---
  return (
    <div className="flex h-screen overflow-hidden">
      {/* Login Form Overlay */}
      {!loginSuccess && (
        <LoginForm
          onSuccess={handleLoginSuccess}
          isLoading={isLoggingIn}
          error={loginErrorMessage}
        />
      )}

      {/* Main Content */}
      {loginSuccess && (
        <>
          {/* Sidebar */}
          {isDesktop && (
            <Sidebar
              categories={categoryNames}
              onCategoryClick={(category) => setFilter(`category:${category}`)}
              onFilterChange={setFilter}
              currentFilter={filter}
            />
          )}

          {/* Main Area */}
          <div className="flex flex-1 flex-col overflow-hidden">
            {/* Header */}
            <div className="flex items-center justify-between border-b bg-background px-4 py-3">
              {/* Mobile Sidebar Toggle */}
              {!isDesktop && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setIsMobileSidebarOpen(!isMobileSidebarOpen)}
                >
                  <Menu className="h-4 w-4" />
                </Button>
              )}

              {/* Search Bar */}
              <div className="flex flex-1 items-center px-2">
                <Search className="h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder={t('common.search')}
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="ml-2 border-0 bg-transparent focus-visible:ring-0"
                />
              </div>

              {/* Header Buttons */}
              <div className="flex items-center gap-2">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setIsAddTorrentOpen(true)}
                >
                  {t('torrent.add')}
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setIsSettingsModalOpen(true)}
                >
                  {t('common.settings')}
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setIsKeyboardHelpOpen(true)}
                >
                  {t('common.help')}
                </Button>
              </div>
            </div>

            {/* Content Area */}
            <div className="flex flex-1 overflow-hidden">
              {/* Mobile Sidebar */}
              {!isDesktop && isMobileSidebarOpen && (
                <div className="w-48 border-r bg-background">
                  <Sidebar
                    categories={categoryNames}
                    onCategoryClick={(category) => {
                      setFilter(`category:${category}`)
                      setIsMobileSidebarOpen(false)
                    }}
                    onFilterChange={(f) => {
                      setFilter(f)
                      setIsMobileSidebarOpen(false)
                    }}
                    currentFilter={filter}
                  />
                </div>
              )}

              {/* Torrents Area */}
              <div className="flex flex-1 flex-col overflow-hidden">
                {/* Batch Actions Toolbar */}
                {selectedHashes.size > 0 && (
                  <BatchActionsToolbar
                    selectedCount={selectedHashes.size}
                    onPause={handleBatchPause}
                    onResume={handleBatchResume}
                    onRecheck={handleBatchRecheck}
                    onDelete={() => setIsDeleteDialogOpen(true)}
                    onSetCategory={handleBatchSetCategory}
                    categories={categoryNames}
                    error={_batchError}
                  />
                )}

                {/* Torrent Table / Detail View */}
                {isDesktop ? (
                  <div className="flex flex-1 overflow-hidden">
                    {/* Table */}
                    <div className="flex-1 overflow-auto">
                      {isLoadingTorrents ? (
                        <LoadingSkeleton />
                      ) : maindataErrorMessage ? (
                        <div className="flex items-center justify-center p-4">
                          <p className="text-red-500">{maindataErrorMessage}</p>
                        </div>
                      ) : (
                        <TorrentTable
                          torrents={filteredTorrents}
                          selectedHashes={selectedHashes}
                          onSelectionChange={toggleSelection}
                          onSelectAll={() => selectAll(filteredTorrents)}
                          onTorrentClick={setSelectedTorrent}
                          selectedTorrent={selectedTorrent}
                          onPause={handlePauseTorrent}
                          onResume={handleResumeTorrent}
                          onRecheck={handleRecheckTorrent}
                          onDelete={() => setIsDeleteDialogOpen(true)}
                          focusedIndex={focusedIndex}
                          onFocusedIndexChange={setFocusedIndex}
                        />
                      )}
                    </div>

                    {/* Detail Panel */}
                    {selectedTorrent && (
                      <div className="w-96 border-l bg-background p-4">
                        <div className="flex items-center justify-between">
                          <h2 className="text-lg font-semibold">
                            {t('common.details')}
                          </h2>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => setSelectedTorrent(null)}
                          >
                            <X className="h-4 w-4" />
                          </Button>
                        </div>
                        <TorrentDetail
                          torrent={selectedTorrent}
                          categories={categoryNames}
                          onDelete={() => setIsDeleteDialogOpen(true)}
                          onPause={() => handlePauseTorrent(selectedTorrent.hash)}
                          onResume={() => handleResumeTorrent(selectedTorrent.hash)}
                          onRecheck={() =>
                            handleRecheckTorrent(selectedTorrent.hash)
                          }
                        />
                      </div>
                    )}
                  </div>
                ) : (
                  // Mobile View
                  <>
                    {isLoadingTorrents ? (
                      <LoadingSkeleton />
                    ) : maindataErrorMessage ? (
                      <div className="flex items-center justify-center p-4">
                        <p className="text-red-500">{maindataErrorMessage}</p>
                      </div>
                    ) : selectedTorrent ? (
                      <TorrentDetail
                        torrent={selectedTorrent}
                        categories={categoryNames}
                        onDelete={() => setIsDeleteDialogOpen(true)}
                        onPause={() => handlePauseTorrent(selectedTorrent.hash)}
                        onResume={() => handleResumeTorrent(selectedTorrent.hash)}
                        onRecheck={() =>
                          handleRecheckTorrent(selectedTorrent.hash)
                        }
                      />
                    ) : (
                      <TorrentTable
                        torrents={filteredTorrents}
                        selectedHashes={selectedHashes}
                        onSelectionChange={toggleSelection}
                        onSelectAll={() => selectAll(filteredTorrents)}
                        onTorrentClick={setSelectedTorrent}
                        selectedTorrent={selectedTorrent}
                        onPause={handlePauseTorrent}
                        onResume={handleResumeTorrent}
                        onRecheck={handleRecheckTorrent}
                        onDelete={() => setIsDeleteDialogOpen(true)}
                        focusedIndex={focusedIndex}
                        onFocusedIndexChange={setFocusedIndex}
                      />
                    )}
                  </>
                )}
              </div>
            </div>
          </div>

          {/* Drop Zone Overlay */}
          <DropZoneOverlay isDragging={isDragging} />

          {/* Modals */}
          <SettingsModal
            isOpen={isSettingsModalOpen}
            onClose={() => setIsSettingsModalOpen(false)}
            onSave={handleSettingsSave}
          />

          <AddTorrentModal
            isOpen={isAddTorrentOpen}
            onClose={handleAddTorrentClose}
            droppedFiles={droppedFiles}
            pastedMagnet={pastedMagnet}
            initialQueueSize={initialQueueSize}
          />

          <KeyboardHelpModal
            isOpen={isKeyboardHelpOpen}
            onClose={() => setIsKeyboardHelpOpen(false)}
          />

          {/* Delete Confirmation Dialog */}
          <AlertDialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>{t('torrent.delete')}</AlertDialogTitle>
                <AlertDialogDescription>
                  {selectedHashes.size > 0
                    ? t('torrent.deleteConfirmPlural', {
                        count: selectedHashes.size,
                      })
                    : t('torrent.deleteConfirm')}
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>{t('common.cancel')}</AlertDialogCancel>
                <AlertDialogAction
                  onClick={() => handleBatchDelete(false)}
                  className="bg-red-600 hover:bg-red-700"
                >
                  {t('torrent.deleteTorrent')}
                </AlertDialogAction>
                <AlertDialogAction
                  onClick={() => handleBatchDelete(true)}
                  className="bg-red-600 hover:bg-red-700"
                >
                  {t('torrent.deleteWithFiles')}
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </>
      )}
    </div>
  )
}