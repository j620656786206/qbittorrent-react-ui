import { guard, input, serverPost } from '#/server/functions/_define'
import { getQbitClient } from '#/server/qbit'
import { ok } from '#/shared/errors'
import {
  setFilePriorityInputSchema,
  uniqueFileIds,
} from '#/shared/torrent-files'

// Story 2.7 (AD-5, AD-7, AD-12): untick a file (priority 0), tick it (1) or
// pick its priority (1, 6, 7) through qBittorrent 5.1.4's
// `torrents/filePrio`. The ids are deduplicated and joined with `|` here;
// qBittorrent's 400, 404 and 409 are `qbit_rejected`. The answer carries
// nothing: the files tab refetches `['files', hash]` to see the change.
export const setFilePriority = serverPost
  .validator(input(setFilePriorityInputSchema))
  .handler(
    guard({ name: 'setFilePriority' }, async ({ input: values }) => {
      await getQbitClient().setFilePriority(
        values.hash,
        uniqueFileIds(values.ids),
        values.priority,
      )
      return ok(null)
    }),
  )
