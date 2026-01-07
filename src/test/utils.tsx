import React from 'react'
import { render } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { RenderOptions } from '@testing-library/react'

/**
 * Create a QueryClient for testing with appropriate defaults
 */
export function createTestQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
        gcTime: 0,
        staleTime: 0,
      },
      mutations: {
        retry: false,
      },
    },
  })
}

/**
 * Wrapper component that provides QueryClient context
 */
interface ProvidersProps {
  children: React.ReactNode
  queryClient?: QueryClient
}

export function Providers({ children, queryClient }: ProvidersProps) {
  const client = queryClient || createTestQueryClient()

  return <QueryClientProvider client={client}>{children}</QueryClientProvider>
}

/**
 * Custom render function that wraps components with necessary providers
 */
interface CustomRenderOptions extends Omit<RenderOptions, 'wrapper'> {
  queryClient?: QueryClient
}

export function renderWithProviders(
  ui: React.ReactElement,
  { queryClient, ...renderOptions }: CustomRenderOptions = {},
) {
  const client = queryClient || createTestQueryClient()

  function Wrapper({ children }: { children: React.ReactNode }) {
    return <Providers queryClient={client}>{children}</Providers>
  }

  return {
    ...render(ui, { wrapper: Wrapper, ...renderOptions }),
    queryClient: client,
  }
}

// Re-export everything from testing-library
export * from '@testing-library/react'
