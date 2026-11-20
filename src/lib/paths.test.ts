import { describe, expect, it } from 'vitest'
import {
  LOCATION_CACHE_LIMIT,
  NO_COMMON_PATHS_RESOLVER,
  createLocationResolver,
  isInFolder,
  locationLabel,
  locationOf,
} from '#/lib/paths'

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

// Story 5.1 rows P1 to P9: common-path matching for the location tag.
describe('locationOf', () => {
  const tv = { path: '/data/media/tv', name: '影集媒體庫', mediaLibrary: true }

  it.each([
    ['P1 equal', '/data/media/tv', [tv], '影集媒體庫', true],
    ['P2 child', '/data/media/tv/Show.S01', [tv], '影集媒體庫', true],
    ['P3 boundary', '/data/media/tv2/x', [tv], 'tv2/x', false],
    [
      'P4 nested, outer media',
      '/data/media/tv/x',
      [
        { path: '/data/media', name: '媒體', mediaLibrary: true },
        { path: '/data/media/tv', name: '影集', mediaLibrary: false },
      ],
      '影集',
      true,
    ],
    [
      'P5 inner media only, not matched',
      '/data/media/movies/x',
      [
        { path: '/data/media', name: '媒體', mediaLibrary: false },
        { path: '/data/media/tv', name: '影集', mediaLibrary: true },
      ],
      '媒體',
      false,
    ],
    [
      'P6 trailing slash',
      '/data/media/tv/',
      [{ ...tv, path: '/data/media/tv/' }],
      '影集媒體庫',
      true,
    ],
    ['P7 none', '/data/media/tv/Show', [], 'tv/Show', false],
    [
      'P8 root matches anything',
      '/data/torrents/x',
      [{ path: '/', name: '全部', mediaLibrary: false }, tv],
      '全部',
      false,
    ],
    [
      'P8 root loses to a longer match',
      '/data/media/tv/x',
      [{ path: '/', name: '全部', mediaLibrary: false }, tv],
      '影集媒體庫',
      true,
    ],
    ['P9 messy save path', '/data//media/./tv/x', [tv], '影集媒體庫', true],
    ['P9 messy fallback', '/data//torrents/./tv/', [tv], 'torrents/tv', false],
  ])('%s', (_label, savePath, commonPaths, name, mediaLibrary) => {
    expect(locationOf(savePath, commonPaths)).toEqual({ name, mediaLibrary })
  })

  it('the same folder listed twice: the first in the list wins', () => {
    const plain = { path: '/data/media/tv', name: '影集', mediaLibrary: false }
    const slash = {
      path: '/data/media/tv/',
      name: '影集庫',
      mediaLibrary: false,
    }
    expect(locationOf('/data/media/tv/x', [plain, slash]).name).toBe('影集')
    expect(locationOf('/data/media/tv/x', [slash, plain]).name).toBe('影集庫')
  })

  it('a save path with a .. segment never matches', () => {
    expect(locationOf('/data/media/tv/../movies/x', [tv])).toEqual({
      name: 'movies/x',
      mediaLibrary: false,
    })
    expect(locationOf('/data/media/tv/..', [tv]).mediaLibrary).toBe(false)
  })

  it('order does not matter for the longest match', () => {
    const outer = { path: '/data/media', name: '媒體', mediaLibrary: false }
    const inner = { path: '/data/media/tv', name: '影集', mediaLibrary: false }
    expect(locationOf('/data/media/tv/x', [inner, outer]).name).toBe('影集')
    expect(locationOf('/data/media/tv/x', [outer, inner]).name).toBe('影集')
  })
})

describe('createLocationResolver', () => {
  const tv = { path: '/data/media/tv', name: '影集媒體庫', mediaLibrary: true }

  it('answers like locationOf', () => {
    const locate = createLocationResolver([tv])
    expect(locate('/data/media/tv/x')).toEqual({
      name: '影集媒體庫',
      mediaLibrary: true,
    })
    expect(locate('/data/torrents/tv')).toEqual({
      name: 'torrents/tv',
      mediaLibrary: false,
    })
  })

  it('the same raw save path gets the same object', () => {
    const locate = createLocationResolver([tv])
    expect(locate('/data/media/tv/x')).toBe(locate('/data/media/tv/x'))
    expect(locate('/data/x')).toBe(locate('/data/x'))
  })

  it(`starts over past ${LOCATION_CACHE_LIMIT} paths`, () => {
    const locate = createLocationResolver([tv])
    const first = locate('/data/media/tv/x')
    for (let n = 1; n < LOCATION_CACHE_LIMIT; n += 1) locate(`/data/p/${n}`)
    // Exactly at the bound: still cached.
    expect(locate('/data/media/tv/x')).toBe(first)
    locate('/data/p/one-more')
    const again = locate('/data/media/tv/x')
    expect(again).not.toBe(first)
    expect(again).toEqual(first)
  })

  it('no common paths: one shared resolver, the last two folders', () => {
    expect(NO_COMMON_PATHS_RESOLVER('/data/media/tv/x')).toEqual({
      name: 'tv/x',
      mediaLibrary: false,
    })
    expect(NO_COMMON_PATHS_RESOLVER('/data/q')).toBe(
      NO_COMMON_PATHS_RESOLVER('/data/q'),
    )
  })

  it('R3: resolving 4165 distinct paths against 50 common paths, eagerly, stays far under 100 ms', () => {
    const parents = Array.from(
      { length: 50 },
      (_, index) => `/data/pool/p${String(index).padStart(2, '0')}`,
    )
    const commonPaths = parents.map((path, index) => ({
      path,
      name: `常用 ${index}`,
      mediaLibrary: index % 2 === 0,
    }))
    const paths = Array.from(
      { length: 4165 },
      (_, index) => `${parents[index % 50]}/Fake.Folder.${index + 1}`,
    )
    const runs = Array.from({ length: 5 }, () => {
      const start = performance.now()
      const locate = createLocationResolver(commonPaths)
      for (const path of paths) locate(path)
      return performance.now() - start
    }).sort((a, b) => a - b)
    // The median of five full recomputes, with a generous bound so a busy
    // CI machine does not flake.
    expect(runs[2]).toBeLessThan(50)
  })

  it('a new list is a new resolver with new answers', () => {
    const before = createLocationResolver([tv])('/data/media/tv/x')
    const after = createLocationResolver([{ ...tv, name: '影集' }])(
      '/data/media/tv/x',
    )
    expect(after).not.toBe(before)
    expect(after.name).toBe('影集')
  })
})
