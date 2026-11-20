import { guard, input, serverPost } from '#/server/functions/_define'
import { getSettingsStore } from '#/server/settings'
import { isUnderSaveRoot } from '#/server/settings/save-roots'
import { fail, ok } from '#/shared/errors'
import { normalizeSavePath } from '#/shared/save-path'
import { MAX_COMMON_PATHS, addCommonPathInputSchema } from '#/shared/settings'

// AD-8, story 5.2: add one common path. Its identity is the normalized path:
// a path already listed (with or without a trailing slash) succeeds and
// leaves the stored entry as it was, so the call is idempotent. A new path
// when 50 are stored is `invalid_input`; so is one outside `SAVE_ROOTS`.
// Answers the whole new settings for `['settings']`; a failed write
// (the store logs why) answers `settings_write_failed`.
export const addCommonPath = serverPost
  .validator(input(addCommonPathInputSchema))
  .handler(
    guard({ name: 'addCommonPath' }, async ({ input: values }) => {
      if (!isUnderSaveRoot(values.path)) return fail('invalid_input')
      // Set inside the store's change: the list is full, nothing written.
      const outcome = { full: false }
      const written = await getSettingsStore().update((current) => {
        const listed = current.commonPaths.some(
          (entry) => normalizeSavePath(entry.path) === values.path,
        )
        if (listed) return current
        if (current.commonPaths.length >= MAX_COMMON_PATHS) {
          outcome.full = true
          return current
        }
        return {
          ...current,
          commonPaths: [
            ...current.commonPaths,
            {
              path: values.path,
              name: values.name,
              mediaLibrary: values.mediaLibrary,
            },
          ],
        }
      })
      if (outcome.full) return fail('invalid_input')
      return written.ok ? ok(written.settings) : fail('settings_write_failed')
    }),
  )
