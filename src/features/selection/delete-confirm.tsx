import { useEffect, useMemo, useRef, useState } from 'react'
import { ChevronDown } from 'lucide-react'
import { useQueryClient } from '@tanstack/react-query'
import { useVirtualizer } from '@tanstack/react-virtual'
import {
  DELETE_PREVIEW_ROWS,
  DELETE_SENDING_TEXT,
  GONE_WORDS,
  deleteButtonText,
  deleteGoneNotes,
  deleteMoreText,
  deleteRows,
  deleteSuccessText,
  deleteSummary,
  deleteTitle,
} from '#/lib/delete-confirm'
import type { DeleteRow, DeleteSummary } from '#/lib/delete-confirm'
import { OPERATION_FAILURE_CODES, deleteFailureText } from '#/lib/error-text'
import { formatSize } from '#/lib/format'
import { toast } from '#/lib/toast'
import { deleteTorrents } from '#/server/functions/delete-torrents'
import { Checkbox } from '#/shared/ui/checkbox'
import { cn } from '#/shared/ui/cn'
import { ConfirmShell } from '#/shared/ui/confirm-shell'
import { callFn } from '#/state/call-fn'
import {
  refreshMaindata,
  selectStateBeforeMove,
  selectTorrents,
  useMaindata,
} from '#/state/maindata'
import { clearPendingAll, markPendingAll } from '#/state/pending-ops'
import { pruneSelection, useSelectedHashes } from '#/state/selection'
import { useEscapeLayer } from '#/state/shortcuts'
import { sendOp, useOpsInFlight } from '#/state/tracked-op'
import type { TrackedOp } from '#/state/tracked-op'

// Story 4.3 (DESIGN and EXPERIENCE delete-confirm, mockups S07-delete-*):
// the delete confirmation, opened from either selection bar layout, in the
// shared confirm shell (desktop dialog 512px wide, phone sheet). Top to
// bottom: 「刪除 N 個種子？」; the selection in tick order (earliest first,
// never by size) on a `surface-muted` box, 5 rows then 「還有 N 個 ▾」,
// which expands a virtualized list at most 320px tall that scrolls itself;
// one note per gone kind (找不到檔案, 已整理: only the torrent goes); the
// 「連檔案一起刪」 checkbox, ticked on every open; the delete button, whose
// text says what goes (src/lib/delete-confirm.ts). While it is open the
// list, the count and the size follow the selection (already pruned when
// maindata changes); it closes itself when nothing is left, but never in
// the middle of its own delete (a poll can show the torrents gone before
// the answer). It counts as sending only while a delete about its hashes
// is in flight, so a 重試 for other torrents never locks it.
//
// Pressing delete sends one `deleteTorrents` through `sendOp` (the failure
// toast with 重試 resends the same hashes and `deleteFiles`): the hashes go
// into `pendingOps` on send. On success the sent hashes leave the
// selection (a late 重試 never touches a newer selection), so the dialog
// closes once its delete ended and the bar slides out; a plain 4 s toast says what went
// (no undo) and maindata refreshes; local data is never edited. On a
// failure the dialog stays open as it was; connection codes go only to the
// global handler and the button can be pressed again. No partial failure:
// qBittorrent answers for the whole batch.

/** A row's fixed height: 8px padding around the 13px/1.4 line. */
const ROW_HEIGHT = 34

/** The expanded list's most height. */
const EXPANDED_MAX = 320

interface DeleteVariables {
  hashes: ReadonlyArray<string>
  deleteFiles: boolean
  /** The success toast, worked out when sent (the rows go after). */
  successText: string
}

export const deleteOp: TrackedOp<DeleteVariables> = {
  name: 'delete-torrents',
  call: ({ hashes, deleteFiles }) =>
    callFn(deleteTorrents, { hashes: [...hashes], deleteFiles }),
  keysOf: ({ hashes }) => hashes,
  failureCodes: OPERATION_FAILURE_CODES,
  failureText: (_variables, code) => deleteFailureText(code),
  onSend: ({ hashes }) => markPendingAll(hashes, 'delete'),
  onSuccess: (client, { hashes, successText }) => {
    const sent = new Set(hashes)
    pruneSelection((hash) => !sent.has(hash))
    toast.plain(successText)
    void refreshMaindata(client)
  },
  onFailure: ({ hashes }) => clearPendingAll(hashes),
}

const ROW_CLASS = 'flex h-[34px] items-center gap-3 px-3 py-2'

function Row({ row }: { row: DeleteRow }) {
  return (
    <>
      <span
        title={row.name}
        className="min-w-0 flex-1 truncate text-row-name font-semibold"
      >
        {row.name}
      </span>
      {row.gone ? (
        <span className="flex-none text-[12px] whitespace-nowrap text-text-muted">
          {GONE_WORDS[row.gone]}
        </span>
      ) : (
        <span className="flex-none text-[13px] whitespace-nowrap tabular-nums">
          {formatSize(row.size)}
        </span>
      )}
    </>
  )
}

const LIST_BOX_CLASS = 'm-0 list-none rounded-card bg-surface-muted p-1'

/**
 * Every row, virtualized, in a box at most 320px tall that scrolls itself.
 * It takes focus when it replaces 「還有 N 個」 (that button is gone).
 */
function ExpandedList({ rows }: { rows: ReadonlyArray<DeleteRow> }) {
  const scrollRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    scrollRef.current?.focus({ preventScroll: true })
  }, [])
  const virtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => ROW_HEIGHT,
    getItemKey: (index) => rows[index].hash,
    overscan: 8,
    // React 19 warns about flushSync inside lifecycle methods.
    useFlushSync: false,
  })
  return (
    <div
      ref={scrollRef}
      tabIndex={0}
      role="group"
      aria-label="要刪的種子，可捲動"
      data-slot="delete-list-scroll"
      className={cn(
        'flex-none overflow-y-auto overscroll-contain',
        LIST_BOX_CLASS,
      )}
      style={{ maxHeight: EXPANDED_MAX }}
    >
      <ul
        aria-label="要刪的種子"
        className="relative m-0 list-none p-0"
        style={{ height: virtualizer.getTotalSize() }}
      >
        {virtualizer.getVirtualItems().map((item) => (
          <li
            key={item.key}
            aria-setsize={rows.length}
            aria-posinset={item.index + 1}
            data-delete-row=""
            className={cn(ROW_CLASS, 'absolute inset-x-0 top-0')}
            style={{ transform: `translateY(${item.start}px)` }}
          >
            <Row row={rows[item.index]} />
          </li>
        ))}
      </ul>
    </div>
  )
}

const EMPTY_VIEW: {
  rows: ReadonlyArray<DeleteRow>
  summary: DeleteSummary
} = {
  rows: [],
  summary: { count: 0, bytes: 0, missing: 0, archived: 0 },
}

const EMPTY_SET: ReadonlySet<string> = new Set()

export interface DeleteConfirmProps {
  open: boolean
  desktop: boolean
  /** Any close path; nothing is deleted and the selection stays. */
  onClose: () => void
  /** Focused on close (the bar's 刪除（含檔案）). */
  returnFocus: () => HTMLElement | null
}

export function DeleteConfirm({
  open,
  desktop,
  onClose,
  returnFocus,
}: DeleteConfirmProps) {
  const client = useQueryClient()
  const hashes = useSelectedHashes()
  const { data: torrents } = useMaindata(selectTorrents)
  const { data: stateBeforeMove } = useMaindata(selectStateBeforeMove)
  // Worked out only while open (it stays mounted for every maindata poll).
  const live = useMemo(
    () =>
      open
        ? {
            rows: deleteRows(torrents ?? {}, hashes, stateBeforeMove ?? {}),
            summary: deleteSummary(
              torrents ?? {},
              hashes,
              stateBeforeMove ?? {},
            ),
          }
        : null,
    [open, torrents, hashes, stateBeforeMove],
  )
  // The last rows shown, kept while the sheet slides out after a delete
  // (the selection empties first) and while a list that emptied closes.
  const hasRows = live !== null && live.rows.length > 0
  const [kept, setKept] = useState(live ?? EMPTY_VIEW)
  if (hasRows && kept !== live) setKept(live)
  const { rows, summary } = hasRows ? live : kept
  /** What a press sends: only torrents maindata still has. */
  const sendable = live?.rows ?? EMPTY_VIEW.rows

  const [deleteFiles, setDeleteFiles] = useState(true)
  const [expanded, setExpanded] = useState(false)
  /** The hashes this dialog sent, until it opens again. */
  const [sentHashes, setSentHashes] = useState<ReadonlySet<string>>(EMPTY_SET)
  // Every open starts ticked and folded.
  const [wasOpen, setWasOpen] = useState(open)
  if (wasOpen !== open) {
    setWasOpen(open)
    if (open) {
      setDeleteFiles(true)
      setExpanded(false)
      setSentHashes(EMPTY_SET)
      // Never a list from an earlier open.
      setKept(live ?? EMPTY_VIEW)
    }
  }

  const inFlight = useOpsInFlight(deleteOp)
  const sending = useMemo(() => {
    if (inFlight.length === 0) return false
    const mine = new Set([...sentHashes, ...hashes])
    return inFlight.some((variables) =>
      variables.hashes.some((hash) => mine.has(hash)),
    )
  }, [inFlight, sentHashes, hashes])
  useEscapeLayer(
    open,
    () => {
      if (!sending) onClose()
    },
    'dialog',
  )

  // Nothing left selected (another device, or this delete went through):
  // close, but only once this dialog's own delete has ended.
  const empty = hashes.length === 0
  useEffect(() => {
    if (open && empty && !sending) onClose()
  }, [open, empty, sending, onClose])

  // Blocks a second press before the in-flight state shows (a double click
  // or a key repeat in the same tick); cleared when that call settles.
  const pressedRef = useRef(false)
  const send = () => {
    if (pressedRef.current || sendable.length === 0) return
    pressedRef.current = true
    const settle = () => {
      pressedRef.current = false
    }
    const variables = {
      hashes: sendable.map((row) => row.hash),
      deleteFiles,
      successText: deleteSuccessText(summary, deleteFiles),
    }
    setSentHashes(new Set(variables.hashes))
    sendOp(
      {
        ...deleteOp,
        onSuccess: async (...args) => {
          settle()
          await deleteOp.onSuccess?.(...args)
        },
        onFailure: (sent) => {
          settle()
          deleteOp.onFailure?.(sent)
        },
      },
      client,
      variables,
    )
  }

  // The list shrank to 5 or fewer while expanded: fold it, and if the
  // scroller had focus, give it to the list instead of the page.
  const previewRef = useRef<HTMLUListElement>(null)
  const [refocus, setRefocus] = useState(false)
  const foldNow = expanded && deleteMoreText(rows.length) === null
  if (foldNow) {
    setExpanded(false)
    setRefocus(true)
  }
  useEffect(() => {
    if (!refocus) return
    setRefocus(false)
    const active = document.activeElement
    if (active === null || active === document.body) {
      previewRef.current?.focus({ preventScroll: true })
    }
  }, [refocus])

  const more = deleteMoreText(rows.length)
  const notes = deleteGoneNotes(summary)

  return (
    <ConfirmShell
      open={open}
      desktop={desktop}
      role="alertdialog"
      title={deleteTitle(summary.count)}
      primaryLabel={deleteButtonText(summary, deleteFiles)}
      sendingLabel={DELETE_SENDING_TEXT}
      primaryTone="delete"
      closeLabel="關閉，不刪"
      onPrimary={send}
      primaryDisabled={sendable.length === 0}
      sending={sending}
      onCancel={onClose}
      returnFocus={returnFocus}
      desktopWidthClass="w-[512px]"
    >
      {expanded && more !== null ? (
        <ExpandedList rows={rows} />
      ) : (
        <ul
          ref={previewRef}
          tabIndex={-1}
          aria-label="要刪的種子"
          className={cn('flex-none', LIST_BOX_CLASS)}
        >
          {rows.slice(0, DELETE_PREVIEW_ROWS).map((row) => (
            <li key={row.hash} data-delete-row="" className={ROW_CLASS}>
              <Row row={row} />
            </li>
          ))}
          {more !== null && (
            <li>
              <button
                type="button"
                aria-expanded={false}
                onClick={() => setExpanded(true)}
                className="inline-flex h-9 items-center gap-1 rounded-full px-3 font-semibold text-text hover-row"
              >
                {more}
                <ChevronDown size={14} strokeWidth={2.4} aria-hidden="true" />
              </button>
            </li>
          )}
        </ul>
      )}
      {notes.map((note) => (
        <p key={note} className="m-0 text-meta text-text-muted">
          {note}
        </p>
      ))}
      <label
        className={cn(
          'inline-flex flex-none items-center gap-2.5 self-start',
          desktop ? 'min-h-7 text-[13px]' : 'min-h-11 text-[15px]',
        )}
      >
        <Checkbox
          checked={deleteFiles}
          disabled={sending}
          onCheckedChange={(next) => setDeleteFiles(next === true)}
        />
        連檔案一起刪
      </label>
    </ConfirmShell>
  )
}
