import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { userEvent } from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { AddTorrentModal } from '../add-torrent-modal'

/**
 * Mock react-i18next
 */
vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => {
      const translations: Record<string, string> = {
        'addTorrent.title': 'Add Torrent',
        'addTorrent.description': 'Add a new torrent from magnet link or file',
        'addTorrent.tabs.magnetLink': 'Magnet Link',
        'addTorrent.tabs.file': 'Torrent File',
        'addTorrent.magnetLink.label': 'Magnet Link',
        'addTorrent.magnetLink.placeholder': 'magnet:?xt=urn:btih:...',
        'addTorrent.file.label': 'Torrent File',
        'addTorrent.file.noFile': 'No file selected',
        'addTorrent.file.browse': 'Browse',
        'addTorrent.savePath.label': 'Save Path',
        'addTorrent.savePath.placeholder': '/downloads',
        'addTorrent.category.label': 'Category',
        'addTorrent.category.none': 'None',
        'addTorrent.tags.label': 'Tags',
        'addTorrent.tags.placeholder': 'Select tags',
        'addTorrent.startPaused': 'Start paused',
        'addTorrent.add': 'Add',
        'addTorrent.adding': 'Adding...',
        'addTorrent.error.invalidMagnet': 'Invalid magnet link',
        'addTorrent.error.noFile': 'Please select a file',
        'addTorrent.error.failed': 'Failed to add torrent',
        'common.cancel': 'Cancel',
      }
      return translations[key] || key
    },
  }),
}))

/**
 * Mock API functions
 */
vi.mock('@/lib/api', () => ({
  addTorrentMagnet: vi.fn(),
  addTorrentFile: vi.fn(),
  getCategories: vi.fn(),
}))

/**
 * Mock tag storage functions
 */
vi.mock('@/lib/tag-storage', () => ({
  getTags: vi.fn(() => []),
  formatTagString: vi.fn((tags: string[]) => tags.join(',')),
}))

import { addTorrentMagnet, addTorrentFile, getCategories } from '@/lib/api'
import { getTags } from '@/lib/tag-storage'

/**
 * Helper to wrap component with QueryClientProvider
 */
function renderAddTorrentModal(props: React.ComponentProps<typeof AddTorrentModal>) {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  })
  return {
    queryClient,
    ...render(
      <QueryClientProvider client={queryClient}>
        <AddTorrentModal {...props} />
      </QueryClientProvider>
    ),
  }
}

describe('AddTorrentModal Component', () => {
  beforeEach(() => {
    // Clear localStorage
    localStorage.clear()
    // Set default base URL
    localStorage.setItem('qbit_baseUrl', 'http://localhost:8080')
    // Clear all mocks
    vi.clearAllMocks()
    // Mock getCategories to return some categories
    vi.mocked(getCategories).mockResolvedValue({
      'Movies': {},
      'TV Shows': {},
      'Music': {},
    })
  })

  describe('Modal Open/Close Behavior', () => {
    it('does not render when isOpen is false', () => {
      const mockOnClose = vi.fn()
      renderAddTorrentModal({ isOpen: false, onClose: mockOnClose })

      expect(screen.queryByText('Add Torrent')).not.toBeInTheDocument()
    })

    it('renders when isOpen is true', () => {
      const mockOnClose = vi.fn()
      renderAddTorrentModal({ isOpen: true, onClose: mockOnClose })

      expect(screen.getByText('Add Torrent')).toBeInTheDocument()
      expect(screen.getByText('Add a new torrent from magnet link or file')).toBeInTheDocument()
    })

    it('calls onClose when cancel button is clicked', async () => {
      const user = userEvent.setup()
      const mockOnClose = vi.fn()
      renderAddTorrentModal({ isOpen: true, onClose: mockOnClose })

      const cancelButton = screen.getByRole('button', { name: 'Cancel' })
      await user.click(cancelButton)

      expect(mockOnClose).toHaveBeenCalledTimes(1)
    })
  })

  describe('Tab Switching', () => {
    it('defaults to magnet link tab', () => {
      const mockOnClose = vi.fn()
      renderAddTorrentModal({ isOpen: true, onClose: mockOnClose })

      const magnetInput = screen.getByLabelText('Magnet Link')
      expect(magnetInput).toBeInTheDocument()

      // File input should not be visible
      expect(screen.queryByPlaceholderText('No file selected')).not.toBeInTheDocument()
    })

    it('switches to file tab when file tab button is clicked', async () => {
      const user = userEvent.setup()
      const mockOnClose = vi.fn()
      renderAddTorrentModal({ isOpen: true, onClose: mockOnClose })

      const fileTabButton = screen.getByRole('button', { name: /Torrent File/i })
      await user.click(fileTabButton)

      expect(screen.getByPlaceholderText('No file selected')).toBeInTheDocument()
      expect(screen.getByRole('button', { name: 'Browse' })).toBeInTheDocument()
    })

    it('switches back to magnet tab when magnet tab button is clicked', async () => {
      const user = userEvent.setup()
      const mockOnClose = vi.fn()
      renderAddTorrentModal({ isOpen: true, onClose: mockOnClose })

      // Switch to file tab
      const fileTabButton = screen.getByRole('button', { name: /Torrent File/i })
      await user.click(fileTabButton)
      expect(screen.getByPlaceholderText('No file selected')).toBeInTheDocument()

      // Switch back to magnet tab
      const magnetTabButton = screen.getByRole('button', { name: /Magnet Link/i })
      await user.click(magnetTabButton)
      expect(screen.getByLabelText('Magnet Link')).toBeInTheDocument()
    })
  })

  describe('Form Input Handling - Magnet Link', () => {
    it('allows user to type in magnet link field', async () => {
      const user = userEvent.setup()
      const mockOnClose = vi.fn()
      renderAddTorrentModal({ isOpen: true, onClose: mockOnClose })

      const magnetInput = screen.getByLabelText('Magnet Link') as HTMLInputElement
      await user.type(magnetInput, 'magnet:?xt=urn:btih:test123')

      expect(magnetInput.value).toBe('magnet:?xt=urn:btih:test123')
    })

    it('clears error when typing in magnet link field', async () => {
      const user = userEvent.setup()
      const mockOnClose = vi.fn()
      renderAddTorrentModal({ isOpen: true, onClose: mockOnClose })

      // Try to submit without magnet link to trigger error
      const addButton = screen.getByRole('button', { name: 'Add' })
      await user.click(addButton)

      expect(screen.getByText('Invalid magnet link')).toBeInTheDocument()

      // Type in magnet link field
      const magnetInput = screen.getByLabelText('Magnet Link')
      await user.type(magnetInput, 'magnet:?xt=urn:btih:test')

      // Error should be cleared
      expect(screen.queryByText('Invalid magnet link')).not.toBeInTheDocument()
    })
  })

  describe('Form Input Handling - File Upload', () => {
    it('displays selected file name', async () => {
      const user = userEvent.setup()
      const mockOnClose = vi.fn()
      renderAddTorrentModal({ isOpen: true, onClose: mockOnClose })

      // Switch to file tab
      const fileTabButton = screen.getByRole('button', { name: /Torrent File/i })
      await user.click(fileTabButton)

      // Create a mock file
      const file = new File(['torrent content'], 'ubuntu.torrent', { type: 'application/x-bittorrent' })
      const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement

      await user.upload(fileInput, file)

      // File name should be displayed
      const displayInput = screen.getByDisplayValue('ubuntu.torrent')
      expect(displayInput).toBeInTheDocument()
    })

    it('clears error when file is selected', async () => {
      const user = userEvent.setup()
      const mockOnClose = vi.fn()
      renderAddTorrentModal({ isOpen: true, onClose: mockOnClose })

      // Switch to file tab
      const fileTabButton = screen.getByRole('button', { name: /Torrent File/i })
      await user.click(fileTabButton)

      // Try to submit without file to trigger error
      const addButton = screen.getByRole('button', { name: 'Add' })
      await user.click(addButton)

      expect(screen.getByText('Please select a file')).toBeInTheDocument()

      // Select a file
      const file = new File(['torrent content'], 'test.torrent', { type: 'application/x-bittorrent' })
      const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement
      await user.upload(fileInput, file)

      // Error should be cleared
      expect(screen.queryByText('Please select a file')).not.toBeInTheDocument()
    })
  })

  describe('Form Input Handling - Other Fields', () => {
    it('allows user to type in save path field', async () => {
      const user = userEvent.setup()
      const mockOnClose = vi.fn()
      renderAddTorrentModal({ isOpen: true, onClose: mockOnClose })

      const savePathInput = screen.getByLabelText('Save Path') as HTMLInputElement
      await user.type(savePathInput, '/downloads/torrents')

      expect(savePathInput.value).toBe('/downloads/torrents')
    })

    it('allows user to select a category', async () => {
      const user = userEvent.setup()
      const mockOnClose = vi.fn()
      renderAddTorrentModal({ isOpen: true, onClose: mockOnClose })

      // Wait for categories to load
      await waitFor(() => {
        expect(screen.getByRole('option', { name: 'Movies' })).toBeInTheDocument()
      })

      const categorySelect = screen.getByLabelText('Category') as HTMLSelectElement
      await user.selectOptions(categorySelect, 'Movies')

      expect(categorySelect.value).toBe('Movies')
    })

    it('displays categories from API', async () => {
      const mockOnClose = vi.fn()
      renderAddTorrentModal({ isOpen: true, onClose: mockOnClose })

      await waitFor(() => {
        expect(screen.getByRole('option', { name: 'Movies' })).toBeInTheDocument()
      })

      expect(screen.getByRole('option', { name: 'TV Shows' })).toBeInTheDocument()
      expect(screen.getByRole('option', { name: 'Music' })).toBeInTheDocument()
    })

    it('allows user to toggle start paused checkbox', async () => {
      const user = userEvent.setup()
      const mockOnClose = vi.fn()
      renderAddTorrentModal({ isOpen: true, onClose: mockOnClose })

      const checkbox = screen.getByLabelText('Start paused') as HTMLInputElement
      expect(checkbox.checked).toBe(false)

      await user.click(checkbox)
      expect(checkbox.checked).toBe(true)

      await user.click(checkbox)
      expect(checkbox.checked).toBe(false)
    })
  })

  describe('Magnet Link Validation', () => {
    it('shows error when magnet link is empty', async () => {
      const user = userEvent.setup()
      const mockOnClose = vi.fn()
      renderAddTorrentModal({ isOpen: true, onClose: mockOnClose })

      const addButton = screen.getByRole('button', { name: 'Add' })
      await user.click(addButton)

      expect(screen.getByText('Invalid magnet link')).toBeInTheDocument()
    })

    it('shows error when magnet link does not start with "magnet:?"', async () => {
      const user = userEvent.setup()
      const mockOnClose = vi.fn()
      renderAddTorrentModal({ isOpen: true, onClose: mockOnClose })

      const magnetInput = screen.getByLabelText('Magnet Link')
      await user.type(magnetInput, 'http://example.com/torrent')

      const addButton = screen.getByRole('button', { name: 'Add' })
      await user.click(addButton)

      expect(screen.getByText('Invalid magnet link')).toBeInTheDocument()
    })

    it('shows error when magnet link is only "magnet:"', async () => {
      const user = userEvent.setup()
      const mockOnClose = vi.fn()
      renderAddTorrentModal({ isOpen: true, onClose: mockOnClose })

      const magnetInput = screen.getByLabelText('Magnet Link')
      await user.type(magnetInput, 'magnet:')

      const addButton = screen.getByRole('button', { name: 'Add' })
      await user.click(addButton)

      expect(screen.getByText('Invalid magnet link')).toBeInTheDocument()
    })

    it('accepts valid magnet link starting with "magnet:?"', async () => {
      const user = userEvent.setup()
      const mockOnClose = vi.fn()
      vi.mocked(addTorrentMagnet).mockResolvedValue(new Response('OK', { status: 200 }))

      renderAddTorrentModal({ isOpen: true, onClose: mockOnClose })

      const magnetInput = screen.getByLabelText('Magnet Link')
      await user.type(magnetInput, 'magnet:?xt=urn:btih:1234567890abcdef')

      const addButton = screen.getByRole('button', { name: 'Add' })
      await user.click(addButton)

      await waitFor(() => {
        expect(addTorrentMagnet).toHaveBeenCalled()
      })
    })

    it('trims whitespace from magnet link', async () => {
      const user = userEvent.setup()
      const mockOnClose = vi.fn()
      vi.mocked(addTorrentMagnet).mockResolvedValue(new Response('OK', { status: 200 }))

      renderAddTorrentModal({ isOpen: true, onClose: mockOnClose })

      const magnetInput = screen.getByLabelText('Magnet Link')
      await user.type(magnetInput, '   magnet:?xt=urn:btih:test   ')

      const addButton = screen.getByRole('button', { name: 'Add' })
      await user.click(addButton)

      await waitFor(() => {
        expect(addTorrentMagnet).toHaveBeenCalledWith(
          'http://localhost:8080',
          'magnet:?xt=urn:btih:test',
          expect.any(Object)
        )
      })
    })
  })

  describe('File Upload Validation', () => {
    it('shows error when no file is selected', async () => {
      const user = userEvent.setup()
      const mockOnClose = vi.fn()
      renderAddTorrentModal({ isOpen: true, onClose: mockOnClose })

      // Switch to file tab
      const fileTabButton = screen.getByRole('button', { name: /Torrent File/i })
      await user.click(fileTabButton)

      const addButton = screen.getByRole('button', { name: 'Add' })
      await user.click(addButton)

      expect(screen.getByText('Please select a file')).toBeInTheDocument()
    })

    it('does not show error when file is selected', async () => {
      const user = userEvent.setup()
      const mockOnClose = vi.fn()
      vi.mocked(addTorrentFile).mockResolvedValue(new Response('OK', { status: 200 }))

      renderAddTorrentModal({ isOpen: true, onClose: mockOnClose })

      // Switch to file tab
      const fileTabButton = screen.getByRole('button', { name: /Torrent File/i })
      await user.click(fileTabButton)

      // Select a file
      const file = new File(['torrent content'], 'test.torrent', { type: 'application/x-bittorrent' })
      const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement
      await user.upload(fileInput, file)

      const addButton = screen.getByRole('button', { name: 'Add' })
      await user.click(addButton)

      await waitFor(() => {
        expect(addTorrentFile).toHaveBeenCalled()
      })
    })
  })

  describe('Form Submission - Magnet Link', () => {
    it('calls addTorrentMagnet with correct parameters', async () => {
      const user = userEvent.setup()
      const mockOnClose = vi.fn()
      vi.mocked(addTorrentMagnet).mockResolvedValue(new Response('OK', { status: 200 }))

      renderAddTorrentModal({ isOpen: true, onClose: mockOnClose })

      const magnetInput = screen.getByLabelText('Magnet Link')
      await user.type(magnetInput, 'magnet:?xt=urn:btih:test123')

      const addButton = screen.getByRole('button', { name: 'Add' })
      await user.click(addButton)

      await waitFor(() => {
        expect(addTorrentMagnet).toHaveBeenCalledWith(
          'http://localhost:8080',
          'magnet:?xt=urn:btih:test123',
          {
            savepath: undefined,
            category: undefined,
            tags: undefined,
            paused: false,
          }
        )
      })
    })

    it('includes savepath when provided', async () => {
      const user = userEvent.setup()
      const mockOnClose = vi.fn()
      vi.mocked(addTorrentMagnet).mockResolvedValue(new Response('OK', { status: 200 }))

      renderAddTorrentModal({ isOpen: true, onClose: mockOnClose })

      const magnetInput = screen.getByLabelText('Magnet Link')
      const savePathInput = screen.getByLabelText('Save Path')
      await user.type(magnetInput, 'magnet:?xt=urn:btih:test123')
      await user.type(savePathInput, '/downloads/movies')

      const addButton = screen.getByRole('button', { name: 'Add' })
      await user.click(addButton)

      await waitFor(() => {
        expect(addTorrentMagnet).toHaveBeenCalledWith(
          'http://localhost:8080',
          'magnet:?xt=urn:btih:test123',
          expect.objectContaining({
            savepath: '/downloads/movies',
          })
        )
      })
    })

    it('includes category when selected', async () => {
      const user = userEvent.setup()
      const mockOnClose = vi.fn()
      vi.mocked(addTorrentMagnet).mockResolvedValue(new Response('OK', { status: 200 }))

      renderAddTorrentModal({ isOpen: true, onClose: mockOnClose })

      const magnetInput = screen.getByLabelText('Magnet Link')
      await user.type(magnetInput, 'magnet:?xt=urn:btih:test123')

      // Wait for categories to load
      await waitFor(() => {
        expect(screen.getByRole('option', { name: 'Movies' })).toBeInTheDocument()
      }, { timeout: 3000 })

      const categorySelect = screen.getByLabelText('Category')
      await user.selectOptions(categorySelect, 'Movies')

      const addButton = screen.getByRole('button', { name: 'Add' })
      await user.click(addButton)

      await waitFor(() => {
        expect(addTorrentMagnet).toHaveBeenCalledWith(
          'http://localhost:8080',
          'magnet:?xt=urn:btih:test123',
          expect.objectContaining({
            category: 'Movies',
          })
        )
      })
    })

    it('includes paused flag when checked', async () => {
      const user = userEvent.setup()
      const mockOnClose = vi.fn()
      vi.mocked(addTorrentMagnet).mockResolvedValue(new Response('OK', { status: 200 }))

      renderAddTorrentModal({ isOpen: true, onClose: mockOnClose })

      const magnetInput = screen.getByLabelText('Magnet Link')
      await user.type(magnetInput, 'magnet:?xt=urn:btih:test123')

      const checkbox = screen.getByLabelText('Start paused')
      await user.click(checkbox)

      const addButton = screen.getByRole('button', { name: 'Add' })
      await user.click(addButton)

      await waitFor(() => {
        expect(addTorrentMagnet).toHaveBeenCalledWith(
          'http://localhost:8080',
          'magnet:?xt=urn:btih:test123',
          expect.objectContaining({
            paused: true,
          })
        )
      })
    })

    it('closes modal after successful submission', async () => {
      const user = userEvent.setup()
      const mockOnClose = vi.fn()
      vi.mocked(addTorrentMagnet).mockResolvedValue(new Response('OK', { status: 200 }))

      renderAddTorrentModal({ isOpen: true, onClose: mockOnClose })

      const magnetInput = screen.getByLabelText('Magnet Link')
      await user.type(magnetInput, 'magnet:?xt=urn:btih:test123')

      const addButton = screen.getByRole('button', { name: 'Add' })
      await user.click(addButton)

      await waitFor(() => {
        expect(mockOnClose).toHaveBeenCalledTimes(1)
      })
    })
  })

  describe('Form Submission - File Upload', () => {
    it('calls addTorrentFile with correct parameters', async () => {
      const user = userEvent.setup()
      const mockOnClose = vi.fn()
      vi.mocked(addTorrentFile).mockResolvedValue(new Response('OK', { status: 200 }))

      renderAddTorrentModal({ isOpen: true, onClose: mockOnClose })

      // Switch to file tab
      const fileTabButton = screen.getByRole('button', { name: /Torrent File/i })
      await user.click(fileTabButton)

      // Select a file
      const file = new File(['torrent content'], 'ubuntu.torrent', { type: 'application/x-bittorrent' })
      const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement
      await user.upload(fileInput, file)

      const addButton = screen.getByRole('button', { name: 'Add' })
      await user.click(addButton)

      await waitFor(() => {
        expect(addTorrentFile).toHaveBeenCalledWith(
          'http://localhost:8080',
          file,
          {
            savepath: undefined,
            category: undefined,
            tags: undefined,
            paused: false,
          }
        )
      })
    })

    it('includes savepath, category, and paused flag', async () => {
      const user = userEvent.setup()
      const mockOnClose = vi.fn()
      vi.mocked(addTorrentFile).mockResolvedValue(new Response('OK', { status: 200 }))

      renderAddTorrentModal({ isOpen: true, onClose: mockOnClose })

      // Wait for categories to load first
      await waitFor(() => {
        expect(screen.getByRole('option', { name: 'TV Shows' })).toBeInTheDocument()
      }, { timeout: 3000 })

      // Switch to file tab
      const fileTabButton = screen.getByRole('button', { name: /Torrent File/i })
      await user.click(fileTabButton)

      // Select a file
      const file = new File(['torrent content'], 'test.torrent', { type: 'application/x-bittorrent' })
      const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement
      await user.upload(fileInput, file)

      // Fill other fields
      const savePathInput = screen.getByLabelText('Save Path')
      await user.type(savePathInput, '/downloads/tv')

      const categorySelect = screen.getByLabelText('Category')
      await user.selectOptions(categorySelect, 'TV Shows')

      const checkbox = screen.getByLabelText('Start paused')
      await user.click(checkbox)

      const addButton = screen.getByRole('button', { name: 'Add' })
      await user.click(addButton)

      await waitFor(() => {
        expect(addTorrentFile).toHaveBeenCalledWith(
          'http://localhost:8080',
          file,
          expect.objectContaining({
            savepath: '/downloads/tv',
            category: 'TV Shows',
            paused: true,
          })
        )
      })
    })

    it('closes modal after successful submission', async () => {
      const user = userEvent.setup()
      const mockOnClose = vi.fn()
      vi.mocked(addTorrentFile).mockResolvedValue(new Response('OK', { status: 200 }))

      renderAddTorrentModal({ isOpen: true, onClose: mockOnClose })

      // Switch to file tab
      const fileTabButton = screen.getByRole('button', { name: /Torrent File/i })
      await user.click(fileTabButton)

      // Select a file
      const file = new File(['torrent content'], 'test.torrent', { type: 'application/x-bittorrent' })
      const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement
      await user.upload(fileInput, file)

      const addButton = screen.getByRole('button', { name: 'Add' })
      await user.click(addButton)

      await waitFor(() => {
        expect(mockOnClose).toHaveBeenCalledTimes(1)
      })
    })
  })

  describe('Error Handling', () => {
    it('displays error message when addTorrentMagnet fails', async () => {
      const user = userEvent.setup()
      const mockOnClose = vi.fn()
      vi.mocked(addTorrentMagnet).mockRejectedValue(new Error('Network error'))

      renderAddTorrentModal({ isOpen: true, onClose: mockOnClose })

      const magnetInput = screen.getByLabelText('Magnet Link')
      await user.type(magnetInput, 'magnet:?xt=urn:btih:test123')

      const addButton = screen.getByRole('button', { name: 'Add' })
      await user.click(addButton)

      await waitFor(() => {
        expect(screen.getByText('Network error')).toBeInTheDocument()
      })
    })

    it('displays error message when addTorrentFile fails', async () => {
      const user = userEvent.setup()
      const mockOnClose = vi.fn()
      vi.mocked(addTorrentFile).mockRejectedValue(new Error('File too large'))

      renderAddTorrentModal({ isOpen: true, onClose: mockOnClose })

      // Switch to file tab
      const fileTabButton = screen.getByRole('button', { name: /Torrent File/i })
      await user.click(fileTabButton)

      // Select a file
      const file = new File(['torrent content'], 'test.torrent', { type: 'application/x-bittorrent' })
      const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement
      await user.upload(fileInput, file)

      const addButton = screen.getByRole('button', { name: 'Add' })
      await user.click(addButton)

      await waitFor(() => {
        expect(screen.getByText('File too large')).toBeInTheDocument()
      })
    })

    it('displays generic error message when error has no message', async () => {
      const user = userEvent.setup()
      const mockOnClose = vi.fn()
      vi.mocked(addTorrentMagnet).mockRejectedValue(new Error(''))

      renderAddTorrentModal({ isOpen: true, onClose: mockOnClose })

      const magnetInput = screen.getByLabelText('Magnet Link')
      await user.type(magnetInput, 'magnet:?xt=urn:btih:test123')

      const addButton = screen.getByRole('button', { name: 'Add' })
      await user.click(addButton)

      await waitFor(() => {
        expect(screen.getByText('Failed to add torrent')).toBeInTheDocument()
      })
    })

    it('does not close modal when submission fails', async () => {
      const user = userEvent.setup()
      const mockOnClose = vi.fn()
      vi.mocked(addTorrentMagnet).mockRejectedValue(new Error('Network error'))

      renderAddTorrentModal({ isOpen: true, onClose: mockOnClose })

      const magnetInput = screen.getByLabelText('Magnet Link')
      await user.type(magnetInput, 'magnet:?xt=urn:btih:test123')

      const addButton = screen.getByRole('button', { name: 'Add' })
      await user.click(addButton)

      await waitFor(() => {
        expect(screen.getByText('Network error')).toBeInTheDocument()
      })

      expect(mockOnClose).not.toHaveBeenCalled()
    })
  })

  describe('Form Reset', () => {
    it('resets form when modal closes', async () => {
      const user = userEvent.setup()
      const mockOnClose = vi.fn()
      const { rerender } = renderAddTorrentModal({ isOpen: true, onClose: mockOnClose })

      // Fill in form
      const magnetInput = screen.getByLabelText('Magnet Link')
      const savePathInput = screen.getByLabelText('Save Path')
      await user.type(magnetInput, 'magnet:?xt=urn:btih:test123')
      await user.type(savePathInput, '/downloads')

      // Close modal
      const cancelButton = screen.getByRole('button', { name: 'Cancel' })
      await user.click(cancelButton)

      // Reopen modal
      rerender(
        <QueryClientProvider client={new QueryClient()}>
          <AddTorrentModal isOpen={true} onClose={mockOnClose} />
        </QueryClientProvider>
      )

      // Form should be reset
      const resetMagnetInput = screen.getByLabelText('Magnet Link') as HTMLInputElement
      const resetSavePathInput = screen.getByLabelText('Save Path') as HTMLInputElement
      expect(resetMagnetInput.value).toBe('')
      expect(resetSavePathInput.value).toBe('')
    })

    it('resets to magnet tab when modal closes', async () => {
      const user = userEvent.setup()
      const mockOnClose = vi.fn()
      const { rerender } = renderAddTorrentModal({ isOpen: true, onClose: mockOnClose })

      // Switch to file tab
      const fileTabButton = screen.getByRole('button', { name: /Torrent File/i })
      await user.click(fileTabButton)
      expect(screen.getByPlaceholderText('No file selected')).toBeInTheDocument()

      // Close modal
      const cancelButton = screen.getByRole('button', { name: 'Cancel' })
      await user.click(cancelButton)

      // Reopen modal
      rerender(
        <QueryClientProvider client={new QueryClient()}>
          <AddTorrentModal isOpen={true} onClose={mockOnClose} />
        </QueryClientProvider>
      )

      // Should be back on magnet tab
      expect(screen.getByLabelText('Magnet Link')).toBeInTheDocument()
    })

    it('clears error message when modal closes', async () => {
      const user = userEvent.setup()
      const mockOnClose = vi.fn()
      const { rerender } = renderAddTorrentModal({ isOpen: true, onClose: mockOnClose })

      // Trigger error
      const addButton = screen.getByRole('button', { name: 'Add' })
      await user.click(addButton)
      expect(screen.getByText('Invalid magnet link')).toBeInTheDocument()

      // Close modal
      const cancelButton = screen.getByRole('button', { name: 'Cancel' })
      await user.click(cancelButton)

      // Reopen modal
      rerender(
        <QueryClientProvider client={new QueryClient()}>
          <AddTorrentModal isOpen={true} onClose={mockOnClose} />
        </QueryClientProvider>
      )

      // Error should be cleared
      expect(screen.queryByText('Invalid magnet link')).not.toBeInTheDocument()
    })
  })

  describe('Loading States', () => {
    it('disables buttons while submitting magnet link', async () => {
      const user = userEvent.setup()
      const mockOnClose = vi.fn()
      let resolvePromise: (value: Response) => void
      const promise = new Promise<Response>((resolve) => {
        resolvePromise = resolve
      })
      vi.mocked(addTorrentMagnet).mockReturnValue(promise)

      renderAddTorrentModal({ isOpen: true, onClose: mockOnClose })

      const magnetInput = screen.getByLabelText('Magnet Link')
      await user.type(magnetInput, 'magnet:?xt=urn:btih:test123')

      const addButton = screen.getByRole('button', { name: 'Add' })
      await user.click(addButton)

      // Buttons should be disabled
      await waitFor(() => {
        expect(screen.getByRole('button', { name: /Adding/i })).toBeDisabled()
      })
      expect(screen.getByRole('button', { name: 'Cancel' })).toBeDisabled()

      // Resolve promise to clean up
      await waitFor(() => {
        resolvePromise!(new Response('OK', { status: 200 }))
      })
    })

    it('shows "Adding..." text while submitting', async () => {
      const user = userEvent.setup()
      const mockOnClose = vi.fn()
      let resolvePromise: (value: Response) => void
      const promise = new Promise<Response>((resolve) => {
        resolvePromise = resolve
      })
      vi.mocked(addTorrentMagnet).mockReturnValue(promise)

      renderAddTorrentModal({ isOpen: true, onClose: mockOnClose })

      const magnetInput = screen.getByLabelText('Magnet Link')
      await user.type(magnetInput, 'magnet:?xt=urn:btih:test123')

      const addButton = screen.getByRole('button', { name: 'Add' })
      await user.click(addButton)

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /Adding/i })).toBeInTheDocument()
      })

      // Resolve promise to clean up
      await waitFor(() => {
        resolvePromise!(new Response('OK', { status: 200 }))
      })
    })
  })

  describe('localStorage Integration', () => {
    it('uses baseUrl from localStorage', async () => {
      const user = userEvent.setup()
      const mockOnClose = vi.fn()
      localStorage.setItem('qbit_baseUrl', 'http://custom-server:9090')
      vi.mocked(addTorrentMagnet).mockResolvedValue(new Response('OK', { status: 200 }))

      renderAddTorrentModal({ isOpen: true, onClose: mockOnClose })

      const magnetInput = screen.getByLabelText('Magnet Link')
      await user.type(magnetInput, 'magnet:?xt=urn:btih:test123')

      const addButton = screen.getByRole('button', { name: 'Add' })
      await user.click(addButton)

      await waitFor(() => {
        expect(addTorrentMagnet).toHaveBeenCalledWith(
          'http://custom-server:9090',
          'magnet:?xt=urn:btih:test123',
          expect.any(Object)
        )
      })
    })

    it('uses default baseUrl when not in localStorage', async () => {
      const user = userEvent.setup()
      const mockOnClose = vi.fn()
      localStorage.removeItem('qbit_baseUrl')
      vi.mocked(addTorrentMagnet).mockResolvedValue(new Response('OK', { status: 200 }))

      renderAddTorrentModal({ isOpen: true, onClose: mockOnClose })

      const magnetInput = screen.getByLabelText('Magnet Link')
      await user.type(magnetInput, 'magnet:?xt=urn:btih:test123')

      const addButton = screen.getByRole('button', { name: 'Add' })
      await user.click(addButton)

      await waitFor(() => {
        expect(addTorrentMagnet).toHaveBeenCalledWith(
          'http://localhost:8080',
          'magnet:?xt=urn:btih:test123',
          expect.any(Object)
        )
      })
    })

    it('loads tags from localStorage when modal opens', () => {
      const mockOnClose = vi.fn()
      const mockTags = [
        { id: '1', name: 'Important', color: 'red', createdAt: Date.now() },
        { id: '2', name: 'Movies', color: 'blue', createdAt: Date.now() },
      ]
      vi.mocked(getTags).mockReturnValue(mockTags)

      renderAddTorrentModal({ isOpen: true, onClose: mockOnClose })

      expect(getTags).toHaveBeenCalled()
    })
  })

  describe('Edge Cases', () => {
    it('handles empty categories response', async () => {
      const mockOnClose = vi.fn()
      vi.mocked(getCategories).mockResolvedValue({})

      renderAddTorrentModal({ isOpen: true, onClose: mockOnClose })

      await waitFor(() => {
        expect(screen.getByLabelText('Category')).toBeInTheDocument()
      })

      const categorySelect = screen.getByLabelText('Category') as HTMLSelectElement
      // Should only have "None" option
      expect(categorySelect.options.length).toBe(1)
      expect(categorySelect.options[0].value).toBe('')
    })

    it('handles file input with multiple files (only uses first)', async () => {
      const user = userEvent.setup()
      const mockOnClose = vi.fn()
      vi.mocked(addTorrentFile).mockResolvedValue(new Response('OK', { status: 200 }))

      renderAddTorrentModal({ isOpen: true, onClose: mockOnClose })

      // Switch to file tab
      const fileTabButton = screen.getByRole('button', { name: /Torrent File/i })
      await user.click(fileTabButton)

      // Create multiple files but only first should be used
      const file1 = new File(['torrent 1'], 'first.torrent', { type: 'application/x-bittorrent' })
      const file2 = new File(['torrent 2'], 'second.torrent', { type: 'application/x-bittorrent' })
      const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement

      // Simulate selecting first file
      await user.upload(fileInput, file1)

      // Should display first file name
      expect(screen.getByDisplayValue('first.torrent')).toBeInTheDocument()
    })

    it('handles very long save path', async () => {
      const user = userEvent.setup()
      const mockOnClose = vi.fn()
      vi.mocked(addTorrentMagnet).mockResolvedValue(new Response('OK', { status: 200 }))

      renderAddTorrentModal({ isOpen: true, onClose: mockOnClose })

      const longPath = '/very/long/path/'.repeat(20)
      const magnetInput = screen.getByLabelText('Magnet Link')
      const savePathInput = screen.getByLabelText('Save Path')

      // Use paste instead of type for long strings (more efficient)
      await user.click(magnetInput)
      await user.paste('magnet:?xt=urn:btih:test123')
      await user.click(savePathInput)
      await user.paste(longPath)

      const addButton = screen.getByRole('button', { name: 'Add' })
      await user.click(addButton)

      await waitFor(() => {
        expect(addTorrentMagnet).toHaveBeenCalledWith(
          'http://localhost:8080',
          'magnet:?xt=urn:btih:test123',
          expect.objectContaining({
            savepath: longPath,
          })
        )
      })
    })
  })
})
