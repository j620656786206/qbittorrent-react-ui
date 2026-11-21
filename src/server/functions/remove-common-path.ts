import { guard, input, serverPost } from '#/server/functions/_define'
import { getSettingsStore } from '#/server/settings'
import { fail, ok } from '#/shared/errors'
import { normalizeSavePath } from '#/shared/save-path'
import { removeCommonPathInputSchema } from '#/shared/settings'

// AD-8, story 5.4: take one path off the common paths (the first entry
// whose normalized path is the input's). Only the shortcut goes: no file
// and no qBittorrent call. A path not listed succeeds unchanged
// (idempotent). The change runs inside the store's lock on the file as it
// is now. Answers the whole new settings for `['settings']`; a failed
// write (the store logs why) answers `settings_write_failed`.
export const removeCommonPath = serverPost
  .validator(input(removeCommonPathInputSchema))
  .handler(
    guard({ name: 'removeCommonPath' }, async ({ input: values }) => {
      const written = await getSettingsStore().update((current) => {
        const index = current.commonPaths.findIndex(
          (entry) => normalizeSavePath(entry.path) === values.path,
        )
        if (index === -1) return current
        return {
          ...current,
          commonPaths: current.commonPaths.filter((_, at) => at !== index),
        }
      })
      return written.ok ? ok(written.settings) : fail('settings_write_failed')
    }),
  )
