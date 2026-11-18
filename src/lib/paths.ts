// AD-13, AR-41: the only place path logic lives. Epic 1 needs just the
// location tag; common-path matching (folder boundary, longest match) joins
// here in Epic 5.

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
