import { useEffect, useRef, useState } from 'react'
import { ChevronDown, List } from 'lucide-react'
import {
  MORE_SORT_GROUPS,
  TOP_SORT_FIELDS,
  dirArrow,
  isUnderMore,
} from '#/shared/sort-fields'
import type { SortFieldDef, SortFieldId } from '#/shared/sort-fields'
import { cn } from '#/shared/ui/cn'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '#/shared/ui/dropdown-menu'
import { getMain } from '#/shared/ui/main-scroll'
import { useListView } from '#/state/list-view'
import {
  directionWords,
  pickSort,
  sortPillModel,
} from '#/features/header/sort-model'

// UX-DR20, UX-DR22 (mockup S03-sort-menu-desktop): the desktop sort pill
// and its menu. The pill: the 「列表」 capsule, the bold 「排序：做種時間 ↓」
// and a chevron; the arrow is not a button of its own. The menu: 260px,
// at most 70vh with its own scroll; the top five with 1 to 5 (text only,
// the keys come in Epic 3), a separator and 「更多」, which opens the other
// 46 in the same menu under group headers (no submenu). It opens already
// expanded and scrolled to the current sort when that sort is under 更多.
// 「狀態」 shows but stays disabled until the board (Story 2.3). The phone
// pill stays disabled until Story 2.2.

export function DesktopSortMenu() {
  const { view, setView } = useListView()
  const [open, setOpen] = useState(false)
  const [expanded, setExpanded] = useState(false)
  const selectedRef = useRef<HTMLDivElement>(null)
  const pill = sortPillModel(view)
  const words = directionWords(view)

  const onOpenChange = (next: boolean) => {
    if (next) setExpanded(isUnderMore(view.sort))
    setOpen(next)
  }

  // After the menu is placed, bring the current sort into view.
  useEffect(() => {
    if (!open) return
    const frame = requestAnimationFrame(() => {
      selectedRef.current?.scrollIntoView({ block: 'nearest' })
    })
    return () => cancelAnimationFrame(frame)
  }, [open])

  const onPick = (id: SortFieldId, event: Event) => {
    const { view: next, keepOpen } = pickSort(view, id)
    if (keepOpen) event.preventDefault()
    // Any sort change, a flip too, goes back to the top of the list.
    const main = getMain()
    if (main) main.scrollTop = 0
    setView(next)
  }

  const item = (field: SortFieldDef) => {
    const id = field.id as SortFieldId
    const selected = id === view.sort
    return (
      <DropdownMenuRadioItem
        key={id}
        value={id}
        // Read as 「做種時間，久的在前」: no arrow, no shortcut digit.
        aria-label={
          selected && words ? `${field.label}，${words}` : field.label
        }
        ref={selected ? selectedRef : undefined}
        disabled={id === 'state'}
        onSelect={(event) => onPick(id, event)}
      >
        <span className="min-w-0 flex-1 truncate">
          {field.label}
          {selected && words && (
            <span className="text-text-muted">
              <span aria-hidden="true">{'\u3000'}</span>
              {words}
              <span aria-hidden="true">{` ${dirArrow(view.dir)}`}</span>
            </span>
          )}
        </span>
        {field.top !== undefined && (
          <span
            aria-hidden="true"
            className="flex-none text-text-muted tabular-nums"
          >
            {field.top}
          </span>
        )}
      </DropdownMenuRadioItem>
    )
  }

  return (
    <DropdownMenu open={open} onOpenChange={onOpenChange}>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          aria-label={pill.ariaLabel}
          title={pill.title}
          className="inline-flex h-10 flex-none items-center gap-2 rounded-full border bg-surface pr-2.5 pl-1.5 whitespace-nowrap hover-outline data-[state=open]:border-text-faint"
        >
          <span className="inline-flex items-center gap-[5px] rounded-full bg-surface-muted px-2 py-[3px] text-[12px] font-semibold">
            <List size={16} strokeWidth={2.2} aria-hidden="true" />
            列表
          </span>
          <b className="font-bold">{pill.text}</b>
          <ChevronDown size={16} strokeWidth={2.2} aria-hidden="true" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" aria-label="排序" className="w-[260px]">
        <DropdownMenuRadioGroup value={view.sort}>
          {TOP_SORT_FIELDS.map(item)}
          <DropdownMenuSeparator />
          <DropdownMenuItem
            aria-expanded={expanded}
            onSelect={(event) => {
              event.preventDefault()
              setExpanded((value) => !value)
            }}
          >
            <span className="size-4 flex-none" />
            <span className="flex-1">更多</span>
            <ChevronDown
              size={16}
              strokeWidth={2.2}
              aria-hidden="true"
              className={cn('flex-none', expanded && 'rotate-180')}
            />
          </DropdownMenuItem>
          {expanded &&
            MORE_SORT_GROUPS.map((group) => (
              <DropdownMenuGroup key={group.group}>
                <DropdownMenuLabel>{group.label}</DropdownMenuLabel>
                {group.fields.map(item)}
              </DropdownMenuGroup>
            ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

/** Disabled until Story 2.2; shows the current sort. */
export function PhoneSortPill() {
  const { view } = useListView()
  const pill = sortPillModel(view)
  return (
    <button
      type="button"
      disabled
      aria-haspopup="dialog"
      aria-label={pill.ariaLabel}
      className="inline-flex h-11 flex-none items-center gap-2 rounded-full border bg-surface pr-2.5 pl-1.5 whitespace-nowrap hover-outline"
    >
      <span className="inline-flex items-center rounded-full bg-surface-muted px-2 py-1">
        <List size={16} strokeWidth={2.2} aria-hidden="true" />
      </span>
      <b className="font-bold">{pill.shortText}</b>
      <ChevronDown size={16} strokeWidth={2.2} aria-hidden="true" />
    </button>
  )
}
