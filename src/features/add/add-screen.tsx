import { useCallback, useEffect, useRef, useState } from 'react'
import type { ChangeEvent } from 'react'
import { BottomSheet } from '#/shared/ui/bottom-sheet'
import { useIsDesktop } from '#/shared/ui/breakpoint'
import { cn } from '#/shared/ui/cn'
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
  ADD_TITLE,
  addButtonText,
  addCounts,
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
// 「新增 N 個」, disabled with nothing addable or no category. Submitting is
// story 4.7: the button does nothing yet. 「打開」 closes the screen and
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
  const { view } = useListView()
  const { settings } = useSettings()
  const { data: categories } = useMaindata(selectCategories)

  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // Dropped files (opened by a drop, or appended while open).
  useEffect(() => {
    if (!open || queued.length === 0) return
    addFiles(takeQueuedFiles())
  }, [open, queued, addFiles])

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

  const close = useCallback(() => closeAdd(), [])
  useEscapeLayer(open && desktop, close, 'dialog')
  useSheetLayer(open && !desktop, close)

  const onPick = () => fileInputRef.current?.click()
  const onFileInput = (event: ChangeEvent<HTMLInputElement>) => {
    const files = [...(event.target.files ?? [])]
    // The same file can be picked again.
    event.target.value = ''
    addFiles(files)
  }
  const onOpenExisting = (hash: string) => {
    openDetailOutside(hash)
    setHash(hash)
    closeAdd()
  }
  /** Removes a row; focus goes to the next row's ✕, else the paste area. */
  const onRemove = (id: number, from: HTMLElement) => {
    const row = from.closest('li')
    const next = row?.nextElementSibling ?? row?.previousElementSibling
    const target =
      next?.querySelector<HTMLElement>('[data-add-remove]') ??
      textareaRef.current
    if (row?.contains(document.activeElement)) {
      target?.focus({ preventScroll: true })
    }
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
    onText: addText,
    onFiles: addFiles,
    onPick,
    textareaRef,
    draft,
    setDraft,
    phone,
    reading: reading > 0,
  }
  const { addable, skipped } = addCounts(rows)
  // Before maindata loads every entry looks addable: wait for it.
  const disabled = !ready || addDisabled(addable, category)

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
    />
  )
  const categoryField = (
    <CategoryField
      value={category}
      options={options}
      onChange={setPicked}
      path={savePathLine(category, categories)}
      phone={phone}
    />
  )
  const primary = (
    <button
      type="button"
      data-add-submit=""
      aria-disabled={disabled || undefined}
      onClick={() => {
        if (disabled) return
        // Story 4.7 sends; until then a press does nothing.
      }}
      className={cn(
        'rounded-full bg-primary px-[18px] font-bold whitespace-nowrap text-primary-foreground tabular-nums hover-solid',
        phone ? 'h-11 w-full text-[15px]' : 'h-9 flex-none',
      )}
    >
      {addButtonText(addable)}
    </button>
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
        footer={
          <div className="flex flex-col gap-2 px-4 pt-3 pb-4">
            {categoryField}
            <FooterNote text={note} className="mt-1 text-center" />
            {primary}
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
          <IconClose onClick={close} phone={false} />
        </div>
        {fileInput}
        {entriesArea}
        {categoryField}
        <div className="flex flex-none items-center gap-4">
          <FooterNote text={note} className="min-w-0 flex-1" />
          <div className="flex flex-none gap-2">
            <button
              type="button"
              onClick={close}
              className="h-9 flex-none rounded-full border bg-surface px-[18px] font-semibold whitespace-nowrap text-text hover-outline"
            >
              取消
            </button>
            {primary}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
