import { ServerFailure } from '#/server/errors/server-failure'
import { SERVER_FN_TIMEOUT_MS } from '#/server/functions/_define'
import { log } from '#/server/log'
import { AddRefused } from '#/server/qbit'
import type { AddTorrentEntry, QbitClient } from '#/server/qbit'
import { fail } from '#/shared/errors'
import type { ErrorCode } from '#/shared/errors'
import type { BatchItem } from '#/shared/torrent-ops'

// Story 4.7: how `addTorrents` sends its checked entries (its header has
// the rules). A separate module because a server function module may
// export nothing but server functions (discover.test.ts).

/** Every entry is answered before the factory's own timeout. */
export const ADD_DEADLINE_MS = SERVER_FN_TIMEOUT_MS - 3000

/** qBittorrent refused this entry (`AddRefused`): the next one is sent. */
const REFUSED = 'refused'

function failedItem(key: string, code: ErrorCode): BatchItem {
  return { key, ok: false, ...fail(code).error }
}

function codeOf(error: unknown): ErrorCode | typeof REFUSED {
  if (error instanceof AddRefused) return REFUSED
  if (error instanceof ServerFailure) return error.code
  // AD-9: a bug never reaches the client as text.
  log.error('server_fn_exception', { fn: 'addTorrents', error })
  return 'qbit_rejected'
}

/** Sends one entry; `null` when qBittorrent took it, else the failure. */
async function addWithin(
  client: QbitClient,
  entry: AddTorrentEntry,
  category: string,
  ms: number,
): Promise<ErrorCode | typeof REFUSED | null> {
  let timer: ReturnType<typeof setTimeout> | undefined
  const late = new Promise<'late'>((resolve) => {
    timer = setTimeout(() => resolve('late'), ms)
  })
  const sent = client.addTorrent(entry, category).then(
    () => null,
    (error: unknown) => codeOf(error),
  )
  try {
    const outcome = await Promise.race([sent, late])
    return outcome === 'late' ? 'timeout' : outcome
  } finally {
    clearTimeout(timer)
  }
}

/**
 * Sends `entries` one at a time, in order, and answers one item per entry
 * keyed by its index. `left` is the time left before `ADD_DEADLINE_MS`.
 * Only qBittorrent refusing an entry (`AddRefused`) fails that entry alone;
 * any other failure (unreachable, login refused, a proxy error, a redirect,
 * the re-login cooldown, an unreadable answer) stops the sending: a
 * `ServerFailure` (the whole request fails) when nothing was added yet,
 * else it and every entry after it are failed items with that code.
 */
export async function sendEntries(
  client: QbitClient,
  entries: ReadonlyArray<AddTorrentEntry>,
  category: string,
  left: () => number,
): Promise<Array<BatchItem>> {
  const items: Array<BatchItem> = []
  let added = 0
  /** Set once the rest can only fail with it (deadline, a stop). */
  let rest: ErrorCode | null = null
  for (const [index, entry] of entries.entries()) {
    const key = String(index)
    const ms = left()
    if (rest === null && ms <= 0) rest = 'timeout'
    if (rest !== null) {
      items.push(failedItem(key, rest))
      continue
    }
    const code = await addWithin(client, entry, category, ms)
    if (code === null) {
      added += 1
      items.push({ key, ok: true })
      continue
    }
    if (code === REFUSED) {
      items.push(failedItem(key, 'qbit_rejected'))
      continue
    }
    // qBittorrent may still add the entry waiting at the deadline.
    if (code !== 'timeout' && added === 0) {
      throw new ServerFailure(code, 'add: no entry sent')
    }
    rest = code
    items.push(failedItem(key, code))
  }
  return items
}
