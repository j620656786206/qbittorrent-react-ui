import React from 'react'
import { createFileRoute } from '@tanstack/react-router'
import { useQuery } from '@tanstack/react-query'
import type { TorrentState } from '@ctrl/qbittorrent'

import { Sidebar } from '@/components/sidebar'
import { Torrent, TorrentTable } from '@/components/torrent-table'
import { login, getTorrents } from '@/lib/api'

type Filter = TorrentState | 'all'

export const Route = createFileRoute('/')({ component: HomePage })

function HomePage() {
  const [filter, setFilter] = React.useState<Filter>('all')

  // --- Step 1: Handle Credentials ---
  // In a real app, this would be in a context or a more robust store.
  const credentials = {
    baseUrl: localStorage.getItem('qbit_baseUrl') || 'http://localhost:8080',
    username: localStorage.getItem('qbit_username') || undefined,
    password: localStorage.getItem('qbit_password') || undefined,
  }

  // --- Step 2: Login Query ---
  const { isSuccess: isLoggedIn, isError: isLoginError, error: loginError } = useQuery({
    queryKey: ['login', credentials.baseUrl, credentials.username],
    queryFn: () => login(credentials.baseUrl, credentials.username, credentials.password),
    staleTime: Infinity, // We only need to login once per session
    retry: 1, // Don't retry login endlessly if it fails
  });

  // --- Step 3: Torrents Query ---
  // This query is only enabled after a successful login.
  const { data: allTorrents, isLoading: isLoadingTorrents } = useQuery({
    queryKey: ['torrents'],
    queryFn: () => getTorrents(credentials.baseUrl),
    refetchInterval: 5000,
    enabled: isLoggedIn, // <-- DEPENDENCY on login
  });

  // --- Step 4: Client-side Filtering ---
  const filteredTorrents = React.useMemo(() => {
    if (!allTorrents) return []
    if (filter === 'all') return allTorrents
    // The API returns an array of objects now, not an object of objects
    return allTorrents.filter((t: Torrent) => t.state === filter)
  }, [allTorrents, filter]);

  // --- Step 5: Render UI based on state ---
  const renderContent = () => {
    if (isLoginError) {
      return <p className="text-red-400">Login Failed: {loginError?.message}. Please check credentials in localStorage.</p>
    }
    if (!isLoggedIn) {
      return <p>Logging in...</p>
    }
    if (isLoadingTorrents) {
      return <p>Loading torrents...</p>
    }
    if (filteredTorrents) {
      return <TorrentTable torrents={filteredTorrents} />
    }
    return <p>No torrents found.</p>
  }

  return (
    <div className="flex h-full">
      <Sidebar currentFilter={filter} setFilter={setFilter} />
      <div className="flex-1 p-6 overflow-auto">
        {renderContent()}
      </div>
    </div>
  )
}