import { describe, expect, it } from 'vitest'
import { AppError } from '#/lib/app-error'
import { mergeMaindata } from '#/lib/maindata-merge'
import { fakeHash, fakeResponse, t } from '#/lib/testing'
import { selectBoardColumns } from '#/lib/visible-torrents'
import type { SlimTorrent } from '#/shared/maindata'
import {
  CARD_HEIGHT,
  CARD_HEIGHT_WITH_BAR,
  COLUMN_META,
  WORK_COLUMNS,
  boardView,
  cardHeight,
  cardHeightOf,
  cardModel,
  emptyText,
  totalOf,
} from '#/features/board/board-model'

// Spec 2.3: the board's columns, cards and states, pure. Clock: 2026-11-16
// 12:00 in Asia/Taipei, passed explicitly.

const NOW = Date.UTC(2026, 10, 16, 4, 0, 0)
const OPTIONS = { now: NOW, timeZone: 'Asia/Taipei', stateBeforeMove: {} }
const card = (overrides: Partial<SlimTorrent>) =>
  cardModel(t(overrides), OPTIONS)
const columnsOf = (torrents: Array<SlimTorrent>) =>
  selectBoardColumns(
    mergeMaindata(undefined, fakeResponse({ changed: torrents })),
  )

describe('columns', () => {
  it('four work columns in order, names and order tooltips as the mockup', () => {
    expect(WORK_COLUMNS).toEqual([
      'attention',
      'downloading',
      'seeding',
      'done',
    ])
    expect(
      Object.values(COLUMN_META).map((meta) => [meta.name, meta.order]),
    ).toEqual([
      ['要處理', '最新出問題的在前'],
      ['下載中', '新加入的在前'],
      ['做種中', '做種最久的在前'],
      ['完成', '剛完成的在前'],
      ['已整理', '完成時間新的在前'],
    ])
  })

  it('K7 an empty 要處理 says 都沒問題; other empty columns 沒有', () => {
    const columns = columnsOf([t({ hash: fakeHash(1) })])
    expect(emptyText('attention', columns)).toBe('都沒問題')
    expect(emptyText('done', columns)).toBe('沒有')
    expect(emptyText('archived', columns)).toBe('沒有')
  })

  it('K6 only archived: all four say 沒有', () => {
    const columns = columnsOf([
      t({ hash: fakeHash(1), state: 'missingFiles', private: false }),
    ])
    for (const column of WORK_COLUMNS) {
      expect(emptyText(column, columns)).toBe('沒有')
    }
    expect(totalOf(columns)).toBe(1)
  })
})

describe('K11 K14 board states', () => {
  it('no data: skeleton, or the error block for a first-load failure', () => {
    expect(boardView({ hasData: false, total: 0, error: null })).toBe(
      'skeleton',
    )
    expect(
      boardView({
        hasData: false,
        total: 0,
        error: new AppError('qbit_rejected'),
      }),
    ).toBe('error')
    // A code the alert bar shows keeps the skeleton.
    expect(
      boardView({
        hasData: false,
        total: 0,
        error: new AppError('home_unreachable'),
      }),
    ).toBe('skeleton')
  })

  it('no torrent at all: the empty block; archived ones count', () => {
    expect(boardView({ hasData: true, total: 0, error: null })).toBe('empty')
    expect(boardView({ hasData: true, total: 1, error: null })).toBe('board')
  })
})

describe('the card', () => {
  it('downloading: ring, percent, remaining time and speed, the bar', () => {
    const model = card({
      state: 'downloading',
      progress: 0.87,
      eta: 2040,
      dlspeed: 6_510_000,
    })
    expect(model.circle).toEqual({
      status: 'downloading',
      label: '下載中，87%',
      arcFraction: 0.87,
    })
    expect(model.percent).toBe('87%')
    expect(model.detail).toMatch(/^剩 34 分 · ↓ /)
    expect(model.progress).toBe(0.87)
    expect(cardHeight(model)).toBe(CARD_HEIGHT_WITH_BAR)
  })

  it('stalled and paused have the percent and the bar too', () => {
    expect(card({ state: 'stalledDL', progress: 0.42 })).toMatchObject({
      percent: '42%',
      detail: '卡在 42%，沒有來源',
      progress: 0.42,
    })
    expect(card({ state: 'pausedDL', progress: 0.45 })).toMatchObject({
      percent: '45%',
      detail: '手動暫停',
    })
  })

  it('done: no percent, no bar, the time it finished', () => {
    const model = card({
      state: 'stoppedUP',
      progress: 1,
      completion_on: Date.UTC(2026, 10, 16, 1, 12) / 1000,
    })
    expect(model.percent).toBeNull()
    expect(model.progress).toBeNull()
    expect(model.detail).toBe('今天 09:12 下載好了')
    expect(cardHeight(model)).toBe(CARD_HEIGHT)
  })

  it('story 2.10 error: the reason when there is one, else the fixed text', () => {
    expect(
      cardModel(t({ state: 'error' }), { ...OPTIONS, errorReason: '沒有權限' })
        .detail,
    ).toBe('沒有權限')
    expect(card({ state: 'error' }).detail).toBe('qBittorrent 回報錯誤')
  })

  it('moving: 搬移中 replaces the line', () => {
    const model = cardModel(t({ hash: fakeHash(5), state: 'moving' }), {
      ...OPTIONS,
      stateBeforeMove: { [fakeHash(5)]: 'stoppedUP' },
    })
    expect(model.detail).toBe('搬移中')
    expect(model.circle.status).toBe('done')
  })

  it('tags: the category only when there is one, the last two path segments', () => {
    expect(card({ category: 'mteam-tv' }).category).toBe('mteam-tv')
    expect(card({ category: '' }).category).toBeNull()
    expect(card({ save_path: '/data/media/tv/' }).location).toBe('media/tv')
  })

  it('names stay plain text', () => {
    expect(card({ name: '<img src=x onerror=alert(1)>' }).name).toBe(
      '<img src=x onerror=alert(1)>',
    )
  })

  it('cardHeightOf matches the card it describes', () => {
    for (const overrides of [
      { state: 'downloading' },
      { state: 'error' },
      { state: 'stalledDL' },
      { state: 'uploading', progress: 1 },
    ]) {
      const torrent = t(overrides)
      expect(cardHeightOf(torrent, {})).toBe(
        cardHeight(cardModel(torrent, OPTIONS)),
      )
    }
    expect(cardHeightOf(undefined, {})).toBe(CARD_HEIGHT)
  })
})
