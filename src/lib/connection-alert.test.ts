import { describe, expect, it } from 'vitest'
import { pickConnectionAlert } from '#/lib/connection-alert'
import type { ConnectionAlertInput } from '#/lib/connection-alert'

// Spec 1.6 rows A1 to A3, plus the review rows A4 (suffix only when stale,
// never-fetched, fetch in flight). Clock: 2026-11-16 12:00 in Asia/Taipei.

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
  isFetching: false,
  now: NOW,
  ...overrides,
})

describe('A1 each alert alone', () => {
  it.each([
    [
      'cloudflare_expired',
      input({ errorCodes: ['cloudflare_expired'] }),
      'cloudflare_expired',
      'Cloudflare 登入過期了',
      'warning',
    ],
    [
      'home_unreachable',
      input({ errorCodes: ['home_unreachable'], lastSuccessAt: THREE_MIN_AGO }),
      'home_unreachable',
      '連不到家裡的 NAS，最後更新 3 分前',
      'warning',
    ],
    [
      'qbit_unreachable',
      input({ errorCodes: ['qbit_unreachable'], lastSuccessAt: THREE_MIN_AGO }),
      'qbit_unreachable',
      '家裡的 qBittorrent 沒有回應，最後更新 3 分前',
      'warning',
    ],
    [
      'disconnected',
      input({ connectionStatus: 'disconnected' }),
      'disconnected',
      '斷線了',
      'warning',
    ],
    [
      'firewalled',
      input({ connectionStatus: 'firewalled' }),
      'firewalled',
      '防火牆擋住了',
      'warning',
    ],
    [
      'stale',
      input({ lastSuccessAt: TWENTY_S_AGO }),
      'stale',
      '最後更新 20 秒前',
      'muted',
    ],
  ] as const)('%s', (_name, value, kind, text, tone) => {
    expect(pickConnectionAlert(value)).toEqual({ kind, text, tone })
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

  it('home unreachable without a last success has no suffix', () => {
    expect(
      pickConnectionAlert(
        input({ errorCodes: ['home_unreachable'], lastSuccessAt: null }),
      )?.text,
    ).toBe('連不到家裡的 NAS')
  })
})

describe('A4 when the 「最後更新」 part shows', () => {
  it('a failure 5 s after a success has no suffix (not 「剛剛」)', () => {
    expect(
      pickConnectionAlert(
        input({ errorCodes: ['home_unreachable'], lastSuccessAt: NOW - 5_000 }),
      )?.text,
    ).toBe('連不到家裡的 NAS')
  })

  it('the suffix appears once the data is past the stale threshold', () => {
    expect(
      pickConnectionAlert(
        input({
          errorCodes: ['qbit_unreachable'],
          lastSuccessAt: NOW - 10_001,
        }),
      )?.text,
    ).toBe('家裡的 qBittorrent 沒有回應，最後更新 10 秒前')
  })

  it.each([0, -1])('lastSuccessAt %d counts as never', (lastSuccessAt) => {
    expect(pickConnectionAlert(input({ lastSuccessAt }))).toBeNull()
    expect(
      pickConnectionAlert(
        input({ errorCodes: ['home_unreachable'], lastSuccessAt }),
      )?.text,
    ).toBe('連不到家裡的 NAS')
  })

  it('no stale line while a fetch is in flight', () => {
    expect(
      pickConnectionAlert(
        input({ lastSuccessAt: TWENTY_S_AGO, isFetching: true }),
      ),
    ).toBeNull()
  })

  it('a fetch in flight does not hide the higher alerts', () => {
    expect(
      pickConnectionAlert(
        input({
          errorCodes: ['home_unreachable'],
          lastSuccessAt: TWENTY_S_AGO,
          isFetching: true,
        }),
      )?.text,
    ).toBe('連不到家裡的 NAS，最後更新 20 秒前')
    expect(
      pickConnectionAlert(
        input({ connectionStatus: 'firewalled', isFetching: true }),
      )?.kind,
    ).toBe('firewalled')
  })
})
