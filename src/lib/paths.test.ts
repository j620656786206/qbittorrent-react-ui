import { describe, expect, it } from 'vitest'
import { locationLabel } from '#/lib/paths'

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
