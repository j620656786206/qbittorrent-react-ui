import { describe, it, expect } from 'vitest'

/**
 * Type definition for torrent (minimal for testing)
 */
interface Torrent {
  hash: string
  name?: string
  state?: string
  category?: string
}

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
  torrents: Torrent[],
  searchQuery: string,
  filter: string
): Torrent[] {
  let result = torrents

  // Apply search filter first (case-insensitive, trimmed)
  const trimmedQuery = searchQuery.trim().toLowerCase()
  if (trimmedQuery) {
    result = result.filter((t: Torrent) =>
      t.name?.toLowerCase().includes(trimmedQuery)
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

// Test data
const mockTorrents: Torrent[] = [
  { hash: '1', name: 'Ubuntu Server 22.04 ISO', state: 'downloading', category: 'Linux' },
  { hash: '2', name: 'ubuntu desktop 24.04', state: 'seeding', category: 'Linux' },
  { hash: '3', name: 'Fedora Workstation', state: 'downloading', category: 'Linux' },
  { hash: '4', name: 'Movie Collection 2024', state: 'paused', category: 'Movies' },
  { hash: '5', name: 'movie trailers pack', state: 'downloading', category: 'Movies' },
  { hash: '6', name: 'Game of Thrones S01', state: 'seeding', category: 'TV' },
  { hash: '7', name: 'Breaking Bad Complete', state: 'paused', category: '' },
  { hash: '8', name: 'No Category Torrent', state: 'downloading' }, // category is undefined
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
      const torrentsWithUndefinedName: Torrent[] = [
        { hash: '1', name: undefined, state: 'downloading' },
        { hash: '2', name: 'Valid Name', state: 'downloading' },
      ]
      const result = filterTorrents(torrentsWithUndefinedName, 'valid', 'all')
      expect(result).toHaveLength(1)
      expect(result[0].name).toBe('Valid Name')
    })

    it('handles special characters in search', () => {
      const torrentsWithSpecialChars: Torrent[] = [
        { hash: '1', name: 'File (2024) [1080p]', state: 'downloading' },
        { hash: '2', name: 'Regular File', state: 'downloading' },
      ]
      const result = filterTorrents(torrentsWithSpecialChars, '(2024)', 'all')
      expect(result).toHaveLength(1)
      expect(result[0].name).toBe('File (2024) [1080p]')
    })

    it('handles brackets in search', () => {
      const torrentsWithBrackets: Torrent[] = [
        { hash: '1', name: 'File [1080p]', state: 'downloading' },
        { hash: '2', name: 'File 720p', state: 'downloading' },
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