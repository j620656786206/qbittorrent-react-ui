import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  addTorrentFile,
  addTorrentMagnet,
  addTorrentTags,
  createCategory,
  createTag,
  deleteCategory,
  deleteTag,
  deleteTorrent,
  editCategory,
  getCategories,
  getMaindata,
  getPreferences,
  getTags,
  getTorrentFiles,
  login,
  pauseTorrent,
  removeTorrentTags,
  resumeTorrent,
  setPreferences,
  setTorrentCategory,
} from '../api'
import type { MaindataResponse } from '../api'

// Mock fetch
const mockFetch = vi.fn()
globalThis.fetch = mockFetch

// Mock import.meta.env
vi.stubGlobal('import.meta', {
  env: {
    DEV: false,
  },
})

// Mock window.location.origin
Object.defineProperty(globalThis, 'window', {
  value: {
    location: {
      origin: 'http://localhost:3000',
    },
  },
  writable: true,
})

describe('API Functions', () => {
  const baseUrl = 'http://192.168.1.100:8080'

  beforeEach(() => {
    vi.clearAllMocks()
    import.meta.env.DEV = false
  })

  describe('login', () => {
    it('should login successfully with valid credentials', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        text: () => Promise.resolve('Ok.'),
      })

      const result = await login(baseUrl, 'admin', 'password123')
      expect(result).toBe(true)
      expect(mockFetch).toHaveBeenCalledWith(
        `${baseUrl}/api/v2/auth/login`,
        expect.objectContaining({
          method: 'POST',
          credentials: 'include',
          headers: expect.objectContaining({
            'Content-Type': 'application/x-www-form-urlencoded',
          }),
        }),
      )

      const callArgs = mockFetch.mock.calls[0][1]
      const body = callArgs.body as URLSearchParams
      expect(body.get('username')).toBe('admin')
      expect(body.get('password')).toBe('password123')
    })

    it('should login successfully with empty credentials', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        text: () => Promise.resolve('Ok.'),
      })

      const result = await login(baseUrl)
      expect(result).toBe(true)

      const callArgs = mockFetch.mock.calls[0][1]
      const body = callArgs.body as URLSearchParams
      expect(body.get('username')).toBe('')
      expect(body.get('password')).toBe('')
    })

    it('should use window.location.origin in development mode', async () => {
      import.meta.env.DEV = true
      mockFetch.mockResolvedValueOnce({
        ok: true,
        text: () => Promise.resolve('Ok.'),
      })

      await login(baseUrl, 'admin', 'password123')
      expect(mockFetch).toHaveBeenCalledWith(
        'http://localhost:3000/api/v2/auth/login',
        expect.any(Object),
      )
    })

    it('should throw error when response is not ok', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 401,
        text: () => Promise.resolve('Unauthorized'),
      })

      await expect(login(baseUrl, 'admin', 'wrong')).rejects.toThrow(
        'Login failed with status: 401',
      )
    })

    it('should throw error when response is ok but text is not "Ok."', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        text: () => Promise.resolve('Fails.'),
      })

      await expect(login(baseUrl, 'admin', 'password')).rejects.toThrow(
        'Login failed: Invalid credentials or other issue',
      )
    })

    it('should handle response with whitespace around "Ok."', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        text: () => Promise.resolve('  Ok.  '),
      })

      const result = await login(baseUrl, 'admin', 'password123')
      expect(result).toBe(true)
    })

    it('should throw error with empty response body when not ok', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
        text: () => Promise.resolve(''),
      })

      await expect(login(baseUrl, 'admin', 'password')).rejects.toThrow(
        'No response body',
      )
    })
  })

  describe('getMaindata', () => {
    const mockMaindataResponse: MaindataResponse = {
      rid: 123,
      server_state: {
        alltime_dl: 1000000,
        alltime_ul: 500000,
        total_buffers_size: 0,
        total_peer_connections: 10,
        up_info_data: 100,
        up_info_speed: 50,
      },
      torrents: {
        abc123: { hash: 'abc123', name: 'Test Torrent', size: 1024 },
      },
      torrents_removed: [],
      full_update: true,
    }

    it('should fetch maindata without rid', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockMaindataResponse),
      })

      const result = await getMaindata(baseUrl)
      expect(result).toEqual(mockMaindataResponse)
      expect(mockFetch).toHaveBeenCalledWith(
        `${baseUrl}/api/v2/sync/maindata`,
        expect.objectContaining({
          credentials: 'include',
        }),
      )
    })

    it('should fetch maindata with rid parameter', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockMaindataResponse),
      })

      await getMaindata(baseUrl, 100)
      const callUrl = mockFetch.mock.calls[0][0]
      expect(callUrl).toContain('rid=100')
    })

    it('should fetch maindata with rid=0', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockMaindataResponse),
      })

      await getMaindata(baseUrl, 0)
      const callUrl = mockFetch.mock.calls[0][0]
      expect(callUrl).toContain('rid=0')
    })

    it('should use window.location.origin in development mode', async () => {
      import.meta.env.DEV = true
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockMaindataResponse),
      })

      await getMaindata(baseUrl)
      const callUrl = mockFetch.mock.calls[0][0]
      expect(callUrl).toContain('http://localhost:3000/api/v2/sync/maindata')
    })

    it('should throw error when response is not ok', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 403,
      })

      await expect(getMaindata(baseUrl)).rejects.toThrow(
        'Failed to fetch maindata with status: 403',
      )
    })

    it('should handle incremental update response', async () => {
      const incrementalResponse: MaindataResponse = {
        rid: 124,
        server_state: {
          alltime_dl: 1000000,
          alltime_ul: 500000,
          total_buffers_size: 0,
          total_peer_connections: 10,
          up_info_data: 100,
          up_info_speed: 50,
        },
        torrents: {
          def456: { hash: 'def456', name: 'New Torrent' },
        },
        torrents_removed: ['abc123'],
        full_update: false,
      }

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(incrementalResponse),
      })

      const result = await getMaindata(baseUrl, 123)
      expect(result.full_update).toBe(false)
      expect(result.torrents_removed).toEqual(['abc123'])
    })
  })

  describe('pauseTorrent', () => {
    it('should pause a single torrent', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
      })

      const result = await pauseTorrent(baseUrl, 'abc123')
      expect(result).toBe(true)
      expect(mockFetch).toHaveBeenCalledWith(
        `${baseUrl}/api/v2/torrents/pause`,
        expect.objectContaining({
          method: 'POST',
          credentials: 'include',
        }),
      )

      const callArgs = mockFetch.mock.calls[0][1]
      const body = callArgs.body as URLSearchParams
      expect(body.get('hashes')).toBe('abc123')
    })

    it('should pause multiple torrents', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
      })

      const result = await pauseTorrent(baseUrl, ['abc123', 'def456', 'ghi789'])
      expect(result).toBe(true)

      const callArgs = mockFetch.mock.calls[0][1]
      const body = callArgs.body as URLSearchParams
      expect(body.get('hashes')).toBe('abc123|def456|ghi789')
    })

    it('should pause empty array of torrents', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
      })

      const result = await pauseTorrent(baseUrl, [])
      expect(result).toBe(true)

      const callArgs = mockFetch.mock.calls[0][1]
      const body = callArgs.body as URLSearchParams
      expect(body.get('hashes')).toBe('')
    })

    it('should use window.location.origin in development mode', async () => {
      import.meta.env.DEV = true
      mockFetch.mockResolvedValueOnce({
        ok: true,
      })

      await pauseTorrent(baseUrl, 'abc123')
      expect(mockFetch).toHaveBeenCalledWith(
        'http://localhost:3000/api/v2/torrents/pause',
        expect.any(Object),
      )
    })

    it('should throw error when response is not ok', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 404,
      })

      await expect(pauseTorrent(baseUrl, 'abc123')).rejects.toThrow(
        'Failed to pause torrent(s) with status: 404',
      )
    })
  })

  describe('resumeTorrent', () => {
    it('should resume a single torrent', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
      })

      const result = await resumeTorrent(baseUrl, 'abc123')
      expect(result).toBe(true)
      expect(mockFetch).toHaveBeenCalledWith(
        `${baseUrl}/api/v2/torrents/resume`,
        expect.objectContaining({
          method: 'POST',
          credentials: 'include',
        }),
      )

      const callArgs = mockFetch.mock.calls[0][1]
      const body = callArgs.body as URLSearchParams
      expect(body.get('hashes')).toBe('abc123')
    })

    it('should resume multiple torrents', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
      })

      const result = await resumeTorrent(baseUrl, ['abc123', 'def456'])
      expect(result).toBe(true)

      const callArgs = mockFetch.mock.calls[0][1]
      const body = callArgs.body as URLSearchParams
      expect(body.get('hashes')).toBe('abc123|def456')
    })

    it('should resume empty array of torrents', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
      })

      const result = await resumeTorrent(baseUrl, [])
      expect(result).toBe(true)

      const callArgs = mockFetch.mock.calls[0][1]
      const body = callArgs.body as URLSearchParams
      expect(body.get('hashes')).toBe('')
    })

    it('should use window.location.origin in development mode', async () => {
      import.meta.env.DEV = true
      mockFetch.mockResolvedValueOnce({
        ok: true,
      })

      await resumeTorrent(baseUrl, 'abc123')
      expect(mockFetch).toHaveBeenCalledWith(
        'http://localhost:3000/api/v2/torrents/resume',
        expect.any(Object),
      )
    })

    it('should throw error when response is not ok', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
      })

      await expect(resumeTorrent(baseUrl, 'abc123')).rejects.toThrow(
        'Failed to resume torrent(s) with status: 500',
      )
    })
  })

  describe('deleteTorrent', () => {
    it('should delete a single torrent without deleting files', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
      })

      const result = await deleteTorrent(baseUrl, 'abc123')
      expect(result).toBe(true)
      expect(mockFetch).toHaveBeenCalledWith(
        `${baseUrl}/api/v2/torrents/delete`,
        expect.objectContaining({
          method: 'POST',
          credentials: 'include',
        }),
      )

      const callArgs = mockFetch.mock.calls[0][1]
      const body = callArgs.body as URLSearchParams
      expect(body.get('hashes')).toBe('abc123')
      expect(body.get('deleteFiles')).toBe('false')
    })

    it('should delete a single torrent with deleting files', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
      })

      const result = await deleteTorrent(baseUrl, 'abc123', true)
      expect(result).toBe(true)

      const callArgs = mockFetch.mock.calls[0][1]
      const body = callArgs.body as URLSearchParams
      expect(body.get('hashes')).toBe('abc123')
      expect(body.get('deleteFiles')).toBe('true')
    })

    it('should delete multiple torrents without deleting files', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
      })

      const result = await deleteTorrent(
        baseUrl,
        ['abc123', 'def456', 'ghi789'],
        false,
      )
      expect(result).toBe(true)

      const callArgs = mockFetch.mock.calls[0][1]
      const body = callArgs.body as URLSearchParams
      expect(body.get('hashes')).toBe('abc123|def456|ghi789')
      expect(body.get('deleteFiles')).toBe('false')
    })

    it('should delete multiple torrents with deleting files', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
      })

      const result = await deleteTorrent(baseUrl, ['abc123', 'def456'], true)
      expect(result).toBe(true)

      const callArgs = mockFetch.mock.calls[0][1]
      const body = callArgs.body as URLSearchParams
      expect(body.get('hashes')).toBe('abc123|def456')
      expect(body.get('deleteFiles')).toBe('true')
    })

    it('should delete empty array of torrents', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
      })

      const result = await deleteTorrent(baseUrl, [])
      expect(result).toBe(true)

      const callArgs = mockFetch.mock.calls[0][1]
      const body = callArgs.body as URLSearchParams
      expect(body.get('hashes')).toBe('')
    })

    it('should use window.location.origin in development mode', async () => {
      import.meta.env.DEV = true
      mockFetch.mockResolvedValueOnce({
        ok: true,
      })

      await deleteTorrent(baseUrl, 'abc123')
      expect(mockFetch).toHaveBeenCalledWith(
        'http://localhost:3000/api/v2/torrents/delete',
        expect.any(Object),
      )
    })

    it('should throw error when response is not ok', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 403,
      })

      await expect(deleteTorrent(baseUrl, 'abc123')).rejects.toThrow(
        'Failed to delete torrent(s) with status: 403',
      )
    })

    it('should handle explicit deleteFiles=false parameter', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
      })

      await deleteTorrent(baseUrl, 'abc123', false)

      const callArgs = mockFetch.mock.calls[0][1]
      const body = callArgs.body as URLSearchParams
      expect(body.get('deleteFiles')).toBe('false')
    })
  })

  describe('getCategories', () => {
    it('should fetch categories successfully', async () => {
      const mockCategories = {
        category1: { name: 'category1', savePath: '/path1' },
        category2: { name: 'category2', savePath: '/path2' },
      }
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockCategories),
      })

      const result = await getCategories(baseUrl)

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/api/v2/torrents/categories'),
        expect.objectContaining({
          credentials: 'include',
        }),
      )
      expect(result).toEqual(mockCategories)
    })

    it('should throw error when response is not ok', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 401,
      })

      await expect(getCategories(baseUrl)).rejects.toThrow(
        'Failed to fetch categories with status: 401',
      )
    })
  })

  describe('setTorrentCategory', () => {
    it('should set category for a single torrent', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
      })

      await setTorrentCategory(baseUrl, 'abc123', 'downloads')

      const callArgs = mockFetch.mock.calls[0][1]
      const body = callArgs.body as URLSearchParams
      expect(body.get('hashes')).toBe('abc123')
      expect(body.get('category')).toBe('downloads')
    })

    it('should set category for multiple torrents', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
      })

      await setTorrentCategory(baseUrl, ['abc123', 'def456'], 'movies')

      const callArgs = mockFetch.mock.calls[0][1]
      const body = callArgs.body as URLSearchParams
      expect(body.get('hashes')).toBe('abc123|def456')
      expect(body.get('category')).toBe('movies')
    })

    it('should remove category with empty string', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
      })

      await setTorrentCategory(baseUrl, 'abc123', '')

      const callArgs = mockFetch.mock.calls[0][1]
      const body = callArgs.body as URLSearchParams
      expect(body.get('category')).toBe('')
    })

    it('should throw error when response is not ok', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 400,
      })

      await expect(
        setTorrentCategory(baseUrl, 'abc123', 'test'),
      ).rejects.toThrow(
        'Failed to set category for torrent(s) with status: 400',
      )
    })
  })

  describe('addTorrentMagnet', () => {
    it('should add torrent via magnet link', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
      })

      const magnetLink = 'magnet:?xt=urn:btih:test123'
      await addTorrentMagnet(baseUrl, magnetLink)

      const callArgs = mockFetch.mock.calls[0][1]
      const body = callArgs.body as URLSearchParams
      expect(body.get('urls')).toBe(magnetLink)
    })

    it('should add torrent with savepath option', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
      })

      const magnetLink = 'magnet:?xt=urn:btih:test123'
      await addTorrentMagnet(baseUrl, magnetLink, { savepath: '/downloads' })

      const callArgs = mockFetch.mock.calls[0][1]
      const body = callArgs.body as URLSearchParams
      expect(body.get('savepath')).toBe('/downloads')
    })

    it('should add torrent with category option', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
      })

      const magnetLink = 'magnet:?xt=urn:btih:test123'
      await addTorrentMagnet(baseUrl, magnetLink, { category: 'movies' })

      const callArgs = mockFetch.mock.calls[0][1]
      const body = callArgs.body as URLSearchParams
      expect(body.get('category')).toBe('movies')
    })

    it('should add torrent with tags option', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
      })

      const magnetLink = 'magnet:?xt=urn:btih:test123'
      await addTorrentMagnet(baseUrl, magnetLink, { tags: 'tag1,tag2' })

      const callArgs = mockFetch.mock.calls[0][1]
      const body = callArgs.body as URLSearchParams
      expect(body.get('tags')).toBe('tag1,tag2')
    })

    it('should add torrent with paused option', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
      })

      const magnetLink = 'magnet:?xt=urn:btih:test123'
      await addTorrentMagnet(baseUrl, magnetLink, { paused: true })

      const callArgs = mockFetch.mock.calls[0][1]
      const body = callArgs.body as URLSearchParams
      expect(body.get('paused')).toBe('true')
    })

    it('should add torrent with all options', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
      })

      const magnetLink = 'magnet:?xt=urn:btih:test123'
      await addTorrentMagnet(baseUrl, magnetLink, {
        savepath: '/downloads',
        category: 'movies',
        tags: 'tag1,tag2',
        paused: false,
      })

      const callArgs = mockFetch.mock.calls[0][1]
      const body = callArgs.body as URLSearchParams
      expect(body.get('savepath')).toBe('/downloads')
      expect(body.get('category')).toBe('movies')
      expect(body.get('tags')).toBe('tag1,tag2')
      expect(body.get('paused')).toBe('false')
    })

    it('should throw error when response is not ok', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 415,
      })

      const magnetLink = 'magnet:?xt=urn:btih:test123'
      await expect(addTorrentMagnet(baseUrl, magnetLink)).rejects.toThrow(
        'Failed to add torrent via magnet link with status: 415',
      )
    })
  })

  describe('addTorrentFile', () => {
    it('should add torrent via file', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
      })

      const file = new File(['test'], 'test.torrent', {
        type: 'application/x-bittorrent',
      })
      await addTorrentFile(baseUrl, file)

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/api/v2/torrents/add'),
        expect.objectContaining({
          method: 'POST',
          credentials: 'include',
        }),
      )

      const callArgs = mockFetch.mock.calls[0][1]
      const body = callArgs.body as FormData
      expect(body.get('torrents')).toBe(file)
    })

    it('should add torrent file with options', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
      })

      const file = new File(['test'], 'test.torrent', {
        type: 'application/x-bittorrent',
      })
      await addTorrentFile(baseUrl, file, {
        savepath: '/downloads',
        category: 'movies',
        tags: 'tag1',
        paused: true,
      })

      const callArgs = mockFetch.mock.calls[0][1]
      const body = callArgs.body as FormData
      expect(body.get('savepath')).toBe('/downloads')
      expect(body.get('category')).toBe('movies')
      expect(body.get('tags')).toBe('tag1')
      expect(body.get('paused')).toBe('true')
    })

    it('should throw error when response is not ok', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 415,
      })

      const file = new File(['test'], 'test.torrent', {
        type: 'application/x-bittorrent',
      })
      await expect(addTorrentFile(baseUrl, file)).rejects.toThrow(
        'Failed to add torrent via file with status: 415',
      )
    })
  })

  describe('getTorrentFiles', () => {
    it('should fetch torrent files successfully', async () => {
      const mockFiles = [
        { index: 0, name: 'file1.txt', size: 1024, progress: 0.5, priority: 1 },
        { index: 1, name: 'file2.txt', size: 2048, progress: 0.8, priority: 1 },
      ]
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockFiles),
      })

      const result = await getTorrentFiles(baseUrl, 'abc123')

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/api/v2/torrents/files?hash=abc123'),
        expect.objectContaining({
          credentials: 'include',
        }),
      )
      expect(result).toEqual(mockFiles)
    })

    it('should throw error when response is not ok', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 409,
      })

      await expect(getTorrentFiles(baseUrl, 'abc123')).rejects.toThrow(
        'Failed to fetch torrent files with status: 409',
      )
    })
  })

  describe('Preferences', () => {
    describe('getPreferences', () => {
      it('should fetch preferences successfully', async () => {
        const mockPreferences = {
          download_limit: 0,
          upload_limit: 0,
          save_path: '/downloads',
          locale: 'en',
        }
        mockFetch.mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve(mockPreferences),
        })

        const result = await getPreferences(baseUrl)

        expect(mockFetch).toHaveBeenCalledWith(
          `${baseUrl}/api/v2/app/preferences`,
          expect.objectContaining({
            method: 'GET',
            credentials: 'include',
          }),
        )
        expect(result).toEqual(mockPreferences)
      })

      it('should use window.location.origin in development mode', async () => {
        import.meta.env.DEV = true
        mockFetch.mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({}),
        })

        await getPreferences(baseUrl)
        expect(mockFetch).toHaveBeenCalledWith(
          'http://localhost:3000/api/v2/app/preferences',
          expect.any(Object),
        )
      })

      it('should throw error when response is not ok', async () => {
        mockFetch.mockResolvedValueOnce({
          ok: false,
          status: 401,
        })

        await expect(getPreferences(baseUrl)).rejects.toThrow(
          'Failed to get preferences with status: 401',
        )
      })
    })

    describe('setPreferences', () => {
      it('should set preferences successfully', async () => {
        mockFetch.mockResolvedValueOnce({
          ok: true,
        })

        const payload = { download_limit: 1000, upload_limit: 500 }
        const result = await setPreferences(baseUrl, payload)

        expect(result).toBe(true)
        expect(mockFetch).toHaveBeenCalledWith(
          `${baseUrl}/api/v2/app/setPreferences`,
          expect.objectContaining({
            method: 'POST',
            credentials: 'include',
            headers: {
              'Content-Type': 'application/x-www-form-urlencoded',
            },
          }),
        )

        const callArgs = mockFetch.mock.calls[0][1]
        expect(callArgs.body).toBe(
          `json=${encodeURIComponent(JSON.stringify(payload))}`,
        )
      })

      it('should set single preference', async () => {
        mockFetch.mockResolvedValueOnce({
          ok: true,
        })

        const payload = { save_path: '/new/downloads' }
        await setPreferences(baseUrl, payload)

        const callArgs = mockFetch.mock.calls[0][1]
        expect(callArgs.body).toContain('save_path')
        expect(callArgs.body).toContain('%2Fnew%2Fdownloads')
      })

      it('should use window.location.origin in development mode', async () => {
        import.meta.env.DEV = true
        mockFetch.mockResolvedValueOnce({
          ok: true,
        })

        await setPreferences(baseUrl, {})
        expect(mockFetch).toHaveBeenCalledWith(
          'http://localhost:3000/api/v2/app/setPreferences',
          expect.any(Object),
        )
      })

      it('should throw error when response is not ok', async () => {
        mockFetch.mockResolvedValueOnce({
          ok: false,
          status: 400,
        })

        await expect(setPreferences(baseUrl, {})).rejects.toThrow(
          'Failed to set preferences with status: 400',
        )
      })
    })
  })

  describe('Tag API Functions', () => {
    describe('getTags', () => {
      it('should fetch all tags successfully', async () => {
        const mockTags = ['tag1', 'tag2', 'movies']
        mockFetch.mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve(mockTags),
        })

        const result = await getTags(baseUrl)

        expect(mockFetch).toHaveBeenCalledWith(
          `${baseUrl}/api/v2/torrents/tags`,
          expect.objectContaining({
            credentials: 'include',
          }),
        )
        expect(result).toEqual(mockTags)
      })

      it('should return empty array when no tags exist', async () => {
        mockFetch.mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve([]),
        })

        const result = await getTags(baseUrl)
        expect(result).toEqual([])
      })

      it('should use window.location.origin in development mode', async () => {
        import.meta.env.DEV = true
        mockFetch.mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve([]),
        })

        await getTags(baseUrl)
        expect(mockFetch).toHaveBeenCalledWith(
          'http://localhost:3000/api/v2/torrents/tags',
          expect.any(Object),
        )
      })

      it('should throw error when response is not ok', async () => {
        mockFetch.mockResolvedValueOnce({
          ok: false,
          status: 401,
        })

        await expect(getTags(baseUrl)).rejects.toThrow(
          'Failed to fetch tags with status: 401',
        )
      })
    })

    describe('createTag', () => {
      it('should create a single tag', async () => {
        mockFetch.mockResolvedValueOnce({
          ok: true,
        })

        const result = await createTag(baseUrl, 'newtag')

        expect(result).toBe(true)
        expect(mockFetch).toHaveBeenCalledWith(
          `${baseUrl}/api/v2/torrents/createTags`,
          expect.objectContaining({
            method: 'POST',
            credentials: 'include',
          }),
        )

        const callArgs = mockFetch.mock.calls[0][1]
        const body = callArgs.body as URLSearchParams
        expect(body.get('tags')).toBe('newtag')
      })

      it('should create multiple tags', async () => {
        mockFetch.mockResolvedValueOnce({
          ok: true,
        })

        await createTag(baseUrl, 'tag1,tag2,tag3')

        const callArgs = mockFetch.mock.calls[0][1]
        const body = callArgs.body as URLSearchParams
        expect(body.get('tags')).toBe('tag1,tag2,tag3')
      })

      it('should throw error when response is not ok', async () => {
        mockFetch.mockResolvedValueOnce({
          ok: false,
          status: 500,
        })

        await expect(createTag(baseUrl, 'newtag')).rejects.toThrow(
          'Failed to create tag(s) with status: 500',
        )
      })
    })

    describe('deleteTag', () => {
      it('should delete a single tag', async () => {
        mockFetch.mockResolvedValueOnce({
          ok: true,
        })

        const result = await deleteTag(baseUrl, 'oldtag')

        expect(result).toBe(true)
        expect(mockFetch).toHaveBeenCalledWith(
          `${baseUrl}/api/v2/torrents/deleteTags`,
          expect.objectContaining({
            method: 'POST',
            credentials: 'include',
          }),
        )

        const callArgs = mockFetch.mock.calls[0][1]
        const body = callArgs.body as URLSearchParams
        expect(body.get('tags')).toBe('oldtag')
      })

      it('should delete multiple tags', async () => {
        mockFetch.mockResolvedValueOnce({
          ok: true,
        })

        await deleteTag(baseUrl, 'tag1,tag2')

        const callArgs = mockFetch.mock.calls[0][1]
        const body = callArgs.body as URLSearchParams
        expect(body.get('tags')).toBe('tag1,tag2')
      })

      it('should throw error when response is not ok', async () => {
        mockFetch.mockResolvedValueOnce({
          ok: false,
          status: 404,
        })

        await expect(deleteTag(baseUrl, 'nonexistent')).rejects.toThrow(
          'Failed to delete tag(s) with status: 404',
        )
      })
    })

    describe('addTorrentTags', () => {
      it('should add tags to a single torrent', async () => {
        mockFetch.mockResolvedValueOnce({
          ok: true,
        })

        const result = await addTorrentTags(baseUrl, 'abc123', 'tag1,tag2')

        expect(result).toBe(true)
        expect(mockFetch).toHaveBeenCalledWith(
          `${baseUrl}/api/v2/torrents/addTags`,
          expect.objectContaining({
            method: 'POST',
            credentials: 'include',
          }),
        )

        const callArgs = mockFetch.mock.calls[0][1]
        const body = callArgs.body as URLSearchParams
        expect(body.get('hashes')).toBe('abc123')
        expect(body.get('tags')).toBe('tag1,tag2')
      })

      it('should add tags to multiple torrents', async () => {
        mockFetch.mockResolvedValueOnce({
          ok: true,
        })

        await addTorrentTags(baseUrl, ['abc123', 'def456'], 'newtag')

        const callArgs = mockFetch.mock.calls[0][1]
        const body = callArgs.body as URLSearchParams
        expect(body.get('hashes')).toBe('abc123|def456')
        expect(body.get('tags')).toBe('newtag')
      })

      it('should throw error when response is not ok', async () => {
        mockFetch.mockResolvedValueOnce({
          ok: false,
          status: 400,
        })

        await expect(addTorrentTags(baseUrl, 'abc123', 'tag')).rejects.toThrow(
          'Failed to add tags with status: 400',
        )
      })
    })

    describe('removeTorrentTags', () => {
      it('should remove tags from a single torrent', async () => {
        mockFetch.mockResolvedValueOnce({
          ok: true,
        })

        const result = await removeTorrentTags(baseUrl, 'abc123', 'tag1,tag2')

        expect(result).toBe(true)
        expect(mockFetch).toHaveBeenCalledWith(
          `${baseUrl}/api/v2/torrents/removeTags`,
          expect.objectContaining({
            method: 'POST',
            credentials: 'include',
          }),
        )

        const callArgs = mockFetch.mock.calls[0][1]
        const body = callArgs.body as URLSearchParams
        expect(body.get('hashes')).toBe('abc123')
        expect(body.get('tags')).toBe('tag1,tag2')
      })

      it('should remove tags from multiple torrents', async () => {
        mockFetch.mockResolvedValueOnce({
          ok: true,
        })

        await removeTorrentTags(baseUrl, ['abc123', 'def456'], 'oldtag')

        const callArgs = mockFetch.mock.calls[0][1]
        const body = callArgs.body as URLSearchParams
        expect(body.get('hashes')).toBe('abc123|def456')
        expect(body.get('tags')).toBe('oldtag')
      })

      it('should throw error when response is not ok', async () => {
        mockFetch.mockResolvedValueOnce({
          ok: false,
          status: 400,
        })

        await expect(
          removeTorrentTags(baseUrl, 'abc123', 'tag'),
        ).rejects.toThrow('Failed to remove tags with status: 400')
      })
    })
  })

  describe('Category API Functions', () => {
    describe('createCategory', () => {
      it('should create a category without save path', async () => {
        mockFetch.mockResolvedValueOnce({
          ok: true,
        })

        const result = await createCategory(baseUrl, 'movies')

        expect(result).toBe(true)
        expect(mockFetch).toHaveBeenCalledWith(
          `${baseUrl}/api/v2/torrents/createCategory`,
          expect.objectContaining({
            method: 'POST',
            credentials: 'include',
          }),
        )

        const callArgs = mockFetch.mock.calls[0][1]
        const body = callArgs.body as URLSearchParams
        expect(body.get('category')).toBe('movies')
        expect(body.get('savePath')).toBeNull()
      })

      it('should create a category with save path', async () => {
        mockFetch.mockResolvedValueOnce({
          ok: true,
        })

        await createCategory(baseUrl, 'movies', '/downloads/movies')

        const callArgs = mockFetch.mock.calls[0][1]
        const body = callArgs.body as URLSearchParams
        expect(body.get('category')).toBe('movies')
        expect(body.get('savePath')).toBe('/downloads/movies')
      })

      it('should use window.location.origin in development mode', async () => {
        import.meta.env.DEV = true
        mockFetch.mockResolvedValueOnce({
          ok: true,
        })

        await createCategory(baseUrl, 'test')
        expect(mockFetch).toHaveBeenCalledWith(
          'http://localhost:3000/api/v2/torrents/createCategory',
          expect.any(Object),
        )
      })

      it('should throw error when response is not ok', async () => {
        mockFetch.mockResolvedValueOnce({
          ok: false,
          status: 409,
        })

        await expect(createCategory(baseUrl, 'movies')).rejects.toThrow(
          'Failed to create category with status: 409',
        )
      })
    })

    describe('editCategory', () => {
      it('should edit a category save path', async () => {
        mockFetch.mockResolvedValueOnce({
          ok: true,
        })

        const result = await editCategory(baseUrl, 'movies', '/new/path')

        expect(result).toBe(true)
        expect(mockFetch).toHaveBeenCalledWith(
          `${baseUrl}/api/v2/torrents/editCategory`,
          expect.objectContaining({
            method: 'POST',
            credentials: 'include',
          }),
        )

        const callArgs = mockFetch.mock.calls[0][1]
        const body = callArgs.body as URLSearchParams
        expect(body.get('category')).toBe('movies')
        expect(body.get('savePath')).toBe('/new/path')
      })

      it('should use window.location.origin in development mode', async () => {
        import.meta.env.DEV = true
        mockFetch.mockResolvedValueOnce({
          ok: true,
        })

        await editCategory(baseUrl, 'test', '/path')
        expect(mockFetch).toHaveBeenCalledWith(
          'http://localhost:3000/api/v2/torrents/editCategory',
          expect.any(Object),
        )
      })

      it('should throw error when response is not ok', async () => {
        mockFetch.mockResolvedValueOnce({
          ok: false,
          status: 400,
        })

        await expect(editCategory(baseUrl, 'movies', '/path')).rejects.toThrow(
          'Failed to edit category with status: 400',
        )
      })
    })

    describe('deleteCategory', () => {
      it('should delete a single category', async () => {
        mockFetch.mockResolvedValueOnce({
          ok: true,
        })

        const result = await deleteCategory(baseUrl, 'movies')

        expect(result).toBe(true)
        expect(mockFetch).toHaveBeenCalledWith(
          `${baseUrl}/api/v2/torrents/removeCategories`,
          expect.objectContaining({
            method: 'POST',
            credentials: 'include',
          }),
        )

        const callArgs = mockFetch.mock.calls[0][1]
        const body = callArgs.body as URLSearchParams
        expect(body.get('categories')).toBe('movies')
      })

      it('should delete multiple categories (newline-separated)', async () => {
        mockFetch.mockResolvedValueOnce({
          ok: true,
        })

        await deleteCategory(baseUrl, 'movies\ntv\nmusic')

        const callArgs = mockFetch.mock.calls[0][1]
        const body = callArgs.body as URLSearchParams
        expect(body.get('categories')).toBe('movies\ntv\nmusic')
      })

      it('should use window.location.origin in development mode', async () => {
        import.meta.env.DEV = true
        mockFetch.mockResolvedValueOnce({
          ok: true,
        })

        await deleteCategory(baseUrl, 'test')
        expect(mockFetch).toHaveBeenCalledWith(
          'http://localhost:3000/api/v2/torrents/removeCategories',
          expect.any(Object),
        )
      })

      it('should throw error when response is not ok', async () => {
        mockFetch.mockResolvedValueOnce({
          ok: false,
          status: 404,
        })

        await expect(deleteCategory(baseUrl, 'nonexistent')).rejects.toThrow(
          'Failed to delete category with status: 404',
        )
      })
    })
  })
})
