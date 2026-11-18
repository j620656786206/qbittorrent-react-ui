import { guard, input, serverPost } from '#/server/functions/_define'
import { getSettingsStore } from '#/server/settings'
import { fail, ok } from '#/shared/errors'
import { setCategoryOrderInputSchema } from '#/shared/settings'

// AD-8, story 3.3: the category tab order from the settings page. The
// input is the whole new order (never a move), so the same call twice
// leaves the same file; `ALL`, a name twice or an order over the file's
// 256 KB bound is `invalid_input` (the schema). The write goes through the
// store's locked update and answers the whole new settings, which the
// browser writes into `['settings']`. A write the store refused or that
// failed (newer file version, over 256 KB, a disk error; the store logs
// which) answers `settings_write_failed`.
export const setCategoryOrder = serverPost
  .validator(input(setCategoryOrderInputSchema))
  .handler(
    guard({ name: 'setCategoryOrder' }, async ({ input: values }) => {
      const written = await getSettingsStore().update((current) => ({
        ...current,
        categoryOrder: [...values.order],
      }))
      return written.ok ? ok(written.settings) : fail('settings_write_failed')
    }),
  )
