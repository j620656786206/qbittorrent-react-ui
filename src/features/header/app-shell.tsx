import { ChevronDown, Keyboard, Plus, Settings } from 'lucide-react'
import { useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { categoryLabel } from '#/lib/category-tabs'
import { formatCount } from '#/lib/format'
import { ALL } from '#/shared/categories'
import { AlertBar } from '#/shared/ui/alert-bar'
import { cn } from '#/shared/ui/cn'
import { MAIN_ID, getMain } from '#/shared/ui/main-scroll'
import { Skeleton } from '#/shared/ui/skeleton'
import { useCategoryTabs, useListView } from '#/state/list-view'
import { PhoneCategorySheet } from '#/features/header/category-sheet'
import { DesktopCategoryTabs } from '#/features/header/category-tabs'
import { HeaderProvider, useHeader } from '#/features/header/header-context'
import { IconButton } from '#/features/header/icon-button'
import {
  DesktopSearch,
  PhoneSearchHeader,
  SearchStatus,
} from '#/features/header/search-box'
import { DesktopSortMenu } from '#/features/header/sort-menu'
import { rememberedHintLine } from '#/features/header/sort-model'
import { PhoneSortPill } from '#/features/header/sort-sheet'
import { DesktopSpeed, PhoneLine } from '#/features/header/speed-area'

// The app shell for every logged-in page (FR-4; mockups S01-list-mode-
// desktop, S01-offline-desktop, S01-loading-desktop, S02-list-mode-phone,
// S02-offline-phone, S02-loading-phone; values in spec 1.7 Design Notes).
// The top area (header, speed line or bar, filter row) never scrolls; `main`
// is the only scroll container. Desktop from `lg` (1024px), phone below;
// both are rendered and the other one is `display: none`.
//
// The desktop sort pill opens the sort menu (story 2.1, sort-menu.tsx); the
// phone one opens the sort sheet (story 2.2, sort-sheet.tsx). Story 3.2:
// the desktop category tabs (category-tabs.tsx) fill the row left of the
// sort pill, which stays at the right and never shrinks.
// Story 3.3: the desktop 設定 button opens `/settings`; there it stays
// focusable with `aria-current="page"`. Story 3.4: the phone's category
// button opens the category sheet (category-sheet.tsx), the phone's way to
// change category and reach 設定; after a category switch that applied a
// remembered sort, a muted line under the third row names it (the desktop
// pill's 「（這個分類記住的）」 instead), in the flow so it pushes the
// content down. Story 3.5: the magnifier opens the search box
// (search-box.tsx): on desktop it turns in place into the 240px pill, on
// the phone the field covers the first row. Epic 1 placeholders (新增,
// shortcuts) carry the native `disabled`: 50% and not-allowed from the
// base rule, no hover, not focusable, and no `title` (their shortcuts do
// not exist yet).
//
// The header model is computed once per tick in HeaderProvider; the layout
// and the page (`children`) keep their identity, so only the small leaves
// that read the context (speeds, bar, count, `main`'s dim) re-render.

export function AppShell({ children }: { children: ReactNode }) {
  return (
    <HeaderProvider>
      <ShellLayout>{children}</ShellLayout>
    </HeaderProvider>
  )
}

/** The layout; its live parts read HeaderContext. */
export function ShellLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex h-dvh flex-col bg-background text-text">
      <div className="mx-auto flex min-h-0 w-full max-w-[1296px] flex-1 flex-col gap-3.5 px-4 py-[18px] lg:px-7 lg:py-[22px]">
        <header className="hidden flex-none flex-wrap items-center gap-3 lg:flex">
          <h1 className="text-page-title">種子</h1>
          <DesktopSpeed />
          <div className="flex-1" />
          <DesktopSearch />
          <button
            type="button"
            disabled
            className="inline-flex h-9 flex-none items-center gap-1.5 rounded-full bg-primary pr-4 pl-3 font-bold text-primary-foreground hover-solid"
          >
            <Plus size={18} strokeWidth={2.4} aria-hidden="true" />
            新增
          </button>
          <IconButton label="快捷鍵">
            <Keyboard size={20} strokeWidth={2} aria-hidden="true" />
          </IconButton>
          <SettingsButton />
        </header>
        <DesktopBar />

        <div className="flex flex-none flex-col gap-1.5 lg:hidden">
          <PhoneSearchHeader
            add={
              <button
                type="button"
                disabled
                aria-label="新增種子"
                className="inline-flex size-11 flex-none items-center justify-center rounded-full bg-primary text-primary-foreground hover-solid"
              >
                <Plus size={20} strokeWidth={2.4} aria-hidden="true" />
              </button>
            }
          />
          <PhoneLine />
        </div>

        <div className="hidden flex-none items-center gap-2 lg:flex">
          <DesktopCategoryTabs />
          <DesktopSortMenu />
        </div>

        <div
          data-testid="phone-third-row"
          className="flex flex-none flex-col lg:hidden"
        >
          <div className="flex items-center justify-between gap-2">
            <PhoneCategoryButton />
            <PhoneSortPill />
          </div>
          <PhoneRememberedHint />
        </div>

        <ContentDim>{children}</ContentDim>
        <SearchStatus />
      </div>
    </div>
  )
}

/** Story 3.3: the desktop header's 設定 button opens the settings page. */
function SettingsButton() {
  const { openSettings, settingsOpen } = useListView()
  return (
    <IconButton label="設定" onClick={openSettings} current={settingsOpen}>
      <Settings size={20} strokeWidth={2} aria-hidden="true" />
    </IconButton>
  )
}

// The count is a skeleton while loading and left out once the first load
// failed (spec 1.8 option A).
/**
 * The phone category button (story 3.4): 「<name> <count> ▾」, opens the
 * category sheet. It names the category on screen (story 3.2), so a
 * `?category=` filter is never silent. The count comes from the tabs (no
 * archived torrents); before they are known, 「全部」 shows the header's
 * count and a category a skeleton while loading.
 */
export function PhoneCategoryButton() {
  const { category } = useListView().view
  const tabs = useCategoryTabs()
  const { allCount, loading } = useHeader().model
  const [open, setOpen] = useState(false)
  const buttonRef = useRef<HTMLButtonElement>(null)
  const label = categoryLabel(category)
  const tabCount = tabs?.find((tab) => tab.key === category)?.count
  const count =
    tabCount ?? (tabs === undefined && category === ALL ? allCount : null)
  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label={`分類：${label}`}
        onClick={() => setOpen(true)}
        className="inline-flex h-11 max-w-[60%] min-w-0 flex-none items-center gap-1.5 rounded-full border bg-surface pr-2.5 pl-3.5 whitespace-nowrap hover-outline"
      >
        <b className="min-w-0 truncate font-semibold">{label}</b>
        {count !== null ? (
          <span className="text-text-muted tabular-nums">
            {formatCount(count)}
          </span>
        ) : (
          tabs === undefined &&
          loading && <Skeleton className="h-2.5 w-[22px] rounded-[5px]" />
        )}
        <ChevronDown
          size={16}
          strokeWidth={2.2}
          aria-hidden="true"
          className="flex-none"
        />
      </button>
      <PhoneCategorySheet
        open={open}
        onOpenChange={setOpen}
        returnFocus={() => buttonRef.current}
      />
    </>
  )
}

/**
 * Story 3.4 (UX-DR21): the phone's 「排序換成這個分類記住的：<sort>」, under
 * the same condition as the desktop pill's hint (`rememberedHint`), not on
 * the settings page. A polite live region that is always there, empty
 * (no height, no gap) without the hint, so the text appearing is announced:
 * focus goes back to the category button, whose name says only the category.
 */
function PhoneRememberedHint() {
  const { view, rememberedHint, settingsOpen } = useListView()
  const text = rememberedHint && !settingsOpen ? rememberedHintLine(view) : ''
  return (
    <p
      role="status"
      className={cn('m-0 text-meta text-text-muted', text && 'mt-1.5')}
    >
      {text}
    </p>
  )
}

function DesktopBar() {
  const { model, retrying, onBarAction } = useHeader()
  const { bar } = model
  if (!bar) return null
  return (
    <AlertBar
      text={bar.text}
      detail={bar.detail}
      icon={bar.icon}
      actionLabel={bar.actionLabel}
      onAction={() => onBarAction(bar.action)}
      busy={retrying}
      restoreFocusTo={getMain}
      className="hidden lg:flex"
    />
  )
}

/**
 * `main`, the scroll container (the list's virtualizer scrolls it). Only an
 * unreachable home or qBittorrent dims it; it stays scrollable and clickable
 * (no pointer-events change). It is the focus target when the bar
 * disappears under a focused 「重試」. Re-renders every second; `children`
 * keeps its identity, so the page is skipped. Phone: 4px of padding inside
 * a box 4px wider on each side, so its content box stays the page column;
 * the padding only gives room to a child that opts into the list's 12px
 * edges (DESIGN page-phone-list) without being clipped by the scroller.
 */
function ContentDim({ children }: { children: ReactNode }) {
  const { dim } = useHeader().model
  return (
    <main
      id={MAIN_ID}
      tabIndex={-1}
      className={cn(
        'min-h-0 flex-1 overflow-y-auto focus:outline-none max-lg:-mx-1 max-lg:px-1',
        dim && 'opacity-50',
      )}
    >
      {children}
    </main>
  )
}
