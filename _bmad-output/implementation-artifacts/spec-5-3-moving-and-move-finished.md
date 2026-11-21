---
title: 'Story 5.3: Moving and move finished'
type: 'feature'
created: '2026-11-21'
status: 'done'
review_loop_iteration: 0
followup_review_recommended: false
baseline_revision: 'd68c82afdd1ae5c323ec1179672bb340bd5608bf'
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-5-context.md'
  - '{project-root}/_bmad-output/implementation-artifacts/spec-5-2-change-one-torrent-path.md'
warnings: ['oversized']
deferred: []
---

<intent-contract>

## Intent

**Problem:** After 「搬過去」 the change-path screen closes and nothing on the row or the detail says the files are moving, so Alex may think nothing happened and press again. Nothing tells him when the move is really done, and the 5.2 pending entry that holds the target times out after 30 s and is overwritten by a pause.

**Approach:** Treat a torrent as moving when the container's `movingTo` is set or qBittorrent reports `moving`, decided only in `src/lib/torrent-status.ts`, and show it on rows, cards and the detail (summary prefix, four disabled save-path buttons). Keep a per-tab record of moves this tab started, separate from the 30 s pending ops, and let a `src/lib` pure function decide done, failed or still waiting from that record plus the previous and current torrent; only the starting tab shows the done or failed toast.

## Boundaries & Constraints

**Always:**
- `src/lib/torrent-status.ts` decides moving: `isMovingTorrent(torrent)` is true when `torrent.movingTo` is set or qBittorrent's state is `moving`. `classify()` reports `moving: true` and `detail: '搬移中'` in both cases; the board column stays what `classify()` gives (a torrent with `movingTo` and a non-moving state keeps its own kind; a `moving` state keeps the remembered kind as in Epic 1).
- The container's sync rules keep reading qBittorrent's state alone (a state-only helper such as `isQbitMoving`), so `settleMoves`, `errorStarts` and the error-reason poll do not change meaning. `readMoveStates` keeps `movingTo || moving`.
- No `torrent.state ===` in features or routes.
- Detail summary (`src/lib/detail-hero.ts`): while moving, the summary parts start with 「搬移中」 and, when `movingTo` is set, 「正在搬到 <movingTo>」, then the usual parts (rendered `搬移中 · 正在搬到 /data/media/tv · …`). The path is plain text.
- Save-path block: while moving, all four buttons (複製, 「☆ 加到常用」, 改路徑, 改檔名) are native `disabled` (50%, no hover, not focusable). This removes Story 2.5's 「不含搬移中」 note. The state comes from `movingTo` in maindata, so closing the screen, reloading and another device all show it.
- The per-tab move record lives in `src/state/pending-ops.ts` beside the 30 s ops, replacing 5.2's unread `targets`: per hash `{ target, startedAt, seen }`, written when `setLocation` answers ok for that hash (not on send), never touched by the 30 s timer or by `markPending` of another op, replaced by a newer move of the same hash, and removed when the decision is done or failed, when the torrent leaves maindata, or after 10 minutes without ever seeing the move (same bound as the container's expiry; no toast).
- A pure function in `src/lib` (e.g. `src/lib/move-outcome.ts`) takes the record, the previous and the current torrent and returns `waiting` (with `seen` updated), `done` or `failed`:
  - `movingTo` present or state `moving` in the current torrent: `waiting`, `seen: true`.
  - seen before, now neither: `done` when the normalized `save_path` equals the normalized target, else `failed`.
  - not seen yet, neither now, normalized `save_path` equals the target: `done` (the move finished between two polls).
  - not seen yet, neither now, `save_path` not the target: `waiting`.
- A state hook (e.g. `useMoveOutcomes`) mounted once in `_authed.tsx` runs the function on every maindata change for each recorded hash. Done: `toast.plain(「已搬到 <name>」)`, `<name>` from the 5.1 resolver for the new `save_path` (the same name as the location tag). Failed: `toast.failure(「沒有搬到 <target>」)` with 重試 that sends `setLocation` again with the same hash and target through the existing move op (the bound call is built in the route; `src/state` never imports server functions or `src/shared/ui`).
- Another device's move (no record in this tab) shows moving and never a toast. A reload loses the record, so the reloaded tab shows moving and no toast.
- Fake qBittorrent only (AD-15). Screenshots and fixtures use fictional data; private categories only as X or mteam-X.

**Never:**
- No 「接著改檔名」 button on the done toast (5.8). No change-path screen changes, no selection-bar moves (5.5), no rename (5.6 to 5.8).
- No change to the container's `movingTo` rules or the 10-minute expiry (5.2's deferred item waits for the NAS check).
- No writes to `['maindata']`, no edits to local torrent data, no new error codes, no new dependencies.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| M1 movingTo, not moving yet | `state: downloading`, `movingTo: /data/media/tv` | row and card second line 「搬移中」; card stays in 下載中 column; detail summary `搬移中 · 正在搬到 /data/media/tv · …`; four save-path buttons disabled | none |
| M2 moving, no movingTo | `state: moving` (moved by another client), remembered `uploading` | 「搬移中」 on row and card, column from the remembered kind; summary starts 「搬移中」 with no target part; buttons disabled | none |
| M3 not moving | no `movingTo`, normal state | everything as before; buttons enabled as in 5.2 | none |
| O1 done | record `/data/media/tv` seen; now no `movingTo`, `save_path` `/data/media/tv/` | `done`; toast 「已搬到 影集媒體庫」; record removed; tag turns purple | none |
| O2 failed | record seen; now no `movingTo`, `save_path` unchanged | `failed`; toast 「沒有搬到 /data/media/tv」 with 重試; 重試 sends the same hash and target | record removed |
| O3 fast move | record not seen; now no `movingTo`, `save_path` is the target | `done` | none |
| O4 not yet visible | record not seen; maindata unchanged | `waiting` | none |
| O5 other device | no record; `movingTo` appears then goes | moving shown, no toast | none |
| O6 survives | record kept past 30 s and across a pause of the same torrent | still decided when the move ends | none |
| O7 gone or stale | torrent removed; or record unseen for 10 min | record dropped, no toast | none |

</intent-contract>

## Code Map

- `src/lib/torrent-status.ts` -- `isMovingTorrent` L270 (state only today), `effectiveKind` L255 (moving keeps the remembered kind), `classify` L402 (`detail: moving ? '搬移中' : …`, `moving`), `pauseActionOf` L317 uses `isMovingTorrent`.
- `src/server/sync/torrent-table.ts` L221, L266 and `src/server/sync/syncer.ts` L237, L265 -- server callers of `isMovingTorrent`; switch the first three to a state-only helper.
- `src/lib/detail-hero.ts` -- `summaryPartsOf` L128, `detailHero` L143, `DetailHero.summaryParts` L40.
- `src/lib/maindata-merge.ts` -- `stateBeforeMove` L24-148 (remembered kind while `moving`).
- `src/features/list/list-model.ts`, `src/features/board/board-model.ts`, `board-card.tsx` -- second lines come from `classify().detail`; check they need no change beyond the lib.
- `src/features/detail/overview.tsx` -- `Overview` L48 (builds `detailHero`), `SavePathBlock` L231 (four buttons; 改路徑 calls `openChangePath`). Story 2.5's 「不含搬移中」 note is in this file's comments.
- `src/state/pending-ops.ts` -- `PENDING_TIMEOUT_MS` L19, `targets` (5.2, no reader), `markPendingAll(hashes, op, target?)`, `pendingTargetOf`, `prunePending` L151, `MOVE_PENDING_OP`.
- `src/features/path/set-location-op.ts` -- `setLocationOp` (`onSend` marks `MOVE_PENDING_OP`, `onSuccess` refreshes maindata); record the move per ok item there. `src/routes/_authed.tsx` L138 `moveOp`, L548 `<ChangePathScreen>`; mount the outcome hook here.
- `src/state/maindata.ts` -- `useMaindata`, `selectTorrents`; `src/state/locations.ts` `useLocationResolver`; `src/lib/paths.ts` `locationOf`; `src/shared/save-path.ts` `normalizeSavePath`.
- `src/lib/toast.ts` -- `toast.plain`, `toast.failure(text, { keys, onRetry })`; `src/state/tracked-op.ts` `sendOp`.
- `scripts/fake-qbit.mjs` -- setLocation handler from 5.2 (moving 3 s, then the target; `ops=reject`, `ops=slow`); `stateOverrides`; `e2e/fixtures.ts` `setModes`, `Modes`.
- `e2e/change-path.spec.ts` -- 5.2 flows to extend; screenshot pattern writing to `_bmad-output/implementation-artifacts/screenshots/<id>/`.

## Tasks & Acceptance

**Execution:**
- `src/lib/torrent-status.ts` (+ test) -- moving from `movingTo` or state; a state-only helper for the server; `classify` per Always.
- `src/server/sync/torrent-table.ts`, `src/server/sync/syncer.ts` -- use the state-only helper where they mean qBittorrent's state; existing tests stay green.
- `src/lib/detail-hero.ts` (+ test) -- moving summary prefix (M1, M2).
- `src/lib/move-outcome.ts` (+ test) -- the pure decision, rows O1 to O4 and the seen flag.
- `src/state/pending-ops.ts` (+ test) -- the per-tab move record per Always (O6, O7), replacing `targets`.
- `src/state/move-outcomes.ts` (+ test) -- the hook: run the decision on maindata changes, toasts, 重試 through an injected resend.
- `src/features/path/set-location-op.ts` (+ test) -- record each ok hash with its target on success.
- `src/features/detail/overview.tsx` (+ DOM test) -- disable the four buttons while moving; summary from the lib.
- `src/routes/_authed.tsx` -- mount the hook with a resend built on `moveOp`.
- `scripts/fake-qbit.mjs`, `e2e/fixtures.ts` -- modes to hold a move (stays `moving` until released), to end a move without reaching the target (back to the old path), and to show a torrent in `moving` with no app-started move.
- `e2e/move-status.spec.ts` -- moving on list, board and detail; done toast; failed toast and 重試; a second browser context sees moving and no toast; reload keeps moving; screenshots to `_bmad-output/implementation-artifacts/screenshots/5-3/`.

**Acceptance Criteria:**
- Given a torrent with `movingTo` or state `moving`, when the list, board and detail render, then rows M1 to M3 hold, and no feature reads `torrent.state ===`.
- Given this tab moved a torrent, when the move finishes at the target, then exactly one toast 「已搬到 <name>」 shows and the location tag shows the new name (purple for a media library); when it ends elsewhere, then 「沒有搬到 <target>」 with 重試 shows and 重試 sends one setLocation with the same hash and target.
- Given another browser context, when a move started elsewhere is running and ends, then it shows moving and no toast.
- Given the screen was closed or the page reloaded during a move, when the detail opens, then moving and the target still show.
- Given the fake qBittorrent, when screenshots run, then desktop 1440 and phone 390, light and dark, exist for: list and board moving, the detail summary with the four disabled buttons, and the done toast.

## Spec Change Log

## Review Triage Log

### 2026-11-21: Review pass
- verdicts: 31 findings: high 0, medium 1, low 23, false 7, maybe-false 0
- findings:
  - `[false]` `[reject]` (intent) The pure function's vitest lacks the other-device case: that case is "no record", decided by the caller; the hook test (O5) and the e2e cover it.
  - `[false]` `[reject]` (intent) The record sits beside `pendingStore`, not in it: same module, the "record in pendingOps" the AC names; it must not share the 30 s lifetime.
  - `[low]` `[reject]` (intent) A reload counts as a new tab, so no toast after reload: logged Claude 代決; moving still shows from `movingTo`.
  - `[false]` `[reject]` (intent) Done is detected more broadly than `movingTo` disappearing: matrix row O3 (a move finished between polls).
  - `[false]` `[reject]` (intent) Failed needs the move to have been seen: superseded by the `from` rule below.
  - `[low]` `[reject]` (intent) Records are per hash for any batch: single moves only today; 5.5 owns batches.
  - `[low]` `[reject]` (intent) `movingTo` without `moving` is checked by vitest only: the fake turns `moving` at once; unit tests cover the lib.
  - `[false]` `[reject]` (intent) List and board screenshots come from a second move: they show the moving state the AC asks for.
  - `[medium]` `[patch]` (blind) A move that ends in a third folder, or the container's expiry, reads as failed and 重試 would move it back: the record keeps `from`; after the move: target is done, back at `from` failed, elsewhere dropped silently. Unit tests.
  - `[low]` `[patch]` (blind) The 10-minute bound is written twice: `MOVING_TO_EXPIRY_MS` in `src/shared/maindata.ts`, used by the table and the record.
  - `[low]` `[reject]` (blind) Seen records never expire: needs qBittorrent stuck in `moving`; a reload clears it.
  - `[low]` `[reject]` (blind) A batch would stack one toast per hash: 5.5.
  - `[low]` `[reject]` (blind) Pills stay enabled between the send and the refresh that carries `movingTo`: the screen closes and refreshes at once; the container refuses a second move.
  - `[low]` `[reject]` (blind) Focus drops to body when 改路徑 turns disabled: shortcuts work from body; a new focus target is extra surface.
  - `[low]` `[patch]` (blind) The plain-text test cannot fail: target with markup characters, found by text.
  - `[low]` `[reject]` (blind) The done toast for a path outside common paths is untested: the 5.1 resolver's fallback is tested there.
  - `[low]` `[reject]` (blind) The e2e leans on fixed waits: test speed only.
  - `[low]` `[reject]` (blind) Move records belong in another module: the AC names pendingOps.
  - `[false]` `[reject]` (blind) The failed toast shows the raw path: the AC writes 「沒有搬到 <目標路徑>」.
  - `[low]` `[reject]` (blind) `doneText`/`failedText` exported but unused by tests: cosmetic.
  - `[low]` `[reject]` (blind) Two comments run past the wrap width: cosmetic.
  - `[false]` `[reject]` (blind) Spec, screenshots and sprint-status are missing from the diff: they are committed with the story and in /ship.
  - `[low]` `[reject]` (edge) An unseen record whose `movingTo` went between polls drops silently: the container sets `movingTo` before answering and the refresh follows at once.
  - `[low]` `[patch]` (edge) Another client's move can make an unseen record fail: covered by the `from` rule (elsewhere drops silently).
  - `[low]` `[reject]` (edge) qBittorrent never turns moving, pills stay disabled up to 10 minutes: the container's expiry by design.
  - `[low]` `[patch]` (edge) `movingTo` hides an error or missing-files line: those kinds keep their line unless qBittorrent says `moving`; tests.
  - `[low]` `[reject]` (edge) The wall clock going back delays the record expiry: rare.
  - `[low]` `[reject]` (edge) A full answer with zero torrents drops every record: needs qBittorrent to answer empty mid-move.
  - `[low]` `[patch]` (edge) `toHaveCount(0)` retries, so a spurious toast can pass the no-toast checks: immediate counts every 250 ms.
  - `[low]` `[patch]` (edge) The hold window check retries the same way: same fix.
  - `[low]` `[reject]` (edge) A failure whose `movingTo` went between polls never toasts: same as the unseen row above.

## Design Notes

- The 5.2 pending entry (`MOVE_PENDING_OP`, 30 s) stays as the in-flight marker; the outcome needs a record that outlives it, so it is a separate map in the same module (the AC's "the record in `pendingOps`").
- Claude 代決: a torrent in `moving` with no `movingTo` (moved by another client) shows 「搬移中」 with no target part. The record is written on success per ok item, so a refused item never toasts. The failure toast's key is the move toast key from 5.2 (`move:<hash>`).
- Claude 代決 (review): the record keeps `from`, the normalized `save_path` when it was written. After the move: at the target is done, back at `from` failed, anywhere else the record goes with no toast (moved by someone else). Error and missing-files states keep their line when only `movingTo` is set. A reload starts a new record set, so the reloaded tab shows moving and no toast.
- Claude 代決: the done toast uses `toast.plain` (4 s); 5.8 upgrades it to an action toast with 「接著改檔名」.

## Verification

**Commands:**
- `source ~/.nvm/nvm.sh && nvm use && npm run lint` -- expected: 0 errors
- `source ~/.nvm/nvm.sh && nvm use && npm run typecheck` -- expected: exit 0
- `source ~/.nvm/nvm.sh && nvm use && npm test` -- expected: all pass
- `source ~/.nvm/nvm.sh && nvm use && npm run build && npx playwright test e2e/move-status.spec.ts e2e/change-path.spec.ts e2e/detail.spec.ts e2e/board.spec.ts e2e/list.spec.ts` -- expected: all pass (use the spec files that exist)
- `bash .claude/skills/next-story/check.sh` -- expected: every line ok

## Auto Run Result

Status: done (one review pass). Follow-up review not recommended: one medium entry patched (the `from` rule), no high. Patched by verdict: medium 1 entry, low 5 entries.

**Change.** `isMovingTorrent` counts the container's `movingTo` as well as qBittorrent's `moving` (a state-only `isQbitMoving` serves the container's sync rules). Rows and cards say 「搬移中」 in their own column; the detail summary starts `搬移中 · 正在搬到 <target>` and all four save-path buttons are disabled. A per-tab move record in `src/state/pending-ops.ts` (target, from, start, seen), written on setLocation success and untouched by the 30 s timer or a pause, feeds the pure `src/lib/move-outcome.ts`; `src/state/move-outcomes.ts`, mounted in `_authed.tsx`, shows 「已搬到 <name>」 or 「沒有搬到 <target>」 with 重試. The fake qBittorrent gained `move=hold|fail` and a control for another client's move.

**Review.** 31 findings: 6 entries patched, 0 deferred, the rest rejected with reasons in the triage log.

**Verification (2026-11-21, after the patches).**
- `npm run lint`: 0 errors; `npm run typecheck`: exit 0.
- `npm test`: 164 files, 3996 tests pass.
- `npx playwright test` move-status, change-path, detail, board, selection: 59 passed.
- `check.sh`: every line ok. Matrix rows M1 to M3 and O1 to O7 each have a tagged test that ran.

**Residual risks.** If real qBittorrent leaves `moving` one poll before it updates `save_path`, the tab could report a false 「沒有搬到」; only the NAS check settles it. 5.2's deferred queued-move item is unchanged.
