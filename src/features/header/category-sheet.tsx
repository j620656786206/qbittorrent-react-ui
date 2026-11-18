import { useRef } from 'react'
import { Check, Settings } from 'lucide-react'
import { categoryLabel } from '#/lib/category-tabs'
import { formatCount } from '#/lib/format'
import { ALL } from '#/shared/categories'
import { BottomSheet } from '#/shared/ui/bottom-sheet'
import { useCloseAtDesktop } from '#/shared/ui/close-at-desktop'
import { cn } from '#/shared/ui/cn'
import { Skeleton } from '#/shared/ui/skeleton'
import { useCategoryTabs, useListView } from '#/state/list-view'
import { useSheetLayer } from '#/state/sheet-layer'
import { useHeader } from '#/features/header/header-context'

// Story 3.4, UX-DR19 (DESIGN category-sheet, EXPERIENCE category-sheet),
// mockup S03-category-sheet-phone: the phone's category list. The brand
// bottom sheet in `fit` mode titled 「分類」 (story 2.2's patterns: focus
// on the current row when it opens, back to the category button when it
// closes, Esc and the width check close it). Rows are 52px: the name left
// (plain text, AD-10), the count right (muted, tabular, archived torrents
// left out). 「全部」 first, then the categories from the same list and
// order as the desktop tabs (CategoryTabsContext: no row for a category
// without torrents, the emptied selected one stays while selected). The
// current row is bold with a check at the far left; every row keeps the
// check's space so the names line up. Under a hairline, 「設定」 with a gear.
// Rows are plain buttons in a list, the current one `aria-current`, like
// the sort sheet: no menu keyboard model inside a dialog.
// A row is a desktop tab click (`selectCategory`): the sheet closes first,
// then the layout switches (URL, remembered sort, top, entrance); the
// current row only closes it (on the settings page it goes back to that
// list, story 3.3). 「設定」 closes it and opens the settings page through
// the layout (`openSettings`: the list's search and `fromList` ride along).
// On the settings page 「設定」 is the current row (bold, checked, focused,
// its gear moved next to the name) and no category row is marked.
// Before the tabs are known the sheet lists the URL's category alone, with
// a short busy skeleton while the first maindata or settings answer is
// pending; once the first load failed, the name alone.
// https://www.w3.org/WAI/ARIA/apg/patterns/dialog-modal/

const ROW_CLASS =
  'flex h-[52px] w-full flex-none items-center gap-2.5 rounded-row px-3 text-left hover-row'

/** One row: the category, its label and its count (`null`: not known). */
interface SheetRow {
  key: string
  label: string
  count: number | null
}

interface PhoneCategorySheetProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  returnFocus: () => HTMLElement | null
}

export function PhoneCategorySheet({
  open,
  onOpenChange,
  returnFocus,
}: PhoneCategorySheetProps) {
  const tabs = useCategoryTabs()
  const { view, viewReady, selectCategory, openSettings, settingsOpen } =
    useListView()
  const { allCount, loading, speeds } = useHeader().model
  const currentRef = useRef<HTMLButtonElement>(null)
  const current = view.category
  useSheetLayer(open, () => onOpenChange(false))
  useCloseAtDesktop(open, onOpenChange)

  const rows: ReadonlyArray<SheetRow> = tabs ?? [
    {
      key: current,
      label: categoryLabel(current),
      count: current === ALL ? allCount : null,
    },
  ]
  // No data and not loading: the first maindata load failed.
  const firstLoadFailed = !loading && speeds === null
  const busy = tabs === undefined && !firstLoadFailed && (loading || !viewReady)

  const onPick = (key: string) => {
    onOpenChange(false)
    selectCategory(key)
  }

  const onSettings = () => {
    onOpenChange(false)
    openSettings()
  }

  return (
    <BottomSheet
      open={open}
      onOpenChange={onOpenChange}
      title="分類"
      mode="fit"
      initialFocus={() => currentRef.current}
      returnFocus={returnFocus}
    >
      <div className="flex flex-col px-2 pb-6">
        <ul className="m-0 flex list-none flex-col p-0">
          {rows.map((row) => {
            const selected = !settingsOpen && row.key === current
            return (
              <li key={row.key} className="flex flex-col">
                <button
                  ref={selected ? currentRef : undefined}
                  type="button"
                  aria-current={selected || undefined}
                  aria-label={
                    row.count === null
                      ? row.label
                      : `${row.label}，${formatCount(row.count)} 個`
                  }
                  onClick={() => onPick(row.key)}
                  className={ROW_CLASS}
                >
                  <span className="flex size-4 flex-none items-center justify-center">
                    {selected && (
                      <Check size={16} strokeWidth={2.6} aria-hidden="true" />
                    )}
                  </span>
                  <span
                    className={cn(
                      'min-w-0 flex-1 truncate',
                      selected && 'font-bold',
                    )}
                  >
                    {row.label}
                  </span>
                  {row.count !== null && (
                    <span className="flex-none text-text-muted tabular-nums">
                      {formatCount(row.count)}
                    </span>
                  )}
                </button>
              </li>
            )
          })}
        </ul>
        {busy && (
          <div
            aria-busy="true"
            aria-label="分類載入中"
            role="status"
            data-testid="category-sheet-loading"
            className="flex flex-col"
          >
            {[0, 1].map((index) => (
              <div
                key={index}
                className="flex h-[52px] items-center gap-2.5 px-3"
              >
                <span className="size-4 flex-none" />
                <Skeleton className="h-2.5 w-24 rounded-[5px]" />
                <span className="flex-1" />
                <Skeleton className="h-2.5 w-6 rounded-[5px]" />
              </div>
            ))}
          </div>
        )}
        <div
          aria-hidden="true"
          className="mx-3 my-1 h-px flex-none bg-border"
        />
        <button
          ref={settingsOpen ? currentRef : undefined}
          type="button"
          aria-current={settingsOpen ? 'page' : undefined}
          onClick={onSettings}
          className={ROW_CLASS}
        >
          <span className="flex size-4 flex-none items-center justify-center">
            {settingsOpen ? (
              <Check size={16} strokeWidth={2.6} aria-hidden="true" />
            ) : (
              <Settings size={16} strokeWidth={2} aria-hidden="true" />
            )}
          </span>
          {settingsOpen && (
            <Settings
              size={16}
              strokeWidth={2}
              aria-hidden="true"
              className="flex-none"
            />
          )}
          <span className={cn('flex-1', settingsOpen && 'font-bold')}>
            設定
          </span>
        </button>
      </div>
    </BottomSheet>
  )
}
