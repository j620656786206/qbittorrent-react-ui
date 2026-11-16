import { guard, input, serverGet } from '#/server/functions/_define'
import { getSyncer } from '#/server/sync'
import { ok } from '#/shared/errors'
import { getMaindataInputSchema } from '#/shared/maindata'

// AD-6 / AR-24 / AR-38: the torrent list, header speeds and categories.
// Pulls from qBittorrent through the container's table and answers only what
// changed since the client's `since`.
export const getMaindata = serverGet
  .validator(input(getMaindataInputSchema))
  .handler(
    guard({ name: 'getMaindata' }, async ({ input: values }) =>
      ok(await getSyncer().read(values?.since)),
    ),
  )
