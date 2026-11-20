// Story 4.4 (EXPERIENCE 〔動態〕 delete fade-out): the exit's rules, pure.
// After a delete succeeds, the rows this tab deleted fade out once the
// refreshed maindata lacks them (FADE_MS), then leave the order and the
// rows below slide up into place (SLIDE_MS). The store is
// src/state/leaving.ts and the hook src/state/leaving-exit.ts.

/** The leaving rows fade out, all together (Claude 代決: no stagger). */
export const FADE_MS = 200
/** Then the rows below slide up into place (Claude 代決). */
export const SLIDE_MS = 200
/** The app curve (DESIGN motion), for the fade and the slide. */
export const EXIT_EASING = 'cubic-bezier(.2,.8,.2,1)'
/**
 * A deleted hash counts as expected this long after the delete succeeded:
 * the same 30 s as `PENDING_TIMEOUT_MS` in src/state/pending-ops.ts (a test
 * keeps the two equal; src/state/leaving.ts cannot import pending-ops
 * without an import cycle through maindata.ts).
 */
export const EXPECT_LEAVING_MS = 30_000
/**
 * Leaving hashes no surface took on within this long after their group
 * started (no list or board shows them, e.g. another category or the
 * settings page) leave the order anyway (Claude 代決).
 */
export const UNCLAIMED_LEAVING_MS = 1000

/** `expiresAt` (epoch ms) has not passed at `now`. */
export function isExpectationLive(expiresAt: number, now: number): boolean {
  return now < expiresAt
}

/**
 * The slide after a removal: for each hash of `after` that moved up, how
 * far, px. A hash moves up by the size plus `gap` of every hash removed
 * above it in `before` (hashes in `before` but not in `after`). Hashes that
 * did not move are left out. `sizeOf` is asked only for removed hashes.
 */
export function exitShifts(
  before: ReadonlyArray<string>,
  after: ReadonlyArray<string>,
  sizeOf: (hash: string) => number,
  gap: number,
): Map<string, number> {
  const shifts = new Map<string, number>()
  const kept = new Set(after)
  let removedAbove = 0
  for (const hash of before) {
    if (!kept.has(hash)) {
      removedAbove += sizeOf(hash) + gap
      continue
    }
    if (removedAbove > 0) shifts.set(hash, removedAbove)
  }
  return shifts
}

/**
 * Scroll anchoring (Alex, after 4.4): how much shorter the content above
 * the view gets when `removed` leave `order`. That is the size plus `gap`
 * of each removed hash before `first`, the first row in view (kept or
 * removed). `0` when `first` is not in `order` (nothing in view).
 */
export function removedAbove(
  order: ReadonlyArray<string>,
  first: string | null,
  removed: ReadonlySet<string>,
  sizeOf: (hash: string) => number,
  gap: number,
): number {
  let total = 0
  for (const hash of order) {
    if (hash === first) return total
    if (removed.has(hash)) total += sizeOf(hash) + gap
  }
  return 0
}
