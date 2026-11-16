---
title: 'Story 2.3: Board: 5 desktop columns and phone status tabs'
type: 'feature'
created: '2026-11-17'
status: 'done'
baseline_revision: '1da359bb4e8bcfc8a5455e87014676bf534917d0'
review_loop_iteration: 0
followup_review_recommended: false
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-2-context.md'
  - '{project-root}/_bmad-output/planning-artifacts/architecture/architecture-react-torrent-2026-11-15/ARCHITECTURE-SPINE.md'
  - '{project-root}/_bmad-output/implementation-artifacts/spec-2-2-bottom-sheet-phone-sort-sheet.md'
warnings: ['oversized']
deferred: []
---

<intent-contract>

## Intent

**Problem:** The 「狀態」 sort is disabled and there is no board, so Alex cannot see at a glance which stage each torrent is in (the VueTorrent replacement's default daily view). The default with no `sort` in the URL is still 「加入時間」.

**Approach:** Enable 「狀態」 and make it the default. 「狀態」 renders a board instead of the list: on desktop (from 1024px) 4 equal work columns plus a 64px collapsed 「已整理」 column that expands on click; on phone 4 status tabs with one column at a time and swipe between them. Column membership comes from `classify()`, per-column order from one `src/lib` selector next to `selectVisibleTorrents`.

## Boundaries & Constraints

**Always:**
- Sort pill and menus: 「狀態」 is selectable in the desktop menu and the phone sheet; picking it shows the board. `DEFAULT_SORT_VIEW` becomes `{ sort: 'state', dir: <state's default> }`. Desktop pill reads 「看板｜排序：狀態」 (the capsule shows the board icon and 「看板」 instead of 「列表」; no arrow); phone pill 「▦ 狀態 ▾」 (board icon, no arrow). `aria-label` and tooltip end with 「看板」 instead of 「列表」 in board mode. Switching board and list (any sort change) scrolls back to the top.
- Column order (AR-41, AD-13): `selectBoardColumns(maindata)` (name may differ) in `src/lib/visible-torrents.ts` returns the hash arrays of the 5 columns; the column is `classify()`'s `column` (via `statusOf` + the same mapping, never `torrent.state`). Orders: 要處理 (`attention`) `last_activity` newest first; 下載中 `added_on` newest first; 做種中 `seeding_time` longest first; 完成 `completion_on` newest first; 已整理 `completion_on` newest first. Missing values (0, negative) last; ties by `added_on` newest then `hash` ascending (same tie rule as `selectVisibleTorrents`). No `sort()` in any `src/features` file. vitest covers each column's order, missing values and ties.
- `last_activity` joins the slim table (`src/shared/maindata.ts`, AR-37 "fields the screen uses"), stored floored to whole minutes like `seeding_time` (same churn reason); its sort field moves from `'extra'` to `'slim'` source; remove it from the extras schema/table/fake data unless something else still needs it; container table, raw maindata schema, merge and `scripts/fake-qbit.mjs` follow.
- Counts: each work column header shows its count; 「全部」 (`countAll`) never counts 已整理. With only archived torrents: 全部 0, the 4 columns say 「沒有」, 已整理 column as usual.
- Board is never frozen (EXPERIENCE 排序和檢視 line 251: "看板不受影響"): it renders the live columns, not `useFrozenOrder`; it does not set `pointerInList`. Cards are keyed by hash and `memo`.
- Desktop (≥1024px, mockup S01-list-desktop): 4 equal work columns in order 要處理, 下載中, 做種中, 完成, then the 64px 已整理 column; gap 14px; column `surface-muted`, radius 22px, padding 12px. Header: 28px status circle, column name (`column-title`), muted count; header `title` tooltip says the order (「最新出問題的在前」「新加入的在前」「做種最久的在前」「剛完成的在前」, 已整理 「完成時間新的在前」), not clickable. Board fills `main`'s height; each column scrolls itself, virtualized with `@tanstack/react-virtual`: with `data=many` each column has fewer than 60 cards in the DOM.
- 已整理 column collapsed: 28px grey archive-box circle, count (12px, `text-muted`), vertical 「已整理」 (14px/700, `writing-mode: vertical-rl`); a focusable button (`aria-expanded`), hover adds a 1px `text-faint` inset ring. Click or Enter expands it into a normal column equal to the other four, ordered as above; clicking its header collapses it again (Claude 代決 in the epic).
- Card (UX-DR29): `surface`, radius 16px, padding 12px 14px, card shadow. Row 1: 32px status circle (progress ring for downloading/paused/stalled, as in rows), one-line name with `title` = full name, `card-value` percent at the right only for downloading, paused, stalled. Row 2: remaining time and speed, or `classify()`'s detail (「卡在 87%，沒有來源」「今天 09:12 下載好了」, 「搬移中」 while moving). 4px progress bar for downloading, paused, stalled. Bottom: category tag and location tag (last two path segments). Names and reasons are plain JSX text. Cards are not clickable yet (2.4), no checkbox (Epic 4).
- Empty column: stays, says 「沒有」; 要處理 empty says 「都沒問題」.
- First load with 「狀態」: card-size skeletons (desktop a few per column, phone one column), no spinner, no 「載入中…」. Load error and the all-empty state reuse the list's existing states (`ListLoadError`, `ListEmpty`) unchanged.
- Phone (<1024px, mockup S02 board frame): a 4th top row with status tabs (UX-DR25): 4 equal cells, gap 6px, height 56px, inside a `surface-muted` bar with radius 16px and padding 4px; each cell an 8px status-colour dot plus `stat-value` count, under it the name in `tag` 11px; selected cell `surface`, radius 14px, card shadow, name `text` 700. No 已整理. `role="tablist"`/`tab`/`tabpanel` with arrow-key movement. Content shows one column, one card per row; tapping a tab or swiping left/right changes column; vertical scrolling is never taken as a swipe (`touch-action: pan-y`, horizontal intent decided after a slop); the track follows the finger and settles with `transform` only; `prefers-reduced-motion` switches without animation. Selected phone column is component state (starts at 要處理, Claude 代決). No horizontal page scroll at 390px.
- Board lives in `src/features/board/` (spine line 340); the route `src/routes/_authed/index.tsx` picks board or list by `view.sort === 'state'`. Features never import each other: the status circle (and tag pieces both need) move to `src/shared/ui/`; a status-id type both `src/lib` and `src/shared` need lives in `src/shared`.
- 0 CSP violations and 0 console errors in the browser smoke; no `<style>` injection; inline styles only through React `style`/CSSOM.
- UI text exactly as given; no em dash; `check.sh` before every commit; fake data only (AD-15).

**Never:**
- No auto-collapse on scroll (Story 2.8), no ring spin-in or card entrance (2.9), no card click or detail panel (2.4), no checkboxes or selection (Epic 4), no per-category remembered sort (Epic 3), no `↑` `↓` keys.
- No new runtime dependency, no gesture or animation package, no CSP change.
- No `sort()` or `torrent.state ===` in features; no copy of `classify()` logic.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| K1 default | URL without `sort` | board; pill 「看板｜排序：狀態」 | n/a |
| K2 switch | board, pick 做種時間 | list, `main` at top; back to 狀態: board at top | n/a |
| K3 order | torrents per column with ties and missing values | each column in its rule, ties `added_on` then `hash` | n/a |
| K4 attention | stalled + error torrents, different `last_activity` | newest activity first | `last_activity` 0: last |
| K5 archived | non-private `missingFiles` | only in 已整理 column; not in 全部 or column counts | n/a |
| K6 only archived | `data=archived` | 全部 0, 4 columns 「沒有」, 已整理 count and expand work | n/a |
| K7 empty attention | no stalled/error | 要處理 says 「都沒問題」 | n/a |
| K8 expand | click/Enter on 已整理 | expands equal width; header click collapses; focus stays sensible | n/a |
| K9 many | `data=many` | each column < 60 cards in DOM, scrolls itself | n/a |
| K10 live | poll moves a torrent between columns while mouse rests on the board | moves at once | n/a |
| K11 skeleton | `['maindata']` not loaded, sort 狀態 | card skeletons, no spinner | n/a |
| K12 phone tabs | 390px, tap 做種中 tab / swipe left | that column shows; swipe follows finger; vertical scroll unaffected | n/a |
| K13 reduced motion | prefers-reduced-motion | tab change jumps | n/a |
| K14 load error / empty | first load fails / no torrents | existing list error / empty states | n/a |

</intent-contract>

## Code Map

- `src/lib/visible-torrents.ts` -- `selectVisibleTorrents`, `tieBreak`, `countAll`, `isVisible`; add the board selector here and reuse the comparator. `src/lib/torrent-status.ts` -- `classify`, `statusOf`, `BoardColumn`, `COLUMNS` (export a `columnOf(status)` if needed instead of duplicating the map).
- `src/shared/maindata.ts` -- slim schema (add `last_activity`); `src/server/sync/torrent-table.ts:21` `SEEDING_TIME_STEP_S` floor pattern; `src/server/qbit/maindata-schema.ts` raw schema; `src/shared/sort-keys.ts:31` and `src/server/sync/extras-table.ts` (remove `last_activity` extra); `src/shared/sort-fields.ts:145` source change; `src/lib/sort-values.ts` slim values; `src/lib/maindata-merge.ts`; `scripts/fake-qbit.mjs` (fields and, if needed, a data mode with an empty 要處理 column; document it in the header comment); `scripts/smoke-built-server.mjs` / `smoke-image.mjs` if they assert the field list.
- `src/shared/list-search.ts:20-26` `DEFAULT_SORT_VIEW` and its comment; tests that assume the added-time default.
- `src/features/header/sort-menu.tsx:90` and `sort-sheet.tsx:150` `disabled={id === 'state'}` (remove); `sort-model.ts` `sortPillModel` (view word 列表/看板; text 「排序：狀態」); `sort-sheet.tsx` `PhoneSortPill` icon; `app-shell.tsx` (pill placement unchanged).
- `src/routes/_authed/index.tsx` -- choose `<TorrentBoard />` or `<TorrentList />`.
- `src/features/list/status-circle.tsx`, `list-model.ts:45-46,242` ring math, `torrent-row.tsx` tag markup -- move circle (sizes 28, 32, 36 by prop) to `src/shared/ui/status-circle.tsx`; list imports it from there.
- `src/features/list/torrent-list.tsx` -- virtualizer pattern (stable `getItemKey`, `useFlushSync: false`); `list-states.tsx` (`ListSkeleton`, `ListEmpty`, `ListLoadError`, `LIST_SECTION_CLASS`).
- `src/state/maindata.ts:181` `useVisibleTorrents` pattern for a `useBoardColumns()` hook; `src/state/maindata-failure.ts`, `maindata-retry.ts`.
- `src/styles.css` -- tokens; add missing ones (column radius 22px, card radius 16px, `column-title`, `card-value`, `stat-value`, `tag` text styles, card shadow) from the UX DESIGN.md frontmatter.
- `src/shared/ui/sheet-drag.ts` -- existing pointer-event drag helpers; reuse ideas (slop, velocity) for the phone swipe, not the sheet code itself.
- `e2e/smoke.spec.ts`, `e2e/fixtures.ts` -- existing tests open `/` and expect list rows: they must pass a list sort (e.g. `?sort=added_on`) or assert the board. Add board checks and screenshots.
- UX: `EXPERIENCE.md:83-87,101` (components), `:240-251` (排序和檢視), `:337-338,344` (states), `:472-477` (responsive); UX `DESIGN.md` Components board-column, board-card, status-tabs; mockups `S01-list-desktop.dc.html`, `S02-*` board frame, `S01-loading-desktop`, `S02-loading-phone`.

## Tasks & Acceptance

**Execution:**
- `src/shared/maindata.ts`, container table, raw schema, extras, sort-fields, sort-values, fake-qbit (+ tests) -- `last_activity` in the slim table, floored to minutes.
- `src/lib/visible-torrents.ts` (+ test) -- board column selector (K3 to K7).
- `src/state/maindata.ts` (+ test) -- `useBoardColumns()` hook.
- `src/shared/list-search.ts` (+ tests) -- default 狀態.
- `src/shared/ui/status-circle.tsx` -- moved circle with size prop; update list imports and tests.
- `src/features/header/sort-model.ts`, `sort-menu.tsx`, `sort-sheet.tsx` (+ tests) -- enable 狀態, board pill text and icon.
- `src/features/board/` (board-model.ts + test, torrent-board.tsx, board-column.tsx, board-card.tsx, archived-column.tsx, status-tabs.tsx, board-swipe pure helper + test, DOM tests) -- desktop and phone board per Always.
- `src/routes/_authed/index.tsx` -- board or list.
- `src/styles.css` -- missing tokens.
- `e2e/smoke.spec.ts`, `e2e/fixtures.ts`, `scripts/fake-qbit.mjs` -- fix list tests for the new default; board smoke (default board, columns visible, 已整理 expand/collapse, `data=many` card cap per column, 0 CSP, no horizontal scroll at 390px, phone tab tap); screenshots at 1440 and 390, light and dark: board, 已整理 expanded, empty column, only archived, skeleton.

**Acceptance Criteria:**
- Given the app with fake data and no `sort`, then the board shows; desktop: 4 work columns plus collapsed 已整理, each in its order; phone: status tabs with one column; switching to another sort shows the list at the top.
- Given `data=many`, then each desktop column keeps fewer than 60 cards in the DOM and scrolls by itself.
- Given `npm run lint`, `npm run typecheck`, `npm test`, `npm run build`, `npm run smoke`, `npm run smoke:browser`, `check.sh`, then all pass.
- Given the PR, then it carries desktop and 390px light and dark screenshots of the board, 已整理 expanded, an empty column, only archived and the skeleton, with no horizontal scroll on phone, and a note that Alex checks the swipe on a real phone.

## Spec Change Log

## Review Triage Log

### 2026-11-17 Review pass
- verdicts: 32 findings: high 0, medium 0, low 23, false 7, maybe-false 2
- findings:
  - `[low]` `[patch]` (blind) K2 e2e never scrolls `main` before the switch, so its check cannot fail. Patch: scroll the list first, assert 0 after each switch.
  - `[low]` `[patch]` (blind) phone sheet K2 test skips the sheet-closed and scroll-to-top checks. Patch: both assertions added.
  - `[false]` `[reject]` (blind) phone board with only archived torrents is unhandled. EXPERIENCE says the 4 columns say 「沒有」 when only archived are left; the phone shows exactly that, and `total` includes archived so the empty block is not shown.
  - `[low]` `[reject]` (blind) swipe leaves `transition: none` if capture is lost without pointerup or cancel. Browsers fire up or cancel before lost capture; a tab tap resets it; rare, and the fix adds a handler.
  - `[low]` `[patch]` (blind) a drag past 25% then a strong flick back still changes column. Patch: an opposite flick keeps the column, vitest case.
  - `[low]` `[patch]` (blind) every poll gives `heights` a new array, so each column recomputes all positions. Patch: previous array kept when equal.
  - `[low]` `[patch]` (blind) desktop column bodies are not keyboard focusable. Patch: `tabIndex` 0 and the column name.
  - `[low]` `[reject]` (blind) 要處理 tooltip 「最新出問題的在前」 while the key is `last_activity`. The epic chose `last_activity` because qBittorrent has no "problem since" field; tooltip text is the mockup's.
  - `[low]` `[reject]` (blind) no 1024px browser check. Grid columns use `minmax(0,1fr)` and cannot overflow; text truncates; screenshots cover 1440.
  - `[low]` `[patch]` (blind) crossing 1024px at runtime is untested. Grouped with the verification-gap row below.
  - `[low]` `[patch]` (blind) the e2e title claims K14 without checking it. Patch: title fixed; K14 stays covered by the DOM test.
  - `[low]` `[reject]` (blind) the reused empty and error blocks announce 「種子列表」 on the board. The spec reuses them unchanged; the wording is still true of the content.
  - `[low]` `[reject]` (blind) the board re-renders once a minute for the day clock. Memoized cards skip; a few components per minute is negligible.
  - `[low]` `[patch]` (blind) a long unwrapped comment line in sort-menu.tsx. Patch: rewrapped.
  - `[low]` `[reject]` (blind) `ADDED_NEWEST` placed above section comments in two test files. Cosmetic, test-only.
  - `[false]` `[reject]` (blind) card-list cites TanStack Virtual docs at `/latest/`. TanStack Virtual docs are not versioned per release; the list (torrent-list.tsx) cites the same page.
  - `[low]` `[reject]` (blind) `STATUS_RANK` unreachable from the UI. `selectVisibleTorrents` still accepts 狀態 (detail ordering in 2.4 may use it); harmless.
  - `[false]` `[reject]` (intent) column header padding differs from the 12px token. The mockup header is padding 14px 16px 8px; the 12px token is the body, which uses it.
  - `[low]` `[reject]` (intent) smooth scrolling approximated by DOM counts and selector timing. Alex checks on a real phone per the AC.
  - `[low]` `[reject]` (intent) phone tabs sit inside `main`, not the header. `main` does not scroll in board mode, so they render as the 4th row the design describes.
  - `[false]` `[reject]` (intent) bottom-of-column skeleton missing. The AC makes it conditional on batch drawing; virtualized columns never batch.
  - `[low]` `[reject]` (intent) a `dir` without `sort` is now dropped. Follows from 狀態 having no direction; tested.
  - `[false]` `[reject]` (intent) PR screenshots and phone acceptance not in the diff. Handled by the next-story flow (screenshots commit and PR).
  - `[false]` `[reject]` (intent) shared refactors beyond the AC. Required by the lint layer rules (features cannot import each other); spec Always names the move.
  - `[false]` `[reject]` (intent) no e2e covers the default route as a list. The default route is the board now; list tests open `?sort=added_on`.
  - `[low]` `[patch]` (verification-gap) breakpoint crossing while mounted never tested. Patch: e2e resize 1440 to 390 and back without reload.
  - `[low]` `[patch]` (verification-gap) a height change inside a column is never checked for card positions. Patch: DOM test asserting the next card's `translateY`.
  - `[maybe-false]` `[reject]` (verification-gap other) `last_activity` is now strict; a missing or bad value fails the answer. qBittorrent 5.1.4 always sends it on new torrents; same contract as every other slim field (`seeding_time`). If true, low.
  - `[low]` `[patch]` (edge) a mouse press released outside while pending leaves a pending drag. Patch: end on `buttons === 0`, as the 2.2 sheet.
  - `[low]` `[reject]` (edge) focus on a tabpanel drops to body when a swipe makes it inert. Touch swipes do not focus panels; keyboard users change tabs with arrows; the fix adds a branch.
  - `[low]` `[patch]` (edge) board-card uses truthiness of the `stateBeforeMove` entry while `cardHeightOf` reads the map. Patch: `!== undefined`.
  - `[maybe-false]` `[reject]` (edge) `last_activity` null or non-number now fails the parse. Same as the verification-gap row; settled by qBittorrent always sending a number. If true, low.

## Design Notes

- Claude 代決 (Alex may veto): `last_activity` is added to the slim table instead of fetching it through `getSortKeys` while the board shows: the board is the default view, so an extra poll would run almost always; floored to minutes like `seeding_time`. The phone board starts on the 要處理 tab each time it mounts (no remembered tab until Epic 3). Card tags: category tag only when the torrent has a category.
- UX digest (values from UX `DESIGN.md` and mockups; most tokens already exist in `src/styles.css`: `bg-surface-muted`, `--radius-card` 16px, `--radius-panel` 22px, `--radius-row` 14px, `--radius-bar` 9px, `--spacing-board-gap` 14px, `--spacing-card-padding`, `--shadow-card`, `text-column-title`, `text-stat-value`, `text-tag`, `text-card-value` (22px phone, 17px desktop), `hover-ring`, `animate-skeleton`; sizes like 64px, 56px, 8px use arbitrary values):
  - Desktop grid (mockup S01-list-desktop): `grid-template-columns: repeat(4, minmax(0,1fr)) 64px` (expanded 已整理: `repeat(5, minmax(0,1fr))`), one row `minmax(0,1fr)`, gap 14px. Column `<section aria-label="下載中，4 個">`, `surface-muted`, radius 22px, flex column, overflow hidden. Header `<h2 title="新加入的在前">`: flex, gap 8px, padding 14px 16px 8px; circle 28px, name, count in `text-muted` weight 400 tabular. Body: own `overflow-y:auto`, `scrollbar-width: thin`, padding 4px 12px 12px, card gap 10px. Empty body: `<p>` padding 20px 0, centred, 13px, `text-muted`.
  - Collapsed 已整理: `<section aria-label="已整理欄">` containing `<button aria-label="展開已整理欄，3,737 個" title="完成時間新的在前" aria-expanded>`: flex column, centred, gap 10px, padding 14px 0; 28px `status-archived` circle with the archive-box icon, count 12px `text-muted`, `<span>` 「已整理」 `writing-mode: vertical-rl`, 14px/700, letter-spacing .08em.
  - Card: flex column, gap 8px. Row 1 flex, gap 10px, `align-items: flex-start`: circle 32px (ring radius 14.5, stroke 3, inner circle radius 12.8, 13px icon), text column gap 2px (name `text-row-name` ellipsis with `title`; second line `text-meta` `text-muted` tabular), percent `text-card-value`. Progress bar 4px, radius 9px, `track` background, status-colour fill (static width in this story; the fill animation is 2.9). Tags row gap 6px, wraps: category tag (1px `border`, `text-muted`, radius full, padding 1px 8px, `text-tag`) and location tag (same plus a 12px folder icon, gap 4px; reuse the list row's location label and its media-library variant if the list already has one).
  - Skeleton (S01-loading-desktop, S02-loading-phone): card box with 32px circle, bars 88%x12 and 52%x10, a 34x16 block; header count placeholder 24x12; existing `animate-skeleton`.
  - Phone tabs: `<div role="tablist" aria-label="狀態">` grid `repeat(4, minmax(0,1fr))`, gap 6px, padding 4px, `surface-muted`, radius 16px; each `role="tab"` `aria-label="下載中，4 個"`, height 56px, radius 14px, column centred; top line gap 5px: 8px dot SVG plus count `text-stat-value` tabular; bottom line name `text-tag`. Selected: `surface`, `shadow-card`, name `text` 700; others transparent, name `text-muted` 400. Panel `role="tabpanel" aria-label="下載中"`, card gap 10px.
  - Pill icons: 看板 is a custom 16px SVG of three top-aligned bars (`rect x=3 w=5 h=16`, `x=10 w=5 h=11`, `x=17 w=4 h=7`, all `rx=1.5`, stroke-width 2.2, 24x24 view box); 列表 stays lucide `List`. Mockup aria-label 「排序：狀態，看板」, title 「排序：狀態」.
- Claude 代決 (Alex may veto), motion: the UX docs give no tab-change timing; the phone track settles in 0.3s `cubic-bezier(.2,.8,.2,1)` (the detail panel's curve), transform only; a swipe changes column when it passes 25% of the width or a flick above about 0.5 px/ms (same velocity rule as the sheet), never past the first or last column (rubber-band to rest).
- Virtualized columns draw only what is visible, so there is no batch loading and no bottom skeleton (the AC's batch skeleton applies only "如果實作有分批畫").
- Docs to read first (AD-11): TanStack Virtual 3.14 virtualizer API (`https://tanstack.com/virtual/latest/docs/api/virtualizer`), MDN `touch-action`, `writing-mode`, WAI-ARIA tabs pattern (`https://www.w3.org/WAI/ARIA/apg/patterns/tabs/`). Record the URLs actually read.
- URLs actually read (2026-11-17): `https://tanstack.com/virtual/latest/docs/api/virtualizer` (`getScrollElement`, `estimateSize`, `getItemKey`, `gap`, `paddingStart`/`paddingEnd`; the scroll element's size is read from `clientWidth`/`clientHeight`, confirmed in the installed `@tanstack/virtual-core` source), `https://developer.mozilla.org/en-US/docs/Web/CSS/touch-action` (`pan-y` leaves horizontal drags to pointer events; the value is read when the gesture starts and intersected only up to the nearest scroll container, so each phone panel, itself a scroller, carries `touch-action: pan-y`; the browser sends `pointercancel` when it takes a vertical pan), `https://www.w3.org/WAI/ARIA/apg/patterns/tabs/` (arrow keys wrap, Home/End, automatic activation, `aria-controls`, a panel without focusable content gets `tabindex="0"`). `writing-mode` used from existing knowledge, not fetched.
- Claude 代決 (Alex may veto), implementation detail: card heights are fixed (89px, 101px with the progress bar; tags stay on one line and the location tag truncates), so the column virtualizer never measures; the 28px column header circle is decorative (`aria-hidden`; the section's `aria-label` names the column, and the mockup's 「錯誤」 label would misname 要處理, which also holds stalled torrents); with all four work columns empty, 要處理 says 「沒有」 like the others (EXPERIENCE State Patterns, only-archived row), otherwise 「都沒問題」; `data=calm` in `scripts/fake-qbit.mjs` gives an empty 要處理 for K7; the empty and load-error blocks moved to `src/shared/ui/list-blocks.tsx` (features never import each other), `useDayClock` to `src/state/now.ts`, `DESKTOP_QUERY` and `useIsDesktop` to `src/shared/ui/breakpoint.ts`, `TorrentStatusId` to `src/shared/torrent-status.ts`.

## Verification

**Commands:**
- `source ~/.nvm/nvm.sh && nvm use && npm run lint && npm run typecheck && npm test` -- expected: all pass.
- `source ~/.nvm/nvm.sh && nvm use && npm run build && npm run smoke && CI=1 npm run smoke:browser` -- expected: all pass.
- `bash .claude/skills/next-story/check.sh` -- expected: every line ok.

## Auto Run Result

Status: done

**Summary:** 「狀態」 is selectable and is the default with no `sort` in the URL; it renders the board in `src/features/board/` (route `src/routes/_authed/index.tsx` picks board or list). Desktop: 4 equal work columns, each scrolling and virtualized on its own, plus the 64px 已整理 strip that expands into a fifth equal column and collapses from its header. Phone: 4 status tabs (WAI-ARIA tabs, arrow keys, Home/End) and one column at a time with a hand-written swipe that moves only `transform` and skips animation under reduced motion. Column membership via `statusOf` + `columnOf`; orders from `selectBoardColumns` in `src/lib/visible-torrents.ts`; the board is live (never frozen). `last_activity` moved from the sort extras to the slim table, floored to minutes.

**Files:** `src/lib/visible-torrents.ts` (board selector), `src/lib/torrent-status.ts` (`columnOf`), `src/shared/maindata.ts`, `src/shared/sort-keys.ts`, `src/shared/sort-fields.ts`, `src/server/sync/*` (`last_activity` slim and floored), `src/shared/list-search.ts` (default 狀態), `src/shared/torrent-status.ts`, `src/shared/ui/status-circle.tsx` (moved, 28/32/36px), `src/shared/ui/list-blocks.tsx`, `src/shared/ui/breakpoint.ts`, `src/state/now.ts` (`useDayClock`), `src/state/maindata.ts` (`useBoardColumns`), `src/features/header/*` (狀態 enabled, board pill and icon), `src/features/list/*` (shared pieces imported from their new homes), `src/features/board/*` (new), `scripts/fake-qbit.mjs` (`last_activity`, `data=calm`), `e2e/board.spec.ts` (new), `e2e/smoke.spec.ts` and `e2e/fixtures.ts` (list tests open `?sort=added_on`).

**Review:** 32 findings (high 0, medium 0, low 23, false 7, maybe-false 2). Patched 11 low entries: K2 e2e and phone sheet K2 tests able to fail, opposite flick keeps the column, stable `heights` array, height-change position test, keyboard-focusable desktop column bodies, breakpoint-crossing e2e, K14 title, comment wrap, stale mouse drag cleared, `stateBeforeMove !== undefined`. Deferred: none. Rejected the rest with reasons in the triage log.

**Follow-up review recommendation:** false (no high or medium entries patched; patched counts: high 0, medium 0, low 11).

**Verification:** lint, typecheck clean; `npm test` 76 files, 1471 tests; build and smoke ok; `CI=1 npm run smoke:browser` 30 of 30, 0 CSP violations and 0 console errors; check.sh all ok. Matrix audit: K1 to K14 each covered by a passing vitest, DOM or e2e test.

**Residual risks:** the swipe is tested only with simulated touch in Chromium; Alex checks the feel on a real phone. `last_activity` is a strict slim field like `seeding_time`; a qBittorrent that omits it on a new torrent would fail the answer.

