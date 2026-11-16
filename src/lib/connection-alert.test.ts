import { describe, expect, it } from 'vitest'
import { CONNECTION_CODES } from '#/lib/app-error'
import {
  FETCH_GRACE_MS,
  alertSurface,
  barFor,
  dimsContent,
  pickConnectionAlert,
} from '#/lib/connection-alert'
import type {
  ConnectionAlertInput,
  ConnectionAlertKind,
} from '#/lib/connection-alert'

// Spec 1.6 rows A1 to A3, plus the review rows A4 (suffix only when stale,
// never-fetched, fetch in flight) and A5 (a fetch that hangs past the grace
// time). Clock: 2026-11-16 12:00 in Asia/Taipei.

const NOW = Date.UTC(2026, 10, 16, 4, 0, 0)
const FRESH = NOW - 1_000
const THREE_MIN_AGO = NOW - 3 * 60_000
const TWENTY_S_AGO = NOW - 20_000

const input = (
  overrides: Partial<ConnectionAlertInput>,
): ConnectionAlertInput => ({
  errorCodes: [],
  connectionStatus: 'connected',
  lastSuccessAt: FRESH,
  fetchStartedAt: null,
  now: NOW,
  ...overrides,
})

describe('A1 each alert alone', () => {
  it.each([
    [
      'cloudflare_expired',
      input({
        errorCodes: ['cloudflare_expired'],
        lastSuccessAt: THREE_MIN_AGO,
      }),
      'cloudflare_expired',
      'Cloudflare 登入過期了',
      null,
    ],
    [
      'home_unreachable',
      input({ errorCodes: ['home_unreachable'], lastSuccessAt: THREE_MIN_AGO }),
      'home_unreachable',
      '連不到家裡的 NAS',
      '最後更新 3 分前',
    ],
    [
      'qbit_unreachable',
      input({ errorCodes: ['qbit_unreachable'], lastSuccessAt: THREE_MIN_AGO }),
      'qbit_unreachable',
      '家裡的 qBittorrent 沒有回應',
      '最後更新 3 分前',
    ],
    [
      'disconnected',
      input({ connectionStatus: 'disconnected', lastSuccessAt: TWENTY_S_AGO }),
      'disconnected',
      '斷線了',
      null,
    ],
    [
      'firewalled',
      input({ connectionStatus: 'firewalled', lastSuccessAt: TWENTY_S_AGO }),
      'firewalled',
      '防火牆擋住了',
      null,
    ],
    [
      'stale',
      input({ lastSuccessAt: TWENTY_S_AGO }),
      'stale',
      '最後更新 20 秒前',
      null,
    ],
  ] as const)('%s', (_name, value, kind, text, detail) => {
    expect(pickConnectionAlert(value)).toEqual({ kind, text, detail })
  })

  it('nothing wrong: no alert', () => {
    expect(pickConnectionAlert(input({}))).toBeNull()
  })
})

describe('A2 several active codes and states: the highest wins', () => {
  it.each([
    [
      'cloudflare + home + disconnected + stale',
      input({
        errorCodes: ['home_unreachable', 'cloudflare_expired'],
        connectionStatus: 'disconnected',
        lastSuccessAt: THREE_MIN_AGO,
      }),
      'cloudflare_expired',
    ],
    [
      'home recorded after cloudflare',
      input({
        errorCodes: ['cloudflare_expired', 'home_unreachable'],
        lastSuccessAt: THREE_MIN_AGO,
      }),
      'cloudflare_expired',
    ],
    [
      'qbit_unreachable + firewalled + stale',
      input({
        errorCodes: ['qbit_unreachable'],
        connectionStatus: 'firewalled',
        lastSuccessAt: THREE_MIN_AGO,
      }),
      'qbit_unreachable',
    ],
    [
      'disconnected + stale',
      input({ connectionStatus: 'disconnected', lastSuccessAt: TWENTY_S_AGO }),
      'disconnected',
    ],
    [
      'firewalled + stale',
      input({ connectionStatus: 'firewalled', lastSuccessAt: TWENTY_S_AGO }),
      'firewalled',
    ],
  ] as const)('%s -> %s', (_name, value, kind) => {
    expect(pickConnectionAlert(value)?.kind).toBe(kind)
  })
})

describe('A3 boundaries', () => {
  it('exactly 10 s ago is not stale', () => {
    expect(
      pickConnectionAlert(input({ lastSuccessAt: NOW - 10_000 })),
    ).toBeNull()
  })

  it('10.001 s ago is stale', () => {
    expect(
      pickConnectionAlert(input({ lastSuccessAt: NOW - 10_001 }))?.kind,
    ).toBe('stale')
  })

  it('never loaded is not stale', () => {
    expect(
      pickConnectionAlert(
        input({ lastSuccessAt: null, connectionStatus: null }),
      ),
    ).toBeNull()
  })

  it('home unreachable without a last success has no detail', () => {
    expect(
      pickConnectionAlert(
        input({ errorCodes: ['home_unreachable'], lastSuccessAt: null }),
      ),
    ).toEqual({
      kind: 'home_unreachable',
      text: '連不到家裡的 NAS',
      detail: null,
    })
  })
})

describe('A4 when the 「最後更新」 part shows', () => {
  it('a failure 5 s after a success has no detail (not 「剛剛」)', () => {
    expect(
      pickConnectionAlert(
        input({ errorCodes: ['home_unreachable'], lastSuccessAt: NOW - 5_000 }),
      )?.detail,
    ).toBeNull()
  })

  it('the detail appears once the data is past the stale threshold', () => {
    expect(
      pickConnectionAlert(
        input({
          errorCodes: ['qbit_unreachable'],
          lastSuccessAt: NOW - 10_001,
        }),
      ),
    ).toMatchObject({
      text: '家裡的 qBittorrent 沒有回應',
      detail: '最後更新 10 秒前',
    })
  })

  it.each([0, -1])('lastSuccessAt %d counts as never', (lastSuccessAt) => {
    expect(pickConnectionAlert(input({ lastSuccessAt }))).toBeNull()
    expect(
      pickConnectionAlert(
        input({ errorCodes: ['home_unreachable'], lastSuccessAt }),
      )?.detail,
    ).toBeNull()
  })

  it('no stale line while a fetch has just started', () => {
    expect(
      pickConnectionAlert(
        input({ lastSuccessAt: TWENTY_S_AGO, fetchStartedAt: NOW - 500 }),
      ),
    ).toBeNull()
  })

  it('a fetch in flight does not hide the higher alerts', () => {
    expect(
      pickConnectionAlert(
        input({
          errorCodes: ['home_unreachable'],
          lastSuccessAt: TWENTY_S_AGO,
          fetchStartedAt: NOW - 500,
        }),
      ),
    ).toMatchObject({ text: '連不到家裡的 NAS', detail: '最後更新 20 秒前' })
    expect(
      pickConnectionAlert(
        input({ connectionStatus: 'firewalled', fetchStartedAt: NOW - 500 }),
      )?.kind,
    ).toBe('firewalled')
  })
})

describe('A5 a fetch that hangs (qBittorrent stuck) still shows the stale line', () => {
  it.each([
    ['just started', NOW, null],
    ['1.999 s ago', NOW - (FETCH_GRACE_MS - 1), null],
    ['exactly the grace time ago', NOW - FETCH_GRACE_MS, '最後更新 20 秒前'],
    ['hung for 15 s', NOW - 15_000, '最後更新 20 秒前'],
  ] as const)('fetch started %s', (_name, fetchStartedAt, text) => {
    const alert = pickConnectionAlert(
      input({ lastSuccessAt: TWENTY_S_AGO, fetchStartedAt }),
    )
    expect(alert === null ? null : alert.text).toBe(text)
  })
})

describe('C6 every connection code has an alert', () => {
  it.each(CONNECTION_CODES)('%s alone shows as itself', (code) => {
    expect(pickConnectionAlert(input({ errorCodes: [code] }))?.kind).toBe(code)
  })

  it('home and qBittorrent rank equal: the one listed first wins', () => {
    expect(
      pickConnectionAlert(
        input({ errorCodes: ['qbit_unreachable', 'home_unreachable'] }),
      )?.kind,
    ).toBe('qbit_unreachable')
  })
})

describe('S1 stale while a fetch is in flight (spec 1.7)', () => {
  const lastSuccessAt = NOW - 25_000
  it.each([
    [
      'started just inside the grace time',
      NOW - (FETCH_GRACE_MS - 1_000),
      null,
    ],
    ['started past the grace time', NOW - (FETCH_GRACE_MS + 1_000), 'stale'],
    ['no fetch', null, 'stale'],
  ] as const)('%s', (_name, fetchStartedAt, kind) => {
    const alert = pickConnectionAlert(input({ lastSuccessAt, fetchStartedAt }))
    expect(alert === null ? null : alert.kind).toBe(kind)
    if (alert) expect(alert.text).toBe('最後更新 25 秒前')
  })
})

describe('spec 1.7 surface and dim per kind', () => {
  it.each([
    ['cloudflare_expired', 'bar', false],
    ['home_unreachable', 'bar', true],
    ['qbit_unreachable', 'bar', true],
    ['disconnected', 'speed', false],
    ['firewalled', 'speed', false],
    ['stale', 'stale', false],
  ] as const)('%s', (kind: ConnectionAlertKind, surface, dim) => {
    expect(alertSurface(kind)).toBe(surface)
    expect(dimsContent(kind)).toBe(dim)
  })
})

describe('spec 1.7 barFor: the one bar decision for both screens', () => {
  it('keeps the ticking 「最後更新」 part out of the stable text', () => {
    const alert = pickConnectionAlert(
      input({ errorCodes: ['home_unreachable'], lastSuccessAt: THREE_MIN_AGO }),
    )
    expect(barFor(alert)).toEqual({
      text: '連不到家裡的 NAS',
      detail: '最後更新 3 分前',
      icon: 'offline',
      action: 'retry',
      actionLabel: '重試',
    })
  })

  it.each([
    [
      'cloudflare_expired',
      'Cloudflare 登入過期了',
      'warning',
      'reload',
      '重新登入',
    ],
    [
      'qbit_unreachable',
      '家裡的 qBittorrent 沒有回應',
      'offline',
      'retry',
      '重試',
    ],
  ] as const)(
    '%s, fresh data: no detail',
    (code, text, icon, action, label) => {
      expect(
        barFor(pickConnectionAlert(input({ errorCodes: [code] }))),
      ).toEqual({
        text,
        detail: null,
        icon,
        action,
        actionLabel: label,
      })
    },
  )

  it.each([
    input({ connectionStatus: 'firewalled' }),
    input({ connectionStatus: 'disconnected' }),
    input({ lastSuccessAt: TWENTY_S_AGO }),
    input({}),
  ])('no bar for the other kinds or no alert', (value) => {
    expect(barFor(pickConnectionAlert(value))).toBeNull()
  })
})
