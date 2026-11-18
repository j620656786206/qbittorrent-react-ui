import { createFileRoute } from '@tanstack/react-router'
import { SettingsPage } from '#/features/settings/settings-page'

// Story 3.3: the settings page under the `_authed` layout (header as
// usual, client only like the layout). The desktop header's 設定 button
// opens it; the phone entry is story 3.4's 「設定」 row, and a typed
// `/settings` works at any width.
// https://tanstack.com/router/latest/docs/framework/react/routing/file-based-routing
export const Route = createFileRoute('/_authed/settings')({
  ssr: false,
  component: SettingsPage,
})
