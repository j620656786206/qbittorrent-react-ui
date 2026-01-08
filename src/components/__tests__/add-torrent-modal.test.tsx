import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { userEvent } from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { AddTorrentModal } from '../add-torrent-modal'

import { addTorrentFile, addTorrentMagnet, getCategories } from '@/lib/api'

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
  initReactI18next: {
    type: '3rdParty',
    init: () => {},
  },
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
  formatTagString: vi.fn((tags: Array<string>) => tags.join(',')),
}))

/**
 * Helper to wrap component with QueryClientProvider
 */
function renderAddTorrentModal(
  props: React.ComponentProps<typeof AddTorrentModal>,
) {
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
      </QueryClientProvider>,
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
      Movies: { name: 'Movies', savePath: '/downloads/movies' },
      'TV Shows': { name: 'TV Shows', savePath: '/downloads/tv' },
      Music: { name: 'Music', savePath: '/downloads/music' },
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
      expect(
        screen.getByText('Add a new torrent from magnet link or file'),
      ).toBeInTheDocument()
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
      expect(
        screen.queryByPlaceholderText('No file selected'),
      ).not.toBeInTheDocument()
    })

    it('switches to file tab when file tab button is clicked', async () => {
      const user = userEvent.setup()
      const mockOnClose = vi.fn()
      renderAddTorrentModal({ isOpen: true, onClose: mockOnClose })

      const fileTabButton = screen.getByRole('button', {
        name: /Torrent File/i,
      })
      await user.click(fileTabButton)

      expect(
        screen.getByPlaceholderText('No file selected'),
      ).toBeInTheDocument()
      expect(screen.getByRole('button', { name: 'Browse' })).toBeInTheDocument()
    })

    it('switches back to magnet tab when magnet tab button is clicked', async () => {
      const user = userEvent.setup()
      const mockOnClose = vi.fn()
      renderAddTorrentModal({ isOpen: true, onClose: mockOnClose })

      // Switch to file tab
      const fileTabButton = screen.getByRole('button', {
        name: /Torrent File/i,
      })
      await user.click(fileTabButton)
      expect(
        screen.getByPlaceholderText('No file selected'),
      ).toBeInTheDocument()

      // Switch back to magnet tab
      const magnetTabButton = screen.getByRole('button', {
        name: /Magnet Link/i,
      })
      await user.click(magnetTabButton)
      expect(screen.getByLabelText('Magnet Link')).toBeInTheDocument()
    })
  })

  describe('Form Input Handling - Magnet Link', () => {
    it('allows user to type in magnet link field', async () => {
      const user = userEvent.setup()
      const mockOnClose = vi.fn()
      renderAddTorrentModal({ isOpen: true, onClose: mockOnClose })

      // eslint-disable-next-line @typescript-eslint/no-unnecessary-type-assertion
      const magnetInput = screen.getByLabelText(
        'Magnet Link',
      ) as HTMLInputElement
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
      const fileTabButton = screen.getByRole('button', {
        name: /Torrent File/i,
      })
      await user.click(fileTabButton)

      // Create a mock file
      const file = new File(['torrent content'], 'ubuntu.torrent', {
        type: 'application/x-bittorrent',
      })
      const fileInput = document.querySelector(
        'input[type="file"]',
      ) as HTMLInputElement

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
      const fileTabButton = screen.getByRole('button', {
        name: /Torrent File/i,
      })
      await user.click(fileTabButton)

      // Try to submit without file to trigger error
      const addButton = screen.getByRole('button', { name: 'Add' })
      await user.click(addButton)

      expect(screen.getByText('Please select a file')).toBeInTheDocument()

      // Select a file
      const file = new File(['torrent content'], 'test.torrent', {
        type: 'application/x-bittorrent',
      })
      const fileInput = document.querySelector(
        'input[type="file"]',
      ) as HTMLInputElement
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

      // eslint-disable-next-line @typescript-eslint/no-unnecessary-type-assertion
      const savePathInput = screen.getByLabelText(
        'Save Path',
      ) as HTMLInputElement
      await user.type(savePathInput, '/downloads/torrents')

      expect(savePathInput.value).toBe('/downloads/torrents')
    })

    it('allows user to select a category', async () => {
      const user = userEvent.setup()
      const mockOnClose = vi.fn()
      renderAddTorrentModal({ isOpen: true, onClose: mockOnClose })

      // Wait for categories to load
      await waitFor(() => {
        expect(
          screen.getByRole('option', { name: 'Movies' }),
        ).toBeInTheDocument()
      })

      // eslint-disable-next-line @typescript-eslint/no-unnecessary-type-assertion
      const categorySelect = screen.getByLabelText(
        'Category',
      ) as HTMLSelectElement
      await user.selectOptions(categorySelect, 'Movies')

      expect(categorySelect.value).toBe('Movies')
    })

    it('displays categories from API', async () => {
      const mockOnClose = vi.fn()
      renderAddTorrentModal({ isOpen: true, onClose: mockOnClose })

      await waitFor(() => {
        expect(
          screen.getByRole('option', { name: 'Movies' }),
        ).toBeInTheDocument()
      })

      expect(
        screen.getByRole('option', { name: 'TV Shows' }),
      ).toBeInTheDocument()
      expect(screen.getByRole('option', { name: 'Music' })).toBeInTheDocument()
    })

    it('allows user to toggle start paused checkbox', async () => {
      const user = userEvent.setup()
      const mockOnClose = vi.fn()
      renderAddTorrentModal({ isOpen: true, onClose: mockOnClose })

      // eslint-disable-next-line @typescript-eslint/no-unnecessary-type-assertion
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
      vi.mocked(addTorrentMagnet).mockResolvedValue(true)

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
      vi.mocked(addTorrentMagnet).mockResolvedValue(true)

      renderAddTorrentModal({ isOpen: true, onClose: mockOnClose })

      const magnetInput = screen.getByLabelText('Magnet Link')
      await user.type(magnetInput, '   magnet:?xt=urn:btih:test   ')

      const addButton = screen.getByRole('button', { name: 'Add' })
      await user.click(addButton)

      await waitFor(() => {
        expect(addTorrentMagnet).toHaveBeenCalledWith(
          'http://localhost:8080',
          'magnet:?xt=urn:btih:test',
          expect.any(Object),
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
      const fileTabButton = screen.getByRole('button', {
        name: /Torrent File/i,
      })
      await user.click(fileTabButton)

      const addButton = screen.getByRole('button', { name: 'Add' })
      await user.click(addButton)

      expect(screen.getByText('Please select a file')).toBeInTheDocument()
    })

    it('does not show error when file is selected', async () => {
      const user = userEvent.setup()
      const mockOnClose = vi.fn()
      vi.mocked(addTorrentFile).mockResolvedValue(true)

      renderAddTorrentModal({ isOpen: true, onClose: mockOnClose })

      // Switch to file tab
      const fileTabButton = screen.getByRole('button', {
        name: /Torrent File/i,
      })
      await user.click(fileTabButton)

      // Select a file
      const file = new File(['torrent content'], 'test.torrent', {
        type: 'application/x-bittorrent',
      })
      const fileInput = document.querySelector(
        'input[type="file"]',
      ) as HTMLInputElement
      await user.upload(fileInput, file)

      const addButton = screen.getByRole('button', { name: 'Add' })
      await user.click(addButton)

      await waitFor(() => {
        expect(addTorrentFile).toHaveBeenCalled()
      })
    })
  })
})