import React from 'react'
import { createFileRoute } from '@tanstack/react-router'
import { useQuery, useQueryClient } from '@tanstack/react-query'

import { Menu, Search, X } from 'lucide-react' // Import Menu, Search, X icons
import type { Torrent } from '@/components/torrent-table'
import { Sidebar } from '@/components/sidebar'
import { TorrentTable } from '@/components/torrent-table'
import { TorrentDetail } from '@/components/torrent-detail'
import { getMaindata, login, pauseTorrent, resumeTorrent, deleteTorrent } from '@/lib/api'
import { SettingsModal } from '@/components/settings-modal'
import { AddTorrentModal } from '@/components/add-torrent-modal'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { LoginForm } from '@/components/login-form'
import { useMediaQuery } from '@/lib/hooks' // Import the new hook
import { useMutation } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'

type Filter = string // Changed from TorrentState to string as TorrentState came from @ctrl/qbittorrent

export const Route = createFileRoute('/')({ component: HomePage })

function HomePage() {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const [filter, setFilter] = React.useState<Filter>('all')
  const [searchQuery, setSearchQuery] = React.useState('')
  const [isSettingsModalOpen, setIsSettingsModalOpen] = React.useState(false)
  const [isAddTorrentOpen, setIsAddTorrentOpen] = React.useState(false)
  const [selectedTorrent, setSelectedTorrent] = React.useState<Torrent | null>(null)

  const isDesktop = useMediaQuery('(min-width: 768px)') // md breakpoint
  const [isMobileSidebarOpen, setIsMobileSidebarOpen] = React.useState(false)

  const getBaseUrl = () =>
    credentials.baseUrl || localStorage.getItem('qbit_baseUrl') || 'http://localhost:8080'

  // --- State for sync/maindata ---
  const [rid, setRid] = React.useState<number | undefined>(undefined)
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

  console.log('--- HomePage State ---')
  console.log('areCredentialsSet:', areCredentialsSet)
  console.log('isLoggingIn:', isLoggingIn)
  console.log('loginSuccess:', loginSuccess)
  console.log('isLoginError:', isLoginError)
  console.log('rid (before maindata query):', rid)

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
      console.log('Fetching maindata with rid:', ridRef.current)
      const maindata = await getMaindata(credentials.baseUrl, ridRef.current)
      ridRef.current = maindata.rid // Update ref immediately
      return maindata
    },
    refetchInterval: 5000,
    enabled: loginSuccess, // Only enabled if logged in
  })

  // Process maindata response using useEffect
  React.useEffect(() => {
    if (!maindata) {
      console.log('maindata is undefined, skipping processing')
      return
    }

    console.log('--- Processing maindata ---')
    console.log('maindata.rid:', maindata.rid)
    console.log('maindata.full_update:', maindata.full_update)
    console.log('maindata.torrents keys:', maindata.torrents ? Object.keys(maindata.torrents).length : 0)

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
      console.log('Full update: torrents count =', newMap.size)
    } else {
      // Incremental update: merge changes
      setAllTorrentsMap((prevMap) => {
        const newMap = new Map(prevMap)
        console.log('Previous map size:', prevMap.size)

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

        console.log('Incremental update: new map size =', newMap.size)
        return newMap
      })
    }
  }, [maindata])

  console.log('isLoadingTorrents (after maindata query):', isLoadingTorrents)
  console.log('rid (after maindata query):', rid)
  // Log the length here, it reflects latest state

  // --- Step 4: Client-side Filtering ---
  const allTorrents = React.useMemo(() => {
    return Array.from(allTorrentsMap.values())
  }, [allTorrentsMap])

  const filteredTorrents = React.useMemo(() => {
    // First, apply search filter
    const trimmedSearch = searchQuery.trim().toLowerCase()
    let result = allTorrents

    if (trimmedSearch) {
      result = result.filter((t: Torrent) =>
        t.name?.toLowerCase().includes(trimmedSearch)
      )
    }

    // Then, apply status/category filter
    if (filter === 'all') return result

    // Category filter
    if (filter.startsWith('category:')) {
      const category = filter.substring(9) // Remove 'category:' prefix
      return result.filter((t: Torrent) => {
        const torrentCategory = t.category || '未分類'
        return torrentCategory === category
      })
    }

    // Status filter
    return result.filter((t: Torrent) => t.state === filter)
  }, [allTorrents, filter, searchQuery])

  console.log('filteredTorrents.length:', filteredTorrents.length)

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

  const deleteMutation = useMutation({
    mutationFn: ({ hash, deleteFiles }: { hash: string; deleteFiles: boolean }) =>
      deleteTorrent(getBaseUrl(), hash, deleteFiles),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['maindata'] })
      setSelectedTorrent(null)
    },
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
          Error fetching torrent data: {maindataError?.message}
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
              placeholder={t('torrent.search.placeholder', 'Search torrents...')}
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

          {/* Torrent List */}
          {filteredTorrents.length > 0 ? (
            <TorrentTable
              torrents={filteredTorrents}
              onTorrentClick={(torrent) => setSelectedTorrent(torrent)}
            />
          ) : (
            <p>{t('torrent.noTorrentsFound')}</p>
          )}
        </>
      )
    }

    return <p>Loading application...</p> // Fallback if no specific state matches
  }

  return (
    <div className="flex flex-col md:flex-row h-full">
      {' '}
      {/* Responsive flex container */}
      {!isDesktop && ( // Mobile menu button
        <div className="p-4 bg-slate-800 flex items-center justify-between">
          <h1 className="text-2xl font-bold text-white">qB-React</h1>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setIsMobileSidebarOpen(true)}
          >
            <Menu className="h-6 w-6" />
          </Button>
        </div>
      )}
      <Sidebar
        currentFilter={filter}
        setFilter={setFilter}
        onOpenSettings={() => setIsSettingsModalOpen(true)}
        onAddTorrent={() => setIsAddTorrentOpen(true)}
        isMobile={!isDesktop}
        isMobileSidebarOpen={isMobileSidebarOpen}
        onCloseMobileSidebar={() => setIsMobileSidebarOpen(false)}
        torrents={allTorrents}
        categories={{}}
      />
      <div className="flex-1 p-6 overflow-auto">{renderContent()}</div>
      <SettingsModal
        isOpen={isSettingsModalOpen}
        onClose={() => setIsSettingsModalOpen(false)}
        onSave={handleSettingsSave}
      />
      <TorrentDetail
        torrent={selectedTorrent}
        isOpen={!!selectedTorrent}
        onClose={() => setSelectedTorrent(null)}
        onPause={() => selectedTorrent && pauseMutation.mutate(selectedTorrent.hash)}
        onResume={() => selectedTorrent && resumeMutation.mutate(selectedTorrent.hash)}
        onDelete={() => {
          if (selectedTorrent) {
            if (window.confirm(t('torrent.actions.confirmDelete'))) {
              const deleteFiles = window.confirm(t('torrent.actions.deleteWithFiles'))
              deleteMutation.mutate({ hash: selectedTorrent.hash, deleteFiles })
            }
          }
        }}
      />
      <AddTorrentModal
        isOpen={isAddTorrentOpen}
        onClose={() => setIsAddTorrentOpen(false)}
      />
    </div>
  )
}
