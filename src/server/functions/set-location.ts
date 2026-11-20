import { guard, input, serverPost } from '#/server/functions/_define'
import { HASH_LIST_BODY_LIMIT } from '#/server/gate/body-limit'
import { getQbitClient } from '#/server/qbit'
import { isUnderSaveRoot } from '#/server/settings/save-roots'
import { getSyncer } from '#/server/sync'
import { ERROR_MESSAGES, fail, ok } from '#/shared/errors'
import type { ErrorCode } from '#/shared/errors'
import { setLocationInputSchema, uniqueHashes } from '#/shared/torrent-ops'
import type { BatchItem } from '#/shared/torrent-ops'

// Story 5.2 (AD-5, AD-7, AD-12, AD-14): move torrents' files to one save
// path. The path is the shared schema's normalized one and must sit under
// `SAVE_ROOTS`. Each hash is checked against the container's table first: one
// the table does not know is `invalid_input`, one already moving (`movingTo`
// set or qBittorrent's `moving`) is `qbit_rejected`. The rest go to
// qBittorrent in one call; any non-2xx fails the whole call. Only after a
// 2xx does the table record `movingTo` for the sent hashes, so the next
// getMaindata carries the target (AR-43).
export const setLocation = serverPost
  .validator(input(setLocationInputSchema))
  .handler(
    guard(
      { name: 'setLocation', bodyLimit: HASH_LIST_BODY_LIMIT },
      async ({ input: values }) => {
        if (!isUnderSaveRoot(values.location)) return fail('invalid_input')
        const syncer = getSyncer()
        const moving = await syncer.readMoveStates(uniqueHashes(values.hashes))
        const refused = (hash: string): ErrorCode | null => {
          const state = moving.get(hash)
          if (state === undefined) return 'invalid_input'
          return state ? 'qbit_rejected' : null
        }
        const sending = uniqueHashes(values.hashes).filter(
          (hash) => refused(hash) === null,
        )
        if (sending.length > 0) {
          await getQbitClient().setLocation(sending, values.location)
          syncer.markMoving(sending, values.location)
        }
        const items = values.hashes.map((key): BatchItem => {
          const code = refused(key)
          return code === null
            ? { key, ok: true }
            : { key, ok: false, code, message: ERROR_MESSAGES[code] }
        })
        return ok({ items })
      },
    ),
  )
