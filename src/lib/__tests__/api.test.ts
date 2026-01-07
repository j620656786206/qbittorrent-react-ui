import { describe, it, expect, beforeEach, vi } from 'vitest'
import {
  login,
  getMaindata,
  pauseTorrent,
  resumeTorrent,
  deleteTorrent,
  type MaindataResponse,
} from '../api'

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
        text: async () => 'Ok.',
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
        })
      )

      const callArgs = mockFetch.mock.calls[0][1]
      const body = callArgs.body as URLSearchParams
      expect(body.get('username')).toBe('admin')
      expect(body.get('password')).toBe('password123')
    })

    it('should login successfully with empty credentials', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        text: async () => 'Ok.',
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
        text: async () => 'Ok.',
      })

      await login(baseUrl, 'admin', 'password123')
      expect(mockFetch).toHaveBeenCalledWith(
        'http://localhost:3000/api/v2/auth/login',
        expect.any(Object)
      )
    })

    it('should throw error when response is not ok', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 401,
        text: async () => 'Unauthorized',
      })

      await expect(login(baseUrl, 'admin', 'wrong')).rejects.toThrow(
        'Login failed with status: 401'
      )
    })

    it('should throw error when response is ok but text is not "Ok."', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        text: async () => 'Fails.',
      })

      await expect(login(baseUrl, 'admin', 'password')).rejects.toThrow(
        'Login failed: Invalid credentials or other issue'
      )
    })

    it('should handle response with whitespace around "Ok."', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        text: async () => '  Ok.  ',
      })

      const result = await login(baseUrl, 'admin', 'password123')
      expect(result).toBe(true)
    })

    it('should throw error with empty response body when not ok', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
        text: async () => '',
      })

      await expect(login(baseUrl, 'admin', 'password')).rejects.toThrow(
        'No response body'
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
        json: async () => mockMaindataResponse,
      })

      const result = await getMaindata(baseUrl)
      expect(result).toEqual(mockMaindataResponse)
      expect(mockFetch).toHaveBeenCalledWith(
        `${baseUrl}/api/v2/sync/maindata`,
        expect.objectContaining({
          credentials: 'include',
        })
      )
    })

    it('should fetch maindata with rid parameter', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockMaindataResponse,
      })

      await getMaindata(baseUrl, 100)
      const callUrl = mockFetch.mock.calls[0][0]
      expect(callUrl).toContain('rid=100')
    })

    it('should fetch maindata with rid=0', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockMaindataResponse,
      })

      await getMaindata(baseUrl, 0)
      const callUrl = mockFetch.mock.calls[0][0]
      expect(callUrl).toContain('rid=0')
    })

    it('should use window.location.origin in development mode', async () => {
      import.meta.env.DEV = true
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockMaindataResponse,
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
        'Failed to fetch maindata with status: 403'
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
        json: async () => incrementalResponse,
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
        })
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
        expect.any(Object)
      )
    })

    it('should throw error when response is not ok', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 404,
      })

      await expect(pauseTorrent(baseUrl, 'abc123')).rejects.toThrow(
        'Failed to pause torrent(s) with status: 404'
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
        })
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
        expect.any(Object)
      )
    })

    it('should throw error when response is not ok', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
      })

      await expect(resumeTorrent(baseUrl, 'abc123')).rejects.toThrow(
        'Failed to resume torrent(s) with status: 500'
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
        })
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

      const result = await deleteTorrent(baseUrl, ['abc123', 'def456', 'ghi789'], false)
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
        expect.any(Object)
      )
    })

    it('should throw error when response is not ok', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 403,
      })

      await expect(deleteTorrent(baseUrl, 'abc123')).rejects.toThrow(
        'Failed to delete torrent(s) with status: 403'
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
})
