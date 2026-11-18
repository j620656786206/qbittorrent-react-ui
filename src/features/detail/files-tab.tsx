import { memo, useCallback, useLayoutEffect, useRef, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { useVirtualizer } from '@tanstack/react-virtual'
import { ChevronDown } from 'lucide-react'
import {
  fileActionFailureText,
  FILES_LOAD_FAILED,
  OPERATION_FAILURE_CODES,
} from '#/lib/error-text'
import {
  FILE_PRIORITY_CHOICES,
  FILE_PRIORITY_WORDS,
  choicePriority,
  filePriorityLevel,
  isFileWanted,
  tickPriority,
} from '#/lib/file-priority'
import type { FilePriorityLevel } from '#/lib/file-priority'
import { formatPercent, formatSize } from '#/lib/format'
import { heroKindOf } from '#/lib/torrent-status'
import { getFiles } from '#/server/functions/get-files'
import { setFilePriority } from '#/server/functions/set-file-priority'
import type { SlimTorrent } from '#/shared/maindata'
import type {
  FilePriority,
  SetFilePriorityInput,
  TorrentFile,
} from '#/shared/torrent-files'
import {
  CENTER_BLOCK_BUTTON_CLASS,
  CENTER_BLOCK_TEXT_CLASS,
} from '#/shared/ui/center-block'
import { Checkbox } from '#/shared/ui/checkbox'
import { cn } from '#/shared/ui/cn'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from '#/shared/ui/dropdown-menu'
import { Skeleton } from '#/shared/ui/skeleton'
import { callFn } from '#/state/call-fn'
import { selectStateBeforeMove, useMaindata } from '#/state/maindata'
import {
  bindFetchFiles,
  filesKey,
  useTorrentFiles,
} from '#/state/torrent-files'
import { sendOp, useOpsInFlight } from '#/state/tracked-op'
import type { TrackedOp } from '#/state/tracked-op'

// Story 2.7 (EXPERIENCE 檔案分頁, DESIGN 詳情由上到下; mockups
// S04-files-desktop, S05-files-phone): under the sticky header and tabs the
// whole panel is the torrent's file list. `['files', hash]` polls every 5 s
// only while this tab shows (AD-6); a torrent still fetching its metadata
// (hero kind `meta`) is not asked at all. First load: 5 skeleton rows; a
// first load that failed: 「讀不到檔案清單」 and 「重試」; a failed poll keeps
// the list. The list is flat (no folder tree) and virtualised inside the
// panel's scroller (the panel on desktop, the sheet's content on the
// phone): only the rows in view plus 10 above and below exist.
// https://tanstack.com/virtual/latest/docs/api/virtualizer
//
// A row: the checkbox (ticked while the priority is above 0), the path in
// one line (plain text, 「…」, the full path as `title` on desktop), then
// 「<size> · <percent>」 and the priority pill on the right. Unticking sends
// priority 0, ticking 1, the pill's menu 1, 6 or 7 (the current level sends
// nothing); an unticked row's pill reads 不下載 and is disabled. From the
// send until the `['files', hash]` refetch after it settles, that row's
// checkbox and pill are disabled: the call is in flight that long, since
// `onSuccess` awaits the refetch (AD-7, `useOpsInFlight`). Success: no
// toast, no local change, the row follows the refetch. Failures go through
// `sendOp` (src/state/tracked-op.ts): `qbit_rejected`, `timeout`,
// `invalid_input` show a failure toast with 「重試」 resending the same call,
// and a new change to that file closes its toast. The menu is Radix's
// non-modal DropdownMenu
// (https://www.radix-ui.com/primitives/docs/components/dropdown-menu); in
// the phone sheet it portals into the sheet (story 2.6).
// https://tanstack.com/query/v5/docs/reference/QueryClient (invalidateQueries)

const fetchFiles = bindFetchFiles(getFiles)

/** Row box: 8px padding, the 18px name line, 4px gap, the 28px meta line. */
export const FILE_ROW_HEIGHT = 66
const ROW_GAP = 2
const OVERSCAN = 10
const SKELETON_ROWS = 5
const estimateSize = () => FILE_ROW_HEIGHT

const fileOp: TrackedOp<SetFilePriorityInput> = {
  name: 'set-file-priority',
  call: (variables) => callFn(setFilePriority, variables),
  keysOf: ({ hash, ids }) => ids.map((id) => `file:${hash}:${id}`),
  failureCodes: OPERATION_FAILURE_CODES,
  failureText: (_variables, code) => fileActionFailureText(code),
  // Awaited: the call stays in flight (the row locked) until the refetch.
  onSuccess: (client, { hash }) =>
    client.invalidateQueries({ queryKey: filesKey(hash) }),
}

export function FilesTab({
  torrent,
  phone,
}: {
  torrent: SlimTorrent
  phone: boolean
}) {
  const { data: stateBeforeMove } = useMaindata(selectStateBeforeMove)
  if (heroKindOf(torrent, stateBeforeMove ?? {}) === 'meta') {
    return (
      <p className="m-0 py-10 text-center text-body text-text-muted">
        還在抓種子資訊，檔案清單等一下才有
      </p>
    )
  }
  // Keyed: another torrent starts from its own first load.
  return <FileList key={torrent.hash} hash={torrent.hash} phone={phone} />
}

function FileList({ hash, phone }: { hash: string; phone: boolean }) {
  const { data, failed, retry, retrying } = useTorrentFiles(hash, fetchFiles)
  if (data) return <FileRows hash={hash} files={data} phone={phone} />
  if (failed) {
    return (
      <div className="flex flex-col items-center gap-3.5 py-10 text-center">
        <p role="alert" className={CENTER_BLOCK_TEXT_CLASS}>
          {FILES_LOAD_FAILED}
        </p>
        <button
          type="button"
          onClick={retry}
          aria-busy={retrying || undefined}
          className={CENTER_BLOCK_BUTTON_CLASS}
        >
          重試
        </button>
      </div>
    )
  }
  return <FileSkeleton phone={phone} />
}

function FileSkeleton({ phone }: { phone: boolean }) {
  return (
    <div
      role="status"
      aria-busy="true"
      aria-label="檔案清單"
      className={cn('flex flex-col', phone ? '-mx-1' : '-mx-2')}
      style={{ gap: ROW_GAP }}
    >
      {Array.from({ length: SKELETON_ROWS }, (_, index) => (
        <div
          key={index}
          className={cn(
            'flex items-start gap-2.5 py-2',
            phone ? 'px-1' : 'px-2',
          )}
          style={{ height: FILE_ROW_HEIGHT }}
        >
          <Skeleton className="mt-px size-5 rounded-xs" />
          <div className="flex min-w-0 flex-1 flex-col gap-1">
            <Skeleton className="mt-0.5 h-3.5 w-3/4 rounded-full" />
            <div className="flex h-7 items-center justify-between gap-2">
              <Skeleton className="h-3 w-24 rounded-full" />
              <Skeleton className="h-7 w-16 rounded-full" />
            </div>
          </div>
        </div>
      ))}
    </div>
  )
}

/** The scroller the rows live in: the phone sheet's content, else the panel. */
function scrollerFor(list: HTMLElement): HTMLElement | null {
  return (
    list.closest<HTMLElement>('[data-slot="bottom-sheet-content"]') ??
    list.closest<HTMLElement>('[role="tabpanel"]')
  )
}

function FileRows({
  hash,
  files,
  phone,
}: {
  hash: string
  files: ReadonlyArray<TorrentFile>
  phone: boolean
}) {
  const client = useQueryClient()
  const listRef = useRef<HTMLDivElement>(null)
  const [scroller, setScroller] = useState<HTMLElement | null>(null)
  const [scrollMargin, setScrollMargin] = useState(0)

  // Where the rows start inside the scroller; re-measured when it resizes.
  useLayoutEffect(() => {
    const list = listRef.current
    if (!list) return
    const element = scrollerFor(list)
    setScroller(element)
    if (!element) return
    const measure = () => {
      const offset =
        list.getBoundingClientRect().top -
        element.getBoundingClientRect().top +
        element.scrollTop
      setScrollMargin((previous) =>
        Math.abs(previous - offset) < 0.5 ? previous : offset,
      )
    }
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(element)
    return () => observer.disconnect()
  }, [])

  // Files whose call (and the refetch after it) is still running.
  const inFlight = useOpsInFlight(fileOp)
  const busy = new Set(
    inFlight
      .filter((variables) => variables.hash === hash)
      .flatMap((variables) => variables.ids),
  )

  const send = useCallback(
    (index: number, priority: FilePriority) =>
      sendOp(fileOp, client, { hash, ids: [index], priority }),
    [client, hash],
  )

  // Keyed by position (the default): qBittorrent keeps a torrent's file
  // order, and a stable key keeps every poll's new array from re-measuring.
  const virtualizer = useVirtualizer({
    count: files.length,
    getScrollElement: () => scroller,
    estimateSize,
    overscan: OVERSCAN,
    gap: ROW_GAP,
    scrollMargin,
    // React 19 warns about flushSync inside lifecycle methods.
    useFlushSync: false,
  })

  return (
    <div
      ref={listRef}
      role="list"
      aria-label="檔案清單"
      className={cn('relative', phone ? '-mx-1' : '-mx-2')}
      style={{ height: virtualizer.getTotalSize() }}
    >
      {virtualizer.getVirtualItems().map((item) => {
        const file = files[item.index]
        return (
          <div
            key={item.key}
            role="listitem"
            aria-setsize={files.length}
            aria-posinset={item.index + 1}
            className="absolute top-0 left-0 w-full"
            style={{
              height: FILE_ROW_HEIGHT,
              transform: `translateY(${item.start - scrollMargin}px)`,
            }}
          >
            <FileRow
              file={file}
              phone={phone}
              busy={busy.has(file.index)}
              onSend={send}
            />
          </div>
        )
      })}
    </div>
  )
}

const FileRow = memo(function FileRowView({
  file,
  phone,
  busy,
  onSend,
}: {
  file: TorrentFile
  phone: boolean
  busy: boolean
  onSend: (index: number, priority: FilePriority) => void
}) {
  const wanted = isFileWanted(file.priority)
  return (
    <div
      className={cn(
        'flex h-full items-start gap-2.5 rounded-row py-2',
        phone ? 'px-1' : 'px-2',
      )}
    >
      <Checkbox
        checked={wanted}
        disabled={busy}
        aria-label={`下載這個檔案：${file.name}`}
        onCheckedChange={(checked) =>
          onSend(file.index, tickPriority(checked === true))
        }
        className={cn(
          'relative mt-px disabled:cursor-not-allowed disabled:opacity-50',
          // A 44px hit area on the phone around the 20px box.
          phone && "after:absolute after:-inset-3 after:content-['']",
        )}
      />
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <span
          title={phone ? undefined : file.name}
          className={cn(
            'block truncate text-row-name',
            !wanted && 'text-text-muted',
          )}
        >
          {file.name}
        </span>
        <div className="flex h-7 items-center gap-2 text-meta whitespace-nowrap text-text-muted tabular-nums">
          <span className="min-w-0 truncate">
            {formatSize(file.size)} · {formatPercent(file.progress)}
          </span>
          <span className="flex-1" />
          <PriorityMenu
            file={file}
            phone={phone}
            disabled={busy || !wanted}
            onSend={onSend}
          />
        </div>
      </div>
    </div>
  )
})

function PriorityMenu({
  file,
  phone,
  disabled,
  onSend,
}: {
  file: TorrentFile
  phone: boolean
  disabled: boolean
  onSend: (index: number, priority: FilePriority) => void
}) {
  const level = filePriorityLevel(file.priority)
  const word = FILE_PRIORITY_WORDS[level]
  const [open, setOpen] = useState(false)
  const [container, setContainer] = useState<HTMLElement | null>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)

  const onOpenChange = (next: boolean) => {
    if (next) {
      // Inside the bottom sheet: portal there (see the header comment).
      const sheet = triggerRef.current?.closest<HTMLElement>(
        '[data-slot="bottom-sheet"]',
      )
      setContainer(sheet ?? null)
    }
    setOpen(next)
  }

  const choose = (value: string) => {
    const priority = choicePriority(file.priority, value as FilePriorityLevel)
    if (priority !== null) onSend(file.index, priority)
  }

  return (
    <DropdownMenu open={open} onOpenChange={onOpenChange}>
      <DropdownMenuTrigger asChild disabled={disabled}>
        <button
          ref={triggerRef}
          type="button"
          aria-label={`優先順序：${word}，${file.name}`}
          className={cn(
            'group/prio inline-flex flex-none items-center disabled:cursor-not-allowed disabled:opacity-50',
            // Phone: a 44px tall hit area around the 28px pill.
            phone ? '-my-2 -mr-1 h-11 px-1' : 'h-7',
          )}
        >
          <span
            className={cn(
              'inline-flex h-7 items-center gap-0.5 rounded-full border bg-surface pr-1.5 pl-2.5 text-meta whitespace-nowrap group-enabled/prio:group-hover/prio:border-text-faint',
              level === 'skip' ? 'text-text-muted' : 'text-text',
              (level === 'high' || level === 'max') && 'font-bold',
            )}
          >
            {word}
            <ChevronDown size={14} strokeWidth={2.2} aria-hidden="true" />
          </span>
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        container={container ?? undefined}
        align="end"
        className="min-w-32"
      >
        <DropdownMenuRadioGroup value={level} onValueChange={choose}>
          {FILE_PRIORITY_CHOICES.map((choice) => (
            <DropdownMenuRadioItem
              key={choice}
              value={choice}
              className={cn('font-semibold', phone && 'h-11')}
            >
              {FILE_PRIORITY_WORDS[choice]}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
