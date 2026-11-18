import { guard, input, serverGet } from '#/server/functions/_define'
import { getSettingsStore } from '#/server/settings'
import { ok } from '#/shared/errors'
import { getSettingsInputSchema } from '#/shared/settings'

// AD-8, story 3.1: the whole settings file (src/shared/settings.ts). A
// read: its only writes are the store's documented first-read repair
// (create a missing file, keep a broken one aside, write back a repaired
// one). An unusable file answers the defaults.
export const getSettings = serverGet
  .validator(input(getSettingsInputSchema))
  .handler(
    guard({ name: 'getSettings' }, async () =>
      ok(await getSettingsStore().read()),
    ),
  )
