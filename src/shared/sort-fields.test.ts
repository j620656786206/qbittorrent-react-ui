import { describe, expect, it } from 'vitest'
import {
  EXTRA_SORT_FIELD_IDS,
  MORE_SORT_GROUPS,
  SORT_FIELDS,
  SORT_FIELD_IDS,
  SORT_GROUP_LABELS,
  TOP_SORT_FIELDS,
  dirArrow,
  isExtraSortField,
  isSortFieldId,
  isUnderMore,
  sortField,
} from '#/shared/sort-fields'
import type { SortFieldDef } from '#/shared/sort-fields'

// Spec 2.1 row S1: exactly 51 ids, top five in order, the three dropped
// fields absent, 46 under 更多, every attribute present.

const SLIM = [
  'state',
  'seeding_time',
  'added_on',
  'ratio',
  'completion_on',
  'last_activity',
  'eta',
  'progress',
  'dlspeed',
  'upspeed',
  'global_speed',
  'size',
  'name',
  'category',
  'private',
  'save_path',
  'save_path_basename',
  'hash',
]

describe('SORT_FIELDS (S1)', () => {
  it('has exactly 51 unique snake_case ids', () => {
    expect(SORT_FIELD_IDS).toHaveLength(51)
    expect(new Set(SORT_FIELD_IDS).size).toBe(51)
    for (const id of SORT_FIELD_IDS) expect(id).toMatch(/^[a-z][a-z0-9_]*$/)
  })

  it('starts with the top five in order', () => {
    expect(TOP_SORT_FIELDS.map((entry) => entry.id)).toEqual([
      'state',
      'seeding_time',
      'added_on',
      'ratio',
      'completion_on',
    ])
    expect(TOP_SORT_FIELDS.map((entry) => entry.top)).toEqual([1, 2, 3, 4, 5])
    expect(SORT_FIELD_IDS.slice(0, 5)).toEqual(
      TOP_SORT_FIELDS.map((entry) => entry.id),
    )
  })

  it('never has the download path, its basename or tags', () => {
    for (const id of [
      'download_path',
      'basename_download_path',
      'download_path_basename',
      'tags',
    ]) {
      expect(isSortFieldId(id)).toBe(false)
    }
  })

  it('lists 46 under 更多, in ten groups in the EXPERIENCE order', () => {
    const more = MORE_SORT_GROUPS.flatMap((group) => group.fields)
    expect(more).toHaveLength(46)
    expect(MORE_SORT_GROUPS.map((group) => group.label)).toEqual([
      '時間',
      '進度',
      '速度',
      '流量和分享率',
      '大小',
      '人數',
      '名稱和分類',
      '路徑',
      '限制和設定',
      '技術資訊',
    ])
    // The top five appear only once.
    for (const top of TOP_SORT_FIELDS) {
      expect(more.map((entry) => entry.id)).not.toContain(top.id)
      expect(isUnderMore(top.id as never)).toBe(false)
    }
    expect(isUnderMore('num_seeds')).toBe(true)
    // Group sizes after the top five and the three dropped fields.
    expect(MORE_SORT_GROUPS.map((group) => group.fields.length)).toEqual([
      4, 3, 5, 6, 2, 4, 5, 5, 7, 5,
    ])
  })

  it('every field has every attribute', () => {
    for (const entry of SORT_FIELDS as ReadonlyArray<SortFieldDef>) {
      expect(entry.label.length, entry.id).toBeGreaterThan(0)
      expect(Object.keys(SORT_GROUP_LABELS)).toContain(entry.group)
      expect(['asc', 'desc']).toContain(entry.defaultDir)
      expect(entry.words.desc.length, entry.id).toBeGreaterThan(0)
      expect(entry.words.asc.length, entry.id).toBeGreaterThan(0)
      expect(entry.words.desc).not.toBe(entry.words.asc)
      expect(entry.kind.length).toBeGreaterThan(0)
      expect(['slim', 'extra']).toContain(entry.source)
      expect(entry.label).not.toContain('\u2014')
    }
  })

  it('default directions and words follow EXPERIENCE', () => {
    const words = (id: Parameters<typeof sortField>[0]) => {
      const entry = sortField(id)
      return `${entry.defaultDir} ${entry.words.desc}/${entry.words.asc}`
    }
    expect(words('seeding_time')).toBe('desc 久的在前/短的在前')
    expect(words('added_on')).toBe('desc 新的在前/舊的在前')
    expect(words('completion_on')).toBe('desc 新的在前/舊的在前')
    expect(words('ratio')).toBe('desc 高的在前/低的在前')
    expect(words('size')).toBe('desc 大的在前/小的在前')
    expect(words('name')).toBe('desc A 到 Z/Z 到 A')
    expect(words('num_seeds')).toBe('desc 大的在前/小的在前')
    expect(words('category')).toBe('desc A 到 Z/Z 到 A')
    expect(words('private')).toBe('desc 是在前/否在前')
    expect(words('has_metadata')).toBe('desc 是在前/否在前')
    expect(sortField('state').directional).toBe(false)
    expect(sortField('name').directional).toBe(true)
  })

  it('slim fields are exactly the ones the slim table carries', () => {
    const slim = SORT_FIELD_IDS.filter((id) => !isExtraSortField(id))
    expect(slim.sort()).toEqual([...SLIM].sort())
    expect(EXTRA_SORT_FIELD_IDS).toHaveLength(51 - SLIM.length)
  })

  it('the arrow is ↓ for desc and ↑ for asc', () => {
    expect(dirArrow('desc')).toBe('↓')
    expect(dirArrow('asc')).toBe('↑')
  })
})
