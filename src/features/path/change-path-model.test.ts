import { describe, expect, it } from 'vitest'
import {
  MOVING_NOTE,
  changePathView,
  renameOutcome,
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
