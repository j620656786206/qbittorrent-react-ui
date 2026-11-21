import { MAX_COMMON_PATH_NAME } from '#/shared/settings'
import type { AddCommonPathInput, CommonPath } from '#/shared/settings'
import { normalizeSavePath } from '#/shared/save-path'

// AD-13, AR-41: the only place path logic lives. Epic 1 needs just the
// location tag; story 5.1 adds common-path matching (folder boundary,
// longest match, media library).

/**
 * The location tag: the last two non-empty segments of a save path, 「/」 for
 * the root or an empty path. `/data/media/tv/` is 「media/tv」.
 */
export function locationLabel(savePath: string): string {
  const segments = savePath.split('/').filter((segment) => segment !== '')
  if (segments.length === 0) return '/'
  return segments.slice(-2).join('/')
}

/**
 * Story 3.1: `path` is `folder` or inside it, on a folder boundary
 * (`/data` holds `/data` and `/data/x`, not `/database`). Both are
 * normalized absolute paths (no trailing slash except the root `/`).
 */
export function isInFolder(path: string, folder: string): boolean {
  if (folder === '/') return path.startsWith('/')
  return path === folder || path.startsWith(`${folder}/`)
}

/** What a location tag shows (story 5.1). */
export interface TagLocation {
  /** The longest matching common path's name, else the last two folders. */
  name: string
  /** Any matching common path (outer or inner) is ticked 「媒體庫」. */
  mediaLibrary: boolean
}

/** Answers the same object for the same raw save path until replaced. */
export type LocationResolver = (savePath: string) => TagLocation

interface NormalizedCommonPath {
  path: string
  name: string
  mediaLibrary: boolean
}

function normalizeCommonPaths(
  commonPaths: ReadonlyArray<CommonPath>,
): Array<NormalizedCommonPath> {
  return commonPaths.map(({ path, name, mediaLibrary }) => ({
    path: normalizeSavePath(path),
    name,
    mediaLibrary,
  }))
}

/**
 * The index of the longest common path `path` (normalized) lies in, the
 * first of equal ones, or -1; whether any match is a media library.
 */
function longestMatch(
  path: string,
  commonPaths: ReadonlyArray<NormalizedCommonPath>,
): { index: number; mediaLibrary: boolean } {
  // `..` survives normalizing, so `/data/media/tv/../movies` would look
  // like it sits under `/data/media/tv`: never a match.
  if (path.split('/').includes('..')) return { index: -1, mediaLibrary: false }
  let index = -1
  let mediaLibrary = false
  commonPaths.forEach((common, at) => {
    if (!isInFolder(path, common.path)) return
    if (common.mediaLibrary) mediaLibrary = true
    // Matching paths are all folders above `path`: a longer one is deeper.
    // Equal length means the same folder listed twice: the first wins.
    if (index === -1 || common.path.length > commonPaths[index].path.length) {
      index = at
    }
  })
  return { index, mediaLibrary }
}

function match(
  savePath: string,
  commonPaths: ReadonlyArray<NormalizedCommonPath>,
): TagLocation {
  const path = normalizeSavePath(savePath)
  const { index, mediaLibrary } = longestMatch(path, commonPaths)
  return index === -1
    ? { name: locationLabel(path), mediaLibrary: false }
    : { name: commonPaths[index].name, mediaLibrary }
}

/**
 * Story 5.2: the common path a torrent is in now (its row reads 「目前」):
 * the same longest match as its location tag, the first of two that
 * normalize to the same folder; `null` when none holds it.
 */
export function currentCommonPath(
  savePath: string,
  commonPaths: ReadonlyArray<CommonPath>,
): CommonPath | null {
  const { index } = longestMatch(
    normalizeSavePath(savePath),
    normalizeCommonPaths(commonPaths),
  )
  return index === -1 ? null : commonPaths[index]
}

/**
 * Story 5.2: the first common path whose normalized path is `path`'s, or
 * `null` (the change-path screen's selected row, and 「加到常用」's
 * 「已經在清單裡」).
 */
export function listedCommonPath(
  path: string,
  commonPaths: ReadonlyArray<CommonPath>,
): CommonPath | null {
  const target = normalizeSavePath(path)
  return (
    commonPaths.find((common) => normalizeSavePath(common.path) === target) ??
    null
  )
}

/** At most MAX_COMMON_PATH_NAME UTF-16 units, never half a character. */
function fitName(name: string): string {
  const characters = Array.from(name)
  while (characters.join('').length > MAX_COMMON_PATH_NAME) characters.pop()
  return characters.join('')
}

/**
 * Story 5.2: what 「加到常用」 sends for a path: the normalized path, named
 * by its last two folders (cut to the 50-character name bound, Claude
 * 代決), not a media library. Story 5.4: the detail's 「☆ 加到常用」 sends
 * the same for the torrent's save path.
 */
export function addCommonPathInput(path: string): AddCommonPathInput {
  const target = normalizeSavePath(path)
  return {
    path: target,
    name: fitName(locationLabel(target)),
    mediaLibrary: false,
  }
}

/**
 * Story 5.1: where a save path sits among the common paths. Both sides are
 * normalized; a common path matches when the save path is it or lies
 * under it on a folder boundary (`/data/media/tv` does not hold
 * `/data/media/tv2`). The name comes from the longest match; when two
 * common paths normalize to the same folder, the first in the list wins
 * (story 5.2: `addCommonPath` refuses such duplicates). Media library when
 * any match is ticked. A save path with a `..` segment never matches. No
 * match: the last two folders.
 */
export function locationOf(
  savePath: string,
  commonPaths: ReadonlyArray<CommonPath>,
): TagLocation {
  return match(savePath, normalizeCommonPaths(commonPaths))
}

/**
 * The cache's bound: well above the 4165 distinct paths of a full NAS, so
 * clearing it (every tag gets a new object once) only happens to a tab left
 * open across many thousands of moves.
 */
export const LOCATION_CACHE_LIMIT = 20_000

/**
 * `locationOf` for one common-path list: the list is normalized once, and
 * each raw save path is matched once and then answered from a cache, so a
 * poll that leaves paths alone costs no matching and memoized rows keep
 * the same object. Past LOCATION_CACHE_LIMIT paths the cache starts over.
 */
export function createLocationResolver(
  commonPaths: ReadonlyArray<CommonPath>,
): LocationResolver {
  const normalized = normalizeCommonPaths(commonPaths)
  const cache = new Map<string, TagLocation>()
  return (savePath) => {
    let location = cache.get(savePath)
    if (location === undefined) {
      if (cache.size >= LOCATION_CACHE_LIMIT) cache.clear()
      location = match(savePath, normalized)
      cache.set(savePath, location)
    }
    return location
  }
}

/** No common paths: the last two folders (before settings load, tests). */
export const NO_COMMON_PATHS_RESOLVER: LocationResolver =
  createLocationResolver([])
