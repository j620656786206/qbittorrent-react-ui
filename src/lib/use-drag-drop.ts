import { useCallback, useEffect, useRef, useState } from 'react'

export interface UseDragAndDropOptions {
  onDrop: (files: Array<File>) => void
}

export interface UseDragAndDropReturn {
  isDragging: boolean
}

/**
 * Custom hook for handling drag-and-drop file uploads globally
 *
 * Tracks when files are being dragged over the window and filters for .torrent files only.
 * Prevents default browser behavior to avoid opening files in the browser.
 *
 * @param options - Configuration object
 * @param options.onDrop - Callback function invoked when valid .torrent files are dropped
 * @returns Object containing isDragging state
 *
 * @example
 * ```tsx
 * const { isDragging } = useDragAndDrop({
 *   onDrop: (files) => {
 *     console.log('Dropped torrent files:', files)
 *   }
 * })
 * ```
 */
export function useDragAndDrop(
  options: UseDragAndDropOptions
): UseDragAndDropReturn {
  const { onDrop } = options
  const [isDragging, setIsDragging] = useState(false)

  // Use a ref to track the drag depth (number of dragenter - dragleave events)
  // This is needed because dragenter/dragleave fire for every child element
  const dragDepthRef = useRef(0)

  /**
   * Filter dropped files to only include .torrent files
   */
  const filterTorrentFiles = useCallback((files: FileList | null): Array<File> => {
    if (!files) return []

    const fileArray = Array.from(files)
    return fileArray.filter((file) => file.name.toLowerCase().endsWith('.torrent'))
  }, [])

  /**
   * Handle dragenter event
   * Increment drag depth and show drag overlay
   */
  const handleDragEnter = useCallback((event: DragEvent) => {
    event.preventDefault()
    event.stopPropagation()

    dragDepthRef.current += 1

    // Check if the drag contains files
    if (event.dataTransfer?.types.includes('Files')) {
      setIsDragging(true)
    }
  }, [])

  /**
   * Handle dragover event
   * Required to allow dropping
   */
  const handleDragOver = useCallback((event: DragEvent) => {
    event.preventDefault()
    event.stopPropagation()

    // Set the drop effect to indicate this is a valid drop zone
    if (event.dataTransfer) {
      event.dataTransfer.dropEffect = 'copy'
    }
  }, [])

  /**
   * Handle dragleave event
   * Decrement drag depth and hide overlay when leaving the window
   */
  const handleDragLeave = useCallback((event: DragEvent) => {
    event.preventDefault()
    event.stopPropagation()

    dragDepthRef.current -= 1

    // Only hide the overlay when we've left all elements
    if (dragDepthRef.current === 0) {
      setIsDragging(false)
    }
  }, [])

  /**
   * Handle drop event
   * Filter for .torrent files and invoke the onDrop callback
   */
  const handleDrop = useCallback(
    (event: DragEvent) => {
      event.preventDefault()
      event.stopPropagation()

      // Reset drag state
      dragDepthRef.current = 0
      setIsDragging(false)

      // Filter and process dropped files
      const torrentFiles = filterTorrentFiles(event.dataTransfer?.files || null)

      if (torrentFiles.length > 0) {
        onDrop(torrentFiles)
      }
    },
    [onDrop, filterTorrentFiles]
  )

  useEffect(() => {
    if (typeof window === 'undefined') return

    // Add event listeners to the window
    window.addEventListener('dragenter', handleDragEnter)
    window.addEventListener('dragover', handleDragOver)
    window.addEventListener('dragleave', handleDragLeave)
    window.addEventListener('drop', handleDrop)

    // Cleanup event listeners on unmount
    return () => {
      window.removeEventListener('dragenter', handleDragEnter)
      window.removeEventListener('dragover', handleDragOver)
      window.removeEventListener('dragleave', handleDragLeave)
      window.removeEventListener('drop', handleDrop)
    }
  }, [handleDragEnter, handleDragOver, handleDragLeave, handleDrop])

  return { isDragging }
}
