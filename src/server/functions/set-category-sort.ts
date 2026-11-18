import { guard, input, serverPost } from '#/server/functions/_define'
import { getSettingsStore } from '#/server/settings'
import { fail, ok } from '#/shared/errors'
import { setCategorySortInputSchema } from '#/shared/settings'

// AD-8, story 3.1: remember one category's sort (`ALL` for 「全部」). Only
// a manual pick calls it. Idempotent (the same input twice leaves the same
// file); answers the whole new settings, which the browser writes into
// `['settings']`. A write the store refused or that failed (newer file
// version, over 256 KB, a disk error; the store logs which) answers
// `settings_write_failed`.
export const setCategorySort = serverPost
  .validator(input(setCategorySortInputSchema))
  .handler(
    guard({ name: 'setCategorySort' }, async ({ input: values }) => {
      const written = await getSettingsStore().update((current) => ({
        ...current,
        categorySort: Object.fromEntries([
          ...Object.entries(current.categorySort),
          [values.category, { sort: values.sort, dir: values.dir }],
        ]),
      }))
      return written.ok ? ok(written.settings) : fail('settings_write_failed')
    }),
  )
