import { useLayoutEffect, useRef } from 'react'
import { TriangleAlert, WifiOff } from 'lucide-react'
import { cn } from '#/shared/ui/cn'

// DESIGN alert-bar (mockups S01-offline-desktop, S02-offline-phone): one
// connection problem plus one button. Presentational only: the text and the
// action come from the caller (`barFor` in src/lib/connection-alert.ts).
// Phone first; `lg:` is desktop.
//
// Only the stable problem text is the live region. The ticking 「最後更新 N
// 前」 detail and the button sit outside it, so a screen reader announces the
// problem once instead of on every tick.

export interface AlertBarProps {
  /** The problem; announced when it appears or changes. */
  text: string
  /** Shown after the text (「，最後更新 3 分前」), never announced. */
  detail?: string | null
  /** `offline` is the mockup's icon for an unreachable home or qBittorrent. */
  icon: 'offline' | 'warning'
  actionLabel: string
  onAction: () => void
  /** The action is running: `aria-busy` on the button. */
  busy?: boolean
  /**
   * Where focus goes when the bar disappears while its button has focus
   * (otherwise it would fall to `body`).
   */
  restoreFocusTo?: () => HTMLElement | null
  className?: string
}

export function AlertBar({
  text,
  detail,
  icon,
  actionLabel,
  onAction,
  busy = false,
  restoreFocusTo,
  className,
}: AlertBarProps) {
  const Icon = icon === 'offline' ? WifiOff : TriangleAlert
  const buttonRef = useRef<HTMLButtonElement>(null)
  const focusedRef = useRef(false)
  const restoreRef = useRef(restoreFocusTo)

  useLayoutEffect(() => {
    restoreRef.current = restoreFocusTo
  })

  useLayoutEffect(
    () => () => {
      if (!focusedRef.current) return
      const active = document.activeElement
      if (active && active !== document.body && active !== buttonRef.current)
        return
      restoreRef.current?.()?.focus()
    },
    [],
  )

  return (
    <div
      className={cn(
        'flex flex-none items-center gap-2.5 rounded-card border border-status-stalled bg-surface py-1.5 pr-1.5 pl-3 lg:pl-3.5',
        className,
      )}
    >
      <Icon
        className="size-[18px] flex-none text-status-stalled"
        strokeWidth={2.2}
        aria-hidden="true"
      />
      <span className="min-w-0 flex-1 text-[12px] leading-[1.4] text-text lg:text-[13px]">
        <span role="alert">{text}</span>
        {detail && <span aria-hidden="true">，{detail}</span>}
      </span>
      <button
        ref={buttonRef}
        type="button"
        onClick={onAction}
        onFocus={() => (focusedRef.current = true)}
        onBlur={() => (focusedRef.current = false)}
        aria-busy={busy || undefined}
        className="h-11 flex-none rounded-full border bg-surface px-3.5 font-semibold text-text hover-outline lg:h-8"
      >
        {actionLabel}
      </button>
    </div>
  )
}
