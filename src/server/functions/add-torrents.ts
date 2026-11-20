import { ADD_DEADLINE_MS, sendEntries } from '#/server/functions/_add-entries'
import { formInput, guard, serverPost } from '#/server/functions/_define'
import { UPLOAD_BODY_LIMIT } from '#/server/gate/body-limit'
import { getQbitClient } from '#/server/qbit'
import type { AddTorrentEntry } from '#/server/qbit'
import { getSyncer } from '#/server/sync'
import { fail, ok } from '#/shared/errors'
import { addTorrentsFormSchema } from '#/shared/torrent-add'
import type { BatchResult } from '#/shared/torrent-ops'

// Story 4.7 (AD-5, AD-12, AR-54): add magnet links and .torrent files to one
// category. The form (formInput, addTorrentsFormSchema) is 1 to 20 entries
// and a category, at most 50 MB (the gate counts it as it is read, the
// factory checks this function's own limit). Here: the category must be
// one qBittorrent has (the sync table), and every file must start as a
// bencode dictionary; either failing is `invalid_input` before anything is
// sent. Then the entries go to qBittorrent one at a time, magnets first,
// in input order (`addTorrent`: never `savepath`, `cookie` or a URL fetched
// here), and the answer has one item per entry, keyed by its index in
// `[...magnets, ...files]`.
//
// A whole-request error only when nothing was done: validation, the
// session, a failed category read, the deadline passing before the first
// entry, or any failure but qBittorrent's refusal of that entry
// (unreachable, login refused, a proxy error, the re-login cooldown, an
// unreadable answer) before any entry was added. Once something was added,
// such a failure stops the sending and it and every entry after it are
// failed items with that code. An entry qBittorrent refuses (`AddRefused`:
// 415, `Fails.`, JSON with nothing added) is a `qbit_rejected` item and the
// next one is still sent. Entries share a deadline under the factory's
// 30 s, so the answer always carries what was added: an entry still waiting
// at the deadline, and the entries after it, are `timeout` items
// (qBittorrent may still add the waiting one; the next maindata tells).

/** `d`: a bencode dictionary, which every .torrent file is. */
const BENCODE_DICT = 0x64

function fileName(file: Blob): string {
  return file instanceof File && file.name !== '' ? file.name : 'upload.torrent'
}

export const addTorrents = serverPost
  .validator(formInput(addTorrentsFormSchema))
  .handler(
    guard(
      { name: 'addTorrents', bodyLimit: UPLOAD_BODY_LIMIT },
      async ({ input: values }) => {
        const started = performance.now()
        const left = () => ADD_DEADLINE_MS - (performance.now() - started)

        const categories = await getSyncer().readCategoryNames()
        if (!categories.includes(values.category)) return fail('invalid_input')
        const entries: Array<AddTorrentEntry> = values.magnets.map((url) => ({
          kind: 'magnet',
          url,
        }))
        for (const file of values.files) {
          const bytes = new Uint8Array(await file.arrayBuffer())
          if (bytes[0] !== BENCODE_DICT) return fail('invalid_input')
          entries.push({ kind: 'file', bytes, name: fileName(file) })
        }
        if (left() <= 0) return fail('timeout')

        const items = await sendEntries(
          getQbitClient(),
          entries,
          values.category,
          left,
        )
        const result: BatchResult = { items }
        return ok(result)
      },
    ),
  )
