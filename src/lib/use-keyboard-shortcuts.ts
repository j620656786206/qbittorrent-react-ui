import { useCallback, useEffect } from 'react'

export interface KeyboardShortcutCallbacks {
  onSpace?: () => void
  onDelete?: () => void
  onSelectAll?: () => void
  onArrowUp?: () => void
  onArrowDown?: () => void
  onEscape?: () => void
  onEnter?: () => void
  onHelp?: () => void
  isDisabled?: boolean
}

/**
 * Detect if the current platform is macOS
 */
export function isMac(): boolean {
  if (typeof navigator === 'undefined') return false
  return navigator.platform.toUpperCase().indexOf('MAC') >= 0
}

/**
 * Check if the current focused element is an input field where we should
 * not trigger keyboard shortcuts
 */
function isInputElement(target: EventTarget | null): boolean {
  if (!target || !(target instanceof HTMLElement)) return false
  const tagName = target.tagName.toUpperCase()
  return (
    tagName === 'INPUT' ||
    tagName === 'TEXTAREA' ||
    tagName === 'SELECT' ||
    target.isContentEditable
  )
}

/**
 * Custom hook for managing keyboard shortcuts in the torrent management interface
 *
 * @param callbacks - Object containing callback functions for each shortcut action
 *
 * Supported shortcuts:
 * - Space: Toggle pause/resume on selected torrents
 * - Delete: Open delete confirmation dialog
 * - Ctrl/Cmd+A: Select all visible torrents
 * - Arrow Up/Down: Navigate between torrents
 * - Escape: Clear selection
 * - Enter: Toggle selection of focused torrent
 * - ? or F1: Open keyboard shortcuts help modal
 */
export function useKeyboardShortcuts(callbacks: KeyboardShortcutCallbacks) {
  const {
    onSpace,
    onDelete,
    onSelectAll,
    onArrowUp,
    onArrowDown,
    onEscape,
    onEnter,
    onHelp,
    isDisabled = false,
  } = callbacks

  const handleKeyDown = useCallback(
    (event: KeyboardEvent) => {
      // Don't trigger shortcuts if disabled (e.g., when modals are open)
      if (isDisabled) return

      // Don't trigger shortcuts when user is typing in an input field
      if (isInputElement(event.target)) return

      const key = event.key
      const isMacPlatform = isMac()
      const isModifierPressed = isMacPlatform ? event.metaKey : event.ctrlKey

      // Handle Ctrl/Cmd+A to select all
      if (key === 'a' && isModifierPressed) {
        event.preventDefault()
        onSelectAll?.()
        return
      }

      // Handle Space to toggle pause/resume
      if (key === ' ') {
        event.preventDefault()
        onSpace?.()
        return
      }

      // Handle Delete key
      if (key === 'Delete') {
        event.preventDefault()
        onDelete?.()
        return
      }

      // Handle Arrow Up navigation
      if (key === 'ArrowUp') {
        event.preventDefault()
        onArrowUp?.()
        return
      }

      // Handle Arrow Down navigation
      if (key === 'ArrowDown') {
        event.preventDefault()
        onArrowDown?.()
        return
      }

      // Handle Escape to clear selection
      if (key === 'Escape') {
        event.preventDefault()
        onEscape?.()
        return
      }

      // Handle Enter to toggle selection of focused item
      if (key === 'Enter') {
        event.preventDefault()
        onEnter?.()
        return
      }

      // Handle ? or F1 to open help modal
      if (key === '?' || key === 'F1') {
        event.preventDefault()
        onHelp?.()
        return
      }
    },
    [
      isDisabled,
      onSpace,
      onDelete,
      onSelectAll,
      onArrowUp,
      onArrowDown,
      onEscape,
      onEnter,
      onHelp,
    ]
  )

  useEffect(() => {
    if (typeof window !== 'undefined') {
      document.addEventListener('keydown', handleKeyDown)
      return () => document.removeEventListener('keydown', handleKeyDown)
    }
  }, [handleKeyDown])
}
