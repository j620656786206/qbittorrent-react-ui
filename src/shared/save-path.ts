import { z } from '#/shared/zod'
import { hasControlChar } from '#/shared/categories'

// AD-12, AR-29, story 3.1: the one path schema every path parameter and
// common path shares (Epic 5 reuses it for 改儲存路徑). The input is
// normalized first (repeated and trailing slashes and `.` segments removed,
// the root stays `/`), then it must be absolute, at most 1024 characters, with no NUL,
// backslash or other control character and no `..` segment. The container
// also requires it under one of `SAVE_ROOTS` (src/server/settings/save-roots.ts).

export const MAX_SAVE_PATH = 1024

/**
 * Repeated slashes become one, `.` segments and a trailing slash go; `/`
 * stays `/`. `..` stays (the schema rejects it). A relative path stays
 * relative (the schema rejects it too).
 */
export function normalizeSavePath(path: string): string {
  const segments = path
    .split('/')
    .filter((segment) => segment !== '' && segment !== '.')
  const joined = segments.join('/')
  return path.startsWith('/') ? `/${joined}` : joined
}

export const savePathSchema = z
  .string()
  .transform(normalizeSavePath)
  .pipe(
    z
      .string()
      .max(MAX_SAVE_PATH)
      .refine((path) => path.startsWith('/'), 'not absolute')
      .refine(
        (path) => !hasControlChar(path) && !path.includes('\\'),
        'bad character',
      )
      .refine((path) => !path.split('/').includes('..'), '.. segment'),
  )
