import { z } from 'zod'
import { guard, input, serverGet } from '#/server/functions/_define'
import { fail, ok } from '#/shared/errors'

const noInput = z.undefined()

// The `_authed` layout asks this before showing any page. `guard()` already
// answers not_logged_in without a valid `rt_session`.
export const getSession = serverGet
  .validator(input(noInput))
  .handler(
    guard({ input: noInput, name: 'getSession' }, async ({ session }) =>
      session ? ok({ exp: session.exp }) : fail('not_logged_in'),
    ),
  )
