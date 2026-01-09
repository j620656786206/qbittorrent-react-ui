import { useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from '@/components/ui/toast'

export interface ToastOptions {
  /**
   * Optional custom description for the toast
   */
  description?: string
  /**
   * Duration in milliseconds. Defaults to 4000ms for most toasts
   */
  duration?: number
  /**
   * Optional retry callback for error toasts
   */
  onRetry?: () => void
}

/**
 * Detect if an error is a network-related error
 *
 * @param error - The error to check
 * @returns true if the error is network-related
 */
function isNetworkError(error: unknown): boolean {
  if (!error) return false

  // Check for TypeError with network-related messages
  if (error instanceof TypeError) {
    const message = error.message.toLowerCase()
    return (
      message.includes('failed to fetch') ||
      message.includes('network') ||
      message.includes('networkerror') ||
      message.includes('load failed')
    )
  }

  // Check for string error messages
  if (typeof error === 'string') {
    const message = error.toLowerCase()
    return (
      message.includes('failed to fetch') ||
      message.includes('network') ||
      message.includes('networkerror') ||
      message.includes('load failed')
    )
  }

  // Check for Error objects with network-related messages
  if (error instanceof Error) {
    const message = error.message.toLowerCase()
    return (
      message.includes('failed to fetch') ||
      message.includes('network') ||
      message.includes('networkerror') ||
      message.includes('load failed')
    )
  }

  return false
}

/**
 * Custom hook providing utility functions for showing toast notifications
 * integrated with i18n translations
 *
 * @returns Object containing toast utility functions
 *
 * @example
 * ```tsx
 * const { showSuccess, showError, showLoading } = useToast()
 *
 * // Show success toast
 * showSuccess('torrent.actions.pause')
 *
 * // Show error with retry
 * showError('torrent.actions.pause', {
 *   onRetry: () => pauseMutation.mutate(hash)
 * })
 *
 * // Show loading toast
 * const loadingId = showLoading('batch.processing')
 * // Later dismiss it:
 * toast.dismiss(loadingId)
 * ```
 */
export function useToast() {
  const { t } = useTranslation()

  /**
   * Show a success toast notification
   *
   * @param messageKey - Translation key for the success message
   * @param options - Optional toast configuration
   * @returns Toast ID that can be used to dismiss the toast
   */
  const showSuccess = useCallback(
    (messageKey: string, options?: ToastOptions) => {
      const message = t(messageKey)
      return toast.success(message, {
        description: options?.description,
        duration: options?.duration ?? 4000,
      })
    },
    [t],
  )

  /**
   * Show an error toast notification with optional retry button
   * Automatically detects network errors and provides reconnection guidance
   *
   * @param messageKey - Translation key for the error message
   * @param options - Optional toast configuration including retry callback
   * @returns Toast ID that can be used to dismiss the toast
   */
  const showError = useCallback(
    (messageKey: string, options?: ToastOptions) => {
      // Check if the description contains a network error
      const hasNetworkError = options?.description
        ? isNetworkError(options.description)
        : false

      // Use network-specific error message if detected
      const message = hasNetworkError
        ? t('toast.error.networkRetry')
        : t(messageKey)

      // For network errors, provide helpful description
      const description = hasNetworkError
        ? t('toast.error.network')
        : options?.description

      return toast.error(message, {
        description,
        duration: options?.duration ?? 6000, // Longer duration for errors
        action: options?.onRetry
          ? {
              label: t('common.retry'),
              onClick: options.onRetry,
            }
          : undefined,
      })
    },
    [t],
  )

  /**
   * Show a loading toast notification
   *
   * @param messageKey - Translation key for the loading message
   * @param options - Optional toast configuration
   * @returns Toast ID that can be used to dismiss the toast
   */
  const showLoading = useCallback(
    (messageKey: string, options?: ToastOptions) => {
      const message = t(messageKey)
      return toast.loading(message, {
        description: options?.description,
        duration: options?.duration ?? Infinity, // Loading toasts persist by default
      })
    },
    [t],
  )

  /**
   * Show an info toast notification
   *
   * @param messageKey - Translation key for the info message
   * @param options - Optional toast configuration
   * @returns Toast ID that can be used to dismiss the toast
   */
  const showInfo = useCallback(
    (messageKey: string, options?: ToastOptions) => {
      const message = t(messageKey)
      return toast.info(message, {
        description: options?.description,
        duration: options?.duration ?? 4000,
      })
    },
    [t],
  )

  /**
   * Show a warning toast notification
   *
   * @param messageKey - Translation key for the warning message
   * @param options - Optional toast configuration
   * @returns Toast ID that can be used to dismiss the toast
   */
  const showWarning = useCallback(
    (messageKey: string, options?: ToastOptions) => {
      const message = t(messageKey)
      return toast.warning(message, {
        description: options?.description,
        duration: options?.duration ?? 5000,
      })
    },
    [t],
  )

  return {
    showSuccess,
    showError,
    showLoading,
    showInfo,
    showWarning,
  }
}
