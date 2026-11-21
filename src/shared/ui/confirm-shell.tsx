import { useEffect, useId, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { BottomSheet } from '#/shared/ui/bottom-sheet'
import { cn } from '#/shared/ui/cn'
import { Dialog, DialogContent, DialogTitle } from '#/shared/ui/dialog'

// Story 4.3 (DESIGN dialog and bottom-sheet, EXPERIENCE 送出中): the one
// confirm container, built once and reused by add (4.6, 4.7) and Epic 5.
// Desktop: the non-modal shadcn `Dialog` from dialog.tsx with its modal
// session (never Radix modal mode or `AlertDialog`: both force modal and
// inject a `<style>` the CSP blocks). The brand look: `surface`, 1px
// `border`, 22px radius, `shadow-float`, 24px padding, 14px between
// sections, 18px/700 title, the footer right-aligned with 36px pills 8px
// apart and the primary rightmost; never taller than the viewport (20px
// from its edges, mockup S07), the body's own list scrolls. No ✕, and a
// press outside does nothing. Phone: the bottom sheet (`fit`, up to 90%)
// with the same body and one full-width 44px primary pinned under it, no
// cancel (✕ or a drag down).
//
// The sending state lives here: the pressed primary reads `sendingLabel`,
// keeps its colour and does nothing when pressed again (`aria-disabled`, so
// focus stays on it; `data-sending` lifts the base rule's 50% dimming,
// while a primary with nothing to send stays dimmed); cancel, ✕, `Esc`, a scrim press and a drag down do
// nothing; after 10 s a `meta` `text-muted` line under the buttons reads
// 「還在等 NAS 回應」. The caller registers its `Esc` layer
// (`useEscapeLayer(..., 'dialog')`; src/shared may not import src/state)
// and passes `sending` from its op's in-flight state. The body describes
// the dialog (`aria-describedby`), so a screen reader hears what goes, and
// the 「還在等」 line sits in a `status` region that is always mounted (a
// region that mounts with its text is often not announced).

/** EXPERIENCE 送出中: the 「還在等」 line shows after this long. */
export const STILL_WAITING_MS = 10_000

export const STILL_WAITING_TEXT = '還在等 NAS 回應'

export interface ConfirmShellProps {
  open: boolean
  /** Desktop dialog (1024px and up) or phone sheet. */
  desktop: boolean
  title: string
  /**
   * Story 5.2: one plain `meta` `text-muted` line under the title (the
   * torrent name of change path), cut with 「…」 (`title` holds it whole).
   * Desktop: 4px under the title; phone: the first line of the body.
   */
  subtitle?: string
  /** The body, between the title and the buttons. */
  children: ReactNode
  /** The primary button's text, and while sending. */
  primaryLabel: string
  sendingLabel: string
  onPrimary: () => void
  /** Nothing to send yet: the primary does nothing (`aria-disabled`). */
  primaryDisabled?: boolean
  /** `delete` for delete, `accent` for add, move and rename. */
  primaryTone?: 'delete' | 'accent'
  /** The desktop cancel. */
  cancelLabel?: string
  /** The phone ✕'s accessible name. */
  closeLabel?: string
  /** A send is in flight: every close path is ignored. */
  sending: boolean
  /** Any close path (cancel, ✕, Esc, a drag down); never while sending. */
  onCancel: () => void
  /** Focused on close; by default what had focus when it opened. */
  returnFocus?: () => HTMLElement | null
  /**
   * Story 5.4: focused on open instead of the default (desktop the cancel,
   * phone the ✕), when it answers an element.
   */
  initialFocus?: () => HTMLElement | null
  role?: 'dialog' | 'alertdialog'
  /** The desktop width, a Tailwind class (`w-[512px]` for delete). */
  desktopWidthClass?: string
}

/** `true` once `sending` has lasted `STILL_WAITING_MS`; reset when it ends. */
export function useStillWaiting(sending: boolean): boolean {
  const [waiting, setWaiting] = useState(false)
  if (!sending && waiting) setWaiting(false)
  useEffect(() => {
    if (!sending) return
    const timer = setTimeout(() => setWaiting(true), STILL_WAITING_MS)
    return () => clearTimeout(timer)
  }, [sending])
  return waiting
}

const TONE_CLASS = {
  delete: 'bg-delete text-delete-foreground',
  accent: 'bg-primary text-primary-foreground',
} as const

const WAITING_CLASS = 'm-0 text-meta text-text-muted'

/** Story 5.4: `target` is inside an element that handles Esc itself. */
function ownsEscape(target: EventTarget | null): boolean {
  return (
    target instanceof Element && target.closest('[data-own-escape]') !== null
  )
}

export function ConfirmShell({
  open,
  desktop,
  title,
  subtitle,
  children,
  primaryLabel,
  sendingLabel,
  onPrimary,
  primaryDisabled = false,
  primaryTone = 'accent',
  cancelLabel = '取消',
  closeLabel = '關閉',
  sending,
  onCancel,
  returnFocus,
  initialFocus,
  role = 'dialog',
  desktopWidthClass = 'w-[512px]',
}: ConfirmShellProps) {
  const waiting = useStillWaiting(sending)
  const bodyId = useId()
  const cancelRef = useRef<HTMLButtonElement>(null)
  const cancel = () => {
    if (!sending) onCancel()
  }
  const press = () => {
    if (!sending && !primaryDisabled) onPrimary()
  }
  const primaryInert = sending || primaryDisabled
  /** Always mounted; the text fills in after 10 s. */
  const waitingLine = (align: string) => (
    <p role="status" className={cn(WAITING_CLASS, align, waiting && 'mt-2')}>
      {waiting ? STILL_WAITING_TEXT : ''}
    </p>
  )
  const primaryText = sending ? sendingLabel : primaryLabel
  const subtitleLine = (extra: string) =>
    subtitle === undefined ? null : (
      <p
        title={subtitle}
        data-slot="confirm-subtitle"
        className={cn(
          'm-0 flex-none truncate text-meta text-text-muted',
          extra,
        )}
      >
        {subtitle}
      </p>
    )

  if (!desktop) {
    return (
      <BottomSheet
        open={open}
        onOpenChange={(next) => {
          if (!next) cancel()
        }}
        title={title}
        role={role}
        closeLabel={closeLabel}
        locked={sending}
        returnFocus={returnFocus}
        initialFocus={initialFocus}
        describedBy={bodyId}
        footer={
          <div className="flex flex-col px-4 pt-2 pb-4">
            <button
              type="button"
              aria-disabled={primaryInert || undefined}
              data-sending={sending || undefined}
              onClick={press}
              className={cn(
                // Wraps at 320 to 360px rather than overflow; never under 44px.
                'min-h-11 w-full rounded-full px-[18px] py-2 text-[15px] leading-[1.3] font-bold tabular-nums data-[sending]:opacity-100',
                TONE_CLASS[primaryTone],
              )}
            >
              {primaryText}
            </button>
            {waitingLine('text-center')}
          </div>
        }
      >
        <div id={bodyId} className="flex flex-col gap-2 px-4 pt-2 pb-1">
          {subtitleLine('-mt-2')}
          {children}
        </div>
      </BottomSheet>
    )
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) cancel()
      }}
    >
      <DialogContent
        role={role}
        aria-describedby={bodyId}
        showCloseButton={false}
        closeOnOutsidePress={false}
        returnFocus={returnFocus}
        onOpenAutoFocus={(event) => {
          // The least destructive button first (APG alertdialog).
          event.preventDefault()
          const first = initialFocus?.() ?? cancelRef.current
          first?.focus({ preventScroll: true })
        }}
        onEscapeKeyDown={(event) => {
          // Story 5.4: an element marked `data-own-escape` (an inline
          // rename) handles Esc itself, and the dialog stays open.
          if (sending || ownsEscape(event.target)) event.preventDefault()
        }}
        className={cn(
          'flex max-h-[calc(100dvh-40px)] max-w-[calc(100%-40px)] flex-col gap-3.5 overflow-hidden p-6 sm:max-w-[calc(100%-40px)]',
          desktopWidthClass,
        )}
      >
        {subtitle === undefined ? (
          <DialogTitle className="m-0 text-[18px] leading-[1.2] font-bold">
            {title}
          </DialogTitle>
        ) : (
          <div className="flex min-w-0 flex-none flex-col gap-1">
            <DialogTitle className="m-0 text-[18px] leading-[1.2] font-bold">
              {title}
            </DialogTitle>
            {subtitleLine('')}
          </div>
        )}
        <div
          id={bodyId}
          className="flex min-h-0 flex-col gap-3 overflow-y-auto"
        >
          {children}
        </div>
        <div className="flex flex-none flex-col">
          <div className="flex justify-end gap-2">
            <button
              ref={cancelRef}
              type="button"
              aria-disabled={sending || undefined}
              onClick={cancel}
              className="h-9 flex-none rounded-full border bg-surface px-[18px] font-semibold whitespace-nowrap text-text hover-outline aria-disabled:cursor-not-allowed aria-disabled:opacity-50"
            >
              {cancelLabel}
            </button>
            <button
              type="button"
              aria-disabled={primaryInert || undefined}
              data-sending={sending || undefined}
              onClick={press}
              className={cn(
                'h-9 min-w-0 rounded-full px-[18px] font-bold whitespace-nowrap tabular-nums data-[sending]:opacity-100',
                TONE_CLASS[primaryTone],
              )}
            >
              {primaryText}
            </button>
          </div>
          {waitingLine('text-right')}
        </div>
      </DialogContent>
    </Dialog>
  )
}
