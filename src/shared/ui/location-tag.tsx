import { cn } from '#/shared/ui/cn'

// The location tag (folder icon and `locationLabel`, the last two path
// segments) of a list row, a board card and the detail's save-path block.
// Shared because features never import each other; each caller adds its
// own box (border, height, type) through `className`.

export function LocationTag({
  label,
  className,
}: {
  label: string
  className?: string
}) {
  return (
    <span className={cn('inline-flex min-w-0 items-center gap-1', className)}>
      <svg
        width="12"
        height="12"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.4"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
        className="flex-none"
      >
        <path d="M3 7h6l2 2h10v10H3z" />
      </svg>
      <span className="min-w-0 truncate">{label}</span>
    </span>
  )
}
