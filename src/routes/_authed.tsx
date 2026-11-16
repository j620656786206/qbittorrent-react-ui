import { Outlet, createFileRoute } from '@tanstack/react-router'
import { AppShell } from '#/features/header/app-shell'
import { requireSession } from '#/features/login/require-session'
import { sessionQueryOptions } from '#/features/login/session-query'
import { loginStore } from '#/state/login-required'

// Every page that shows data sits under this pathless layout (Start auth
// guide). `ssr: false`: the built server would run beforeLoad without the
// gate's context and always see "not logged in"; client-only keeps dev and
// prod the same.
// https://tanstack.com/start/latest/docs/framework/react/guide/authentication
// https://tanstack.com/start/latest/docs/framework/react/guide/selective-ssr
// The layout is the app shell (story 1.7): header, speeds, alert bar and the
// scrolling `main` the child route renders into.
// https://tanstack.com/router/latest/docs/framework/react/routing/routing-concepts
export const Route = createFileRoute('/_authed')({
  ssr: false,
  beforeLoad: ({ context, location }) =>
    requireSession({
      location,
      loginRequired: loginStore.state.loginRequired,
      fetchSession: () => context.queryClient.fetchQuery(sessionQueryOptions()),
    }),
  component: AuthedLayout,
})

function AuthedLayout() {
  return (
    <AppShell>
      <Outlet />
    </AppShell>
  )
}
