import { describe, expect, it } from 'vitest'
import { mergeMaindata } from '#/lib/maindata-merge'
import { fakeHash, fakeResponse, t } from '#/lib/testing'
import {
  EPIC1_VIEW,
  countAll,
  selectVisibleTorrents,
} from '#/lib/visible-torrents'

// Spec 1.6 rows V1, V2.

const H1 = fakeHash(1)
const H2 = fakeHash(2)
const H3 = fakeHash(3)
const H4 = fakeHash(4)

const maindata = mergeMaindata(
  undefined,
  fakeResponse({
    changed: [
      t({ hash: H3, added_on: 1_790_000_100 }),
      t({ hash: H1, added_on: 1_790_000_200, state: 'stalledUP', progress: 1 }),
      t({ hash: H2, added_on: 1_790_000_100, category: 'mteam-X' }),
      t({
        hash: H4,
        added_on: 1_790_000_300,
        state: 'missingFiles',
        private: false,
      }),
    ],
  }),
)

describe('selectVisibleTorrents', () => {
  it('V1 newest first, ties by hash ascending, archived left out', () => {
    expect(selectVisibleTorrents(maindata, EPIC1_VIEW)).toEqual([H1, H2, H3])
  })

  it('V2 countAll leaves archived out', () => {
    expect(countAll(maindata)).toBe(3)
  })

  it('V3 a moving torrent remembered as non-private missingFiles stays hidden', () => {
    const H5 = fakeHash(5)
    const before = mergeMaindata(
      undefined,
      fakeResponse({
        changed: [
          t({ hash: H1, added_on: 1_790_000_200 }),
          t({ hash: H5, state: 'missingFiles', private: false }),
        ],
      }),
    )
    const moving = mergeMaindata(
      before,
      fakeResponse({
        version: 'abcdef12.2',
        full: false,
        changed: [t({ hash: H5, state: 'moving', private: false })],
      }),
    )
    expect(moving.stateBeforeMove).toEqual({ [H5]: 'missingFiles' })
    expect(selectVisibleTorrents(moving, EPIC1_VIEW)).toEqual([H1])
    expect(countAll(moving)).toBe(1)
  })
})
