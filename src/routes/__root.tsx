import {
  HeadContent,
  Scripts,
  createRootRouteWithContext,
} from '@tanstack/react-router'
import { useEffect } from 'react'
import appCss from '../styles.css?url'
import { NotFoundScreen } from '#/features/not-found/not-found-screen'
import { toast } from '#/lib/toast'
import { Toaster } from '#/shared/ui/toaster'
import type { ReactNode } from 'react'
import type { RouterContext } from '#/state/query-client'

export const Route = createRootRouteWithContext<RouterContext>()({
  head: () => ({
    meta: [
      { charSet: 'utf-8' },
      { name: 'viewport', content: 'width=device-width, initial-scale=1' },
      { title: 'react-torrent' },
    ],
    links: [{ rel: 'stylesheet', href: appCss }],
  }),
  shellComponent: RootDocument,
  // An unknown URL lands here (story 2.0). The router's default not-found
  // mode is fuzzy and only the root route has a not-found component, so it
  // renders inside the shell, outside the `_authed` layout.
  // https://tanstack.com/router/latest/docs/framework/react/guide/not-found-errors
  notFoundComponent: NotFoundScreen,
})

// Story 2.6: the normal and button toasts have no product caller yet, so
// the dev server exposes the three toast kinds for screenshots. Vite
// replaces `import.meta.env.DEV` with `false` in a build, which drops this.
declare global {
  interface Window {
    __rtToastPreview?: typeof toast
  }
}

function useToastPreview(): void {
  useEffect(() => {
    if (!import.meta.env.DEV) return
    window.__rtToastPreview = toast
    return () => {
      delete window.__rtToastPreview
    }
  }, [])
}

function RootDocument({ children }: { children: ReactNode }) {
  useToastPreview()
  return (
    <html lang="zh-Hant-TW">
      <head>
        <HeadContent />
      </head>
      <body>
        {children}
        {/* The one toast region (src/lib/toast.ts drives it). A direct body
            child, so an open bottom sheet can leave it out of its inert. */}
        <Toaster />
        <Scripts />
      </body>
    </html>
  )
}
