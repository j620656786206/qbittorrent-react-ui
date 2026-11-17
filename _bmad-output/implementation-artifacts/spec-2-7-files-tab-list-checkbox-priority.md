---
title: 'Story 2.7: Files tab: list, checkbox, priority'
type: 'feature'
created: '2026-11-17'
status: 'done'
baseline_revision: '62b813fdac2452a766e2fdfa11e0baa952532032'
review_loop_iteration: 0
followup_review_recommended: false
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-2-context.md'
  - '{project-root}/_bmad-output/planning-artifacts/architecture/architecture-react-torrent-2026-11-15/ARCHITECTURE-SPINE.md'
  - '{project-root}/_bmad-output/implementation-artifacts/spec-2-6-pause-resume-and-toast.md'
warnings: ['oversized']
deferred:
  - summary: >-
      Story 2.6's ⋯ menu 重試 (`retryOp` in src/features/detail/more-menu.tsx) never detaches its MutationObserver, so each retried mutation stays in the MutationCache.
    evidence: |-
      Same root cause as the 2.7 finding fixed in `sendFileOp` (observer.reset() after the call settles). `retryOp` is merged 2.6 code outside this diff; only a 重試 press creates one, so the leak is one mutation per retry.
    location: >-
      src/features/detail/more-menu.tsx
    severity: low
---

<intent-contract>

## Intent

**Problem:** The detail's 檔案 tab is disabled, so Alex cannot see each file's progress, untick files he does not want, or change a file's priority without going back to VueTorrent.

**Approach:** Two server functions (`getFiles` GET, `setFilePriority` POST) through the factory; a files tab that polls `['files', hash]` every 5 s only while it is open and shows a flat, virtualised list (checkbox, name, size, progress, priority control); ticking and priority changes send one call, lock that row until the refetch comes back, show no toast on success and the 2.6 failure-with-retry toast on failure.

## Boundaries & Constraints

**Always:**
- `getFiles`: `serverGet`, input `z.strictObject({ hash })` (AR-28 pattern), no side effects; calls qBittorrent 5.1.4 `GET /api/v2/torrents/files?hash=<hash>` through a new named client method; parses the answer with zod and returns only `{ index, name, size, progress, priority }` per file (`src/shared` type), in qBittorrent's order. A torrent qBittorrent does not know (its 404) returns `qbit_rejected` like any non-2xx.
- `setFilePriority`: `serverPost`, input `z.strictObject({ hash, ids, priority })`: `ids` an array of 1 or more non-negative integers (cap it, e.g. 10 000, deduplicated in the container), `priority` exactly one of `0`, `1`, `6`, `7` (numbers). The container joins the ids with `|` into the `id` field and sends `hash`, `id`, `priority` as a `URLSearchParams` form to `POST /api/v2/torrents/filePrio`. The browser never sends a joined string. Returns `ok(null)` (or an empty object) on 2xx; qBittorrent's 400/404/409 become `qbit_rejected`. Confirm endpoint and field names in the official 5.x WebUI API wiki and record the URL.
- `src/server/qbit`: two named methods and two `QBIT_PATHS` constants; nothing generic.
- Files tab (APG tabs): 檔案 is enabled; 概覽 and 檔案 use roving `tabIndex` with ← → (and Home/End) moving between them; the selected tab is local detail state, kept across ‹ › (the new torrent's files load under its own key), back to 概覽 when the detail closes. Under the sticky header and tabs the rest of the panel is the file list.
- Polling: a `src/state` query hook (bind pattern like `src/state/torrent-detail.ts`, since `src/state` cannot import server functions) with key `['files', hash]`, `refetchInterval: pollInterval(5000)`, not in the background, refetch on window focus (the default `unlessLoginRequired`), only mounted while the files tab shows, `retry: false`. A failed poll keeps the last answer.
- Not fetched at all while the torrent reads 抓種子資訊中 (the hero kind `meta` from `src/lib/torrent-status.ts`, never `torrent.state ===`): the tab says 「還在抓種子資訊，檔案清單等一下才有」.
- States: first load: 5 skeleton rows the size of a file row (the existing `Skeleton`); first load failed (no data yet): 「讀不到檔案清單」 plus a 「重試」 button that refetches at once; data: the list. A torrent with 0 files shows the list empty (no special text).
- List: virtualised with `@tanstack/react-virtual` inside the tab panel scroller; with 1000 files under 60 row elements in the DOM. Flat list, no folder tree.
- Row (mockups `S04-files-desktop`, `S05-files-phone`): a checkbox (the existing shadcn `Checkbox`, checked when priority > 0), the relative path as one line with 「…」 (desktop `title` has the full path; plain text), below it 「<size> · <percent>」 through `format.ts` (`formatSize`, `formatPercent`) and, on the right, the priority control. Unticked rows draw the name in `text-muted` as the mockup does. Phone: checkbox and priority control hit areas at least 44px.
- Priority control: a `DropdownMenu` button whose text is the current level, `aria-label` 「優先順序：<level>，<file name>」; items 「一般」 `1`, 「高」 `6`, 「最高」 `7` (current one marked); on an unticked row (priority 0) it reads 「不下載」 and is `disabled`. Priority values qBittorrent may report other than 0/1/6/7 read as 一般 when 1 to 5 (via one `src/lib` function, e.g. `filePriorityLevel`). Inside the phone sheet the menu portals into the sheet (2.6 `container` pattern).
- Mapping: unticking sends priority `0`; ticking sends `1`; a menu choice sends its value; choosing the current value sends nothing.
- In flight: from send until the following `['files', hash]` refetch settles, that row's checkbox and priority control are disabled. Track it in `src/state/pending-ops.ts` (the only in-flight record, AD-7) under a key that cannot collide with torrent hashes (e.g. `file:<hash>:<index>`); make sure `prunePending` (which drops keys missing from maindata) never drops these keys; the 30 s timer still applies as a fallback.
- Success: no toast, no local change; `invalidateQueries`/`refetchQueries` of `['files', hash]`; the row changes from the refetched data.
- Failure: `qbit_rejected`, `timeout`, `invalid_input` show `toast.failure` with text from `src/lib/error-text.ts` (e.g. 「改檔案設定失敗：<reason>」) and 「重試」 resending the same `{ hash, ids, priority }`; a new change to the same file closes that file's still-showing failure toast (2.6 `dismiss` pattern). Connection codes and `bad_origin` stay with the global `onError`. Failure clears the row's pending mark.
- `scripts/fake-qbit.mjs`: `GET /api/v2/torrents/files` (cookie required; deterministic fake files per torrent with fake names, code-name paths only; one torrent with 1000 files for the virtualisation check; the meta torrent 0 files), `POST /api/v2/torrents/filePrio` (logs calls incl. rejected ones, applies the priority so the next files call reflects it, honours `ops=reject`), and a `files` mode `normal | slow | fail` for the loading and failure screenshots.
- AD-11: read the qBittorrent 5.x WebUI API wiki (files, filePrio), TanStack Virtual 3 `useVirtualizer`, TanStack Query v5 `useQuery`/`invalidateQueries`, Radix DropdownMenu; record URLs in Design Notes.

**Never:** a toast on success; optimistic updates; a folder tree; renaming files (Epic 5); polling files while the tab is closed or for torrents other than the shown one; adding file data to `['maindata']` or the slim table; new dependencies; `torrent.state` comparisons outside `src/lib/torrent-status.ts`; real qBittorrent in tests, e2e or screenshots (AD-15).

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| G1 files | `getFiles({ hash })`, fake answers files with extra fields | GET `torrents/files?hash=`, only index, name, size, progress, priority returned | non-2xx: `qbit_rejected`; bad JSON or shape: `qbit_rejected` |
| G2 bad input | missing hash, uppercase, `all`, extra key | `invalid_input`, no call | n/a |
| S1 set | `setFilePriority({ hash, ids: [3, 1, 3], priority: 6 })` | POST `filePrio`, form `hash`, `id=3|1`, `priority=6` | n/a |
| S2 bad set | `ids: []`, `-1`, `1.5`, `'1|2'`, priority `2`, `'6'`, extra key | `invalid_input`, no call | n/a |
| S3 auth | no session (both functions) | `not_logged_in` (discovery test) | n/a |
| R1 tick | untick a row; tick it again | sends 0; then 1 | n/a |
| R2 priority | choose 高 on a 一般 row; choose 一般 on a 一般 row | sends 6; sends nothing | n/a |
| R3 unticked | priority 0 row | control reads 不下載, disabled | n/a |
| P1 lock | send, refetch not back yet | row's checkbox and control disabled; other rows usable | 30 s fallback |
| F1 failure | `qbit_rejected` / `timeout` / `invalid_input` | failure toast with 重試; row usable again; 重試 resends | n/a |
| L1 states | first load, first load failed, meta torrent | 5 skeleton rows; 讀不到檔案清單 + 重試 (refetches); 還在抓種子資訊… and no request | poll failure with data: old list stays |
| V1 many | 1000 files | under 60 row elements | n/a |
| Q1 lifecycle | switch tab, close detail, hide page, switch torrent | polling stops; on return to the page one fetch; new torrent uses its own key | n/a |

</intent-contract>

## Code Map

- `src/server/functions/_define.ts` -- `serverGet`, `serverPost`, `guard`, `input`; patterns: `get-torrent-detail.ts` (GET by hash), `stop-torrents.ts` (POST).
- `src/server/qbit/paths.ts`, `client.ts` -- add paths and methods; `session.send(path, { method, query | form })`; `syncMaindata` shows parse-with-zod and error handling (`BadMaindata`); for files a parse failure should become `ServerFailure('qbit_rejected')`.
- `src/server/functions/discover.test.ts` -- lists every server function; `torrent-ops.test.ts` -- fake fetch test setup from 2.6.
- `src/shared/torrent-hash.ts` (`TORRENT_HASH_PATTERN`), `src/shared/torrent-ops.ts` (2.6 hash-list types), `src/shared/zod.ts` (`z` for non-server layers).
- `src/state/torrent-detail.ts` -- the per-hash polled query pattern (bind function, `pollInterval`, `refetchIntervalInBackground: false`, sticky `failed`); `src/state/polling.ts`.
- `src/state/pending-ops.ts` -- `markPending`, `clearPending`, `pendingOpOf`, `prunePending`, `usePendingOp(hash, action, owned)` (prunes keys missing from maindata: file keys must survive).
- `src/features/detail/more-menu.tsx` -- 2.6 mutation pattern: `torrentOpOptions`, `retryOp` via `MutationObserver`, failure-toast `dismiss` map, in-flight disable.
- `src/features/detail/detail-view.tsx` -- tablist (檔案 disabled at ~line 60), tabpanel (`tabIndex={0}`, the scroller, ~line 149), `Overview`.
- `src/features/detail/phone-detail-sheet.tsx`, `board-detail-panel.tsx`, `list-detail-panel.tsx` -- the three containers.
- `src/lib/torrent-status.ts` -- `heroKindOf` (`meta`); `src/lib/format.ts` -- `formatSize`, `formatPercent`; `src/lib/error-text.ts` -- `LIST_LOAD_FAILED` comment names the files-tab wording, `isOperationFailureCode`, `pauseActionFailureText` pattern.
- `src/lib/toast.ts` -- `toast.failure(text, { onRetry })` returns `{ dismiss }`.
- `src/shared/ui/checkbox.tsx`, `skeleton.tsx`, `dropdown-menu.tsx` (`container`), `list-blocks.tsx` (row patterns).
- `src/features/list/torrent-list.tsx` -- existing `useVirtualizer` usage to copy.
- `scripts/fake-qbit.mjs` -- `fakeQbit` handler, `/__fake/ops` log, `ops` mode, `controlMode`, data modes (`states` has a meta torrent).
- `e2e/pause.spec.ts`, `e2e/detail.spec.ts`, `e2e/fixtures.ts` -- e2e and screenshot patterns.
- Mockups: `_bmad-output/planning-artifacts/ux-designs/ux-react-torrent-2026-11-13/mockups/S04-files-desktop.dc.html`, `S05-files-phone.dc.html`; DESIGN.md line ~695; EXPERIENCE.md lines 98, 347, 376.

## Tasks & Acceptance

**Execution:**
- `src/shared/torrent-files.ts` (new) -- input schemas, file type, priority constants.
- `src/server/qbit/paths.ts`, `client.ts` (+ test) -- files and filePrio methods.
- `src/server/functions/get-files.ts`, `set-file-priority.ts` (+ tests G1, G2, S1 to S3, fake fetch only).
- `src/lib/` (+ tests) -- priority level and labels; files failure text in `error-text.ts`.
- `src/state/torrent-files.ts` (new, + test) -- polled query; `src/state/pending-ops.ts` (+ test) -- file keys survive pruning.
- `src/features/detail/files-tab.tsx` (new) and `detail-view.tsx` -- tabs, states, virtual list, rows, mutation, lock, toast, retry (+ DOM tests R1 to R3, P1, F1, L1, V1, Q1, tab keyboard).
- `scripts/fake-qbit.mjs` -- files and filePrio endpoints, `files` mode.
- `e2e/files.spec.ts` (new) -- untick and re-tick a file and change a priority (fake log shows the calls, the row follows the refetch), failure toast and 重試, 1000 files under 60 rows; screenshots into `e2e-output/screenshots/2-7/`: desktop list mode, board narrow panel, phone sheet, each with data, loading, failed, meta, light and dark.

**Acceptance Criteria:**
- Given fake data, when Alex opens the 檔案 tab and unticks a file, then the fake records one filePrio call with priority 0 for that id, no toast shows, and after the refetch the row is unticked with 不下載.
- Given `npm run lint`, `npm run typecheck`, `npm test`, `npm run build`, `npm run smoke`, `CI=1 npm run smoke:browser` and `check.sh`, then all pass with 0 CSP violations and 0 console errors.
- Given the PR, then it carries the files-tab screenshots (desktop list, board panel, phone; data, loading, failed, meta; light and dark) and the doc URLs.

## Spec Change Log

## Review Triage Log

### 2026-11-17: Review pass
- verdicts: 35 findings: high 0, medium 0, low 30, false 5, maybe-false 0
- findings:
  - `[low]` `[patch]` (verification) 1000 files never checked in the phone sheet's scroller. Patch: e2e at 390px, under 60 rows, scrolled to the last file.
  - `[low]` `[patch]` (verification) the scroll reset on tab switch is untested. Patch: e2e scrolls the overview to 200, opens 檔案, `scrollTop` is 0 (on the 1000-file torrent).
  - `[low]` `[patch]` (verification) 「back to 概覽 on close」 tested on the board panel only. Patch: parametrised over the board panel, the phone sheet and the list panel.
  - `[low]` `[patch]` (verification) the row lock's per-torrent filter is untested. Patch: a call held on h(1) file 0 leaves h(2) file 0 usable.
  - `[low]` `[patch]` (verification) the phone sheet flips to 概覽 while sliding out. Patch: the tab resets when the detail opens again, not when it closes; DOM test that the closing sheet still shows 檔案 and fires no overview fetch.
  - `[low]` `[patch]` (blind) phone sheet switches to 概覽 during the close slide (same root cause as the row above). Patched there.
  - `[low]` `[reject]` (blind) the list panel loses 檔案 on brief gaps of the viewed torrent. The viewed torrent leaving the shown order already moves the detail to its successor; a gap that reopens the same torrent is rare and only resets the tab.
  - `[low]` `[patch]` (blind) fake-qbit accepts filePrio without `id`. Patch: missing or empty `id` or `priority`, or a non-integer id part, answers 400.
  - `[low]` `[patch]` (blind) fake-qbit logs invalid filePrio calls as accepted. Patch: 400, 404 and 409 answers are logged `rejected: true`.
  - `[low]` `[patch]` (blind) the skeleton's `aria-label` on a role-less div is not announced. Patch: `role="status"`, `aria-busy` kept.
  - `[low]` `[reject]` (blind) the tabpanel stays a tab stop on 檔案. One extra stop for keyboard users; Alex uses mouse and touch; making it conditional adds state per tab content.
  - `[low]` `[patch]` (blind) phone virtualised scrolling untested (same root cause as the first verification row). Patched there.
  - `[low]` `[reject]` (blind) `scrollMargin` goes stale when content above the list changes height. The phone header and tabs sit outside the sheet's content scroller (`bottom-sheet.tsx` renders `header` as a sibling of `bottom-sheet-content`), so nothing above the list changes height inside the scroller.
  - `[low]` `[reject]` (blind) 重試's `aria-busy` follows polls; polling continues after a failed first load. The next poll being the retry is the maindata and detail pattern; `aria-busy` during a real fetch is truthful.
  - `[low]` `[reject]` (blind) `failureToasts` keeps entries of closed toasts. A dismiss on a closed toast is a no-op; entries are per file Alex changed in one page session.
  - `[low]` `[reject]` (blind) fixed waits prove 「sends nothing」. Slow only; the meta check now also proves it can fail (row below).
  - `[false]` `[reject]` (blind) the spec file is not in the diff. Left out on purpose for the review layers; it is committed with the code.
  - `[false]` `[reject]` (blind) multi-id support has no caller. The AC asks `setFilePriority` to take 1 or more ids.
  - `[low]` `[patch]` (blind) a redundant field copy after a non-strict zod parse in `client.ts`. Patch: returns `parsed.data`; the extra-field test still passes.
  - `[low]` `[reject]` (blind) a redundant mode reset and lingering slow requests in the screenshot test. Test hygiene only; `afterEach` resets modes.
  - `[low]` `[patch]` (intent) back in front fetches only when stale. Patch: `refetchOnWindowFocus` returns `'always'` unless login is needed, like maindata; test for a 1 s return.
  - `[low]` `[reject]` (intent) closing the detail stopping the poll is not DOM-tested. Closing unmounts the same files component whose observer count Q1 checks on a tab switch.
  - `[low]` `[reject]` (intent) 44px targets checked by classes only. Same approach as the 2.2 and 2.4 phone controls; the screenshots show them.
  - `[false]` `[reject]` (intent) the meta state uses `heroKindOf`, not `classify()`. The AC's point is 「不直接比狀態」; `heroKindOf` is the same `src/lib/torrent-status.ts` classification `classify` is built on.
  - `[false]` `[reject]` (intent) `timeout` shows the toast although it might read as a connection code. The 2.6 AC lists `timeout` with the toast codes and AD-9 lists the connection codes; files follow 2.6.
  - `[low]` `[reject]` (intent) 1000 files unchecked in the board panel and phone (same as the first verification row, which added the phone; the board panel shares the list panel's tabpanel scroller).
  - `[low]` `[reject]` (intent) the locked moment is not seen in e2e. DOM test P1 covers it, and fails when the lock is broken.
  - `[low]` `[patch]` (edge) the meta 「no request」 e2e matches `getFiles` in URLs, which built URLs never contain. Patch: the fake logs every files request; the test asserts META is never asked and that another torrent's hash does appear.
  - `[low]` `[patch]` (edge) `sendFileOp`'s MutationObserver never detaches, so finished mutations never leave the cache. Patch: `observer.reset()` after the call settles; test with `gcTime: 0`. The same pattern in 2.6's `retryOp` is deferred.
  - `[low]` `[patch]` (edge) the phone sheet flips to 概覽 mid-animation (same root cause as the verification row). Patched there.
  - `[low]` `[reject]` (edge) after a failed first load, a reopened tab shows 讀不到檔案清單 at once. The sticky failure is the 2.4 detail pattern; the refetch replaces it when it answers.
  - `[low]` `[reject]` (edge) a successful filePrio whose refetch fails unlocks the row with the old priority. The next 5 s poll shows the change; no wrong data is sent.
  - `[low]` `[reject]` (edge) a menu left open while a poll unticks the file can re-tick it. Needs another client changing the same file during the open menu.
  - `[false]` `[reject]` (edge) no scroller ancestor gives zero rows. The files tab only renders inside a tabpanel (desktop) or the sheet content (phone).
  - `[low]` `[patch]` (edge) fake filePrio without `id` or `priority` changes file 0 (same root cause as the blind fake row). Patched there.

## Design Notes

- Claude 代決 (Alex may veto): the selected tab stays across ‹ › and resets to 概覽 when the detail closes; priority values 2 to 5 read as 一般; failure text 「改檔案設定失敗：<reason>」 for ticks and priority alike; choosing the current level sends nothing; a meta torrent's files are not requested; 0 files shows an empty list.
- The row lock lives in `pendingOps` (AD-7), keyed so it cannot meet a torrent hash, and clears when the refetch after the call settles, not when the call returns.
- URLs actually read (2026-11-17, AD-11): `https://github.com/qbittorrent/qBittorrent/wiki/WebUI-API-(qBittorrent-5.0)` (`torrents/files`: `hash`, answer has `index`, 404 for an unknown hash; `torrents/filePrio`: `hash`, `id` separated by `|` (use `index`), `priority`; 400 bad priority or id, 404 unknown torrent, 409 no metadata yet or unknown id; priorities 0, 1, 6, 7); `https://tanstack.com/virtual/latest/docs/api/virtualizer` (`scrollMargin` for content above the list inside the scroll element, subtract it in the transform; stable `getItemKey`); `https://tanstack.com/query/v5/docs/framework/react/reference/useQuery` (`enabled` function, `refetchInterval` function, `refetchIntervalInBackground` false, `refetchOnWindowFocus` default true, `errorUpdateCount`); `https://tanstack.com/query/v5/docs/reference/QueryClient` (`invalidateQueries` refetches active queries only and resolves when that refetch settles, without rejecting on a failed refetch); `https://www.radix-ui.com/primitives/docs/components/dropdown-menu` (RadioGroup `value`/`onValueChange`, RadioItem, Portal `container`).
- Implementation notes (Claude 代決, Alex may veto):
  - `MAX_FILE_IDS` is 3000, not 10 000: Start's client sends about 19 bytes per id, so 10 000 ids are about 190 KB, over the 64 KB default body limit AD-12 gives everything but hash lists. 3000 seven-digit ids measure under 64 KB (a test pins it). Nothing sends more than one id today.
  - `getFiles` answers the file array itself; `setFilePriority` answers `null`.
  - Priorities below 0 read as 不下載 (unticked) and above 7 as 最高, so the checkbox rule (ticked when priority > 0) and the pill never disagree.
  - The lock is both the `file:<hash>:<index>` pending entry and the mutation still running (its `onSuccess` awaits `invalidateQueries`, so the mutation stays pending until the refetch settled); the second covers a call that outlives the 30 s mark, as in 2.6. Calls go through a `MutationObserver` (no `useMutation`), so 重試 and a call whose tab closed still clear the mark and report.
  - `invalidateQueries` (not `refetchQueries`): with the tab closed nothing refetches, the query is only marked stale.
  - The scroller is found by `closest()`: the sheet's content on the phone, the tab panel on desktop. Rows have a fixed 66px height (8px padding, 18px name line, 4px gap, 28px pill line) with 2px gaps; overscan 10.
  - Phone hit areas: the checkbox gets a `::after` 12px around its 20px box (44px), the pill's button is 44px tall around the 28px pill (negative margins, as the mockup).
  - The pill's weight follows the mockup: 不下載 muted 400, 一般 400, 高 and 最高 700. The mockup's folder line above the list is left out (the spec: under the tabs the rest is the list; names are the full relative path).
  - The tab goes back to 概覽 when a closed detail opens again (closed to open), not at the close: the phone sheet keeps showing 檔案 while it slides out (the files query keeps its observer for that 0.3 s).
  - `sendFileOp` resets its `MutationObserver` once the call settles, so the finished mutation has no observer and the cache collects it after `gcTime`. (2.6's `retryOp` in `more-menu.tsx` has the same leak; not changed here.)
  - The files query refetches on window focus with `'always'` (the maindata form), so a return under 5 s fetches too.
  - fake-qbit answers a missing or empty `id` or `priority` with 400, logs every filePrio call it does not apply with `rejected: true`, and logs each torrents/files request's hash at `/__fake/files` (the e2e's "no request for a metadata torrent" check reads it: built server-function URLs carry an opaque id, not the name).
  - The priority menu's `open` is not ANDed with `disabled`: Radix skips `onOpenChange(false)` when the controlled value already reads false, so the menu reopened by itself once the row unlocked (found by the e2e).
  - fake-qbit logs filePrio calls in the same `/__fake/ops` list as stop/start, as `{ op: 'filePrio', hash, ids, priority }`.
  - fake-qbit gives sample E01 four files (E01, E02 高, E03, an unticked trailer) and sample E03 1000 files; `files=slow` waits 25 s, so the container answers `timeout`. The e2e's "settled" wait skips the skeleton's endless pulse, otherwise the loading screenshot would wait for the failure.
  - `e2e/detail.spec.ts` (story 2.4) asserted 檔案 disabled; it now asserts enabled and not selected.

## Verification

**Commands:**
- `source ~/.nvm/nvm.sh && nvm use && npm run lint && npm run typecheck && npm test` -- expected: all pass.
- `source ~/.nvm/nvm.sh && nvm use && npm run build && npm run smoke && CI=1 npm run smoke:browser` -- expected: all pass, 0 CSP violations.
- `bash .claude/skills/next-story/check.sh` -- expected: every line ok.

## Auto Run Result

Status: done (one review pass)

Summary: the detail's 檔案 tab works in the list panel, the board panel and the phone sheet. `getFiles` (GET) returns index, name, size, progress and priority per file; `setFilePriority` (POST) takes a hash, 1 to 3000 file ids (joined in the container) and priority 0, 1, 6 or 7. `['files', hash]` polls every 5 s only while the tab shows, fetches at once when the page comes back, and is never asked for a torrent still fetching metadata. The list is flat and virtualised (under 60 rows at 1000 files); rows have the checkbox, the path, size and percent, and the 一般／高／最高 pill (不下載 and disabled when unticked). A change locks the row until the refetch after it settles, shows no toast on success and the 2.6 failure toast with 重試 on failure. Tabs got ← → Home End and stay across ‹ ›.

Files changed (main ones):
- `src/server/functions/get-files.ts`, `set-file-priority.ts` (new), `src/shared/torrent-files.ts` (new), `src/server/qbit/client.ts`, `paths.ts`.
- `src/lib/file-priority.ts` (new), `src/lib/error-text.ts` (files texts).
- `src/state/torrent-files.ts` (new), `src/state/pending-ops.ts` (file keys survive pruning).
- `src/features/detail/files-tab.tsx` (new), `detail-view.tsx` (tabs, keyboard, reset on reopen), the three containers.
- `scripts/fake-qbit.mjs` (files, filePrio, `files` mode, request logs), `e2e/files.spec.ts` (new), `e2e/fixtures.ts`, `e2e/detail.spec.ts`, tests beside each file.

Review: 35 findings. Patched 12 low entries (17 rows including shared root causes), deferred 1 pre-existing low (2.6 `retryOp` observer), rejected 18 (13 low, 5 false) with reasons in the log.

Follow-up review recommendation: false. No high or medium entry was patched.

Verification (2026-11-17, after the patches): `npm run lint` clean; `npm run typecheck` clean; `npm test` 94 files, 2162 tests passed; `npm run build` ok; `npm run smoke` ok; `CI=1 npm run smoke:browser` 56 passed, 0 CSP violations; `check.sh` all ok. Matrix audit: G1, G2, S1 to S3, R1 to R3, P1, F1, L1, V1, Q1 each have covering tests that ran and passed.

Residual risks: ticking and priority against the real qBittorrent are Alex's NAS check (AD-15); the fake's 400 for a missing `id` or `priority` is untested (fixture only).
