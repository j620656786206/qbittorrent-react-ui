import { describe, expect, it } from 'vitest'
import {
  addCommonPathInput,
  changePathView,
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
  it('U1: the box at the save path selects its row, which is also 「目前」; nothing to move', () => {
    const view = changePathView({
      box: '/data/torrents/tv/',
      savePath: '/data/torrents/tv/',
      commonPaths: [downloads, library],
    })
    expect(view).toEqual({
      target: '/data/torrents/tv',
      reason: null,
      selected: downloads,
      current: downloads,
      moveDisabled: true,
    })
  })

  it('U2: another listed path is selected, the current row stays; movable', () => {
    const view = changePathView({
      box: '/data/media/tv',
      savePath: '/data/torrents/tv/Show',
      commonPaths: [downloads, library, dupe],
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
    }).moveDisabled,
  ).toBe(true)
})

describe('addCommonPathInput', () => {
  it('names the path by its last two folders, not a media library', () => {
    expect(addCommonPathInput('/data/media/anime')).toEqual({
      path: '/data/media/anime',
      name: 'media/anime',
      mediaLibrary: false,
    })
  })

  it('cuts a long name to 50 characters without splitting one', () => {
    const long = `/data/${'a'.repeat(30)}/${'😀'.repeat(20)}`
    const { name } = addCommonPathInput(long)
    expect(name.length).toBeLessThanOrEqual(50)
    expect(name.startsWith('a'.repeat(30))).toBe(true)
    expect(name.endsWith('😀')).toBe(true)
  })
})
