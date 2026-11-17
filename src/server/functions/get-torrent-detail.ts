import { guard, input, serverGet } from '#/server/functions/_define'
import { getSyncer } from '#/server/sync'
import { ok } from '#/shared/errors'
import { getTorrentDetailInputSchema } from '#/shared/torrent-detail'

// AD-6 detail exception (2026-11-17, Alex), story 2.4: the detail fields the
// slim table does not carry (src/shared/torrent-detail.ts), for the one
// torrent the detail shows. Reads the same container table as getMaindata
// and reuses a pull younger than 6 s (syncer DETAIL_PULL_REUSE_MS).
export const getTorrentDetail = serverGet
  .validator(input(getTorrentDetailInputSchema))
  .handler(
    guard({ name: 'getTorrentDetail' }, async ({ input: values }) =>
      ok(await getSyncer().readTorrentDetail(values.hash)),
    ),
  )
