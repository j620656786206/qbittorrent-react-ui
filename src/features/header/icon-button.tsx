import type { ReactNode, Ref } from 'react'
import { cn } from '#/shared/ui/cn'

/**
 * A header icon button (DESIGN header-icon-button: 36px round, `surface`
 * with a `border`; 44px on the phone). Without `onClick` it is an inert
 * Epic 1 placeholder with the native `disabled`.
 */
export function IconButton({
  label,
  phone = false,
  onClick,
  current = false,
  buttonRef,
  children,
}: {
  label: string
  phone?: boolean
  onClick?: () => void
  /** The page this button opens is on screen. */
  current?: boolean
  buttonRef?: Ref<HTMLButtonElement>
  children: ReactNode
}) {
  return (
    <button
      ref={buttonRef}
      type="button"
      disabled={onClick === undefined}
      onClick={onClick}
      aria-label={label}
      aria-current={current ? 'page' : undefined}
      className={cn(
        'inline-flex flex-none items-center justify-center rounded-full border bg-surface text-text hover-outline',
        phone ? 'size-11' : 'size-9',
      )}
    >
      {children}
    </button>
  )
}
