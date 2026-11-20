import { useEffect, useId, useMemo, useRef, useState } from 'react'
import type { KeyboardEvent } from 'react'
import { Plus } from 'lucide-react'
import { useQueryClient } from '@tanstack/react-query'
import type { SettingsWriteFailureCode } from '#/lib/error-text'
import { toast } from '#/lib/toast'
import type { SlimTorrent } from '#/shared/maindata'
import type {
  AddCommonPathInput,
  CommonPath,
  Settings,
} from '#/shared/settings'
import { useIsDesktop } from '#/shared/ui/breakpoint'
import { cn } from '#/shared/ui/cn'
import { ConfirmShell } from '#/shared/ui/confirm-shell'
import { Input } from '#/shared/ui/input'
import { LocationTag } from '#/shared/ui/location-tag'
import {
  changePathOpenStore,
  closeChangePath,
  useChangePathOpen,
} from '#/state/change-path-open'
import { refreshMaindata, selectTorrents, useMaindata } from '#/state/maindata'
import { useSettings } from '#/state/settings'
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
  MEDIA_LIBRARY_TAG,
  MOVE_BUTTON_TEXT,
  MOVE_SENDING_TEXT,
  addCommonPathInput,
  changePathView,
} from '#/features/path/change-path-model'
import { moveToastKey } from '#/features/path/set-location-op'
import type { MoveOp, MoveVariables } from '#/features/path/set-location-op'

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

export interface ChangePathScreenProps {
  moveOp: MoveOp
  addPathOp: TrackedOp<AddCommonPathInput, SettingsWriteFailureCode, Settings>
}

const NO_PATHS: ReadonlyArray<CommonPath> = Object.freeze([])

export function ChangePathScreen({ moveOp, addPathOp }: ChangePathScreenProps) {
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
  // Every open starts from the torrent's save path.
  const [openedFor, setOpenedFor] = useState(opened)
  if (openedFor !== opened) {
    setOpenedFor(opened)
    if (opened !== null) {
      setBox(live?.save_path ?? '')
      setKept(live)
    }
  }

  const view = useMemo(
    () =>
      changePathView({
        box,
        savePath: torrent?.save_path ?? '',
        commonPaths,
      }),
    [box, torrent?.save_path, commonPaths],
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

  // Every open: an old failure toast's 重試 must not move without the screen.
  useEffect(() => {
    if (hash !== null) toast.dismissFor(moveToastKey(hash))
  }, [opened, hash])

  const cancel = () => {
    if (sending || pressedRef.current) return
    if (hash !== null) toast.dismissFor(moveToastKey(hash))
    closeChangePath()
  }
  useEscapeLayer(open && desktop, cancel, 'dialog')
  useSheetLayer(open && !desktop, cancel)

  // The torrent left maindata (deleted elsewhere): close, never mid-send.
  const gone = opened !== null && torrents !== undefined && live === null
  useEffect(() => {
    if (!gone || sending) return
    if (hash !== null) toast.dismissFor(moveToastKey(hash))
    closeChangePath()
  }, [gone, sending, hash])

  const send = () => {
    if (sending || pressedRef.current || hash === null || view.moveDisabled) {
      return
    }
    pressedRef.current = true
    setPressed(true)
    const variables: MoveVariables = { hashes: [hash], location: view.target }
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
    void sendOp(addPathOp, client, addCommonPathInput(view.target))
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
      desktopWidthClass="w-[560px]"
    >
      <div className="flex flex-none flex-col gap-2">
        <span id={listLabelId} className="text-meta font-semibold">
          {COMMON_PATHS_HEADER}
        </span>
        <div className="overflow-hidden rounded-card border bg-surface">
          {commonPaths.length > 0 && (
            <PathRadios
              labelId={listLabelId}
              commonPaths={commonPaths}
              selected={view.selected}
              current={view.current}
              desktop={desktop}
              disabled={sending}
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
        </div>
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
            if (event.key !== 'Enter' || event.nativeEvent.isComposing) return
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
  onPick,
}: {
  labelId: string
  commonPaths: ReadonlyArray<CommonPath>
  selected: CommonPath | null
  current: CommonPath | null
  desktop: boolean
  disabled: boolean
  onPick: (common: CommonPath) => void
}) {
  const rowsRef = useRef<Array<HTMLButtonElement | null>>([])
  const selectedIndex = selected === null ? -1 : commonPaths.indexOf(selected)
  const tabStop = selectedIndex === -1 ? 0 : selectedIndex

  const onKeyDown = (
    event: KeyboardEvent<HTMLButtonElement>,
    index: number,
  ) => {
    if (!Object.hasOwn(STEP_KEYS, event.key)) return
    const step = STEP_KEYS[event.key]
    event.preventDefault()
    const next = (index + step + commonPaths.length) % commonPaths.length
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
        return (
          <li
            key={`${index}:${common.path}`}
            className={cn(index > 0 && 'border-t')}
          >
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
              data-selected={checked || undefined}
              onClick={() => {
                if (!disabled) onPick(common)
              }}
              onKeyDown={(event) => {
                if (!disabled) onKeyDown(event, index)
              }}
              className={cn(
                'flex w-full items-center gap-3 px-3 text-left text-text',
                desktop ? 'min-h-[52px] py-[7px]' : 'min-h-14 py-2',
                checked ? 'bg-selection-row' : 'hover-row',
              )}
            >
              <Radio checked={checked} />
              <span className="flex min-w-0 flex-1 flex-col gap-px">
                <span
                  data-path-name=""
                  className={cn(
                    'block truncate leading-[1.4] font-semibold',
                    desktop ? 'text-[13px]' : 'text-[15px]',
                  )}
                >
                  {common.name}
                </span>
                <span
                  title={common.path}
                  className="block truncate font-mono text-path text-text-muted"
                >
                  {common.path}
                </span>
              </span>
              {(common.mediaLibrary || common === current) && (
                <span className="flex flex-none items-center gap-1.5">
                  {common.mediaLibrary && (
                    <LocationTag
                      label={MEDIA_LIBRARY_TAG}
                      mediaLibrary
                      mediaLibraryNote={false}
                      className="rounded-full px-2 py-px text-tag whitespace-nowrap"
                    />
                  )}
                  {common === current && (
                    <span
                      data-current-tag=""
                      className="inline-flex items-center rounded-full border px-2 py-px text-tag whitespace-nowrap text-text-muted"
                    >
                      {CURRENT_TAG}
                    </span>
                  )}
                </span>
              )}
            </button>
          </li>
        )
      })}
    </ul>
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
