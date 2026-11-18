import { describe, expect, it } from 'vitest'
import { showsRememberedHint } from '#/lib/remembered-hint'

// Story 3.2, EXPERIENCE sort-pill: when 「（這個分類記住的）」 shows.

const STATE = { sort: 'state', dir: 'desc' } as const
const SEEDING = { sort: 'seeding_time', dir: 'desc' } as const
const SEEDING_ASC = { sort: 'seeding_time', dir: 'asc' } as const

describe('showsRememberedHint', () => {
  it('a category switch that changed the sort shows it', () => {
    expect(
      showsRememberedHint({
        before: STATE,
        after: SEEDING,
        cause: 'category-switch',
      }),
    ).toBe(true)
  })

  it('a switch that changed only the direction shows it', () => {
    expect(
      showsRememberedHint({
        before: SEEDING,
        after: SEEDING_ASC,
        cause: 'category-switch',
      }),
    ).toBe(true)
  })

  it('the 「狀態」 fallback of a category that remembers none shows nothing', () => {
    expect(
      showsRememberedHint({
        before: SEEDING,
        after: STATE,
        cause: 'category-default',
      }),
    ).toBe(false)
  })

  it('a switch to the same sort shows nothing', () => {
    expect(
      showsRememberedHint({
        before: SEEDING,
        after: SEEDING,
        cause: 'category-switch',
      }),
    ).toBe(false)
  })

  it('a manual pick hides it', () => {
    expect(
      showsRememberedHint({ before: STATE, after: SEEDING, cause: 'manual' }),
    ).toBe(false)
    expect(
      showsRememberedHint({ before: null, after: null, cause: 'manual' }),
    ).toBe(false)
  })

  it('the app opening shows nothing', () => {
    expect(
      showsRememberedHint({ before: null, after: null, cause: 'open' }),
    ).toBe(false)
    expect(
      showsRememberedHint({ before: STATE, after: SEEDING, cause: 'open' }),
    ).toBe(false)
  })

  it('the next switch decides again', () => {
    const afterPick = { before: null, after: null, cause: 'manual' } as const
    expect(showsRememberedHint(afterPick)).toBe(false)
    expect(
      showsRememberedHint({
        before: SEEDING,
        after: STATE,
        cause: 'category-switch',
      }),
    ).toBe(true)
  })
})
