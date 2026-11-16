import { attemptLogin } from '#/server/auth/login'
import { setSessionCookie } from '#/server/auth/session'
import { guard, input, serverPost } from '#/server/functions/_define'
import { fail, ok } from '#/shared/errors'
import { loginInputSchema } from '#/shared/login'

// AD-2 / AD-3 / AR-22: the only public server function. Checks the form
// against the container's credentials and sets the `rt_session` cookie.
export const login = serverPost.validator(input(loginInputSchema)).handler(
  guard(
    { input: loginInputSchema, auth: 'public', name: 'login' },
    async ({ input: values }) => {
      const result = attemptLogin(values)
      if (!result.ok) return fail(result.code)
      setSessionCookie(result.token, result.maxAge)
      return ok({ exp: result.exp })
    },
  ),
)
