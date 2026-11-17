import { useRef, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { pauseActionFailureText } from '#/lib/error-text'
import {
  PAUSE_ACTION_WORDS,
  pauseActionFlips,
  pauseActionOf,
} from '#/lib/torrent-status'
import type { PauseAction } from '#/lib/torrent-status'
import { startTorrents } from '#/server/functions/start-torrents'
import { stopTorrents } from '#/server/functions/stop-torrents'
import type { SlimTorrent } from '#/shared/maindata'
import { cn } from '#/shared/ui/cn'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '#/shared/ui/dropdown-menu'
import { callFn } from '#/state/call-fn'
import {
  refreshMaindata,
  selectStateBeforeMove,
  useMaindata,
} from '#/state/maindata'
import { clearPending, markPending, usePendingOp } from '#/state/pending-ops'
import { sendOp, useOpsInFlight } from '#/state/tracked-op'
import type { TrackedOp } from '#/state/tracked-op'

// Story 2.6 (EXPERIENCE detail-header 「⋯」, 暫停／繼續): the detail
// header's 「⋯」 opens a menu with exactly one item, 「繼續」 for a torrent
// that reads 已暫停 or 已完成, else 「暫停」 (`pauseActionOf`). Pressing it
// sends `stopTorrents` or `startTorrents` for that one hash through
// `sendOp` (src/state/tracked-op.ts: the failure toast with 「重試」, a new
// op closing the old toast):
// - on success no toast and no local change: one `refreshMaindata()`, and
//   the item stays disabled (`pendingOps`) until qBittorrent shows it (the
//   item's word flips), the torrent goes, or 30 s pass. For a torrent whose
//   word cannot flip (`pauseActionFlips`: an error or missing files keep
//   their state code after a stop) the item comes back once that refresh
//   arrived;
// - any failure clears the pending mark.
// While a call for the shown hash is in flight the item stays disabled too
// (a call can outlive the 30 s mark).
// The menu is Radix's non-modal DropdownMenu
// (https://www.radix-ui.com/primitives/docs/components/dropdown-menu). In
// the phone sheet its content portals into the sheet (Portal `container`):
// portaled to `body` it would be outside the sheet's focus trap, which pulls
// focus back and closes it. Esc with the menu open is Radix's (it prevents
// the default), so the shortcut registry leaves the panel or sheet open.

/** The ops this menu sends; pendingOps judges only these for it. */
const PAUSE_ACTIONS: ReadonlyArray<PauseAction> = ['stop', 'start']

interface OpVariables {
  hash: string
  op: PauseAction
  /** qBittorrent shows the op by flipping the item's word. */
  flips: boolean
}

const pauseOp: TrackedOp<OpVariables> = {
  name: 'pause-resume',
  call: ({ hash, op }) => {
    const input = { hashes: [hash] }
    return op === 'stop'
      ? callFn(stopTorrents, input)
      : callFn(startTorrents, input)
  },
  keysOf: ({ hash }) => [hash],
  failureText: ({ op }, code) => pauseActionFailureText(op, code),
  onSend: ({ hash, op }) => markPending(hash, op),
  onSuccess: async (client, { hash, flips }) => {
    if (flips) {
      void refreshMaindata(client)
      return
    }
    await refreshMaindata(client)
    clearPending(hash)
  },
  onFailure: ({ hash }) => clearPending(hash),
}

export function MoreMenu({
  torrent,
  phone,
}: {
  torrent: SlimTorrent
  phone: boolean
}) {
  const client = useQueryClient()
  const { data: stateBeforeMove } = useMaindata(selectStateBeforeMove)
  const action = pauseActionOf(torrent, stateBeforeMove ?? {})
  const flips = pauseActionFlips(torrent, stateBeforeMove ?? {})
  const pending = usePendingOp(torrent.hash, action, PAUSE_ACTIONS)
  const inFlight = useOpsInFlight(pauseOp).some(
    (variables) => variables.hash === torrent.hash,
  )

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

  return (
    <DropdownMenu open={open} onOpenChange={onOpenChange}>
      <DropdownMenuTrigger asChild>
        <button
          ref={triggerRef}
          type="button"
          aria-label="更多動作"
          className={cn(
            'inline-flex flex-none items-center justify-center rounded-full border bg-surface text-text hover-outline',
            phone ? 'size-11' : 'size-9',
          )}
        >
          {/* The mockup's three filled dots. */}
          <svg
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="currentColor"
            aria-hidden="true"
          >
            <circle cx="5" cy="12" r="1.8" />
            <circle cx="12" cy="12" r="1.8" />
            <circle cx="19" cy="12" r="1.8" />
          </svg>
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        container={container ?? undefined}
        align="end"
        className="min-w-36"
      >
        <DropdownMenuItem
          disabled={pending !== null || inFlight}
          onSelect={() =>
            sendOp(pauseOp, client, { hash: torrent.hash, op: action, flips })
          }
          className={cn('font-semibold', phone && 'h-11')}
        >
          {PAUSE_ACTION_WORDS[action]}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
