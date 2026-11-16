import { useEffect, useId, useRef, useState } from 'react'
import { Check, ChevronDown, List } from 'lucide-react'
import {
  MORE_SORT_GROUPS,
  TOP_SORT_FIELDS,
  dirArrow,
  isUnderMore,
} from '#/shared/sort-fields'
import type { SortFieldDef, SortFieldId } from '#/shared/sort-fields'
import { BottomSheet } from '#/shared/ui/bottom-sheet'
import { cn } from '#/shared/ui/cn'
import { getMain } from '#/shared/ui/main-scroll'
import { useListView } from '#/state/list-view'
import {
  directionWords,
  pickSort,
  sortPillModel,
} from '#/features/header/sort-model'

// Story 2.2, UX-DR21, DESIGN sort-pill and sort-menu (phone part), mockup
// S03-sort-sheet-phone. Below 1024px the sort pill is 44px tall and shows
// only the view icon, the sort name, the arrow and ▾ (「▦ 做種時間 ↓ ▾」);
// its `aria-label` spells out the words like the desktop pill. It opens the
// brand bottom sheet in `fit` mode titled 「排序」: 52px rows, no shortcut
// digits, 「更多」 expands in the sheet, the selected row has a check plus
// the direction words and arrow. The rules are the desktop menu's
// (sort-model.ts): the selected row flips the direction and the sheet stays;
// another row takes its default direction and closes it; both scroll the
// list to the top. 「狀態」 shows but stays disabled until the board. Rows
// are plain buttons in lists (the selected one has `aria-current`), not a
// menu: in a dialog, Tab and the screen reader's own list navigation work
// without the menu keyboard model.

/** Tailwind `lg`, where the desktop header and its sort menu take over. */
export const DESKTOP_QUERY = '(min-width: 1024px)'

const LIST_CLASS = 'm-0 flex list-none flex-col p-0'

const ROW_CLASS =
  'flex h-[52px] w-full flex-none items-center gap-2.5 rounded-row px-3 text-left hover-row'

export function PhoneSortPill() {
  const { view } = useListView()
  const [open, setOpen] = useState(false)
  const [expanded, setExpanded] = useState(false)
  const pillRef = useRef<HTMLButtonElement>(null)
  const pill = sortPillModel(view)

  return (
    <>
      <button
        ref={pillRef}
        type="button"
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label={pill.ariaLabel}
        onClick={() => {
          setExpanded(isUnderMore(view.sort))
          setOpen(true)
        }}
        className="inline-flex h-11 flex-none items-center gap-2 rounded-full border bg-surface pr-2.5 pl-1.5 whitespace-nowrap hover-outline"
      >
        <span className="inline-flex items-center rounded-full bg-surface-muted px-2 py-1">
          <List size={16} strokeWidth={2.2} aria-hidden="true" />
        </span>
        <b className="font-bold">{pill.shortText}</b>
        <ChevronDown size={16} strokeWidth={2.2} aria-hidden="true" />
      </button>
      <PhoneSortSheet
        open={open}
        onOpenChange={setOpen}
        expanded={expanded}
        onExpandedChange={setExpanded}
        returnFocus={() => pillRef.current}
      />
    </>
  )
}

interface PhoneSortSheetProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** 「更多」 is open. */
  expanded: boolean
  onExpandedChange: (expanded: boolean) => void
  returnFocus: () => HTMLElement | null
}

export function PhoneSortSheet({
  open,
  onOpenChange,
  expanded,
  onExpandedChange,
  returnFocus,
}: PhoneSortSheetProps) {
  const { view, setView } = useListView()
  const selectedRef = useRef<HTMLButtonElement>(null)
  const groupIdPrefix = useId()
  const words = directionWords(view)

  // The sheet is the phone's container: at desktop width (the pill is
  // hidden there) it closes, and focus falls back to `main`.
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

  const onPick = (id: SortFieldId) => {
    const picked = pickSort(view, id)
    if (picked === null) return
    // Any sort change, a flip too, goes back to the top of the list.
    const main = getMain()
    if (main) main.scrollTop = 0
    setView(picked.view)
    if (!picked.keepOpen) onOpenChange(false)
  }

  /** Puts the current sort in the middle when it is under 更多. */
  const onOpened = (content: HTMLElement) => {
    const item = selectedRef.current
    if (!item || !isUnderMore(view.sort)) return
    const offset =
      item.getBoundingClientRect().top - content.getBoundingClientRect().top
    content.scrollTop += offset - (content.clientHeight - item.offsetHeight) / 2
  }

  const item = (field: SortFieldDef) => {
    const id = field.id as SortFieldId
    const selected = id === view.sort
    return (
      <li key={id} className="flex flex-col">
        <button
          ref={selected ? selectedRef : undefined}
          type="button"
          data-sort-id={id}
          aria-current={selected || undefined}
          // Read as 「做種時間，久的在前」, without the arrow.
          aria-label={
            selected && words ? `${field.label}，${words}` : field.label
          }
          disabled={id === 'state'}
          onClick={() => onPick(id)}
          className={ROW_CLASS}
        >
          <span className="flex size-4 flex-none items-center justify-center">
            {selected && (
              <Check size={16} strokeWidth={2.6} aria-hidden="true" />
            )}
          </span>
          <span className="min-w-0 flex-1 truncate">
            {field.label}
            {selected && words && (
              <span className="text-text-muted">
                <span aria-hidden="true">{'　'}</span>
                {words}
                <span aria-hidden="true">{` ${dirArrow(view.dir)}`}</span>
              </span>
            )}
          </span>
        </button>
      </li>
    )
  }

  return (
    <BottomSheet
      open={open}
      onOpenChange={onOpenChange}
      title="排序"
      mode="fit"
      initialFocus={() => {
        const selected = selectedRef.current
        return selected && !selected.disabled ? selected : null
      }}
      returnFocus={returnFocus}
      onOpened={onOpened}
    >
      <div className="flex flex-col px-2 pb-6">
        <ul className={LIST_CLASS}>{TOP_SORT_FIELDS.map(item)}</ul>
        <div
          aria-hidden="true"
          className="mx-3 my-1 h-px flex-none bg-border"
        />
        <button
          type="button"
          aria-expanded={expanded}
          onClick={() => onExpandedChange(!expanded)}
          className={ROW_CLASS}
        >
          <span className="size-4 flex-none" />
          <span className="flex-1">更多</span>
          <ChevronDown
            size={16}
            strokeWidth={2.2}
            aria-hidden="true"
            className={cn('flex-none', expanded && 'rotate-180')}
          />
        </button>
        {expanded &&
          MORE_SORT_GROUPS.map((group) => (
            <div key={group.group} className="flex flex-col">
              <p
                id={`${groupIdPrefix}-${group.group}`}
                className="m-0 pt-3 pr-3 pb-1 pl-[38px] text-tag text-text-muted"
              >
                {group.label}
              </p>
              <ul
                aria-labelledby={`${groupIdPrefix}-${group.group}`}
                className={LIST_CLASS}
              >
                {group.fields.map(item)}
              </ul>
            </div>
          ))}
      </div>
    </BottomSheet>
  )
}
