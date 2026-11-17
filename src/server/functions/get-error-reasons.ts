import { guard, input, serverGet } from '#/server/functions/_define'
import { getErrorReasonReader } from '#/server/sync'
import { getErrorReasonsInputSchema } from '#/shared/error-reasons'
import { ok } from '#/shared/errors'

// Story 2.10: the reason text of each torrent in qBittorrent's `error`
// state, from qBittorrent's log (one named read-only client method,
// `log/main`), read at most once a minute and only while the container
// table has an errored torrent (src/server/sync/error-reasons.ts). A failed
// read answers the AD-9 error; the session and the factory log it without
// any reason text, file or torrent name.
export const getErrorReasons = serverGet
  .validator(input(getErrorReasonsInputSchema))
  .handler(
    guard({ name: 'getErrorReasons' }, async () =>
      ok(await getErrorReasonReader().read()),
    ),
  )
