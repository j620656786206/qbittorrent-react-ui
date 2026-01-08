import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { userEvent } from '@testing-library/user-event'
import { KeyboardHelpModal } from '../keyboard-help-modal'

/**
 * Mock react-i18next
 */
vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => {
      const translations: Record<string, string> = {
        'keyboard.help.title': 'Keyboard Shortcuts',
        'keyboard.help.description':
          'Use these keyboard shortcuts to manage torrents more efficiently.',
        'keyboard.help.keyColumn': 'Key',
        'keyboard.help.actionColumn': 'Action',
        'keyboard.shortcuts.selectAll': 'Select all visible torrents',
        'keyboard.shortcuts.pauseResume': 'Pause or resume selected torrents',
        'keyboard.shortcuts.delete': 'Delete selected torrents',
        'keyboard.shortcuts.navigate': 'Navigate between torrents',
        'keyboard.shortcuts.toggleSelect': 'Select or deselect focused torrent',
        'keyboard.shortcuts.clearSelection': 'Clear selection',
        'keyboard.shortcuts.help': 'Show keyboard shortcuts help',
      }
      return translations[key] || key
    },
  }),
}))

/**
 * Mock usePlatform hook
 */
vi.mock('@/lib/hooks', () => ({
  usePlatform: vi.fn(() => ({ isMac: false })),
}))

import { usePlatform } from '@/lib/hooks'

describe('KeyboardHelpModal Component', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    // Default to non-Mac platform
    vi.mocked(usePlatform).mockReturnValue({ isMac: false })
  })

  describe('Modal Open/Close Behavior', () => {
    it('does not render when isOpen is false', () => {
      const mockOnClose = vi.fn()
      render(<KeyboardHelpModal isOpen={false} onClose={mockOnClose} />)

      expect(screen.queryByText('Keyboard Shortcuts')).not.toBeInTheDocument()
    })

    it('renders when isOpen is true', () => {
      const mockOnClose = vi.fn()
      render(<KeyboardHelpModal isOpen={true} onClose={mockOnClose} />)

      expect(screen.getByText('Keyboard Shortcuts')).toBeInTheDocument()
    })

    it('calls onClose when Escape key is pressed', async () => {
      const user = userEvent.setup()
      const mockOnClose = vi.fn()
      render(<KeyboardHelpModal isOpen={true} onClose={mockOnClose} />)

      await user.keyboard('{Escape}')

      // Radix Dialog calls onOpenChange with false
      await expect(mockOnClose).toHaveBeenCalled()
    })
  })

  describe('Rendering', () => {
    it('renders modal title', () => {
      const mockOnClose = vi.fn()
      render(<KeyboardHelpModal isOpen={true} onClose={mockOnClose} />)

      expect(screen.getByText('Keyboard Shortcuts')).toBeInTheDocument()
    })

    it('renders modal description', () => {
      const mockOnClose = vi.fn()
      render(<KeyboardHelpModal isOpen={true} onClose={mockOnClose} />)

      expect(
        screen.getByText('Use these keyboard shortcuts to manage torrents more efficiently.')
      ).toBeInTheDocument()
    })

    it('renders table headers', () => {
      const mockOnClose = vi.fn()
      render(<KeyboardHelpModal isOpen={true} onClose={mockOnClose} />)

      expect(screen.getByText('Key')).toBeInTheDocument()
      expect(screen.getByText('Action')).toBeInTheDocument()
    })
  })

  describe('Shortcut Display - Windows/Linux', () => {
    beforeEach(() => {
      vi.mocked(usePlatform).mockReturnValue({ isMac: false })
    })

    it('displays Ctrl+A for select all on Windows/Linux', () => {
      const mockOnClose = vi.fn()
      render(<KeyboardHelpModal isOpen={true} onClose={mockOnClose} />)

      expect(screen.getByText('Ctrl+A')).toBeInTheDocument()
    })

    it('displays all shortcuts with correct descriptions', () => {
      const mockOnClose = vi.fn()
      render(<KeyboardHelpModal isOpen={true} onClose={mockOnClose} />)

      // Check all shortcut keys
      expect(screen.getByText('Ctrl+A')).toBeInTheDocument()
      expect(screen.getByText('Space')).toBeInTheDocument()
      expect(screen.getByText('Delete')).toBeInTheDocument()
      expect(screen.getByText('↑ / ↓')).toBeInTheDocument()
      expect(screen.getByText('Enter')).toBeInTheDocument()
      expect(screen.getByText('Escape')).toBeInTheDocument()
      expect(screen.getByText('? / F1')).toBeInTheDocument()

      // Check all descriptions
      expect(screen.getByText('Select all visible torrents')).toBeInTheDocument()
      expect(screen.getByText('Pause or resume selected torrents')).toBeInTheDocument()
      expect(screen.getByText('Delete selected torrents')).toBeInTheDocument()
      expect(screen.getByText('Navigate between torrents')).toBeInTheDocument()
      expect(screen.getByText('Select or deselect focused torrent')).toBeInTheDocument()
      expect(screen.getByText('Clear selection')).toBeInTheDocument()
      expect(screen.getByText('Show keyboard shortcuts help')).toBeInTheDocument()
    })
  })

  describe('Shortcut Display - macOS', () => {
    beforeEach(() => {
      vi.mocked(usePlatform).mockReturnValue({ isMac: true })
    })

    it('displays ⌘+A for select all on Mac', () => {
      const mockOnClose = vi.fn()
      render(<KeyboardHelpModal isOpen={true} onClose={mockOnClose} />)

      expect(screen.getByText('⌘+A')).toBeInTheDocument()
    })

    it('displays all shortcuts with Mac-specific modifier key', () => {
      const mockOnClose = vi.fn()
      render(<KeyboardHelpModal isOpen={true} onClose={mockOnClose} />)

      // Check Mac-specific modifier key
      expect(screen.getByText('⌘+A')).toBeInTheDocument()
      // Other shortcuts remain the same
      expect(screen.getByText('Space')).toBeInTheDocument()
      expect(screen.getByText('Delete')).toBeInTheDocument()
      expect(screen.getByText('↑ / ↓')).toBeInTheDocument()
      expect(screen.getByText('Enter')).toBeInTheDocument()
      expect(screen.getByText('Escape')).toBeInTheDocument()
      expect(screen.getByText('? / F1')).toBeInTheDocument()
    })

    it('does not display Ctrl+A when on Mac', () => {
      const mockOnClose = vi.fn()
      render(<KeyboardHelpModal isOpen={true} onClose={mockOnClose} />)

      expect(screen.queryByText('Ctrl+A')).not.toBeInTheDocument()
    })
  })

  describe('Platform Detection', () => {
    it('calls usePlatform hook to determine platform', () => {
      const mockOnClose = vi.fn()
      render(<KeyboardHelpModal isOpen={true} onClose={mockOnClose} />)

      expect(usePlatform).toHaveBeenCalled()
    })

    it('displays different modifier keys based on platform', () => {
      const mockOnClose = vi.fn()

      // Render on Windows/Linux
      vi.mocked(usePlatform).mockReturnValue({ isMac: false })
      const { rerender } = render(<KeyboardHelpModal isOpen={true} onClose={mockOnClose} />)
      expect(screen.getByText('Ctrl+A')).toBeInTheDocument()

      // Re-render on Mac
      vi.mocked(usePlatform).mockReturnValue({ isMac: true })
      rerender(<KeyboardHelpModal isOpen={true} onClose={mockOnClose} />)
      expect(screen.getByText('⌘+A')).toBeInTheDocument()
      expect(screen.queryByText('Ctrl+A')).not.toBeInTheDocument()
    })
  })

  describe('Table Structure', () => {
    it('renders exactly 7 shortcuts', () => {
      const mockOnClose = vi.fn()
      render(<KeyboardHelpModal isOpen={true} onClose={mockOnClose} />)

      // Get all table rows (excluding header)
      const rows = screen.getAllByRole('row')
      // 1 header row + 7 shortcut rows = 8 total
      expect(rows).toHaveLength(8)
    })

    it('renders shortcuts in correct order', () => {
      const mockOnClose = vi.fn()
      render(<KeyboardHelpModal isOpen={true} onClose={mockOnClose} />)

      const rows = screen.getAllByRole('row')
      // Skip header row (index 0)
      const shortcutRows = rows.slice(1)

      // Verify order
      expect(shortcutRows[0]).toHaveTextContent('Select all visible torrents')
      expect(shortcutRows[1]).toHaveTextContent('Pause or resume selected torrents')
      expect(shortcutRows[2]).toHaveTextContent('Delete selected torrents')
      expect(shortcutRows[3]).toHaveTextContent('Navigate between torrents')
      expect(shortcutRows[4]).toHaveTextContent('Select or deselect focused torrent')
      expect(shortcutRows[5]).toHaveTextContent('Clear selection')
      expect(shortcutRows[6]).toHaveTextContent('Show keyboard shortcuts help')
    })

    it('applies font-mono styling to shortcut keys', () => {
      const mockOnClose = vi.fn()
      render(<KeyboardHelpModal isOpen={true} onClose={mockOnClose} />)

      // Get all cells with font-mono class (should be the key cells)
      const keyCells = document.querySelectorAll('.font-mono')
      // Should have 7 shortcut keys
      expect(keyCells.length).toBe(7)
    })
  })

  describe('Accessibility', () => {
    it('has proper dialog role', () => {
      const mockOnClose = vi.fn()
      render(<KeyboardHelpModal isOpen={true} onClose={mockOnClose} />)

      // Radix Dialog creates a dialog element
      expect(screen.getByRole('dialog')).toBeInTheDocument()
    })

    it('has accessible table structure', () => {
      const mockOnClose = vi.fn()
      render(<KeyboardHelpModal isOpen={true} onClose={mockOnClose} />)

      // Check table structure
      expect(screen.getByRole('table')).toBeInTheDocument()
      expect(screen.getAllByRole('columnheader')).toHaveLength(2)
    })
  })

  describe('Edge Cases', () => {
    it('handles rapid open/close transitions', () => {
      const mockOnClose = vi.fn()
      const { rerender } = render(<KeyboardHelpModal isOpen={false} onClose={mockOnClose} />)

      rerender(<KeyboardHelpModal isOpen={true} onClose={mockOnClose} />)
      expect(screen.getByText('Keyboard Shortcuts')).toBeInTheDocument()

      rerender(<KeyboardHelpModal isOpen={false} onClose={mockOnClose} />)
      expect(screen.queryByText('Keyboard Shortcuts')).not.toBeInTheDocument()

      rerender(<KeyboardHelpModal isOpen={true} onClose={mockOnClose} />)
      expect(screen.getByText('Keyboard Shortcuts')).toBeInTheDocument()
    })

    it('handles onClose callback being undefined gracefully', () => {
      // @ts-expect-error Testing edge case
      expect(() => render(<KeyboardHelpModal isOpen={true} onClose={undefined} />)).not.toThrow()
    })

    it('maintains state when switching platforms', () => {
      const mockOnClose = vi.fn()

      vi.mocked(usePlatform).mockReturnValue({ isMac: false })
      const { rerender } = render(<KeyboardHelpModal isOpen={true} onClose={mockOnClose} />)

      expect(screen.getByText('Ctrl+A')).toBeInTheDocument()

      vi.mocked(usePlatform).mockReturnValue({ isMac: true })
      rerender(<KeyboardHelpModal isOpen={true} onClose={mockOnClose} />)

      // Modal should still be open and showing shortcuts
      expect(screen.getByText('Keyboard Shortcuts')).toBeInTheDocument()
      expect(screen.getByText('⌘+A')).toBeInTheDocument()
    })
  })

  describe('Props Updates', () => {
    it('updates visibility when isOpen prop changes', () => {
      const mockOnClose = vi.fn()
      const { rerender } = render(<KeyboardHelpModal isOpen={false} onClose={mockOnClose} />)

      expect(screen.queryByText('Keyboard Shortcuts')).not.toBeInTheDocument()

      rerender(<KeyboardHelpModal isOpen={true} onClose={mockOnClose} />)
      expect(screen.getByText('Keyboard Shortcuts')).toBeInTheDocument()
    })

    it('calls new onClose callback when prop changes', async () => {
      const user = userEvent.setup()
      const mockOnClose1 = vi.fn()
      const mockOnClose2 = vi.fn()

      const { rerender } = render(<KeyboardHelpModal isOpen={true} onClose={mockOnClose1} />)

      rerender(<KeyboardHelpModal isOpen={true} onClose={mockOnClose2} />)

      await user.keyboard('{Escape}')

      // Should call the new callback
      expect(mockOnClose2).toHaveBeenCalled()
    })
  })

  describe('Integration with Radix Dialog', () => {
    it('renders DialogContent component', () => {
      const mockOnClose = vi.fn()
      render(<KeyboardHelpModal isOpen={true} onClose={mockOnClose} />)

      // Radix Dialog creates a dialog with specific structure
      const dialog = screen.getByRole('dialog')
      expect(dialog).toBeInTheDocument()
    })

    it('has proper dialog title', () => {
      const mockOnClose = vi.fn()
      render(<KeyboardHelpModal isOpen={true} onClose={mockOnClose} />)

      // Dialog title should be present
      expect(screen.getByText('Keyboard Shortcuts')).toBeInTheDocument()
    })

    it('has proper dialog description', () => {
      const mockOnClose = vi.fn()
      render(<KeyboardHelpModal isOpen={true} onClose={mockOnClose} />)

      // Dialog description should be present
      expect(
        screen.getByText('Use these keyboard shortcuts to manage torrents more efficiently.')
      ).toBeInTheDocument()
    })
  })
})
