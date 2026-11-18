import { describe, expect, it } from 'vitest'
import {
  directionWords,
  REMEMBERED_HINT_LINE_PREFIX,
  pickSort,
  rememberedHintLine,
  sortPillModel,
} from '#/features/header/sort-model'

// Spec 2.1: the pill's text and words, and what a menu click does (S6, S7).

describe('sortPillModel', () => {
  it('arrow on the pill, words in the label and tooltip', () => {
    expect(sortPillModel({ sort: 'seeding_time', dir: 'desc' })).toEqual({
      kind: 'list',
      viewWord: '列表',
      text: '排序：做種時間 ↓',
      shortText: '做種時間 ↓',
      title: '排序：做種時間，久的在前',
      ariaLabel: '排序：做種時間，久的在前，列表',
      hint: null,
    })
    expect(sortPillModel({ sort: 'name', dir: 'asc' }).title).toBe(
      '排序：名稱，Z 到 A',
    )
  })

  it('狀態 is the board: no arrow, no words, 看板 last', () => {
    expect(sortPillModel({ sort: 'state', dir: 'desc' })).toEqual({
      kind: 'board',
      viewWord: '看板',
      text: '排序：狀態',
      shortText: '狀態',
      title: '排序：狀態',
      ariaLabel: '排序：狀態，看板',
      hint: null,
    })
    expect(directionWords({ sort: 'state', dir: 'desc' })).toBeNull()
  })

  it('story 3.2: the hint goes in the label before the view word, never the tooltip', () => {
    const pill = sortPillModel(
      { sort: 'seeding_time', dir: 'desc' },
      { rememberedHint: true },
    )
    expect(pill.hint).toBe('（這個分類記住的）')
    expect(pill.ariaLabel).toBe(
      '排序：做種時間，久的在前（這個分類記住的），列表',
    )
    expect(pill.title).toBe('排序：做種時間，久的在前')
    expect(pill.text).toBe('排序：做種時間 ↓')
  })
})

describe('pickSort', () => {
  it('S6 the selected one flips and keeps the menu open', () => {
    expect(pickSort({ sort: 'ratio', dir: 'desc' }, 'ratio')).toEqual({
      view: { sort: 'ratio', dir: 'asc' },
      keepOpen: true,
    })
    expect(pickSort({ sort: 'ratio', dir: 'asc' }, 'ratio')?.view.dir).toBe(
      'desc',
    )
  })

  it('the selected field without a direction changes nothing', () => {
    expect(pickSort({ sort: 'state', dir: 'desc' }, 'state')).toBeNull()
  })

  it('K2 狀態 from the list, and back: default direction, closes', () => {
    expect(pickSort({ sort: 'ratio', dir: 'asc' }, 'state')).toEqual({
      view: { sort: 'state', dir: 'desc' },
      keepOpen: false,
    })
    expect(pickSort({ sort: 'state', dir: 'desc' }, 'seeding_time')).toEqual({
      view: { sort: 'seeding_time', dir: 'desc' },
      keepOpen: false,
    })
  })

  it('S7 another one takes its default direction and closes', () => {
    expect(pickSort({ sort: 'ratio', dir: 'asc' }, 'name')).toEqual({
      view: { sort: 'name', dir: 'desc' },
      keepOpen: false,
    })
  })
})

describe('rememberedHintLine (story 3.4)', () => {
  it('the sort as the phone pill shows it: name and arrow', () => {
    expect(REMEMBERED_HINT_LINE_PREFIX).toBe('排序換成這個分類記住的：')
    expect(rememberedHintLine({ sort: 'seeding_time', dir: 'desc' })).toBe(
      `${REMEMBERED_HINT_LINE_PREFIX}做種時間 ↓`,
    )
    expect(rememberedHintLine({ sort: 'state', dir: 'desc' })).toBe(
      `${REMEMBERED_HINT_LINE_PREFIX}狀態`,
    )
  })

  it('a switch that only flips the direction reads differently', () => {
    expect(rememberedHintLine({ sort: 'seeding_time', dir: 'asc' })).toBe(
      `${REMEMBERED_HINT_LINE_PREFIX}做種時間 ↑`,
    )
  })
})
