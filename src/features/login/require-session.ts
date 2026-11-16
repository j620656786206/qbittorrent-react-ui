import { redirect } from '@tanstack/react-router'
import { isAppError, isLoginStopCode } from '#/lib/app-error'
import { clearLoginRequired } from '#/state/login-required'
import type { LoginRequired } from '#/state/login-required'

// Spec 1.4 rows G1 to G4: the `_authed` layout's beforeLoad. Start's auth
// guide pattern: redirect to /login with the page to come back to.
// https://tanstack.com/start/latest/docs/framework/react/guide/authentication

export interface RequireSessionArgs {
  /** The `beforeLoad` location; `href` is pathname + search + hash. */
  location: { href: string }
  /** `loginStore.state.loginRequired` at the time of the check. */
  loginRequired: LoginRequired | null
  /** Asks the server, not the cache, while the store is set (see session-query). */
  fetchSession: () => Promise<unknown>
}

const toLogin = (returnTo: string) =>
  redirect({ to: '/login', search: { redirect: returnTo } })

export async function requireSession({
  location,
  loginRequired,
  fetchSession,
}: RequireSessionArgs): Promise<void> {
  // `getSession` never talks to qBittorrent, so a valid session cannot show
  // the container's qBittorrent password was fixed. Letting the page load
  // would fail again and loop back here; the login screen shows the reason.
  if (loginRequired?.reason === 'qbit_auth_failed') {
    throw toLogin(loginRequired.returnTo)
  }
  try {
    await fetchSession()
  } catch (error) {
    if (loginRequired) throw toLogin(loginRequired.returnTo)
    if (isAppError(error) && isLoginStopCode(error.code)) {
      throw toLogin(location.href)
    }
    // Connection codes (and anything else) let the page render: story 1.7
    // shows the alert from query state.
    return
  }
  // A stored not_logged_in that the server no longer confirms (logged in
  // from another tab, then Back): forget it and show the page.
  if (loginRequired) clearLoginRequired()
}
