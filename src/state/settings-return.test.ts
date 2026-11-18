import { afterEach, describe, expect, it } from 'vitest'
import {
  clearListReturn,
  listReturnSearch,
  rememberListSearch,
} from '#/state/settings-return'

// Story 3.3: the list URL the settings page's back button returns to, in
// memory only. Fake hashes and code-name categories only.

const HASH = 'a'.repeat(40)

afterEach(() => clearListReturn())

describe('the settings return search', () => {
  it('nothing recorded (opened directly): plain /', () => {
    expect(listReturnSearch()).toEqual({})
  })

  it('keeps category, sort, dir and hash', () => {
    rememberListSearch({
      category: 'mteam-X',
      sort: 'ratio',
      dir: 'asc',
      hash: HASH,
    })
    expect(listReturnSearch()).toEqual({
      category: 'mteam-X',
      sort: 'ratio',
      dir: 'asc',
      hash: HASH,
    })
  })

  it('uncategorized stays an empty category', () => {
    rememberListSearch({ category: '' })
    expect(listReturnSearch()).toEqual({ category: '' })
  })

  it('bad or unknown params are dropped', () => {
    rememberListSearch({ sort: 'nope', hash: 'xyz', other: 1, dir: 'desc' })
    expect(listReturnSearch()).toEqual({ dir: 'desc' })
  })

  it('the last recorded wins', () => {
    rememberListSearch({ sort: 'ratio' })
    rememberListSearch({})
    expect(listReturnSearch()).toEqual({})
  })
})
