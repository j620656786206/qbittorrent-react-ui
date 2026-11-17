import { describe, expect, it } from 'vitest'
import { fakeHash, t } from '#/lib/testing'
import {
  classify,
  KNOWN_STATE_CODES,
  PAUSE_ACTION_WORDS,
  heroKindOf,
  pauseActionOf,
  statusOf,
  statusOfHeroKind,
} from '#/lib/torrent-status'
import type { BoardColumn, TorrentStatusId } from '#/lib/torrent-status'
import type { SlimTorrent } from '#/shared/maindata'

// Spec 1.6 rows C1 to C5. Clock: 2026-11-16 12:00 in Asia/Taipei.

const NOW = Date.UTC(2026, 10, 16, 4, 0, 0)
const OPTIONS = { now: NOW, timeZone: 'Asia/Taipei', stateBeforeMove: {} }
const TODAY_0912 = Date.UTC(2026, 10, 16, 1, 12) / 1000
const MIB = 1024 ** 2
const DAY = 86_400

type Row = [
  state: string,
  overrides: Partial<SlimTorrent>,
  status: TorrentStatusId,
  word: string,
  column: BoardColumn,
  detail: string,
  showsProgress: boolean,
]

const DOWNLOADING = { eta: 34 * 60, dlspeed: 6.21 * MIB }
const SEEDING = { progress: 1, seeding_time: 41 * DAY }

const C1: Array<Row> = [
  ['error', {}, 'error', '錯誤', 'attention', 'qBittorrent 回報錯誤', false],
  [
    'stalledDL',
    { progress: 0.87 },
    'stalled',
    '停滯',
    'attention',
    '卡在 87%，沒有來源',
    true,
  ],
  [
    'downloading',
    DOWNLOADING,
    'downloading',
    '下載中',
    'downloading',
    '剩 34 分 · ↓ 6.21 MB/s',
    true,
  ],
  [
    'forcedDL',
    DOWNLOADING,
    'downloading',
    '下載中',
    'downloading',
    '剩 34 分 · ↓ 6.21 MB/s',
    true,
  ],
  ['metaDL', {}, 'downloading', '下載中', 'downloading', '抓種子資訊中', true],
  [
    'forcedMetaDL',
    {},
    'downloading',
    '下載中',
    'downloading',
    '抓種子資訊中',
    true,
  ],
  ['queuedDL', {}, 'downloading', '下載中', 'downloading', '排隊中', true],
  [
    'checkingDL',
    {},
    'downloading',
    '下載中',
    'downloading',
    '檢查檔案中',
    true,
  ],
  [
    'allocating',
    {},
    'downloading',
    '下載中',
    'downloading',
    '檢查檔案中',
    true,
  ],
  [
    'checkingResumeData',
    {},
    'downloading',
    '下載中',
    'downloading',
    '檢查檔案中',
    true,
  ],
  ['pausedDL', {}, 'paused', '已暫停', 'downloading', '手動暫停', true],
  ['stoppedDL', {}, 'paused', '已暫停', 'downloading', '手動暫停', true],
  ['uploading', SEEDING, 'seeding', '做種中', 'seeding', '做種 41 天', false],
  ['forcedUP', SEEDING, 'seeding', '做種中', 'seeding', '做種 41 天', false],
  ['queuedUP', SEEDING, 'seeding', '做種中', 'seeding', '做種 41 天', false],
  ['checkingUP', SEEDING, 'seeding', '做種中', 'seeding', '做種 41 天', false],
  ['stalledUP', SEEDING, 'seeding', '做種中', 'seeding', '沒人在抓', false],
  [
    'pausedUP',
    { progress: 1, completion_on: TODAY_0912 },
    'done',
    '已完成',
    'done',
    '今天 09:12 下載好了',
    false,
  ],
  [
    'stoppedUP',
    { progress: 1, completion_on: TODAY_0912 },
    'done',
    '已完成',
    'done',
    '今天 09:12 下載好了',
    false,
  ],
  ['unknown', {}, 'error', '錯誤', 'attention', '狀態不明', false],
]

describe('C1 the status table', () => {
  it.each(C1)(
    '%s -> %s',
    (state, overrides, status, word, column, detail, showsProgress) => {
      const torrent = t({ state, ...overrides })
      expect(classify(torrent, OPTIONS)).toEqual({
        status,
        word,
        column,
        detail,
        moving: false,
        showsProgress,
      })
      expect(statusOf(torrent, {})).toBe(status)
    },
  )

  it('downloading with speed 0 has no speed and an unknown ETA', () => {
    const torrent = t({ state: 'downloading', eta: 34 * 60, dlspeed: 0 })
    expect(classify(torrent, OPTIONS).detail).toBe('剩餘時間不明')
  })

  it('done without a completion time', () => {
    for (const completion_on of [0, -1]) {
      const torrent = t({ state: 'pausedUP', progress: 1, completion_on })
      expect(classify(torrent, OPTIONS).detail).toBe('下載好了')
    }
  })
})

describe('C2 missing files', () => {
  it.each(['X', 'mteam-X'])(
    'private, category %s: needs handling',
    (category) => {
      const torrent = t({ state: 'missingFiles', private: true, category })
      expect(classify(torrent, OPTIONS)).toMatchObject({
        status: 'error',
        word: '錯誤',
        column: 'attention',
        detail: '找不到檔案，做不了種',
      })
    },
  )

  it.each([false, null])('private %s: archived', (isPrivate) => {
    const torrent = t({ state: 'missingFiles', private: isPrivate })
    expect(classify(torrent, OPTIONS)).toMatchObject({
      status: 'archived',
      word: '已整理',
      column: 'archived',
      detail: '已整理',
      showsProgress: false,
    })
    expect(statusOf(torrent, {})).toBe('archived')
  })
})

describe('C3 moving', () => {
  const hash = fakeHash(7)

  it('keeps the remembered state', () => {
    const torrent = t({ hash, state: 'moving', progress: 0.4 })
    const result = classify(torrent, {
      ...OPTIONS,
      stateBeforeMove: { [hash]: 'pausedDL' },
    })
    expect(result).toEqual({
      status: 'paused',
      word: '已暫停',
      column: 'downloading',
      detail: '搬移中',
      moving: true,
      showsProgress: true,
    })
    expect(statusOf(torrent, { [hash]: 'pausedDL' })).toBe('paused')
  })

  it.each([
    [0.4, 'downloading', '下載中', 'downloading'],
    [1, 'seeding', '做種中', 'seeding'],
  ] as const)(
    'without a remembered state at progress %d: %s',
    (progress, status, word, column) => {
      const torrent = t({ hash, state: 'moving', progress })
      expect(classify(torrent, OPTIONS)).toMatchObject({
        status,
        word,
        column,
        detail: '搬移中',
        moving: true,
      })
    },
  )
})

describe('C4 unlisted codes', () => {
  it('read like unknown', () => {
    const torrent = t({ state: 'somethingNew' })
    expect(classify(torrent, OPTIONS)).toMatchObject({
      status: 'error',
      word: '錯誤',
      column: 'attention',
      detail: '狀態不明',
    })
  })

  it('an inherited object key is not a state', () => {
    expect(statusOf(t({ state: 'toString' }), {})).toBe('error')
  })
})

describe('C5 plain text', () => {
  it('leaves markup in the name alone and returns plain strings', () => {
    const name = '<b>Fake</b> <img src=x onerror=alert(1)>'
    const torrent = t({ name, state: 'stalledDL', progress: 0.5 })
    const result = classify(torrent, OPTIONS)
    expect(torrent.name).toBe(name)
    expect(typeof result.detail).toBe('string')
    expect(result.detail).toBe('卡在 50%，沒有來源')
  })
})

// Spec 2.5: the detail hero's row and the status come from one place, so
// they agree on every state code, an unlisted one, every `private` value
// and moves with and without a remembered state.
describe('heroKindOf agrees with classify', () => {
  const STATES = [
    'error',
    'missingFiles',
    'stalledDL',
    'downloading',
    'forcedDL',
    'metaDL',
    'forcedMetaDL',
    'queuedDL',
    'checkingDL',
    'allocating',
    'checkingResumeData',
    'pausedDL',
    'stoppedDL',
    'uploading',
    'forcedUP',
    'queuedUP',
    'checkingUP',
    'stalledUP',
    'pausedUP',
    'stoppedUP',
    'moving',
    'unknown',
    'someFutureState',
  ]
  const cases = STATES.flatMap((state) =>
    [true, false, null].flatMap((isPrivate) =>
      [0.5, 1].flatMap((progress) => [
        { state, isPrivate, progress, before: null as string | null },
        ...(state === 'moving'
          ? STATES.map((before) => ({ state, isPrivate, progress, before }))
          : []),
      ]),
    ),
  )

  it.each(cases)(
    '$state private=$isPrivate progress=$progress before=$before',
    ({ state, isPrivate, progress, before }) => {
      const torrent = t({ state, private: isPrivate, progress })
      const stateBeforeMove = before === null ? {} : { [torrent.hash]: before }
      const options = { ...OPTIONS, stateBeforeMove }
      const hero = heroKindOf(torrent, stateBeforeMove)
      expect(statusOfHeroKind(hero)).toBe(classify(torrent, options).status)
      expect(statusOfHeroKind(hero)).toBe(statusOf(torrent, stateBeforeMove))
    },
  )
})

// Spec 2.6 row M1: the 「⋯」 menu item. 繼續 for 已暫停 and 已完成 (paused or
// stopped, DL or UP, also while moving with such a remembered state), 暫停
// for every other code, an unlisted one and missing files either way.
describe('M1 pauseActionOf', () => {
  const START_STATES = new Set([
    'pausedDL',
    'stoppedDL',
    'pausedUP',
    'stoppedUP',
  ])
  const ALL_STATES = [
    'error',
    'missingFiles',
    'stalledDL',
    'downloading',
    'forcedDL',
    'metaDL',
    'forcedMetaDL',
    'queuedDL',
    'checkingDL',
    'allocating',
    'checkingResumeData',
    'pausedDL',
    'stoppedDL',
    'uploading',
    'forcedUP',
    'queuedUP',
    'checkingUP',
    'stalledUP',
    'pausedUP',
    'stoppedUP',
    'moving',
    'unknown',
  ]

  it('walks every code in STATE_KINDS', () => {
    expect([...ALL_STATES].sort()).toEqual([...KNOWN_STATE_CODES].sort())
  })

  it.each(ALL_STATES)('%s', (state) => {
    const torrent = t({ state, progress: state.endsWith('UP') ? 1 : 0.5 })
    const expected = START_STATES.has(state) ? 'start' : 'stop'
    expect(pauseActionOf(torrent, {})).toBe(expected)
  })

  it('an unlisted code reads 暫停', () => {
    expect(pauseActionOf(t({ state: 'someFutureState' }), {})).toBe('stop')
  })

  it.each([true, false, null])(
    'missingFiles with private=%s reads 暫停',
    (isPrivate) => {
      const torrent = t({
        state: 'missingFiles',
        progress: 1,
        private: isPrivate,
      })
      expect(pauseActionOf(torrent, {})).toBe('stop')
    },
  )

  it.each([
    ['pausedDL', 'start'],
    ['stoppedUP', 'start'],
    ['uploading', 'stop'],
    ['downloading', 'stop'],
  ] as const)('moving, remembered %s: %s', (before, expected) => {
    const torrent = t({ state: 'moving', progress: 1 })
    expect(pauseActionOf(torrent, { [torrent.hash]: before })).toBe(expected)
  })

  it('moving with nothing remembered reads 暫停', () => {
    expect(pauseActionOf(t({ state: 'moving', progress: 1 }), {})).toBe('stop')
  })

  it('words: 暫停 and 繼續', () => {
    expect(PAUSE_ACTION_WORDS).toEqual({ stop: '暫停', start: '繼續' })
  })
})
