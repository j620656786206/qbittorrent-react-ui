import { QueryClientProvider } from '@tanstack/react-query'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { clearConnectionErrors, markConnectionError } from '#/state/connection'
import { clearLoginRequired } from '#/state/login-required'
import { createQueryClient } from '#/state/query-client'
import { LoginScreen } from '#/features/login/login-screen'

// Spec 1.7 rows LA1, LA2: the login screen shows the connection bar for each
// connection code and nothing without one (server render, store seeded).

beforeEach(() => {
  // The stores are no-ops without `window`.
  vi.stubGlobal('window', { location: { pathname: '/', search: '', hash: '' } })
  // useRouter outside a RouterProvider only warns.
  vi.spyOn(console, 'warn').mockImplementation(() => {})
  clearLoginRequired()
  clearConnectionErrors()
})

afterEach(() => {
  clearConnectionErrors()
  clearLoginRequired()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

function render(): string {
  const client = createQueryClient({ currentPath: () => '/' })
  const html = renderToStaticMarkup(
    <QueryClientProvider client={client}>
      <LoginScreen redirect={undefined} />
    </QueryClientProvider>,
  )
  client.clear()
  return html
}

describe('LoginScreen connection bar', () => {
  it.each([
    ['home_unreachable', '連不到家裡的 NAS', '重試'],
    ['qbit_unreachable', '家裡的 qBittorrent 沒有回應', '重試'],
    ['cloudflare_expired', 'Cloudflare 登入過期了', '重新登入'],
  ] as const)('%s: the bar above the card', (code, text, label) => {
    markConnectionError(code)
    const html = render()
    expect(html.match(/role="alert"/g)).toHaveLength(1)
    expect(html).toContain(`<span role="alert">${text}</span>`)
    expect(html).toMatch(
      new RegExp(`<button type="button"[^>]*>${label}</button>`),
    )
    // The bar comes before the card (`main`) in the login column.
    expect(html.indexOf('role="alert"')).toBeLessThan(html.indexOf('<main'))
  })

  it('no codes: no bar', () => {
    const html = render()
    expect(html).not.toContain('role="alert"')
    expect(html).not.toContain('重試')
    expect(html).not.toContain('重新登入')
  })
})
