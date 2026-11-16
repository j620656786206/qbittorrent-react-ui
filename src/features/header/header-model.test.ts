import { describe, expect, it } from 'vitest'
import { pickConnectionAlert } from '#/lib/connection-alert'
import type { ConnectionAlertInput } from '#/lib/connection-alert'
import { mergeMaindata } from '#/lib/maindata-merge'
import { fakeHash, fakeResponse, fakeServerState, t } from '#/lib/testing'
import { countAll } from '#/lib/visible-torrents'
import { headerModel } from '#/features/header/header-model'

// Spec 1.7 rows H1 to H11. Byte values from the spec's matrix; the clock is
// fixed at 2026-11-16 12:00 in Asia/Taipei.

const D = 10_433_331
const U = 2_495_611
const L = 34_288_435
const NOW = Date.UTC(2026, 10, 16, 4, 0, 0)

const normal = fakeServerState({
  dl_info_speed: D,
  up_info_speed: U,
  dl_rate_limit: 0,
  up_rate_limit: L,
})

const alertFor = (overrides: Partial<ConnectionAlertInput>) =>
  pickConnectionAlert({
    errorCodes: [],
    connectionStatus: 'connected',
    lastSuccessAt: NOW - 1_000,
    fetchStartedAt: null,
    now: NOW,
    ...overrides,
  })

describe('H1 normal', () => {
  it('both speed groups with their limits, no bar, no dim', () => {
    expect(
      headerModel({ serverState: normal, alert: null, allCount: 4 }),
    ).toEqual({
      speeds: {
        down: {
          speed: '9.95 MB/s',
          limit: '不限速',
          spoken: '下載 9.95 MB/s，不限速',
        },
        up: {
          speed: '2.38 MB/s',
          limit: '上限 32.7',
          spoken: '上傳 2.38 MB/s，上限 32.7 MB/s',
        },
      },
      loading: false,
      warning: null,
      staleText: null,
      phoneLine: 'speeds',
      bar: null,
      dim: false,
      allCount: 4,
    })
  })
})

describe('H2 zero speed', () => {
  it('reads 0 KB/s', () => {
    const model = headerModel({
      serverState: fakeServerState({ dl_info_speed: 0 }),
      alert: null,
      allCount: 0,
    })
    expect(model.speeds?.down.speed).toBe('0 KB/s')
  })
})

describe('H3 alternative limit', () => {
  it('follows the limit in effect on each new data', () => {
    const steps = [
      normal,
      { ...normal, use_alt_speed_limits: true, dl_rate_limit: 10_485_760 },
      normal,
    ]
    expect(
      steps.map(
        (serverState) =>
          headerModel({ serverState, alert: null, allCount: 4 }).speeds?.down
            .limit,
      ),
    ).toEqual(['不限速', '上限 10.0', '不限速'])
  })
})

describe('H4 limit text', () => {
  it.each([
    [0, '不限速'],
    [-1, '不限速'],
    [L, '上限 32.7'],
    [10_485_760, '上限 10.0'],
    [1_048_576, '上限 1.00'],
    [512_000, '上限 500 KB/s'],
  ])('up limit %d -> %s', (up_rate_limit, text) => {
    const model = headerModel({
      serverState: { ...normal, up_rate_limit },
      alert: null,
      allCount: 4,
    })
    expect(model.speeds?.up.limit).toBe(text)
  })
})

describe('H5 firewalled, disconnected', () => {
  it.each([
    ['firewalled', '防火牆擋住了'],
    ['disconnected', '斷線了'],
  ] as const)('%s: one warning, no bar, no dim', (status, text) => {
    const model = headerModel({
      serverState: { ...normal, connection_status: status },
      alert: alertFor({ connectionStatus: status }),
      allCount: 4,
    })
    expect(model.warning).toBe(text)
    expect(model.phoneLine).toBe('warning')
    expect(model.bar).toBeNull()
    expect(model.dim).toBe(false)
    expect(model.staleText).toBeNull()
  })
})

describe('H6 stale', () => {
  it('speeds stay, the muted text is added, no dim', () => {
    const model = headerModel({
      serverState: normal,
      alert: alertFor({ lastSuccessAt: NOW - 20_000 }),
      allCount: 4,
    })
    expect(model.speeds).not.toBeNull()
    expect(model.staleText).toBe('最後更新 20 秒前')
    expect(model.phoneLine).toBe('speeds')
    expect(model.bar).toBeNull()
    expect(model.warning).toBeNull()
    expect(model.dim).toBe(false)
  })
})

describe('H7 home unreachable', () => {
  it('bar with retry, last speeds kept, phone line is the bar, dim', () => {
    const model = headerModel({
      serverState: normal,
      alert: alertFor({
        errorCodes: ['home_unreachable'],
        lastSuccessAt: NOW - 3 * 60_000,
      }),
      allCount: 4,
    })
    expect(model.bar).toEqual({
      text: '連不到家裡的 NAS',
      detail: '最後更新 3 分前',
      icon: 'offline',
      action: 'retry',
      actionLabel: '重試',
    })
    expect(model.speeds?.down.speed).toBe('9.95 MB/s')
    expect(model.phoneLine).toBe('bar')
    expect(model.staleText).toBeNull()
    expect(model.dim).toBe(true)
  })
})

describe('H8 qBittorrent not responding', () => {
  it.each([
    ['fresh', NOW - 1_000, null],
    ['stale', NOW - 20_000, '最後更新 20 秒前'],
  ])('%s: bar with retry, dim', (_name, lastSuccessAt, detail) => {
    const model = headerModel({
      serverState: normal,
      alert: alertFor({ errorCodes: ['qbit_unreachable'], lastSuccessAt }),
      allCount: 4,
    })
    expect(model.bar).toMatchObject({
      text: '家裡的 qBittorrent 沒有回應',
      detail,
      action: 'retry',
      icon: 'offline',
    })
    expect(model.dim).toBe(true)
  })
})

describe('H9 Cloudflare expired', () => {
  it('one bar with 重新登入, no dim, whatever else is active', () => {
    const model = headerModel({
      serverState: { ...normal, connection_status: 'firewalled' },
      alert: alertFor({
        errorCodes: ['cloudflare_expired', 'home_unreachable'],
        connectionStatus: 'firewalled',
        lastSuccessAt: NOW - 3 * 60_000,
      }),
      allCount: 4,
    })
    expect(model.bar).toEqual({
      text: 'Cloudflare 登入過期了',
      detail: null,
      icon: 'warning',
      action: 'reload',
      actionLabel: '重新登入',
    })
    expect(model.warning).toBeNull()
    expect(model.dim).toBe(false)
  })
})

describe('H10 no data yet', () => {
  it('skeleton speeds and count, no bar', () => {
    const model = headerModel({
      serverState: undefined,
      alert: alertFor({ connectionStatus: null, lastSuccessAt: null }),
      allCount: undefined,
    })
    expect(model.speeds).toBeNull()
    expect(model.allCount).toBeNull()
    expect(model.bar).toBeNull()
    expect(model.phoneLine).toBe('speeds')
  })

  it('with home_unreachable: the bar without the suffix', () => {
    const model = headerModel({
      serverState: undefined,
      alert: alertFor({
        errorCodes: ['home_unreachable'],
        connectionStatus: null,
        lastSuccessAt: null,
      }),
      allCount: undefined,
    })
    expect(model.speeds).toBeNull()
    expect(model.bar?.text).toBe('連不到家裡的 NAS')
    expect(model.bar?.detail).toBeNull()
    expect(model.dim).toBe(true)
  })
})

describe('H11 count', () => {
  it('6 fake torrents, 2 archived: 「全部 4」', () => {
    const torrents = [
      t({ hash: fakeHash(1), state: 'downloading' }),
      t({ hash: fakeHash(2), state: 'uploading', progress: 1 }),
      t({ hash: fakeHash(3), state: 'stalledDL', category: 'mteam-X' }),
      t({ hash: fakeHash(4), state: 'missingFiles', private: true }),
      t({ hash: fakeHash(5), state: 'missingFiles', private: false }),
      t({ hash: fakeHash(6), state: 'missingFiles', category: 'mteam-tv' }),
    ]
    const maindata = mergeMaindata(
      undefined,
      fakeResponse({ changed: torrents }),
    )
    const model = headerModel({
      serverState: maindata.serverState,
      alert: null,
      allCount: countAll(maindata),
    })
    expect(model.allCount).toBe(4)
  })
})

// Spec 1.8 row H1 (option A): the first load failed with a code that has no
// alert; the header leaves its skeletons.
describe('spec 1.8 H1 first-load error', () => {
  it('no data and qbit_rejected: not loading, no speeds, no count, no bar', () => {
    const model = headerModel({
      serverState: undefined,
      alert: null,
      allCount: undefined,
      loadFailed: true,
    })
    expect(model.loading).toBe(false)
    expect(model.speeds).toBeNull()
    expect(model.allCount).toBeNull()
    expect(model.bar).toBeNull()
    expect(model.dim).toBe(false)
  })

  it('no data and no failure: loading (skeletons)', () => {
    const model = headerModel({
      serverState: undefined,
      alert: null,
      allCount: undefined,
    })
    expect(model.loading).toBe(true)
  })

  it('data wins over an old failure', () => {
    const model = headerModel({
      serverState: normal,
      alert: null,
      allCount: 4,
      loadFailed: true,
    })
    expect(model.loading).toBe(false)
    expect(model.speeds).not.toBeNull()
  })
})
