import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, renderHook } from '@testing-library/react'
import { useDragAndDrop } from '../use-drag-drop'

describe('useDragAndDrop', () => {
  let addEventListenerSpy: ReturnType<typeof vi.spyOn>
  let removeEventListenerSpy: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    addEventListenerSpy = vi.spyOn(window, 'addEventListener')
    removeEventListenerSpy = vi.spyOn(window, 'removeEventListener')
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  describe('Event Listener Management', () => {
    it('should attach drag event listeners on mount', () => {
      const onDrop = vi.fn()
      renderHook(() => useDragAndDrop({ onDrop }))

      expect(addEventListenerSpy).toHaveBeenCalledWith('dragenter', expect.any(Function))
      expect(addEventListenerSpy).toHaveBeenCalledWith('dragover', expect.any(Function))
      expect(addEventListenerSpy).toHaveBeenCalledWith('dragleave', expect.any(Function))
      expect(addEventListenerSpy).toHaveBeenCalledWith('drop', expect.any(Function))
    })

    it('should remove drag event listeners on unmount', () => {
      const onDrop = vi.fn()
      const { unmount } = renderHook(() => useDragAndDrop({ onDrop }))

      const dragenterHandler = addEventListenerSpy.mock.calls.find((call) => call[0] === 'dragenter')?.[1]
      const dragoverHandler = addEventListenerSpy.mock.calls.find((call) => call[0] === 'dragover')?.[1]
      const dragleaveHandler = addEventListenerSpy.mock.calls.find((call) => call[0] === 'dragleave')?.[1]
      const dropHandler = addEventListenerSpy.mock.calls.find((call) => call[0] === 'drop')?.[1]

      unmount()

      expect(removeEventListenerSpy).toHaveBeenCalledWith('dragenter', dragenterHandler)
      expect(removeEventListenerSpy).toHaveBeenCalledWith('dragover', dragoverHandler)
      expect(removeEventListenerSpy).toHaveBeenCalledWith('dragleave', dragleaveHandler)
      expect(removeEventListenerSpy).toHaveBeenCalledWith('drop', dropHandler)
    })

    it('should not leak event listeners on multiple renders', () => {
      const onDrop = vi.fn()
      const { rerender } = renderHook(() => useDragAndDrop({ onDrop }))

      const initialAddCalls = addEventListenerSpy.mock.calls.length

      rerender()
      rerender()

      const finalAddCalls = addEventListenerSpy.mock.calls.length
      expect(finalAddCalls).toBe(initialAddCalls)
    })
  })

  describe('isDragging State', () => {
    it('should initialize isDragging as false', () => {
      const onDrop = vi.fn()
      const { result } = renderHook(() => useDragAndDrop({ onDrop }))

      expect(result.current.isDragging).toBe(false)
    })

    it('should set isDragging to true on dragenter with files', () => {
      const onDrop = vi.fn()
      const { result } = renderHook(() => useDragAndDrop({ onDrop }))

      const event = new DragEvent('dragenter', {
        bubbles: true,
        cancelable: true,
      })
      Object.defineProperty(event, 'dataTransfer', {
        value: {
          types: ['Files'],
        },
        writable: false,
      })

      act(() => {
        window.dispatchEvent(event)
      })

      expect(result.current.isDragging).toBe(true)
    })

    it('should not set isDragging to true on dragenter without files', () => {
      const onDrop = vi.fn()
      const { result } = renderHook(() => useDragAndDrop({ onDrop }))

      const event = new DragEvent('dragenter', {
        bubbles: true,
        cancelable: true,
      })
      Object.defineProperty(event, 'dataTransfer', {
        value: {
          types: ['text/plain'],
        },
        writable: false,
      })

      window.dispatchEvent(event)

      expect(result.current.isDragging).toBe(false)
    })

    it('should set isDragging to false on dragleave when drag depth reaches zero', () => {
      const onDrop = vi.fn()
      const { result } = renderHook(() => useDragAndDrop({ onDrop }))

      // First dragenter
      const dragEnterEvent = new DragEvent('dragenter', {
        bubbles: true,
        cancelable: true,
      })
      Object.defineProperty(dragEnterEvent, 'dataTransfer', {
        value: {
          types: ['Files'],
        },
        writable: false,
      })
      act(() => {
        window.dispatchEvent(dragEnterEvent)
      })

      expect(result.current.isDragging).toBe(true)

      // Dragleave
      const dragLeaveEvent = new DragEvent('dragleave', {
        bubbles: true,
        cancelable: true,
      })
      act(() => {
        window.dispatchEvent(dragLeaveEvent)
      })

      expect(result.current.isDragging).toBe(false)
    })

    it('should handle drag depth correctly with nested elements', () => {
      const onDrop = vi.fn()
      const { result } = renderHook(() => useDragAndDrop({ onDrop }))

      // First dragenter (parent)
      const dragEnter1 = new DragEvent('dragenter', {
        bubbles: true,
        cancelable: true,
      })
      Object.defineProperty(dragEnter1, 'dataTransfer', {
        value: {
          types: ['Files'],
        },
        writable: false,
      })
      act(() => {
        window.dispatchEvent(dragEnter1)
      })
      expect(result.current.isDragging).toBe(true)

      // Second dragenter (child element)
      const dragEnter2 = new DragEvent('dragenter', {
        bubbles: true,
        cancelable: true,
      })
      Object.defineProperty(dragEnter2, 'dataTransfer', {
        value: {
          types: ['Files'],
        },
        writable: false,
      })
      act(() => {
        window.dispatchEvent(dragEnter2)
      })
      expect(result.current.isDragging).toBe(true)

      // First dragleave (child element)
      const dragLeave1 = new DragEvent('dragleave', {
        bubbles: true,
        cancelable: true,
      })
      act(() => {
        window.dispatchEvent(dragLeave1)
      })
      expect(result.current.isDragging).toBe(true) // Still dragging because depth > 0

      // Second dragleave (parent element)
      const dragLeave2 = new DragEvent('dragleave', {
        bubbles: true,
        cancelable: true,
      })
      act(() => {
        window.dispatchEvent(dragLeave2)
      })
      expect(result.current.isDragging).toBe(false) // Now false because depth === 0
    })

    it('should set isDragging to false on drop', () => {
      const onDrop = vi.fn()
      const { result } = renderHook(() => useDragAndDrop({ onDrop }))

      // Dragenter first
      const dragEnterEvent = new DragEvent('dragenter', {
        bubbles: true,
        cancelable: true,
      })
      Object.defineProperty(dragEnterEvent, 'dataTransfer', {
        value: {
          types: ['Files'],
        },
        writable: false,
      })
      act(() => {
        window.dispatchEvent(dragEnterEvent)
      })

      expect(result.current.isDragging).toBe(true)

      // Drop
      const torrentFile = new File(['test content'], 'test.torrent', { type: 'application/x-bittorrent' })
      const dropEvent = new DragEvent('drop', {
        bubbles: true,
        cancelable: true,
      })
      Object.defineProperty(dropEvent, 'dataTransfer', {
        value: {
          files: [torrentFile],
        },
        writable: false,
      })
      act(() => {
        window.dispatchEvent(dropEvent)
      })

      expect(result.current.isDragging).toBe(false)
    })
  })

  describe('File Filtering', () => {
    it('should only accept .torrent files', () => {
      const onDrop = vi.fn()
      renderHook(() => useDragAndDrop({ onDrop }))

      const torrentFile = new File(['test content'], 'test.torrent', { type: 'application/x-bittorrent' })
      const dropEvent = new DragEvent('drop', {
        bubbles: true,
        cancelable: true,
      })
      Object.defineProperty(dropEvent, 'dataTransfer', {
        value: {
          files: [torrentFile],
        },
        writable: false,
      })

      window.dispatchEvent(dropEvent)

      expect(onDrop).toHaveBeenCalledTimes(1)
      expect(onDrop).toHaveBeenCalledWith([torrentFile])
    })

    it('should filter out non-.torrent files', () => {
      const onDrop = vi.fn()
      renderHook(() => useDragAndDrop({ onDrop }))

      const torrentFile = new File(['test content'], 'test.torrent', { type: 'application/x-bittorrent' })
      const textFile = new File(['test content'], 'test.txt', { type: 'text/plain' })
      const pdfFile = new File(['test content'], 'test.pdf', { type: 'application/pdf' })

      const dropEvent = new DragEvent('drop', {
        bubbles: true,
        cancelable: true,
      })
      Object.defineProperty(dropEvent, 'dataTransfer', {
        value: {
          files: [textFile, torrentFile, pdfFile],
        },
        writable: false,
      })

      window.dispatchEvent(dropEvent)

      expect(onDrop).toHaveBeenCalledTimes(1)
      expect(onDrop).toHaveBeenCalledWith([torrentFile])
    })

    it('should handle .torrent files with uppercase extension', () => {
      const onDrop = vi.fn()
      renderHook(() => useDragAndDrop({ onDrop }))

      const torrentFile = new File(['test content'], 'test.TORRENT', { type: 'application/x-bittorrent' })
      const dropEvent = new DragEvent('drop', {
        bubbles: true,
        cancelable: true,
      })
      Object.defineProperty(dropEvent, 'dataTransfer', {
        value: {
          files: [torrentFile],
        },
        writable: false,
      })

      window.dispatchEvent(dropEvent)

      expect(onDrop).toHaveBeenCalledTimes(1)
      expect(onDrop).toHaveBeenCalledWith([torrentFile])
    })

    it('should handle .torrent files with mixed case extension', () => {
      const onDrop = vi.fn()
      renderHook(() => useDragAndDrop({ onDrop }))

      const torrentFile = new File(['test content'], 'test.ToRrEnT', { type: 'application/x-bittorrent' })
      const dropEvent = new DragEvent('drop', {
        bubbles: true,
        cancelable: true,
      })
      Object.defineProperty(dropEvent, 'dataTransfer', {
        value: {
          files: [torrentFile],
        },
        writable: false,
      })

      window.dispatchEvent(dropEvent)

      expect(onDrop).toHaveBeenCalledTimes(1)
      expect(onDrop).toHaveBeenCalledWith([torrentFile])
    })

    it('should not call onDrop when no torrent files are dropped', () => {
      const onDrop = vi.fn()
      renderHook(() => useDragAndDrop({ onDrop }))

      const textFile = new File(['test content'], 'test.txt', { type: 'text/plain' })
      const dropEvent = new DragEvent('drop', {
        bubbles: true,
        cancelable: true,
      })
      Object.defineProperty(dropEvent, 'dataTransfer', {
        value: {
          files: [textFile],
        },
        writable: false,
      })

      window.dispatchEvent(dropEvent)

      expect(onDrop).not.toHaveBeenCalled()
    })

    it('should not call onDrop when no files are dropped', () => {
      const onDrop = vi.fn()
      renderHook(() => useDragAndDrop({ onDrop }))

      const dropEvent = new DragEvent('drop', {
        bubbles: true,
        cancelable: true,
      })
      Object.defineProperty(dropEvent, 'dataTransfer', {
        value: {
          files: [],
        },
        writable: false,
      })

      window.dispatchEvent(dropEvent)

      expect(onDrop).not.toHaveBeenCalled()
    })
  })

  describe('Multiple Files', () => {
    it('should handle multiple torrent files', () => {
      const onDrop = vi.fn()
      renderHook(() => useDragAndDrop({ onDrop }))

      const file1 = new File(['content 1'], 'test1.torrent', { type: 'application/x-bittorrent' })
      const file2 = new File(['content 2'], 'test2.torrent', { type: 'application/x-bittorrent' })
      const file3 = new File(['content 3'], 'test3.torrent', { type: 'application/x-bittorrent' })

      const dropEvent = new DragEvent('drop', {
        bubbles: true,
        cancelable: true,
      })
      Object.defineProperty(dropEvent, 'dataTransfer', {
        value: {
          files: [file1, file2, file3],
        },
        writable: false,
      })

      window.dispatchEvent(dropEvent)

      expect(onDrop).toHaveBeenCalledTimes(1)
      expect(onDrop).toHaveBeenCalledWith([file1, file2, file3])
    })

    it('should filter multiple files and return only torrents', () => {
      const onDrop = vi.fn()
      renderHook(() => useDragAndDrop({ onDrop }))

      const torrent1 = new File(['content 1'], 'test1.torrent', { type: 'application/x-bittorrent' })
      const textFile = new File(['text'], 'readme.txt', { type: 'text/plain' })
      const torrent2 = new File(['content 2'], 'test2.torrent', { type: 'application/x-bittorrent' })
      const imageFile = new File(['image'], 'photo.jpg', { type: 'image/jpeg' })

      const dropEvent = new DragEvent('drop', {
        bubbles: true,
        cancelable: true,
      })
      Object.defineProperty(dropEvent, 'dataTransfer', {
        value: {
          files: [torrent1, textFile, torrent2, imageFile],
        },
        writable: false,
      })

      window.dispatchEvent(dropEvent)

      expect(onDrop).toHaveBeenCalledTimes(1)
      expect(onDrop).toHaveBeenCalledWith([torrent1, torrent2])
    })
  })

  describe('onDrop Callback', () => {
    it('should call onDrop callback when valid torrent files are dropped', () => {
      const onDrop = vi.fn()
      renderHook(() => useDragAndDrop({ onDrop }))

      const torrentFile = new File(['test content'], 'test.torrent', { type: 'application/x-bittorrent' })
      const dropEvent = new DragEvent('drop', {
        bubbles: true,
        cancelable: true,
      })
      Object.defineProperty(dropEvent, 'dataTransfer', {
        value: {
          files: [torrentFile],
        },
        writable: false,
      })

      window.dispatchEvent(dropEvent)

      expect(onDrop).toHaveBeenCalledTimes(1)
      expect(onDrop).toHaveBeenCalledWith([torrentFile])
    })

    it('should call onDrop with correct file array', () => {
      const onDrop = vi.fn()
      renderHook(() => useDragAndDrop({ onDrop }))

      const file1 = new File(['content 1'], 'test1.torrent', { type: 'application/x-bittorrent' })
      const file2 = new File(['content 2'], 'test2.torrent', { type: 'application/x-bittorrent' })

      const dropEvent = new DragEvent('drop', {
        bubbles: true,
        cancelable: true,
      })
      Object.defineProperty(dropEvent, 'dataTransfer', {
        value: {
          files: [file1, file2],
        },
        writable: false,
      })

      window.dispatchEvent(dropEvent)

      expect(onDrop).toHaveBeenCalledWith([file1, file2])
    })

    it('should handle callback updates', () => {
      const onDrop1 = vi.fn()
      const onDrop2 = vi.fn()

      const { rerender } = renderHook(
        ({ onDrop }) => useDragAndDrop({ onDrop }),
        {
          initialProps: { onDrop: onDrop1 },
        }
      )

      const torrentFile = new File(['test content'], 'test.torrent', { type: 'application/x-bittorrent' })
      const dropEvent = new DragEvent('drop', {
        bubbles: true,
        cancelable: true,
      })
      Object.defineProperty(dropEvent, 'dataTransfer', {
        value: {
          files: [torrentFile],
        },
        writable: false,
      })

      window.dispatchEvent(dropEvent)

      expect(onDrop1).toHaveBeenCalledTimes(1)
      expect(onDrop2).not.toHaveBeenCalled()

      // Update the callback
      rerender({ onDrop: onDrop2 })

      const dropEvent2 = new DragEvent('drop', {
        bubbles: true,
        cancelable: true,
      })
      Object.defineProperty(dropEvent2, 'dataTransfer', {
        value: {
          files: [torrentFile],
        },
        writable: false,
      })

      window.dispatchEvent(dropEvent2)

      expect(onDrop1).toHaveBeenCalledTimes(1) // Still 1
      expect(onDrop2).toHaveBeenCalledTimes(1) // Now called
    })
  })

  describe('preventDefault Behavior', () => {
    it('should prevent default on dragenter', () => {
      const onDrop = vi.fn()
      renderHook(() => useDragAndDrop({ onDrop }))

      const event = new DragEvent('dragenter', {
        bubbles: true,
        cancelable: true,
      })
      Object.defineProperty(event, 'dataTransfer', {
        value: {
          types: ['Files'],
        },
        writable: false,
      })

      const preventDefaultSpy = vi.spyOn(event, 'preventDefault')
      act(() => {
        window.dispatchEvent(event)
      })

      expect(preventDefaultSpy).toHaveBeenCalled()
    })

    it('should prevent default on dragover', () => {
      const onDrop = vi.fn()
      renderHook(() => useDragAndDrop({ onDrop }))

      const event = new DragEvent('dragover', {
        bubbles: true,
        cancelable: true,
      })
      Object.defineProperty(event, 'dataTransfer', {
        value: {
          dropEffect: 'none',
        },
        writable: true,
      })

      const preventDefaultSpy = vi.spyOn(event, 'preventDefault')
      window.dispatchEvent(event)

      expect(preventDefaultSpy).toHaveBeenCalled()
    })

    it('should set dropEffect to copy on dragover', () => {
      const onDrop = vi.fn()
      renderHook(() => useDragAndDrop({ onDrop }))

      const dataTransfer = {
        dropEffect: 'none',
      }

      const event = new DragEvent('dragover', {
        bubbles: true,
        cancelable: true,
      })
      Object.defineProperty(event, 'dataTransfer', {
        value: dataTransfer,
        writable: false,
      })

      window.dispatchEvent(event)

      expect(dataTransfer.dropEffect).toBe('copy')
    })

    it('should prevent default on dragleave', () => {
      const onDrop = vi.fn()
      renderHook(() => useDragAndDrop({ onDrop }))

      const event = new DragEvent('dragleave', {
        bubbles: true,
        cancelable: true,
      })

      const preventDefaultSpy = vi.spyOn(event, 'preventDefault')
      window.dispatchEvent(event)

      expect(preventDefaultSpy).toHaveBeenCalled()
    })

    it('should prevent default on drop', () => {
      const onDrop = vi.fn()
      renderHook(() => useDragAndDrop({ onDrop }))

      const torrentFile = new File(['test content'], 'test.torrent', { type: 'application/x-bittorrent' })
      const event = new DragEvent('drop', {
        bubbles: true,
        cancelable: true,
      })
      Object.defineProperty(event, 'dataTransfer', {
        value: {
          files: [torrentFile],
        },
        writable: false,
      })

      const preventDefaultSpy = vi.spyOn(event, 'preventDefault')
      window.dispatchEvent(event)

      expect(preventDefaultSpy).toHaveBeenCalled()
    })
  })

  describe('Edge Cases', () => {
    it('should handle drop event with null files', () => {
      const onDrop = vi.fn()
      renderHook(() => useDragAndDrop({ onDrop }))

      const dropEvent = new DragEvent('drop', {
        bubbles: true,
        cancelable: true,
      })
      Object.defineProperty(dropEvent, 'dataTransfer', {
        value: {
          files: null,
        },
        writable: false,
      })

      window.dispatchEvent(dropEvent)

      expect(onDrop).not.toHaveBeenCalled()
    })

    it('should handle drop event with undefined dataTransfer', () => {
      const onDrop = vi.fn()
      renderHook(() => useDragAndDrop({ onDrop }))

      const dropEvent = new DragEvent('drop', {
        bubbles: true,
        cancelable: true,
      })

      window.dispatchEvent(dropEvent)

      expect(onDrop).not.toHaveBeenCalled()
    })

    it('should reset drag depth on drop', () => {
      const onDrop = vi.fn()
      const { result } = renderHook(() => useDragAndDrop({ onDrop }))

      // Multiple dragenter events
      const dragEnter1 = new DragEvent('dragenter', {
        bubbles: true,
        cancelable: true,
      })
      Object.defineProperty(dragEnter1, 'dataTransfer', {
        value: {
          types: ['Files'],
        },
        writable: false,
      })
      act(() => {
        window.dispatchEvent(dragEnter1)
      })

      const dragEnter2 = new DragEvent('dragenter', {
        bubbles: true,
        cancelable: true,
      })
      Object.defineProperty(dragEnter2, 'dataTransfer', {
        value: {
          types: ['Files'],
        },
        writable: false,
      })
      act(() => {
        window.dispatchEvent(dragEnter2)
      })

      expect(result.current.isDragging).toBe(true)

      // Drop should reset drag depth to 0
      const torrentFile = new File(['test content'], 'test.torrent', { type: 'application/x-bittorrent' })
      const dropEvent = new DragEvent('drop', {
        bubbles: true,
        cancelable: true,
      })
      Object.defineProperty(dropEvent, 'dataTransfer', {
        value: {
          files: [torrentFile],
        },
        writable: false,
      })
      act(() => {
        window.dispatchEvent(dropEvent)
      })

      expect(result.current.isDragging).toBe(false)

      // Single dragleave should not set isDragging to false if depth was already reset
      const dragEnter3 = new DragEvent('dragenter', {
        bubbles: true,
        cancelable: true,
      })
      Object.defineProperty(dragEnter3, 'dataTransfer', {
        value: {
          types: ['Files'],
        },
        writable: false,
      })
      act(() => {
        window.dispatchEvent(dragEnter3)
      })
      expect(result.current.isDragging).toBe(true)

      const dragLeave = new DragEvent('dragleave', {
        bubbles: true,
        cancelable: true,
      })
      act(() => {
        window.dispatchEvent(dragLeave)
      })
      expect(result.current.isDragging).toBe(false)
    })

    it('should handle dragover without dataTransfer', () => {
      const onDrop = vi.fn()
      renderHook(() => useDragAndDrop({ onDrop }))

      const event = new DragEvent('dragover', {
        bubbles: true,
        cancelable: true,
      })

      expect(() => {
        window.dispatchEvent(event)
      }).not.toThrow()
    })

    it('should handle files with no extension', () => {
      const onDrop = vi.fn()
      renderHook(() => useDragAndDrop({ onDrop }))

      const file = new File(['test content'], 'noextension', { type: 'application/octet-stream' })
      const dropEvent = new DragEvent('drop', {
        bubbles: true,
        cancelable: true,
      })
      Object.defineProperty(dropEvent, 'dataTransfer', {
        value: {
          files: [file],
        },
        writable: false,
      })

      window.dispatchEvent(dropEvent)

      expect(onDrop).not.toHaveBeenCalled()
    })

    it('should handle files with .torrent in the middle of filename', () => {
      const onDrop = vi.fn()
      renderHook(() => useDragAndDrop({ onDrop }))

      const file = new File(['test content'], 'my.torrent.file.txt', { type: 'text/plain' })
      const dropEvent = new DragEvent('drop', {
        bubbles: true,
        cancelable: true,
      })
      Object.defineProperty(dropEvent, 'dataTransfer', {
        value: {
          files: [file],
        },
        writable: false,
      })

      window.dispatchEvent(dropEvent)

      expect(onDrop).not.toHaveBeenCalled()
    })
  })
})
