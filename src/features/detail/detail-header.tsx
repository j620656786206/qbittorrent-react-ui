import { useLayoutEffect, useRef, useState } from 'react'
import type { ReactNode, Ref } from 'react'
import { ChevronLeft, ChevronRight, X } from 'lucide-react'
import type { DetailPosition } from '#/lib/detail-position'
import type { SlimTorrent } from '#/shared/maindata'
import { cn } from '#/shared/ui/cn'
import { useShortcutAction } from '#/state/shortcuts'
import { positionText } from '#/features/detail/detail-model'
import { MoreMenu } from '#/features/detail/more-menu'

// DESIGN detail-header (mockups S01-list-mode-desktop, SD-board-detail-desktop,
// S05-overview-phone, S05-name-expanded-phone): the name, ‹ 「第 N 個／共 M
// 個」 ›, ⋯ (story 2.6: the 暫停／繼續 menu, more-menu.tsx) and, on the board panel and the
// phone, ✕; a `border` line below. Three layouts:
// - `row`, desktop list mode (panel about 660px): one row, the name takes
//   the rest, then the nav group, then ⋯.
// - `stacked`, the board's narrow panel: row 1 name, ⋯, ✕; row 2 ‹ N ›,
//   left-aligned right under the name.
// - `phone`: like `stacked`, 44px buttons; tapping the name expands it to
//   several lines (the header grows and pushes the content down), tapping
//   again or ‹ › collapses it (EXPERIENCE detail-header).
// Desktop names stay one line with 「…」 and the full name as `title`.
// Story 3.7: with `arrowKeys` (the desktop board panel) `↑` `↓` (the
// shortcut registry) do what ‹ › do, inside the same column; at its end
// nothing moves and the key is still taken. List mode's arrows are the
// list's own (they move focus to the row).

export type DetailHeaderLayout = 'row' | 'stacked' | 'phone'

const ICON_BUTTON_CLASS =
  'inline-flex flex-none items-center justify-center rounded-full border bg-surface text-text hover-outline'

function IconButton({
  label,
  phone,
  disabled,
  onClick,
  buttonRef,
  children,
}: {
  label: string
  phone: boolean
  disabled?: boolean
  onClick?: () => void
  buttonRef?: Ref<HTMLButtonElement>
  children: ReactNode
}) {
  return (
    <button
      ref={buttonRef}
      type="button"
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
      className={cn(ICON_BUTTON_CLASS, phone ? 'size-11' : 'size-9')}
    >
      {children}
    </button>
  )
}

const ICON = { size: 18, strokeWidth: 2.4, 'aria-hidden': true } as const

export interface DetailHeaderProps {
  layout: DetailHeaderLayout
  /** The viewed torrent; a new one collapses an expanded phone name. */
  torrent: SlimTorrent
  /** Names the dialog on the phone (the sheet's `aria-labelledby`). */
  titleId?: string
  position: DetailPosition
  /** The board's column name before 「第 N 個」; none in list mode. */
  columnName?: string | null
  /** ‹ or ›: show this torrent instead. */
  onNavigate: (hash: string) => void
  /** ✕ (board panel, phone); list mode has none. */
  onClose?: () => void
  /** The ✕ itself (the phone sheet focuses it when it opens). */
  closeRef?: Ref<HTMLButtonElement>
  /** Story 3.7: `↑` `↓` press ‹ › (the desktop board panel). */
  arrowKeys?: boolean
}

export function DetailHeader({
  layout,
  torrent,
  titleId,
  position,
  columnName,
  onNavigate,
  onClose,
  closeRef,
  arrowKeys = false,
}: DetailHeaderProps) {
  const phone = layout === 'phone'
  const { hash, name } = torrent
  // The hash whose name is expanded: switching torrents collapses it.
  const [expandedFor, setExpandedFor] = useState<string | null>(null)
  const expanded = phone && expandedFor === hash

  const prevRef = useRef<HTMLButtonElement>(null)
  const nextRef = useRef<HTMLButtonElement>(null)
  /** The nav button just pressed and where it went, until it gets there. */
  const pressedRef = useRef<{ which: 'prev' | 'next'; to: string } | null>(null)

  const go = (
    target: string | null,
    which: 'prev' | 'next',
    { fromKey = false } = {},
  ) => {
    if (target === null) return
    setExpandedFor(null)
    const button = which === 'prev' ? prevRef.current : nextRef.current
    // A key moves focus only off a nav button it disables, never off a card.
    if (!fromKey || document.activeElement === button) {
      pressedRef.current = { which, to: target }
    }
    onNavigate(target)
  }
  useShortcutAction(
    'prevItem',
    arrowKeys
      ? () => {
          go(position.prev, 'prev', { fromKey: true })
          return true
        }
      : null,
  )
  useShortcutAction(
    'nextItem',
    arrowKeys
      ? () => {
          go(position.next, 'next', { fromKey: true })
          return true
        }
      : null,
  )

  // Reaching the first or last disables the button just pressed, which
  // would drop focus to `body`: move it to the other one.
  useLayoutEffect(() => {
    const pressedInfo = pressedRef.current
    if (pressedInfo === null || pressedInfo.to !== hash) return
    pressedRef.current = null
    const { which } = pressedInfo
    const pressed = which === 'prev' ? prevRef.current : nextRef.current
    const other = which === 'prev' ? nextRef.current : prevRef.current
    if (pressed?.disabled && other && !other.disabled) {
      other.focus({ preventScroll: true })
    }
  })

  const nav = (
    <div className="flex flex-none items-center gap-1.5">
      <IconButton
        label="上一個"
        phone={phone}
        disabled={position.prev === null}
        onClick={() => go(position.prev, 'prev')}
        buttonRef={prevRef}
      >
        <ChevronLeft {...ICON} />
      </IconButton>
      <span className="text-[13px] leading-[1.4] whitespace-nowrap tabular-nums">
        {positionText(position, columnName)}
      </span>
      <IconButton
        label="下一個"
        phone={phone}
        disabled={position.next === null}
        onClick={() => go(position.next, 'next')}
        buttonRef={nextRef}
      >
        <ChevronRight {...ICON} />
      </IconButton>
    </div>
  )

  const more = <MoreMenu torrent={torrent} phone={phone} />

  const close = onClose && (
    <IconButton
      label="關閉"
      phone={phone}
      onClick={onClose}
      buttonRef={closeRef}
    >
      <X {...ICON} />
    </IconButton>
  )

  const nameClass = 'm-0 min-w-0 flex-1 text-detail-name'

  if (layout === 'row') {
    return (
      <div className="flex flex-none items-center gap-2 border-b px-[22px] pt-4 pb-3.5">
        <h2 id={titleId} title={name} className={cn(nameClass, 'truncate')}>
          {name}
        </h2>
        {nav}
        {more}
      </div>
    )
  }

  return (
    <div
      className={cn(
        'flex flex-none flex-col border-b',
        phone ? 'gap-1 px-4 pb-3' : 'gap-1.5 pt-4 pr-[18px] pb-3 pl-[22px]',
      )}
    >
      <div
        className={cn('flex gap-2', expanded ? 'items-start' : 'items-center')}
      >
        {phone ? (
          <h2 className={nameClass}>
            <button
              type="button"
              aria-expanded={expanded}
              aria-label={expanded ? '收起名稱' : '展開完整名稱'}
              onClick={() => setExpandedFor(expanded ? null : hash)}
              className="block min-h-11 w-full text-left"
            >
              {/* The name alone names the sheet, not the button's label. */}
              <span
                id={titleId}
                className={cn(
                  'block',
                  expanded
                    ? 'py-3 whitespace-normal [overflow-wrap:anywhere]'
                    : 'truncate',
                )}
              >
                {name}
              </span>
            </button>
          </h2>
        ) : (
          <h2 id={titleId} title={name} className={cn(nameClass, 'truncate')}>
            {name}
          </h2>
        )}
        {more}
        {close}
      </div>
      {nav}
    </div>
  )
}
