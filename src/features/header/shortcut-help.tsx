import { Keyboard } from 'lucide-react'
import {
  Fragment,
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
} from 'react'
import { useIsDesktop } from '#/shared/ui/breakpoint'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '#/shared/ui/dialog'
import {
  focusedElement,
  helpGroups,
  titleWithShortcut,
  useEscapeLayer,
  useShortcutAction,
} from '#/state/shortcuts'
import type { Shortcut } from '#/state/shortcuts'
import { IconButton } from '#/features/header/icon-button'

// Story 3.7 (DESIGN shortcut-help, EXPERIENCE Interaction Primitives
// 快捷鍵): the desktop header's 快捷鍵 button and its help window, a shadcn
// `Dialog` titled 「快捷鍵」 that lists the shortcut registry by group (most
// used first), each row its keys in `<kbd>` then what it does. The button
// or `?` (desktop only, an action from the registry) opens it; `Esc` or ✕
// close it and focus goes back where it was (the button after a click).
// Radix handles `Esc` inside the window itself; the window still joins the
// registry as a `dialog` layer for as long as its content is mounted (its
// exit animation too), so no other shortcut runs meanwhile and `Esc`
// closes it before the search box and the detail. The layer is registered
// here, not in src/shared/ui/dialog.tsx: `shared` may not import
// `src/state`. Narrowing below 1024px closes it. `?` does not open it over
// the open sort menu (the registry refuses).
// https://www.radix-ui.com/primitives/docs/components/dialog
// https://ui.shadcn.com/docs/components/dialog

export function ShortcutHelp() {
  const desktop = useIsDesktop()
  const [open, setOpen] = useState(false)
  const buttonRef = useRef<HTMLButtonElement>(null)
  /** Where focus goes when it closes (`null`: what had focus on open). */
  const returnRef = useRef<HTMLElement | null>(null)
  const shown = open && desktop

  const show = useCallback((from: HTMLElement | null) => {
    returnRef.current = from
    setOpen(true)
    return true
  }, [])
  const close = useCallback(() => setOpen(false), [])

  useEffect(() => {
    if (!desktop) setOpen(false)
  }, [desktop])

  useShortcutAction('openHelp', desktop ? () => show(focusedElement()) : null)

  return (
    <>
      <IconButton
        label="快捷鍵"
        title={titleWithShortcut('快捷鍵', 'help')}
        onClick={() => show(buttonRef.current)}
        buttonRef={buttonRef}
      >
        <Keyboard size={20} strokeWidth={2} aria-hidden="true" />
      </IconButton>
      <Dialog
        open={shown}
        onOpenChange={(next) => {
          if (!next) close()
        }}
      >
        <DialogContent
          aria-describedby={undefined}
          returnFocus={() => returnRef.current}
          className="max-h-[85vh] overflow-y-auto"
        >
          <HelpLayer close={close} />
          <DialogHeader>
            <DialogTitle>快捷鍵</DialogTitle>
          </DialogHeader>
          <ShortcutList />
        </DialogContent>
      </Dialog>
    </>
  )
}

/** The registry's `dialog` layer, mounted exactly with the content. */
function HelpLayer({ close }: { close: () => void }) {
  useEscapeLayer(true, close, 'dialog')
  return null
}

/**
 * Every group of the registry, in its order. The keys column has one fixed
 * width (the widest, 「S 再按 1 到 5」, fits), so the descriptions line up
 * across groups.
 */
function ShortcutList() {
  const idPrefix = useId()
  return (
    <div className="flex flex-col gap-4">
      {helpGroups().map(({ group, rows }, index) => (
        <section
          key={group}
          aria-labelledby={`${idPrefix}-${index}`}
          data-shortcut-group={group}
        >
          <h3
            id={`${idPrefix}-${index}`}
            className="m-0 mb-1.5 text-meta font-semibold text-text-muted"
          >
            {group}
          </h3>
          <dl className="m-0 grid grid-cols-[136px_1fr] items-baseline gap-x-4 gap-y-2 text-body">
            {rows.map((row) => (
              <Fragment key={row.id}>
                <dt className="flex items-center gap-1 whitespace-nowrap">
                  <ShortcutKeys shortcut={row} />
                </dt>
                <dd className="m-0">
                  {row.description}
                  {row.note !== undefined && (
                    <span className="block text-meta text-text-muted">
                      {row.note}
                    </span>
                  )}
                </dd>
              </Fragment>
            ))}
          </dl>
        </section>
      ))}
    </div>
  )
}

const KBD_CLASS =
  'inline-flex h-6 min-w-6 items-center justify-center rounded-md border bg-surface-muted px-1.5 font-mono text-meta text-text'

function ShortcutKeys({ shortcut }: { shortcut: Shortcut }) {
  return shortcut.display.map((part, index) =>
    'key' in part ? (
      <kbd key={index} className={KBD_CLASS}>
        {part.key}
      </kbd>
    ) : (
      <span key={index} className="text-meta text-text-muted">
        {part.word}
      </span>
    ),
  )
}
