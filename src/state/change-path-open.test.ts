import { afterEach, describe, expect, it } from 'vitest'
import {
  changePathOpenStore,
  closeChangePath,
  openChangePath,
  resetChangePathOpen,
} from '#/state/change-path-open'

// Spec 5.2: the change-path screen's open state.

afterEach(() => resetChangePathOpen())

describe('change-path open store', () => {
  it('starts closed, opens with hashes, closes', () => {
    expect(changePathOpenStore.state.open).toBeNull()
    openChangePath(['a'.repeat(40)])
    expect(changePathOpenStore.state.open).toEqual({ hashes: ['a'.repeat(40)] })
    closeChangePath()
    expect(changePathOpenStore.state.open).toBeNull()
  })

  it('a new open replaces the old one; no hashes does nothing', () => {
    openChangePath(['a'.repeat(40)])
    openChangePath(['b'.repeat(40)])
    expect(changePathOpenStore.state.open).toEqual({ hashes: ['b'.repeat(40)] })
    openChangePath([])
    expect(changePathOpenStore.state.open).toEqual({ hashes: ['b'.repeat(40)] })
  })

  it('keeps its own copy of the list', () => {
    const list = ['a'.repeat(40)]
    openChangePath(list)
    list.push('b'.repeat(40))
    expect(changePathOpenStore.state.open?.hashes).toEqual(['a'.repeat(40)])
  })
})
