import { guard, input, serverPost } from '#/server/functions/_define'
import { HASH_LIST_BODY_LIMIT } from '#/server/gate/body-limit'
import { getQbitClient } from '#/server/qbit'
import { ok } from '#/shared/errors'
import {
  allOk,
  torrentHashesInputSchema,
  uniqueHashes,
} from '#/shared/torrent-ops'

// Story 2.6 (AD-5, AD-12, AD-14): stop torrents. qBittorrent 5.1.4's
// `torrents/stop` answers 200 whatever happened, so a 2xx counts every input
// hash as ok and the next maindata shows the effect (AD-7).
export const stopTorrents = serverPost
  .validator(input(torrentHashesInputSchema))
  .handler(
    guard(
      { name: 'stopTorrents', bodyLimit: HASH_LIST_BODY_LIMIT },
      async ({ input: values }) => {
        await getQbitClient().stopTorrents(uniqueHashes(values.hashes))
        return ok(allOk(values.hashes))
      },
    ),
  )
