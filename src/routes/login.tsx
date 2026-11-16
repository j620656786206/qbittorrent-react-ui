import { createFileRoute } from '@tanstack/react-router'
import { LoginScreen } from '#/features/login/login-screen'
import { loginSearchSchema } from '#/shared/login'

// `ssr: false` so Radix's hidden checkbox input gets its style through CSSOM
// on the client, not an SSR `style=` attribute the CSP would block.
export const Route = createFileRoute('/login')({
  ssr: false,
  validateSearch: loginSearchSchema,
  component: LoginRoute,
})

function LoginRoute() {
  const { redirect } = Route.useSearch()
  return <LoginScreen redirect={redirect} />
}
