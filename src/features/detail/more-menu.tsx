import { useRef, useState } from 'react'
import {
  MutationObserver,
  useMutation,
  useQueryClient,
} from '@tanstack/react-query'
import type { QueryClient } from '@tanstack/react-query'
import { isAppError } from '#/lib/app-error'
import {
  isOperationFailureCode,
  pauseActionFailureText,
} from '#/lib/error-text'
import { toast } from '#/lib/toast'
import { PAUSE_ACTION_WORDS, pauseActionOf } from '#/lib/torrent-status'
import type { PauseAction } from '#/lib/torrent-status'
import { startTorrents } from '#/server/functions/start-torrents'
import { stopTorrents } from '#/server/functions/stop-torrents'
import type { SlimTorrent } from '#/shared/maindata'
import type { BatchResult } from '#/shared/torrent-ops'
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

// Story 2.6 (EXPERIENCE detail-header 「⋯」, 暫停／繼續): the detail
// header's 「⋯」 opens a menu with exactly one item, 「繼續」 for a torrent
// that reads 已暫停 or 已完成, else 「暫停」 (`pauseActionOf`). Pressing it
// sends `stopTorrents` or `startTorrents` for that one hash:
// - on success no toast and no local change: one `refreshMaindata()`, and
//   the item stays disabled (`pendingOps`) until qBittorrent shows it (the
//   item's word flips), the torrent goes, or 30 s pass;
// - on `qbit_rejected`, `timeout` or `invalid_input` a failure toast with
//   「重試」, which sends the same op for the same hash again;
// - connection codes and `bad_origin` are the global `onError`'s (no toast).
// Any failure clears the pending mark. A new op sent for a hash closes that
// hash's failure toast if it still shows, so its 重試 never resends an op
// Alex has since replaced. While this menu's call for the shown hash is in
// flight the item stays disabled too (a call can outlive the 30 s mark).
// The menu is Radix's non-modal DropdownMenu
// (https://www.radix-ui.com/primitives/docs/components/dropdown-menu). In
// the phone sheet its content portals into the sheet (Portal `container`):
// portaled to `body` it would be outside the sheet's focus trap, which pulls
// focus back and closes it. Esc with the menu open is Radix's (it prevents
// the default), so the shortcut registry leaves the panel or sheet open.
// Mutations: https://tanstack.com/query/v5/docs/framework/react/reference/useMutation
// 重試 drives a MutationObserver directly (query-core 5.107.1: `mutate`
// builds a mutation from the observer's options and returns its promise):
// https://github.com/TanStack/query/blob/@tanstack/query-core@5.107.1/packages/query-core/src/mutationObserver.ts

/** The ops this menu sends; pendingOps judges only these for it. */
const PAUSE_ACTIONS: ReadonlyArray<PauseAction> = ['stop', 'start']

/** Per hash, closes its failure toast if that toast still shows. */
const failureToasts = new Map<string, () => void>()

interface OpVariables {
  hash: string
  op: PauseAction
}

function sendOp({ hash, op }: OpVariables): Promise<BatchResult> {
  const input = { hashes: [hash] }
  return op === 'stop'
    ? callFn(stopTorrents, input)
    : callFn(startTorrents, input)
}

/**
 * The options of one 暫停／繼續 call. Its callbacks live on the mutation, so a
 * 重試 pressed after the detail closed still marks, refreshes and reports.
 */
function torrentOpOptions(client: QueryClient) {
  return {
    mutationFn: sendOp,
    onMutate: ({ hash, op }: OpVariables) => {
      failureToasts.get(hash)?.()
      failureToasts.delete(hash)
      markPending(hash, op)
    },
    onSuccess: () => {
      void refreshMaindata(client)
    },
    onError: (error: Error, variables: OpVariables) => {
      clearPending(variables.hash)
      if (!isAppError(error) || !isOperationFailureCode(error.code)) return
      const { dismiss } = toast.failure(
        pauseActionFailureText(variables.op, error.code),
        { onRetry: () => retryOp(client, variables) },
      )
      failureToasts.set(variables.hash, dismiss)
    },
  }
}

/** 重試: the same op for the same hash, whether or not the menu is mounted. */
function retryOp(client: QueryClient, variables: OpVariables): void {
  const observer = new MutationObserver(client, torrentOpOptions(client))
  // The failure path already ran in onError; nothing else to do here.
  observer.mutate(variables).catch(() => undefined)
}

export function MoreMenu({
  torrent,
  phone,
}: {
  torrent: SlimTorrent
  phone: boolean
}) {
  const client = useQueryClient()
  const { mutate, isPending, variables } = useMutation(torrentOpOptions(client))
  const { data: stateBeforeMove } = useMaindata(selectStateBeforeMove)
  const action = pauseActionOf(torrent, stateBeforeMove ?? {})
  const pending = usePendingOp(torrent.hash, action, PAUSE_ACTIONS)
  const inFlight = isPending && variables.hash === torrent.hash

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
          onSelect={() => mutate({ hash: torrent.hash, op: action })}
          className={cn('font-semibold', phone && 'h-11')}
        >
          {PAUSE_ACTION_WORDS[action]}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
