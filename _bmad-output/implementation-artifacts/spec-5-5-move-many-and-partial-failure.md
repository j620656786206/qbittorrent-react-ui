---
title: 'Story 5.5: Move several at once and partial failure'
type: 'feature'
created: '2026-11-21'
status: 'done'
review_loop_iteration: 0
followup_review_recommended: false
baseline_revision: '53b9c1a52c323696864f346006747711a56bcbd2'
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-5-context.md'
  - '{project-root}/_bmad-output/implementation-artifacts/spec-5-2-change-one-torrent-path.md'
warnings: ['oversized']
deferred: []
---

<intent-contract>

## Intent

**Problem:** The selection bar's 「改路徑」 is still disabled and the change-path screen only handles one torrent, so Alex cannot move a batch of torrents to one place, and nothing shows which torrents of a batch failed.

**Approach:** Enable 「改路徑」 on the selection bar (desktop and phone) to open the change-path screen for every selected torrent. The screen gets a many-torrent mode (title, location count, 「目前 N 個」, empty box, skip torrents already at the target) and a partial-failure view that lists only the failed torrents with their reasons and retries only them.

## Boundaries & Constraints

**Always:**
- `src/features/selection/selection-bar.tsx`: 「改路徑」 enabled on desktop and phone; it opens the change-path screen for every selected hash through `openChangePath`, marked as opened from the selection (e.g. `{ hashes, fromSelection: true }` in `src/state/change-path-open.ts`).
- Many mode is two or more hashes. One selected hash opens the single-torrent screen exactly as from the detail (title 「改路徑」, name, box defaults to its `save_path`, 5.3's done toast), except that success also clears the selection.
- Many mode layout (EXPERIENCE change-path, DESIGN change-path, mockup S08-path-many-desktop):
  - Title 「搬 N 個種子」, below it 「N 個種子現在在 M 個位置」, M = distinct normalized `save_path` values in the batch.
  - Each common-path row shows 「目前 K 個」 (outline tag) when K torrents of the batch are in that path now, by the same longest-match rule 5.1 uses for 「目前」 (`src/lib/paths.ts`). Rows with K = 0 show no tag.
  - The 「會搬到」 box starts empty. 「搬過去」 is disabled when the box is empty or fails the shared path schema (5.2's reasons), or when every torrent of the batch is already at the normalized target.
  - 「加到常用」 and edit mode behave as in 5.2 and 5.4.
- Sending in many mode: only hashes whose normalized `save_path` differs from the target are sent, in one `setLocation` call built with `moveVariables(client, hashes, location)` (the 400 KB hash-list limit, AD-12). Button 「搬移中…」 and the 4.3 sending rules apply.
- Full success (every sent item ok): close the screen, `refreshMaindata()`, toast 「已開始搬 K 個種子」 with K = items sent and ok, clear the selection. No 「接著改檔名」, and no 5.3 done or failed toasts for a many-mode move: only a single-hash move writes 5.3's per-tab move record. Moving still shows from `movingTo` (5.3).
- Partial failure (the call answered, some items refused by the container's pre-check): the screen stays open and switches to a failure view:
  - Top line in `status-error`: 「A 個開始搬了，B 個失敗」 (A = ok items, B = failed items).
  - One row per failed torrent: its name (plain text), and under it a `status-error` line with the reason from `src/lib/error-text.ts` by code for a move item (5.2/PR #59 texts, e.g. the torrent is gone, the torrent is already moving).
  - The primary button reads 「重試 B 個」 and sends `setLocation` again with only the failed hashes and the same target; 取消 or ✕ closes the screen.
  - Succeeded torrents behave normally (they leave a filter when their state changes); no separate toast. The selection keeps only the failed hashes.
  - A retry that fully succeeds closes the screen with the same 「已開始搬 K 個種子」 toast (K = items of that retry) and clears the selection; a retry that partly fails shows the view again for the remaining failures.
- Whole request failure with a non-connection code: failure toast with 重試 (the 5.2 move op behaviour), the screen stays open, the box keeps its path. Connection codes are left to the global handler.
- Error text, toast keys and op wiring reuse 5.2, 5.3 and PR #59: `MoveItemRefused`, `MOVE_TORRENT_GONE`, `MOVE_ALREADY_MOVING`, `moveToastKey`, `isMovingTorrent`, `changePathView(…, moving)`. No `MOVE_PENDING_OP`.
- Fake qBittorrent only (AD-15). Fixtures and screenshots use fictional data; private categories only as X or mteam-X.

**Never:**
- No change to the container's `setLocation` rules, `movingTo` or the pre-check codes; no new error codes.
- No rename (5.6 to 5.8), no 「接著改檔名」.
- No new dependencies; `src/state` never imports `src/shared/ui` or server functions; no `startsWith` path checks or `torrent.state ===` in features.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| N1 open many | 5 selected: 3 in `/data/torrents/tv`, 2 in `/data/downloads` | title 「搬 5 個種子」, 「5 個種子現在在 2 個位置」, 下載區（影集） row 「目前 3 個」, box empty, 搬過去 disabled | none |
| N2 all there | box `/data/torrents/tv/` and every selected torrent is in `/data/torrents/tv` | 搬過去 disabled | none |
| N3 skip already there | 5 selected, 3 already at the target | one call with the other 2 hashes; toast 「已開始搬 2 個種子」; selection cleared; screen closed | none |
| N4 partial | 4 sent, 1 already moving, 1 gone | 「2 個開始搬了，2 個失敗」; two rows with their reasons; 「重試 2 個」 | none |
| N5 retry | press 「重試 2 個」 | one call with those 2 hashes and the same target; success closes with 「已開始搬 2 個種子」 | partial again: view shows the rest |
| N6 whole failure | `ops=reject` | failure toast with 重試; screen open; box kept | none |
| N7 one selected | 1 selected | single screen as from the detail; success clears the selection | as 5.2 |
| N8 no done toast | many-mode move lands | rows show moving then land; no 「已搬到」 toast | none |

</intent-contract>

## Code Map

- `src/features/selection/selection-bar.tsx` -- 「改路徑」 disabled (desktop L132-140 area and the phone row); selection store helpers (`src/state/selection.ts` or similar) for clearing and keeping only some hashes.
- `src/state/change-path-open.ts` -- `openChangePath(hashes, options?)` with `editPath` (5.4); add the selection origin.
- `src/features/path/change-path-screen.tsx` -- uses `opened?.hashes[0]` (L168); single-torrent title, box default, send, edit mode (5.4), toasts and dismiss keys; extend for many mode and the failure view.
- `src/features/path/change-path-model.ts` -- `changePathView` (takes `moving`); add the many-mode view (counts, all-there check, hashes to send).
- `src/features/path/set-location-op.ts` -- `moveVariables`, `MoveItemRefused` (single item thrown as a failure), `recordMoves` on success (5.3), `MOVE_OP`; many mode needs the per-item result back instead of a throw, and no move records.
- `src/lib/paths.ts` -- `currentCommonPath`, `listedCommonPath`, `locationOf`; `src/shared/save-path.ts` `normalizeSavePath`.
- `src/lib/error-text.ts` -- `setLocationFailureText`, `MOVE_TORRENT_GONE`, `MOVE_ALREADY_MOVING`.
- `src/shared/ui/confirm-shell.tsx` -- primary label, `subtitle`, `initialFocus` (5.2, 5.4).
- `src/state/move-outcomes.ts`, `src/state/pending-ops.ts` -- 5.3 move records (single moves only).
- `src/lib/toast.ts` -- `toast.plain`, `toast.failure`.
- `scripts/fake-qbit.mjs` -- setLocation (5.2), `move=hold|fail`, `/__fake/move` (another client's move, used to make a torrent already moving); `e2e/fixtures.ts` `moveElsewhere`, `releaseMoves`, `opCalls`.
- `scripts/e2e-shards.mjs` -- `path` group (change-path, move-status, common-paths); add the new spec there.
- `e2e/selection.spec.ts`, `e2e/change-path.spec.ts` -- selection-bar and screen patterns; screenshots under `_bmad-output/implementation-artifacts/screenshots/<id>/`.

## Tasks & Acceptance

**Execution:**
- `src/state/change-path-open.ts` (+ test) -- selection origin.
- `src/features/path/change-path-model.ts` (+ test) -- many-mode view: title text, location count, 「目前 K 個」 per row, hashes to send, all-there check (N1, N2, N3).
- `src/features/path/set-location-op.ts` (+ test) -- many-mode results per item, no move records for many.
- `src/features/path/change-path-screen.tsx` (+ DOM tests) -- many mode, send, full success, failure view, retry (N1 to N8).
- `src/lib/error-text.ts` (+ test) -- the failure header and 「已開始搬 K 個種子」 texts if not already there.
- `src/features/selection/selection-bar.tsx` (+ DOM test) -- enable 改路徑, open the screen, clear or narrow the selection after the result.
- `scripts/fake-qbit.mjs`, `e2e/fixtures.ts` -- whatever the new e2e needs beyond 5.3's controls.
- `scripts/e2e-shards.mjs` -- add `move-many.spec.ts` to `path`.
- `e2e/move-many.spec.ts` -- desktop and phone flows (N1, N3, N4, N5, N6); screenshots to `_bmad-output/implementation-artifacts/screenshots/5-5/`.

**Acceptance Criteria:**
- Given several torrents selected, when 「改路徑」 on the selection bar is pressed, then the many-mode screen matches N1 on desktop and phone.
- Given a target, when 「搬過去」 is pressed, then only torrents not already there are sent in one call, and full success closes the screen, shows 「已開始搬 K 個種子」 and clears the selection (N3, N8).
- Given some items refused, when the result comes back, then the failure view, 「重試 B 個」 and the narrowed selection hold (N4, N5).
- Given a whole-request failure, when the result comes back, then N6 holds.
- Given the fake qBittorrent, when screenshots run, then desktop 1440 and phone 390, light and dark, exist for: 搬 5 個種子 with 「目前 N 個」, the partial-failure view with 「重試 2 個」.

## Spec Change Log

## Review Triage Log

### 2026-11-21: Review pass
- verdicts: 29 findings: high 0, medium 0, low 24, false 5, maybe-false 0
- findings:
  - `[low]` `[reject]` (intent) A batch move also loses 5.3's failed-after-start toast: the brief limits 5.3's record to single moves; moving still shows from `movingTo`.
  - `[low]` `[reject]` (intent) The torrent-gone case is covered only with mocked answers: the client drops gone torrents before sending; the DOM tests cover the text.
  - `[false]` `[reject]` (intent) Skipping torrents already at the target: diff and intent agree, tested at all levels.
  - `[low]` `[reject]` (intent) A fully successful retry shows 「已開始搬 K 個種子」: logged Claude 代決 (the retry is a new send; the partial-failure AC forbids a toast for the started ones in that answer).
  - `[false]` `[reject]` (intent) The 400 KB limit is not touched: 5.2's `setLocation` already uses `HASH_LIST_BODY_LIMIT`, tested there.
  - `[low]` `[patch]` (intent) The title counts the live batch: frozen at send time in the failure view (same fix as the edge row).
  - `[low]` `[reject]` (intent) 搬過去 disabled when all are there is covered only by model and DOM tests: enough for a pure check.
  - `[low]` `[reject]` (intent) The `path` shard's new time is not shown: CI showed it at 7.8 minutes before this story; move-many adds a few minutes, well under 20.
  - `[false]` `[reject]` (intent) The old e2e specs may not have run: they run in verification.
  - `[low]` `[reject]` (edge) An answer arriving after the open store was replaced loses the failure: the screen locks every close path while sending.
  - `[low]` `[reject]` (edge) The staleness check compares by identity: same as above.
  - `[false]` `[reject]` (edge) The answer's items may not match the sent hashes: the container answers one item per input hash, in order (5.2).
  - `[low]` `[patch]` (edge) The failure view can read 「搬 0 個種子」: title and subtitle frozen at send time; DOM test.
  - `[low]` `[patch]` (edge) 重試 resends torrents that left maindata: retry counts and sends only failed torrents still present and not at the target; disabled at 0.
  - `[low]` `[reject]` (blind) 「目前 K 個」 counts subfolders by longest match while the skip rule is exact: picking a row targets that folder, as in single mode (5.2).
  - `[low]` `[reject]` (blind) No count before pressing: no spec text; the toast reports the count sent.
  - `[low]` `[reject]` (blind) Many mode has no moving note: logged Claude 代決 (moving torrents come back refused and listed with their reason).
  - `[low]` `[patch]` (blind) The failure view's title and subtitle keep changing: same fix as the edge row.
  - `[low]` `[patch]` (blind) Enter that leads to the failure view drops focus to body: focus moves to the failure header; DOM test.
  - `[low]` `[patch]` (blind) The status header may not be announced: same fix (focused on switch).
  - `[low]` `[reject]` (blind) The two answer branches guard `clearSelection` differently: needs a late answer after a reopen; closing is locked while sending.
  - `[low]` `[patch]` (blind) A retry does not skip torrents already at the target: same fix as the edge retry row.
  - `[low]` `[patch]` (blind) Missing tests for one hash left to send and for focus after the move: added.
  - `[low]` `[reject]` (blind) The shard comment lists old minutes: see the intent row on the path shard.
  - `[low]` `[reject]` (blind) The e2e N8 check uses a fixed 2 s wait: test speed only.
  - `[low]` `[reject]` (blind) Two type casts in the screen: cosmetic.
  - `[false]` `[reject]` (blind) Spec and screenshots are untracked: committed with the story.
  - `[low]` `[patch]` (verification) Focus after a many move is untested: DOM tests for full success (main) and partial failure (header).
  - `[low]` `[patch]` (verification) The failure view's guard against closing is untested: DOM test removing every batch torrent.

## Design Notes

- Claude 代決: one selected torrent opens the single-torrent screen (its name, its path in the box, 5.3's done toast), since 「搬 1 個種子」 says less than the name; success still clears the selection.
- Claude 代決: torrents already moving are sent and come back refused by the pre-check, so they show in the failure view with their reason instead of being skipped silently. If every sent item fails, the header reads 「0 個開始搬了，B 個失敗」 the same way.
- Claude 代決 (implementation and review): a fully successful retry shows 「已開始搬 K 個種子」 for that retry. In the failure view the title and subtitle stay as they were at send time; 「重試 K 個」 counts only failed torrents still present and not at the target, disabled at 0; focus moves to the failure line. The fake gained `paths=batch`.
- Claude 代決: after partial failure the selection keeps only the failed hashes (the AC's "Claude 代決：來源沒寫").

## Verification

**Commands:**
- `source ~/.nvm/nvm.sh && nvm use && npm run lint` -- expected: 0 errors
- `source ~/.nvm/nvm.sh && nvm use && npm run typecheck` -- expected: exit 0
- `source ~/.nvm/nvm.sh && nvm use && npm test` -- expected: all pass
- `source ~/.nvm/nvm.sh && nvm use && node scripts/verify-shards.mjs` -- expected: every spec in exactly one shard
- `source ~/.nvm/nvm.sh && nvm use && npm run build && npx playwright test e2e/move-many.spec.ts e2e/change-path.spec.ts e2e/move-status.spec.ts e2e/common-paths.spec.ts e2e/selection.spec.ts e2e/delete.spec.ts` -- expected: all pass
- `bash .claude/skills/next-story/check.sh` -- expected: every line ok

## Auto Run Result

Status: done (one review pass). Follow-up review not recommended: no high or medium patched (low 5 entries).

**Change.** The selection bar's 「改路徑」 opens the change-path screen for every selected torrent. One selected torrent gets the single screen (success also clears the selection). Two or more get many mode: 「搬 N 個種子」, 「N 個種子現在在 M 個位置」, 「目前 K 個」 on rows that hold some of the batch, an empty box, and only torrents not already at the target sent in one call. Full success closes with 「已開始搬 K 個種子」 and clears the selection; partial failure switches to a failure view (「A 個開始搬了，B 個失敗」, one row per failed torrent with its reason, 「重試 K 個」) and narrows the selection to the failed torrents. Many moves write no 5.3 move record.

**Review.** 29 findings: 5 entries patched, 0 deferred, the rest rejected with reasons in the triage log.

**Verification (2026-11-21, after the patches).**
- `npm run lint`: 0 errors; `npm run typecheck`: exit 0.
- `npm test`: 165 files, 4129 tests pass.
- `node scripts/verify-shards.mjs`: 26 specs, each in one shard (`move-many.spec.ts` in `path`).
- `npx playwright test` move-many, change-path, move-status, common-paths, selection, delete: 66 passed.
- `check.sh`: every line ok. Matrix rows N1 to N8 each have a tagged test that ran.

**Residual risks.** The torrent-gone refusal reaches the container only with stale client data; it is covered by DOM tests with mocked answers. The `path` shard's CI time should be checked on this PR's run.
