import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { AppPreferences, AppPreferencesPayload } from '@/types/preferences'
import { getPreferences, setPreferences } from '@/lib/api'

/**
 * Hook to fetch qBittorrent application preferences
 * Uses a 5-minute staleTime since preferences don't change often
 *
 * @param baseUrl - Optional base URL for the qBittorrent WebUI
 * @returns TanStack Query result with preferences data
 */
export function usePreferences(baseUrl?: string) {
  const effectiveBaseUrl =
    baseUrl ||
    import.meta.env.VITE_QBIT_BASE_URL ||
    localStorage.getItem('qbit_baseUrl') ||
    window.location.origin

  return useQuery<AppPreferences>({
    queryKey: ['preferences'],
    queryFn: async () => {
      const data = await getPreferences(effectiveBaseUrl)
      return data as AppPreferences
    },
    staleTime: 5 * 60 * 1000, // 5 minutes
  })
}

/**
 * Hook to update qBittorrent application preferences
 * Invalidates the preferences cache on successful mutation
 *
 * @param baseUrl - Optional base URL for the qBittorrent WebUI
 * @returns TanStack Query mutation result
 */
export function useUpdatePreferences(baseUrl?: string) {
  const queryClient = useQueryClient()
  const effectiveBaseUrl =
    baseUrl ||
    import.meta.env.VITE_QBIT_BASE_URL ||
    localStorage.getItem('qbit_baseUrl') ||
    window.location.origin

  return useMutation({
    mutationFn: (payload: AppPreferencesPayload) =>
      setPreferences(effectiveBaseUrl, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['preferences'] })
    },
  })
}
