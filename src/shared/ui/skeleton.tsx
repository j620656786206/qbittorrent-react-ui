import { cn } from '#/shared/ui/cn'

// shadcn Skeleton (https://ui.shadcn.com/docs/components/skeleton) with the
// brand look: `surface-muted` (shadcn's `accent`) and the mockup `pulse`
// (`animate-skeleton`, off for reduced motion) instead of the stock pulse.
// Decorative only: the busy state is announced by the container.

export function Skeleton({ className }: { className?: string }) {
  return (
    <span
      data-slot="skeleton"
      aria-hidden="true"
      className={cn(
        'block flex-none animate-skeleton bg-surface-muted',
        className,
      )}
    />
  )
}
