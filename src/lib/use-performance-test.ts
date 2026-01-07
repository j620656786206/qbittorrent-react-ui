/**
 * Performance Testing Hook
 *
 * This hook provides a way to inject mock torrents for performance testing
 * in development mode. It exposes methods on the window object for console access.
 *
 * Usage in browser console:
 * - window.__injectMockTorrents(2000)  // Inject 2000 mock torrents
 * - window.__clearMockTorrents()       // Clear mock torrents
 * - window.__getPerformanceReport()    // Get performance metrics
 */

import { useState, useCallback, useEffect } from 'react'
import type { Torrent } from '@/types/torrent'
import { generateMockTorrents, PerformanceMetrics } from './performance-test-utils'

// Global state for mock torrents (persists across component re-renders)
let globalMockTorrents: Torrent[] = []
let globalIsTestMode = false
let listeners: Set<() => void> = new Set()

function notifyListeners() {
  listeners.forEach((listener) => listener())
}

/**
 * Hook to enable performance testing with mock data
 */
export function usePerformanceTest() {
  const [, forceUpdate] = useState({})

  useEffect(() => {
    const listener = () => forceUpdate({})
    listeners.add(listener)
    return () => {
      listeners.delete(listener)
    }
  }, [])

  const injectMockTorrents = useCallback((count: number = 1000) => {
    const startTime = performance.now()
    globalMockTorrents = generateMockTorrents(count)
    globalIsTestMode = true
    const endTime = performance.now()

    console.info(
      `[Performance Test] Injected ${count} mock torrents in ${(endTime - startTime).toFixed(2)}ms`
    )

    notifyListeners()
    return globalMockTorrents
  }, [])

  const clearMockTorrents = useCallback(() => {
    globalMockTorrents = []
    globalIsTestMode = false
    console.info('[Performance Test] Cleared mock torrents')
    notifyListeners()
  }, [])

  const getPerformanceReport = useCallback(() => {
    PerformanceMetrics.logPerformanceReport(globalMockTorrents.length)
    return {
      torrentCount: globalMockTorrents.length,
      domNodes: PerformanceMetrics.countDOMNodes(),
      memory: PerformanceMetrics.getMemoryUsage(),
    }
  }, [])

  return {
    mockTorrents: globalMockTorrents,
    isTestMode: globalIsTestMode,
    injectMockTorrents,
    clearMockTorrents,
    getPerformanceReport,
  }
}

// Expose methods globally in development mode
if (import.meta.env.DEV) {
  const windowWithTest = window as unknown as {
    __injectMockTorrents: (count?: number) => Torrent[]
    __clearMockTorrents: () => void
    __getPerformanceReport: () => object
    __getMockTorrents: () => Torrent[]
  }

  windowWithTest.__injectMockTorrents = (count: number = 1000) => {
    const startTime = performance.now()
    globalMockTorrents = generateMockTorrents(count)
    globalIsTestMode = true
    const endTime = performance.now()

    console.info(
      `[Performance Test] Injected ${count} mock torrents in ${(endTime - startTime).toFixed(2)}ms`
    )
    console.info('[Performance Test] Mock torrents available via window.__getMockTorrents()')
    console.info('[Performance Test] To use in the app, see the Performance Testing Guide')

    notifyListeners()
    return globalMockTorrents
  }

  windowWithTest.__clearMockTorrents = () => {
    globalMockTorrents = []
    globalIsTestMode = false
    console.info('[Performance Test] Cleared mock torrents')
    notifyListeners()
  }

  windowWithTest.__getPerformanceReport = () => {
    PerformanceMetrics.logPerformanceReport(globalMockTorrents.length)
    return {
      torrentCount: globalMockTorrents.length,
      domNodes: PerformanceMetrics.countDOMNodes(),
      memory: PerformanceMetrics.getMemoryUsage(),
    }
  }

  windowWithTest.__getMockTorrents = () => globalMockTorrents
}
