import { describe, expect, it } from 'vitest'
import { judgeEntries } from '#/lib/add-entries'
import { parseMagnet } from '#/lib/info-hash'
import { fakeCategories, fakeHash } from '#/lib/testing'
import { ALL, UNCATEGORIZED } from '#/shared/categories'
import {
  ADD_SENDING_TEXT,
  GO_SEE_LABEL,
  NO_CATEGORIES_TEXT,
  addFailureReason,
  addFormOf,
  addResultText,
  addedToastText,
  outcomeOf,
  cutText,
  addButtonText,
  addCounts,
  addDisabled,
  categoryOptions,
  defaultCategory,
  listLabel,
  rowView,
  savePathLine,
  skippedText,
} from '#/features/add/add-model'
import type { AddItem } from '#/features/add/add-model'

// Spec 4.6: the add screen's text and choices (A2, A4, A7, A8, A9).

const HEX = fakeHash('b')
const OTHER = fakeHash('c')

let nextId = 1
function link(text: string): AddItem {
  return {
    id: nextId++,
    source: { kind: 'link', text },
    result: parseMagnet(text),
  }
}
function file(name: string, result: AddItem['result']): AddItem {
  return {
    id: nextId++,
    source: { kind: 'file', name, file: new File(['d'], name) },
    result,
  }
}

describe('cutText', () => {
  it('cuts by code units but never leaves half an emoji', () => {
    expect(cutText('abc', 2)).toBe('ab')
    expect(cutText('a😀b', 2)).toBe('a')
    expect(cutText('a😀b', 3)).toBe('a😀')
    expect(cutText('ab', 5)).toBe('ab')
  })
})

describe('rowView', () => {
  it('names a magnet by dn, else by the link start in mono', () => {
    const [named, bare] = judgeEntries(
      [
        link(`magnet:?xt=urn:btih:${HEX}&dn=Fake.Show.S01`),
        link(`magnet:?xt=urn:btih:${OTHER}`),
      ],
      new Set(),
    ).map(rowView)
    expect(named).toMatchObject({
      name: 'Fake.Show.S01',
      mono: false,
      status: 'addable',
      label: null,
      existingHash: null,
    })
    expect(bare).toMatchObject({
      name: `magnet:?xt=urn:btih:${OTHER}`,
      mono: true,
    })
  })

  it('an unreadable link shows its text in mono, a file its name', () => {
    const [junk, bad] = judgeEntries(
      [
        link('https://example.invalid/x'),
        file('notes.txt', { kind: 'unreadable', reason: 'file' }),
      ],
      new Set(),
    ).map(rowView)
    expect(junk).toMatchObject({
      name: 'https://example.invalid/x',
      mono: true,
      status: 'unreadable',
      label: '看不懂這個連結',
    })
    expect(bad).toMatchObject({
      name: 'notes.txt',
      mono: false,
      label: '看不懂這個檔案',
    })
  })

  it('a read file shows the torrent name; an existing one carries its hash for 打開', () => {
    const [row] = judgeEntries(
      [
        file('x.torrent', {
          kind: 'file',
          hash: HEX,
          name: 'Fake.Show.S02',
          contentBytes: 1,
          fileBytes: 1,
        }),
      ],
      new Set([HEX]),
    ).map(rowView)
    expect(row).toMatchObject({
      name: 'Fake.Show.S02',
      status: 'existing',
      label: '以前下載過，已整理好',
      existingHash: HEX,
    })
  })
})

describe('the footer', () => {
  it('counts addable and skipped rows (A9)', () => {
    const rows = judgeEntries(
      [
        ...Array.from({ length: 7 }, (_, index) =>
          link(`magnet:?xt=urn:btih:${fakeHash(index + 1)}`),
        ),
        link('junk'),
        link('http://example.invalid'),
        link(`magnet:?xt=urn:btih:${HEX}`),
      ],
      new Set([HEX]),
    )
    expect(addCounts(rows)).toEqual({ addable: 7, skipped: 3 })
    expect(skippedText(3)).toBe('有 3 個不會加')
    expect(skippedText(0)).toBe('')
    expect(addButtonText(7)).toBe('新增 7 個')
    expect(addButtonText(1200)).toBe('新增 1,200 個')
    expect(addButtonText(0)).toBe('新增')
    expect(addDisabled(7, 'X')).toBe(false)
    expect(addDisabled(7, '')).toBe(true)
    expect(addDisabled(0, 'X')).toBe(true)
    expect(listLabel(10)).toBe('要新增的種子，10 個')
  })
})

describe('the category menu', () => {
  it('lists every qBittorrent category in tab order, never the empty name', () => {
    const categories = {
      ...fakeCategories(),
      '': { name: '', savePath: '' },
    }
    expect(
      categoryOptions(categories, ['mteam-tv']).map((each) => each.value),
    ).toEqual(['mteam-tv', 'mteam-X', 'X'])
    expect(categoryOptions(undefined, [])).toEqual([])
  })

  it('presets the category on screen, empty in 全部 and 未分類 (A7)', () => {
    const options = categoryOptions(fakeCategories(), [])
    expect(defaultCategory('mteam-X', options)).toBe('mteam-X')
    expect(defaultCategory(ALL, options)).toBe('')
    expect(defaultCategory(UNCATEGORIZED, options)).toBe('')
    expect(defaultCategory('not-in-qbittorrent', options)).toBe('')
  })

  it('the path line follows the category (A8)', () => {
    const categories = {
      ...fakeCategories(),
      'X-default': { name: 'X-default', savePath: '' },
    }
    expect(savePathLine('X', categories)).toEqual({
      kind: 'path',
      path: '/data/media/X',
    })
    expect(savePathLine('X-default', categories)).toEqual({ kind: 'default' })
    expect(savePathLine('', categories)).toEqual({ kind: 'none' })
    expect(savePathLine('gone', categories)).toEqual({ kind: 'none' })
  })
})

describe('submit text (spec 4.7)', () => {
  it('the labels and the toast', () => {
    expect(ADD_SENDING_TEXT).toBe('新增中…')
    expect(NO_CATEGORIES_TEXT).toBe('qBittorrent 還沒有分類')
    expect(GO_SEE_LABEL).toBe('去看')
    expect(addedToastText(1)).toBe('已新增 1 個種子')
    expect(addedToastText(1200)).toBe('已新增 1,200 個種子')
  })

  it('the partial-failure line; with nothing added only the failures', () => {
    expect(addResultText(5, 2)).toBe('5 個加好了，2 個失敗')
    expect(addResultText(0, 3)).toBe('3 個失敗')
  })
})

describe('addFormOf and outcomeOf (spec 4.7)', () => {
  const fileItem = (name: string) =>
    file(`${name}.torrent`, {
      kind: 'file',
      hash: fakeHash(name),
      name,
      contentBytes: 1,
      fileBytes: 1,
    })

  it('magnets first, then files, each in list order, then the category', () => {
    const f1 = fileItem('1')
    const m1 = link(`magnet:?xt=urn:btih:${HEX}&dn=Re Zero`)
    const f2 = fileItem('2')
    const m2 = link(`magnet:?xt=urn:btih:${OTHER}`)
    const { form, order } = addFormOf([f1, m1, f2, m2], 'X')
    expect(order).toEqual([m1, m2, f1, f2])
    expect([...form.keys()]).toEqual([
      'magnet',
      'magnet',
      'torrent',
      'torrent',
      'category',
    ])
    expect(form.getAll('magnet')).toEqual([
      `magnet:?xt=urn:btih:${HEX}&dn=Re%20Zero`,
      `magnet:?xt=urn:btih:${OTHER}`,
    ])
    expect((form.getAll('torrent') as Array<File>).map((f) => f.name)).toEqual([
      '1.torrent',
      '2.torrent',
    ])
    expect(form.get('category')).toBe('X')
  })

  it('bytes: the allowance plus each entry as sent', () => {
    const m = link(`magnet:?xt=urn:btih:${HEX}&dn=Re Zero`)
    const f = fileItem('5')
    const { bytes } = addFormOf([m, f], 'X')
    const linkBytes = m.result.kind === 'magnet' ? m.result.linkBytes : 0
    expect(linkBytes).toBe(`magnet:?xt=urn:btih:${HEX}&dn=Re%20Zero`.length)
    expect(bytes).toBe(64 * 1024 + 2 * 64 * 1024 + linkBytes + 1)
  })

  it('maps items back by key; a missing item counts as rejected', () => {
    const a = link(`magnet:?xt=urn:btih:${HEX}`)
    const b = fileItem('3')
    const c = fileItem('4')
    const outcome = outcomeOf([a, b, c], {
      items: [
        { key: '0', ok: true },
        { key: '1', ok: false, code: 'timeout', message: 'x' },
      ],
    })
    expect(outcome.added).toEqual([a])
    expect(outcome.failed).toEqual([
      { item: b, code: 'timeout' },
      { item: c, code: 'qbit_rejected' },
    ])
    expect(addFailureReason(outcome.failed[1])).toBe(
      'qBittorrent 讀不了這個檔案',
    )
    expect(addFailureReason({ item: a, code: 'qbit_rejected' })).toBe(
      'qBittorrent 拒絕這個連結',
    )
    expect(addFailureReason(outcome.failed[0])).toBe(
      'qBittorrent 沒有回應，請再試一次',
    )
  })
})
