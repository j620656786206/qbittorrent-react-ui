import {
  ChevronDown,
  Keyboard,
  List,
  Plus,
  Search,
  Settings,
} from 'lucide-react'
import type { ReactNode } from 'react'
import { formatCount } from '#/lib/format'
import { AlertBar } from '#/shared/ui/alert-bar'
import { cn } from '#/shared/ui/cn'
import { MAIN_ID, getMain } from '#/shared/ui/main-scroll'
import { Skeleton } from '#/shared/ui/skeleton'
import { HeaderProvider, useHeader } from '#/features/header/header-context'
import { DesktopSpeed, PhoneLine } from '#/features/header/speed-area'

// The app shell for every logged-in page (FR-4; mockups S01-list-mode-
// desktop, S01-offline-desktop, S01-loading-desktop, S02-list-mode-phone,
// S02-offline-phone, S02-loading-phone; values in spec 1.7 Design Notes).
// The top area (header, speed line or bar, filter row) never scrolls; `main`
// is the only scroll container. Desktop from `lg` (1024px), phone below;
// both are rendered and the other one is `display: none`.
//
// Epic 1 placeholders (search, 新增, shortcuts, settings, phone category,
// sort) carry the native `disabled`: 50% and not-allowed from the base rule,
// no hover, not focusable, and no `title` (their shortcuts do not exist yet).
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
          <IconButton label="搜尋">
            <Search size={20} strokeWidth={2.2} aria-hidden="true" />
          </IconButton>
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
          <IconButton label="設定">
            <Settings size={20} strokeWidth={2} aria-hidden="true" />
          </IconButton>
        </header>
        <DesktopBar />

        <div className="flex flex-none flex-col gap-1.5 lg:hidden">
          <header className="flex items-center justify-between gap-2">
            <h1 className="text-page-title">種子</h1>
            <div className="flex gap-2">
              <IconButton label="搜尋" phone>
                <Search size={20} strokeWidth={2.2} aria-hidden="true" />
              </IconButton>
              <button
                type="button"
                disabled
                aria-label="新增種子"
                className="inline-flex size-11 flex-none items-center justify-center rounded-full bg-primary text-primary-foreground hover-solid"
              >
                <Plus size={20} strokeWidth={2.4} aria-hidden="true" />
              </button>
            </div>
          </header>
          <PhoneLine />
        </div>

        <div className="hidden flex-none items-center gap-2 lg:flex">
          <div className="min-w-0 flex-1">
            <div
              role="tablist"
              aria-label="分類"
              className="flex gap-1.5 p-[3px]"
            >
              {/* Selected and inert until the category story; not disabled,
                  50% would misstate the selection. */}
              <AllTab />
            </div>
          </div>
          <button
            type="button"
            disabled
            aria-haspopup="menu"
            aria-label={SORT_LABEL}
            className="inline-flex h-10 flex-none items-center gap-2 rounded-full border bg-surface pr-2.5 pl-1.5 whitespace-nowrap hover-outline"
          >
            <span className="inline-flex items-center gap-[5px] rounded-full bg-surface-muted px-2 py-[3px] text-[12px] font-semibold">
              <List size={16} strokeWidth={2.2} aria-hidden="true" />
              列表
            </span>
            <b className="font-bold">排序：加入時間 ↓</b>
            <ChevronDown size={16} strokeWidth={2.2} aria-hidden="true" />
          </button>
        </div>

        <div className="flex flex-none items-center justify-between gap-2 lg:hidden">
          <button
            type="button"
            disabled
            aria-haspopup="dialog"
            aria-label="分類：全部"
            className="inline-flex h-11 flex-none items-center gap-1.5 rounded-full border bg-surface pr-2.5 pl-3.5 whitespace-nowrap hover-outline"
          >
            <b className="font-semibold">全部</b>
            <PhoneCount />
            <ChevronDown size={16} strokeWidth={2.2} aria-hidden="true" />
          </button>
          <button
            type="button"
            disabled
            aria-haspopup="dialog"
            aria-label={SORT_LABEL}
            className="inline-flex h-11 flex-none items-center gap-2 rounded-full border bg-surface pr-2.5 pl-1.5 whitespace-nowrap hover-outline"
          >
            <span className="inline-flex items-center rounded-full bg-surface-muted px-2 py-1">
              <List size={16} strokeWidth={2.2} aria-hidden="true" />
            </span>
            <b className="font-bold">加入時間 ↓</b>
            <ChevronDown size={16} strokeWidth={2.2} aria-hidden="true" />
          </button>
        </div>

        <ContentDim>{children}</ContentDim>
      </div>
    </div>
  )
}

/** EXPERIENCE sort-pill: the full words for screen readers (UX-DR77). */
const SORT_LABEL = '排序：加入時間，新的在前，列表'

function IconButton({
  label,
  phone = false,
  children,
}: {
  label: string
  phone?: boolean
  children: ReactNode
}) {
  return (
    <button
      type="button"
      disabled
      aria-label={label}
      className={cn(
        'inline-flex flex-none items-center justify-center rounded-full border bg-surface text-text hover-outline',
        phone ? 'size-11' : 'size-9',
      )}
    >
      {children}
    </button>
  )
}

// The count is a skeleton while loading and left out once the first load
// failed (spec 1.8 option A).
function DesktopCount() {
  const { allCount: count, loading } = useHeader().model
  if (count === null)
    return loading ? <Skeleton className="h-2.5 w-5 rounded-[5px]" /> : null
  return <span className="tabular-nums opacity-75">{formatCount(count)}</span>
}

function PhoneCount() {
  const { allCount: count, loading } = useHeader().model
  if (count === null)
    return loading ? (
      <Skeleton className="h-2.5 w-[22px] rounded-[5px]" />
    ) : null
  return (
    <span className="text-text-muted tabular-nums">{formatCount(count)}</span>
  )
}

/** The selected 「全部」 tab, `aria-busy` until the count is known. */
function AllTab() {
  const { allCount, loading: modelLoading } = useHeader().model
  const loading = allCount === null && modelLoading
  return (
    <button
      type="button"
      role="tab"
      aria-selected="true"
      aria-busy={loading || undefined}
      className="inline-flex h-[34px] flex-none items-center gap-1.5 rounded-full border border-primary bg-primary px-[13px] whitespace-nowrap text-primary-foreground"
    >
      <span>全部</span>
      <DesktopCount />
    </button>
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
