import { QueryClientProvider, environmentManager } from '@tanstack/react-query'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { pickConnectionAlert } from '#/lib/connection-alert'
import type { ConnectionAlertInput } from '#/lib/connection-alert'
import { fakeHash, fakeResponse, fakeServerState, t } from '#/lib/testing'
import { AlertBar } from '#/shared/ui/alert-bar'
import type { ServerState } from '#/shared/maindata'
import { clearConnectionErrors, markConnectionError } from '#/state/connection'
import { clearLoginRequired } from '#/state/login-required'
import { MAINDATA_KEY } from '#/state/maindata'
import { createQueryClient } from '#/state/query-client'
import { AppShell, ShellLayout } from '#/features/header/app-shell'
import { HeaderContext } from '#/features/header/header-context'
import { headerModel } from '#/features/header/header-model'

// Spec 1.7: the shell's static markup (node, no DOM). Fixed models go in
// through HeaderContext; the production AppShell is rendered under a seeded
// query client and connection store. Layout, focus and color are checked in
// the browser; this pins structure, the placeholders' attributes, one alert
// per variant, the live regions and the dim.

const NOW = Date.UTC(2026, 10, 16, 4, 0, 0)
const normal = fakeServerState({
  dl_info_speed: 10_433_331,
  up_info_speed: 2_495_611,
  up_rate_limit: 34_288_435,
})

function render(
  overrides: Partial<ConnectionAlertInput>,
  { loaded = true }: { loaded?: boolean } = {},
): string {
  const serverState: ServerState | undefined = loaded
    ? overrides.connectionStatus
      ? { ...normal, connection_status: overrides.connectionStatus }
      : normal
    : undefined
  const alert = pickConnectionAlert({
    errorCodes: [],
    connectionStatus: serverState?.connection_status ?? null,
    lastSuccessAt: loaded ? NOW - 1_000 : null,
    fetchStartedAt: null,
    now: NOW,
    ...overrides,
  })
  const model = headerModel({
    serverState,
    alert,
    allCount: loaded ? 4 : undefined,
  })
  return renderToStaticMarkup(
    <HeaderContext value={{ model, retrying: false, onBarAction: () => {} }}>
      <ShellLayout>
        <p>page content</p>
      </ShellLayout>
    </HeaderContext>,
  )
}

const CASES = {
  H1: () => render({}),
  H5: () => render({ connectionStatus: 'firewalled' }),
  H6: () => render({ lastSuccessAt: NOW - 20_000 }),
  H7: () =>
    render({
      errorCodes: ['home_unreachable'],
      lastSuccessAt: NOW - 3 * 60_000,
    }),
  H8: () => render({ errorCodes: ['qbit_unreachable'] }),
  H9: () => render({ errorCodes: ['cloudflare_expired', 'home_unreachable'] }),
  H10: () => render({}, { loaded: false }),
} as const

const BAR_CASES = new Set(['H7', 'H8', 'H9'])
const DIM_CASES = new Set(['H7', 'H8'])

/** The opening tags of every element named `tag`. */
const openTags = (html: string, tag: string) =>
  html.match(new RegExp(`<${tag}\\b[^>]*>`, 'g')) ?? []

const attr = (tag: string, name: string) =>
  new RegExp(`\\s${name}="([^"]*)"`).exec(tag)?.[1]

/** The desktop header: the first <header>, which is `hidden lg:flex`. */
function desktopHeader(html: string): string {
  const start = html.indexOf('<header')
  return html.slice(start, html.indexOf('</header>', start))
}

const text = (html: string) => html.replace(/<[^>]*>/g, ' ')

describe('the shell markup', () => {
  it('desktop header children in order (H1)', () => {
    const header = desktopHeader(CASES.H1())
    expect(header).toContain('lg:flex')
    const markers = [
      '>種子</h1>',
      '>9.95 MB/s<',
      '>不限速<',
      '>下載 9.95 MB/s，不限速<',
      '>2.38 MB/s<',
      '>上限 32.7<',
      '>上傳 2.38 MB/s，上限 32.7 MB/s<',
      '<div class="flex-1"></div>',
      'aria-label="搜尋"',
      '新增</button>',
      'aria-label="快捷鍵"',
      'aria-label="設定"',
    ]
    const positions = markers.map((marker) => header.indexOf(marker))
    expect(positions.every((position) => position >= 0)).toBe(true)
    expect([...positions].sort((a, b) => a - b)).toEqual(positions)
  })

  it.each(Object.entries(CASES))(
    '%s: every placeholder is disabled with its label, no title',
    (_name, make) => {
      const html = make()
      const disabled = openTags(html, 'button').filter((tag) =>
        /\sdisabled=""/.test(tag),
      )
      expect(disabled.map((tag) => attr(tag, 'aria-label') ?? null)).toEqual([
        '搜尋',
        null, // desktop 新增 has its text
        '快捷鍵',
        '設定',
        '搜尋',
        '新增種子',
        '排序：加入時間，新的在前，列表',
        '分類：全部',
        '排序：加入時間，新的在前，列表',
      ])
      expect(html).not.toMatch(/\stitle="/)
    },
  )

  it('the selected 「全部」 tab is not disabled', () => {
    const html = CASES.H1()
    const tabs = openTags(html, 'button').filter((tag) =>
      tag.includes('role="tab"'),
    )
    expect(tabs).toHaveLength(1)
    expect(tabs[0]).toContain('aria-selected="true"')
    expect(tabs[0]).not.toMatch(/\sdisabled=""/)
    expect(text(html)).toMatch(/全部\s+4/)
  })

  it.each(Object.entries(CASES))(
    '%s: one role="alert" per variant only with a bar; dim only for H7 and H8',
    (name, make) => {
      const html = make()
      const alerts = html.match(/role="alert"/g) ?? []
      expect(alerts.length).toBe(BAR_CASES.has(name) ? 2 : 0)
      const mains = openTags(html, 'main')
      expect(mains).toHaveLength(1)
      const main = mains.join('')
      expect(main.includes('opacity-50')).toBe(DIM_CASES.has(name))
      expect(main).not.toContain('pointer-events')
      expect(html).toContain('<p>page content</p>')
    },
  )

  it.each(Object.entries(CASES))(
    '%s: no URL or IP in the text',
    (_name, make) => {
      const shown = text(make())
      expect(shown).not.toMatch(/http/i)
      expect(shown).not.toMatch(/\b\d{1,3}(\.\d{1,3}){3}\b/)
    },
  )

  it('H5: one warning pill instead of the two speed pills', () => {
    const header = desktopHeader(CASES.H5())
    expect(header).toContain('防火牆擋住了')
    expect(header).toContain('border-status-stalled')
    expect(header).not.toContain('下載')
  })

  it('H6: the stale text right of the pills, also on the phone line', () => {
    const html = CASES.H6()
    const header = desktopHeader(html)
    expect(header.indexOf('最後更新 20 秒前')).toBeGreaterThan(
      header.indexOf('上傳 2.38 MB/s'),
    )
    expect(html.match(/最後更新 20 秒前/g)).toHaveLength(2)
  })

  it('H7: the bar replaces the phone line; desktop pills keep the speeds', () => {
    const html = CASES.H7()
    // The live region holds only the stable text; the ticking part is hidden.
    expect(
      html.match(/<span role="alert">連不到家裡的 NAS<\/span>/g),
    ).toHaveLength(2)
    expect(
      html.match(/<span aria-hidden="true">，最後更新 3 分前<\/span>/g),
    ).toHaveLength(2)
    expect(html.match(/>重試</g)).toHaveLength(2)
    // Desktop pills only: the phone line is gone.
    expect(html.match(/>9\.95 MB\/s</g)).toHaveLength(1)
  })

  it('H9: 重新登入 and no dim', () => {
    const html = CASES.H9()
    expect(html.match(/Cloudflare 登入過期了/g)).toHaveLength(2)
    expect(html.match(/>重新登入</g)).toHaveLength(2)
  })

  it('H10: skeleton bars for speeds and count', () => {
    const html = CASES.H10()
    // 2 desktop pills, 2 phone groups, desktop and phone counts.
    expect(html.match(/animate-skeleton/g)).toHaveLength(6)
    expect(text(html)).not.toContain('MB/s')
    // Both pills, the phone line and the 「全部」 tab say they are loading.
    expect(html.match(/aria-busy="true"/g)).toHaveLength(4)
    expect(
      openTags(html, 'button').find((tag) => tag.includes('role="tab"')),
    ).toContain('aria-busy="true"')
  })

  it('H1: nothing is busy once the data is there; main is the focus target', () => {
    const html = CASES.H1()
    expect(html).not.toContain('aria-busy')
    expect(openTags(html, 'main')[0]).toMatch(/id="rt-main"[^>]*tabindex="-1"/)
  })

  it('phone column padding is 18px on all sides (UX-DR73)', () => {
    expect(CASES.H1()).toContain('px-4 py-[18px] lg:px-7 lg:py-[22px]')
  })
})

describe('AlertBar', () => {
  const renderBar = (props: Partial<Parameters<typeof AlertBar>[0]> = {}) =>
    renderToStaticMarkup(
      <AlertBar
        text="連不到家裡的 NAS"
        detail="最後更新 25 秒前"
        icon="offline"
        actionLabel="重試"
        onAction={() => {}}
        {...props}
      />,
    )

  it('the live region holds only the stable text, not the detail or button', () => {
    const html = renderBar()
    expect(html.match(/role="alert"/g)).toHaveLength(1)
    expect(html).toContain('<span role="alert">連不到家裡的 NAS</span>')
    expect(html).toContain('<span aria-hidden="true">，最後更新 25 秒前</span>')
    expect(html).not.toMatch(/role="alert"[^>]*>[^<]*<button/)
    expect(html).toContain('lucide-wifi-off')
    expect(html).toContain('border-status-stalled')
    expect(html).toMatch(/<button type="button"[^>]*>重試<\/button>/)
    expect(html).not.toContain('aria-busy')
  })

  it('no detail: nothing after the text; busy sets aria-busy on the button', () => {
    const html = renderBar({ detail: null, busy: true })
    expect(html).not.toContain('aria-hidden="true">，')
    expect(html).toMatch(/<button[^>]*aria-busy="true"[^>]*>重試<\/button>/)
  })
})

describe('AppShell with a seeded query client and connection store', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(NOW)
    // The stores are no-ops without `window`.
    vi.stubGlobal('window', {
      location: { pathname: '/', search: '', hash: '' },
    })
    environmentManager.setIsServer(() => false)
    clearLoginRequired()
    clearConnectionErrors()
  })

  afterEach(() => {
    environmentManager.setIsServer(() => typeof window === 'undefined')
    clearLoginRequired()
    clearConnectionErrors()
    vi.useRealTimers()
    vi.unstubAllGlobals()
  })

  // Row H11's six torrents: two archived, so 「全部 4」.
  const torrents = [
    t({ hash: fakeHash(1) }),
    t({ hash: fakeHash(2), state: 'uploading', progress: 1 }),
    t({ hash: fakeHash(3), state: 'stalledDL' }),
    t({ hash: fakeHash(4), state: 'missingFiles', private: true }),
    t({ hash: fakeHash(5), state: 'missingFiles' }),
    t({ hash: fakeHash(6), state: 'missingFiles', category: 'mteam-tv' }),
  ]

  async function renderShell(serverState: ServerState) {
    const client = createQueryClient({
      fetchMaindata: async () =>
        fakeResponse({ changed: torrents, serverState }),
      currentPath: () => '/',
    })
    await client.prefetchQuery({ queryKey: MAINDATA_KEY })
    return (setup: () => void = () => {}) => {
      setup()
      const html = renderToStaticMarkup(
        <QueryClientProvider client={client}>
          <AppShell>
            <p>page content</p>
          </AppShell>
        </QueryClientProvider>,
      )
      client.clear()
      return html
    }
  }

  it('H1: speeds, 「全部 4」, no bar, no dim', async () => {
    const html = (await renderShell(normal))()
    expect(html).toContain('>下載 9.95 MB/s，不限速<')
    expect(html).toContain('>上傳 2.38 MB/s，上限 32.7 MB/s<')
    expect(text(html)).toMatch(/全部\s+4/)
    expect(html).not.toContain('role="alert"')
    expect(openTags(html, 'main')[0]).not.toContain('opacity-50')
    expect(html).toContain('<p>page content</p>')
  })

  it('H5: firewalled shows the warning pill and line, no dim', async () => {
    const html = (
      await renderShell({ ...normal, connection_status: 'firewalled' })
    )()
    expect(html.match(/防火牆擋住了/g)).toHaveLength(2)
    expect(html).not.toContain('下載 9.95')
    expect(html).not.toContain('role="alert"')
    expect(openTags(html, 'main')[0]).not.toContain('opacity-50')
  })

  it('H7: home unreachable 3 min later: bar text, retry, dim on main only', async () => {
    const draw = await renderShell(normal)
    const html = draw(() => {
      vi.setSystemTime(NOW + 3 * 60_000)
      markConnectionError('home_unreachable')
    })
    expect(
      html.match(/<span role="alert">連不到家裡的 NAS<\/span>/g),
    ).toHaveLength(2)
    expect(html).toContain('，最後更新 3 分前')
    expect(html.match(/>重試</g)).toHaveLength(2)
    expect(openTags(html, 'main')[0]).toContain('opacity-50')
    expect(html.match(/opacity-50/g)).toHaveLength(1)
    // Desktop pills keep the last speeds; the count stays.
    expect(html).toContain('>下載 9.95 MB/s，不限速<')
    expect(text(html)).toMatch(/全部\s+4/)
  })
})
