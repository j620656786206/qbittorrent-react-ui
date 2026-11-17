import { describe, expect, it } from 'vitest'
import { detailHero } from '#/lib/detail-hero'
import type { DetailHeroOptions } from '#/lib/detail-hero'
import { t } from '#/lib/testing'
import type { TorrentStatusId } from '#/lib/torrent-status'
import type { SlimTorrent } from '#/shared/maindata'

// Spec 2.5 rows H1 and H2: the 12 rows of EXPERIENCE 「詳情狀態區每種狀態
// 寫什麼」, one test each. Clock: 2026-11-16 12:00 in Asia/Taipei.

const NOW = Date.UTC(2026, 10, 16, 4, 0, 0)
const OPTIONS: DetailHeroOptions = {
  now: NOW,
  timeZone: 'Asia/Taipei',
  stateBeforeMove: {},
  uploaded: 301.2 * 1024 ** 3,
}
const MIB = 1024 ** 2
const DAY = 86_400
const TODAY_0912 = Date.UTC(2026, 10, 16, 1, 12) / 1000
const JULY_2025 = Date.UTC(2025, 6, 18, 4, 0) / 1000
const TV = { category: 'mteam-tv', size: 85 * 1024 ** 3 }

type Row = [
  name: string,
  torrent: Partial<SlimTorrent>,
  status: TorrentStatusId,
  headline: string,
  summary: string,
]

const H1: Array<Row> = [
  [
    '下載中',
    {
      ...TV,
      state: 'downloading',
      progress: 0.87,
      eta: 34 * 60,
      dlspeed: 6.21 * MIB,
    },
    'downloading',
    '下載中\u300087%',
    '剩 34 分 · ↓ 6.21 MB/s · 85 GB · mteam-tv',
  ],
  [
    '抓種子資訊中',
    { ...TV, state: 'metaDL', progress: 0 },
    'downloading',
    '抓種子資訊中',
    '還不知道大小 · mteam-tv',
  ],
  [
    '排隊中',
    { ...TV, state: 'queuedDL', progress: 0.12 },
    'downloading',
    '排隊中\u300012%',
    '85 GB · mteam-tv',
  ],
  [
    '檢查檔案中',
    { ...TV, state: 'checkingDL', progress: 0.45 },
    'downloading',
    '檢查檔案中\u300045%',
    '85 GB · mteam-tv',
  ],
  [
    '已暫停',
    { ...TV, state: 'stoppedDL', progress: 0.87 },
    'paused',
    '已暫停\u300087%',
    '手動暫停 · 85 GB · mteam-tv',
  ],
  [
    '停滯',
    { ...TV, state: 'stalledDL', progress: 0.87 },
    'stalled',
    '停滯\u300087%',
    '沒有來源 · 85 GB · mteam-tv',
  ],
  [
    '做種中',
    {
      size: 85 * 1024 ** 3,
      category: 'mteam-seed',
      state: 'uploading',
      progress: 1,
      ratio: 3.12,
      seeding_time: 41 * DAY,
    },
    'seeding',
    '做種 41 天',
    '分享率 3.12 · 已上傳 301.2 GB · 85 GB · mteam-seed',
  ],
  [
    '已完成',
    {
      ...TV,
      state: 'stoppedUP',
      progress: 1,
      ratio: 3.12,
      completion_on: TODAY_0912,
    },
    'done',
    '已完成',
    '今天 09:12 下載好了 · 分享率 3.12 · 85 GB · mteam-tv',
  ],
  [
    '找不到檔案 (private)',
    { ...TV, state: 'missingFiles', progress: 1, private: true },
    'error',
    '找不到檔案',
    '做不了種 · 85 GB · mteam-tv',
  ],
  [
    '錯誤 (error)',
    { ...TV, state: 'error', progress: 0.3 },
    'error',
    '錯誤',
    'qBittorrent 回報錯誤',
  ],
  [
    '狀態不明 (unknown)',
    { ...TV, state: 'unknown', progress: 0.1 },
    'error',
    '狀態不明',
    '85 GB · mteam-tv',
  ],
  [
    '已整理',
    {
      size: 85 * 1024 ** 3,
      category: 'X',
      state: 'missingFiles',
      progress: 1,
      completion_on: JULY_2025,
    },
    'archived',
    '已整理',
    '留著當紀錄 · 2025/07/18 下載好了 · 85 GB · X',
  ],
]

describe('H1 the 12 hero rows', () => {
  it.each(H1)('%s', (_name, overrides, status, headline, summary) => {
    const hero = detailHero(t(overrides), OPTIONS)
    expect(hero.status).toBe(status)
    expect(hero.circle.status).toBe(status)
    expect(hero.headline).toBe(headline)
    expect(hero.summary).toBe(summary)
  })

  it('an unlisted (future) state reads as 狀態不明', () => {
    const hero = detailHero(t({ ...TV, state: 'someNewState' }), OPTIONS)
    expect(hero.headline).toBe('狀態不明')
    expect(hero.status).toBe('error')
  })

  it('AR-58: missing files with `private: null` is 已整理', () => {
    const hero = detailHero(
      t({ state: 'missingFiles', progress: 1, private: null }),
      OPTIONS,
    )
    expect(hero.headline).toBe('已整理')
    expect(hero.status).toBe('archived')
  })

  it('the circle: a ring with a label for statuses that show progress', () => {
    expect(
      detailHero(t({ state: 'stalledDL', progress: 0.87 }), OPTIONS).circle,
    ).toEqual({ status: 'stalled', label: '停滯，87%', arcFraction: 0.87 })
    expect(
      detailHero(t({ state: 'uploading', progress: 1 }), OPTIONS).circle,
    ).toEqual({ status: 'seeding', label: '做種中', arcFraction: null })
  })

  it('a moving torrent keeps the row it had before (no 搬移中 text: Epic 5)', () => {
    const torrent = t({ state: 'moving', progress: 0.87 })
    const remembered = detailHero(torrent, {
      ...OPTIONS,
      stateBeforeMove: { [torrent.hash]: 'pausedDL' },
    })
    expect(remembered.headline).toBe('已暫停\u300087%')
    expect(detailHero(torrent, OPTIONS).headline).toBe('下載中\u300087%')
    expect(
      detailHero(t({ state: 'moving', progress: 1 }), OPTIONS).headline,
    ).toBe('做種 不到 1 分')
  })
})

describe('H2 summary gaps', () => {
  it('an empty category is left out', () => {
    expect(
      detailHero(t({ ...TV, category: '', state: 'queuedDL' }), OPTIONS)
        .summary,
    ).toBe('85 GB')
  })

  it('downloading at 0 B/s: no speed part, 「剩餘時間不明」', () => {
    expect(
      detailHero(
        t({ ...TV, state: 'downloading', dlspeed: 0, eta: 120 }),
        OPTIONS,
      ).summary,
    ).toBe('剩餘時間不明 · 85 GB · mteam-tv')
  })

  it('an infinite eta: 「剩餘時間不明」 with the speed', () => {
    expect(
      detailHero(
        t({ ...TV, state: 'downloading', dlspeed: 2 * MIB, eta: 8_640_000 }),
        OPTIONS,
      ).summary,
    ).toBe('剩餘時間不明 · ↓ 2.00 MB/s · 85 GB · mteam-tv')
  })

  it('已上傳: 「…」 before the first answer, left out when unknown', () => {
    const seeding = t({ ...TV, state: 'stalledUP', progress: 1, ratio: 1 })
    expect(
      detailHero(seeding, { ...OPTIONS, uploaded: undefined }).summary,
    ).toBe('分享率 1.00 · 已上傳 … · 85 GB · mteam-tv')
    expect(detailHero(seeding, { ...OPTIONS, uploaded: null }).summary).toBe(
      '分享率 1.00 · 85 GB · mteam-tv',
    )
  })

  it('已完成 or 已整理 never completed: no date', () => {
    expect(
      detailHero(t({ ...TV, state: 'pausedUP', progress: 1 }), OPTIONS).summary,
    ).toBe('下載好了 · 分享率 0.00 · 85 GB · mteam-tv')
    expect(
      detailHero(t({ ...TV, state: 'missingFiles', progress: 1 }), OPTIONS)
        .summary,
    ).toBe('留著當紀錄 · 85 GB · mteam-tv')
  })

  it('names and categories are plain text', () => {
    expect(
      detailHero(t({ category: '<b>x</b>', state: 'queuedDL' }), OPTIONS)
        .summary,
    ).toBe('85 GB · <b>x</b>')
  })
})
