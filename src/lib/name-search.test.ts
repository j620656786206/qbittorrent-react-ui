import { describe, expect, it } from 'vitest'
import { nameMatches, noResultText, searchNeedle } from '#/lib/name-search'
import { t } from '#/lib/testing'
import { ALL } from '#/shared/categories'

// Story 3.5: name only, any case, trimmed, literal, empty is no filter.

const named = (name: string) => t({ name })

describe('searchNeedle', () => {
  it('trims and lowercases; empty or only spaces is no filter', () => {
    expect(searchNeedle('  Show.S01 ')).toBe('show.s01')
    expect(searchNeedle('')).toBeNull()
    expect(searchNeedle('   ')).toBeNull()
    expect(searchNeedle(undefined)).toBeNull()
  })
})

describe('nameMatches', () => {
  it('matches a substring in any case', () => {
    const needle = searchNeedle('  Show.S01 ')
    expect(nameMatches(named('Fake.SHOW.s01E02.1080p'), needle)).toBe(true)
    expect(nameMatches(named('Fake.Show.S02E01.1080p'), needle)).toBe(false)
  })

  it('no needle matches every name', () => {
    expect(nameMatches(named('anything'), null)).toBe(true)
  })

  it.each([
    ['.', 'a.b', 'ab'],
    ['.*', 'x.*y', 'xay'],
    ['(', 'Show (2024)', 'Show 2024'],
    ['<script>', '<script>alert(1)</script>', 'script'],
    ['[a-z]+', 'tag[a-z]+', 'abc'],
    ['\\d', 'a\\d', '1'],
  ])('%j matches itself only', (keyword, hit, miss) => {
    const needle = searchNeedle(keyword)
    expect(nameMatches(named(hit), needle)).toBe(true)
    expect(nameMatches(named(miss), needle)).toBe(false)
  })

  it('a renamed torrent object is compared by its new name', () => {
    const torrent = named('Old.Name')
    expect(nameMatches(torrent, 'old')).toBe(true)
    torrent.name = 'New.Name'
    expect(nameMatches(torrent, 'old')).toBe(false)
    expect(nameMatches(torrent, 'new')).toBe(true)
  })

  it('full-width digits and letters match their half-width forms, both ways', () => {
    expect(searchNeedle('Ｓ０１Ｅ０２')).toBe('s01e02')
    expect(nameMatches(named('Fake.Show.S01E02'), searchNeedle('Ｓ０１'))).toBe(
      true,
    )
    expect(
      nameMatches(named('Ｆａｋｅ．Ｓ０１'), searchNeedle('fake.s01')),
    ).toBe(true)
  })

  it('CJK names match', () => {
    expect(nameMatches(named('牧神記.S01'), searchNeedle('牧神記'))).toBe(true)
  })
})

describe('noResultText', () => {
  it('names the category, or only the keyword in 「全部」', () => {
    expect(noResultText('牧神記', 'mteam-tv')).toBe(
      '『牧神記』在 mteam-tv 找不到',
    )
    expect(noResultText(' 牧神記 ', ALL)).toBe('找不到『牧神記』')
    expect(noResultText('x', '')).toBe('『x』在 未分類 找不到')
  })
})
