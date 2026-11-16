import { Outlet, createFileRoute } from '@tanstack/react-router'
import { requireSession } from '#/features/login/require-session'
import { sessionQueryOptions } from '#/features/login/session-query'
import { loginStore } from '#/state/login-required'

// Every page that shows data sits under this pathless layout (Start auth
// guide). `ssr: false`: the built server would run beforeLoad without the
// gate's context and always see "not logged in"; client-only keeps dev and
// prod the same.
// https://tanstack.com/start/latest/docs/framework/react/guide/authentication
// https://tanstack.com/start/latest/docs/framework/react/guide/selective-ssr
export const Route = createFileRoute('/_authed')({
  ssr: false,
  beforeLoad: ({ context, location }) =>
    requireSession({
      location,
      loginRequired: loginStore.state.loginRequired,
      fetchSession: () => context.queryClient.fetchQuery(sessionQueryOptions()),
    }),
  component: Outlet,
})
