---
title: 'Story 2.1: 51 sorts and the desktop sort menu'
type: 'feature'
created: '2026-11-16'
status: 'done'
baseline_revision: 'bdb705780e7848caa979d2389f1939a7d6f80483'
review_loop_iteration: 0
followup_review_recommended: false
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-2-context.md'
  - '{project-root}/_bmad-output/planning-artifacts/architecture/architecture-react-torrent-2026-11-15/ARCHITECTURE-SPINE.md'
  - '{project-root}/_bmad-output/implementation-artifacts/spec-2-0-browser-smoke-not-found-login-wiring.md'
warnings: ['oversized']
deferred:
  - summary: >-
      The disabled phone sort pill is only rendered with the default sort in tests.
    evidence: |-
      app-shell.test.tsx uses the default ListViewContext; e2e sort tests run at desktop width. Story 2.2 replaces the pill with the phone sort sheet.
    location: >-
      src/features/header/sort-menu.tsx
    severity: low
  - summary: >-
      The disabled ['sort-keys', null] placeholder observer is not pinned by a test.
    evidence: |-
      Reverting to an observer on a real field key would pass every test; the effect is briefly stale keys for one field.
    location: >-
      src/state/sort-keys.ts
    severity: low
---

<intent-contract>

## Intent

**Problem:** The list is hard-wired to "added time, newest first" and the desktop sort pill is disabled. Alex needs 51 sorts so the torrents he should deal with float to the top, with the big number on each row following the sort.

**Approach:** A single `src/shared/sort-fields.ts` table of 51 sort ids; `sort`/`dir` in the URL search params (zod); `selectVisibleTorrents` sorts by the view; an enabled desktop sort pill plus a 260px Radix `DropdownMenu`; the row's big number follows the sort. Sorts whose values the slim table does not carry are fetched on demand with a new `getSortKeys({ field, since })` server function (Alex, 2026-11-16, now written into AD-6). The tracker is stored and sent only as its hostname.

## Boundaries & Constraints

**Always:**
- Exactly 51 sort ids in `src/shared/sort-fields.ts`, ids snake_case, qBittorrent's own name where one exists (AR-6). The list, in order (top 5 first, then groups):
  - Top 5: `state` 狀態, `seeding_time` 做種時間, `added_on` 加入時間, `ratio` 分享率, `completion_on` 完成時間.
  - 時間: `time_active`, `last_activity`, `seen_complete`, `eta`.
  - 進度: `progress`, `amount_left`, `availability`.
  - 速度: `dlspeed`, `upspeed`, `avg_dlspeed`, `avg_upspeed`, `global_speed`.
  - 流量和分享率: `uploaded`, `downloaded`, `uploaded_session`, `downloaded_session`, `global_volume`, `popularity`.
  - 大小: `size`, `total_size`.
  - 人數: `num_seeds`, `num_leechs`, `num_complete`, `num_incomplete` (VueTorrent's swarm seeds and peers).
  - 名稱和分類: `name`, `category`, `tracker_domain`, `trackers_count`, `private`.
  - 路徑: `save_path`, `content_path`, `root_path`, `content_path_basename`, `save_path_basename`.
  - 限制和設定: `dl_limit`, `up_limit`, `ratio_limit`, `seeding_time_limit`, `inactive_seeding_time_limit`, `priority`, `reannounce`.
  - 技術資訊: `hash`, `infohash_v1`, `infohash_v2`, `has_metadata`, `comment`.
  - The top-5 entries that also belong to a group (state, seeding_time, added_on, ratio, completion_on) appear only once, in the top 5; the "更多" list therefore has 46 entries. Never `download_path`, `basename_download_path`, `tags`.
- Each field has: Chinese name, group, default direction, the two direction words, big-number kind, and `source: 'slim' | 'extra'`. Default directions per EXPERIENCE: seeding time long first, added and completed newest first, ratio high first, size large first, name A to Z, other numbers large first. Direction words per EXPERIENCE; text fields use A 到 Z / Z 到 A; booleans 是在前 / 否在前.
- Fields already in the slim table (`source: 'slim'`): state, seeding_time, added_on, ratio, completion_on, eta, progress, dlspeed, upspeed, global_speed (dlspeed + upspeed), size, name, category, private, save_path, save_path_basename, hash. Every other id is `source: 'extra'`.
- `getSortKeys({ field, since? })`: session-gated server function made with the existing factory (`src/server/functions/_define.ts`), zod input with `field` restricted to the `extra` ids. It answers `{ version, full, keys: Record<hash, value | null> }` for that one field: everything when `since` is missing or too old, otherwise only torrents whose extra fields changed after `since`. Values are computed in the container by `src/lib` pure functions (derived ones per VueTorrent v2.37.0: avg speed = downloaded or uploaded / time_active, global volume = downloaded + uploaded, basename = last path segment, tracker domain = hostname of the tracker URL).
- The container keeps the extra fields in a second in-memory table next to the slim table, fed from the same `sync/maindata` pulls (same allowlist-by-zod approach). It stores `tracker_domain` only; the raw `tracker` string and `magnet_uri` are never stored or sent by any server function. Churning extras are quantized before change detection: `time_active`, `last_activity`, `reannounce` floored to 60 s; `availability`, `popularity` rounded to 2 decimals.
- `getMaindata`'s output and `TORRENT_FIELDS` are unchanged. The G9 leak test keeps passing for `getMaindata`; add the same leak check for `getSortKeys` that the tracker URL (passkey marker) and magnet never appear for any field, while comment, content_path, root_path, infohash may appear only from `getSortKeys` for their own field. Update the comments in `src/shared/maindata.ts` and `src/server/qbit/testing.ts` to say exactly this.
- Browser: `['sort-keys', field]` query, polled every 5 s through the existing polling helper only while the active sort is `extra`; merged with a pure function in `src/lib`; torrents removed from maindata are ignored.
- URL: a zod search schema in `src/shared` for `sort` (one of the 51 ids) and `dir` (`asc` | `desc`). Invalid `sort` or `dir`: fall back to the default and fix the URL with `replace`. No `sort` in the URL: added_on, newest first (Story 2.3 changes this to state). Changing sort or direction uses `replace`.
- `selectVisibleTorrents(maindata, view, sortKeys?)` is the only sorter; archived excluded; reversing the direction reverses the order; ties: `added_on` newest first, then `hash`, never reversed; torrents with no value go last in both directions. "No value" checks (infinite `eta`, `completion_on` -1, unset limits -1/-2 and similar, `seen_complete` 0, an extra key not loaded) live only in `src/lib/format.ts`. The Epic 1 hard-coded order is removed.
- Desktop pill (UX-DR20, mockup S03-sort-menu-desktop): enabled; left `surface-muted` capsule 「列表」 with icon, right bold 「排序：做種時間 ↓」 plus chevron; the arrow is not separately clickable; `aria-label` and tooltip with the full words, e.g. 「排序：做種時間，久的在前」. Phone pill stays disabled.
- Menu: shadcn-style wrapper of Radix `DropdownMenu` in `src/shared/ui/dropdown-menu.tsx`, 260px wide, max 70vh with internal scroll; top 5 rows show 1 to 5 in `text-muted` (text only); separator; 「更多 ▾」 expands the 46 grouped items inside the same menu (group headers `tag` 11px `text-muted`, no submenu); selected row has a check on the left and `text-muted` direction words plus arrow after the name; when the current sort is under 更多, the menu opens expanded and scrolled to it; 「狀態」 shows but is disabled. Clicking the selected item flips the direction and keeps the menu open; clicking another item switches to it with its default direction, closes the menu and scrolls the list to the top.
- 0 CSP violations in the browser smoke with the menu open (Radix modal menus inject a `<style>` through react-remove-scroll; avoid it, e.g. `modal={false}`, without loosening CSP).
- A user sort change re-sorts immediately even while the order is frozen; the freeze only holds data-driven moves.
- Row big number per the EXPERIENCE big-number table, through `format.ts`; text kinds (category, paths, hash, comment, tracker domain) in `body` 13px `text-muted`, max 160px, truncated, paths truncated from the front; hash first 8 characters in the `path` font; the 分享率 column hidden when sorting by ratio; name sort shows progress or the status word (13px); save path shows the location label; unset limits 「不限速」; incomplete completion 「沒有」; speed 0 「0」 in `text-muted`; untrusted strings as plain text. Fields the table does not name follow the closest kind (points in time as dates, durations as lengths, booleans 「是」「否」). While an extra field's first keys are loading, rows keep the previous order and the big number shows a small skeleton bar.
- No em dash anywhere. `check.sh` before every commit. Fake data only (AD-15); add fake values for every extra field to `scripts/fake-qbit.mjs`.

**Never:**
- No phone sort sheet (Story 2.2), no board (Story 2.3), no per-category remembered sort, no 「（這個分類記住的）」, no keyboard shortcuts (Epic 3).
- Never send the full tracker URL or magnet to the browser; never add the extra fields to the slim table or `TORRENT_FIELDS`.
- No `'unsafe-inline'` or other CSP loosening; no new runtime dependency beyond what `radix-ui` 1.8.1 already ships.
- Features never call `.sort()` on torrents.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| S1 fields | `SORT_FIELDS` | 51 ids, top 5 in order, none of the 3 dropped, 46 under 更多 | n/a |
| S2 sort slim | sort=seeding_time desc / asc | longest first / shortest first; ties by added_on desc then hash in both | n/a |
| S3 missing last | completion_on with -1 values, both directions | incomplete ones last both ways | n/a |
| S4 extra loading | sort=num_seeds, keys not yet loaded | previous order kept, big number skeleton; after keys arrive, sorted | getSortKeys error: previous order kept, existing connection alert handles the code |
| S5 URL invalid | `?sort=nope&dir=up` | default order, URL replaced without the bad params | n/a |
| S6 menu flip | click the selected item | direction flips, menu stays open, list order reverses | n/a |
| S7 menu switch | click another item | its default direction, menu closes, `main` scrollTop 0 | n/a |
| S8 more open | current sort under 更多 | menu opens expanded, current item scrolled into view | n/a |
| S9 frozen | pointer over list (frozen), user changes sort | re-sorted at once | n/a |
| S10 tracker | raw tracker `https://tracker.example/announce?passkey=SECRET` | `tracker_domain` = `tracker.example`; `SECRET` never in any server function output | malformed URL: null (no value) |
| S11 delta | getSortKeys with recent `since`, one torrent's extras changed | only that hash in `keys`, `full: false` | `since` unknown or too old: `full: true` |
| S12 perf | 4165 fake torrents, switch sort | select plus repaint under 100 ms on the dev machine | n/a |

</intent-contract>

## Code Map

- `src/shared/maindata.ts:7-35` -- slim schema, `TORRENT_FIELDS`; comment says trackers, comments, content paths never leave: rewrite per the new rule; fields unchanged.
- `src/server/qbit/maindata-schema.ts:10-42` -- raw schema = slim omit hash, partial; add the extra raw fields (incl. `tracker` for deriving the domain) to a separate raw extras schema; keep the allowlist approach.
- `src/server/sync/torrent-table.ts:26,58-60,95-117` -- slim table, `SEEDING_TIME_STEP_S`, change detection, `BadMaindata('incomplete_torrent')`. The extras table must not throw when qBittorrent omits an extra field (default to null).
- `src/server/sync/syncer.ts`, `src/server/sync/index.ts` -- where pulls feed the table and `version` comes from.
- `src/server/functions/get-maindata.ts`, `_define.ts`, `discover.test.ts` -- pattern for the new `get-sort-keys.ts`; discovery test requires every function to be gated.
- `src/server/functions/get-maindata.test.ts:149-165`, `src/server/qbit/testing.ts:16-57` -- G9 leak test, `LEAK_MARKERS`, `rawTorrent` fixture.
- `src/server/sync/payload-size.test.ts` -- budgets for getMaindata: must stay green (fields unchanged).
- `src/lib/visible-torrents.ts:14-47` -- `TorrentView`, `EPIC1_VIEW`, hard-coded `byAddedOnDesc`; replace.
- `src/lib/format.ts` -- `NO_VALUE`, `QBIT_ETA_INFINITY`, all formatters; add the missing-value predicates and the new big-number formatters here.
- `src/lib/torrent-status.ts:178,226`, `src/lib/paths.ts:9` -- status word for the name sort, `locationLabel` for save path.
- `src/lib/maindata-merge.ts` -- merge pattern for the new sort-keys merge.
- `src/state/maindata.ts:180-186` -- `useVisibleTorrents(view)` needs a stable view; `src/state/polling.ts` -- the only way to set `refetchInterval`.
- `src/state/order-freeze.ts:19-60,157-173` -- `useFrozenOrder(live)`: needs to reset on a view change.
- `src/features/list/list-model.ts:64-170` -- `RowModel.value` fixed to added time (L131), `rowProps`; add sort-driven value and ratio-column hiding.
- `src/features/list/torrent-row.tsx:50-65` -- ratio column and big value with the hard-coded 「加入 」 screen-reader prefix.
- `src/features/list/torrent-list.tsx:83-180` -- `useVisibleTorrents(EPIC1_VIEW)`, freeze, virtualizer on `getMain()`.
- `src/features/header/app-shell.tsx:25-27,102-152` -- disabled desktop and phone pills, `SORT_LABEL`; `app-shell.test.tsx:136-138` asserts the label.
- `src/routes/_authed.tsx`, `src/routes/_authed/index.tsx` -- the shell is in the `_authed` layout, so the search schema must be readable there (validate on the layout or use `useSearch({ strict: false })`).
- `src/shared/login.ts:15-17`, `src/routes/login.tsx` -- existing zod search pattern (`.catch(undefined)` drops but does not fix the URL).
- `src/shared/ui/dialog.tsx`, `checkbox.tsx`, `ui.test.ts:11-37` -- Radix wrapper pattern and token checks.
- `src/shared/csp.ts` -- no `style-src`; React `style={}` via CSSOM is fine, injected `<style>` is blocked.
- `scripts/fake-qbit.mjs:124-302` -- fake torrents; add extra fields (fake tracker URLs on `.example` hosts with a fake `passkey=` marker, fake comments, fake content paths under `/data/...`, code-name categories only).
- `e2e/smoke.spec.ts`, `e2e/fixtures.ts` -- add a smoke test: open the menu, expand 更多, pick an extra sort, check 0 CSP violations and the order changes.
- UX sources: `_bmad-output/planning-artifacts/ux-designs/ux-react-torrent-2026-11-13/EXPERIENCE.md:238-286` (sort rules, number writing, big-number table), `DESIGN.md:195-206,613-623` (sort-pill, sort-menu, list-row), `mockups/S03-sort-menu-desktop.dc.html` (pill and collapsed menu, line 28), `.working/vuetorrent-sort-fields.md` (VueTorrent ids).

## Tasks & Acceptance

**Execution:**
- `src/shared/sort-fields.ts` (+ test) -- the 51-field table per Always; vitest: count 51, top-5 order, dropped 3 absent, 46 in 更多, every field has every attribute.
- `src/shared/list-search.ts` (+ test) -- zod schema for `sort` and `dir`, defaults, and a helper telling whether the raw search needs fixing.
- `src/lib/format.ts` (+ tests) -- missing-value predicates per field kind; big-number formatters for every kind (date, length, ratio, percent, speed with 「0」, size, count, limit with 「不限速」, boolean 「是」「否」, text, hash first 8).
- `src/lib/sort-values.ts` (+ tests) -- pure functions: slim sort value per id; derived extras (avg speeds, global volume, basenames, tracker domain from a URL) with the VueTorrent v2.37.0 formulas cited in comments.
- `src/lib/visible-torrents.ts` (+ tests) -- view-driven sort with ties and missing-last rules; every field tested in both directions at least once, plus ties and missing values; one perf test or script for 4165 torrents.
- `src/lib/sort-keys-merge.ts` (+ test) -- merge full/delta sort-key responses.
- `src/server/qbit/maindata-schema.ts`, `src/server/sync/extras-table.ts` (+ tests), `src/server/sync/syncer.ts` -- second table with quantization, versioned changes, raw tracker reduced to its hostname at ingest.
- `src/server/functions/get-sort-keys.ts` (+ tests) -- gated function per Always; leak test for the tracker passkey marker and magnet.
- `src/shared/maindata.ts`, `src/server/qbit/testing.ts` -- comment updates; fixtures gain extra fields.
- `src/state/sort-keys.ts` (+ test) -- query options for `['sort-keys', field]`, polling only while active.
- `src/state/order-freeze.ts` (+ test) -- reset the shown order when the view changes.
- `src/shared/ui/dropdown-menu.tsx` -- Radix wrapper with brand tokens, non-modal.
- `src/features/header/sort-menu.tsx`, `app-shell.tsx` (+ tests) -- enabled desktop pill and menu per Always; phone pill unchanged.
- `src/features/list/list-model.ts`, `torrent-row.tsx`, `torrent-list.tsx` (+ tests) -- sort-driven big number, ratio column hiding, scroll to top on a sort switch, view from the URL.
- `src/routes/_authed.tsx` and/or `src/routes/_authed/index.tsx` -- search validation and URL fixing with `replace`.
- `scripts/fake-qbit.mjs` -- fake extra fields.
- `e2e/smoke.spec.ts` -- menu smoke with an extra sort; existing tests stay green.

**Acceptance Criteria:**
- Given the desktop app with fake data, when Alex opens the sort menu, expands 更多 and picks a field, then the list re-sorts, the pill shows the new name and arrow, and the big numbers follow the sort, with 0 CSP violations and 0 console errors in the browser smoke.
- Given any `getMaindata` or `getSortKeys` response, then no full tracker URL, passkey or magnet appears, and `getMaindata`'s fields are exactly as before this story.
- Given `npm run lint`, `npm run typecheck`, `npm test`, `npm run build`, `npm run smoke`, `npm run smoke:browser` and `check.sh`, then all pass.
- Given the PR, then it carries the 51-field table (Chinese name, group, default direction, direction words, big-number kind), each derived field's formula, the perf measurement method and numbers, the doc URLs read, and desktop light and dark screenshots: menu collapsed, 更多 expanded, an item under 更多 selected; list sorted by seeding time, ratio, name, save path and hash.

## Spec Change Log

## Review Triage Log

### 2026-11-16 Review pass
- verdicts: 32 findings: high 0, medium 6, low 20, false 2, maybe-false 4
- findings:
  - `[maybe-false]` `[reject]` (intent) story text says widen the slim table; the diff fetches on demand. Alex's 2026-11-16 decision in AD-6 overrides the AC; epics.md keeps the old wording, the spine wins. If true, low.
  - `[low]` `[patch]` (intent) special-value decisions (ratio -1, negative limits) live in sort-values.ts, not format.ts (AD-13). Patch: moved into format.ts.
  - `[maybe-false]` `[reject]` (intent) the 100 ms budget is measured only for slim sorts; extra sorts wait on a round trip. The skeleton covers the wait; network latency is outside the sort budget. If true, low.
  - `[low]` `[reject]` (intent) `?sort=state` renders a list until Story 2.3. The menu item is disabled; Story 2.3 replaces it with the board.
  - `[low]` `[patch]` (intent) `last_activity` and `seen_complete` use dates, but EXPERIENCE writes 最後有人抓/最後更新 as time ago. Patch: relative-time kind.
  - `[low]` `[reject]` (intent) PR deliverables cannot be judged from the diff. Handled in the PR body.
  - `[medium]` `[patch]` (blind) sort-key deltas include every torrent with any changed extra, not only the requested field. Patch: per-field change versions.
  - `[medium]` `[patch]` (blind) flooring time_active and seeding_time before subtracting breaks avg_dlspeed. Patch: raw values for derived math, quantized copies for change detection.
  - `[low]` `[patch]` (blind) a hash missing from loaded keys shows 沒有 and sorts last. Patch: not-loaded renders the skeleton; sorting for up to one poll stays last (accepted).
  - `[low]` `[reject]` (blind) two qBittorrent pulls per 5 s while an extra sort is active. LAN call from the container, 1 s pull reuse already bounds it.
  - `[medium]` `[patch]` (blind) first getSortKeys failure holds the order forever with skeletons. Patch: stop holding on error without data, show 沒有.
  - `[low]` `[reject]` (blind) limit sentinels -1 and -2 both read 沒有. Distinguishing them needs new UI wording (design); listed under Claude 代決 in the PR.
  - `[low]` `[patch]` (blind) tracker `''` flips the domain to null and back. Patch: keep the last known domain.
  - `[low]` `[reject]` (blind) `dir=desc` means A to Z for text in the URL. Documented convention tied to the arrow; ids and dirs stay consistent for Epic 3.
  - `[false]` `[reject]` (blind) eta, priority, reannounce default to large first. EXPERIENCE: 其他數字欄位 大的在前.
  - `[low]` `[patch]` (blind) menu items announce the digit and arrow. Patch: `aria-hidden` on both.
  - `[low]` `[patch]` (blind) flipping the direction leaves the scroll mid-list. Patch: scroll to top on a flip too (epic rule: changing sort scrolls to the top).
  - `[false]` `[reject]` (blind) AD-11 record not versioned. Fix edits this build's spec.
  - `[low]` `[patch]` (blind) ratio sort loses the good colour. Patch: carry `good` into the big value.
  - `[maybe-false]` `[reject]` (blind) comment may carry a tracker token. Alex allowed comment through getSortKeys (AD-6); settling needs a look at real comments. If true, medium; noted in the PR.
  - `[low]` `[reject]` (blind) brittle e2e selectors and a wall-clock perf test. Sorting takes about 6 ms against 100 ms; selectors fail loudly.
  - `[medium]` `[patch]` (verification-gap) `replace` on sort changes and URL fixes is never checked. Patch: history length and goBack assertions in e2e.
  - `[medium]` `[patch]` (verification-gap) big-value cell rendering (rtl path, muted, hash font, title) untested. Patch: markup tests.
  - `[low]` `[defer]` (verification-gap) phone pill only rendered with the default sort. Story 2.2 replaces the pill.
  - `[medium]` `[patch]` (edge) first getSortKeys failure holds forever. Same patch as the blind row.
  - `[low]` `[reject]` (edge) switching to an extra sort with an older cache orders by old keys until the refetch. Cache lives at most gcTime; fresh keys follow within one poll.
  - `[low]` `[patch]` (edge) the disabled placeholder observer keeps the `time_active` cache alive. Patch: non-colliding disabled key.
  - `[low]` `[patch]` (edge) missing hash shows 沒有. Same patch as the blind row.
  - `[low]` `[patch]` (edge) `?sort=state&dir=asc` reverses the non-directional sort. Patch: dir ignored for non-directional fields.
  - `[low]` `[patch]` (edge) full_update keeps stale extras. Patch: start from empty extras.
  - `[low]` `[patch]` (edge) null or wrong-typed extra keeps the old value. Patch: catch to null.
  - `[maybe-false]` `[reject]` (edge) phone pill text now follows the sort although the spec says unchanged. It stays disabled; following the sort is harmless. If true, low.

### 2026-11-16 Review pass (follow-up)
- verdicts: 36 findings: high 0, medium 5, low 25, false 2, maybe-false 4
- findings:
  - `[low]` `[reject]` (intent) `dir=desc` means the arrow, so text desc is A to Z. carried.
  - `[maybe-false]` `[reject]` (intent) delta per field vs any field. Per-field reading implemented in the first pass; matches "for that one field". If true, low.
  - `[false]` `[reject]` (intent) avg formula differs from the contract's summary. The contract cites VueTorrent v2.37.0 as the source; the source formula is implemented and recorded.
  - `[low]` `[reject]` (intent) 不限速 only for speed limits. Literal meaning of 不限速; other unset limits read 沒有.
  - `[low]` `[reject]` (intent) name-sort progress is 18px, status word 13px. Matches the big-number table (數字 vs 狀態用語).
  - `[low]` `[reject]` (intent) bad params fall back one by one. Keeps a valid sort; the contract's default applies to the bad param.
  - `[low]` `[reject]` (intent) flip also scrolls to top. carried: patched in the first pass per the epic rule.
  - `[medium]` `[patch]` (intent) first-load failure jumps to tie order, against S4 "previous order kept". Patch: hold keeps the shown order, drops removed and adds new hashes on top.
  - `[low]` `[reject]` (intent) `ago` kind for last_activity, seen_complete. carried: EXPERIENCE names them as time ago.
  - `[low]` `[reject]` (intent) pill aria-label adds 列表. Tooltip matches the example; the label keeps the view name from Epic 1.
  - `[low]` `[reject]` (intent) no-value decisions in `average()` and `trackerDomainOf`. S10 itself asks `trackerDomainOf` to return null; a zero duration is not a qBittorrent sentinel.
  - `[low]` `[reject]` (intent) S12 repaint measured by hand. Recorded with method and numbers for the PR.
  - `[low]` `[reject]` (intent) S9 not in e2e. Covered by DOM and reducer tests.
  - `[low]` `[reject]` (intent) menu sizes checked as class strings. Width measured in e2e; screenshots compared to S03.
  - `[low]` `[reject]` (blind) seeding_time comment stale. Same root cause as the verification-gap other finding; patched there.
  - `[false]` `[reject]` (blind) Auto Run Result count. Fix edits this build's spec.
  - `[low]` `[patch]` (blind) `pickSort` flips a non-directional field. Patch: no change for non-directional.
  - `[low]` `[patch]` (blind) `fixListSearch` leaves `dir` on state. Patch: dropped in the URL fix.
  - `[low]` `[reject]` (blind) sort-keys version shares the maindata version type. Only `useSortKeys` passes it; a mix-up cannot happen through the app.
  - `[low]` `[reject]` (blind) getSortKeys error paths untested. They share `pull()` with getMaindata, whose error paths are tested.
  - `[low]` `[reject]` (blind) no end-to-end leak check. The handler-level leak test covers every field; serialization adds nothing.
  - `[medium]` `[patch]` (blind) first-failure order jump. Same patch as the intent row.
  - `[low]` `[patch]` (blind) 更多 groups unnamed. Patch: `aria-labelledby` on each group.
  - `[low]` `[reject]` (blind) no keyboard or focus tests for the menu. Radix owns focus; e2e drives the real menu.
  - `[maybe-false]` `[reject]` (blind) S3 ratio-column selector may hit the big value. The big value's sr-only label is inside a different cell; settling needs a DOM dump. If true, low.
  - `[low]` `[reject]` (blind) merged sort keys keep removed hashes. Bounded by torrents seen in a session; ignored by the list.
  - `[low]` `[patch]` (blind) save-path sort shows the label but compares the full path. Patch: `title` is the full path.
  - `[low]` `[reject]` (blind) `setView` writes default params. Harmless; URLs stay valid.
  - `[medium]` `[patch]` (edge) `ago` values freeze until midnight. Patch: minute-ticking now for the ago kind.
  - `[medium]` `[patch]` (edge) hex hashes sorted by a numeric collator. Patch: plain comparison for hash kinds.
  - `[low]` `[patch]` (edge) total_size -1 shows 0 B. Patch: negative is no value.
  - `[maybe-false]` `[reject]` (edge) cached error skips the wait on a revisit. With the new hold the order stays until keys arrive. If true, low.
  - `[maybe-false]` `[reject]` (edge) phone pill text follows the sort. carried.
  - `[medium]` `[patch]` (verification-gap) the failure release of the hold is untested. Same patch as the intent row (new DOM test).
  - `[low]` `[defer]` (verification-gap) the `['sort-keys', null]` placeholder key is unpinned. Filed as defer.
  - `[low]` `[patch]` (verification-gap other) `seeding_time` comment stale. Patch: comment fixed.

## Design Notes

- Docs to read first (AD-11), matching locked versions: Radix DropdownMenu `https://www.radix-ui.com/primitives/docs/components/dropdown-menu` (check `modal`, `onSelect` with `preventDefault` to keep it open, `DropdownMenu.RadioGroup`/`RadioItem`); shadcn dropdown-menu `https://ui.shadcn.com/docs/components/dropdown-menu`; TanStack Router search params `https://tanstack.com/router/latest/docs/framework/react/guide/search-params` and validation with zod; TanStack Query polling `https://tanstack.com/query/v5/docs/framework/react/reference/useQuery`; VueTorrent v2.37.0 source for derived fields (`https://github.com/VueTorrent/VueTorrent/tree/v2.37.0`). Record the URLs actually read here.
- URLs actually read (2026-11-16): `https://www.radix-ui.com/primitives/docs/components/dropdown-menu` (`modal`, `onSelect`, RadioGroup/RadioItem, `--radix-dropdown-menu-content-available-height`; that `onSelect` with `preventDefault` keeps the menu open was confirmed in the installed `@radix-ui/react-menu` source and by the S6 tests), `https://tanstack.com/router/latest/docs/framework/react/guide/search-params` (zod v4 schema straight into `validateSearch`, `.catch`, `useSearch`), `https://raw.githubusercontent.com/VueTorrent/VueTorrent/v2.37.0/src/composables/TorrentBuilder.ts`, `https://raw.githubusercontent.com/VueTorrent/VueTorrent/v2.37.0/src/helpers/text.ts`. shadcn dropdown-menu and the TanStack Query `useQuery` reference were not fetched again; the wrapper follows the repo's existing shadcn `dialog.tsx` pattern and the polling follows `src/state/maindata.ts`.
- Implementation notes: VueTorrent v2.37.0 computes the average download speed as `downloaded / (time_active - seeding_time)` (upload: `uploaded / time_active`); `src/lib/sort-values.ts` follows the source, so the extras table also keeps `seeding_time` floored to 60 s. A zero or negative duration has no average (VueTorrent divides by -1). VueTorrent's `getDomainBody` also drops the top-level domain; `tracker_domain` here is the whole hostname, per row S10. `dir=desc` is the arrow ↓ and the field's first direction word for every field (for text that is A to Z), so every default direction is `desc`. `?sort=state` is valid and sorts the list by the board's column order with the status word as the big number until Story 2.3. Perf (S12): `selectVisibleTorrents` on 4165 torrents takes about 1.3 to 6.5 ms per sort in vitest (`S12` test, 4 runs); in headless Chromium on the built app with `data=many`, click on a menu item to the next frame after the list's DOM changed (MutationObserver plus `requestAnimationFrame` and a 0 ms timeout) took 10.6 to 18.2 ms over 20 switches between 做種時間, 分享率, 加入時間 and 完成時間.
- Alex's decisions (2026-11-16): tracker only as hostname, full tracker URL and magnet never leave the container; extra fields fetched on demand through `getSortKeys` instead of widening the slim table. Both are in AD-6 and the architecture memlog.
- Claude 代決 (Alex may veto): sort ids are qBittorrent names, derived ones snake_case (`avg_dlspeed`, `global_volume`, `tracker_domain`, `content_path_basename`); churn quantization steps (60 s; 2 decimals); keys-loading state keeps the previous order with a skeleton big number; booleans sort 是 first by default; the top-5 fields that also belong to a group are listed only in the top 5.

## Verification

**Commands:**
- `source ~/.nvm/nvm.sh && nvm use && npm run lint && npm run typecheck && npm test` -- expected: all pass.
- `source ~/.nvm/nvm.sh && nvm use && npm run build && npm run smoke && npm run smoke:browser` -- expected: all pass.
- `bash .claude/skills/next-story/check.sh` -- expected: every line ok.

## Auto Run Result

Status: done

**Summary:** 51 sort ids in `src/shared/sort-fields.ts`; `sort`/`dir` in the URL with zod and `replace` fixes; `selectVisibleTorrents` sorts by the view (missing last, ties by added_on then hash); extra fields kept in a second container table (per-field change versions, quantized change detection, tracker reduced to its hostname at parse time) and served by the gated `getSortKeys({ field, since })`; browser `['sort-keys', field]` polling only while active; enabled desktop pill and non-modal Radix sort menu (更多 expands in place, flip keeps it open, switch closes it, both scroll to the top); big number follows the sort; fake-qbit supplies every extra field.

**Review:** 32 findings. Patched 6 medium entries (per-field deltas, avg speed quantization, first-load failure hold, replace untested, big-value rendering untested; the edge duplicate of the failure hold) and 14 low items. Deferred 1 (phone pill rendering, Story 2.2). Rejected the rest with reasons in the triage log. Extra fix found by the new flip check: router scroll restoration undid the scroll reset; sort navigation now passes `resetScroll: false`.

**Follow-up review recommendation:** true (two or more medium entries patched on a first pass). Unverified risk: the per-field version bookkeeping in the extras table and the new error and not-loaded paths were added in one patch round.

**Verification:** lint, typecheck clean; `npm test` 70 files, 1332 tests; build, smoke ok; `CI=1 npm run smoke:browser` 11 of 11; routeTree unchanged; npm audit 0; check.sh all ok. Perf: re-sort of 4165 torrents 1.3 to 6.5 ms in vitest; menu click to redraw 10.6 to 18.2 ms in headless Chromium on the built app.

**Residual risks:** real qBittorrent 5.1.4 sentinel values for each extra field were not read from the NAS; Chinese names for fields VueTorrent has no Chinese text for need Alex's review; a private tracker's comment may carry a token (Alex allowed comment through getSortKeys).

### Follow-up pass (2026-11-16)

Patched: `ago` values tick every minute (medium); hash kinds compare by code units (medium); a failed first keys call keeps the shown order with new torrents on top (medium); negative `total_size` is no value; `?sort=state` drops `dir` in the URL fix; `pickSort` ignores a non-directional field; `seeding_time` comment; save-path `title` is the full path; 更多 groups named. Deferred: the `['sort-keys', null]` placeholder is not pinned by a test. Follow-up review recommendation: false (no high patched on a follow-up pass). Verification: lint, typecheck clean; `npm test` 1341 pass; build, smoke ok; `CI=1 npm run smoke:browser` 11 of 11; check.sh all ok.
