import { z } from '#/shared/zod'

// AD-3 / AR-21: the login form's input. 1024 characters per field is far
// above any real credential and keeps the hash work bounded.
export const loginInputSchema = z.object({
  username: z.string().max(1024),
  password: z.string().max(1024),
  remember: z.boolean(),
})

export type LoginInput = z.infer<typeof loginInputSchema>

// AD-13: `/login?redirect=<same-site path>`. A malformed value is dropped
// here; `safeReturnTo` decides whether a string is safe to follow.
export const loginSearchSchema = z.object({
  redirect: z.string().optional().catch(undefined),
})

export type LoginSearch = z.infer<typeof loginSearchSchema>
