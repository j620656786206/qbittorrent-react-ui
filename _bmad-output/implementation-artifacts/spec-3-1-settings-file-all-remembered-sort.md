---
title: 'Story 3.1: Settings file and the remembered sort of 全部'
type: 'feature'
created: '2026-11-18'
status: 'done'
baseline_revision: '00bfa386f06614b0f8bfdb5882ee6faae9917d69'
review_loop_iteration: 0
followup_review_recommended: false
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-3-context.md'
  - '{project-root}/_bmad-output/planning-artifacts/architecture/architecture-react-torrent-2026-11-15/ARCHITECTURE-SPINE.md'
warnings: ['oversized']
deferred: []
---

<intent-contract>

## Intent

**Problem:** The sort Alex picks lives only in the URL, so a new tab, the phone or a reload falls back to 「狀態」; Epic 3 needs one shared settings file on the NAS (AD-8) that later stories (category tabs, settings page, common paths) build on.

**Approach:** Fix the settings schema and the shared path schema in `src/shared`, add a container settings store (`src/server/settings`: read, repair, migrate, locked atomic writes), two factory server functions (`getSettings`, `setCategorySort`), a `['settings']` query in `src/state`, and wire 「全部」: a manual sort pick also saves it, a URL without `sort` uses the remembered one, another device's change applies on focus, and the first load waits for settings too.

## Boundaries & Constraints

**Always:**
- Schemas exactly as Story 3.1 and AD-8 state: `src/shared/settings.ts` `{ version: 1, categorySort: {}, categoryOrder: [], commonPaths: [] }`; `categorySort` key to `{ sort, dir }` with `sort` one of the 51 ids in `src/shared/sort-fields.ts` and `dir` `asc`/`desc`; `categoryOrder` names without `ALL`; `commonPaths` `{ path, name (1 to 50 chars), mediaLibrary: boolean }`, at most 50. `src/shared/categories.ts`: `ALL = '__all__'`, uncategorized is `''`. Category keys in `setCategorySort`: `ALL`, `''` or a name of 1 to 255 characters without control characters (Claude 代決: qBittorrent category names have no documented cap; 255 keeps the 256 KB file bound meaningful).
- Shared path schema in `src/shared` (AR-29): absolute, normalized first (repeated and trailing slashes removed, root stays `/`), no NUL, backslash or control characters, no `..` segment, at most 1024 characters. The container additionally requires the normalized path under one of `SAVE_ROOTS` on a folder boundary (`/data` accepts `/data` and `/data/x`, not `/database`), in a `src/server` function reusing the env's parsed roots.
- Store in `src/server/settings` (one module owns the file; `migrations.ts` with `version: 1` empty):
  - file `${CONFIG_DIR}/settings.json`, mode 600 on create and after every write;
  - missing file: write defaults; missing section: fill its default, keep the others; one invalid entry inside a section is dropped and logged, not treated as corruption;
  - unparseable JSON or not an object: rename the old file to `settings.json.broken-<UTC timestamp>` (Claude 代決 name), write defaults, log without content;
  - `version` newer than the code knows: leave the file untouched, serve defaults, every write returns `settings_write_failed`, log once per start;
  - writes run on one in-process lock queue, each read-modify-write inside it, written to a temp file in the same folder then `rename`d; 20 concurrent `setCategorySort` calls all survive;
  - a serialized file over 256 KB (262,144 bytes) is refused with `settings_write_failed`; any write failure logs per AR-36 (no content, no path beyond the file name).
- Server functions only from `_define.ts`: `getSettings` is `serverGet`, no input, no side effects beyond the store's documented first-read repair; `setCategorySort` is `serverPost` with `z.strictObject({ category, sort, dir })`, idempotent, returns the whole new settings. Both return `not_logged_in` without a session (the discover test's automatic list covers them).
- Client: `['settings']` owned by `src/state` (bound in `src/router.tsx` like maindata, since `src/state` may not import server functions); `refetchOnWindowFocus`, no polling; a successful `setCategorySort` writes its answer into `['settings']` (no optimistic update, AD-7).
- First load: list and board keep their skeleton until both `['maindata']` and `['settings']` have answered. A failed settings read counts as answered with defaults so the screen never sticks on the skeleton (Claude 代決); the next focus retries.
- 「全部」 (the only category this story): the view is URL `sort`/`dir` when the URL has `sort`; otherwise the remembered `categorySort[ALL]`; otherwise 「狀態」 (replaces Epic 2's hard-coded default; `fixListSearch` and `sortViewOf` follow).
- A manual pick (desktop sort menu, phone sort sheet, tapping the selected item to flip) updates the URL as in Epic 2 and calls `setCategorySort(ALL, sort, dir)` through `sendOp` (`src/state/tracked-op.ts`). Nothing else writes the remembered sort.
- Another device: when a settings answer changes the remembered `categorySort[ALL]` compared with the previous answer, and that value differs from the sort on screen, the screen switches to it (URL `replace`) and the list or board scrolls to the top. React only to a change in the remembered value, never to a mismatch alone, so an in-flight or failed write never reverts Alex's pick.
- Failure: `settings_write_failed`, `timeout`, `invalid_input` show the failure-with-retry toast with text from `src/lib/error-text.ts` (Claude 代決 wording 「排序沒記住：<code text>」); 重試 sends the same call; the screen keeps Alex's pick; connection codes stay with the global handler. Extend `sendOp` so an op can name its own failure codes rather than widening `OPERATION_FAILURE_CODES` for pause and files.

**Never:**
- No category tabs, settings page, `setCategoryOrder`, common path functions or 「（這個分類記住的）」 hint (later stories); no localStorage for any of this; no writes from tests to `./config` (temporary folders only) or to a real qBittorrent.
- No new dependency; no `/api/v2` pass-through; no settings data in maindata.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| First start | no settings.json | defaults written, mode 600 | No error expected |
| Missing section | file lacks `commonPaths` | filled with `[]`, others kept | No error expected |
| Broken JSON | `{not json` | old file renamed `settings.json.broken-<ts>`, defaults written, log line without content | No error expected |
| Newer version | `version: 2` | file untouched, defaults served, `setCategorySort` returns `settings_write_failed` | Logged once |
| Invalid entry | `categorySort.x.sort = 'nope'` | entry dropped and logged, the rest kept | No error expected |
| Concurrent | 20 `setCategorySort` at once | all 20 keys present after | No error expected |
| Too big | serialized file over 262,144 bytes | refused, file unchanged | `settings_write_failed` |
| Bad input | `sort: 'nope'`, unknown key, category with a control char | rejected | `invalid_input` |
| No session | either function | rejected | `not_logged_in` |
| Path schema | `..` segment, trailing or double slash, control char, 1024 vs 1025 chars, `/database` under root `/data` | reject, normalize, reject, accept/reject, reject outside roots | zod errors / container check |
| URL without sort | remembered `seeding_time desc` | list sorted by 做種時間 desc | No error expected |
| URL with sort | `?sort=ratio`, remembered other | ratio wins | No error expected |
| Manual pick | pick 分享率 | URL changes, `setCategorySort(ALL, ratio, desc)` sent once | No error expected |
| Other device | focus refetch brings a new remembered sort | screen switches, scrolled to top | No error expected |
| Write in flight | focus refetch returns the old settings | screen keeps Alex's pick | No error expected |
| Write fails | `settings_write_failed` | toast 「排序沒記住：設定檔寫不進去」 with 重試; screen keeps the pick | Toast |
| Settings slow | maindata arrives first | skeleton stays until settings answers | No error expected |
| Settings read fails | `getSettings` errors | defaults used, data shows | Global handler for connection codes |

</intent-contract>

## Code Map

- `src/shared/sort-fields.ts` -- the 51 ids (`SortFieldId`), `sortField(id).directional`; reuse for the schema.
- `src/shared/list-search.ts` -- `DEFAULT_SORT_VIEW`, `listSearchSchema`, `sortViewOf`, `fixListSearch` (lines 17 to 90): today a missing `sort` means 「狀態」; make the fallback come from the remembered sort.
- `src/routes/_authed.tsx` -- reads the search, builds `view`, `setView` (navigate `replace`, `resetScroll: false`); the place to merge the remembered sort into `view` and to apply another device's change.
- `src/state/list-view.ts` -- `ListViewContext` (`view`, `setView`); a manual pick must be distinguishable from an app-driven change (for example a separate `pickSort` or a `manual` flag).
- `src/features/header/` -- desktop sort menu and phone `sort-sheet.tsx` call `setView`; they become manual picks.
- `src/features/list/torrent-list.tsx` (`listView`, `ListSkeleton`), `src/features/board/torrent-board.tsx` and `status-tabs.tsx` (skeletons) -- add the settings-ready condition; scrolling to top on another device's change follows Epic 2's "sort change scrolls to top".
- `src/state/query-client.ts` (`createQueryClient({ fetchMaindata, fetchErrorReasons })`) and `src/router.tsx` -- add `fetchSettings` the same way; `src/state/error-reasons.ts` is the newest example of a bound query.
- `src/state/tracked-op.ts` -- `sendOp` and the failure toast; `src/lib/error-text.ts:29` `OPERATION_FAILURE_CODES`; `settings_write_failed` text already exists (`error-text.test.ts:27`).
- `src/server/functions/_define.ts`, `get-torrent-detail.ts`, `start-torrents.ts` -- factory, GET and POST patterns; `discover.test.ts` enumerates functions for the `not_logged_in` check.
- `src/server/env/index.ts` -- `configDir` (`DEFAULT_CONFIG_DIR` `/config`) and parsed `SAVE_ROOTS`; `src/server/log` for AR-36 lines; `src/shared/errors.ts` for `settings_write_failed`.
- `scripts/fake-qbit.mjs` -- starts the built app with a temporary `CONFIG_DIR` (removed on exit); e2e relies on it.
- `e2e/fixtures.ts` -- `login`, `setModes`, CSP and console watch.

## Tasks & Acceptance

**Execution:**
- `src/shared/settings.ts`, `src/shared/categories.ts`, shared path schema (e.g. `src/shared/save-path.ts`) + tests -- every field valid and invalid, 50 vs 51 paths, names 50 vs 51 characters, path matrix rows.
- `src/server/settings/` (store, `migrations.ts`, roots check) + tests in temporary folders -- matrix rows 1 to 7.
- `src/server/functions/get-settings.ts`, `set-category-sort.ts` + tests -- input validation, idempotency, `not_logged_in`, `settings_write_failed` on newer version.
- `src/state/settings.ts` + test, `src/state/query-client.ts`, `src/router.tsx` -- the query, focus refetch, settings-ready for the skeleton.
- `src/state/tracked-op.ts`, `src/lib/error-text.ts` + tests -- per-op failure codes, the sort-save failure text.
- `src/shared/list-search.ts`, `src/routes/_authed.tsx`, `src/state/list-view.ts`, header sort menu and sheet -- remembered fallback, manual pick saves, another device's change applies; DOM tests for each matrix row in the client half.
- list and board skeleton condition + DOM tests.
- `e2e/settings-sort.spec.ts` -- pick a sort, reload with a bare URL: the pick returns; a second page refocuses after the first changes the sort: it switches and is at the top; zero CSP violations.

**Acceptance Criteria:**
- Given a manual sort pick in 「全部」, when the page is reloaded without `sort` or opened on another device, then the picked sort shows.
- Given another device changed 「全部」's sort, when this tab regains focus, then it switches to the new sort with the list at the top, unless this tab's own write is still pending or failed.
- Given the first load, when maindata arrives before settings, then the skeleton stays until settings answers (or fails).
- Given a failed save, when the code is `settings_write_failed`, `timeout` or `invalid_input`, then the failure toast with 重試 shows and the screen keeps the pick.
- Given lint, typecheck, vitest, build, Playwright, `npm run audit:prod` and `check.sh`, when run, then all pass.

## Spec Change Log
- 2026-11-18, first review pass: two rules of the intent contract were tightened in code. (1) "React only to a change in the remembered value" now also goes through the follow path (URL replace, scroll to top) whenever that change alters the sort on screen with a bare URL, including a first read that failed and a remembered value going back to null; the first load is not a change. (2) Common paths outside `SAVE_ROOTS` are filtered from what is served, never dropped from the file. Saves of one category run serially (mutation scope) and an older answer never lands over a newer one. KEEP: the URL is the sort on screen; a manual pick is the only writer; no optimistic update.

## Review Triage Log

### 2026-11-18: Review pass
- verdicts: 36 findings, high 0, medium 12, low 17, false 7, maybe-false 0
- findings:
  - `[low]` `[patch]` (blind) A settings `timeout` would blame qBittorrent : the sort-save text has its own wording for `timeout`; the code stays (the AC lists it).
  - `[medium]` `[patch]` (blind) A wrong `SAVE_ROOTS` erases common paths for good on the next GET : out-of-root entries are filtered from the answer only, never written back as a repair.
  - `[medium]` `[patch]` (blind) Two quick picks can leave the file and the screen on different sorts : saves of one category run serially (mutation scope) and an older answer never lands over a newer one; test with reversed answers.
  - `[medium]` `[patch]` (blind) First read fails, a later read succeeds: the screen changes with no scroll reset : any answer that changes the sort on screen goes through the follow path (URL replace, scroll to top).
  - `[low]` `[patch]` (blind) A `.` path segment is kept, so one folder can be two common paths : `.` segments are dropped while normalizing.
  - `[medium]` `[patch]` (blind) Writes are atomic but not durable : the temp file is synced before the rename, and the folder after it where allowed.
  - `[low]` `[patch]` (blind) The broken copy keeps its old permissions; copies pile up : the copy is chmodded to 600; cleanup of old copies rejected (rare, Alex can delete them).
  - `[low]` `[patch]` (blind) An unreadable file logs on every read; `version: null` reads as 1 : logged once per start; null treated like missing and repaired.
  - `[low]` `[patch]` (blind) The e2e covers only desktop : phone test added (phone sort sheet pick survives a reload; the other-device page is phone-sized).
  - `[low]` `[patch]` (blind) `saveAnswered` matches any server function POST : it matches the `setCategorySort` call only.
  - `[low]` `[patch]` (blind) A test comment names a file that does not exist : points at the `isUnderSaveRoot` block in `store.test.ts`.
  - `[low]` `[reject]` (blind) `categorySort` keys are never pruned; the cap counts UTF-16 units; bidi characters pass : the 256 KB refusal bounds the file; pruning needs the category list (Story 3.2) and names render as plain text.
  - `[low]` `[reject]` (blind) The fake reset answers a misleading 400 : test tooling only; the fixture fails loudly either way.
  - `[low]` `[patch]` (intent) Saving from the phone sort sheet is not tested end to end : same as the blind e2e entry; fixed there.
  - `[low]` `[patch]` (intent) The phone following another device is tested only at desktop width : same as the blind e2e entry; fixed there.
  - `[false]` `[reject]` (intent) The URL gains `sort` after following another device : that is the documented follow path (URL replace); a bare URL on load stays bare.
  - `[false]` `[reject]` (intent) `getSettings` writes on first read : the AC itself asks a read to create, fill and rename; documented as the store's first-read repair.
  - `[false]` `[reject]` (intent) The `SAVE_ROOTS` check runs only in the store : no function in this story takes a path; Epic 5 calls it on write.
  - `[false]` `[reject]` (intent) The 1024 cap applies after normalizing : the AC says to normalize first.
  - `[low]` `[reject]` (intent) No e2e for the first-load skeleton : the route DOM test covers it with the real layout.
  - `[low]` `[reject]` (intent) Only `settings_write_failed` is tested through the layout : the other codes are tested at the op and text level with the same op.
  - `[false]` `[reject]` (intent) The settings reset fixture runs for every e2e test : intended; without it a pick leaks into later tests.
  - `[false]` `[reject]` (intent) `categoryOrder` accepts `''` : `''` is the uncategorized key per AD-8, a category like any other.
  - `[medium]` `[patch]` (edge) An older save's late answer is written over a newer pick : same root cause as the blind quick-picks entry; fixed there.
  - `[medium]` `[patch]` (edge) The saving check runs after the mutation already settled : same root cause; fixed there.
  - `[medium]` `[patch]` (edge) First read fails then succeeds: the board becomes the list mid-session : same root cause as the blind silent-change entry; fixed there.
  - `[medium]` `[patch]` (edge) The remembered value becomes null and the screen turns into the board silently : same root cause; fixed there.
  - `[low]` `[patch]` (edge) `version: null` is accepted but never repaired : same as the blind entry; fixed there.
  - `[medium]` `[patch]` (edge) Power loss after the rename leaves a truncated file : same as the durability entry; fixed there.
  - `[low]` `[patch]` (edge) `.` segments : same as the blind entry; fixed there.
  - `[false]` `[reject]` (edge, claim) A failed own write is later replaced by another device's change : following the other device then is the intended behavior.
  - `[medium]` `[patch]` (edge, claim) A rapid second pick can be undone with no other device : same root cause as the quick-picks entry; fixed there.
  - `[medium]` `[patch]` (verification-gap) The in-flight guard has no hook-level test : route test added with a pending save and a changed focus answer.
  - `[low]` `[patch]` (verification-gap) "No viewed row before settings" is untested with a panel : `withPanel` case added.
  - `[medium]` `[patch]` (verification-gap) The unreadable-file path has no test : store test added (defaults served, bytes kept, update refused, one log line).
  - `[low]` `[patch]` (verification-gap, other) Comment names a missing test file : same as the blind entry; fixed there.

### 2026-11-18: Review pass (follow-up)
- verdicts: 29 findings, high 0, medium 0, low 20, false 9, maybe-false 0
- findings:
  - `[false]` `[reject]` (intent) Follow choices: hold still while saving, write `?sort=` for a bare URL, fall back to 「狀態」 when the value goes : first-pass decisions recorded in the Spec Change Log.
  - `[false]` `[reject]` (intent) Out-of-root common paths are hidden, not dropped : first-pass decision recorded (a wrong `SAVE_ROOTS` must not erase data).
  - `[false]` `[reject]` (intent) The `timeout` wording differs from `errorText` : first-pass fix; the settings write never touches qBittorrent.
  - `[false]` `[reject]` (intent) Category keys narrower (`__proto__`, C1 controls) : safer superset of the contract's rule.
  - `[false]` `[reject]` (intent) More files count as broken (bad or missing version step) : falls under "the store cannot read it"; the old file is kept either way.
  - `[false]` `[reject]` (intent) Additions (serial saves, synced writes, `.` segments, viewed row waits) : first-pass fixes.
  - `[low]` `[reject]` (intent) Client behaviours are tested one layer below the user : carried; the menu, sheet and focus-follow run in Chromium, the rest in the real layout under happy-dom.
  - `[false]` `[reject]` (blind) The skeleton waits for settings even with `?sort=` : the AC asks for both answers before data shows.
  - `[low]` `[reject]` (blind) The sort pill shows the default before settings answer : a pick in that window still saves correctly; the skeleton covers the list itself.
  - `[low]` `[patch]` (blind) A failing repair write logs on every read : logged once per start.
  - `[low]` `[patch]` (blind) `write()` validates one value and stores another : the checked data is serialized.
  - `[low]` `[patch]` (blind) Common path names accept control characters and blanks : rejected, like category names (the schema is frozen from here).
  - `[low]` `[reject]` (blind) A category literally named `__all__` collides with 「全部」 : not a name qBittorrent users choose; documented risk only.
  - `[low]` `[patch]` (blind) `isOperationFailureCode` is unused outside its test : one source kept.
  - `[false]` `[reject]` (blind) 重試 on `invalid_input` and the `timeout` wording : the AC lists these codes with 重試.
  - `[low]` `[patch]` (blind) `docs/deployment.md` says nothing about the settings file : section added (file, broken copies, downgrade, post-deploy check).
  - `[low]` `[patch]` (blind) `settings_read_failed` lacks the file field : added.
  - `[low]` `[reject]` (blind) "Not written again" tests rely on mtime : CI runs on Linux with fine timestamps; the tests also check content.
  - `[low]` `[reject]` (blind) The "never polls" test does not advance time : the query has no `refetchInterval`; the test documents the focus refetch.
  - `[low]` `[reject]` (blind) Following keeps `hash` untested : `setView` spreads the previous search, covered since Story 2.4.
  - `[low]` `[reject]` (blind) No e2e for the failure toast : covered in the route DOM test; a fake failure switch adds tooling for one toast.
  - `[low]` `[reject]` (blind) `save-path.ts` imports the control-character check from `categories.ts` : one shared helper, no duplication.
  - `[low]` `[reject]` (blind) Two broken copies in the same millisecond : needs two corrupt files within 1 ms.
  - `[low]` `[patch]` (edge) With `?sort=` every settings answer gives `view` a new identity : the remembered value is used only for a bare URL; `view` stays stable.
  - `[low]` `[patch]` (edge) A failing repair write is retried and logged on every read : same as the blind entry; fixed there.
  - `[low]` `[reject]` (edge) A file larger than 256 KB on disk is served and every write fails : only by hand-editing; the refusal and its log say why.
  - `[low]` `[patch]` (edge) `expectSaved` passes any non-`settings_write_failed` answer : asserts `"ok":true`.
  - `[low]` `[patch]` (edge) The second e2e page is not watched for CSP and console errors : the same listeners are attached.
  - `[false]` `[reject]` (edge, claim) After a failed save another device's value replaces the pick : following another device then is intended (carried).

## Design Notes

Why react only to a change of the remembered value: the URL is "the sort on screen"; the remembered value is "what Alex last chose anywhere". Comparing the new remembered value with the previous one (not with the screen) means a pending write (focus refetch returns the old value, unchanged), a failed write (value unchanged) and this tab's own successful write (new value equals the screen) all leave the screen alone, while another device's write (value changed and differs from the screen) moves it.

Claude 代決 (list in the PR): category key cap 255; broken-file name `settings.json.broken-<UTC timestamp>`; a failed settings read counts as answered with defaults; toast text 「排序沒記住：<code text>」; per-op failure codes in `sendOp`.

Docs (AD-11): Node `fs/promises` `writeFile` (mode), `rename`, `chmod` https://nodejs.org/docs/latest-v24.x/api/fs.html ; TanStack Query `useQuery` `refetchOnWindowFocus`, `setQueryData` https://tanstack.com/query/v5/docs/framework/react/reference/useQuery , https://tanstack.com/query/v5/docs/reference/QueryClient#queryclientsetquerydata ; TanStack Router search params https://tanstack.com/router/latest/docs/framework/react/guide/search-params ; zod 4 https://zod.dev/api . Check the Node major in `.nvmrc` and use that version's docs.

## Verification

**Commands:**
- `source ~/.nvm/nvm.sh && nvm use && npm run lint && npm run typecheck` -- expected: no errors
- `source ~/.nvm/nvm.sh && nvm use && npm test` -- expected: all pass
- `source ~/.nvm/nvm.sh && nvm use && npm run build && npx playwright test` -- expected: all pass, zero CSP violations
- `source ~/.nvm/nvm.sh && nvm use && npm run audit:prod` -- expected: passes
- `bash .claude/skills/next-story/check.sh` -- expected: every line ok

## Auto Run Result

Status: done (first review pass)

**Summary.** `settings.json` in the container (AD-8): schema, shared path schema, a store with first-read repair, broken-file keeping, newer-version refusal, a serial lock, synced temp-file writes and a 256 KB cap; `getSettings` and `setCategorySort`; `['settings']` refetched on focus; 「全部」 remembers a manual pick, a bare URL uses it, another device's change follows on focus (URL replace, top), first load waits for settings; failures show the 重試 toast.

**Review.** 36 findings: patched 6 medium entries (serial saves and stale answers, silent view changes, out-of-root common paths kept in the file, durable writes, in-flight guard test, unreadable-file test) and low ones; rejected 13 (7 false, 6 low) with reasons; nothing deferred.

**Follow-up review: recommended.** Patched by verdict: medium 6. The named risk: the follow rule and the save ordering were reworked after review, so a second pass should re-check them with the store changes.

### Follow-up pass (2026-11-18)

Status: done. 29 findings, no high or medium: patched the low ones (repair-write failure logged once, the checked data is what gets stored, common path names reject control characters and blanks, one failure-code source, `settings_read_failed` carries the file, a stable `view` with `?sort=`, e2e checks a real `ok: true` and watches the second page, a settings section in `docs/deployment.md`); rejected the rest with reasons. Follow-up review: not recommended (no high patched on a follow-up pass).
