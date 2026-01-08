import React from 'react'
import { createFileRoute } from '@tanstack/react-router'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { Menu, Search, X } from 'lucide-react' // Import Menu, Search, X icons
import { useTranslation } from 'react-i18next'
import type { Torrent } from '@/types/torrent'
import { parseTagString } from '@/lib/tag-storage'
import { Sidebar } from '@/components/sidebar'
import { TorrentTable } from '@/components/torrent-table'
import { TorrentDetail } from '@/components/torrent-detail'
import { BatchActionsToolbar } from '@/components/batch-actions-toolbar'
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
  const [batchError, setBatchError] = React.useState<string | null>(null)

  // --- Keyboard Navigation State ---
  const [focusedIndex, setFocusedIndex] = React.useState<number | null>(null)
  const [isKeyboardHelpOpen, setIsKeyboardHelpOpen] = React.useState(false)

  // --- Drag and Drop State ---
  const [droppedFiles, setDroppedFiles] = React.useState<File[]>([])
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

    // Question mark: Open keyboard help
    onHelp: React.useCallback(() => {
      setIsKeyboardHelpOpen(true)
    }, []),
  })

  // --- Step 5: Render UI based on state ---
  const renderContent = () => {
    if (!areCredentialsSet || isLoginError) {
      return (
        <LoginForm
          onLoginSuccess={handleLoginSuccess}
          initialUsername={credentials.username}
          initialPassword={credentials.password}
          error={
            !areCredentialsSet
              ? 'Please enter your qBittorrent username and password.'
              : `Login Failed: ${loginError?.message}`
          }
        />
      )
    }

    if (isLoggingIn || isLoadingTorrents) {
      return <p>Attempting to log in or loading torrent data...</p>
    }

    // Check for maindata errors separately
    if (isMaindataError) {
      return (
        <p className="text-red-400">
          Error fetching torrent data: {maindataError.message}
        </p>
      )
    }

    if (loginSuccess) {
      return (
        <>
          {/* Search Input */}
          <div className="relative mb-4">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              type="text"
              placeholder={t(
                'torrent.search.placeholder',
                'Search torrents...',
              )}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9 pr-9"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                aria-label={t('torrent.search.clear', 'Clear search')}
              >
                <X className="h-4 w-4" />
              </button>
            )}
          </div>

          {/* Batch Actions Toolbar */}
          {selectedHashes.size > 0 && (
            <BatchActionsToolbar
              selectedCount={selectedHashes.size}
              onPause={() => batchPauseMutation.mutate(Array.from(selectedHashes))}
              onResume={() =>
                batchResumeMutation.mutate(Array.from(selectedHashes))
              }
              onRecheck={() =>
                batchRecheckMutation.mutate(Array.from(selectedHashes))
              }
              onDelete={() => setIsDeleteDialogOpen(true)}
              onSetCategory={(category) =>
                batchSetCategoryMutation.mutate({
                  hashes: Array.from(selectedHashes),
                  category,
                })
              }
              categories={categoryNames}
              isPending={
                batchPauseMutation.isPending ||
                batchResumeMutation.isPending ||
                batchRecheckMutation.isPending ||
                batchDeleteMutation.isPending ||
                batchSetCategoryMutation.isPending
              }
              onClearSelection={clearSelection}
            />
          )}

          {/* Torrent Table */}
          <TorrentTable
            torrents={filteredTorrents}
            selectedHashes={selectedHashes}
            toggleSelection={toggleSelection}
            selectAll={() => selectAll(filteredTorrents)}
            clearSelection={clearSelection}
            onTorrentClick={setSelectedTorrent}
            focusedIndex={focusedIndex}
          />

          {/* Torrent Detail Panel */}
          {selectedTorrent && (
            <TorrentDetail
              torrent={selectedTorrent}
              isOpen={!!selectedTorrent}
              onClose={() => setSelectedTorrent(null)}
              onPause={() => pauseMutation.mutate(selectedTorrent.hash)}
              onResume={() => resumeMutation.mutate(selectedTorrent.hash)}
              onRecheck={() => recheckMutation.mutate(selectedTorrent.hash)}
              onDelete={() => setIsDeleteDialogOpen(true)}
            />
          )}

          {/* Delete Confirmation Dialog */}
          <AlertDialog open={isDeleteDialogOpen}>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>
                  {t('torrent.delete.title', 'Delete Torrents')}
                </AlertDialogTitle>
                <AlertDialogDescription>
                  {t(
                    'torrent.delete.description',
                    'Are you sure you want to delete the selected torrents?',
                  )}
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel
                  onClick={() => setIsDeleteDialogOpen(false)}
                >
                  {t('common.cancel', 'Cancel')}
                </AlertDialogCancel>
                <AlertDialogAction
                  onClick={() => {
                    batchDeleteMutation.mutate({
                      hashes: Array.from(selectedHashes),
                      deleteFiles: false,
                    })
                  }}
                >
                  {t('torrent.delete.keepFiles', 'Delete (Keep Files)')}
                </AlertDialogAction>
                <AlertDialogAction
                  onClick={() => {
                    batchDeleteMutation.mutate({
                      hashes: Array.from(selectedHashes),
                      deleteFiles: true,
                    })
                  }}
                  className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                >
                  {t('torrent.delete.deleteFiles', 'Delete (Remove Files)')}
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>

          {/* Keyboard Help Modal */}
          <KeyboardHelpModal
            isOpen={isKeyboardHelpOpen}
            onClose={() => setIsKeyboardHelpOpen(false)}
          />
        </>
      )
    }

    return null
  }

  return (
    <div className="flex h-screen bg-background">
      {/* Sidebar */}
      {isDesktop && (
        <Sidebar
          currentFilter={filter}
          setFilter={setFilter}
          onOpenSettings={() => setIsSettingsModalOpen(true)}
          onAddTorrent={() => setIsAddTorrentOpen(true)}
          isMobile={false}
          isMobileSidebarOpen={false}
          onCloseMobileSidebar={() => {}}
          torrents={allTorrents}
          categories={categoriesData || {}}
          searchQuery={searchQuery}
          setSearchQuery={setSearchQuery}
        />
      )}

      {/* Mobile Sidebar */}
      {!isDesktop && isMobileSidebarOpen && (
        <Sidebar
          currentFilter={filter}
          setFilter={setFilter}
          onOpenSettings={() => setIsSettingsModalOpen(true)}
          onAddTorrent={() => setIsAddTorrentOpen(true)}
          isMobile={true}
          isMobileSidebarOpen={isMobileSidebarOpen}
          onCloseMobileSidebar={() => setIsMobileSidebarOpen(false)}
          torrents={allTorrents}
          categories={categoriesData || {}}
          searchQuery={searchQuery}
          setSearchQuery={setSearchQuery}
        />
      )}

      {/* Main Content */}
      <div className="flex flex-col flex-1 overflow-hidden">
        {/* Header */}
        <div className="border-b bg-card p-4 md:hidden flex items-center justify-between">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setIsMobileSidebarOpen(!isMobileSidebarOpen)}
          >
            <Menu className="h-5 w-5" />
          </Button>
          <h1 className="text-xl font-semibold text-foreground">qBittorrent</h1>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setIsSettingsModalOpen(true)}
          >
            {/* Settings Icon */}
          </Button>
        </div>

        {/* Content Area */}
        <div className="flex-1 overflow-auto p-4 md:p-6">
          {renderContent()}
        </div>
      </div>

      {/* Settings Modal */}
      <SettingsModal
        isOpen={isSettingsModalOpen}
        onClose={() => setIsSettingsModalOpen(false)}
        onSave={handleSettingsSave}
      />

      {/* Add Torrent Modal */}
      <AddTorrentModal
        isOpen={isAddTorrentOpen}
        onClose={handleAddTorrentClose}
        initialFile={droppedFiles[0]} // Pass the first file from the queue
        initialMagnet={pastedMagnet || undefined} // Pass pasted magnet link
        queueCount={droppedFiles.length > 0 ? initialQueueSize - droppedFiles.length + 1 : undefined}
        queueTotal={droppedFiles.length > 0 ? initialQueueSize : undefined}
      />

      {/* Drop Zone Overlay */}
      <DropZoneOverlay visible={isDragging} />
    </div>
  )
}