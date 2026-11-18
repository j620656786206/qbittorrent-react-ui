import { useEffect } from 'react'
import { DESKTOP_QUERY } from '#/shared/ui/breakpoint'

/**
 * A bottom sheet opened from a phone-only control: at desktop width (the
 * control is hidden there) it closes, and focus falls back to `main`. The
 * caller passes it next to its `<BottomSheet>`: the sort sheet (story 2.2)
 * and the category sheet (story 3.4).
 */
export function useCloseAtDesktop(
  open: boolean,
  onOpenChange: (open: boolean) => void,
): void {
  useEffect(() => {
    if (!open || typeof window.matchMedia !== 'function') return
    const desktop = window.matchMedia(DESKTOP_QUERY)
    const onChange = () => {
      if (desktop.matches) onOpenChange(false)
    }
    onChange()
    desktop.addEventListener('change', onChange)
    return () => desktop.removeEventListener('change', onChange)
  }, [open, onOpenChange])
}
