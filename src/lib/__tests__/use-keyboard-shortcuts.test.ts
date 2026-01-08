import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { renderHook } from '@testing-library/react'
import { useKeyboardShortcuts, isMac } from '../use-keyboard-shortcuts'

describe('isMac', () => {
  let originalNavigator: typeof navigator

  beforeEach(() => {
    originalNavigator = global.navigator
  })

  afterEach(() => {
    global.navigator = originalNavigator
  })

  it('should return true when platform contains MAC', () => {
    Object.defineProperty(global, 'navigator', {
      value: { platform: 'MacIntel' },
      writable: true,
      configurable: true,
    })

    expect(isMac()).toBe(true)
  })

  it('should return true when platform contains mac in lowercase', () => {
    Object.defineProperty(global, 'navigator', {
      value: { platform: 'macOS' },
      writable: true,
      configurable: true,
    })

    expect(isMac()).toBe(true)
  })

  it('should return false when platform does not contain MAC', () => {
    Object.defineProperty(global, 'navigator', {
      value: { platform: 'Win32' },
      writable: true,
      configurable: true,
    })

    expect(isMac()).toBe(false)
  })

  it('should return false when navigator is undefined', () => {
    Object.defineProperty(global, 'navigator', {
      value: undefined,
      writable: true,
      configurable: true,
    })

    expect(isMac()).toBe(false)
  })
})

describe('useKeyboardShortcuts', () => {
  let addEventListenerSpy: ReturnType<typeof vi.spyOn>
  let removeEventListenerSpy: ReturnType<typeof vi.spyOn>
  let originalNavigator: typeof navigator

  beforeEach(() => {
    addEventListenerSpy = vi.spyOn(document, 'addEventListener')
    removeEventListenerSpy = vi.spyOn(document, 'removeEventListener')
    originalNavigator = global.navigator
  })

  afterEach(() => {
    vi.clearAllMocks()
    global.navigator = originalNavigator
  })

  describe('Event Listener Management', () => {
    it('should attach keydown event listener on mount', () => {
      renderHook(() => useKeyboardShortcuts({}))

      expect(addEventListenerSpy).toHaveBeenCalledWith('keydown', expect.any(Function))
    })

    it('should remove keydown event listener on unmount', () => {
      const { unmount } = renderHook(() => useKeyboardShortcuts({}))

      const addListenerCalls = addEventListenerSpy.mock.calls
      expect(addListenerCalls.length).toBeGreaterThan(0)
      const handler = addListenerCalls[0][1]

      unmount()

      expect(removeEventListenerSpy).toHaveBeenCalledWith('keydown', handler)
    })

    it('should not leak event listeners on multiple renders', () => {
      const { rerender } = renderHook(() => useKeyboardShortcuts({}))

      const initialAddCalls = addEventListenerSpy.mock.calls.length

      rerender()
      rerender()

      const finalAddCalls = addEventListenerSpy.mock.calls.length
      expect(finalAddCalls).toBe(initialAddCalls)
    })
  })

  describe('Callback Invocation', () => {
    it('should call onSpace callback when Space key is pressed', () => {
      const onSpace = vi.fn()
      renderHook(() => useKeyboardShortcuts({ onSpace }))

      const event = new KeyboardEvent('keydown', { key: ' ' })
      document.dispatchEvent(event)

      expect(onSpace).toHaveBeenCalledTimes(1)
    })

    it('should call onDelete callback when Delete key is pressed', () => {
      const onDelete = vi.fn()
      renderHook(() => useKeyboardShortcuts({ onDelete }))

      const event = new KeyboardEvent('keydown', { key: 'Delete' })
      document.dispatchEvent(event)

      expect(onDelete).toHaveBeenCalledTimes(1)
    })

    it('should call onArrowUp callback when ArrowUp key is pressed', () => {
      const onArrowUp = vi.fn()
      renderHook(() => useKeyboardShortcuts({ onArrowUp }))

      const event = new KeyboardEvent('keydown', { key: 'ArrowUp' })
      document.dispatchEvent(event)

      expect(onArrowUp).toHaveBeenCalledTimes(1)
    })

    it('should call onArrowDown callback when ArrowDown key is pressed', () => {
      const onArrowDown = vi.fn()
      renderHook(() => useKeyboardShortcuts({ onArrowDown }))

      const event = new KeyboardEvent('keydown', { key: 'ArrowDown' })
      document.dispatchEvent(event)

      expect(onArrowDown).toHaveBeenCalledTimes(1)
    })

    it('should call onEscape callback when Escape key is pressed', () => {
      const onEscape = vi.fn()
      renderHook(() => useKeyboardShortcuts({ onEscape }))

      const event = new KeyboardEvent('keydown', { key: 'Escape' })
      document.dispatchEvent(event)

      expect(onEscape).toHaveBeenCalledTimes(1)
    })

    it('should call onEnter callback when Enter key is pressed', () => {
      const onEnter = vi.fn()
      renderHook(() => useKeyboardShortcuts({ onEnter }))

      const event = new KeyboardEvent('keydown', { key: 'Enter' })
      document.dispatchEvent(event)

      expect(onEnter).toHaveBeenCalledTimes(1)
    })

    it('should call onHelp callback when ? key is pressed', () => {
      const onHelp = vi.fn()
      renderHook(() => useKeyboardShortcuts({ onHelp }))

      const event = new KeyboardEvent('keydown', { key: '?' })
      document.dispatchEvent(event)

      expect(onHelp).toHaveBeenCalledTimes(1)
    })

    it('should call onHelp callback when F1 key is pressed', () => {
      const onHelp = vi.fn()
      renderHook(() => useKeyboardShortcuts({ onHelp }))

      const event = new KeyboardEvent('keydown', { key: 'F1' })
      document.dispatchEvent(event)

      expect(onHelp).toHaveBeenCalledTimes(1)
    })
  })

  describe('Platform-Specific Modifier Keys', () => {
    it('should call onSelectAll when Ctrl+A is pressed on Windows', () => {
      Object.defineProperty(global, 'navigator', {
        value: { platform: 'Win32' },
        writable: true,
        configurable: true,
      })

      const onSelectAll = vi.fn()
      renderHook(() => useKeyboardShortcuts({ onSelectAll }))

      const event = new KeyboardEvent('keydown', { key: 'a', ctrlKey: true })
      document.dispatchEvent(event)

      expect(onSelectAll).toHaveBeenCalledTimes(1)
    })

    it('should call onSelectAll when Cmd+A is pressed on Mac', () => {
      Object.defineProperty(global, 'navigator', {
        value: { platform: 'MacIntel' },
        writable: true,
        configurable: true,
      })

      const onSelectAll = vi.fn()
      renderHook(() => useKeyboardShortcuts({ onSelectAll }))

      const event = new KeyboardEvent('keydown', { key: 'a', metaKey: true })
      document.dispatchEvent(event)

      expect(onSelectAll).toHaveBeenCalledTimes(1)
    })

    it('should not call onSelectAll when Cmd+A is pressed on Windows', () => {
      Object.defineProperty(global, 'navigator', {
        value: { platform: 'Win32' },
        writable: true,
        configurable: true,
      })

      const onSelectAll = vi.fn()
      renderHook(() => useKeyboardShortcuts({ onSelectAll }))

      const event = new KeyboardEvent('keydown', { key: 'a', metaKey: true })
      document.dispatchEvent(event)

      expect(onSelectAll).not.toHaveBeenCalled()
    })

    it('should not call onSelectAll when Ctrl+A is pressed on Mac', () => {
      Object.defineProperty(global, 'navigator', {
        value: { platform: 'MacIntel' },
        writable: true,
        configurable: true,
      })

      const onSelectAll = vi.fn()
      renderHook(() => useKeyboardShortcuts({ onSelectAll }))

      const event = new KeyboardEvent('keydown', { key: 'a', ctrlKey: true })
      document.dispatchEvent(event)

      expect(onSelectAll).not.toHaveBeenCalled()
    })
  })

  describe('Input Field Guards', () => {
    it('should not trigger shortcuts when focused on INPUT element', () => {
      const onSpace = vi.fn()
      renderHook(() => useKeyboardShortcuts({ onSpace }))

      const input = document.createElement('input')
      document.body.appendChild(input)

      const event = new KeyboardEvent('keydown', { key: ' ', bubbles: true })
      Object.defineProperty(event, 'target', { value: input, enumerable: true })
      document.dispatchEvent(event)

      expect(onSpace).not.toHaveBeenCalled()

      document.body.removeChild(input)
    })

    it('should not trigger shortcuts when focused on TEXTAREA element', () => {
      const onDelete = vi.fn()
      renderHook(() => useKeyboardShortcuts({ onDelete }))

      const textarea = document.createElement('textarea')
      document.body.appendChild(textarea)

      const event = new KeyboardEvent('keydown', { key: 'Delete', bubbles: true })
      Object.defineProperty(event, 'target', { value: textarea, enumerable: true })
      document.dispatchEvent(event)

      expect(onDelete).not.toHaveBeenCalled()

      document.body.removeChild(textarea)
    })

    it('should not trigger shortcuts when focused on SELECT element', () => {
      const onArrowDown = vi.fn()
      renderHook(() => useKeyboardShortcuts({ onArrowDown }))

      const select = document.createElement('select')
      document.body.appendChild(select)

      const event = new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true })
      Object.defineProperty(event, 'target', { value: select, enumerable: true })
      document.dispatchEvent(event)

      expect(onArrowDown).not.toHaveBeenCalled()

      document.body.removeChild(select)
    })

    it('should not trigger shortcuts when focused on contentEditable element', () => {
      const onEnter = vi.fn()
      renderHook(() => useKeyboardShortcuts({ onEnter }))

      const div = document.createElement('div')
      div.contentEditable = 'true'
      document.body.appendChild(div)

      // Need to focus the element for isContentEditable to be true in jsdom
      div.focus()

      const event = new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })
      Object.defineProperty(event, 'target', { value: div, enumerable: true })

      // Mock isContentEditable property
      Object.defineProperty(div, 'isContentEditable', { value: true, configurable: true })

      document.dispatchEvent(event)

      expect(onEnter).not.toHaveBeenCalled()

      document.body.removeChild(div)
    })

    it('should trigger shortcuts when focused on non-input elements', () => {
      const onSpace = vi.fn()
      renderHook(() => useKeyboardShortcuts({ onSpace }))

      const div = document.createElement('div')
      document.body.appendChild(div)

      const event = new KeyboardEvent('keydown', { key: ' ', bubbles: true })
      Object.defineProperty(event, 'target', { value: div, enumerable: true })
      document.dispatchEvent(event)

      expect(onSpace).toHaveBeenCalledTimes(1)

      document.body.removeChild(div)
    })
  })

  describe('isDisabled Parameter', () => {
    it('should not trigger any shortcuts when isDisabled is true', () => {
      const onSpace = vi.fn()
      const onDelete = vi.fn()
      const onArrowUp = vi.fn()
      const onEscape = vi.fn()

      renderHook(() =>
        useKeyboardShortcuts({
          onSpace,
          onDelete,
          onArrowUp,
          onEscape,
          isDisabled: true,
        })
      )

      document.dispatchEvent(new KeyboardEvent('keydown', { key: ' ' }))
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Delete' }))
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowUp' }))
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))

      expect(onSpace).not.toHaveBeenCalled()
      expect(onDelete).not.toHaveBeenCalled()
      expect(onArrowUp).not.toHaveBeenCalled()
      expect(onEscape).not.toHaveBeenCalled()
    })

    it('should trigger shortcuts when isDisabled is false', () => {
      const onSpace = vi.fn()
      renderHook(() => useKeyboardShortcuts({ onSpace, isDisabled: false }))

      document.dispatchEvent(new KeyboardEvent('keydown', { key: ' ' }))

      expect(onSpace).toHaveBeenCalledTimes(1)
    })

    it('should trigger shortcuts when isDisabled is not provided (defaults to false)', () => {
      const onSpace = vi.fn()
      renderHook(() => useKeyboardShortcuts({ onSpace }))

      document.dispatchEvent(new KeyboardEvent('keydown', { key: ' ' }))

      expect(onSpace).toHaveBeenCalledTimes(1)
    })
  })

  describe('preventDefault Behavior', () => {
    it('should prevent default for Space key', () => {
      const onSpace = vi.fn()
      renderHook(() => useKeyboardShortcuts({ onSpace }))

      const event = new KeyboardEvent('keydown', { key: ' ' })
      const preventDefaultSpy = vi.spyOn(event, 'preventDefault')
      document.dispatchEvent(event)

      expect(preventDefaultSpy).toHaveBeenCalled()
    })

    it('should prevent default for Delete key', () => {
      const onDelete = vi.fn()
      renderHook(() => useKeyboardShortcuts({ onDelete }))

      const event = new KeyboardEvent('keydown', { key: 'Delete' })
      const preventDefaultSpy = vi.spyOn(event, 'preventDefault')
      document.dispatchEvent(event)

      expect(preventDefaultSpy).toHaveBeenCalled()
    })

    it('should prevent default for Arrow keys', () => {
      const onArrowUp = vi.fn()
      renderHook(() => useKeyboardShortcuts({ onArrowUp }))

      const event = new KeyboardEvent('keydown', { key: 'ArrowUp' })
      const preventDefaultSpy = vi.spyOn(event, 'preventDefault')
      document.dispatchEvent(event)

      expect(preventDefaultSpy).toHaveBeenCalled()
    })

    it('should prevent default for Ctrl/Cmd+A', () => {
      Object.defineProperty(global, 'navigator', {
        value: { platform: 'Win32' },
        writable: true,
        configurable: true,
      })

      const onSelectAll = vi.fn()
      renderHook(() => useKeyboardShortcuts({ onSelectAll }))

      const event = new KeyboardEvent('keydown', { key: 'a', ctrlKey: true })
      const preventDefaultSpy = vi.spyOn(event, 'preventDefault')
      document.dispatchEvent(event)

      expect(preventDefaultSpy).toHaveBeenCalled()
    })
  })

  describe('Multiple Callbacks', () => {
    it('should handle multiple different key presses correctly', () => {
      const onSpace = vi.fn()
      const onDelete = vi.fn()
      const onArrowUp = vi.fn()

      renderHook(() => useKeyboardShortcuts({ onSpace, onDelete, onArrowUp }))

      document.dispatchEvent(new KeyboardEvent('keydown', { key: ' ' }))
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Delete' }))
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowUp' }))

      expect(onSpace).toHaveBeenCalledTimes(1)
      expect(onDelete).toHaveBeenCalledTimes(1)
      expect(onArrowUp).toHaveBeenCalledTimes(1)
    })

    it('should handle the same key pressed multiple times', () => {
      const onSpace = vi.fn()
      renderHook(() => useKeyboardShortcuts({ onSpace }))

      document.dispatchEvent(new KeyboardEvent('keydown', { key: ' ' }))
      document.dispatchEvent(new KeyboardEvent('keydown', { key: ' ' }))
      document.dispatchEvent(new KeyboardEvent('keydown', { key: ' ' }))

      expect(onSpace).toHaveBeenCalledTimes(3)
    })
  })

  describe('Optional Callbacks', () => {
    it('should not error when callback is not provided', () => {
      renderHook(() => useKeyboardShortcuts({}))

      expect(() => {
        document.dispatchEvent(new KeyboardEvent('keydown', { key: ' ' }))
        document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Delete' }))
        document.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowUp' }))
      }).not.toThrow()
    })

    it('should only call provided callbacks', () => {
      const onSpace = vi.fn()
      renderHook(() => useKeyboardShortcuts({ onSpace }))

      document.dispatchEvent(new KeyboardEvent('keydown', { key: ' ' }))
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Delete' }))

      expect(onSpace).toHaveBeenCalledTimes(1)
    })
  })
})
