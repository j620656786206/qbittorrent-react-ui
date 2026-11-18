import { getEnv } from '#/server/env'
import { isInFolder } from '#/lib/paths'

// AD-12, story 3.1: the container half of the shared path schema. A path
// that passed `savePathSchema` (src/shared/save-path.ts, so already
// normalized) must also sit under one of `SAVE_ROOTS` on a folder boundary:
// `/data` holds `/data` and `/data/x`, not `/database`. The roots are the
// ones the env check parsed at boot (trailing slashes already removed).

export function isUnderSaveRoot(
  path: string,
  roots: ReadonlyArray<string> = getEnv().saveRoots,
): boolean {
  return roots.some((root) => isInFolder(path, root))
}
