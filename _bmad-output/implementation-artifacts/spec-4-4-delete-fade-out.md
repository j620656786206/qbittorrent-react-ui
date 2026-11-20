---
title: 'Story 4.4: Delete fade-out'
type: 'feature'
created: '2026-11-20'
status: 'done'
baseline_revision: '58dfd84023e0221f9389f4ea9f3164743289c1a0'
review_loop_iteration: 0
followup_review_recommended: true
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-4-context.md'
warnings: ['oversized']
deferred:
  - summary: >-
      Chromium runs a style recalc (UpdateLayoutTree) on most frames of the slide, and on two frames of the fade.
    evidence: |-
      screenshots/4-4/trace-summary.json (2026-11-20, 50 rows deleted, 1440 x 3400): Layout 0 and Paint 0 during both
      animation windows, but UpdateLayoutTree 2 during the fade and 5 during the slide, about 16 ms apart. Unverified
      whether the `translate` animations stay on the compositor or tick on the main thread (the wrapper also carries the
      virtualizer's inline `transform`). Settle it by reading the trace's Animation events for compositor failure
      reasons, or by trying the slide on an inner element instead of the wrapper.
    location: >-
      src/state/leaving-exit.ts
    severity: medium (unverified)
  - summary: >-
      The board's `exitDisabled={controller.isBusy}` wiring (L13) is tested only at the hook level, not on the board.
    evidence: |-
      grep finds no board test that overlaps a running collapse FLIP with a delete refresh; leaving-exit.test.tsx covers
      the hook with `disabled = () => true`. A board test needs a FLIP still running when the refresh lands.
    location: >-
      src/features/board/torrent-board.tsx
    severity: low
---

<intent-contract>

## Intent

**Problem:** After a delete succeeds, the deleted rows and cards vanish in one frame when the refreshed maindata lacks them, so Alex can't see which rows went. Today the order freeze keeps only the order: a hash that leaves the data drops on the same render (`src/state/order-freeze.ts:7-9`, `nextShownOrder` :82), and a row can't render without its torrent (`list-model.ts:291`, `card-list.tsx:342`).

**Approach:** The delete success hands its hashes to a new `src/state` "leaving" store as expected. When the merged maindata no longer has an expected hash, the store keeps a snapshot of its last torrent and keeps it in the shown order. The list and board run the exit through one `src/state` hook: the visible leaving rows fade (opacity 0.2 s), then they leave the order and the rows below slide up into place (`translate`, 0.2 s). The existing `holdOrderForAnimation()` holds new maindata order for the whole exit (AD-7, AD-13).

## Boundaries & Constraints

**Always:**
- Only hashes this tab deleted get the exit, and only once the data reflects the delete (AD-7). A success response alone never fades anything.
- Expected hashes expire 30 s after the success (`PENDING_TIMEOUT_MS`), so a later removal by another device drops without a fade.
- A hash that leaves the data without being expected (another device, VueTorrent, a category filter, a data reset) drops at once, exactly as today.
- Animate only `opacity` and `translate` (or `transform`) with WAAPI `element.animate`, never layout properties. Read positions at most once per phase, never per frame.
- Only leaving rows that are visible inside the scroller (clip boxes and viewport, as `entrance.ts` `sweep` does) fade. When none is visible, the hashes leave the order at once with no hold.
- Fade: all visible leaving rows fade together over 0.2 s, no stagger. Slide: starts after the fade ends, 0.2 s. Both use the app curve `cubic-bezier(.2,.8,.2,1)`.
- Hold the order with `holdOrderForAnimation()` from the fade start until the slide ends. Release on finish, cancel, unmount and a backstop timer, like `useEntrance`.
- Reduced motion (`prefersReducedMotion()` or `!canAnimate`): no fade, no slide, no hold. Leaving hashes leave the order at once.
- Layering: delete-confirm (feature) only calls the state store. List and board call the shared state hook. Features never import each other; `src/state` never imports `src/shared/ui`.
- Keep PR #40, #42 and #47 behavior: `followHash`/`setHash` split, `use-arrow-stepping.ts`, `[role="menu"]` plus `inMenus`, two-batch delete in `deletePlan`.
- AD-15: tests and automation use only fake qBittorrent responses.

**Never:**
- No animation library, no CSS keyframe for the exit (WAAPI only, so the hold can await `finished`).
- Never edit `['maindata']` outside `src/state/maindata.ts` (AR-39). Never animate the virtualizer's inline `transform` on the wrapper. Use `opacity` and the separate `translate` property on the wrapper, or animate a child.
- No change to delete-confirm's dialog, toasts, batches or selection pruning.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| L1 happy, list | Delete 3 visible rows, refresh lacks them | The 3 rows fade 0.2 s, then leave; rows below slide up 0.2 s; order held throughout | None |
| L2 off-screen | All deleted rows outside the scroller's visible box | They leave at once, no animation, no hold | None |
| L3 mixed | 2 visible, 5 off-screen | The 5 leave at once; the 2 fade; slide offsets count every row removed above each remaining row | None |
| L4 elsewhere | `removeElsewhere` or a hash not expected | Drops at once, no fade | None |
| L5 not yet reflected | Success arrived, refresh still has the hashes | Nothing fades; rows stay normal | None |
| L6 expired | Expected hash removed more than 30 s after success | Drops at once | None |
| L7 new data mid-exit | Maindata arrives during fade or slide | Values update in place; new hashes and reordering wait until the hold ends | None |
| L8 viewed deleted, desktop list | Detail shows a deleted row | The detail keeps that torrent (snapshot) until the row leaves at fade end, then 2.4's successor (next, else previous) | None |
| L9 viewed deleted, phone sheet or board panel | Same | Sheet or board panel closes at fade end, not before | None |
| L10 category emptied | Last rows of the category deleted | Rows fade, then 「這個分類沒有種子」 shows; the tab stays until leaving (3.2) | None |
| L11 reduced motion | `prefers-reduced-motion: reduce` | No animation, no hold; rows drop on the refresh | None |
| L12 two batches | 4.3's two batches leave in separate refreshes | The second group waits (rows stay, snapshots kept) until the running exit ends, then plays its own exit | None |
| L13 board collapse running | 2.8 FLIP busy on the board | Leaving cards drop without fade (the wrappers are owned by the FLIP) | None |
| L14 board grid rows | Board column in 2.8 grid layout | Fade plays; the slide is skipped (cards reflow at once) | None |
| L15 unmount mid-exit | Navigate away, switch view or category | Animations cancel, hold releases, remaining leaving hashes leave the order | None |

</intent-contract>

## Code Map

- `src/features/selection/delete-confirm.tsx:89-104` `deleteOp`: `onSuccess(client, {hashes})` runs once per batch (`pruneSelection`, `toast.plain`, `refreshMaindata`). Call the new `expectLeaving(hashes)` before `refreshMaindata` (:101).
- `src/state/maindata.ts:116-128` `queryFn`: has `previous` and the merged result. After `mergeMaindata`, hand `previous?.torrents` and the merged `torrents` to the leaving store so it snapshots expected hashes that vanished. `selectTorrents` is the record the list (`torrent-list.tsx:27`) and board (`torrent-board.tsx:89`) read; `board-detail.ts:30` too.
- `src/state/order-freeze.ts`:
  - `nextShownOrder` (:74) filters gone hashes (:82); `nextBoardColumns` (:307, :317) does the same per column. Keep leaving hashes where they are (alive = live or leaving).
  - `useFrozenOrder` (:377), `useBoardShownColumns` (:329), `holdOrderForAnimation` (:209, counted, idempotent release), `isBoardFrozen` is `animation` only (:51).
- `src/state/entrance.ts` (story 2.9) is the precedent for the hook: `useEntrance(containerRef, {ready})` (:185), visibility `sweep` with `clippingAncestors`, hold at :227, settle on `Promise.allSettled(finished)` plus backstop (:238), unmount cleanup (:244-252), StrictMode reset. Helpers `prefersReducedMotion` and `canAnimate` in `src/shared/entrance-motion.ts:21,30`; `HOLD_SLACK_MS` and `ENTRANCE_EASING` in `src/lib/entrance.ts`.
- `src/state/entrance-testing.ts`: `stubElementAnimate()` (:24, records keyframes and options, `finish()`, `cancel`), `stubReducedMotion()` (:66).
- List, `src/features/list/torrent-list.tsx`:
  - `useFrozenOrder` (:199), `usePublishShownList` (:216), empty decision (:220-239), virtualizer (:345-356, `getItemKey = shown[index]`, fixed `ROW_HEIGHT` 59 and `ROW_GAP` 2 from `list-model.ts:38,40`), wrapper (:415-426, `data-hash`, inline `transform: translateY`), `useEntrance` (:372).
  - `rowProps` returns null without the torrent (`list-model.ts:291`).
- Board, `src/features/board`:
  - `torrent-board.tsx:84-122` (`useBoardShownColumns`, `boardView` empty), `card-list.tsx:148` one virtualizer per column counting rows, `cardHeightOf` (`board-model.ts:216`, 89 or 101, gap 10), card wrapper (:348-370, `data-hash`, inline transform; grid uses `translate(x, start)` in transform), `groupRows` (:222).
  - 2.8 FLIP owns wrappers while busy: `board-collapse-controller.ts:29-37,562`.
  - Phone panels: `status-tabs.tsx:282-313`.
- Viewed: list follows the shown order via `useListViewed` (`src/state/list-viewed.ts:19,72-77`, `resolveListViewed` in `src/lib/detail-position.ts:100`), so keeping the hash in the order defers it. Board: `src/features/detail/board-detail.ts:32-38` closes when the hash is in no live column; it must count leaving hashes as present.
- Empty: `ListEmpty` (`src/shared/ui/list-blocks.tsx:20-32`); tab retention `resolveCategory`/`categoryTabs` (`src/lib/category-tabs.ts:123,175`), `_authed.tsx:185-193`.
- e2e: `e2e/entrance.spec.ts:38` `recordEntrance` (wraps `Element.prototype.animate` via `addInitScript`, can pause), reduced motion via `test.use({ reducedMotion: 'reduce' })` (:282-299); `e2e/delete.spec.ts:176-235` success, :493 elsewhere; `e2e/fixtures.ts` `setModes` (:250), `opCalls` (:209), `removeElsewhere` (:224). Fake delete endpoint `scripts/fake-qbit.mjs:726,741`, `data=many` is 4165 visible torrents (:326).
- Performance precedent: `scripts/trace-board-collapse.mjs` (headless Chromium trace, counts Layout and Paint events in the animation window, writes a summary).

## Tasks & Acceptance

**Execution:**
- `src/lib/leaving.ts` (new, + test): pure functions. `exitShifts(before, after, sizeOf, gap)` returns per remaining hash the px it moved up (sum of sizes plus gaps of removed hashes above it in `before`). Expiry check for expected entries. Test L3, removed rows at top, middle and bottom, mixed card heights, and nothing removed.
- `src/state/leaving.ts` (new, + test): the store. `expectLeaving(hashes)` with expiry; `captureLeaving(previousTorrents, nextTorrents)` called from `maindata.ts` that snapshots expected hashes that vanished and marks them leaving (a second group queues while an exit runs, L12); `finishLeaving(hashes)`; `useLeavingHashes()`; `useShownTorrents()` returning the maindata record overlaid with snapshots; reset on logout or data reset like `resetPendingOps`. Test L4, L5, L6, L12 and that a non-expected removal never snapshots.
- `src/state/maindata.ts`: call `captureLeaving` after the merge.
- `src/state/order-freeze.ts` (+ test): `nextShownOrder` and `nextBoardColumns` keep leaving hashes in place; the hooks read `useLeavingHashes()`. Existing behavior for every other hash is unchanged.
- `src/state/leaving-exit.ts` (new, + dom test): `useLeavingExit(containerRef, {order, sizeOf, gap, disabled})`. Finds rendered leaving wrappers by `data-hash`, keeps the visible ones, calls `finishLeaving` at once for the rest, fades the visible ones, then calls `finishLeaving` and, in the layout effect after the removal commit, slides every rendered wrapper by `exitShifts` (rows rendered only after the removal slide in too). Holds the order across both phases. Vitest covers: the hold is on at fade start and off after the slide (the AC's start and end), reduced motion (no animate, no hold, immediate finish), nothing visible, cancel on unmount, backstop release, keyframes touch only `opacity` and `translate`.
- `src/features/list/torrent-list.tsx`, `list-model.ts` (+ tests): read `useShownTorrents()`, call `useLeavingExit` with `ROW_HEIGHT`/`ROW_GAP`; the empty block waits while leaving rows are still shown (L10).
- `src/features/board/torrent-board.tsx`, `card-list.tsx` (+ tests): same per column with `cardHeightOf`; `disabled` while the 2.8 FLIP is busy (L13); no slide in grid layout (L14); empty waits.
- `src/features/detail/board-detail.ts` (+ test): a leaving hash counts as present until it leaves (L9).
- `src/features/selection/delete-confirm.tsx` (+ dom test): `expectLeaving(hashes)` per successful batch, before `refreshMaindata`.
- `e2e/delete-exit.spec.ts` (new): record `animate` calls like `recordEntrance`. Desktop list, desktop board and phone list: delete visible rows, assert the fade on those `data-hash` wrappers, then the slide on rows below, then the rows are gone; keyframe properties are only `opacity` and `translate`. L4 via `removeElsewhere`: no animate calls. L8 desktop detail switches only after the fade; L9 phone sheet closes after the fade. L10 empty block after the fade (`data=categories-emptied` or deleting the last rows). L11 reduced motion: no animations and the rows still drop.
- `scripts/trace-delete-exit.mjs` (new): `data=many`, a viewport tall enough that 50 rows are visible (1440 x 3400), tick 50 visible rows, delete without files, trace the exit window, count Layout and Paint events after each phase start, write `e2e-output/screenshots/4-4/trace-summary.json` and a summary PNG.
- Screenshots step (`_bmad-output/implementation-artifacts/screenshots/4-4/`): the trace summary PNG, plus Playwright video recordings (`recordVideo`) of the desktop list, desktop board and phone list delete exits, saved as `.webm`, with fake data only.

**Acceptance Criteria:**
- Given a delete succeeds and the refresh lacks the hashes, when the exit runs, then only `opacity` and `translate` animate, the order is held from the fade start to the slide end, and new maindata order applies after.
- Given 4165 fake torrents and 50 visible rows deleted, when the trace runs, then the exit window shows no Layout per frame (at most one at each phase start, from the removal commit), and the PR attaches the trace summary and the three recordings.
- Given reduced motion, when a delete succeeds, then no animation runs and the rows drop with the refresh.

## Spec Change Log

## Review Triage Log

### 2026-11-20: Review pass
- verdicts: 31 findings: high 1, medium 4, low 19, false 5, maybe-false 2
- findings:
  - `[false]` `[reject]` (intent) The detail switches at the fade's end, not after the slide: the spec chose this reading (L8, L9, Design Notes); changing it edits the spec.
  - `[false]` `[reject]` (intent) A second hold path in order-freeze.ts: holding the order while leaving rows are shown is what L7 and L12 require, and it lives in the AD-13 freeze owner.
  - `[false]` `[reject]` (intent) The performance evidence is a scripted CDP trace, not a DevTools screenshot: the invocation intent allowed a scripted check; the PR attaches the trace summary.
  - `[maybe-false]` `[defer]` (intent) Style recalcs during the animations: grouped with the Blind Hunter trace row, deferred.
  - `[low]` `[patch]` (intent) The phone sheet L9 has no e2e: unreachable from this tab on phone (no selection while the sheet is open); added a DOM test of `ListDetailSheet` (detail.dom.test.tsx).
  - `[medium]` `[patch]` (intent) The recordings test runs on every e2e run: now skipped unless `RECORD_DELETE_EXIT` is set.
  - `[medium]` `[patch]` (blind) Deleted rows above the view left at once and jumped the visible rows up before the fade: when a row fades, the non-visible leaving rows now stay (unanimated) and leave with it, the slide covers them, sizes captured for all at the fade end. L3 test updated.
  - `[low]` `[patch]` (blind) `disabled()` only asked at the exit start: the `removing` branch now ends without a slide when it returns true; hook test added.
  - `[low]` `[reject]` (blind) `captureLeaving` inside the query function for a result later discarded: the window is a fetch cancelled after its merge, and the next poll removes the row anyway; the fix (a cache subscriber) is more than a direct correction.
  - `[low]` `[reject]` (blind) `lastRef` written during render in board-detail.ts: a discarded render can only leave the same hash's earlier target for the 0.2 s fade; the fix needs state plus an effect.
  - `[low]` `[patch]` (blind) `resetLeaving` has no production caller (neither has `resetPendingOps`): corrected the doc comment to say tests only.
  - `[medium]` `[patch]` (blind) The recordings test runs on every e2e run and rewrites tracked files: same fix as above.
  - `[low]` `[patch]` (blind) The trace script wrote to the gitignored folder: it now writes to `screenshots/4-4/`.
  - `[maybe-false]` `[defer]` (blind) UpdateLayoutTree on most slide frames, 64 slides for 54 visible rows: Layout and Paint are 0 during both windows; whether the slide stays on the compositor is unverified (deferred). The 64 slides are overscan rows that slide into view, which is intended.
  - `[low]` `[patch]` (blind) Untested wiring: added `withLeavingSnapshots` unit tests and the board grid L14 test (board-collapse.dom.test.tsx). The hold plus view change case keeps the existing hold semantics; e2e for L12 and L15 is covered by unit tests.
  - `[low]` `[reject]` (blind) `EXPECT_LEAVING_MS` duplicates `PENDING_TIMEOUT_MS`: an equality test keeps them in step; moving the constant is a refactor across modules.
  - `[false]` `[reject]` (blind) Double release and no rerender on the cut path: the release from `holdOrderForAnimation` is idempotent by design (`released` flag), and `finishLeaving`'s store update re-renders every subscriber.
  - `[low]` `[patch]` (gap) Phone list sheet snapshot untested: added the 4.4 case in the phone sheet describe.
  - `[low]` `[patch]` (gap) Board grid `slide: false` untested: added in board-collapse.dom.test.tsx; fails with `slide: true` forced.
  - `[low]` `[defer]` (gap) Board `exitDisabled={controller.isBusy}` untested on the board: deferred as filed (needs a FLIP running when the refresh lands).
  - `[low]` `[patch]` (gap) Board view switch mid-fade untested: added with a keyword switch (a category switch remounts the board, so it could not fail).
  - `[low]` `[patch]` (gap) The cut branch untested: added the hook test (fade cancelled, hold off, no leaving hashes).
  - `[medium]` `[patch]` (gap, other) The recordings test runs on every e2e run: same fix as above.
  - `[low]` `[patch]` (gap, other) `resetLeaving` doc says data reset: corrected.
  - `[high]` `[patch]` (edge) The unclaimed timer compared the active group by array identity, so a hash shown nowhere (e.g. in the collapsed 已整理 column) stayed active forever once part of its group finished, holding the order and every queued group: the timer now tracks the group by a counter and finishes every unclaimed active hash; test added.
  - `[low]` `[patch]` (edge) A collapse FLIP starting mid-exit: same fix as the `disabled()` row.
  - `[low]` `[patch]` (edge) A fading row can still be clicked or ticked: fading wrappers get `inert`, cleared when a run is cut; tested.
  - `[low]` `[reject]` (edge) `holdAddsNew` with new torrents mid-exit misplaces the slide: needs failed extra sort keys plus new torrents within a 0.4 s exit; the fix changes the order maths.
  - `[low]` `[patch]` (edge) `resetLeaving` has no production caller: doc corrected (same as above).
  - `[low]` `[patch]` (edge) The phone sheet L9 is not in e2e: same as the intent row; DOM test added.
  - `[false]` `[reject]` (edge) Other hashes stop reordering while leaving rows or a queued group are shown: L7 and L12 hold the order on purpose for the whole exit and its queue.

## Design Notes

Claude 代決 (Alex can veto):
- Fade first, then slide (design-advisor, taste-log principle 1): rows below never cover a row still fading. All visible rows fade together, no stagger.
- The slide lasts 0.2 s with the app curve. The spec gives only the fade's 0.2 s.
- The row leaves the order at the fade's end. That is when the detail switches (L8, L9) and the empty block shows (L10). The order hold lasts until the slide ends.
- A second batch's rows wait for the running exit (L12) instead of joining it mid-slide.
- Board in 2.8 grid layout: fade only, no slide (L14). During a 2.8 collapse the cards drop (L13).
- The performance trace uses a 3400 px tall window, because 50 rows can't be visible at 900 px.
- Recordings are `.webm` files in the screenshots folder, linked from the PR. The recording test runs only with `RECORD_DELETE_EXIT=1`.
- When a row fades, the deleted rows out of view stay (unanimated) until the fade ends and leave with it, so the visible rows never jump; when none is visible they leave at once (review pass).
- Fading rows are `inert` (review pass).

Implementation notes (where the code differs from the plan above):
- `useShownTorrents` lives in `src/state/maindata.ts`: `leaving.ts` importing `maindata.ts` would be an import cycle. For the same reason the 30 s expiry is `EXPECT_LEAVING_MS` in `src/lib/leaving.ts`, kept equal to `PENDING_TIMEOUT_MS` by a test.
- `useLeavingExit` takes `disabled` as a function (asked when an exit starts and before the slide) and a `slide` flag for the grid layout.
- Leaving hashes no surface takes on within 1 s (`UNCLAIMED_LEAVING_MS`, e.g. a card in the collapsed 已整理 column) are finished by a timer, so a later group never waits on them.
- The phone sheet L9 is a DOM test only: on phone this tab cannot select while the sheet is open, so it cannot delete the torrent the sheet shows. The board panel L9 is in e2e.

AD-11 docs:
- Web Animations `Element.animate()`: https://developer.mozilla.org/en-US/docs/Web/API/Element/animate
- CSS `translate` property (separate from `transform`): https://developer.mozilla.org/en-US/docs/Web/CSS/translate
- `prefers-reduced-motion`: https://developer.mozilla.org/en-US/docs/Web/CSS/@media/prefers-reduced-motion
- TanStack Virtual 3.14.26: https://tanstack.com/virtual/v3/docs/api/virtualizer
- TanStack Query `QueryFunctionContext`: https://tanstack.com/query/v5/docs/framework/react/guides/query-functions
- Playwright video recording: https://playwright.dev/docs/videos
- Chrome DevTools Protocol Tracing: https://chromedevtools.github.io/devtools-protocol/tot/Tracing/

## Verification

**Commands:**
- `source ~/.nvm/nvm.sh && nvm use && npm run lint && npm run typecheck`: expected to pass.
- `source ~/.nvm/nvm.sh && nvm use && npm test`: all pass, including the new lib, state, hook and feature tests.
- `source ~/.nvm/nvm.sh && nvm use && npm run build && caffeinate -dimsu npx playwright test`: all pass.
- `source ~/.nvm/nvm.sh && nvm use && node scripts/trace-delete-exit.mjs`: writes the summary; no per-frame Layout in the exit window.
- `bash .claude/skills/next-story/check.sh`: every line ok.

## Auto Run Result

Status: done (first pass; a follow-up review pass is recommended).

**Change.** A delete that succeeds hands its hashes to `src/state/leaving.ts` as expected. When merged maindata lacks one, the store keeps a snapshot and the hash stays in the shown order. The list and every board column run `useLeavingExit` (`src/state/leaving-exit.ts`): visible deleted rows fade (opacity 0.2 s, together), then leave with any deleted rows out of view, and the rows below slide up (`translate` 0.2 s). The order holds through `holdOrderForAnimation` for the whole exit. Removals this tab did not ask for, expired ones and reduced motion drop at once.

**Files.**
- `src/lib/leaving.ts` (+ test): timing constants, expiry, `exitShifts`.
- `src/state/leaving.ts` (+ test): expected and leaving hashes, snapshots, groups and queue, unclaimed timer.
- `src/state/leaving-exit.ts` (+ test): the shared exit hook.
- `src/state/maindata.ts` (+ test): `captureLeaving` after the merge, `withLeavingSnapshots`, `useShownTorrents`.
- `src/state/order-freeze.ts` (+ test): leaving hashes stay where they are shown.
- `src/features/list/torrent-list.tsx`, `src/features/board/{torrent-board,card-list,board-column,archived-column,board-collapse-controller}.tsx|ts`: wire the exit, `isBusy`, empty waits for the exit.
- `src/features/detail/{board-detail,list-detail-panel,phone-detail-sheet}`: draw from the snapshot until the row leaves.
- `src/features/selection/delete-confirm.tsx`: `expectLeaving` per successful batch.
- `e2e/delete-exit.spec.ts`, `scripts/trace-delete-exit.mjs`, `screenshots/4-4/` (trace summary, three recordings).

**Review.** 31 findings. Patched: high 1, medium 2 entries (4 medium rows), low 13 rows. Deferred: 2 (style recalc on slide frames, unverified; board-level L13 test). Rejected: 5 false, 4 low (each with its reason in the triage log).

**Follow-up review: true.** A high was patched. The unreviewed risk is the reworked exit: off-screen rows kept until the fade end, the counter-based unclaimed timer and `inert` on fading rows are new logic no reviewer has read.

**Verification (2026-11-20, after the patches).**
- `npm run lint`, `npm run typecheck`: pass.
- `npm test`: 139 files, 3395 tests pass.
- `npm run build`: pass.
- `npx playwright test` on delete-exit, delete, entrance, selection, board-collapse, category-tabs: 58 passed, 1 skipped (the recordings test). The full suite (154 passed) ran before the patches.
- `node scripts/trace-delete-exit.mjs`: 50 of 54 visible rows deleted; Layout 0 and Paint 0 during both animation windows; 1 Layout at the fade start and 2 at the slide start; UpdateLayoutTree 2 and 5 during the windows (deferred).
- `check.sh`: every line ok.

**Residual risks.** The slide's per-frame style recalc (deferred). A collapse FLIP starting during the fade is handled only by skipping the slide.
