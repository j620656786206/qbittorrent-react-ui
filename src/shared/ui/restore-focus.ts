import { useLayoutEffect, useRef } from 'react'

/**
 * For a button that can disappear while it has focus (the alert bar, the
 * list's 「重試」 block): on unmount, if the button had focus and nothing
 * else took it, focus `restoreFocusTo()` instead of letting it fall to
 * `body`. Spread the result on the button.
 */
export function useRestoreFocusOnUnmount(
  restoreFocusTo: (() => HTMLElement | null) | undefined,
) {
  const ref = useRef<HTMLButtonElement>(null)
  const focusedRef = useRef(false)
  const restoreRef = useRef(restoreFocusTo)

  useLayoutEffect(() => {
    restoreRef.current = restoreFocusTo
  })

  useLayoutEffect(() => {
    const button = ref.current
    return () => {
      if (!focusedRef.current) return
      const active = document.activeElement
      if (active && active !== document.body && active !== button) return
      restoreRef.current?.()?.focus()
    }
  }, [])

  return {
    ref,
    onFocus: () => (focusedRef.current = true),
    onBlur: () => (focusedRef.current = false),
  }
}
