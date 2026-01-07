import { describe, expect, it } from 'vitest'
import type { Torrent } from '@/types/torrent'

/**
 * Filter function that mirrors the filtering logic in src/routes/index.tsx
 *
 * This function applies both search and status/category filters to a list of torrents.
 * The filtering logic is:
 * 1. Apply search filter (case-insensitive, trimmed)
 * 2. Apply category or status filter
 *
 * @param torrents - Array of torrents to filter
 * @param searchQuery - Search query string (will be trimmed and lowercased)
 * @param filter - Filter type: 'all', 'category:CATEGORY_NAME', or status string
 * @returns Filtered array of torrents
 */
function filterTorrents(
  torrents: Array<Torrent>,
  searchQuery: string,
  filter: string
): Array<Torrent> {
  let result = torrents

  // Apply search filter first (case-insensitive, trimmed)
  const trimmedQuery = searchQuery.trim().toLowerCase()
  if (trimmedQuery) {
    result = result.filter((t: Torrent) =>
      t.name.toLowerCase().includes(trimmedQuery)
    )
  }

  // Apply category/status filter
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
}

// Helper to create mock torrent with all required fields
function createMockTorrent(overrides: Partial<Torrent>): Torrent {
  return {
    added_on: 0,
    amount_left: 0,
    auto_tmm: false,
    availability: 0,
    category: '',
    comment: '',
    completed: 0,
    completion_on: 0,
    content_path: '',
    dl_limit: 0,
    dlspeed: 0,
    download_path: '',
    downloaded: 0,
    downloaded_session: 0,
    eta: 0,
    f_l_piece_prio: false,
    force_start: false,
    has_metadata: true,
    hash: '',
    inactive_seeding_time_limit: 0,
    infohash_v1: '',
    infohash_v2: '',
    last_activity: 0,
    magnet_uri: '',
    max_inactive_seeding_time: 0,
    max_ratio: 0,
    max_seeding_time: 0,
    name: '',
    num_complete: 0,
    num_incomplete: 0,
    num_leechs: 0,
    num_seeds: 0,
    popularity: 0,
    priority: 0,
    private: false,
    progress: 0,
    ratio: 0,
    ratio_limit: 0,
    reannounce: 0,
    root_path: '',
    save_path: '',
    seeding_time: 0,
    seeding_time_limit: 0,
    seen_complete: 0,
    seq_dl: false,
    size: 0,
    state: '',
    super_seeding: false,
    tags: '',
    time_active: 0,
    total_size: 0,
    tracker: '',
    trackers_count: 0,
    up_limit: 0,
    uploaded: 0,
    uploaded_session: 0,
    upspeed: 0,
    ...overrides,
  }
}

// Test data
const mockTorrents: Array<Torrent> = [
  createMockTorrent({ hash: '1', name: 'Ubuntu Server 22.04 ISO', state: 'downloading', category: 'Linux' }),
  createMockTorrent({ hash: '2', name: 'ubuntu desktop 24.04', state: 'seeding', category: 'Linux' }),
  createMockTorrent({ hash: '3', name: 'Fedora Workstation', state: 'downloading', category: 'Linux' }),
  createMockTorrent({ hash: '4', name: 'Movie Collection 2024', state: 'paused', category: 'Movies' }),
  createMockTorrent({ hash: '5', name: 'movie trailers pack', state: 'downloading', category: 'Movies' }),
  createMockTorrent({ hash: '6', name: 'Game of Thrones S01', state: 'seeding', category: 'TV' }),
  createMockTorrent({ hash: '7', name: 'Breaking Bad Complete', state: 'paused', category: '' }),
  createMockTorrent({ hash: '8', name: 'No Category Torrent', state: 'downloading' }), // category is empty string
]

describe('Torrent Search Filtering', () => {
  describe('Basic search filtering by torrent name', () => {
    it('filters torrents by name substring', () => {
      const result = filterTorrents(mockTorrents, 'ubuntu', 'all')
      expect(result).toHaveLength(2)
      expect(result.map((t) => t.hash)).toEqual(['1', '2'])
    })

    it('returns all torrents when search is empty', () => {
      const result = filterTorrents(mockTorrents, '', 'all')
      expect(result).toHaveLength(8)
    })

    it('returns empty array when no matches found', () => {
      const result = filterTorrents(mockTorrents, 'nonexistent', 'all')
      expect(result).toHaveLength(0)
    })

    it('matches partial names', () => {
      const result = filterTorrents(mockTorrents, 'Thrones', 'all')
      expect(result).toHaveLength(1)
      expect(result[0].name).toBe('Game of Thrones S01')
    })
  })

  describe('Case-insensitive matching', () => {
    it('matches regardless of case - lowercase query', () => {
      const result = filterTorrents(mockTorrents, 'ubuntu', 'all')
      expect(result).toHaveLength(2)
      expect(result[0].name).toBe('Ubuntu Server 22.04 ISO')
      expect(result[1].name).toBe('ubuntu desktop 24.04')
    })

    it('matches regardless of case - uppercase query', () => {
      const result = filterTorrents(mockTorrents, 'UBUNTU', 'all')
      expect(result).toHaveLength(2)
    })

    it('matches regardless of case - mixed case query', () => {
      const result = filterTorrents(mockTorrents, 'UbUnTu', 'all')
      expect(result).toHaveLength(2)
    })

    it('matches movie regardless of case', () => {
      const result = filterTorrents(mockTorrents, 'MOVIE', 'all')
      expect(result).toHaveLength(2)
      expect(result.map((t) => t.hash)).toEqual(['4', '5'])
    })
  })

  describe('Whitespace trimming', () => {
    it('trims leading whitespace from search query', () => {
      const result = filterTorrents(mockTorrents, '   ubuntu', 'all')
      expect(result).toHaveLength(2)
    })

    it('trims trailing whitespace from search query', () => {
      const result = filterTorrents(mockTorrents, 'ubuntu   ', 'all')
      expect(result).toHaveLength(2)
    })

    it('trims both leading and trailing whitespace', () => {
      const result = filterTorrents(mockTorrents, '   ubuntu   ', 'all')
      expect(result).toHaveLength(2)
    })

    it('handles whitespace-only search as empty search', () => {
      const result = filterTorrents(mockTorrents, '     ', 'all')
      expect(result).toHaveLength(8) // Returns all torrents
    })
  })

  describe('Combined search + status filter', () => {
    it('filters by name AND status (downloading)', () => {
      const result = filterTorrents(mockTorrents, 'movie', 'downloading')
      expect(result).toHaveLength(1)
      expect(result[0].name).toBe('movie trailers pack')
      expect(result[0].state).toBe('downloading')
    })

    it('filters by name AND status (seeding)', () => {
      const result = filterTorrents(mockTorrents, 'ubuntu', 'seeding')
      expect(result).toHaveLength(1)
      expect(result[0].name).toBe('ubuntu desktop 24.04')
      expect(result[0].state).toBe('seeding')
    })

    it('filters by name AND status (paused)', () => {
      const result = filterTorrents(mockTorrents, 'movie', 'paused')
      expect(result).toHaveLength(1)
      expect(result[0].name).toBe('Movie Collection 2024')
      expect(result[0].state).toBe('paused')
    })

    it('returns empty when name matches but status does not', () => {
      const result = filterTorrents(mockTorrents, 'ubuntu', 'paused')
      expect(result).toHaveLength(0)
    })

    it('returns empty when status matches but name does not', () => {
      const result = filterTorrents(mockTorrents, 'nonexistent', 'downloading')
      expect(result).toHaveLength(0)
    })
  })

  describe('Combined search + category filter', () => {
    it('filters by name AND category (Linux)', () => {
      const result = filterTorrents(mockTorrents, 'ubuntu', 'category:Linux')
      expect(result).toHaveLength(2)
      expect(result.every((t) => t.category === 'Linux')).toBe(true)
    })

    it('filters by name AND category (Movies)', () => {
      const result = filterTorrents(mockTorrents, 'movie', 'category:Movies')
      expect(result).toHaveLength(2)
      expect(result.every((t) => t.category === 'Movies')).toBe(true)
    })

    it('returns empty when name matches but category does not', () => {
      const result = filterTorrents(mockTorrents, 'ubuntu', 'category:Movies')
      expect(result).toHaveLength(0)
    })

    it('filters uncategorized torrents (empty category string)', () => {
      // '未分類' is used for empty/undefined categories
      const result = filterTorrents(mockTorrents, 'Breaking', 'category:未分類')
      expect(result).toHaveLength(1)
      expect(result[0].name).toBe('Breaking Bad Complete')
    })

    it('filters torrents with undefined category as uncategorized', () => {
      const result = filterTorrents(mockTorrents, 'No Category', 'category:未分類')
      expect(result).toHaveLength(1)
      expect(result[0].name).toBe('No Category Torrent')
    })
  })

  describe('Empty search returns all torrents within current filter', () => {
    it('empty search with all filter returns all torrents', () => {
      const result = filterTorrents(mockTorrents, '', 'all')
      expect(result).toHaveLength(8)
    })

    it('empty search with status filter returns all torrents with that status', () => {
      const result = filterTorrents(mockTorrents, '', 'downloading')
      expect(result).toHaveLength(4)
      expect(result.every((t) => t.state === 'downloading')).toBe(true)
    })

    it('empty search with category filter returns all torrents in that category', () => {
      const result = filterTorrents(mockTorrents, '', 'category:Linux')
      expect(result).toHaveLength(3)
      expect(result.every((t) => t.category === 'Linux')).toBe(true)
    })
  })

  describe('No matches returns empty array', () => {
    it('returns empty array for non-matching search term', () => {
      const result = filterTorrents(mockTorrents, 'zzzznonexistent', 'all')
      expect(result).toEqual([])
      expect(result).toHaveLength(0)
    })

    it('returns empty array for matching search but non-matching status', () => {
      const result = filterTorrents(mockTorrents, 'Game of Thrones', 'downloading')
      expect(result).toEqual([])
    })

    it('returns empty array for matching search but non-matching category', () => {
      const result = filterTorrents(mockTorrents, 'Fedora', 'category:Movies')
      expect(result).toEqual([])
    })

    it('returns empty array when filtering empty torrent list', () => {
      const result = filterTorrents([], 'ubuntu', 'all')
      expect(result).toEqual([])
    })
  })

  describe('Edge cases', () => {
    it('handles torrent with undefined name', () => {
      const torrentsWithUndefinedName: Array<Torrent> = [
        createMockTorrent({ hash: '1', name: undefined as any, state: 'downloading' }),
        createMockTorrent({ hash: '2', name: 'Valid Name', state: 'downloading' }),
      ]
      const result = filterTorrents(torrentsWithUndefinedName, 'valid', 'all')
      expect(result).toHaveLength(1)
      expect(result[0].name).toBe('Valid Name')
    })

    it('handles special characters in search', () => {
      const torrentsWithSpecialChars: Array<Torrent> = [
        createMockTorrent({ hash: '1', name: 'File (2024) [1080p]', state: 'downloading' }),
        createMockTorrent({ hash: '2', name: 'Regular File', state: 'downloading' }),
      ]
      const result = filterTorrents(torrentsWithSpecialChars, '(2024)', 'all')
      expect(result).toHaveLength(1)
      expect(result[0].name).toBe('File (2024) [1080p]')
    })

    it('handles brackets in search', () => {
      const torrentsWithBrackets: Array<Torrent> = [
        createMockTorrent({ hash: '1', name: 'File [1080p]', state: 'downloading' }),
        createMockTorrent({ hash: '2', name: 'File 720p', state: 'downloading' }),
      ]
      const result = filterTorrents(torrentsWithBrackets, '[1080p]', 'all')
      expect(result).toHaveLength(1)
    })

    it('handles numeric search', () => {
      const result = filterTorrents(mockTorrents, '2024', 'all')
      expect(result).toHaveLength(1) // Only 'Movie Collection 2024' matches
      expect(result[0].name).toBe('Movie Collection 2024')
    })
  })
})