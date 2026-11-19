import { QueryClientProvider, environmentManager } from '@tanstack/react-query'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ALL } from '#/shared/categories'
import { pickConnectionAlert } from '#/lib/connection-alert'
import type { ConnectionAlertInput } from '#/lib/connection-alert'
import { fakeHash, fakeResponse, fakeServerState, t } from '#/lib/testing'
import { AlertBar } from '#/shared/ui/alert-bar'
import type { ServerState } from '#/shared/maindata'
import { clearConnectionErrors, markConnectionError } from '#/state/connection'
import { clearLoginRequired } from '#/state/login-required'
import { AppError } from '#/lib/app-error'
import { MAINDATA_KEY } from '#/state/maindata'
import { clearMaindataFailure } from '#/state/maindata-failure'
import { createQueryClient } from '#/state/query-client'
import { AppShell, ShellLayout } from '#/features/header/app-shell'
import { CategoryTabsContext, ListViewContext } from '#/state/list-view'
import { HeaderContext } from '#/features/header/header-context'
import { headerModel } from '#/features/header/header-model'
import { REMEMBERED_HINT_LINE_PREFIX } from '#/features/header/sort-model'

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
  {
    loaded = true,
    loadFailed = false,
  }: { loaded?: boolean; loadFailed?: boolean } = {},
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
    loadFailed,
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
    '%s: every placeholder is disabled with its label (設定 is not since story 3.3, the phone category button since 3.4, search since 3.5, 快捷鍵 since 3.7); tooltips only on the sort pill and the shortcut keys',
    (_name, make) => {
      const html = make()
      const disabled = openTags(html, 'button').filter((tag) =>
        /\sdisabled=""/.test(tag),
      )
      // Story 3.5: both magnifiers open the search box.
      expect(disabled.map((tag) => attr(tag, 'aria-label') ?? null)).toEqual([
        null, // desktop 新增 has its text
        '新增種子',
      ])
      // The desktop sort pill (story 2.1); story 3.7: the desktop
      // magnifier and 快捷鍵 name their key (the phone magnifier does not).
      expect(html.match(/\stitle="[^"]*"/g)).toEqual([
        ' title="搜尋（/）"',
        ' title="快捷鍵（?）"',
        ' title="排序：狀態"',
      ])
    },
  )

  it('the desktop 設定 button is enabled and calls openSettings (story 3.3)', () => {
    const html = CASES.H1()
    const settings = openTags(html, 'button').find(
      (tag) => attr(tag, 'aria-label') === '設定',
    )
    expect(settings).toBeDefined()
    expect(settings).not.toMatch(/\sdisabled=""/)
    // The phone has no 設定 button (story 3.4 adds the sheet's row).
    expect(
      openTags(html, 'button').filter(
        (tag) => attr(tag, 'aria-label') === '設定',
      ),
    ).toHaveLength(1)
  })

  it('story 3.7: one 快捷鍵 button, in the desktop header, enabled; the phone has none', () => {
    const html = CASES.H1()
    const buttons = openTags(html, 'button').filter(
      (tag) => attr(tag, 'aria-label') === '快捷鍵',
    )
    expect(buttons).toHaveLength(1)
    expect(buttons[0]).not.toMatch(/\sdisabled=""/)
    expect(attr(buttons[0], 'title')).toBe('快捷鍵（?）')
    expect(desktopHeader(html)).toContain('aria-label="快捷鍵"')
  })

  it('the desktop sort pill is enabled and opens a menu (story 2.1)', () => {
    const html = CASES.H1()
    const pill = openTags(html, 'button').find((tag) =>
      tag.includes('aria-haspopup="menu"'),
    )
    expect(pill).toBeDefined()
    expect(pill).not.toMatch(/\sdisabled=""/)
    // K1 the default is the board (story 2.3).
    expect(attr(pill ?? '', 'aria-label')).toBe('排序：狀態，看板')
    expect(text(html)).toMatch(/看板\s+排序：狀態/)
    expect(text(html)).not.toMatch(/排序：狀態\s*[↑↓]/)
    expect(html).toContain('data-icon="board"')
  })

  it('the phone sort pill is enabled and opens a dialog (story 2.2)', () => {
    const html = CASES.H1()
    const pill = openTags(html, 'button').find(
      (tag) => tag.includes('aria-haspopup="dialog"') && tag.includes('排序：'),
    )
    expect(pill).toBeDefined()
    expect(pill).not.toMatch(/\sdisabled=""/)
    expect(pill).toContain('aria-expanded="false"')
    expect(pill).toContain('h-11')
    expect(attr(pill ?? '', 'aria-label')).toBe('排序：狀態，看板')
    // Closed: no sheet in the markup.
    expect(html).not.toContain('role="dialog"')
  })

  it.each([
    [
      { sort: 'seeding_time', dir: 'asc' },
      '做種時間 ↑',
      '排序：做種時間，短的在前，列表',
    ],
    [
      { sort: 'num_seeds', dir: 'desc' },
      '做種人數（連上的） ↓',
      '排序：做種人數（連上的），大的在前，列表',
    ],
    [
      { sort: 'added_on', dir: 'desc' },
      '加入時間 ↓',
      '排序：加入時間，新的在前，列表',
    ],
    [{ sort: 'state', dir: 'desc' }, '狀態', '排序：狀態，看板'],
  ] as const)(
    'the phone pill follows a non-default view: %o',
    (view, pillText, label) => {
      const html = renderToStaticMarkup(
        <ListViewContext
          value={{
            view: { ...view, category: ALL, query: '' },
            viewReady: true,
            setView: () => {},
            pickView: () => {},
            selectCategory: () => {},
            rememberedHint: false,
            openSettings: () => {},
            settingsOpen: false,
            searchOpen: false,
            openSearch: () => {},
            setQuery: () => {},
            closeSearch: () => {},
          }}
        >
          <HeaderContext
            value={{
              model: headerModel({
                serverState: normal,
                alert: null,
                allCount: 4,
                loadFailed: false,
              }),
              retrying: false,
              onBarAction: () => {},
            }}
          >
            <ShellLayout>
              <p>page content</p>
            </ShellLayout>
          </HeaderContext>
        </ListViewContext>,
      )
      const pill = openTags(html, 'button').find(
        (tag) =>
          tag.includes('aria-haspopup="dialog"') && tag.includes('排序：'),
      )
      const pillHtml = html.slice(html.indexOf(pill ?? '<none>'))
      const shown = /<b class="font-bold">([^<]*)<\/b>/.exec(pillHtml)?.[1]
      expect(shown).toBe(pillText)
      expect(attr(pill ?? '', 'aria-label')).toBe(label)
      // 狀態 has no arrow, on the phone too.
      if (view.sort === 'state') expect(shown).not.toMatch(/[↑↓]/)
    },
  )

  it('the selected 「全部」 tab is not disabled', () => {
    const html = CASES.H1()
    const tabs = openTags(html, 'button').filter((tag) =>
      tag.includes('aria-pressed='),
    )
    expect(tabs).toHaveLength(1)
    expect(tabs[0]).toContain('aria-pressed="true"')
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

  it('spec 1.8 H1: a failed first load leaves the skeletons (option A)', () => {
    const html = render({}, { loaded: false, loadFailed: true })
    expect(html).not.toContain('animate-skeleton')
    expect(html).not.toContain('aria-busy')
    // 2 desktop pills and 2 phone groups read 「沒有」, spoken with the direction.
    expect(html.match(/text-text-muted">沒有</g)).toHaveLength(4)
    expect(html.match(/>下載 沒有</g)).toHaveLength(2)
    expect(html.match(/>上傳 沒有</g)).toHaveLength(2)
    // The 「全部」 tab and the phone category button have no count.
    expect(html).toMatch(/<span>全部<\/span><\/button>/)
    expect(html).toMatch(
      /<b class="min-w-0 truncate font-semibold">全部<\/b><svg/,
    )
  })

  it('H10: skeleton bars for speeds and count', () => {
    const html = CASES.H10()
    // 2 desktop pills, 2 phone groups, desktop and phone counts.
    expect(html.match(/animate-skeleton/g)).toHaveLength(6)
    expect(text(html)).not.toContain('MB/s')
    // Both pills, the phone line and the 「全部」 tab say they are loading.
    expect(html.match(/aria-busy="true"/g)).toHaveLength(4)
    expect(
      openTags(html, 'button').find((tag) => tag.includes('aria-pressed=')),
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

  it('phone: main keeps the page column as its content box (spec 1.8)', () => {
    // 4px wider plus 4px padding: only the list opts into the 12px edges.
    expect(openTags(CASES.H1(), 'main')[0]).toContain(
      'max-lg:-mx-1 max-lg:px-1',
    )
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
    clearMaindataFailure()
  })

  afterEach(() => {
    environmentManager.setIsServer(() => typeof window === 'undefined')
    clearLoginRequired()
    clearConnectionErrors()
    clearMaindataFailure()
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

  async function renderFailingShell(
    code: 'qbit_rejected' | 'home_unreachable',
  ) {
    const client = createQueryClient({
      fetchMaindata: () => Promise.reject(new AppError(code)),
      currentPath: () => '/',
    })
    await client.prefetchQuery({ queryKey: MAINDATA_KEY })
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

  it('spec 1.8 H1 wiring: qbit_rejected first load leaves the skeletons', async () => {
    const html = await renderFailingShell('qbit_rejected')
    expect(html.match(/text-text-muted">沒有</g)).toHaveLength(4)
    expect(html).not.toContain('aria-busy')
    expect(html).not.toContain('animate-skeleton')
    expect(html).toMatch(/<span>全部<\/span><\/button>/)
  })

  it('spec 1.8 H1 wiring: a connection code keeps the skeletons', async () => {
    const html = await renderFailingShell('home_unreachable')
    expect(html).toContain('animate-skeleton')
    expect(html).not.toContain('>沒有<')
  })

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

// Story 3.2: the phone's category button names the category on screen, so
// a `?category=` filter is never silent. Story 3.4: it is enabled and opens
// the category sheet; the hint line sits under the third row.
describe('the phone category button (stories 3.2 and 3.4)', () => {
  function renderPhone(
    category: string,
    tabs: Array<{ key: string; label: string; count: number }> | undefined,
    {
      rememberedHint = false,
      sort = 'state',
      settingsOpen = false,
    }: {
      rememberedHint?: boolean
      sort?: 'state' | 'seeding_time'
      settingsOpen?: boolean
    } = {},
  ): string {
    return renderToStaticMarkup(
      <ListViewContext
        value={{
          view: { sort, dir: 'desc', category, query: '' },
          viewReady: true,
          setView: () => {},
          pickView: () => {},
          selectCategory: () => {},
          rememberedHint,
          openSettings: () => {},
          settingsOpen,
          searchOpen: false,
          openSearch: () => {},
          setQuery: () => {},
          closeSearch: () => {},
        }}
      >
        <CategoryTabsContext value={tabs}>
          <HeaderContext
            value={{
              model: headerModel({
                serverState: normal,
                alert: null,
                allCount: 4,
              }),
              retrying: false,
              onBarAction: () => {},
            }}
          >
            <ShellLayout>
              <p>page content</p>
            </ShellLayout>
          </HeaderContext>
        </CategoryTabsContext>
      </ListViewContext>,
    )
  }

  function phoneButton(
    category: string,
    tabs: Array<{ key: string; label: string; count: number }> | undefined,
  ) {
    const html = renderPhone(category, tabs)
    const tag =
      openTags(html, 'button').find((open) =>
        open.includes('aria-label="分類：'),
      ) ?? ''
    const start = html.indexOf(tag)
    return {
      tag,
      text: text(html.slice(start, html.indexOf('</button>', start))).trim(),
    }
  }

  const TABS = [
    { key: ALL, label: '全部', count: 4 },
    { key: 'mteam-X', label: 'mteam-X', count: 3 },
    { key: '', label: '未分類', count: 1 },
  ]

  it('shows the selected category and its count, enabled, opens a dialog (story 3.4)', () => {
    const button = phoneButton('mteam-X', TABS)
    expect(attr(button.tag, 'aria-label')).toBe('分類：mteam-X')
    expect(button.text).toMatch(/^mteam-X\s+3$/)
    expect(button.tag).not.toMatch(/\sdisabled=""/)
    expect(attr(button.tag, 'aria-haspopup')).toBe('dialog')
    expect(attr(button.tag, 'aria-expanded')).toBe('false')
    // 44px pill.
    expect(attr(button.tag, 'class')).toMatch(/\bh-11\b/)
    expect(attr(button.tag, 'class')).toMatch(/\brounded-full\b/)
  })

  it('uncategorized reads 未分類', () => {
    const button = phoneButton('', TABS)
    expect(attr(button.tag, 'aria-label')).toBe('分類：未分類')
    expect(button.text).toMatch(/^未分類\s+1$/)
  })

  it('before the tabs are known: 「全部」 with the header count', () => {
    const button = phoneButton(ALL, undefined)
    expect(attr(button.tag, 'aria-label')).toBe('分類：全部')
    expect(button.text).toMatch(/^全部\s+4$/)
  })

  const HINT_LINE = `${REMEMBERED_HINT_LINE_PREFIX}做種時間 ↓`

  /** The phone's third row (pills and hint line), up to `main`. */
  function thirdRow(html: string) {
    const start = html.lastIndexOf(
      '<div',
      html.indexOf('data-testid="phone-third-row"'),
    )
    const end = html.indexOf('<main')
    return {
      tag: openTags(html.slice(start), 'div')[0] ?? '',
      html: html.slice(start, end),
    }
  }

  /** The status line's opening tag and text. */
  function statusLine(html: string) {
    const tag = openTags(html, 'p').find((open) =>
      open.includes('role="status"'),
    )
    if (tag === undefined) return null
    const start = html.indexOf(tag) + tag.length
    return { tag, text: html.slice(start, html.indexOf('</p>', start)) }
  }

  it('story 3.4: the hint line in the phone-only third row, after the pills, muted 12px, in the flow, a live region', () => {
    const html = renderPhone('mteam-X', TABS, {
      rememberedHint: true,
      sort: 'seeding_time',
    })
    const row = thirdRow(html)
    expect(attr(row.tag, 'class')).toMatch(/\blg:hidden\b/)
    const line = statusLine(row.html)
    expect(line?.text).toBe(HINT_LINE)
    const classes = attr(line?.tag ?? '', 'class') ?? ''
    expect(classes).toMatch(/\btext-meta\b/)
    expect(classes).toMatch(/\btext-text-muted\b/)
    // Not absolutely placed: it pushes the content down.
    expect(classes).not.toMatch(/\b(absolute|fixed)\b/)
    expect(row.html.indexOf(HINT_LINE)).toBeGreaterThan(
      row.html.indexOf('aria-label="排序：做種時間，久的在前，列表"'),
    )
    // Only once in the page: never on the desktop pill row.
    expect(html.split(REMEMBERED_HINT_LINE_PREFIX)).toHaveLength(2)
  })

  it('story 3.4: without the hint the live region stays, empty and without its margin', () => {
    const html = renderPhone('mteam-X', TABS, { sort: 'seeding_time' })
    expect(html).not.toContain(REMEMBERED_HINT_LINE_PREFIX)
    const line = statusLine(thirdRow(html).html)
    expect(line?.text).toBe('')
    expect(attr(line?.tag ?? '', 'class')).not.toMatch(/\bmt-/)
  })

  it('story 3.4: no hint line on the settings page', () => {
    const html = renderPhone('mteam-X', TABS, {
      rememberedHint: true,
      sort: 'seeding_time',
      settingsOpen: true,
    })
    expect(statusLine(thirdRow(html).html)?.text).toBe('')
  })
})
