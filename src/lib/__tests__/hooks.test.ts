import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { useMediaQuery } from '../hooks'

// Mock matchMedia
type MediaQueryListMock = {
  matches: boolean
  media: string
  addEventListener: ReturnType<typeof vi.fn>
  removeEventListener: ReturnType<typeof vi.fn>
  addListener: ReturnType<typeof vi.fn>
  removeListener: ReturnType<typeof vi.fn>
  dispatchEvent: ReturnType<typeof vi.fn>
  onchange: null | ((event: MediaQueryListEvent) => void)
}

const createMatchMediaMock = (matches: boolean) => {
  const listeners: Array<(event: MediaQueryListEvent) => void> = []

  const mediaQueryList: MediaQueryListMock = {
    matches,
    media: '',
    addEventListener: vi.fn(
      (event: string, handler: (event: MediaQueryListEvent) => void) => {
        if (event === 'change') {
          listeners.push(handler)
        }
      },
    ),
    removeEventListener: vi.fn(
      (event: string, handler: (event: MediaQueryListEvent) => void) => {
        if (event === 'change') {
          const index = listeners.indexOf(handler)
          if (index > -1) {
            listeners.splice(index, 1)
          }
        }
      },
    ),
    addListener: vi.fn(),
    removeListener: vi.fn(),
    dispatchEvent: vi.fn(),
    onchange: null,
  }

  // Helper to trigger change events
  const triggerChange = (newMatches: boolean) => {
    mediaQueryList.matches = newMatches
    const event = { matches: newMatches } as MediaQueryListEvent
    listeners.forEach((listener) => listener(event))
  }

  return { mediaQueryList, triggerChange }
}

describe('useMediaQuery', () => {
  let matchMediaMock: ReturnType<typeof createMatchMediaMock>
  let originalMatchMedia: typeof window.matchMedia

  beforeEach(() => {
    originalMatchMedia = window.matchMedia
    matchMediaMock = createMatchMediaMock(false)
    window.matchMedia = vi.fn(
      () => matchMediaMock.mediaQueryList as unknown as MediaQueryList,
    )
  })

  afterEach(() => {
    window.matchMedia = originalMatchMedia
    vi.clearAllMocks()
  })

  describe('Initial State', () => {
    it('should return false initially', () => {
      const { result } = renderHook(() => useMediaQuery('(min-width: 768px)'))
      expect(result.current).toBe(false)
    })

    it('should call window.matchMedia with the query', () => {
      renderHook(() => useMediaQuery('(min-width: 768px)'))
      expect(window.matchMedia).toHaveBeenCalledWith('(min-width: 768px)')
    })
  })

  describe('Media Query Matching', () => {
    it('should return true when media query matches', async () => {
      matchMediaMock = createMatchMediaMock(true)
      window.matchMedia = vi.fn(
        () => matchMediaMock.mediaQueryList as unknown as MediaQueryList,
      )

      const { result } = renderHook(() => useMediaQuery('(min-width: 768px)'))

      await waitFor(() => {
        expect(result.current).toBe(true)
      })
    })

    it('should return false when media query does not match', async () => {
      matchMediaMock = createMatchMediaMock(false)
      window.matchMedia = vi.fn(
        () => matchMediaMock.mediaQueryList as unknown as MediaQueryList,
      )

      const { result } = renderHook(() => useMediaQuery('(min-width: 768px)'))

      await waitFor(() => {
        expect(result.current).toBe(false)
      })
    })
  })

  describe('Media Query Changes', () => {
    it('should update when media query match changes from false to true', async () => {
      matchMediaMock = createMatchMediaMock(false)
      window.matchMedia = vi.fn(
        () => matchMediaMock.mediaQueryList as unknown as MediaQueryList,
      )

      const { result } = renderHook(() => useMediaQuery('(min-width: 768px)'))

      await waitFor(() => {
        expect(result.current).toBe(false)
      })

      matchMediaMock.triggerChange(true)

      await waitFor(() => {
        expect(result.current).toBe(true)
      })
    })

    it('should update when media query match changes from true to false', async () => {
      matchMediaMock = createMatchMediaMock(true)
      window.matchMedia = vi.fn(
        () => matchMediaMock.mediaQueryList as unknown as MediaQueryList,
      )

      const { result } = renderHook(() => useMediaQuery('(min-width: 768px)'))

      await waitFor(() => {
        expect(result.current).toBe(true)
      })

      matchMediaMock.triggerChange(false)

      await waitFor(() => {
        expect(result.current).toBe(false)
      })
    })

    it('should handle multiple changes', async () => {
      matchMediaMock = createMatchMediaMock(false)
      window.matchMedia = vi.fn(
        () => matchMediaMock.mediaQueryList as unknown as MediaQueryList,
      )

      const { result } = renderHook(() => useMediaQuery('(min-width: 768px)'))

      await waitFor(() => {
        expect(result.current).toBe(false)
      })

      matchMediaMock.triggerChange(true)
      await waitFor(() => {
        expect(result.current).toBe(true)
      })

      matchMediaMock.triggerChange(false)
      await waitFor(() => {
        expect(result.current).toBe(false)
      })

      matchMediaMock.triggerChange(true)
      await waitFor(() => {
        expect(result.current).toBe(true)
      })
    })
  })

  describe('Event Listener Management', () => {
    it('should add event listener on mount', () => {
      renderHook(() => useMediaQuery('(min-width: 768px)'))
      expect(
        matchMediaMock.mediaQueryList.addEventListener,
      ).toHaveBeenCalledWith('change', expect.any(Function))
    })

    it('should remove event listener on unmount', () => {
      const { unmount } = renderHook(() => useMediaQuery('(min-width: 768px)'))

      const addListenerCalls =
        matchMediaMock.mediaQueryList.addEventListener.mock.calls
      expect(addListenerCalls.length).toBe(1)
      const handler = addListenerCalls[0][1]

      unmount()

      expect(
        matchMediaMock.mediaQueryList.removeEventListener,
      ).toHaveBeenCalledWith('change', handler)
    })

    it('should not leak event listeners on multiple renders', () => {
      const { rerender } = renderHook(() => useMediaQuery('(min-width: 768px)'))

      const initialAddCalls =
        matchMediaMock.mediaQueryList.addEventListener.mock.calls.length

      rerender()
      rerender()

      const finalAddCalls =
        matchMediaMock.mediaQueryList.addEventListener.mock.calls.length
      expect(finalAddCalls).toBe(initialAddCalls)
    })
  })

  describe('Query Parameter Changes', () => {
    it('should update when query parameter changes', async () => {
      const { result, rerender } = renderHook(
        ({ query }: { query: '(min-width: 768px)' | '(min-width: 1024px)' }) =>
          useMediaQuery(query),
        {
          initialProps: {
            query: '(min-width: 768px)' as
              | '(min-width: 768px)'
              | '(min-width: 1024px)',
          },
        },
      )

      await waitFor(() => {
        expect(window.matchMedia).toHaveBeenCalledWith('(min-width: 768px)')
      })

      matchMediaMock = createMatchMediaMock(true)
      window.matchMedia = vi.fn(
        () => matchMediaMock.mediaQueryList as unknown as MediaQueryList,
      )

      rerender({ query: '(min-width: 1024px)' })

      await waitFor(() => {
        expect(window.matchMedia).toHaveBeenCalledWith('(min-width: 1024px)')
        expect(result.current).toBe(true)
      })
    })

    it('should clean up old listener when query changes', async () => {
      const firstMock = createMatchMediaMock(false)
      window.matchMedia = vi.fn(
        () => firstMock.mediaQueryList as unknown as MediaQueryList,
      )

      const { rerender } = renderHook(
        ({ query }: { query: '(min-width: 768px)' | '(min-width: 1024px)' }) =>
          useMediaQuery(query),
        {
          initialProps: {
            query: '(min-width: 768px)' as
              | '(min-width: 768px)'
              | '(min-width: 1024px)',
          },
        },
      )

      const firstHandler =
        firstMock.mediaQueryList.addEventListener.mock.calls[0][1]

      const secondMock = createMatchMediaMock(false)
      window.matchMedia = vi.fn(
        () => secondMock.mediaQueryList as unknown as MediaQueryList,
      )

      rerender({ query: '(min-width: 1024px)' })

      await waitFor(() => {
        expect(
          firstMock.mediaQueryList.removeEventListener,
        ).toHaveBeenCalledWith('change', firstHandler)
      })
    })
  })

  describe('Different Query Types', () => {
    it('should handle min-width queries', async () => {
      matchMediaMock = createMatchMediaMock(true)
      window.matchMedia = vi.fn(
        () => matchMediaMock.mediaQueryList as unknown as MediaQueryList,
      )

      const { result } = renderHook(() => useMediaQuery('(min-width: 768px)'))

      await waitFor(() => {
        expect(result.current).toBe(true)
      })
    })

    it('should handle max-width queries', async () => {
      matchMediaMock = createMatchMediaMock(true)
      window.matchMedia = vi.fn(
        () => matchMediaMock.mediaQueryList as unknown as MediaQueryList,
      )

      const { result } = renderHook(() => useMediaQuery('(max-width: 768px)'))

      await waitFor(() => {
        expect(result.current).toBe(true)
      })
    })

    it('should handle different breakpoint values', async () => {
      matchMediaMock = createMatchMediaMock(true)
      window.matchMedia = vi.fn(
        () => matchMediaMock.mediaQueryList as unknown as MediaQueryList,
      )

      const { result: result1 } = renderHook(() =>
        useMediaQuery('(min-width: 640px)'),
      )
      const { result: result2 } = renderHook(() =>
        useMediaQuery('(min-width: 1280px)'),
      )
      const { result: result3 } = renderHook(() =>
        useMediaQuery('(max-width: 1536px)'),
      )

      await waitFor(() => {
        expect(result1.current).toBe(true)
        expect(result2.current).toBe(true)
        expect(result3.current).toBe(true)
      })
    })
  })

  describe('Multiple Hook Instances', () => {
    it('should remain stable when same query is used multiple times', async () => {
      matchMediaMock = createMatchMediaMock(true)
      window.matchMedia = vi.fn(
        () => matchMediaMock.mediaQueryList as unknown as MediaQueryList,
      )

      const { result: result1 } = renderHook(() =>
        useMediaQuery('(min-width: 768px)'),
      )
      const { result: result2 } = renderHook(() =>
        useMediaQuery('(min-width: 768px)'),
      )

      await waitFor(() => {
        expect(result1.current).toBe(true)
        expect(result2.current).toBe(true)
      })

      matchMediaMock.triggerChange(false)

      await waitFor(() => {
        expect(result1.current).toBe(false)
        expect(result2.current).toBe(false)
      })
    })

    it('should handle different queries independently', async () => {
      const mock1 = createMatchMediaMock(true)
      const mock2 = createMatchMediaMock(false)

      window.matchMedia = vi.fn((query: string) => {
        if (query === '(min-width: 768px)') {
          return mock1.mediaQueryList as unknown as MediaQueryList
        }
        return mock2.mediaQueryList as unknown as MediaQueryList
      })

      const { result: result1 } = renderHook(() =>
        useMediaQuery('(min-width: 768px)'),
      )
      const { result: result2 } = renderHook(() =>
        useMediaQuery('(min-width: 1024px)'),
      )

      await waitFor(() => {
        expect(result1.current).toBe(true)
        expect(result2.current).toBe(false)
      })
    })
  })
})
