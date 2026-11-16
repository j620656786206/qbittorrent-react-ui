import {
  HeadContent,
  Scripts,
  createRootRouteWithContext,
} from '@tanstack/react-router'
import appCss from '../styles.css?url'
import { NotFoundScreen } from '#/features/not-found/not-found-screen'
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

function RootDocument({ children }: { children: ReactNode }) {
  return (
    <html lang="zh-Hant-TW">
      <head>
        <HeadContent />
      </head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  )
}
