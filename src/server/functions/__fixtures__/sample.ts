import { z } from 'zod'
import { guard, input, serverGet } from '#/server/functions/_define'
import { ok } from '#/shared/errors'

// Test-only: a gated GET with a zod input and a 1 KB body limit.
const sampleInput = z.object({ since: z.number().int().nonnegative() })

export const getSample = serverGet
  .validator(input(sampleInput))
  .handler(
    guard({ input: sampleInput, bodyLimit: 1024 }, async ({ input: data }) =>
      ok({ since: data.since }),
    ),
  )
