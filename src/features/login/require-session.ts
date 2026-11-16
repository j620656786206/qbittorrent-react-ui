import { redirect } from '@tanstack/react-router'
import { isAppError, isLoginStopCode } from '#/lib/app-error'
import type { LoginRequired } from '#/state/login-required'

// Spec 1.4 rows G1 to G4: the `_authed` layout's beforeLoad. Start's auth
// guide pattern: redirect to /login with the page to come back to.
// https://tanstack.com/start/latest/docs/framework/react/guide/authentication

export interface RequireSessionArgs {
  /** The `beforeLoad` location; `href` is pathname + search + hash. */
  location: { href: string }
  /** `loginStore.state.loginRequired` at the time of the check. */
  loginRequired: LoginRequired | null
  fetchSession: () => Promise<unknown>
}

export async function requireSession({
  location,
  loginRequired,
  fetchSession,
}: RequireSessionArgs): Promise<void> {
  if (loginRequired) {
    throw redirect({
      to: '/login',
      search: { redirect: loginRequired.returnTo },
    })
  }
  try {
    await fetchSession()
  } catch (error) {
    if (isAppError(error) && isLoginStopCode(error.code)) {
      throw redirect({ to: '/login', search: { redirect: location.href } })
    }
    // Connection codes (and anything else) let the page render: story 1.7
    // shows the alert from query state.
  }
}
