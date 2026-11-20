import { useId, useLayoutEffect, useRef } from 'react'
import type { ClipboardEvent, KeyboardEvent, RefObject } from 'react'
import { ChevronDown, CircleAlert, File, Magnet, X } from 'lucide-react'
import { cn } from '#/shared/ui/cn'
import {
  NO_CATEGORY_TEXT,
  PASTE_TEXT_DESKTOP,
  PASTE_TEXT_PHONE,
  READING_TEXT,
  SAVE_PATH_DEFAULT,
  SAVE_PATH_PREFIX,
  listLabel,
  rowView,
} from '#/features/add/add-model'
import type { JudgedItem, SavePathLine } from '#/features/add/add-model'

// Story 4.6 (DESIGN add-torrent, text-input; mockups S06-add-empty-desktop,
// S06-add-many-desktop, S06-add-phone): the add screen's parts, the same on
// the desktop dialog and the phone sheet, sized by `phone`.
// - The paste area: a textarea laid over the dashed box (or the paste strip
//   under the list), invisible until something is typed, so the box itself
//   reads as the target. A paste (Cmd or Ctrl+V, the phone's long-press
//   paste) is read from the `paste` event, never from the clipboard API:
//   files in it are read like picked files, else its text is judged. Typed
//   text confirmed with Enter counts as a paste (Shift+Enter is a new line).
//   The typed draft belongs to the screen (`draft`), shared by the box and
//   the strip, so it survives the box turning into the list; while it is
//   not empty a pasted text goes into it at the caret and waits for Enter.
//   「選檔案」 opens the screen's hidden file input. Focus on the textarea
//   rings the whole box.
// - The rows: icon, name (plain text, one line with 「…」; a link without a
//   name in mono), the problem label with 「拿掉」 or 「打開」, and ✕.
//   Desktop puts the label after the name; the phone on the line below.
// - The category menu: a native `<select>` drawn as the 36px pill (44px
//   on the phone), so the keyboard and the phone's own picker come free;
//   then 「會存到 …」, read only.
// Docs (AD-11): https://developer.mozilla.org/en-US/docs/Web/API/Element/paste_event

const ICON = { size: 16, strokeWidth: 2, 'aria-hidden': true } as const

/** The mockups' "paste into the tray" mark. */
function TrayIcon({ size }: { size: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={size > 20 ? 1.8 : 2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className="block flex-none text-text-muted"
    >
      <path d="M12 3v12" />
      <path d="m8 11 4 4 4-4" />
      <path d="M8 5H4a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-4" />
    </svg>
  )
}

/** The archived torrent's mark (DESIGN status icons), gray. */
function ArchivedIcon() {
  return (
    <svg
      width={16}
      height={16}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2.2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className="block flex-none"
    >
      <rect x="3" y="4" width="18" height="4.5" rx="1" />
      <path d="M5 8.5V19a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V8.5" />
      <path d="M10 12.5h4" />
    </svg>
  )
}

export interface PasteInput {
  onText: (text: string) => void
  onFiles: (files: ReadonlyArray<File>) => void
  onPick: () => void
  textareaRef: RefObject<HTMLTextAreaElement | null>
  /** What is typed and not confirmed yet; the screen's, reset on open. */
  draft: string
  setDraft: (draft: string) => void
  phone: boolean
  /** Files still being read: the text reads 「讀取中…」. */
  reading: boolean
}

const FOCUS_RING =
  'has-[textarea:focus-visible]:outline-2 has-[textarea:focus-visible]:outline-offset-2 has-[textarea:focus-visible]:outline-ring has-[textarea:focus-visible]:outline-solid'

function PasteTextarea({
  input,
  label,
  className,
}: {
  input: PasteInput
  label: string
  className?: string
}) {
  const { draft, setDraft, onText, onFiles, textareaRef } = input
  /** Where the caret goes once a paste into the draft has rendered. */
  const caretRef = useRef<number | null>(null)
  useLayoutEffect(() => {
    const caret = caretRef.current
    const element = textareaRef.current
    if (caret === null || element === null) return
    caretRef.current = null
    element.setSelectionRange(caret, caret)
  }, [draft, textareaRef])

  const onPaste = (event: ClipboardEvent<HTMLTextAreaElement>) => {
    const data = event.clipboardData
    event.preventDefault()
    const files = [...data.files]
    if (files.length > 0) {
      // A copied file also carries its name as text: only the file counts.
      onFiles(files)
      return
    }
    const text = data.getData('text/plain')
    if (draft !== '') {
      // Typing in progress: the text joins it at the caret, judged on Enter.
      const element = event.currentTarget
      const start = element.selectionStart
      const end = element.selectionEnd
      const next = draft.slice(0, start) + text + draft.slice(end)
      if (next === draft) return
      caretRef.current = start + text.length
      setDraft(next)
      return
    }
    if (text.trim() !== '') onText(text)
  }
  const onKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key !== 'Enter' || event.shiftKey) return
    if (event.nativeEvent.isComposing || event.keyCode === 229) return
    event.preventDefault()
    if (draft.trim() === '') return
    onText(draft)
    setDraft('')
  }
  return (
    <textarea
      ref={textareaRef}
      aria-label={label}
      data-add-paste=""
      rows={1}
      value={draft}
      onChange={(event) => setDraft(event.target.value)}
      onPaste={onPaste}
      onKeyDown={onKeyDown}
      spellCheck={false}
      autoCapitalize="off"
      autoCorrect="off"
      className={cn(
        'absolute inset-0 m-0 size-full resize-none border-0 bg-transparent p-0 text-text focus:outline-none',
        draft === ''
          ? 'cursor-text opacity-0'
          : 'z-[1] bg-surface-muted px-3 py-2 opacity-100',
        input.phone ? 'text-[16px]' : 'text-body',
        className,
      )}
    />
  )
}

function PickButton({
  onPick,
  phone,
  small,
}: {
  onPick: () => void
  phone: boolean
  small: boolean
}) {
  return (
    <span className="relative z-[2] flex-none">
      <button
        type="button"
        onClick={onPick}
        className={cn(
          'flex-none rounded-full border bg-surface font-semibold whitespace-nowrap text-text hover-outline',
          phone
            ? 'h-11 px-3.5 text-[15px]'
            : small
              ? 'h-7 px-3.5 text-[12px]'
              : 'h-9 px-[18px]',
        )}
      >
        選檔案
      </button>
    </span>
  )
}

/** The empty screen's dashed 200px box. */
export function PasteBox(input: PasteInput) {
  const label = input.phone ? PASTE_TEXT_PHONE : PASTE_TEXT_DESKTOP
  return (
    <div
      data-add-box=""
      className={cn(
        'relative flex h-[200px] flex-none flex-col items-center justify-center gap-3 rounded-card border-[1.5px] border-dashed border-text-faint bg-surface-muted',
        FOCUS_RING,
      )}
    >
      <PasteTextarea input={input} label={label} className="rounded-card" />
      <span
        aria-hidden="true"
        className="pointer-events-none relative flex flex-col items-center gap-2.5 px-4 text-center"
      >
        <TrayIcon size={28} />
        <span className="text-[15px] leading-[1.2] font-semibold text-text">
          {input.reading ? READING_TEXT : label}
        </span>
      </span>
      <PickButton onPick={input.onPick} phone={input.phone} small={false} />
    </div>
  )
}

/** The strip pinned under the list: paste or pick again. */
function PasteStrip(input: PasteInput) {
  const label = input.phone ? PASTE_TEXT_PHONE : PASTE_TEXT_DESKTOP
  return (
    <div
      data-add-strip=""
      className={cn(
        'relative flex flex-none items-center gap-2.5 border-t border-dashed border-t-text-faint bg-surface-muted pl-3',
        // Phone: held at the bottom of the sheet's scroller while the rows
        // scroll under it.
        input.phone
          ? 'sticky bottom-0 z-[3] min-h-[52px] py-1 pr-1'
          : 'min-h-10 py-1 pr-1.5',
        FOCUS_RING,
      )}
    >
      <PasteTextarea input={input} label={label} />
      <span
        aria-hidden="true"
        className={cn(
          'pointer-events-none relative flex min-w-0 flex-1 items-center gap-2.5 leading-[1.4] text-text-muted',
          input.phone ? 'text-[13px]' : 'text-[12px]',
        )}
      >
        <TrayIcon size={16} />
        <span className="min-w-0 truncate">
          {input.reading ? READING_TEXT : label}
        </span>
      </span>
      <PickButton onPick={input.onPick} phone={input.phone} small />
    </div>
  )
}

const TEXT_BUTTON_CLASS =
  'flex-none font-semibold whitespace-nowrap text-text underline underline-offset-[3px]'

function Row({
  row,
  phone,
  onRemove,
  onOpen,
}: {
  row: JudgedItem
  phone: boolean
  onRemove: (id: number, from: HTMLElement) => void
  onOpen: (hash: string) => void
}) {
  const view = rowView(row)
  const { id, source } = row.entry
  const problem = view.status !== 'addable'
  const remove = (event: { currentTarget: HTMLElement }) =>
    onRemove(id, event.currentTarget)

  const label = view.label !== null && (
    <span
      data-add-label={view.status}
      className={cn(
        'inline-flex min-w-0 items-center gap-1.5 text-[12px] leading-[1.4] whitespace-nowrap',
        view.status === 'unreadable'
          ? 'font-semibold text-status-error'
          : 'text-text-muted',
      )}
    >
      {view.status === 'unreadable' ? (
        <CircleAlert
          size={16}
          strokeWidth={2.4}
          aria-hidden="true"
          className="flex-none"
        />
      ) : (
        <ArchivedIcon />
      )}
      {view.label}
    </span>
  )
  const textButton =
    view.status === 'unreadable' ? (
      // The ✕ is the row's one 「拿掉」 for the keyboard and screen readers;
      // this is the same action as a bigger mouse and touch target.
      <button
        type="button"
        tabIndex={-1}
        aria-hidden="true"
        onClick={remove}
        className={cn(
          TEXT_BUTTON_CLASS,
          phone ? 'h-11 px-2.5 text-[13px]' : 'h-7 px-1.5 text-[12px]',
        )}
      >
        拿掉
      </button>
    ) : view.existingHash !== null ? (
      <button
        type="button"
        aria-label={`打開 ${view.name}`}
        onClick={() => {
          if (view.existingHash !== null) onOpen(view.existingHash)
        }}
        className={cn(
          TEXT_BUTTON_CLASS,
          phone ? 'h-11 px-2.5 text-[13px]' : 'h-7 px-1.5 text-[12px]',
        )}
      >
        打開
      </button>
    ) : null

  const name = (
    <span
      title={view.name}
      className={cn(
        'block min-w-0 truncate',
        view.mono ? 'font-mono text-[12px] leading-[1.4]' : 'text-row-name',
        problem ? 'text-text-muted' : 'text-text',
      )}
    >
      {view.name}
    </span>
  )

  return (
    <li
      data-add-row={view.status}
      className={cn(
        'flex items-center not-first:border-t',
        phone
          ? 'min-h-12 gap-2 py-0.5 pl-3'
          : 'min-h-10 gap-2.5 py-1 pr-1.5 pl-3',
      )}
    >
      {source.kind === 'link' ? (
        <Magnet
          {...ICON}
          aria-hidden={undefined}
          role="img"
          aria-label="磁力連結"
          className="block flex-none text-text-muted"
        />
      ) : (
        <File
          {...ICON}
          aria-hidden={undefined}
          role="img"
          aria-label=".torrent 檔"
          className="block flex-none text-text-muted"
        />
      )}
      {phone ? (
        <span className="flex min-w-0 flex-1 flex-col">
          {name}
          {label && <span className="mt-0.5 flex min-w-0">{label}</span>}
        </span>
      ) : (
        <span className="min-w-0 flex-1">{name}</span>
      )}
      {phone
        ? textButton
        : label && (
            <span className="flex flex-none items-center gap-0.5">
              {label}
              {textButton}
            </span>
          )}
      <button
        type="button"
        data-add-remove=""
        aria-label={`拿掉 ${view.name}`}
        title="拿掉"
        onClick={remove}
        className={cn(
          'inline-flex flex-none items-center justify-center rounded-full text-text-muted hover-row',
          phone ? 'size-11' : 'size-7',
        )}
      >
        <X size={14} strokeWidth={2.4} aria-hidden="true" />
      </button>
    </li>
  )
}

/**
 * The filled list: a bordered 16px frame, the paste strip pinned at its
 * bottom. Desktop: the list scrolls by itself (the dialog never outgrows
 * the screen). Phone: the frame is the sheet's whole scrolling content
 * (the category and the button sit in the pinned footer), so the sheet's
 * own rule applies: a drag in the list scrolls it, and moves the sheet
 * only from the top. `overflow-clip` keeps the corners without making the
 * frame a scroller, so the strip sticks to the sheet's bottom edge.
 */
export function AddList({
  rows,
  paste,
  onRemove,
  onOpen,
}: {
  rows: ReadonlyArray<JudgedItem>
  paste: PasteInput
  onRemove: (id: number, from: HTMLElement) => void
  onOpen: (hash: string) => void
}) {
  const { phone } = paste
  return (
    <div
      data-add-frame=""
      className={cn(
        'flex flex-col rounded-card border bg-surface',
        phone
          ? 'flex-none overflow-clip'
          : 'min-h-[120px] flex-[1_1_auto] overflow-hidden',
      )}
    >
      <ul
        aria-label={listLabel(rows.length)}
        data-add-list=""
        className={cn(
          'm-0 list-none p-0',
          !phone && 'min-h-0 flex-1 overflow-y-auto [scrollbar-width:thin]',
        )}
      >
        {rows.map((row) => (
          <Row
            key={row.entry.id}
            row={row}
            phone={phone}
            onRemove={onRemove}
            onOpen={onOpen}
          />
        ))}
      </ul>
      <PasteStrip {...paste} />
    </div>
  )
}

/** 「分類」, the menu and 「會存到 …」. */
export function CategoryField({
  value,
  options,
  onChange,
  path,
  phone,
}: {
  value: string
  options: ReadonlyArray<{ value: string; label: string }>
  onChange: (value: string) => void
  path: SavePathLine
  phone: boolean
}) {
  const id = useId()
  const pathId = `${id}-path`
  return (
    <div className="flex flex-none flex-col gap-1.5">
      <label
        htmlFor={id}
        className="text-[12px] leading-[1.4] font-semibold text-text"
      >
        分類
      </label>
      <div className={cn('relative', phone ? 'w-full' : 'w-[240px]')}>
        <select
          id={id}
          value={value}
          aria-describedby={pathId}
          onChange={(event) => onChange(event.target.value)}
          className={cn(
            'w-full appearance-none rounded-full border bg-surface pr-10 pl-4 hover-outline',
            phone ? 'h-11 text-[16px]' : 'h-9 text-[13px]',
            value === '' ? 'text-text-muted' : 'text-text',
          )}
        >
          <option value="" disabled>
            {NO_CATEGORY_TEXT}
          </option>
          {options.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
        <ChevronDown
          size={16}
          strokeWidth={2.2}
          aria-hidden="true"
          className="pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 text-text"
        />
      </div>
      <p
        id={pathId}
        data-add-path=""
        className="m-0 text-[12px] leading-[1.4] text-text-muted"
      >
        {path.kind === 'default' && SAVE_PATH_DEFAULT}
        {path.kind === 'path' && (
          <>
            {SAVE_PATH_PREFIX}
            <span className="font-mono text-text [overflow-wrap:anywhere]">
              {path.path}
            </span>
          </>
        )}
      </p>
    </div>
  )
}

export function FooterNote({
  text,
  className,
}: {
  text: string
  className?: string
}) {
  return (
    <p
      aria-live="polite"
      data-add-skipped=""
      className={cn('m-0 text-[12px] leading-[1.4] text-text-muted', className)}
    >
      {text}
    </p>
  )
}

export function IconClose({
  onClick,
  phone,
}: {
  onClick: () => void
  phone: boolean
}) {
  return (
    <button
      type="button"
      aria-label="關閉"
      onClick={onClick}
      className={cn(
        'inline-flex flex-none items-center justify-center rounded-full border bg-surface text-text hover-outline',
        phone ? 'size-11' : 'size-9',
      )}
    >
      <X size={16} strokeWidth={2.4} aria-hidden="true" />
    </button>
  )
}
