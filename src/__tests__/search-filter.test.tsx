import { describe, it, expect } from 'vitest'

// Extract the filtering logic for testing
// This mimics the filteredTorrents useMemo logic from index.tsx
interface Torrent {
  name?: string
  hash: string
  state: string
  category?: string
}

function filterTorrents(
  allTorrents: Array<Torrent>,
  searchQuery: string,
  filter: string,
): Array<Torrent> {
  // First, apply search filter
  const trimmedSearch = searchQuery.trim().toLowerCase()
  let result = allTorrents

  if (trimmedSearch) {
    result = result.filter((t: Torrent) =>
      t.name?.toLowerCase().includes(trimmedSearch),
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
}

describe('Torrent Search Filtering', () => {
  const mockTorrents: Array<Torrent> = [
    {
      name: 'Ubuntu 22.04 LTS Desktop',
      hash: 'abc123',
      state: 'downloading',
      category: 'Linux',
    },
    {
      name: 'Fedora Linux 39 Workstation',
      hash: 'def456',
      state: 'pausedDL',
      category: 'Linux',
    },
    {
      name: 'Arch Linux 2024.01',
      hash: 'ghi789',
      state: 'uploading',
      category: 'Linux',
    },
    {
      name: 'Windows 11 ISO',
      hash: 'jkl012',
      state: 'downloading',
      category: 'Windows',
    },
    {
      name: 'macOS Sonoma',
      hash: 'mno345',
      state: 'pausedDL',
      category: '',
    },
  ]

  describe('Search functionality', () => {
    it('should filter torrents by name (case-insensitive)', () => {
      const result = filterTorrents(mockTorrents, 'ubuntu', 'all')
      expect(result).toHaveLength(1)
      expect(result[0].name).toBe('Ubuntu 22.04 LTS Desktop')
    })

    it('should match uppercase search against lowercase name', () => {
      const result = filterTorrents(mockTorrents, 'UBUNTU', 'all')
      expect(result).toHaveLength(1)
      expect(result[0].name).toBe('Ubuntu 22.04 LTS Desktop')
    })

    it('should match lowercase search against mixed case name', () => {
      const result = filterTorrents(mockTorrents, 'linux', 'all')
      // Fedora and Arch have "Linux" in name (Ubuntu does not have "Linux" in its name)
      expect(result).toHaveLength(2)
    })

    it('should trim whitespace from search query', () => {
      const result = filterTorrents(mockTorrents, '  ubuntu  ', 'all')
      expect(result).toHaveLength(1)
      expect(result[0].name).toBe('Ubuntu 22.04 LTS Desktop')
    })

    it('should return all torrents when search is empty', () => {
      const result = filterTorrents(mockTorrents, '', 'all')
      expect(result).toHaveLength(5)
    })

    it('should return empty array when no matches found', () => {
      const result = filterTorrents(mockTorrents, 'nonexistent', 'all')
      expect(result).toHaveLength(0)
    })

    it('should handle special characters safely', () => {
      // This should not throw and should return no matches
      const result = filterTorrents(mockTorrents, '[test]', 'all')
      expect(result).toHaveLength(0)
    })

    it('should handle torrents with undefined name', () => {
      const torrentsWithUndefined = [
        ...mockTorrents,
        { hash: 'xyz', state: 'downloading', name: undefined },
      ]
      const result = filterTorrents(torrentsWithUndefined, 'ubuntu', 'all')
      expect(result).toHaveLength(1)
    })
  })

  describe('Combined search and status filter', () => {
    it('should filter by search AND status filter', () => {
      // Search for "ubuntu" with status filter "downloading"
      const result = filterTorrents(mockTorrents, 'ubuntu', 'downloading')
      // Only Ubuntu 22.04 LTS Desktop matches "ubuntu" AND is downloading
      expect(result).toHaveLength(1)
      expect(result[0].name).toBe('Ubuntu 22.04 LTS Desktop')
    })

    it('should filter by search AND pausedDL status', () => {
      const result = filterTorrents(mockTorrents, 'linux', 'pausedDL')
      expect(result).toHaveLength(1)
      expect(result[0].name).toBe('Fedora Linux 39 Workstation')
    })
  })

  describe('Combined search and category filter', () => {
    it('should filter by search AND category filter', () => {
      const result = filterTorrents(mockTorrents, 'arch', 'category:Linux')
      expect(result).toHaveLength(1)
      expect(result[0].name).toBe('Arch Linux 2024.01')
    })

    it('should return empty when search matches but category does not', () => {
      const result = filterTorrents(mockTorrents, 'windows', 'category:Linux')
      expect(result).toHaveLength(0)
    })
  })
})
