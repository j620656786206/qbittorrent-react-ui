import { describe, expect, it } from 'vitest'
import { selectionBarText, selectionTotal } from '#/lib/selection-total'
import { fakeHash, t } from '#/lib/testing'

// Spec 4.1 matrix rows: mixed total, only missing, big count, gone hash.

const GB = 1024 ** 3
const A = fakeHash(1)
const B = fakeHash(2)
const C = fakeHash(3)

const normal = t({ hash: A, size: 100 * GB })
/** Non-private `missingFiles`: 已整理. */
const archived = t({
  hash: B,
  size: 50 * GB,
  state: 'missingFiles',
  progress: 1,
  private: false,
})
/** Private `missingFiles`: 找不到檔案. */
const missing = t({
  hash: C,
  size: 20 * GB,
  state: 'missingFiles',
  progress: 1,
  private: true,
})
const torrents = { [A]: normal, [B]: archived, [C]: missing }

describe('selectionTotal', () => {
  it('mixed: 100 GB normal, 50 GB 已整理, 20 GB 找不到檔案 count 3, size 100 GB', () => {
    const total = selectionTotal(torrents, [A, B, C], {})
    expect(total).toEqual({ count: 3, bytes: 100 * GB })
    expect(selectionBarText(total)).toEqual({
      count: '已選 3 個',
      size: '共 100 GB',
    })
  })

  it('only missing: two 已整理 read 已選 2 個, 共 0 B', () => {
    const second = { ...archived, hash: fakeHash(4) }
    const total = selectionTotal(
      { [B]: archived, [second.hash]: second },
      [B, second.hash],
      {},
    )
    expect(selectionBarText(total)).toEqual({
      count: '已選 2 個',
      size: '共 0 B',
    })
  })

  it('a hash no longer in maindata counts for nothing', () => {
    expect(selectionTotal({ [A]: normal }, [B, A], {})).toEqual({
      count: 1,
      bytes: 100 * GB,
    })
  })

  it('a moving torrent counts by the state it had before the move', () => {
    const moving = t({ hash: A, size: 7 * GB, state: 'moving' })
    expect(
      selectionTotal({ [A]: moving }, [A], { [A]: 'missingFiles' }),
    ).toEqual({ count: 1, bytes: 0 })
    expect(selectionTotal({ [A]: moving }, [A], { [A]: 'uploading' })).toEqual({
      count: 1,
      bytes: 7 * GB,
    })
  })

  it('big count: 3,626 selected read 已選 3,626 個', () => {
    const many = Array.from({ length: 3626 }, (_, i) =>
      t({ hash: fakeHash(i + 10), size: GB }),
    )
    const total = selectionTotal(
      Object.fromEntries(many.map((each) => [each.hash, each])),
      many.map((each) => each.hash),
      {},
    )
    expect(selectionBarText(total)).toEqual({
      count: '已選 3,626 個',
      size: '共 3.5 TB',
    })
  })
})
