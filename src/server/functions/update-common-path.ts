import { guard, input, serverPost } from '#/server/functions/_define'
import { getSettingsStore } from '#/server/settings'
import { fail, ok } from '#/shared/errors'
import { normalizeSavePath } from '#/shared/save-path'
import { updateCommonPathInputSchema } from '#/shared/settings'

// AD-8, story 5.4: rename a common path or tick 「媒體庫」. The entry is the
// first whose normalized path is the input's. A path no longer listed
// (another device removed it) changes nothing and succeeds, so the call is
// idempotent and the answer carries the current list. The change runs
// inside the store's lock on the file as it is now, so edits of different
// paths from two devices both survive. Answers the whole new settings for
// `['settings']`; a failed write (the store logs why) answers
// `settings_write_failed`.
export const updateCommonPath = serverPost
  .validator(input(updateCommonPathInputSchema))
  .handler(
    guard({ name: 'updateCommonPath' }, async ({ input: values }) => {
      const written = await getSettingsStore().update((current) => {
        const index = current.commonPaths.findIndex(
          (entry) => normalizeSavePath(entry.path) === values.path,
        )
        if (index === -1) return current
        const entry = current.commonPaths[index]
        const commonPaths = [...current.commonPaths]
        commonPaths[index] = {
          ...entry,
          ...(values.name === undefined ? {} : { name: values.name }),
          ...(values.mediaLibrary === undefined
            ? {}
            : { mediaLibrary: values.mediaLibrary }),
        }
        return { ...current, commonPaths }
      })
      return written.ok ? ok(written.settings) : fail('settings_write_failed')
    }),
  )
