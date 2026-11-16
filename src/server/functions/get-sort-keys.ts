import { guard, input, serverGet } from '#/server/functions/_define'
import { getSyncer } from '#/server/sync'
import { ok } from '#/shared/errors'
import { getSortKeysInputSchema } from '#/shared/sort-keys'

// AD-6 (2026-11-16, Alex), story 2.1: the values of one extra sort (a field
// the slim table does not carry), by hash. Everything when `since` is
// missing or unknown, otherwise only torrents whose extras changed after it.
// Pulls through the same container table as getMaindata. Never the tracker
// URL or the magnet link: the container does not keep them.
export const getSortKeys = serverGet
  .validator(input(getSortKeysInputSchema))
  .handler(
    guard({ name: 'getSortKeys' }, async ({ input: values }) =>
      ok(await getSyncer().readSortKeys(values.field, values.since)),
    ),
  )
