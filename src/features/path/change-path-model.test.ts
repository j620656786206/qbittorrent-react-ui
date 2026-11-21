import { describe, expect, it } from 'vitest'
import {
  MOVING_NOTE,
  changePathView,
  currentCountTag,
  manyChangePathView,
  manySubtitle,
  manyTitle,
  renameOutcome,
  retryManyLabel,
} from '#/features/path/change-path-model'

// Spec 5.2: the change-path screen's pure parts.

const downloads = {
  path: '/data/torrents/tv',
  name: '下載區（影集）',
  mediaLibrary: false,
}
const library = {
  path: '/data/media/tv',
  name: '影集媒體庫',
  mediaLibrary: true,
}
const dupe = { path: '/data/media/tv/', name: 'dupe', mediaLibrary: false }

describe('changePathView', () => {
  it('review: a moving torrent cannot be moved again; the note shows unless the format is wrong', () => {
    const base = {
      savePath: '/data/torrents/tv',
      commonPaths: [downloads, library],
      moving: true,
    }
    const view = changePathView({ ...base, box: '/data/media/tv' })
    expect(view.moveDisabled).toBe(true)
    expect(view.movingNote).toBe(MOVING_NOTE)
    expect(view.reason).toBeNull()
    const bad = changePathView({ ...base, box: 'data/x' })
    expect(bad.movingNote).toBeNull()
    expect(bad.reason).not.toBeNull()
  })

  it('U1: the box at the save path selects its row, which is also 「目前」; nothing to move', () => {
    const view = changePathView({
      box: '/data/torrents/tv/',
      savePath: '/data/torrents/tv/',
      commonPaths: [downloads, library],
      moving: false,
    })
    expect(view).toEqual({
      target: '/data/torrents/tv',
      reason: null,
      selected: downloads,
      current: downloads,
      movingNote: null,
      moveDisabled: true,
    })
  })

  it('U2: another listed path is selected, the current row stays; movable', () => {
    const view = changePathView({
      box: '/data/media/tv',
      savePath: '/data/torrents/tv/Show',
      commonPaths: [downloads, library, dupe],
      moving: false,
    })
    expect(view.selected).toBe(library)
    expect(view.current).toBe(downloads)
    expect(view.moveDisabled).toBe(false)
  })

  it('U3: a bad format has its reason and cannot move or match', () => {
    const view = changePathView({
      box: '/data/../x',
      savePath: '/data/torrents/tv',
      commonPaths: [downloads],
      moving: false,
    })
    expect(view.reason).toBe('路徑不能有 ..')
    expect(view.selected).toBeNull()
    expect(view.moveDisabled).toBe(true)
  })
})

it('outer spaces of a pasted path are trimmed before matching and sending', () => {
  const view = changePathView({
    box: '  /data/media/tv/  ',
    savePath: '/data/torrents/tv',
    commonPaths: [downloads, library],
    moving: false,
  })
  expect(view.target).toBe('/data/media/tv')
  expect(view.reason).toBeNull()
  expect(view.selected).toBe(library)
  expect(view.moveDisabled).toBe(false)
  expect(
    changePathView({
      box: '/data/torrents/tv ',
      savePath: '/data/torrents/tv/',
      commonPaths: [],
      moving: false,
    }).moveDisabled,
  ).toBe(true)
})

describe('renameOutcome (spec 5.4)', () => {
  it('the same name (after trimming) sends nothing', () => {
    expect(renameOutcome('media/tv', 'media/tv')).toEqual({ kind: 'unchanged' })
    expect(renameOutcome('  media/tv ', 'media/tv')).toEqual({
      kind: 'unchanged',
    })
  })

  it('a changed valid name is sent trimmed', () => {
    expect(renameOutcome('  影集  ', 'media/tv')).toEqual({
      kind: 'send',
      name: '影集',
    })
    expect(renameOutcome('n'.repeat(50), 'x')).toEqual({
      kind: 'send',
      name: 'n'.repeat(50),
    })
  })

  it.each([
    ['blank', '   '],
    ['empty', ''],
    ['51 characters', 'n'.repeat(51)],
    ['a line break', 'a\nb'],
  ])('%s is invalid and not sent', (_name, text) => {
    expect(renameOutcome(text, 'media/tv')).toEqual({ kind: 'invalid' })
  })
})

describe('manyChangePathView (spec 5.5)', () => {
  const batch = [
    { hash: 'a', save_path: '/data/torrents/tv' },
    { hash: 'b', save_path: '/data/torrents/tv/' },
    { hash: 'c', save_path: '/data/torrents/tv/Fake.Show.S01' },
    { hash: 'd', save_path: '/data/downloads' },
    { hash: 'e', save_path: '/data/downloads/' },
  ]

  it('N1: the texts; 3 in the downloads row (longest match, inner folders too), the box empty: no reason, nothing to send', () => {
    const view = manyChangePathView({
      box: '',
      torrents: batch,
      commonPaths: [downloads, library],
    })
    expect(manyTitle(5)).toBe('搬 5 個種子')
    expect(manySubtitle(5, view.locationCount)).toBe('5 個種子現在在 3 個位置')
    expect(view.currentCounts.get(downloads)).toBe(3)
    expect(view.currentCounts.has(library)).toBe(false)
    expect(currentCountTag(3)).toBe('目前 3 個')
    expect(view.reason).toBeNull()
    expect(view.selected).toBeNull()
    expect(view.toSend).toEqual([])
    expect(view.moveDisabled).toBe(true)
  })

  it('N1: distinct normalized save paths count as locations', () => {
    const view = manyChangePathView({
      box: '',
      torrents: [batch[0], batch[1], batch[3], batch[4]],
      commonPaths: [],
    })
    expect(view.locationCount).toBe(2)
    expect(view.currentCounts.size).toBe(0)
  })

  it('N2: every torrent already at the target: 搬過去 disabled', () => {
    const view = manyChangePathView({
      box: '/data/torrents/tv/',
      torrents: [batch[0], batch[1]],
      commonPaths: [downloads, library],
    })
    expect(view.selected).toBe(downloads)
    expect(view.toSend).toEqual([])
    expect(view.moveDisabled).toBe(true)
  })

  it('N3: only the torrents not at the target are sent, in batch order', () => {
    const view = manyChangePathView({
      box: ' /data/downloads/ ',
      torrents: batch,
      commonPaths: [downloads, library],
    })
    expect(view.target).toBe('/data/downloads')
    expect(view.toSend).toEqual(['a', 'b', 'c'])
    expect(view.moveDisabled).toBe(false)
  })

  it('a bad format: the 5.2 reason, nothing to send', () => {
    const view = manyChangePathView({
      box: 'data/tv',
      torrents: batch,
      commonPaths: [downloads],
    })
    expect(view.reason).toBe('路徑要從 / 開頭')
    expect(view.toSend).toEqual([])
    expect(view.moveDisabled).toBe(true)
  })

  it('the failure view retry label', () => {
    expect(retryManyLabel(2)).toBe('重試 2 個')
  })
})
