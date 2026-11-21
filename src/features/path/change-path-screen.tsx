import { useEffect, useId, useMemo, useRef, useState } from 'react'
import type { KeyboardEvent, ReactNode } from 'react'
import { Plus, X } from 'lucide-react'
import { useQueryClient } from '@tanstack/react-query'
import type { SettingsWriteFailureCode } from '#/lib/error-text'
import { addCommonPathInput } from '#/lib/paths'
import { isMovingTorrent } from '#/lib/torrent-status'
import { toast } from '#/lib/toast'
import type { SlimTorrent } from '#/shared/maindata'
import { normalizeSavePath } from '#/shared/save-path'
import type {
  AddCommonPathInput,
  CommonPath,
  RemoveCommonPathInput,
  Settings,
  UpdateCommonPathInput,
} from '#/shared/settings'
import { useIsDesktop } from '#/shared/ui/breakpoint'
import { Checkbox } from '#/shared/ui/checkbox'
import { cn } from '#/shared/ui/cn'
import { ConfirmShell } from '#/shared/ui/confirm-shell'
import { Input } from '#/shared/ui/input'
import { LocationTag } from '#/shared/ui/location-tag'
import {
  changePathOpenStore,
  closeChangePath,
  useChangePathOpen,
} from '#/state/change-path-open'
import type { ChangePathOpen } from '#/state/change-path-open'
import { refreshMaindata, selectTorrents, useMaindata } from '#/state/maindata'
import { moveToastKey } from '#/state/pending-ops'
import { SETTINGS_KEY, commonPathToastKey, useSettings } from '#/state/settings'
import { useSheetLayer } from '#/state/sheet-layer'
import { useEscapeLayer } from '#/state/shortcuts'
import { sendOp, useOpsInFlight } from '#/state/tracked-op'
import type { TrackedOp } from '#/state/tracked-op'
import {
  ADD_COMMON_PATH_TEXT,
  ALREADY_LISTED_TEXT,
  BOX_LABEL,
  CHANGE_PATH_TITLE,
  COMMON_PATHS_HEADER,
  CURRENT_TAG,
  DONE_TEXT,
  EDIT_TEXT,
  MEDIA_LIBRARY_TAG,
  MOVE_BUTTON_TEXT,
  MOVE_SENDING_TEXT,
  REMOVE_TOOLTIP,
  changePathView,
  mediaLibraryLabel,
  nameInputLabel,
  removeLabel,
  renameLabel,
  renameOutcome,
} from '#/features/path/change-path-model'
import { moveVariables } from '#/features/path/set-location-op'
import type { MoveOp } from '#/features/path/set-location-op'

// Story 5.2 (DESIGN change-path and text-input, EXPERIENCE change-path,
// mockups S08-path-desktop, S08-path-phone): the change-path screen for one
// torrent, mounted once by the `_authed` layout and opened through
// src/state/change-path-open.ts (the detail's 「改路徑」). The shared confirm
// shell: desktop a 560px dialog, phone the content-height sheet (up to 90%,
// no cancel), above the phone detail sheet. Title 「改路徑」 with the torrent
// name under it (plain text). Only the save path.
//
// 「常用路徑」 lists the common paths as radio rows (name over the mono
// path, 「媒體庫」 for a media library, the outline 「目前」 on the row the
// torrent is in now). A row is selected when the box's normalized path is
// its own (the first of duplicates), so selection is the background and the
// radio only, 「目前」 only the outline tag (taste-log principle 3). Clicking
// a row or stepping with the arrow keys fills the box with its path. The
// last row 「加到常用」 adds the box's path (named by its last two folders,
// not a media library); the list then follows the answered settings, so
// the new row is the selected one. It is disabled with a bad format,
// before settings answered, while its own request is out, and when the path
// is listed (with 「框裡的路徑已經在清單裡」 beside it).
//
// The 「會搬到」 box starts at the torrent's save path. A bad format turns
// its border `delete` with the reason under it and disables 「搬過去」, as
// does the box naming where the torrent already is. Enter in the box
// presses 「搬過去」. Sending is the shell's: 「搬移中…」, no second send,
// every close path locked, 「還在等 NAS 回應」 after 10 s. Success closes
// the screen and refreshes maindata (set-location-op.ts); a failure keeps
// it open with the box as typed, and its toast's 重試 sends the same body.
// Editing the box, closing and opening again close that toast, so 重試
// never sends a path that is no longer on screen. A torrent that leaves
// maindata closes the screen (never mid-send).
//
// Story 5.4 (DESIGN change-path edit mode, mockup S08-path-edit-desktop):
// the 28px outline pill 「編輯」 right of 「常用路徑」 (44px on the phone)
// turns the list into edit mode and reads 「完成」 (700) there. Edit rows
// have no radio and do not fill the box; the name has a dotted underline
// and turns into an input when clicked; the right side has a 20px
// 「媒體庫」 checkbox (saves at once) and a 32px ✕ 「從常用拿掉（不動檔案）」
// (removes at once, no confirmation; the box keeps its path, so a removed
// selected row leaves none selected); 「加到常用」 hides. An inline rename
// (edit mode, right after 「加到常用」, or opened from the detail's
// 「改名」 through `editPath`) saves on Enter or blur when the trimmed name
// changed and is valid (an invalid one keeps the `delete` border and is
// not sent), and `Esc` cancels only the rename (the input is marked
// `data-own-escape`, which the shell's dialog and the Esc layers leave
// alone). While a row's write is in flight its input, checkbox and ✕ are
// disabled; a failure keeps the typed name in the input, its toast's 重試
// sends the same write. Every write answers the whole settings, so the
// list and the location tags follow `['settings']`.

type SettingsWriteOp<TVariables> = TrackedOp<
  TVariables,
  SettingsWriteFailureCode,
  Settings
>

export interface ChangePathScreenProps {
  moveOp: MoveOp
  addPathOp: SettingsWriteOp<AddCommonPathInput>
  updatePathOp: SettingsWriteOp<UpdateCommonPathInput>
  removePathOp: SettingsWriteOp<RemoveCommonPathInput>
}

/**
 * The common path whose name is an input: its normalized path, and the
 * text typed (`null`: nothing typed yet, the input shows the name).
 */
interface Renaming {
  path: string
  text: string | null
}

function renamingFor(opened: ChangePathOpen): Renaming | null {
  return opened?.editPath === undefined
    ? null
    : { path: normalizeSavePath(opened.editPath), text: null }
}

const rowPath = (common: CommonPath) => normalizeSavePath(common.path)

/** Focus to give back after a render: which control of which row. */
interface FocusRequest {
  path: string
  /** `pill`: 編輯/完成, after a ✕ took its own row away. */
  on: 'name' | 'input' | 'remove' | 'pill'
}

/** The `data-*` attribute (dataset key) naming each control's row. */
const FOCUS_DATA = {
  name: 'rowFocus',
  input: 'renameFor',
  remove: 'removeFor',
} as const

const NO_PATHS: ReadonlyArray<CommonPath> = Object.freeze([])

export function ChangePathScreen({
  moveOp,
  addPathOp,
  updatePathOp,
  removePathOp,
}: ChangePathScreenProps) {
  const opened = useChangePathOpen()
  const desktop = useIsDesktop()
  const client = useQueryClient()
  const { data: torrents } = useMaindata(selectTorrents)
  const { settings, ready } = useSettings()
  const commonPaths = settings?.commonPaths ?? NO_PATHS

  const hash = opened?.hashes[0] ?? null
  const live =
    hash !== null && torrents !== undefined && Object.hasOwn(torrents, hash)
      ? torrents[hash]
      : null
  // The torrent shown, kept while the sheet slides out after closing.
  const [kept, setKept] = useState<SlimTorrent | null>(live)
  if (live !== null && kept !== live) setKept(live)
  const torrent = live ?? kept
  const open = opened !== null && torrent !== null

  const [box, setBox] = useState(live?.save_path ?? '')
  const [editing, setEditing] = useState(opened?.editPath !== undefined)
  const [renaming, setRenaming] = useState(() => renamingFor(opened))
  // Every open starts from the torrent's save path, in normal mode unless
  // the open asks to rename one row (story 5.4).
  const [openedFor, setOpenedFor] = useState(opened)
  if (openedFor !== opened) {
    setOpenedFor(opened)
    if (opened !== null) {
      setBox(live?.save_path ?? '')
      setKept(live)
      setEditing(opened.editPath !== undefined)
      setRenaming(renamingFor(opened))
    }
  }
  // No common paths left (the last one removed): edit mode has nothing to
  // show, so it ends.
  const noPaths = settings !== undefined && settings.commonPaths.length === 0
  if (editing && noPaths) setEditing(false)
  // The rename open now, for a commit that arrives after it closed (a blur
  // while the input goes).
  const renamingRef = useRef(renaming)
  renamingRef.current = renaming

  const view = useMemo(
    () =>
      changePathView({
        box,
        savePath: torrent?.save_path ?? '',
        commonPaths,
        moving: torrent !== null && isMovingTorrent(torrent),
      }),
    [box, torrent, commonPaths],
  )

  // Set on press, before the in-flight state shows (the same tick): blocks
  // a second send and every close path until the call settled. A 重試 from
  // the toast locks the screen through `inFlight` only.
  const pressedRef = useRef(false)
  const [pressed, setPressed] = useState(false)
  const inFlight = useOpsInFlight(moveOp)
  const sending =
    pressed ||
    (hash !== null &&
      inFlight.some((variables) => variables.hashes.includes(hash)))
  const adding = useOpsInFlight(addPathOp).length > 0
  // Story 5.4: the rows with a write in flight (their controls disabled).
  const updating = useOpsInFlight(updatePathOp)
  const removing = useOpsInFlight(removePathOp)
  const busyPaths = new Set(
    [...updating, ...removing].map((variables) =>
      normalizeSavePath(variables.path),
    ),
  )
  // Set on send, before the in-flight state shows: no second write of a
  // row (a blur after Enter) until the first settled.
  const writingRef = useRef(new Set<string>())
  /** What the row shows: its controls disabled. */
  const rowBusy = (path: string) => sending || busyPaths.has(path)
  /** What a press checks: also a write sent this same tick. */
  const rowWriting = (path: string) =>
    rowBusy(path) || writingRef.current.has(path)
  const listRef = useRef<HTMLDivElement>(null)
  const editPillRef = useRef<HTMLButtonElement>(null)
  // What takes focus next: a row's name (or radio) once its rename closed,
  // or its rename input or ✕ again after a failed write.
  const refocusRef = useRef<FocusRequest | null>(null)
  useEffect(() => {
    const request = refocusRef.current
    if (request === null) return
    if (request.on === 'pill') {
      const active = document.activeElement
      // Still on the ✕ while its row waits to go: try again next render.
      if (active !== null && active !== document.body) {
        if (active.matches(':disabled')) return
        refocusRef.current = null
        return
      }
      refocusRef.current = null
      editPillRef.current?.focus({ preventScroll: true })
      return
    }
    if (request.on === 'name' && renaming?.path === request.path) return
    const key = FOCUS_DATA[request.on]
    const target = [
      ...(listRef.current?.querySelectorAll<HTMLElement>(
        '[data-row-focus], [data-rename-for], [data-remove-for]',
      ) ?? []),
    ].find((element) => element.dataset[key] === request.path)
    // Still locked while its write settles: try again on the next render.
    if (target?.matches(':disabled')) return
    refocusRef.current = null
    target?.focus({ preventScroll: true })
  })

  // Story 5.4: a common-path write's failure toast is about what was on
  // screen; its 重試 must not write a name no longer there.
  const dismissPathToasts = () => {
    const listed =
      client.getQueryData<Settings>(SETTINGS_KEY)?.commonPaths ?? NO_PATHS
    for (const common of listed) {
      toast.dismissFor(commonPathToastKey(rowPath(common)))
    }
  }

  // Every open: an old failure toast's 重試 must not move without the screen.
  useEffect(() => {
    if (hash !== null) toast.dismissFor(moveToastKey(hash))
    if (opened !== null) dismissPathToasts()
    // Only on open: a write's own failure toast stays while the screen does.
  }, [opened, hash])

  const cancel = () => {
    if (sending || pressedRef.current) return
    if (hash !== null) toast.dismissFor(moveToastKey(hash))
    dismissPathToasts()
    closeChangePath()
  }
  useEscapeLayer(open && desktop, cancel, 'dialog')
  useSheetLayer(open && !desktop, cancel)

  // The torrent left maindata (deleted elsewhere): close, never mid-send.
  const gone = opened !== null && torrents !== undefined && live === null
  useEffect(() => {
    if (!gone || sending) return
    if (hash !== null) toast.dismissFor(moveToastKey(hash))
    dismissPathToasts()
    closeChangePath()
  }, [gone, sending, hash])

  const send = () => {
    if (sending || pressedRef.current || hash === null || view.moveDisabled) {
      return
    }
    pressedRef.current = true
    setPressed(true)
    const variables = moveVariables(client, [hash], view.target)
    void sendOp(
      {
        ...moveOp,
        onSuccess: (sentClient, sent, data) => {
          // A late 重試 for a screen opened again on another torrent leaves it.
          const now = changePathOpenStore.state.open
          if (now !== null && sameHashes(now.hashes, sent.hashes)) {
            closeChangePath()
          }
          return moveOp.onSuccess?.(sentClient, sent, data)
        },
        onFailure: (sent, code, error) => {
          moveOp.onFailure?.(sent, code, error)
          void refreshMaindata(client)
        },
      },
      client,
      variables,
    ).then(() => {
      pressedRef.current = false
      setPressed(false)
    })
  }

  const addDisabled =
    view.reason !== null || view.selected !== null || !ready || adding
  const add = () => {
    if (addDisabled) return
    const sentFor = opened
    void sendOp(
      {
        ...addPathOp,
        onSuccess: async (sentClient, sent, data) => {
          await addPathOp.onSuccess?.(sentClient, sent, data)
          // Story 5.4: the new row's name opens for renaming (its text
          // selected), unless the screen closed or opened again meanwhile.
          if (changePathOpenStore.state.open === sentFor) {
            setRenaming({ path: sent.path, text: null })
          }
        },
      },
      client,
      addCommonPathInput(view.target),
    )
  }

  /**
   * Sends one row's write through `op`; `after` runs on success. A failure
   * whose control lost focus while it was disabled gives it back to
   * `failFocus` (the rename input, the ✕), so the next Esc is its own.
   */
  function sendRowWrite<TVariables extends { path: string }>(
    op: SettingsWriteOp<TVariables>,
    variables: TVariables,
    after: (path: string) => void,
    failFocus: 'input' | 'remove' | null = null,
  ) {
    const path = normalizeSavePath(variables.path)
    writingRef.current.add(path)
    void sendOp(
      {
        ...op,
        onSuccess: async (sentClient, sent, data) => {
          await op.onSuccess?.(sentClient, sent, data)
          after(normalizeSavePath(sent.path))
        },
        onFailure: (sent, code, error) => {
          op.onFailure?.(sent, code, error)
          const failed = normalizeSavePath(sent.path)
          // The input stays with the typed name: no jump to the name.
          if (refocusRef.current?.path === failed) refocusRef.current = null
          const active = document.activeElement
          const lost =
            active === null ||
            active === document.body ||
            active.matches(':disabled')
          if (failFocus !== null && lost) {
            refocusRef.current = { path: failed, on: failFocus }
          }
        },
      },
      client,
      variables,
    ).then(() => {
      writingRef.current.delete(path)
    })
  }

  const closeRename = (path: string) => {
    setRenaming((now) => (now?.path === path ? null : now))
  }

  const startRename = (common: CommonPath) => {
    const path = rowPath(common)
    if (rowWriting(path)) return
    setRenaming({ path, text: null })
  }

  /** Enter (`byKey`) or blur in a rename input. */
  const commitRename = (common: CommonPath, text: string, byKey: boolean) => {
    const path = rowPath(common)
    if (renamingRef.current?.path !== path || rowWriting(path)) return
    const outcome = renameOutcome(text, common.name)
    if (outcome.kind === 'invalid') return
    if (byKey) refocusRef.current = { path, on: 'name' }
    if (outcome.kind === 'unchanged') {
      closeRename(path)
      return
    }
    sendRowWrite(
      updatePathOp,
      { path, name: outcome.name },
      closeRename,
      'input',
    )
  }

  const cancelRename = (common: CommonPath) => {
    const path = rowPath(common)
    refocusRef.current = { path, on: 'name' }
    closeRename(path)
  }

  const tick = (common: CommonPath, mediaLibrary: boolean) => {
    const path = rowPath(common)
    if (rowWriting(path)) return
    sendRowWrite(updatePathOp, { path, mediaLibrary }, () => {})
  }

  const remove = (common: CommonPath) => {
    const path = rowPath(common)
    if (rowWriting(path)) return
    sendRowWrite(
      removePathOp,
      { path },
      (removed) => {
        closeRename(removed)
        // The ✕ that had focus goes with its row (it may still hold focus
        // while disabled): once it is gone, focus the pill, in the screen.
        const active = document.activeElement
        if (
          active === null ||
          active === document.body ||
          active.matches(':disabled')
        ) {
          refocusRef.current = { path: removed, on: 'pill' }
        }
      },
      'remove',
    )
  }

  /** The rename input for `common` when its name is being renamed. */
  const renameSlot = (common: CommonPath): ReactNode => {
    const path = rowPath(common)
    if (renaming?.path !== path) return null
    const text = renaming.text ?? common.name
    return (
      <RenameInput
        path={path}
        value={text}
        label={nameInputLabel(common.path)}
        invalid={renameOutcome(text, common.name).kind === 'invalid'}
        disabled={rowBusy(path)}
        desktop={desktop}
        onChange={(next) =>
          setRenaming((now) =>
            now?.path === path ? { path, text: next } : now,
          )
        }
        onCommit={(typed, byKey) => commitRename(common, typed, byKey)}
        onCancel={() => cancelRename(common)}
      />
    )
  }

  const editBox = (text: string) => {
    if (sending) return
    setBox(text)
    // 重試 would send the old path: close the toast.
    if (hash !== null) toast.dismissFor(moveToastKey(hash))
  }

  const boxId = useId()
  const reasonId = useId()
  const listLabelId = useId()

  return (
    <ConfirmShell
      open={open}
      desktop={desktop}
      title={CHANGE_PATH_TITLE}
      subtitle={torrent?.name ?? ''}
      primaryLabel={MOVE_BUTTON_TEXT}
      sendingLabel={MOVE_SENDING_TEXT}
      onPrimary={send}
      primaryDisabled={view.moveDisabled}
      primaryTone="accent"
      sending={sending}
      onCancel={cancel}
      initialFocus={() =>
        listRef.current?.querySelector<HTMLElement>('[data-rename-input]') ??
        null
      }
      desktopWidthClass="w-[560px]"
    >
      <div className="flex flex-none flex-col gap-2">
        <div className="flex items-center gap-2">
          <span id={listLabelId} className="flex-1 text-meta font-semibold">
            {COMMON_PATHS_HEADER}
          </span>
          <button
            ref={editPillRef}
            type="button"
            data-edit-pill=""
            disabled={sending || !ready || commonPaths.length === 0}
            onClick={() => {
              // Either way an open rename closes unsaved (a blur before the
              // press already saved a valid changed name).
              setRenaming(null)
              setEditing((now) => !now)
            }}
            className={cn(
              'flex-none rounded-full border border-border bg-surface px-3.5 whitespace-nowrap text-text hover-outline disabled:cursor-not-allowed',
              desktop ? 'h-7 text-meta' : 'h-11 text-[13px]',
              editing ? 'font-bold' : 'font-semibold',
            )}
          >
            {editing ? DONE_TEXT : EDIT_TEXT}
          </button>
        </div>
        {(!editing || commonPaths.length > 0) && (
          <div
            ref={listRef}
            className="overflow-hidden rounded-card border bg-surface"
          >
            {editing ? (
              <EditRows
                labelId={listLabelId}
                commonPaths={commonPaths}
                current={view.current}
                desktop={desktop}
                rowBusy={(common) => rowBusy(rowPath(common))}
                renameSlot={renameSlot}
                onRename={startRename}
                onTick={tick}
                onRemove={remove}
              />
            ) : (
              <>
                {commonPaths.length > 0 && (
                  <PathRadios
                    labelId={listLabelId}
                    commonPaths={commonPaths}
                    selected={view.selected}
                    current={view.current}
                    desktop={desktop}
                    disabled={sending}
                    renameSlot={renameSlot}
                    onPick={(common) => editBox(common.path)}
                  />
                )}
                <button
                  type="button"
                  disabled={addDisabled || sending}
                  onClick={add}
                  className={cn(
                    'flex w-full items-center gap-3 px-3 text-left font-semibold text-text hover-row disabled:cursor-not-allowed',
                    desktop ? 'min-h-10 text-[13px]' : 'min-h-12 text-[15px]',
                    commonPaths.length > 0 && 'border-t',
                  )}
                >
                  <span className="inline-flex w-5 flex-none justify-center">
                    <Plus size={16} strokeWidth={2.4} aria-hidden="true" />
                  </span>
                  <span className="min-w-0 flex-1">{ADD_COMMON_PATH_TEXT}</span>
                  {view.selected !== null && (
                    <span className="flex-none text-meta font-normal text-text-muted">
                      {desktop
                        ? ALREADY_LISTED_TEXT.desktop
                        : ALREADY_LISTED_TEXT.phone}
                    </span>
                  )}
                </button>
              </>
            )}
          </div>
        )}
      </div>
      <div className="flex flex-none flex-col gap-1.5">
        <label htmlFor={boxId} className="text-meta font-semibold">
          {BOX_LABEL}
        </label>
        <Input
          id={boxId}
          type="text"
          value={box}
          readOnly={sending}
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          aria-invalid={view.reason !== null || undefined}
          aria-describedby={view.reason !== null ? reasonId : undefined}
          onChange={(event) => editBox(event.target.value)}
          onKeyDown={(event) => {
            if (event.key !== 'Enter') return
            // An IME commit (Safari: not composing, keyCode 229) is no press.
            if (event.nativeEvent.isComposing || event.keyCode === 229) return
            event.preventDefault()
            send()
          }}
          className={cn(
            'font-mono',
            desktop ? 'h-9 text-path' : 'h-11 text-[16px]',
          )}
        />
        {view.reason !== null && (
          <p id={reasonId} className="m-0 text-meta text-delete">
            {view.reason}
          </p>
        )}
        {view.movingNote !== null && (
          <p className="m-0 text-meta text-text-muted">{view.movingNote}</p>
        )}
      </div>
    </ConfirmShell>
  )
}

function sameHashes(a: ReadonlyArray<string>, b: ReadonlyArray<string>) {
  return a.length === b.length && a.every((hash, index) => hash === b[index])
}

const STEP_KEYS: Readonly<Record<string, number>> = {
  ArrowDown: 1,
  ArrowRight: 1,
  ArrowUp: -1,
  ArrowLeft: -1,
}

/**
 * The common paths as one radio group (APG radio group): one tab stop (the
 * selected row, else the first); arrows move to the next or previous row,
 * wrapping, and pick it.
 * https://www.w3.org/WAI/ARIA/apg/patterns/radio/
 */
function PathRadios({
  labelId,
  commonPaths,
  selected,
  current,
  desktop,
  disabled,
  renameSlot,
  onPick,
}: {
  labelId: string
  commonPaths: ReadonlyArray<CommonPath>
  selected: CommonPath | null
  current: CommonPath | null
  desktop: boolean
  disabled: boolean
  /** Story 5.4: the row's rename input, or `null` (the radio row). */
  renameSlot: (common: CommonPath) => ReactNode
  onPick: (common: CommonPath) => void
}) {
  const rowsRef = useRef<Array<HTMLButtonElement | null>>([])
  const slots = commonPaths.map(renameSlot)
  const selectedIndex = selected === null ? -1 : commonPaths.indexOf(selected)
  // The selected row, unless it is being renamed (no radio): the first radio.
  const tabStop =
    selectedIndex !== -1 && slots[selectedIndex] === null
      ? selectedIndex
      : slots.findIndex((slot) => slot === null)

  const onKeyDown = (
    event: KeyboardEvent<HTMLButtonElement>,
    index: number,
  ) => {
    if (!Object.hasOwn(STEP_KEYS, event.key)) return
    const step = STEP_KEYS[event.key]
    event.preventDefault()
    // A row being renamed is no radio: step over it.
    let next = index
    commonPaths.some(() => {
      next = (next + step + commonPaths.length) % commonPaths.length
      return Boolean(rowsRef.current[next])
    })
    rowsRef.current[next]?.focus()
    onPick(commonPaths[next])
  }

  return (
    <ul
      role="radiogroup"
      aria-labelledby={labelId}
      className="m-0 list-none p-0"
    >
      {commonPaths.map((common, index) => {
        const checked = common === selected
        const slot = slots[index]
        const rowClass = cn(
          'flex w-full items-center gap-3 px-3 text-left text-text',
          desktop ? 'min-h-[52px] py-[7px]' : 'min-h-14 py-2',
          checked ? 'bg-selection-row' : 'hover-row',
        )
        const body = (
          <>
            <Radio checked={checked} />
            <span
              className={cn(
                'flex min-w-0 flex-1 flex-col',
                slot === null ? 'gap-px' : 'gap-1',
              )}
            >
              {slot !== null ? (
                // A row, so the input keeps its own height.
                <span className="flex min-w-0 items-center">{slot}</span>
              ) : (
                <span
                  data-path-name=""
                  className={cn(
                    'block truncate leading-[1.4] font-semibold',
                    desktop ? 'text-[13px]' : 'text-[15px]',
                  )}
                >
                  {common.name}
                </span>
              )}
              <span
                title={common.path}
                className="block truncate font-mono text-path text-text-muted"
              >
                {common.path}
              </span>
            </span>
            <RowTags
              mediaLibrary={common.mediaLibrary}
              current={common === current}
            />
          </>
        )
        return (
          <li key={rowPath(common)} className={cn(index > 0 && 'border-t')}>
            {slot === null ? (
              <button
                ref={(element) => {
                  rowsRef.current[index] = element
                }}
                type="button"
                role="radio"
                aria-checked={checked}
                aria-disabled={disabled || undefined}
                tabIndex={index === tabStop ? 0 : -1}
                data-path-row=""
                data-row-focus={rowPath(common)}
                data-selected={checked || undefined}
                onClick={() => {
                  if (!disabled) onPick(common)
                }}
                onKeyDown={(event) => {
                  if (!disabled) onKeyDown(event, index)
                }}
                className={rowClass}
              >
                {body}
              </button>
            ) : (
              // Story 5.4: right after 「加到常用」, the row's name is an
              // input; a radio cannot hold one, so the row is plain.
              <div
                data-path-row=""
                data-renaming=""
                data-selected={checked || undefined}
                className={rowClass}
              >
                {body}
              </div>
            )}
          </li>
        )
      })}
    </ul>
  )
}

/** The 「媒體庫」 tag and the outline 「目前」 on a normal row. */
function RowTags({
  mediaLibrary,
  current,
}: {
  mediaLibrary: boolean
  current: boolean
}) {
  if (!mediaLibrary && !current) return null
  return (
    <span className="flex flex-none items-center gap-1.5">
      {mediaLibrary && (
        <LocationTag
          label={MEDIA_LIBRARY_TAG}
          mediaLibrary
          mediaLibraryNote={false}
          className="rounded-full px-2 py-px text-tag whitespace-nowrap"
        />
      )}
      {current && <CurrentTag />}
    </span>
  )
}

function CurrentTag() {
  return (
    <span
      data-current-tag=""
      className="inline-flex flex-none items-center rounded-full border px-2 py-px text-tag whitespace-nowrap text-text-muted"
    >
      {CURRENT_TAG}
    </span>
  )
}

/**
 * Story 5.4: the common paths in edit mode (S08-path-edit-desktop). No
 * radio and no box filling: the name (dotted underline, 「目前」 beside it)
 * turns into an input when clicked; then the 「媒體庫」 checkbox and the ✕.
 * A row's controls are disabled while its write is in flight.
 */
function EditRows({
  labelId,
  commonPaths,
  current,
  desktop,
  rowBusy,
  renameSlot,
  onRename,
  onTick,
  onRemove,
}: {
  labelId: string
  commonPaths: ReadonlyArray<CommonPath>
  current: CommonPath | null
  desktop: boolean
  rowBusy: (common: CommonPath) => boolean
  renameSlot: (common: CommonPath) => ReactNode
  onRename: (common: CommonPath) => void
  onTick: (common: CommonPath, mediaLibrary: boolean) => void
  onRemove: (common: CommonPath) => void
}) {
  return (
    <ul aria-labelledby={labelId} className="m-0 list-none p-0">
      {commonPaths.map((common, index) => {
        const busy = rowBusy(common)
        const slot = renameSlot(common)
        return (
          <li
            key={rowPath(common)}
            data-path-row=""
            data-edit-row=""
            data-busy={busy || undefined}
            className={cn(
              'flex items-center gap-2.5 pr-1.5 pl-3 text-text',
              desktop ? 'min-h-[52px] py-[7px]' : 'min-h-14 py-2',
              index > 0 && 'border-t',
            )}
          >
            <span className="flex min-w-0 flex-1 flex-col gap-px">
              <span className="flex min-w-0 items-center gap-2">
                {slot ?? (
                  <button
                    type="button"
                    data-path-name=""
                    data-row-focus={rowPath(common)}
                    aria-label={renameLabel(common.name)}
                    disabled={busy}
                    onClick={() => onRename(common)}
                    className={cn(
                      'block max-w-full min-w-0 cursor-text truncate text-left leading-[1.4] font-semibold underline decoration-text-faint decoration-dotted underline-offset-[3px] disabled:cursor-not-allowed',
                      desktop ? 'text-[13px]' : 'text-[15px]',
                    )}
                  >
                    {common.name}
                  </button>
                )}
                {common === current && <CurrentTag />}
              </span>
              <span
                title={common.path}
                className="block truncate font-mono text-path text-text-muted"
              >
                {common.path}
              </span>
            </span>
            <label
              className={cn(
                'flex h-8 flex-none items-center gap-1.5 px-1 text-meta text-text',
                busy ? 'cursor-not-allowed' : 'cursor-pointer',
              )}
            >
              <Checkbox
                checked={common.mediaLibrary}
                disabled={busy}
                aria-label={mediaLibraryLabel(common.name)}
                onCheckedChange={(checked) => onTick(common, checked === true)}
                className="disabled:cursor-not-allowed disabled:opacity-50"
              />
              <span aria-hidden="true">{MEDIA_LIBRARY_TAG}</span>
            </label>
            <button
              type="button"
              aria-label={removeLabel(common.name)}
              title={REMOVE_TOOLTIP}
              data-remove-for={rowPath(common)}
              disabled={busy}
              onClick={() => onRemove(common)}
              className="inline-flex size-8 flex-none items-center justify-center rounded-full text-text-muted hover-row disabled:cursor-not-allowed"
            >
              <X size={16} strokeWidth={2} aria-hidden="true" />
            </button>
          </li>
        )
      })}
    </ul>
  )
}

/**
 * Story 5.4: an inline rename. Opens focused with its text selected; Enter
 * or blur commits (`byKey` for Enter), `Esc` cancels this rename only (an
 * IME commit, Safari's keyCode 229 included, is neither). 36px (44px with
 * 16px text on the phone); an invalid name gets the `delete` border.
 */
function RenameInput({
  path,
  value,
  label,
  invalid,
  disabled,
  desktop,
  onChange,
  onCommit,
  onCancel,
}: {
  /** The row's normalized path (its focus key). */
  path: string
  value: string
  label: string
  invalid: boolean
  disabled: boolean
  desktop: boolean
  onChange: (text: string) => void
  onCommit: (text: string, byKey: boolean) => void
  onCancel: () => void
}) {
  const ref = useRef<HTMLInputElement>(null)
  // Set by Esc: the blur that follows (the input going) saves nothing.
  const cancelledRef = useRef(false)
  useEffect(() => {
    const input = ref.current
    if (!input) return
    input.focus({ preventScroll: true })
    input.select()
  }, [])
  return (
    <Input
      ref={ref}
      type="text"
      value={value}
      disabled={disabled}
      aria-label={label}
      aria-invalid={invalid || undefined}
      data-rename-input=""
      data-rename-for={path}
      data-own-escape=""
      autoCapitalize="none"
      autoCorrect="off"
      spellCheck={false}
      onChange={(event) => onChange(event.target.value)}
      onKeyDown={(event) => {
        if (event.nativeEvent.isComposing || event.keyCode === 229) return
        if (event.key === 'Enter') {
          event.preventDefault()
          onCommit(event.currentTarget.value, true)
        } else if (event.key === 'Escape') {
          // Keeps the screen open: the Esc layers skip a handled key.
          event.preventDefault()
          cancelledRef.current = true
          onCancel()
        }
      }}
      onBlur={(event) => {
        if (!cancelledRef.current) onCommit(event.currentTarget.value, false)
      }}
      className={cn(
        'min-w-0 flex-1 font-semibold',
        desktop ? 'h-9 text-[13px]' : 'h-11 text-[16px]',
      )}
    />
  )
}

/** 20px: a 2px `text-faint` ring, or a 2px `accent` ring with an `accent` dot. */
function Radio({ checked }: { checked: boolean }) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        'inline-flex size-5 flex-none items-center justify-center rounded-full border-2 bg-surface',
        checked ? 'border-primary' : 'border-text-faint',
      )}
    >
      {checked && <span className="block size-2.5 rounded-full bg-primary" />}
    </span>
  )
}
