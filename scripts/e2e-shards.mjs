// The CI split of the Playwright suite: one source of truth, read by
// scripts/run-e2e-shard.mjs (what a CI job runs) and
// scripts/verify-shards.mjs (the check that every spec runs exactly once).
//
// Why split: the suite runs on one worker (every test shares the fake
// qBittorrent's mode, playwright.config.ts) and took about 19 of CI's
// 22 minutes. Each shard runs on its own runner with its own fake-qbit on
// the same port, so the tests see exactly what they see in one run.
//
// Why by name and not `--shard=i/n`: Playwright's shards balance the test
// count, not the time, and one file (delete) takes about 3.7 minutes. The
// groups below are balanced by the seconds each file took in CI
// (PR #47 and #48, 2026-11-20); the slowest group sets CI's wall clock.
//
// `rest` is the catch-all: every spec not named here runs there, so a new
// or renamed spec can never be skipped because nobody updated this list.
// A test that silently does not run is worse than a red one.

/** Named groups, by file name under e2e/. About 5 to 6 minutes each. */
export const NAMED_SHARDS = {
  // delete 224 s, selection 104 s
  delete: ['delete.spec.ts', 'selection.spec.ts'],
  // delete-exit about 150 s, detail 146 s, resume 23 s
  detail: ['delete-exit.spec.ts', 'detail.spec.ts', 'resume.spec.ts'],
  // smoke 121 s, files 78 s, board 77 s, settings-sort 14 s, board-scrollbar 5 s
  smoke: [
    'smoke.spec.ts',
    'files.spec.ts',
    'board.spec.ts',
    'settings-sort.spec.ts',
    'board-scrollbar.spec.ts',
  ],
}

/** The catch-all shard's name. */
export const REST = 'rest'

/** Every shard name, in the order CI lists them. */
export const SHARD_NAMES = [...Object.keys(NAMED_SHARDS), REST]

/**
 * The spec files a shard runs, given every spec file name in e2e/.
 * Throws on an unknown shard name.
 */
export function shardFiles(name, allSpecs) {
  if (name === REST) {
    const named = new Set(Object.values(NAMED_SHARDS).flat())
    return allSpecs.filter((file) => !named.has(file))
  }
  const files = NAMED_SHARDS[name]
  if (!files) throw new Error(`unknown e2e shard: ${name}`)
  return files
}
