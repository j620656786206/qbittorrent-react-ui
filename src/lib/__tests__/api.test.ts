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
  getLogs,
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
import type { LogEntry, MaindataResponse } from '../api'

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
      expect(result).toEqual(mockCategories)
      expect(mockFetch).toHaveBeenCalledWith(
        `${baseUrl}/api/v2/torrents/categories`,
        expect.objectContaining({
          credentials: 'include',
        }),
      )
    })

    it('should use window.location.origin in development mode', async () => {
      import.meta.env.DEV = true
      const mockCategories = {
        category1: { name: 'category1', savePath: '/path1' },
      }
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockCategories),
      })

      await getCategories(baseUrl)
      const callUrl = mockFetch.mock.calls[0][0]
      expect(callUrl).toContain('http://localhost:3000/api/v2/torrents/categories')
    })

    it('should throw error when response is not ok', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 403,
      })

      await expect(getCategories(baseUrl)).rejects.toThrow(
        'Failed to fetch categories with status: 403',
      )
    })
  })

  describe('setTorrentCategory', () => {
    it('should set category for a single torrent', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
      })

      const result = await setTorrentCategory(baseUrl, 'abc123', 'movies')
      expect(result).toBe(true)
      expect(mockFetch).toHaveBeenCalledWith(
        `${baseUrl}/api/v2/torrents/setCategory`,
        expect.objectContaining({
          method: 'POST',
          credentials: 'include',
        }),
      )

      const callArgs = mockFetch.mock.calls[0][1]
      const body = callArgs.body as URLSearchParams
      expect(body.get('hashes')).toBe('abc123')
      expect(body.get('category')).toBe('movies')
    })

    it('should set category for multiple torrents', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
      })

      const result = await setTorrentCategory(
        baseUrl,
        ['abc123', 'def456'],
        'tv',
      )
      expect(result).toBe(true)

      const callArgs = mockFetch.mock.calls[0][1]
      const body = callArgs.body as URLSearchParams
      expect(body.get('hashes')).toBe('abc123|def456')
      expect(body.get('category')).toBe('tv')
    })

    it('should use window.location.origin in development mode', async () => {
      import.meta.env.DEV = true
      mockFetch.mockResolvedValueOnce({
        ok: true,
      })

      await setTorrentCategory(baseUrl, 'abc123', 'movies')
      expect(mockFetch).toHaveBeenCalledWith(
        'http://localhost:3000/api/v2/torrents/setCategory',
        expect.any(Object),
      )
    })

    it('should throw error when response is not ok', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 403,
      })

      await expect(
        setTorrentCategory(baseUrl, 'abc123', 'movies'),
      ).rejects.toThrow('Failed to set torrent category with status: 403')
    })
  })

  describe('getTorrentFiles', () => {
    it('should fetch torrent files successfully', async () => {
      const mockFiles = [
        {
          index: 0,
          name: 'file1.txt',
          size: 1024,
          progress: 1,
          priority: 1,
          is_seed: true,
          piece_range: [0, 10],
          availability: 1,
        },
      ]
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockFiles),
      })

      const result = await getTorrentFiles(baseUrl, 'abc123')
      expect(result).toEqual(mockFiles)
      expect(mockFetch).toHaveBeenCalledWith(
        `${baseUrl}/api/v2/torrents/files?hash=abc123`,
        expect.objectContaining({
          credentials: 'include',
        }),
      )
    })

    it('should use window.location.origin in development mode', async () => {
      import.meta.env.DEV = true
      const mockFiles: any[] = []
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockFiles),
      })

      await getTorrentFiles(baseUrl, 'abc123')
      const callUrl = mockFetch.mock.calls[0][0]
      expect(callUrl).toContain('http://localhost:3000/api/v2/torrents/files')
    })

    it('should throw error when response is not ok', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 404,
      })

      await expect(getTorrentFiles(baseUrl, 'abc123')).rejects.toThrow(
        'Failed to fetch torrent files with status: 404',
      )
    })
  })

  describe('addTorrentFile', () => {
    it('should add torrent from file successfully', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        text: () => Promise.resolve('Ok.'),
      })

      const file = new File(['test'], 'test.torrent', { type: 'application/octet-stream' })
      const result = await addTorrentFile(baseUrl, file)
      expect(result).toBe(true)
      expect(mockFetch).toHaveBeenCalledWith(
        `${baseUrl}/api/v2/torrents/add`,
        expect.objectContaining({
          method: 'POST',
          credentials: 'include',
        }),
      )
    })

    it('should use window.location.origin in development mode', async () => {
      import.meta.env.DEV = true
      mockFetch.mockResolvedValueOnce({
        ok: true,
        text: () => Promise.resolve('Ok.'),
      })

      const file = new File(['test'], 'test.torrent', { type: 'application/octet-stream' })
      await addTorrentFile(baseUrl, file)
      const callUrl = mockFetch.mock.calls[0][0]
      expect(callUrl).toContain('http://localhost:3000/api/v2/torrents/add')
    })

    it('should throw error when response is not ok', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 415,
      })

      const file = new File(['test'], 'test.torrent', { type: 'application/octet-stream' })
      await expect(addTorrentFile(baseUrl, file)).rejects.toThrow(
        'Failed to add torrent with status: 415',
      )
    })
  })

  describe('addTorrentMagnet', () => {
    it('should add torrent from magnet link successfully', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        text: () => Promise.resolve('Ok.'),
      })

      const result = await addTorrentMagnet(baseUrl, 'magnet:?xt=urn:btih:test')
      expect(result).toBe(true)
      expect(mockFetch).toHaveBeenCalledWith(
        `${baseUrl}/api/v2/torrents/add`,
        expect.objectContaining({
          method: 'POST',
          credentials: 'include',
        }),
      )

      const callArgs = mockFetch.mock.calls[0][1]
      const body = callArgs.body as URLSearchParams
      expect(body.get('urls')).toBe('magnet:?xt=urn:btih:test')
    })

    it('should use window.location.origin in development mode', async () => {
      import.meta.env.DEV = true
      mockFetch.mockResolvedValueOnce({
        ok: true,
        text: () => Promise.resolve('Ok.'),
      })

      await addTorrentMagnet(baseUrl, 'magnet:?xt=urn:btih:test')
      const callUrl = mockFetch.mock.calls[0][0]
      expect(callUrl).toContain('http://localhost:3000/api/v2/torrents/add')
    })

    it('should throw error when response is not ok', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 400,
      })

      await expect(
        addTorrentMagnet(baseUrl, 'invalid_magnet'),
      ).rejects.toThrow('Failed to add torrent with status: 400')
    })
  })

  describe('createCategory', () => {
    it('should create category successfully', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
      })

      const result = await createCategory(baseUrl, 'movies', '/path/to/movies')
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
      expect(body.get('savePath')).toBe('/path/to/movies')
    })

    it('should use window.location.origin in development mode', async () => {
      import.meta.env.DEV = true
      mockFetch.mockResolvedValueOnce({
        ok: true,
      })

      await createCategory(baseUrl, 'movies', '/path/to/movies')
      const callUrl = mockFetch.mock.calls[0][0]
      expect(callUrl).toContain('http://localhost:3000/api/v2/torrents/createCategory')
    })

    it('should throw error when response is not ok', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 409,
      })

      await expect(
        createCategory(baseUrl, 'movies', '/path/to/movies'),
      ).rejects.toThrow('Failed to create category with status: 409')
    })
  })

  describe('editCategory', () => {
    it('should edit category successfully', async () => {
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

      await editCategory(baseUrl, 'movies', '/new/path')
      constcallUrl = mockFetch.mock.calls[0][0]
      expect(callUrl).toContain('http://localhost:3000/api/v2/torrents/editCategory')
    })

    it('should throw error when response is not ok', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 404,
      })

      await expect(
        editCategory(baseUrl, 'movies', '/new/path'),
      ).rejects.toThrow('Failed to edit category with status: 404')
    })
  })

  describe('deleteCategory', () => {
    it('should delete category successfully', async () => {
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

    it('should delete multiple categories', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
      })

      const result = await deleteCategory(baseUrl, ['movies', 'tv'])
      expect(result).toBe(true)

      const callArgs = mockFetch.mock.calls[0][1]
      const body = callArgs.body as URLSearchParams
      expect(body.get('categories')).toBe('movies|tv')
    })

    it('should use window.location.origin in development mode', async () => {
      import.meta.env.DEV = true
      mockFetch.mockResolvedValueOnce({
        ok: true,
      })

      await deleteCategory(baseUrl, 'movies')
      const callUrl = mockFetch.mock.calls[0][0]
      expect(callUrl).toContain('http://localhost:3000/api/v2/torrents/removeCategories')
    })

    it('should throw error when response is not ok', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 404,
      })

      await expect(deleteCategory(baseUrl, 'movies')).rejects.toThrow(
        'Failed to delete category with status: 404',
      )
    })
  })

  describe('getTags', () => {
    it('should fetch tags successfully', async () => {
      const mockTags = ['tag1', 'tag2', 'tag3']
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockTags),
      })

      const result = await getTags(baseUrl)
      expect(result).toEqual(mockTags)
      expect(mockFetch).toHaveBeenCalledWith(
        `${baseUrl}/api/v2/torrents/tags`,
        expect.objectContaining({
          credentials: 'include',
        }),
      )
    })

    it('should use window.location.origin in development mode', async () => {
      import.meta.env.DEV = true
      const mockTags = ['tag1']
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockTags),
      })

      await getTags(baseUrl)
      const callUrl = mockFetch.mock.calls[0][0]
      expect(callUrl).toContain('http://localhost:3000/api/v2/torrents/tags')
    })

    it('should throw error when response is not ok', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 403,
      })

      await expect(getTags(baseUrl)).rejects.toThrow(
        'Failed to fetch tags with status: 403',
      )
    })
  })

  describe('createTag', () => {
    it('should create tag successfully', async () => {
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

      const result = await createTag(baseUrl, ['tag1', 'tag2'])
      expect(result).toBe(true)

      const callArgs = mockFetch.mock.calls[0][1]
      const body = callArgs.body as URLSearchParams
      expect(body.get('tags')).toBe('tag1,tag2')
    })

    it('should use window.location.origin in development mode', async () => {
      import.meta.env.DEV = true
      mockFetch.mockResolvedValueOnce({
        ok: true,
      })

      await createTag(baseUrl, 'newtag')
      const callUrl = mockFetch.mock.calls[0][0]
      expect(callUrl).toContain('http://localhost:3000/api/v2/torrents/createTags')
    })

    it('should throw error when response is not ok', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 409,
      })

      await expect(createTag(baseUrl, 'newtag')).rejects.toThrow(
        'Failed to create tag with status: 409',
      )
    })
  })

  describe('deleteTag', () => {
    it('should delete tag successfully', async () => {
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

      const result = await deleteTag(baseUrl, ['tag1', 'tag2'])
      expect(result).toBe(true)

      const callArgs = mockFetch.mock.calls[0][1]
      const body = callArgs.body as URLSearchParams
      expect(body.get('tags')).toBe('tag1,tag2')
    })

    it('should use window.location.origin in development mode', async () => {
      import.meta.env.DEV = true
      mockFetch.mockResolvedValueOnce({
        ok: true,
      })

      await deleteTag(baseUrl, 'oldtag')
      const callUrl = mockFetch.mock.calls[0][0]
      expect(callUrl).toContain('http://localhost:3000/api/v2/torrents/deleteTags')
    })

    it('should throw error when response is not ok', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 404,
      })

      await expect(deleteTag(baseUrl, 'oldtag')).rejects.toThrow(
        'Failed to delete tag with status: 404',
      )
    })
  })

  describe('addTorrentTags', () => {
    it('should add tags to a single torrent', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
      })

      const result = await addTorrentTags(baseUrl, 'abc123', 'tag1')
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
      expect(body.get('tags')).toBe('tag1')
    })

    it('should add multiple tags to a single torrent', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
      })

      const result = await addTorrentTags(baseUrl, 'abc123', ['tag1', 'tag2'])
      expect(result).toBe(true)

      const callArgs = mockFetch.mock.calls[0][1]
      const body = callArgs.body as URLSearchParams
      expect(body.get('hashes')).toBe('abc123')
      expect(body.get('tags')).toBe('tag1,tag2')
    })

    it('should add tags to multiple torrents', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
      })

      const result = await addTorrentTags(baseUrl, ['abc123', 'def456'], 'tag1')
      expect(result).toBe(true)

      const callArgs = mockFetch.mock.calls[0][1]
      const body = callArgs.body as URLSearchParams
      expect(body.get('hashes')).toBe('abc123|def456')
      expect(body.get('tags')).toBe('tag1')
    })

    it('should use window.location.origin in development mode', async () => {
      import.meta.env.DEV = true
      mockFetch.mockResolvedValueOnce({
        ok: true,
      })

      await addTorrentTags(baseUrl, 'abc123', 'tag1')
      const callUrl = mockFetch.mock.calls[0][0]
      expect(callUrl).toContain('http://localhost:3000/api/v2/torrents/addTags')
    })

    it('should throw error when response is not ok', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 404,
      })

      await expect(addTorrentTags(baseUrl, 'abc123', 'tag1')).rejects.toThrow(
        'Failed to add tags to torrent(s) with status: 404',
      )
    })
  })

  describe('removeTorrentTags', () => {
    it('should remove tags from a single torrent', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
      })

      const result = await removeTorrentTags(baseUrl, 'abc123', 'tag1')
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
      expect(body.get('tags')).toBe('tag1')
    })

    it('should remove multiple tags from a single torrent', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
      })

      const result = await removeTorrentTags(baseUrl, 'abc123', ['tag1', 'tag2'])
      expect(result).toBe(true)

      const callArgs = mockFetch.mock.calls[0][1]
      const body = callArgs.body as URLSearchParams
      expect(body.get('hashes')).toBe('abc123')
      expect(body.get('tags')).toBe('tag1,tag2')
    })

    it('should remove tags from multiple torrents', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
      })

      const result = await removeTorrentTags(baseUrl, ['abc123', 'def456'], 'tag1')
      expect(result).toBe(true)

      const callArgs = mockFetch.mock.calls[0][1]
      const body = callArgs.body as URLSearchParams
      expect(body.get('hashes')).toBe('abc123|def456')
      expect(body.get('tags')).toBe('tag1')
    })

    it('should use window.location.origin in development mode', async () => {
      import.meta.env.DEV = true
      mockFetch.mockResolvedValueOnce({
        ok: true,
      })

      await removeTorrentTags(baseUrl, 'abc123', 'tag1')
      const callUrl = mockFetch.mock.calls[0][0]
      expect(callUrl).toContain('http://localhost:3000/api/v2/torrents/removeTags')
    })

    it('should throw error when response is not ok', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 404,
      })

      await expect(removeTorrentTags(baseUrl, 'abc123', 'tag1')).rejects.toThrow(
        'Failed to remove tags from torrent(s) with status: 404',
      )
    })
  })

  describe('getPreferences', () => {
    it('should fetch preferences successfully', async () => {
      const mockPreferences = {
        locale: 'en',
        save_path: '/downloads',
      }
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockPreferences),
      })

      const result = await getPreferences(baseUrl)
      expect(result).toEqual(mockPreferences)
      expect(mockFetch).toHaveBeenCalledWith(
        `${baseUrl}/api/v2/app/preferences`,
        expect.objectContaining({
          credentials: 'include',
        }),
      )
    })

    it('should use window.location.origin in development mode', async () => {
      import.meta.env.DEV = true
      const mockPreferences = { locale: 'en' }
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockPreferences),
      })

      await getPreferences(baseUrl)
      const callUrl = mockFetch.mock.calls[0][0]
      expect(callUrl).toContain('http://localhost:3000/api/v2/app/preferences')
    })

    it('should throw error when response is not ok', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 403,
      })

      await expect(getPreferences(baseUrl)).rejects.toThrow(
        'Failed to fetch preferences with status: 403',
      )
    })
  })

  describe('setPreferences', () => {
    it('should set preferences successfully', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
      })

      const preferences = { locale: 'en' }
      const result = await setPreferences(baseUrl, preferences)
      expect(result).toBe(true)
      expect(mockFetch).toHaveBeenCalledWith(
        `${baseUrl}/api/v2/app/setPreferences`,
        expect.objectContaining({
          method: 'POST',
          credentials: 'include',
        }),
      )

      const callArgs = mockFetch.mock.calls[0][1]
      const body = callArgs.body as URLSearchParams
      expect(body.get('json')).toBe('{"locale":"en"}')
    })

    it('should use window.location.origin in development mode', async () => {
      import.meta.env.DEV = true
      mockFetch.mockResolvedValueOnce({
        ok: true,
      })

      const preferences = { locale: 'en' }
      await setPreferences(baseUrl, preferences)
      const callUrl = mockFetch.mock.calls[0][0]
      expect(callUrl).toContain('http://localhost:3000/api/v2/app/setPreferences')
    })

    it('should throw error when response is not ok', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 400,
      })

      const preferences = { locale: 'en' }
      await expect(setPreferences(baseUrl, preferences)).rejects.toThrow(
        'Failed to set preferences with status: 400',
      )
    })
  })

  describe('getLogs', () => {
    it('should fetch logs successfully', async () => {
      const mockLogs: LogEntry[] = [
        {
          id: 1,
          message: 'Log entry 1',
          type: 'info',
          timestamp: 1234567890,
        },
        {
          id: 2,
          message: 'Log entry 2',
          type: 'warning',
          timestamp: 1234567891,
        },
      ]
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockLogs),
      })

      const result = await getLogs(baseUrl)
      expect(result).toEqual(mockLogs)
      expect(mockFetch).toHaveBeenCalledWith(
        `${baseUrl}/api/v2/log/main`,
        expect.objectContaining({
          credentials: 'include',
        }),
      )
    })

    it('should fetch logs with last_known_id parameter', async () => {
      const mockLogs: LogEntry[] = []
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockLogs),
      })

      await getLogs(baseUrl, 5)
      const callUrl = mockFetch.mock.calls[0][0]
      expect(callUrl).toContain('last_known_id=5')
    })

    it('should use window.location.origin in development mode', async () => {
      import.meta.env.DEV = true
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve([]),
      })

      await getLogs(baseUrl)
      const callUrl = mockFetch.mock.calls[0][0]
      expect(callUrl).toContain('http://localhost:3000/api/v2/log/main')
    })

    it('should throw error when response is not ok', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 403,
      })

      await expect(getLogs(baseUrl)).rejects.toThrow(
        'Failed to fetch logs with status: 403',
      )
    })
  })
})