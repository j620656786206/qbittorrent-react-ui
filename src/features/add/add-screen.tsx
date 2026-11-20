import { useCallback, useEffect, useRef, useState } from 'react'
import type { ChangeEvent } from 'react'
import { BottomSheet } from '#/shared/ui/bottom-sheet'
import { useIsDesktop } from '#/shared/ui/breakpoint'
import { cn } from '#/shared/ui/cn'
import { STILL_WAITING_TEXT, useStillWaiting } from '#/shared/ui/confirm-shell'
import { Dialog, DialogContent, DialogTitle } from '#/shared/ui/dialog'
import {
  closeAdd,
  takeQueuedFiles,
  useAddOpen,
  useQueuedFiles,
} from '#/state/add-open'
import { openDetailOutside } from '#/state/detail-outside'
import { useListView } from '#/state/list-view'
import { selectCategories, useMaindata } from '#/state/maindata'
import { useSettings } from '#/state/settings'
import { useSheetLayer } from '#/state/sheet-layer'
import { useEscapeLayer } from '#/state/shortcuts'
import { useViewedHash } from '#/state/viewed-hash'
import {
  ADD_SENDING_TEXT,
  ADD_TITLE,
  NO_CATEGORIES_TEXT,
  addButtonText,
  addCounts,
  addResultText,
  addDisabled,
  categoryOptions,
  defaultCategory,
  savePathLine,
  skippedText,
} from '#/features/add/add-model'
import {
  AddList,
  CategoryField,
  FooterNote,
  IconClose,
  PasteBox,
} from '#/features/add/add-parts'
import type { PasteInput } from '#/features/add/add-parts'
import { useAddEntries } from '#/features/add/use-add-entries'
import { dismissAddFailure, useAddSubmit } from '#/features/add/use-add-submit'

// Story 4.6 (DESIGN and EXPERIENCE add-torrent, mockups S06-add-empty-
// desktop, S06-add-many-desktop, S06-add-phone): the add screen, mounted
// once by the `_authed` layout and opened through src/state/add-open.ts
// (the header, the empty states, a drop). Desktop: the non-modal `Dialog`
// with its modal session (AD-10 CSP), 640px wide, never taller than the
// screen less 40px, title 「新增種子」 and the 36px ✕ in one row; a press
// outside leaves it open (the list is work in progress). Phone: the bottom
// sheet, fixed at 90% with the footer pinned (no cancel; ✕ or a drag
// down). Both join the shortcut registry as a `dialog` layer: `Esc` closes
// it and no other shortcut runs meanwhile.
//
// Empty, it is the dashed paste box; once anything is pasted or picked the
// box becomes the list (problems first, src/lib/add-entries.ts) with the
// paste strip at its bottom, and new entries are judged together with the
// old ones. Under it: the category menu (preset to the category on screen,
// empty in 全部 and 未分類) and 「會存到 …」; then 「有 N 個不會加」 and
// 「新增 N 個」, disabled with nothing addable or no category (with no
// qBittorrent category at all, a line under the menu says so). Story 4.7
// submits (use-add-submit.ts): 「新增中…」 on the button, after 10 s
// 「還在等 NAS 回應」 under it, and every close path (取消, ✕, Esc, a drag
// down, 打開) and every change (paste, 選檔案, 拿掉, the category) does
// nothing until the send ends (a drop waits and joins after it); 新增 also waits for files still being
// read. A failed row shows its
// reason, and the list frame's top line counts what went and what failed.
// 「打開」 closes the screen and
// opens that torrent's detail, without a position when no list or column
// holds it (src/state/detail-outside.ts). Any close discards the list;
// files still being read are dropped (use-add-entries.ts). Crossing 1024px
// swaps the shell and keeps the list and the typed draft (both reset on
// every open). When the box and the list swap, focus that fell to `body`
// goes to the paste textarea that is there now, so a second paste works.
// Phone: the list frame is the sheet's scrolling content and the category,
// 「會存到」 and the button sit in the pinned footer, so they stay in view.

const FILE_ACCEPT = '.torrent,application/x-bittorrent'

export function AddScreen() {
  const open = useAddOpen()
  const desktop = useIsDesktop()
  const entries = useAddEntries(open)
  const { rows, ready, reading, addText, addFiles, remove } = entries
  const queued = useQueuedFiles()
  const { setHash } = useViewedHash()
  const { view, selectCategory } = useListView()
  const { settings } = useSettings()
  const { data: categories } = useMaindata(selectCategories)

  const options = categoryOptions(categories, settings?.categoryOrder ?? [])
  // `null`: untouched, the preset applies. Reset on every open.
  const [picked, setPicked] = useState<string | null>(null)
  const [draft, setDraft] = useState('')
  const [wasOpen, setWasOpen] = useState(open)
  if (wasOpen !== open) {
    setWasOpen(open)
    if (open) {
      setPicked(null)
      setDraft('')
    }
  }
  const chosen = picked ?? defaultCategory(view.category, options)
  const category = options.some((option) => option.value === chosen)
    ? chosen
    : ''
  const { addable, skipped } = addCounts(rows)
  // Before maindata loads every entry looks addable, and a file still being
  // read is not in the list yet: wait for both.
  const disabled = !ready || reading > 0 || addDisabled(addable, category)

  const { sending, isSending, failures, summary, submit } = useAddSubmit(
    open,
    entries,
    selectCategory,
    { category, disabled },
  )
  const waiting = useStillWaiting(sending)

  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  /** New entries; none while the add is out (the list is locked). */
  const onText = (text: string) => {
    if (isSending()) return
    dismissAddFailure()
    addText(text)
  }
  const onFiles = useCallback(
    (files: ReadonlyArray<File>) => {
      if (isSending() || files.length === 0) return
      dismissAddFailure()
      addFiles(files)
    },
    [isSending, addFiles],
  )

  // Dropped files (opened by a drop, or appended while open). A drop while
  // the add is out waits in the queue and joins once the send ended.
  useEffect(() => {
    if (!open || sending || queued.length === 0) return
    onFiles(takeQueuedFiles())
  }, [open, sending, queued, onFiles])

  /** Every close path; never while the add is out. */
  const close = useCallback(() => {
    if (isSending()) return
    dismissAddFailure()
    closeAdd()
  }, [isSending])
  const pickCategory = (value: string) => {
    if (isSending()) return
    dismissAddFailure()
    setPicked(value)
  }
  useEscapeLayer(open && desktop, close, 'dialog')
  useSheetLayer(open && !desktop, close)

  const onPick = () => {
    if (!isSending()) fileInputRef.current?.click()
  }
  const onFileInput = (event: ChangeEvent<HTMLInputElement>) => {
    const files = [...(event.target.files ?? [])]
    // The same file can be picked again.
    event.target.value = ''
    onFiles(files)
  }
  const onOpenExisting = (hash: string) => {
    if (isSending()) return
    dismissAddFailure()
    openDetailOutside(hash)
    setHash(hash)
    closeAdd()
  }
  /** Removes a row; focus goes to the next row's ✕, else the paste area. */
  const onRemove = (id: number, from: HTMLElement) => {
    if (isSending()) return
    const row = from.closest('li')
    const next = row?.nextElementSibling ?? row?.previousElementSibling
    const target =
      next?.querySelector<HTMLElement>('[data-add-remove]') ??
      textareaRef.current
    if (row?.contains(document.activeElement)) {
      target?.focus({ preventScroll: true })
    }
    dismissAddFailure()
    remove(id)
  }
  // The box became the list or back: the focused textarea or 選檔案 is
  // gone, so focus that fell to `body` goes to the new paste textarea.
  const empty = rows.length === 0
  useEffect(() => {
    if (!open) return
    const active = document.activeElement
    if (active === null || active === document.body) {
      textareaRef.current?.focus({ preventScroll: true })
    }
  }, [empty, open])

  const phone = !desktop
  const paste: PasteInput = {
    onText,
    onFiles,
    onPick,
    textareaRef,
    draft,
    setDraft,
    phone,
    reading: reading > 0,
    locked: sending,
  }
  const noCategories = categories !== undefined && options.length === 0
  // Failed rows still shown: one removed, or now in maindata, leaves the count.
  const failedShown = rows.filter(
    (row) => row.status === 'addable' && failures.has(row.entry.id),
  ).length
  const resultLine =
    summary !== null && failedShown > 0
      ? addResultText(summary.added, failedShown)
      : null

  const fileInput = (
    <input
      ref={fileInputRef}
      type="file"
      multiple
      accept={FILE_ACCEPT}
      hidden
      data-add-file-input=""
      onChange={onFileInput}
    />
  )
  const entriesArea = empty ? (
    <PasteBox {...paste} />
  ) : (
    <AddList
      rows={rows}
      paste={paste}
      onRemove={onRemove}
      onOpen={onOpenExisting}
      failures={failures}
      resultLine={resultLine}
    />
  )
  const categoryField = (
    <CategoryField
      value={category}
      options={options}
      onChange={pickCategory}
      path={savePathLine(category, categories)}
      note={noCategories ? NO_CATEGORIES_TEXT : null}
      locked={sending}
      phone={phone}
    />
  )
  const primary = (
    <button
      type="button"
      data-add-submit=""
      aria-disabled={disabled || sending || undefined}
      data-sending={sending || undefined}
      onClick={() => {
        if (disabled || sending) return
        submit(category)
      }}
      className={cn(
        'rounded-full bg-primary px-[18px] font-bold whitespace-nowrap text-primary-foreground tabular-nums hover-solid data-[sending]:opacity-100',
        phone ? 'h-11 w-full text-[15px]' : 'h-9 flex-none',
      )}
    >
      {sending ? ADD_SENDING_TEXT : addButtonText(addable)}
    </button>
  )
  /** Always mounted, so the line is announced when it fills in. */
  const waitingLine = (align: string) => (
    <p
      role="status"
      data-add-waiting=""
      className={cn('m-0 text-meta text-text-muted', align, waiting && 'mt-2')}
    >
      {waiting ? STILL_WAITING_TEXT : ''}
    </p>
  )
  const note = skippedText(skipped)

  if (phone) {
    return (
      <BottomSheet
        open={open}
        onOpenChange={(next) => {
          if (!next) close()
        }}
        mode="fixed90"
        title={ADD_TITLE}
        locked={sending}
        footer={
          <div className="flex flex-col gap-2 px-4 pt-3 pb-4">
            {categoryField}
            <FooterNote text={note} className="mt-1 text-center" />
            {primary}
            {waitingLine('text-center')}
          </div>
        }
      >
        <div data-add-body="" className="flex flex-col px-4 pt-1 pb-3">
          {fileInput}
          {entriesArea}
        </div>
      </BottomSheet>
    )
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) close()
      }}
    >
      <DialogContent
        aria-describedby={undefined}
        showCloseButton={false}
        closeOnOutsidePress={false}
        onOpenAutoFocus={(event) => {
          // Cmd or Ctrl+V works right away.
          event.preventDefault()
          textareaRef.current?.focus({ preventScroll: true })
        }}
        data-add-dialog=""
        className="flex max-h-[calc(100dvh-40px)] w-[640px] max-w-[calc(100%-40px)] flex-col gap-3.5 overflow-hidden p-6 sm:max-w-[calc(100%-40px)]"
      >
        <div className="flex flex-none items-center gap-3">
          <DialogTitle className="m-0 flex-1 text-[18px] leading-[1.2] font-bold">
            {ADD_TITLE}
          </DialogTitle>
          <IconClose onClick={close} phone={false} disabled={sending} />
        </div>
        {fileInput}
        {entriesArea}
        {categoryField}
        <div className="flex flex-none flex-col">
          <div className="flex items-center gap-4">
            <FooterNote text={note} className="min-w-0 flex-1" />
            <div className="flex flex-none gap-2">
              <button
                type="button"
                aria-disabled={sending || undefined}
                onClick={close}
                className="h-9 flex-none rounded-full border bg-surface px-[18px] font-semibold whitespace-nowrap text-text hover-outline aria-disabled:cursor-not-allowed"
              >
                取消
              </button>
              {primary}
            </div>
          </div>
          {waitingLine('text-right')}
        </div>
      </DialogContent>
    </Dialog>
  )
}
