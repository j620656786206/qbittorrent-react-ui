import { z } from 'zod'
import { guard, input, serverPost } from '#/server/functions/_define'
import { ok } from '#/shared/errors'

// Test-only: the one name allowed to be public, and one that must be caught.
const loginInput = z.object({ username: z.string(), password: z.string() })

export const login = serverPost
  .validator(input(loginInput))
  .handler(guard({ input: loginInput, auth: 'public' }, async () => ok(null)))

export const publicLeak = serverPost
  .validator(input(loginInput))
  .handler(guard({ input: loginInput, auth: 'public' }, async () => ok(null)))
