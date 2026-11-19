import * as React from 'react'
import { cn } from '#/shared/ui/cn'
import { XIcon } from 'lucide-react'
import { Dialog as DialogPrimitive } from 'radix-ui'

import { Button } from '#/shared/ui/button.tsx'
import { useModalSession } from '#/shared/ui/sheet-session'
import { isInToastRegion } from '#/shared/ui/toaster'

// shadcn Dialog (https://ui.shadcn.com/docs/components/dialog). Story 3.7:
// non-modal Radix underneath, like dropdown-menu.tsx: a modal Radix dialog
// locks scrolling through react-remove-scroll, which injects a `<style>`
// element the CSP blocks (AD-10, no 'unsafe-inline'). The modal behaviour
// comes from the bottom sheet's session instead (sheet-session.ts: scroll
// locked through the CSSOM, the rest of the page `inert`, Tab wrapping
// inside, focus back to the opener), and the scrim is drawn here, since
// Radix draws its overlay only for a modal dialog. A press on the scrim
// closes it (Radix: an outside press dismisses a non-modal dialog); Esc is
// Radix's. The session runs from the content's mount until the dialog
// closes (the root's open state, which Radix keeps private, is passed
// down here), so the exit animation already has the page back; focus goes
// back through the session only (`returnFocus`, else what had focus when
// it opened), never through Radix's close autofocus as well. The toast
// region stays usable over it (story 2.6): a press or focus there does not
// dismiss it.
// Story 4.3: the open motion is real now (`animate-pop` on the content, 0.2 s
// from 95% plus a fade, and `animate-fade` on the scrim, both off under
// reduced motion, src/styles.css; the old `animate-in` classes had no
// definition). There is no exit motion, so Radix unmounts at once.
// `closeOnOutsidePress={false}` keeps it open on a press outside (the
// delete confirmation, like an AlertDialog); `showCloseButton={false}`
// drops the ✕.
// Radix docs: https://www.radix-ui.com/primitives/docs/components/dialog

/** The root's open state, for the content's session. */
const DialogOpenContext = React.createContext(false)

function Dialog({
  open: openProp,
  defaultOpen = false,
  onOpenChange,
  ...props
}: Omit<React.ComponentProps<typeof DialogPrimitive.Root>, 'modal'>) {
  const [ownOpen, setOwnOpen] = React.useState(defaultOpen)
  const open = openProp ?? ownOpen
  return (
    <DialogOpenContext value={open}>
      <DialogPrimitive.Root
        data-slot="dialog"
        modal={false}
        open={open}
        onOpenChange={(next) => {
          if (openProp === undefined) setOwnOpen(next)
          onOpenChange?.(next)
        }}
        {...props}
      />
    </DialogOpenContext>
  )
}

function DialogTrigger({
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Trigger>) {
  return <DialogPrimitive.Trigger data-slot="dialog-trigger" {...props} />
}

function DialogPortal({
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Portal>) {
  return <DialogPrimitive.Portal data-slot="dialog-portal" {...props} />
}

function DialogClose({
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Close>) {
  return <DialogPrimitive.Close data-slot="dialog-close" {...props} />
}

/** DialogContent's own scrim (Radix draws its overlay only when modal). */
const SCRIM_CLASS =
  'fixed inset-0 z-50 bg-scrim-dialog data-[state=open]:animate-fade'

/**
 * Rendered inside the content, so it mounts only with it (Radix Presence);
 * a passive effect, so the content's and the scrim's refs are attached.
 * The session ends when the dialog closes, or the content unmounts first.
 */
function ModalSessionWhileOpen({
  begin,
  end,
}: {
  begin: () => void
  end: (restoreFocus: boolean) => void
}) {
  const open = React.useContext(DialogOpenContext)
  React.useEffect(() => {
    if (!open) return
    begin()
    return () => end(true)
  }, [open, begin, end])
  return null
}

function DialogContent({
  className,
  children,
  showCloseButton = true,
  closeOnOutsidePress = true,
  returnFocus,
  onKeyDown,
  onCloseAutoFocus,
  onInteractOutside,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Content> & {
  showCloseButton?: boolean
  /** `false`: a press outside (the scrim included) leaves it open. */
  closeOnOutsidePress?: boolean
  /** Focused on close; by default what had focus when it opened. */
  returnFocus?: () => HTMLElement | null
}) {
  const open = React.useContext(DialogOpenContext)
  const scrimRef = React.useRef<HTMLDivElement>(null)
  const contentRef = React.useRef<HTMLDivElement>(null)
  const session = useModalSession({
    sheetRef: contentRef,
    scrimRef,
    returnFocus,
  })
  return (
    <DialogPortal data-slot="dialog-portal">
      <div
        ref={scrimRef}
        aria-hidden="true"
        data-slot="dialog-overlay"
        // Its fade in and out, like Radix's own overlay.
        data-state={open ? 'open' : 'closed'}
        className={SCRIM_CLASS}
      />
      <DialogPrimitive.Content
        ref={contentRef}
        data-slot="dialog-content"
        aria-modal="true"
        onKeyDown={(event) => {
          onKeyDown?.(event)
          session.onKeyDown(event)
        }}
        onInteractOutside={(event) => {
          onInteractOutside?.(event)
          const target = event.target
          if (
            !closeOnOutsidePress ||
            (target instanceof Node && isInToastRegion(target))
          ) {
            event.preventDefault()
          }
        }}
        onCloseAutoFocus={(event) => {
          onCloseAutoFocus?.(event)
          // The session already gave focus back.
          event.preventDefault()
        }}
        className={cn(
          'fixed top-[50%] left-[50%] z-50 grid w-full max-w-[calc(100%-2rem)] translate-x-[-50%] translate-y-[-50%] gap-4 rounded-panel border bg-surface p-6 shadow-float data-[state=open]:animate-pop sm:max-w-lg',
          className,
        )}
        {...props}
      >
        <ModalSessionWhileOpen begin={session.begin} end={session.end} />
        {children}
        {showCloseButton && (
          <DialogPrimitive.Close
            data-slot="dialog-close"
            className="absolute top-4 right-4 rounded-xs opacity-70 transition-opacity hover:opacity-100 disabled:pointer-events-none data-[state=open]:bg-accent data-[state=open]:text-muted-foreground [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4"
          >
            <XIcon />
            <span className="sr-only">關閉</span>
          </DialogPrimitive.Close>
        )}
      </DialogPrimitive.Content>
    </DialogPortal>
  )
}

function DialogHeader({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot="dialog-header"
      className={cn('flex flex-col gap-2 text-center sm:text-left', className)}
      {...props}
    />
  )
}

function DialogFooter({
  className,
  showCloseButton = false,
  children,
  ...props
}: React.ComponentProps<'div'> & {
  showCloseButton?: boolean
}) {
  return (
    <div
      data-slot="dialog-footer"
      className={cn(
        'flex flex-col-reverse gap-2 sm:flex-row sm:justify-end',
        className,
      )}
      {...props}
    >
      {children}
      {showCloseButton && (
        <DialogPrimitive.Close asChild>
          <Button variant="outline">關閉</Button>
        </DialogPrimitive.Close>
      )}
    </div>
  )
}

function DialogTitle({
  className,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Title>) {
  return (
    <DialogPrimitive.Title
      data-slot="dialog-title"
      className={cn('text-lg leading-none font-semibold', className)}
      {...props}
    />
  )
}

function DialogDescription({
  className,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Description>) {
  return (
    <DialogPrimitive.Description
      data-slot="dialog-description"
      className={cn('text-sm text-muted-foreground', className)}
      {...props}
    />
  )
}

export {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogPortal,
  DialogTitle,
  DialogTrigger,
}
