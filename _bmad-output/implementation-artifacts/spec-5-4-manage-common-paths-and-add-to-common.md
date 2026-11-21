---
title: 'Story 5.4: Manage common paths and 「☆ 加到常用」'
type: 'feature'
created: '2026-11-21'
status: 'done'
review_loop_iteration: 0
followup_review_recommended: false
baseline_revision: '37f4f4881294a448b1fae578d877ae8c13b1d832'
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-5-context.md'
  - '{project-root}/_bmad-output/implementation-artifacts/spec-5-2-change-one-torrent-path.md'
warnings: ['oversized']
deferred: []
---

<intent-contract>

## Intent

**Problem:** Common paths can only be added (5.2). Alex cannot rename one, tick or untick 「媒體庫」, or remove one he no longer uses, and the detail's 「☆ 加到常用」 is still disabled, so keeping the list in step with his folders needs a settings screen that the design rules out.

**Approach:** Add the idempotent `updateCommonPath` and `removeCommonPath` server functions beside 5.2's `addCommonPath`. Give the change-path screen an edit mode (rename inline, media-library checkbox, ✕ remove) and inline rename right after 「加到常用」. Wire the detail's 「☆ 加到常用」 to `addCommonPath` with a 「改名」 toast action that opens change path in edit mode focused on that row.

## Boundaries & Constraints

**Always:**
- Both functions through `_define.ts` (`serverPost`, `input`, `guard`, default body limit), idempotent, answering `not_logged_in` without a session, listed in `discover.test.ts`. They find the entry by normalized `path` (first match), write through `getSettingsStore().update` (lock queue, atomic write) and return `ok(written.settings)` or `settings_write_failed`.
  - `updateCommonPath` input `{ path, name?, mediaLibrary? }` with at least one of `name` or `mediaLibrary`; `name` trimmed, then `commonPathNameSchema` (1 to 50), else `invalid_input`. A path not in the list changes nothing and succeeds (another device removed it).
  - `removeCommonPath` input `{ path }`; removes the entry; a missing path succeeds. It never touches files or qBittorrent.
  - Two devices changing different paths concurrently both survive (the store's `update` reads the current file inside its lock).
- Frontend ops in `src/state/settings.ts` beside `addCommonPathOp`: `updateCommonPathOp`, `removeCommonPathOp`, all in `SETTINGS_WRITE_SCOPE`, `onSuccess: applySettings`, keys `settings:common-path:<path>`, failure toast with 重試 per Story 3.1 (`SETTINGS_WRITE_FAILURE_CODES`, text from `src/lib/error-text.ts`).
- Edit mode in the change-path screen (DESIGN change-path edit mode, mockup S08-path-edit-desktop):
  - A 28 px outline pill 「編輯」 right of the 「常用路徑」 header; pressed, it reads 「完成」 (weight 700) and returns to normal mode. Phone: rows 56 px, the pill and the name input 44 px with 16 px text.
  - In edit mode rows have no radio; the name has a dotted underline; the right side has a 20 px 「媒體庫」 checkbox and a 32 px ✕ with tooltip 「從常用拿掉（不動檔案）」; the 「加到常用」 row is hidden; picking a row does not fill the box.
  - Clicking a name turns it into an input (36 px, 44 px on phone). Enter or blur saves through `updateCommonPath` when the trimmed name changed and is valid; an invalid name shows the shared `delete` border and is not sent. `Esc` cancels that rename only and does not close the screen.
  - Ticking 「媒體庫」 saves at once; the location tags follow from `['settings']`.
  - ✕ removes the entry at once with no confirmation; if it was the selected row, the 「會搬到」 box keeps its path and no row is selected.
  - While a row's request is in flight its controls are disabled; a failure keeps the typed name in the input.
- After a successful 「加到常用」 in normal mode, the new row's name opens as an input with its text selected; leaving it unchanged keeps the last-two-segments name.
- Detail 「☆ 加到常用」 (`src/features/detail/overview.tsx` `SavePathBlock`): enabled; sends `addCommonPath` (5.2's, no new function) with the current normalized `save_path`, name from `locationLabel`, `mediaLibrary: false`, no prompt. Success: action toast 「已加到常用：<name>」 with 「改名」, which opens change path for this torrent in edit mode with that row's name input focused. Disabled with tooltip 「已經在常用路徑裡」 when the path is already listed (normalized), while its request is in flight, and (5.3 rule kept) while the torrent is moving. Full list or failed write: as 5.2 (toast texts from `error-text.ts`).
- `src/state/change-path-open.ts` carries the edit request (e.g. `{ hashes, editPath? }`) so the screen opens in edit mode focused on that row; plain opens stay as they are.
- 5.2, 5.3 and PR #59 conventions stay: `moveVariables(client, hashes, location)` for moves, `isMovingTorrent` for display, `changePathView` takes `moving`, no `MOVE_PENDING_OP`.
- Fake data only (AD-15). Fixture names are fictional; private categories only as X or mteam-X.

**Never:**
- No change to the move flow, the moving display, selection-bar moves (5.5) or rename (5.6 to 5.8).
- No settings screen for common paths, no confirmation on remove, no file operations.
- No new error codes, no new dependencies; `src/state` never imports `src/shared/ui` or server functions; no `startsWith` path checks in features.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| P1 rename | `updateCommonPath({ path: '/data/media/tv/', name: '  影集  ' })` | entry `/data/media/tv` named 「影集」, settings returned | none |
| P2 bad name | name blank or 51 characters | `invalid_input`, nothing written | none |
| P3 tick | `{ path, mediaLibrary: true }` | that entry's flag set, name unchanged | none |
| P4 missing | update or remove a path not listed | success, settings unchanged | none |
| P5 concurrent | two calls at once on different paths | both changes in the file | none |
| P6 remove | `removeCommonPath({ path })` | entry gone, files untouched | none |
| E1 edit mode | press 「編輯」 | 「完成」, no radios, dotted names, checkbox and ✕ per row, 「加到常用」 hidden | none |
| E2 rename | click name, type, Enter or blur | one `updateCommonPath`; `Esc` instead restores the name and keeps the screen open | failure toast with 重試, input keeps the text |
| E3 remove selected | ✕ on the selected row | entry gone, box keeps its path, no row selected | failure toast with 重試 |
| E4 in flight | a row's request pending | that row's input, checkbox and ✕ disabled | none |
| A1 inline after add | 「加到常用」 succeeds | new row's name is an input with text selected | none |
| D1 detail add | ☆ on `/data/media/anime` not listed | `addCommonPath` with name 「media/anime」, toast 「已加到常用：media/anime」 with 「改名」 | 5.2 failure texts |
| D2 改名 | press 「改名」 | change path opens for this torrent in edit mode, that row's name input focused | none |
| D3 listed | current path already listed | ☆ disabled, tooltip 「已經在常用路徑裡」 | none |

</intent-contract>

## Code Map

- `src/server/functions/add-common-path.ts` -- 5.2 model (store `update`, normalized identity, `ok(written.settings)`); `src/server/functions/settings.test.ts` and `add-common-path.test.ts` -- temp `CONFIG_DIR` and concurrency test models.
- `src/server/functions/discover.test.ts` -- list of discovered functions.
- `src/shared/settings.ts` -- `commonPathNameSchema`, `addCommonPathInputSchema`; put the two new input schemas beside it. `src/shared/save-path.ts` `savePathSchema`, `normalizeSavePath`.
- `src/server/settings/store.ts` -- `update(change)` (full stored settings, lock, skips unchanged writes, returns `served`).
- `src/state/settings.ts` -- `SETTINGS_KEY`, `applySettings`, `SETTINGS_WRITE_SCOPE`, `addCommonPathOp` (L254) as the model.
- `src/lib/error-text.ts` -- `addCommonPathFailureText`, settings-write texts (3.1).
- `src/features/path/change-path-screen.tsx` -- radio rows (`PathRadios`), 「加到常用」 row, `editBox`, `useEscapeLayer(open && desktop, cancel, 'dialog')` (L148), `addPathOp` prop; `change-path-model.ts` `changePathView` (takes `moving`); `src/state/use-arrow-stepping.ts`.
- `src/state/change-path-open.ts` -- `openChangePath(hashes)`, `useChangePathOpen`.
- `src/routes/_authed.tsx` -- builds `addPathOp` and `moveOp`, renders `ChangePathScreen`; build the new ops here and pass them in.
- `src/features/detail/overview.tsx` -- `SavePathBlock` (☆ disabled today; moving disables all four buttons); `src/lib/paths.ts` `locationLabel`, `listedCommonPath`; `src/state/locations.ts`.
- `src/lib/toast.ts` -- `toast.action(text, { label, run })` (8 s), `toast.failure`.
- `src/shared/ui/checkbox.tsx` -- 20 px checkbox; `src/shared/ui/input.tsx` capsule input.
- `scripts/fake-settings-seeds.mjs`, `e2e/fixtures.ts` `seedSettings`, `e2e/change-path.spec.ts` -- seeds and screenshot pattern (`_bmad-output/implementation-artifacts/screenshots/<id>/`).

## Tasks & Acceptance

**Execution:**
- `src/shared/settings.ts` -- `updateCommonPathInputSchema`, `removeCommonPathInputSchema`.
- `src/server/functions/update-common-path.ts`, `remove-common-path.ts` (+ tests, `discover.test.ts`) -- rows P1 to P6.
- `src/state/settings.ts` (+ test) -- the two ops.
- `src/lib/error-text.ts` (+ test) -- any texts the new ops need.
- `src/state/change-path-open.ts` (+ test) -- the edit request.
- `src/features/path/*` (+ DOM tests) -- edit mode, inline rename (including right after 「加到常用」), checkbox, ✕, per-row locks (E1 to E4, A1, D2's opening).
- `src/features/detail/overview.tsx` (+ DOM test) -- ☆ wiring, toast with 「改名」, disabled rules (D1, D3).
- `src/routes/_authed.tsx` -- build and pass the ops.
- `e2e/common-paths.spec.ts` -- edit mode, rename, tick, remove, add then inline rename, detail ☆ and 「改名」; screenshots to `_bmad-output/implementation-artifacts/screenshots/5-4/`.

**Acceptance Criteria:**
- Given the change-path screen, when 「編輯」 is pressed, then edit mode matches E1 on desktop and phone sizes, and 「完成」 returns to normal mode with radios back.
- Given edit mode, when a name is renamed, 「媒體庫」 ticked or ✕ pressed, then rows E2 to E4 hold, and the list and location tags follow the returned settings.
- Given 「加到常用」 succeeded, when the new row appears, then its name is an input with the text selected (A1).
- Given the detail, when ☆ is pressed for an unlisted path, then D1 and D2 hold; when the path is listed, D3 holds.
- Given the fake settings, when screenshots run, then desktop 1440 and phone 390, light and dark, exist for: edit mode, renaming, inline rename after 加到常用, the 「已加到常用」 toast, and ☆ disabled.

## Spec Change Log

## Review Triage Log

### 2026-11-21: Review pass
- verdicts: 33 findings: high 0, medium 1, low 27, false 5, maybe-false 0
- findings:
  - `[false]` `[reject]` (intent) The two-device check runs as concurrent store writes: two devices are two requests to the same container, which is exactly what the store's lock serializes.
  - `[low]` `[reject]` (intent) The tag colour is tested through its text: the colour class and the hidden note come from the same prop, tested in 5.1.
  - `[low]` `[reject]` (intent) Phone rows asserted as at least 56 px and the pill at 13 px: DESIGN gives 16 px to the input; the mockup draws the pill at 13 px.
  - `[low]` `[reject]` (intent) Esc in the phone rename is checked only in the DOM test: covered there; the sheet path is unchanged.
  - `[false]` `[reject]` (intent) The rename state after 改名 is not screenshotted: the renaming shots show the same input state.
  - `[low]` `[patch]` (intent) The new row is not a radio while renaming: fixed with the tab-stop row below.
  - `[false]` `[reject]` (intent) location-tags e2e may not have run: it runs in verification.
  - `[false]` `[reject]` (intent) Extra behaviour beyond the AC: each item is a logged Claude 代決 or a validity guard.
  - `[medium]` `[patch]` (blind) A failed rename leaves focus nowhere, so the next Esc closes the screen and drops the typed name: focus returns to the input (or ✕) after a failed write; DOM tests.
  - `[low]` `[patch]` (blind) Common-path failure toasts survive closing and reopening: dismissed on open, cancel and when the torrent goes, like `move:<hash>`.
  - `[low]` `[patch]` (blind) 完成 leaves an invalid rename open, with no way to cancel on phone: toggling the mode closes the rename.
  - `[low]` `[patch]` (blind) Edit mode with no common paths shows nothing: 編輯 disabled on an empty list; edit mode ends when the last row goes.
  - `[low]` `[patch]` (blind) ☆ is enabled before settings load: disabled until the list is known.
  - `[low]` `[reject]` (blind) An invalid name shows only the red border: the spec asks for the `delete` border only.
  - `[low]` `[patch]` (blind) Tab cannot reach the radios while the selected row is renaming: the tab stop falls back to the first radio row.
  - `[low]` `[reject]` (blind) Duplicate names are allowed: names are labels, no spec rule makes them unique.
  - `[low]` `[reject]` (blind) The detail builds its own op instead of receiving it: features may import server functions; the DOM test mocks it.
  - `[low]` `[reject]` (blind) E2E gaps (tick has no opCalls check, no reload): DOM and server tests cover the write.
  - `[low]` `[reject]` (blind) Constant placement and comment wrap nits: cosmetic.
  - `[false]` `[reject]` (blind) Duplicate normalized entries render two inputs: the store's `repair()` dedupes on read.
  - `[low]` `[patch]` (verification) The toast's stored name is untested: test answering the same path stored as 「動畫」.
  - `[low]` `[patch]` (verification) Focus after ✕ is untested: E3 asserts the 完成 pill; the assertion caught the fallback never firing, now fixed.
  - `[low]` `[reject]` (verification) The reopen-during-add guard is untested: needs a close and reopen within one round trip.
  - `[low]` `[patch]` (verification) Tab cannot reach the radios: same fix as the blind row.
  - `[low]` `[patch]` (edge) No tab stop while the selected row is renaming: same fix.
  - `[low]` `[patch]` (edge) 完成 with an invalid rename keeps the input: same fix as the blind row.
  - `[low]` `[reject]` (edge) Clicking ✕ or the checkbox during an open rename on that row drops the press: the user presses again; queuing adds state.
  - `[low]` `[patch]` (edge) ☆ enabled for a listed path before settings load: same fix as the blind row.
  - `[low]` `[patch]` (edge) Index keys remount an open rename when a row above goes: rows keyed by normalized path.
  - `[low]` `[patch]` (edge) A failed write's 重試 after reopening closes the new rename: same fix as the toast row.
  - `[low]` `[patch]` (edge) Empty edit mode: same fix as the blind row.
  - `[low]` `[patch]` (edge) After 完成 one row stays an input: same fix as the blind row.
  - `[low]` `[patch]` (edge) ☆ pressable before settings load: same fix as the blind row.

## Design Notes

- Claude 代決: updating a path that is not listed succeeds unchanged, like removing one (another device may have removed it; the answer carries the current list). Blur saves like Enter. An unchanged name sends nothing. In edit mode a row click does not fill the box (the radios are gone).
- Claude 代決 (implementation): the ✕ icon follows the spec, not the mockup's trash can. The phone 編輯 pill text is 13 px like the mockup; the rename input is 16 px. Every rename opens with the name selected. Focus goes back to the row's name after Enter or Esc, and to the 完成 pill after ✕. Failure toasts read 「名稱沒改到：…」, 「媒體庫沒改到：…」 and 「沒從常用拿掉：…」. `addCommonPathInput` moved to `src/lib/paths.ts` so the detail can use it; `ConfirmShell` gained `initialFocus` and leaves `data-own-escape` elements their own Esc. A rename whose input loses focus to 取消 or ✕ saves first (blur saves).
- Claude 代決: the ☆ tooltip on a disabled button uses a wrapper with `title`, since a disabled button gets no hover events.

## Verification

**Commands:**
- `source ~/.nvm/nvm.sh && nvm use && npm run lint` -- expected: 0 errors
- `source ~/.nvm/nvm.sh && nvm use && npm run typecheck` -- expected: exit 0
- `source ~/.nvm/nvm.sh && nvm use && npm test` -- expected: all pass
- `source ~/.nvm/nvm.sh && nvm use && npm run build && npx playwright test e2e/common-paths.spec.ts e2e/change-path.spec.ts e2e/move-status.spec.ts e2e/detail.spec.ts e2e/location-tags.spec.ts` -- expected: all pass
- `bash .claude/skills/next-story/check.sh` -- expected: every line ok

## Auto Run Result

Status: done (one review pass). Follow-up review not recommended: one medium entry patched (focus after a failed rename), no high. Patched by verdict: medium 1 entry, low 8 entries.

**Change.** `updateCommonPath` and `removeCommonPath` (idempotent, normalized path as identity, store lock) with their ops in `src/state/settings.ts`. The change-path screen has an edit mode (編輯/完成, rename inline, 媒體庫 checkbox, ✕ remove, per-row locks) and opens the new row's name for renaming after 「加到常用」. The detail's 「☆ 加到常用」 uses 5.2's `addCommonPath` and shows 「已加到常用：<name>」 with 「改名」, which opens change path in edit mode on that row.

**Review.** 33 findings: 9 entries patched, 0 deferred, the rest rejected with reasons in the triage log. The new E3 focus assertion caught a real bug (the focus fallback after ✕ never fired in Chromium), fixed in the same round.

**Verification (2026-11-21, after the patches).**
- `npm run lint`: 0 errors; `npm run typecheck`: exit 0.
- `npm test`: 165 files, 4092 tests pass.
- `npx playwright test` common-paths, change-path, move-status, detail, location-tags: 47 passed (a run during the patches showed 5 move-status failures because `.output` was rebuilt mid-run; the clean rerun passed).
- `check.sh`: every line ok. Matrix rows P1 to P6, E1 to E4, A1, D1 to D3 each have a tagged test that ran.

**Residual risks.** A failed settings write is covered by DOM and unit tests only (the fake cannot fail the settings file).
