import { cn } from '#/shared/ui/cn'

// The location tag (folder icon and the location's name) of a list row, a
// board card and the detail's save-path block. Shared because features
// never import each other; each caller adds its own box (height, padding,
// radius, type) through `className`, the tag owns its look (DESIGN
// location-tag). Normal: the outline and `text-muted`. Story 5.1, media
// library: light mode the `media-library-tint` background with
// `media-library` text at weight 600 and no border; dark mode only the bold
// purple text and the icon (no background, no border, memlog #126). The
// border stays as a transparent 1px so both looks have the same size.
// Purple means media library and nothing else. Display only. `title` is the
// full name (a long one is cut); screen readers also hear 「，媒體庫」, since
// colour and weight are all a sighted reader gets.
// https://tailwindcss.com/docs/dark-mode

const NORMAL_CLASS = 'border text-text-muted'
const MEDIA_LIBRARY_CLASS =
  'border border-transparent bg-media-library-tint font-semibold text-media-library dark:bg-transparent'

export function LocationTag({
  label,
  mediaLibrary = false,
  className,
}: {
  label: string
  mediaLibrary?: boolean
  className?: string
}) {
  return (
    <span
      title={label}
      data-media-library={mediaLibrary ? '' : undefined}
      className={cn(
        'inline-flex min-w-0 items-center gap-1',
        className,
        mediaLibrary ? MEDIA_LIBRARY_CLASS : NORMAL_CLASS,
      )}
    >
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
      {mediaLibrary && <span className="sr-only">，媒體庫</span>}
    </span>
  )
}
