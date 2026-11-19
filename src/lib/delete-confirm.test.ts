import { describe, expect, it } from 'vitest'
import {
  DELETE_PREVIEW_ROWS,
  deleteButtonText,
  deleteGoneNotes,
  deleteMoreText,
  deleteRows,
  deleteSuccessText,
  deleteSummary,
  deleteTitle,
  filesAllGone,
} from '#/lib/delete-confirm'
import type { DeleteSummary } from '#/lib/delete-confirm'
import { deleteFailureText } from '#/lib/error-text'
import { fakeHash, t } from '#/lib/testing'

// Spec 4.3 matrix: the button text rows, the gone-files notes, the moving
// torrent, the title, the success and failure toasts.

const GB = 1024 ** 3
const TB = 1024 * GB
const A = fakeHash(1)
const B = fakeHash(2)
const C = fakeHash(3)
const D = fakeHash(4)

const normal = t({ hash: A, name: 'Normal.Show', size: 170.2 * GB })
const second = t({ hash: D, name: 'Second.Show', size: 131 * GB })
/** Non-private `missingFiles`: 已整理. */
const archived = t({
  hash: B,
  name: 'Archived.Show',
  size: 50 * GB,
  state: 'missingFiles',
  progress: 1,
  private: false,
})
/** Private `missingFiles`: 找不到檔案. */
const missing = t({
  hash: C,
  name: 'Missing.Show',
  size: 20 * GB,
  state: 'missingFiles',
  progress: 1,
  private: true,
})
const torrents = { [A]: normal, [B]: archived, [C]: missing, [D]: second }

const summary = (overrides: Partial<DeleteSummary>): DeleteSummary => ({
  count: 3,
  bytes: 0,
  missing: 0,
  archived: 0,
  ...overrides,
})

describe('deleteButtonText', () => {
  it('3 torrents, 301.2 GB, files on', () => {
    expect(deleteButtonText(summary({ bytes: 301.2 * GB }), true)).toBe(
      '刪除 3 個種子和檔案（301.2 GB）',
    )
  })

  it('files off', () => {
    expect(deleteButtonText(summary({ bytes: 301.2 * GB }), false)).toBe(
      '只刪 3 個種子，檔案留著',
    )
  })

  it('3,626 torrents, 22.1 TB: thousands separators and TB', () => {
    expect(
      deleteButtonText(summary({ count: 3626, bytes: 22.1 * TB }), true),
    ).toBe('刪除 3,626 個種子和檔案（22.1 TB）')
  })

  it('every file gone, files on: no 0 B promise', () => {
    expect(deleteButtonText(summary({ missing: 2, archived: 1 }), true)).toBe(
      '刪除 3 個種子（檔案已經不在）',
    )
    expect(deleteButtonText(summary({ missing: 3 }), false)).toBe(
      '只刪 3 個種子，檔案留著',
    )
  })

  it('some gone: the size counts only the rest', () => {
    const mixed = deleteSummary(torrents, [A, B, C], {})
    expect(mixed).toEqual({
      count: 3,
      bytes: 170.2 * GB,
      missing: 1,
      archived: 1,
    })
    expect(deleteButtonText(mixed, true)).toBe(
      '刪除 3 個種子和檔案（170.2 GB）',
    )
  })
})

describe('deleteSummary and deleteRows', () => {
  it('rows follow the selection order, never the size, and skip gone hashes', () => {
    const rows = deleteRows(torrents, [C, fakeHash(9), A, B, D], {})
    expect(rows.map((row) => row.hash)).toEqual([C, A, B, D])
    expect(rows.map((row) => row.gone)).toEqual([
      'missing',
      null,
      'archived',
      null,
    ])
    expect(rows[1]).toEqual({
      hash: A,
      name: 'Normal.Show',
      size: 170.2 * GB,
      gone: null,
    })
  })

  it('a moving torrent that was missingFiles before the move adds nothing', () => {
    const moving = t({
      hash: A,
      size: 7 * GB,
      state: 'moving',
      private: true,
    })
    const before = { [A]: 'missingFiles' }
    expect(deleteSummary({ [A]: moving }, [A], before)).toEqual({
      count: 1,
      bytes: 0,
      missing: 1,
      archived: 0,
    })
    expect(deleteRows({ [A]: moving }, [A], before)[0].gone).toBe('missing')
    // Moving from a healthy state counts.
    expect(
      deleteSummary({ [A]: moving }, [A], { [A]: 'uploading' }).bytes,
    ).toBe(7 * GB)
  })
})

describe('filesAllGone', () => {
  it('only when every selected torrent is 找不到檔案 or 已整理', () => {
    expect(filesAllGone(summary({ missing: 2, archived: 1 }))).toBe(true)
    expect(filesAllGone(summary({ missing: 2 }))).toBe(false)
    expect(filesAllGone(summary({ count: 0 }))).toBe(false)
  })
})

describe('deleteGoneNotes', () => {
  it('one line per kind present', () => {
    expect(deleteGoneNotes(summary({ missing: 2 }))).toEqual([
      '其中 2 個找不到檔案，只會刪種子',
    ])
    expect(deleteGoneNotes(summary({ archived: 1 }))).toEqual([
      '其中 1 個已整理，只會刪種子',
    ])
    expect(
      deleteGoneNotes(summary({ count: 5000, missing: 1200, archived: 3 })),
    ).toEqual([
      '其中 1,200 個找不到檔案，只會刪種子',
      '其中 3 個已整理，只會刪種子',
    ])
    expect(deleteGoneNotes(summary({}))).toEqual([])
  })
})

describe('the other texts', () => {
  it('title with thousands separators', () => {
    expect(deleteTitle(3)).toBe('刪除 3 個種子？')
    expect(deleteTitle(3626)).toBe('刪除 3,626 個種子？')
  })

  it('success toast', () => {
    expect(deleteSuccessText(summary({ bytes: 301.2 * GB }), true)).toBe(
      '已刪除 3 個種子和檔案（301.2 GB）',
    )
    expect(deleteSuccessText(summary({ bytes: 301.2 * GB }), false)).toBe(
      '已刪除 3 個種子，檔案留著',
    )
    expect(deleteSuccessText(summary({ missing: 3 }), true)).toBe(
      '已刪除 3 個種子',
    )
  })

  it('failure toast: 刪除失敗 plus the code text', () => {
    expect(deleteFailureText('qbit_rejected')).toBe(
      '刪除失敗：qBittorrent 拒絕這個操作',
    )
    expect(deleteFailureText('timeout')).toMatch(/^刪除失敗：/)
  })

  it('「還有 N 個」 only past the first 5', () => {
    expect(DELETE_PREVIEW_ROWS).toBe(5)
    expect(deleteMoreText(5)).toBeNull()
    expect(deleteMoreText(6)).toBe('還有 1 個')
    expect(deleteMoreText(3626)).toBe('還有 3,621 個')
  })
})
