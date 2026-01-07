/**
 * Performance Testing Utilities for Virtual Scrolling
 *
 * This module provides utilities to generate mock torrent data for testing
 * virtual scrolling performance with large datasets (1000+ torrents).
 *
 * Usage in browser console:
 * 1. Import: const { generateMockTorrents } = await import('./lib/performance-test-utils')
 * 2. Generate: const torrents = generateMockTorrents(2000)
 *
 * Or use the global performance test utilities exposed in development mode.
 */

import type { Torrent } from '@/types/torrent'

// Random torrent names for realistic testing
const TORRENT_NAME_PREFIXES = [
  'Ubuntu',
  'Debian',
  'Fedora',
  'Arch Linux',
  'Linux Mint',
  'OpenSUSE',
  'CentOS',
  'Rocky Linux',
  'AlmaLinux',
  'Manjaro',
  'Pop!_OS',
  'Elementary OS',
  'Zorin OS',
  'Solus',
  'MX Linux',
  'Kali Linux',
  'Parrot OS',
  'Tails',
  'LibreOffice',
  'Firefox',
  'Thunderbird',
  'GIMP',
  'Blender',
  'Inkscape',
  'VLC',
  'Audacity',
  'OBS Studio',
  'Kdenlive',
  'Godot Engine',
  'Unreal Engine',
]

const TORRENT_NAME_SUFFIXES = [
  'x64 ISO',
  'ARM64 ISO',
  'Desktop Edition',
  'Server Edition',
  'Minimal Install',
  'Full DVD',
  'Network Install',
  'Live CD',
  'Source Code',
  'Documentation',
  'Portable',
  'Extended',
  'Ultimate',
  'Professional',
  'Community Edition',
]

const CATEGORIES = [
  'linux',
  'software',
  'documents',
  'media',
  'games',
  'development',
  '',
]

const STATES = [
  'downloading',
  'uploading',
  'stalledDL',
  'stalledUP',
  'pausedDL',
  'pausedUP',
  'queuedDL',
  'queuedUP',
  'checkingDL',
  'checkingUP',
]

/**
 * Generates a random hash-like string
 */
function generateHash(): string {
  const chars = '0123456789abcdef'
  let hash = ''
  for (let i = 0; i < 40; i++) {
    hash += chars[Math.floor(Math.random() * chars.length)]
  }
  return hash
}

/**
 * Generates a random torrent name
 */
function generateTorrentName(index: number): string {
  const prefix =
    TORRENT_NAME_PREFIXES[Math.floor(Math.random() * TORRENT_NAME_PREFIXES.length)]
  const suffix =
    TORRENT_NAME_SUFFIXES[Math.floor(Math.random() * TORRENT_NAME_SUFFIXES.length)]
  const version = `${Math.floor(Math.random() * 30) + 1}.${Math.floor(Math.random() * 10)}.${Math.floor(Math.random() * 10)}`
  return `${prefix} ${version} ${suffix} [#${index + 1}]`
}

/**
 * Generates a single mock torrent with realistic data
 */
function generateMockTorrent(index: number): Torrent {
  const hash = generateHash()
  const size = Math.floor(Math.random() * 50 * 1024 * 1024 * 1024) + 100 * 1024 * 1024 // 100MB to 50GB
  const progress = Math.random()
  const downloaded = Math.floor(size * progress)
  const state = STATES[Math.floor(Math.random() * STATES.length)]
  const isDownloading = state.includes('download') || state === 'stalledDL'
  const isUploading = state.includes('upload') || state === 'stalledUP'

  return {
    hash,
    name: generateTorrentName(index),
    added_on: Math.floor(Date.now() / 1000) - Math.floor(Math.random() * 30 * 24 * 60 * 60),
    amount_left: size - downloaded,
    auto_tmm: Math.random() > 0.5,
    availability: Math.random(),
    category: CATEGORIES[Math.floor(Math.random() * CATEGORIES.length)],
    comment: '',
    completed: downloaded,
    completion_on: progress >= 1 ? Math.floor(Date.now() / 1000) - Math.floor(Math.random() * 7 * 24 * 60 * 60) : 0,
    content_path: `/downloads/${hash}`,
    dl_limit: 0,
    dlspeed: isDownloading ? Math.floor(Math.random() * 50 * 1024 * 1024) : 0,
    download_path: '',
    downloaded,
    downloaded_session: Math.floor(downloaded * Math.random()),
    eta: isDownloading ? Math.floor(Math.random() * 24 * 60 * 60) : progress >= 1 ? 0 : 8640000,
    f_l_piece_prio: false,
    force_start: false,
    has_metadata: true,
    inactive_seeding_time_limit: -2,
    infohash_v1: hash,
    infohash_v2: '',
    last_activity: Math.floor(Date.now() / 1000) - Math.floor(Math.random() * 60 * 60),
    magnet_uri: `magnet:?xt=urn:btih:${hash}`,
    max_inactive_seeding_time: -1,
    max_ratio: -1,
    max_seeding_time: -1,
    num_complete: Math.floor(Math.random() * 1000),
    num_incomplete: Math.floor(Math.random() * 500),
    num_leechs: Math.floor(Math.random() * 50),
    num_seeds: Math.floor(Math.random() * 100),
    popularity: Math.random() * 10,
    priority: 0,
    private: Math.random() > 0.8,
    progress,
    ratio: Math.random() * 5,
    ratio_limit: -2,
    reannounce: Math.floor(Math.random() * 3600),
    root_path: `/downloads/${hash}`,
    save_path: '/downloads',
    seeding_time: progress >= 1 ? Math.floor(Math.random() * 7 * 24 * 60 * 60) : 0,
    seeding_time_limit: -2,
    seen_complete: Math.floor(Date.now() / 1000) - Math.floor(Math.random() * 24 * 60 * 60),
    seq_dl: false,
    size,
    state,
    super_seeding: false,
    tags: '',
    time_active: Math.floor(Math.random() * 30 * 24 * 60 * 60),
    total_size: size,
    tracker: `https://tracker${Math.floor(Math.random() * 10)}.example.com/announce`,
    trackers_count: Math.floor(Math.random() * 5) + 1,
    up_limit: 0,
    uploaded: Math.floor(size * Math.random() * 3),
    uploaded_session: Math.floor(Math.random() * 1024 * 1024 * 1024),
    upspeed: isUploading ? Math.floor(Math.random() * 10 * 1024 * 1024) : 0,
  }
}

/**
 * Generates an array of mock torrents for performance testing
 * @param count Number of mock torrents to generate (default: 1000)
 */
export function generateMockTorrents(count: number = 1000): Torrent[] {
  const startTime = performance.now()
  const torrents: Torrent[] = []

  for (let i = 0; i < count; i++) {
    torrents.push(generateMockTorrent(i))
  }

  const endTime = performance.now()
  const generationTime = (endTime - startTime).toFixed(2)

  // Log generation stats (development only)
  if (import.meta.env.DEV) {
    console.info(`[Performance Test] Generated ${count} mock torrents in ${generationTime}ms`)
  }

  return torrents
}

/**
 * Performance measurement utilities
 */
export const PerformanceMetrics = {
  /**
   * Measures render time of a component update
   */
  measureRenderTime(label: string, fn: () => void): number {
    const start = performance.now()
    fn()
    const end = performance.now()
    const duration = end - start

    if (import.meta.env.DEV) {
      console.info(`[Performance Test] ${label}: ${duration.toFixed(2)}ms`)
    }

    return duration
  },

  /**
   * Gets current memory usage (if available)
   */
  getMemoryUsage(): { usedJSHeapSize: number; totalJSHeapSize: number } | null {
    if ('memory' in performance) {
      const memory = (performance as unknown as { memory: { usedJSHeapSize: number; totalJSHeapSize: number } }).memory
      return {
        usedJSHeapSize: memory.usedJSHeapSize,
        totalJSHeapSize: memory.totalJSHeapSize,
      }
    }
    return null
  },

  /**
   * Logs memory usage for testing
   */
  logMemoryUsage(label: string): void {
    const memory = this.getMemoryUsage()
    if (memory) {
      console.info(
        `[Performance Test] ${label} - Memory: ${(memory.usedJSHeapSize / 1024 / 1024).toFixed(2)}MB / ${(memory.totalJSHeapSize / 1024 / 1024).toFixed(2)}MB`
      )
    }
  },

  /**
   * Counts DOM nodes in a container
   */
  countDOMNodes(selector: string = '[data-slot="div-table-body"]'): number {
    const container = document.querySelector(selector)
    if (!container) return 0
    return container.querySelectorAll('[data-slot="div-table-row"]').length
  },

  /**
   * Logs full performance report
   */
  logPerformanceReport(torrentCount: number): void {
    console.group('[Performance Test] Report')
    console.info(`Total torrents: ${torrentCount}`)

    const tableBodyNodes = this.countDOMNodes('[data-slot="div-table-body"]')
    console.info(`DOM rows in table view: ${tableBodyNodes}`)

    const memory = this.getMemoryUsage()
    if (memory) {
      console.info(
        `Memory usage: ${(memory.usedJSHeapSize / 1024 / 1024).toFixed(2)}MB`
      )
    }

    console.groupEnd()
  },
}

// Expose utilities globally in development mode for console access
if (import.meta.env.DEV) {
  ;(window as unknown as { __PERF_TEST__: unknown }).__PERF_TEST__ = {
    generateMockTorrents,
    PerformanceMetrics,
  }
}
