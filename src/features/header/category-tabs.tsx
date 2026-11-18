import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import type { RefObject } from 'react'
import { formatCount } from '#/lib/format'
import { categoryLabel } from '#/lib/category-tabs'
import type { CategoryTab } from '#/lib/category-tabs'
import { ALL } from '#/shared/categories'
import { cn } from '#/shared/ui/cn'
import { Skeleton } from '#/shared/ui/skeleton'
import { useCategoryTabs, useListView } from '#/state/list-view'
import { useHeader } from '#/features/header/header-context'

// Story 3.2, UX-DR18 (DESIGN category-tabs, EXPERIENCE category-tabs): the
// desktop category tabs, a row of pills left of the sort pill. Each pill is
// the name (plain text, AD-10) then a lighter count without archived
// torrents; the selected one is the brand accent (`primary`, DESIGN's
// `accent`) with its count at 75%, the others `surface` with a `border`.
// The row never wraps: it scrolls sideways with no visible scrollbar, and a
// 24px `surface-page` to transparent fade covers the cut right edge while
// more tabs are hidden there. The selected tab scrolls into view when it
// changes (MDN `Element.scrollIntoView`, `inline: 'nearest'`; the
// scroller's `scroll-padding` keeps it clear of the fade). The tabs are
// plain buttons in a group labelled 「分類」, the selected one
// `aria-pressed`: they filter the list in place and have no arrow keys or
// tab panel, so they are not announced as a WAI-ARIA tabs widget. Each
// button is in the Tab order with the global focus ring. Clicking a tab
// switches the category (`selectCategory`); the layout ignores a click on
// the selected one, except on the settings page (story 3.3: back to that
// list).
// Before the tabs are known only the selected category shows (the URL's,
// like the phone's category button): 「全部」 with its count a skeleton
// until maindata answers, another category by name only; after a failed
// first load the count is left out (spec 1.8).
// Shortcut tooltips come in story 3.7.
// https://developer.mozilla.org/en-US/docs/Web/API/Element/scrollIntoView
// https://www.w3.org/WAI/ARIA/apg/patterns/button/

const TAB_CLASS =
  'inline-flex h-[34px] flex-none items-center gap-1.5 rounded-full border px-[13px] whitespace-nowrap'
const SELECTED_CLASS = 'border-primary bg-primary text-primary-foreground'
const UNSELECTED_CLASS = 'bg-surface text-text hover-outline'

export function DesktopCategoryTabs() {
  const tabs = useCategoryTabs()
  const { view, selectCategory } = useListView()
  const selected = view.category
  const scrollerRef = useRef<HTMLDivElement>(null)
  const selectedRef = useRef<HTMLButtonElement>(null)
  const fade = useCutRight(scrollerRef, tabs)
  const loaded = tabs !== undefined

  // The selected tab into view on change (a reload far right too).
  useEffect(() => {
    if (!loaded) return
    selectedRef.current?.scrollIntoView({
      block: 'nearest',
      inline: 'nearest',
    })
  }, [selected, loaded])

  return (
    <div className="relative min-w-0 flex-1">
      <div
        ref={scrollerRef}
        role="group"
        aria-label="分類"
        // 4px around the pills leaves room for the focus ring (2px offset,
        // 2px outline) inside the scroller, which clips both axes.
        className="flex scroll-pe-6 gap-1.5 overflow-x-auto overscroll-x-contain p-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        {tabs === undefined ? (
          <LoadingTab category={selected} />
        ) : (
          tabs.map((tab) => (
            <Tab
              key={tab.key}
              tab={tab}
              selected={tab.key === selected}
              buttonRef={tab.key === selected ? selectedRef : undefined}
              onSelect={selectCategory}
            />
          ))
        )}
      </div>
      {fade && (
        <div
          aria-hidden="true"
          data-testid="category-tabs-fade"
          className="pointer-events-none absolute inset-y-0 right-0 w-6 bg-linear-to-l from-surface-page to-transparent"
        />
      )}
    </div>
  )
}

function Tab({
  tab,
  selected,
  buttonRef,
  onSelect,
}: {
  tab: CategoryTab
  selected: boolean
  buttonRef: RefObject<HTMLButtonElement | null> | undefined
  onSelect: (category: string) => void
}) {
  return (
    <button
      ref={buttonRef}
      type="button"
      aria-pressed={selected}
      data-category={tab.key === ALL ? undefined : tab.key}
      onClick={() => onSelect(tab.key)}
      className={cn(TAB_CLASS, selected ? SELECTED_CLASS : UNSELECTED_CLASS)}
    >
      <span>{tab.label}</span>
      <span
        className={cn(
          'tabular-nums',
          selected ? 'opacity-75' : 'text-text-muted',
        )}
      >
        {formatCount(tab.count)}
      </span>
    </button>
  )
}

/**
 * The selected category alone before the tabs are known (maindata or the
 * settings have not answered): 「全部」 with its count once maindata
 * answered, a skeleton (`aria-busy`) while loading, left out once the
 * first load failed; another category by name only.
 */
function LoadingTab({ category }: { category: string }) {
  const { allCount: all, loading } = useHeader().model
  const allCount = category === ALL ? all : null
  const busy = allCount === null && loading
  return (
    <button
      type="button"
      aria-pressed="true"
      aria-busy={busy || undefined}
      className={cn(TAB_CLASS, SELECTED_CLASS)}
    >
      <span>{categoryLabel(category)}</span>
      {allCount !== null ? (
        <span className="tabular-nums opacity-75">{formatCount(allCount)}</span>
      ) : (
        busy && <Skeleton className="h-2.5 w-5 rounded-[5px]" />
      )}
    </button>
  )
}

/**
 * More tabs are hidden past the right edge: the scroller is wider inside
 * than out and not scrolled to its end. Re-checked on scroll, on resize
 * and when the tabs change.
 */
function useCutRight(
  scrollerRef: RefObject<HTMLElement | null>,
  tabs: unknown,
): boolean {
  const [cut, setCut] = useState(false)
  useLayoutEffect(() => {
    const scroller = scrollerRef.current
    if (!scroller) return
    const check = () => {
      const hidden =
        scroller.scrollWidth - scroller.clientWidth - scroller.scrollLeft
      setCut(hidden > 1)
    }
    check()
    scroller.addEventListener('scroll', check, { passive: true })
    const observer =
      typeof ResizeObserver === 'function' ? new ResizeObserver(check) : null
    observer?.observe(scroller)
    return () => {
      scroller.removeEventListener('scroll', check)
      observer?.disconnect()
    }
  }, [scrollerRef, tabs])
  return cut
}
