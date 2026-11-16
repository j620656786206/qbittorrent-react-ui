import { List } from 'lucide-react'
import type { ViewKind } from '#/features/header/sort-model'

// The sort pill's view icon (mockups S01-list-desktop, S02-list-phone):
// 「看板」 is three top-aligned bars of falling height, drawn like a lucide
// icon (24 x 24, stroke 2.2); 「列表」 stays lucide `List`. Decorative: the
// pill's `aria-label` says the view in words.

export function ViewIcon({ kind }: { kind: ViewKind }) {
  if (kind === 'list') {
    return <List size={16} strokeWidth={2.2} aria-hidden="true" />
  }
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      data-icon="board"
    >
      <rect x="3" y="4" width="5" height="16" rx="1.5" />
      <rect x="10" y="4" width="5" height="11" rx="1.5" />
      <rect x="17" y="4" width="4" height="7" rx="1.5" />
    </svg>
  )
}
