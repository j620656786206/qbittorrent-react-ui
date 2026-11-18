import { describe, expect, it } from 'vitest'
import { isInFolder, locationLabel } from '#/lib/paths'

// Spec 1.6 row P1.

describe('P1 locationLabel', () => {
  it.each([
    ['/data/media/tv', 'media/tv'],
    ['/data/media/tv/', 'media/tv'],
    ['/data', 'data'],
    ['/', '/'],
    ['', '/'],
    ['/data//torrents/tv', 'torrents/tv'],
  ])('%j -> %s', (savePath, expected) => {
    expect(locationLabel(savePath)).toBe(expected)
  })
})

// Story 3.1: the folder-boundary check the SAVE_ROOTS rule uses.
describe('isInFolder', () => {
  it.each([
    ['/data', '/data', true],
    ['/data/x', '/data', true],
    ['/data/x/y', '/data', true],
    ['/database', '/data', false],
    ['/dat', '/data', false],
    ['/other/data', '/data', false],
    ['/anything', '/', true],
  ])('%s in %s: %s', (path, folder, expected) => {
    expect(isInFolder(path, folder)).toBe(expected)
  })
})
