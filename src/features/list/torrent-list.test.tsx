import { QueryClientProvider, environmentManager } from '@tanstack/react-query'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { AppError } from '#/lib/app-error'
import { fakeHash, t } from '#/lib/testing'
import type { ErrorCode } from '#/shared/errors'
import type { SlimTorrent } from '#/shared/maindata'
import { clearConnectionErrors } from '#/state/connection'
import { clearLoginRequired } from '#/state/login-required'
import { MAINDATA_KEY } from '#/state/maindata'
import { clearMaindataFailure } from '#/state/maindata-failure'
import { createQueryClient } from '#/state/query-client'
import { ROW_HEIGHT, SKELETON_ROWS, rowModel } from '#/features/list/list-model'
import {
  ListEmpty,
  ListLoadError,
  ListSkeleton,
} from '#/features/list/list-states'
import { StatusCircle } from '#/features/list/status-circle'
import { TorrentList } from '#/features/list/torrent-list'
import { RowContent, TorrentRow } from '#/features/list/torrent-row'

// Spec 1.8: static markup (node, no DOM) of a row, the circle, the
// skeleton, the empty and the error block from fixed models. Layout, the
// virtualizer and the freeze are checked in the browser.

const NOW = Date.UTC(2026, 10, 16, 4, 0, 0)
const OPTIONS = { now: NOW, timeZone: 'Asia/Taipei', stateBeforeMove: {} }
const C = 2 * Math.PI * 16.5

const row = (overrides: Partial<SlimTorrent> = {}) =>
  renderToStaticMarkup(<RowContent model={rowModel(t(overrides), OPTIONS)} />)

const openTags = (html: string, tag: string) =>
  html.match(new RegExp(`<${tag}\\b[^>]*>`, 'g')) ?? []

const attr = (tag: string, name: string) =>
  new RegExp(`\\s${name}="([^"]*)"`).exec(tag)?.[1]

describe('X1 plain text', () => {
  it.each([
    '<script>alert(1)</script>',
    '<img src=x onerror=alert(1)>',
    'javascript:alert(1)',
  ])('name %s is escaped text, never markup or a link', (name) => {
    const html = row({ name, save_path: `/data/${name}/x` })
    expect(html).not.toContain('<script')
    expect(html).not.toContain('<img')
    expect(html).not.toContain('<a')
    expect(html).not.toContain('href')
    expect(html).toContain(
      name.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'),
    )
  })
})

describe('the row', () => {
  it('has no button, link or tab stop; fixed height; slot is aria-hidden', () => {
    const html = row()
    expect(html).not.toContain('<button')
    expect(html).not.toContain('<a ')
    expect(html).not.toContain('tabindex')
    expect(html).not.toMatch(/hover|cursor-/)
    expect(openTags(html, 'div')[0]).toContain(`height:${ROW_HEIGHT}px`)
    const slot = openTags(html, 'span')[0]
    expect(slot).toContain('aria-hidden="true"')
    expect(slot).toContain('hidden size-5')
    expect(slot).toContain('lg:block')
  })

  it('the name carries the full name as title', () => {
    const name = 'N'.repeat(220)
    expect(row({ name })).toContain(`title="${name}"`)
  })

  it('second line, ratio column (desktop only) and the added time', () => {
    const html = row({
      state: 'uploading',
      progress: 1,
      ratio: 3.12,
      upspeed: 2_495_611,
      size: 182.7e9,
      save_path: '/data/torrent/mteam-seed',
      added_on: Date.UTC(2026, 10, 16, 1, 12) / 1000,
    })
    for (const text of [
      '>torrent/mteam-seed<',
      '>170.2 GB<',
      '2.38 MB/s',
      '>3.12</b>',
      '>今天 09:12<',
    ]) {
      expect(html).toContain(text)
    }
    // Desktop column; phone keeps it for screen readers only.
    expect(html).toMatch(/w-\[76px\][^"]*max-lg:sr-only/)
    expect(html).toContain('<span class="sr-only">加入 </span>今天 09:12')
    expect(html).toContain('text-good')
  })

  it('an error row shows the reason, hiding size and speed on phone', () => {
    const html = row({ state: 'missingFiles', private: true })
    expect(html).toContain('>找不到檔案，做不了種<')
    expect(html).toMatch(/class="flex-none max-lg:hidden">85 GB</)
  })
})

describe('TorrentRow (the memoized row)', () => {
  it('a move remembered as pausedUP keeps 已完成 and says 搬移中', () => {
    const torrent = t({ hash: fakeHash(5), state: 'moving', progress: 1 })
    const html = renderToStaticMarkup(
      <TorrentRow torrent={torrent} stateBeforeMove="pausedUP" today={NOW} />,
    )
    expect(html).toMatch(/role="img" aria-label="已完成"/)
    expect(html.match(/搬移中/g)).toHaveLength(1)
  })
})

describe('the status circle', () => {
  const circle = (
    status: Parameters<typeof StatusCircle>[0]['status'],
    arcFraction: number | null,
  ) =>
    renderToStaticMarkup(
      <StatusCircle status={status} label="L" arcFraction={arcFraction} />,
    )

  it('a progress ring: track plus an arc at C x (1 - progress)', () => {
    const html = circle('stalled', 0.87)
    const circles = openTags(html, 'circle')
    expect(circles[0]).toContain('stroke-track')
    const arc = circles[1]
    expect(arc).toContain('stroke-status-stalled')
    expect(arc).toContain('stroke-linecap="round"')
    expect(arc).toContain('transform="rotate(-90 18 18)"')
    expect(Number(attr(arc, 'stroke-dasharray'))).toBeCloseTo(C, 9)
    expect(Number(attr(arc, 'stroke-dashoffset'))).toBeCloseTo(C * 0.13, 9)
    expect(openTags(html, 'svg')[0]).toMatch(/role="img"[^>]*aria-label="L"/)
  })

  it('progress 0 draws no arc', () => {
    const circles = openTags(circle('downloading', 0), 'circle')
    expect(circles).toHaveLength(2)
    expect(circles[0]).toContain('stroke-track')
    expect(circles[1]).toContain('fill-status-downloading')
  })

  it('a full ring: status color, no track', () => {
    const html = circle('seeding', null)
    expect(html).not.toContain('stroke-track')
    expect(html).not.toContain('stroke-dashoffset')
    expect(openTags(html, 'circle')[0]).toContain('stroke-status-seeding')
  })

  it('every status has its token and icon', () => {
    for (const status of [
      'downloading',
      'seeding',
      'done',
      'paused',
      'stalled',
      'error',
      'archived',
    ] as const) {
      const html = circle(status, null)
      expect(html).toContain(`fill-status-${status}`)
      expect(html).toMatch(/<(path|rect) /)
    }
  })
})

describe('the list states', () => {
  it('skeleton: busy section, 12 row-sized rows, no spinner', () => {
    const html = renderToStaticMarkup(<ListSkeleton />)
    expect(openTags(html, 'section')[0]).toContain('aria-busy="true"')
    expect(html.match(new RegExp(`height:${ROW_HEIGHT}px`, 'g'))).toHaveLength(
      SKELETON_ROWS,
    )
    expect(html).toContain('data-slot="skeleton"')
    expect(html).toContain('animate-skeleton')
    expect(html).not.toMatch(/spin/)
  })

  it('empty: the sentence and a disabled 「新增種子」', () => {
    const html = renderToStaticMarkup(<ListEmpty />)
    expect(html).toContain('>這個分類沒有種子<')
    const button = openTags(html, 'button')[0]
    expect(button).toContain('disabled=""')
    expect(html).toContain('新增種子</button>')
  })

  it('the no-result block keeps its exact classes after the move to src/shared/ui (story 2.0)', () => {
    const html = renderToStaticMarkup(<ListEmpty />)
    expect(openTags(html, 'section')[0]).toContain(
      'class="flex h-full flex-col items-center justify-center gap-3.5 rounded-panel bg-surface p-6 text-center max-lg:-mx-1 max-lg:rounded-b-none"',
    )
    expect(html).toContain(
      '<p role="status" class="m-0 text-[15px] leading-[1.2] font-bold">',
    )
    expect(openTags(html, 'button')[0]).toContain(
      'class="h-11 flex-none rounded-full border bg-surface px-[18px] font-semibold text-text hover-outline lg:h-9"',
    )
  })

  it('error: the alert sentence and an enabled 「重試」', () => {
    const html = renderToStaticMarkup(
      <ListLoadError onRetry={() => {}} busy={false} />,
    )
    expect(html).toMatch(/<p role="alert"[^>]*>讀不到種子清單<\/p>/)
    const button = openTags(html, 'button')[0]
    expect(button).not.toContain('disabled')
    expect(html).toContain('>重試</button>')
  })
})

describe('TorrentList under a real query client', () => {
  beforeEach(() => {
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
    vi.unstubAllGlobals()
  })

  async function renderFailing(code: ErrorCode) {
    const client = createQueryClient({
      fetchMaindata: () => Promise.reject(new AppError(code)),
      currentPath: () => '/',
    })
    await client.prefetchQuery({ queryKey: MAINDATA_KEY })
    const html = renderToStaticMarkup(
      <QueryClientProvider client={client}>
        <TorrentList />
      </QueryClientProvider>,
    )
    client.clear()
    return html
  }

  it('first load fails with qbit_rejected: the error block and 重試', async () => {
    const html = await renderFailing('qbit_rejected')
    expect(html).toContain('>讀不到種子清單<')
    expect(html).toContain('>重試</button>')
    expect(html).not.toContain('aria-busy')
  })

  it('a connection code keeps the skeleton (the bar shows it)', async () => {
    const html = await renderFailing('home_unreachable')
    expect(html).toContain('aria-busy="true"')
    expect(html).not.toContain('讀不到種子清單')
  })
})
