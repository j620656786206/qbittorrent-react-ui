import { guard, input, serverPost } from '#/server/functions/_define'
import { HASH_LIST_BODY_LIMIT } from '#/server/gate/body-limit'
import { getQbitClient } from '#/server/qbit'
import { ok } from '#/shared/errors'
import {
  allOk,
  deleteTorrentsInputSchema,
  uniqueHashes,
} from '#/shared/torrent-ops'

// Story 4.3 (AD-5, AD-12, AD-14): delete torrents, with or without their
// files. qBittorrent 5.1.4's `torrents/delete` answers 200 whatever
// happened, so a 2xx counts every input hash as ok and the next maindata
// shows the effect (AD-7). Delete is all or nothing: no partial result.
export const deleteTorrents = serverPost
  .validator(input(deleteTorrentsInputSchema))
  .handler(
    guard(
      { name: 'deleteTorrents', bodyLimit: HASH_LIST_BODY_LIMIT },
      async ({ input: values }) => {
        await getQbitClient().deleteTorrents(
          uniqueHashes(values.hashes),
          values.deleteFiles,
        )
        return ok(allOk(values.hashes))
      },
    ),
  )
