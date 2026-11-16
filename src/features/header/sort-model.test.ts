import { describe, expect, it } from 'vitest'
import {
  directionWords,
  pickSort,
  sortPillModel,
} from '#/features/header/sort-model'

// Spec 2.1: the pill's text and words, and what a menu click does (S6, S7).

describe('sortPillModel', () => {
  it('arrow on the pill, words in the label and tooltip', () => {
    expect(sortPillModel({ sort: 'seeding_time', dir: 'desc' })).toEqual({
      text: '排序：做種時間 ↓',
      shortText: '做種時間 ↓',
      title: '排序：做種時間，久的在前',
      ariaLabel: '排序：做種時間，久的在前，列表',
    })
    expect(sortPillModel({ sort: 'name', dir: 'asc' }).title).toBe(
      '排序：名稱，Z 到 A',
    )
  })

  it('狀態 has no arrow and no words', () => {
    expect(sortPillModel({ sort: 'state', dir: 'desc' })).toEqual({
      text: '排序：狀態',
      shortText: '狀態',
      title: '排序：狀態',
      ariaLabel: '排序：狀態，列表',
    })
    expect(directionWords({ sort: 'state', dir: 'desc' })).toBeNull()
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

  it('S7 another one takes its default direction and closes', () => {
    expect(pickSort({ sort: 'ratio', dir: 'asc' }, 'name')).toEqual({
      view: { sort: 'name', dir: 'desc' },
      keepOpen: false,
    })
  })
})
