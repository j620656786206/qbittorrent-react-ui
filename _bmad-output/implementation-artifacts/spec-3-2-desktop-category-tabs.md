---
title: 'Story 3.2: Desktop category tabs'
type: 'feature'
created: '2026-11-18'
status: 'done'
baseline_revision: '42beea66e8a2965a2562adb5e8109c73ca927a07'
review_loop_iteration: 0
followup_review_recommended: false
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-3-context.md'
  - '{project-root}/_bmad-output/planning-artifacts/architecture/architecture-react-torrent-2026-11-15/ARCHITECTURE-SPINE.md'
  - '{project-root}/_bmad-output/implementation-artifacts/spec-3-1-settings-file-all-remembered-sort.md'
warnings: ['oversized']
deferred: []
---

<intent-contract>

## Intent

**Problem:** The desktop header only has a fixed, inert 「全部」 tab, so Alex cannot narrow the list or board to one category, and the per-category remembered sort from Story 3.1 has nowhere to apply except 「全部」.

**Approach:** Add `category` to the URL search (zod, `replace`), carry it in the view into `selectVisibleTorrents` and the board, compute tab list, order and counts with `src/lib` selectors, render a scrolling row of pill tabs on desktop (≥1024px), and on a tab click switch the sort to that category's remembered one (else 「狀態」), scroll to the top, replay the Story 2.9 entrance and show 「（這個分類記住的）」 when the app changed the sort. Manual picks save per category through 3.1's op.

## Boundaries & Constraints

**Always:**
- URL: `category` in `src/shared/list-search.ts` (zod), every change with `replace`; absent means 「全部」 (`ALL`); the uncategorized key `''` needs an explicit encoding in the URL (Claude 代決: `category=` with an empty value; absent stays 「全部」). An invalid value, or a category no torrent has, falls back to 「全部」 and the URL is corrected with `replace` (only once maindata has answered; while loading, keep it).
- Filtering only in `selectVisibleTorrents(maindata, view)` (view gains `category`); uncategorized matches `''`; 「全部」 is everything; list mode still excludes 已整理; board columns and the 已整理 column count only the category. Features never filter or sort torrents.
- `src/lib` pure functions with vitest:
  - tab counts per category, excluding 已整理 (cases: a category, uncategorized, only 已整理 left gives 0);
  - tab order: 「全部」 first, then `categoryOrder` (settings), then the rest by name (locale compare, Claude 代決 `localeCompare(…, 'zh-Hant')`); a category with no torrent at all has no tab; a category with only 已整理 torrents keeps its tab with 0; the selected category keeps its tab while selected even after its last torrent is deleted or moved, and loses it once Alex leaves;
  - the hint: input (sort before, sort after, who changed it: `open`, `category-switch`, `manual`), output whether 「（這個分類記住的）」 shows; shows only after a `category-switch` whose sort differs from the one before; a manual pick hides it; the next switch decides again; first open or an equal sort shows nothing.
- Tabs (desktop only, UX-DR18, DESIGN category-tabs): pills, `rounded.full`; name then a lighter count; selected `accent` background with `accent-foreground` text and the count at 75% opacity; unselected `surface` background with `border`; names are plain text. The row scrolls horizontally with no visible scrollbar, a 24px `surface-page` to transparent fade on the right edge, never wraps; the selected tab scrolls into view on change; the sort pill stays fixed at the right and never shrinks its text. Tabs are buttons in a `tablist` with `aria-selected` (or the existing pattern from the inert 「全部」 tab); keyboard focus ring per the spine. Shortcut tooltips are Story 3.7.
- Tab click: URL `category` with `replace`; the sort becomes the category's remembered one (`categorySort[category]`), else 「狀態」; list and board scroll to the top; `replayEntrance()` (src/state/entrance.ts) runs after the new category's rows commit (its documented contract: from a layout effect keyed on the category); clicking the selected tab does nothing.
- Manual pick inside a category: `setCategorySort(category, sort, dir)` through 3.1's op (serial per category, failure toast per 3.1). The 3.1 "another device" follow rule applies to the current category's remembered value.
- Empty category (the selected one emptied while selected): list and board area show 「這個分類沒有種子」 with a disabled 「新增種子」 button (Epic 1 disabled-control pattern; adding is a later epic); a category with only 已整理 torrents shows the board's four columns as 「沒有」 and 已整理 as usual.
- Performance: with about 4,165 fake torrents (`many` data), a tab switch plus redraw finishes within 100 ms on the dev machine; the PR states the method (e.g. a Playwright script timing from click to the first frame with the new rows, or a Performance trace) and the numbers.
- Screenshots for the PR, desktop light and dark: tabs overflowing, the selected tab at the far right, 「（這個分類記住的）」 showing, the emptied-category state.

**Never:**
- No phone category list (Story 3.4; the phone keeps its current inert category button), no settings page or `setCategoryOrder` (3.3), no shortcut keys or tooltips (3.7), no search (3.5), no localStorage of the last category (3.6).
- No change to the settings schema; no `torrent.state ===`; no sorting or filtering in features.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Pick a tab | 「全部」 on 狀態, click mteam-X (remembered 做種時間 desc) | URL `category=mteam-X&sort=seeding_time&dir=desc` (replace), list sorted, top, entrance replays, hint shows | No error expected |
| No remembered sort | click a category never sorted | sort 「狀態」 (board); hint shows only if the sort before was not 狀態 | No error expected |
| Same sort | sort before equals the category's remembered | no hint | No error expected |
| Manual pick in a category | pick 分享率 in mteam-X | `setCategorySort('mteam-X', 'ratio', 'desc')`; hint gone | Toast per 3.1 on failure |
| Uncategorized | torrents with `category: ''` | tab 「未分類」 with its count; URL `category=` | No error expected |
| Only 已整理 | category whose torrents are all 已整理 | tab shows 0; list empty state; board 4 columns 「沒有」 | No error expected |
| Emptied while selected | last torrent of the selected category deleted | tab stays, 「這個分類沒有種子」; leaving removes the tab | No error expected |
| Bad URL | `category=nope` after maindata | 「全部」, URL fixed with replace | No error expected |
| Reload | `?category=mteam-X` | back on mteam-X with its sort | No error expected |
| Order | `categoryOrder: ['b']`, categories a, b, c | 全部, b, a, c | No error expected |
| Overflow | many categories | row scrolls, fade at right, selected scrolls into view, sort pill unchanged | No error expected |
| Names | `<script>` category name | shown as text | No error expected |

</intent-contract>

## Code Map

- `src/shared/list-search.ts` -- `listSearchSchema`, `sortViewOf(search, remembered)`, `fixListSearch` (3.1 made the fallback the remembered sort); add `category`.
- `src/routes/_authed.tsx` -- builds `view` from search plus `remembered` (`categorySort[ALL]` today via 3.1), `setView` / `pickView`, the follow hook; generalize "remembered" to the current category and add the tab switch.
- `src/lib/remembered-sort.ts`, `src/state/remembered-sort.ts` -- 3.1's follow rule; key it by the current category.
- `src/state/settings.ts` -- `useSettings`, `categorySortOp` (scope per category), `SORT_SAVE_OP`.
- `src/state/list-view.ts` -- `ListViewContext`; expose the category and a tab-switch action.
- `src/lib/visible-torrents.ts:21,81` -- `TorrentView = SortView`, `selectVisibleTorrents`; add the category filter; `isVisible` already excludes 已整理 for the list.
- `src/features/board/board-model.ts`, `torrent-board.tsx` -- board columns come from the same selector; check the 已整理 column respects the category.
- `src/features/header/app-shell.tsx:90-120,167-180` -- the inert 「全部」 tab and its count; becomes the tab row on desktop; `sort-menu.tsx` sort pill (desktop) gets the hint.
- `src/shared/maindata.ts:39,63-98` -- torrent `category`, the `categories` map (tabs come from torrents present, not this map).
- `src/state/entrance.ts:84` -- `replayEntrance()` and its calling contract.
- `src/features/list/list-states.tsx` -- empty states (add 「這個分類沒有種子」).
- `src/lib/prefs.ts` -- not used in this story.
- `scripts/fake-qbit.mjs` -- `sample` and `many` data have categories (mteam-X, mteam-tv, X and similar); add more categories if needed for the overflow screenshot (code names only).
- `e2e/fixtures.ts`, `e2e/settings-sort.spec.ts` -- settings reset fixture and save helpers to reuse.

## Tasks & Acceptance

**Execution:**
- `src/shared/list-search.ts` + tests -- `category` param, uncategorized encoding, fallback.
- `src/lib/` (e.g. `category-tabs.ts`, `remembered-hint.ts`) + tests -- counts, order, visibility (including the sticky selected tab), the hint function with every case.
- `src/lib/visible-torrents.ts` + tests -- category filter for list and board.
- `src/routes/_authed.tsx`, `src/state/list-view.ts`, remembered-sort modules + DOM tests -- tab switch (URL, remembered sort, top, entrance), per-category manual save, bad URL fix, reload.
- `src/features/header/` tabs component + sort pill hint + DOM tests -- rendering, selected styles, overflow fade, selected scrolls into view, plain-text names.
- empty category state in list and board + DOM tests.
- `e2e/category-tabs.spec.ts` -- pick a tab, sort follows its remembered value, reload keeps it, manual pick saves per category, CSP clean; writes the PR screenshots (light and dark) to `e2e-output/screenshots/3-2/`.
- a timing script or e2e measurement for the 100 ms switch on `many` data, numbers in the Auto Run Result.

**Acceptance Criteria:**
- Given desktop width, when Alex clicks a category tab, then only that category's torrents show, the sort is its remembered one (else 狀態), the view is at the top, the entrance replays, and 「（這個分類記住的）」 shows when the app changed the sort.
- Given a manual pick inside a category, when picked, then that category's remembered sort is saved and the hint disappears.
- Given a URL with `category`, when reloaded or opened, then that category shows; an invalid or vanished one falls back to 「全部」 with the URL fixed.
- Given 4,165 fake torrents, when switching tabs, then switch plus redraw stays within 100 ms on the dev machine, with method and numbers reported.
- Given lint, typecheck, vitest, build, Playwright, `npm run audit:prod` and `check.sh`, when run, then all pass.

## Spec Change Log

- 2026-11-18, first review pass: (1) the tabs are plain buttons in a group labelled 「分類」 with `aria-pressed`, not a `tablist` (the contract allowed the existing pattern; a tab widget without arrow keys misleads screen readers). (2) The hint cause tells a remembered sort (`category-switch`) from the 「狀態」 fallback (`category-default`); only the first shows the hint, matching EXPERIENCE's sort-pill row. (3) Category keys the URL cannot carry (`__all__`, `__proto__`, over 255 characters, control characters) get no tab; their torrents stay under 「全部」. (4) The phone's inert category button shows the selected category. KEEP: filtering only in `selectVisibleTorrents`; the URL is the sort on screen; `replayEntrance()` after the new rows commit.
- 2026-11-18, multi-model review after merge (opus, fable, sonnet, haiku; Alex picked the fixes, PR "fix(epic-3)"): before the tabs are known, the desktop row shows the URL's category alone (like the phone button), not always 「全部」. Sort saves share the one settings write scope (spec 3.1).

## Review Triage Log

### 2026-11-18: Review pass
- verdicts: 33 findings, high 0, medium 3, low 25, false 5, maybe-false 0
- findings:
  - `[low]` `[patch]` (blind) Some category names get a tab that cannot be selected (refused by the URL schema) : such keys are left out of tabs and counts; their torrents still show under 「全部」.
  - `[low]` `[patch]` (blind) A real category named `__all__` collides with `ALL` : same fix; a key equal to `ALL` gets no tab.
  - `[low]` `[patch]` (blind) New defaults use `''` (uncategorized) instead of `ALL` : defaults changed to `ALL`.
  - `[low]` `[patch]` (blind) The uncategorized tab sorts by its empty key : sorted by the label 「未分類」.
  - `[low]` `[patch]` (blind) Tabs announce the ARIA tabs widget without its keyboard behaviour : plain buttons in a labelled group with a pressed state.
  - `[low]` `[patch]` (blind) The fade comment and code name different colors : aligned with the DESIGN token.
  - `[low]` `[patch]` (blind) The hint is spliced into the accessible name with a regex : built with the pill's label, title and text.
  - `[low]` `[patch]` (blind) An unused `rememberedHint` variable in the sheet test : test added that the phone pill never shows the hint.
  - `[medium]` `[patch]` (blind) The phone filters by `category` with no sign of it : the phone category button shows the selected category and count (still inert until 3.4).
  - `[low]` `[reject]` (blind) Editing `category` in the address bar skips the tab-switch behaviour : an address-bar edit is not a tab click; the follow rules still keep the view consistent.
  - `[low]` `[reject]` (blind) The 「全部」 count comes from two calculations : both count visible torrents the same way; no disagreement shown.
  - `[low]` `[reject]` (blind) `confirmedRef` read during render : a discarded render only delays the sticky tab by one commit; no wrong state shown.
  - `[low]` `[patch]` (blind) The trace script: unescaped RegExp, copied helpers, ignored stderr : label escaped, stderr piped; copied helpers kept (local tool).
  - `[low]` `[patch]` (blind) `expectSaveOf` matches by substring : the body is decoded and `category` compared exactly.
  - `[low]` `[patch]` (blind) An over-long comment line : rewrapped.
  - `[medium]` `[patch]` (blind) No test loads a URL whose `hash` is in another category : route test added (list and board).
  - `[medium]` `[patch]` (intent) 「（這個分類記住的）」 shows on the 「狀態」 fallback when nothing was remembered : the cause tells a remembered sort from the fallback; the hint shows only for a remembered sort.
  - `[false]` `[reject]` (intent) "分類已經不存在" read as "no torrent has it" : a category with no torrent has no tab (AC), so it cannot be selected either.
  - `[false]` `[reject]` (intent) The app-chosen sort goes into the URL : the URL is the sort on screen (Epic 3 decision); the remembered value still owns the memory.
  - `[false]` `[reject]` (intent) The 100 ms check runs on a production build : that is the build Alex runs; measured on the development Mac.
  - `[false]` `[reject]` (intent) The count uses opacity 75% : matches the Epic 1 tab and the mockup.
  - `[low]` `[reject]` (intent) The filter applies at every width : intended (the URL is the same on every device); the phone button now shows the category.
  - `[low]` `[patch]` (verification-gap) The board detail is never tested inside a category : test added (count, › stop, a `hash` from another category closes).
  - `[low]` `[patch]` (edge) `__all__` collides with `ALL` : same as the blind entry; fixed there.
  - `[low]` `[patch]` (edge) A tab click on a refused name resets the sort and shows the hint : refused names have no tab.
  - `[low]` `[patch]` (edge) `replayRef` stays set when the category does not change : the target category is stored and compared.
  - `[low]` `[patch]` (edge) The hint reappears after a follow returns to the switched sort : `follow` resets the cause.
  - `[low]` `[reject]` (edge) Two tab clicks before the first navigation commits : needs two clicks within one frame; the second still lands on its category.
  - `[low]` `[patch]` (edge) Phone with `?category=` has no indicator : same as the blind phone entry; fixed there.
  - `[false]` `[reject]` (edge) A phone board of a category with only 已整理 shows four empty columns : the AC asks for four 「沒有」 columns in that case.
  - `[low]` `[reject]` (edge) The right fade can be stale after a web font loads : the next scroll or resize updates it; cosmetic for a moment.
  - `[low]` `[patch]` (edge) The trace script can hang : throws if already selected, rejects after 5 s.
  - `[low]` `[patch]` (edge, claim) Some real categories get a tab that never filters : refused names have no tab.

### 2026-11-18: Review pass (follow-up)
- verdicts: 31 findings, high 0, medium 0, low 25, false 6, maybe-false 0
- findings:
  - `[false]` `[reject]` (intent) The hint skips the 「狀態」 fallback (four causes) : first-pass decision recorded in the Spec Change Log, matching EXPERIENCE.
  - `[false]` `[reject]` (intent) The tabs use a group with `aria-pressed` : first-pass decision recorded.
  - `[false]` `[reject]` (intent) The phone button shows the category : first-pass fix recorded.
  - `[low]` `[reject]` (intent) A schema-invalid `category` is dropped before maindata answers : such a value can never become a tab; only a well-formed missing one needs to wait.
  - `[low]` `[reject]` (intent) The entrance order against the rows committing is not tested : the replay runs from a layout effect keyed on the committed category (2.9's contract); the generation test pins once per click.
  - `[low]` `[patch]` (intent) The Auto Run Result prose says `aria-selected` while the script watches `aria-pressed` : prose corrected.
  - `[low]` `[reject]` (intent) No test checks a board column's scroll after a switch : the board remounts per category, so columns start at the top.
  - `[false]` `[reject]` (intent) Additions beyond the contract : first-pass fixes and logged Claude 代決.
  - `[low]` `[patch]` (verification-gap) A reload on a far-right category is not tested to scroll into view : test added (tabs arrive after mount).
  - `[low]` `[patch]` (verification-gap, other) `categoryOfSearch` is unused : resolved (one source).
  - `[false]` `[reject]` (verification-gap, other) The spec text says `tablist` : the deviation is recorded in the Spec Change Log; the contract block is not edited.
  - `[low]` `[reject]` (blind) The phone has no way back to 「全部」 : only a shared desktop URL or a narrowed window leads there; Story 3.4 adds the phone category list next.
  - `[low]` `[patch]` (blind) The hint can show after a category change no click made : the fallback resets the cause and the replay target; the hint also checks the switched category.
  - `[low]` `[patch]` (blind) A misnamed test : renamed; the real `confirmed: null` case added.
  - `[low]` `[patch]` (blind) The out-of-category `hash` on load is half covered : URL asserted for the list; phone list case added.
  - `[low]` `[patch]` (blind) The scroller-to-top test passes without a scroller : asserts the same node.
  - `[low]` `[patch]` (blind) The pill-keeps-its-place e2e covers only a switch without the hint : non-null boxes asserted; the hint case checked too.
  - `[low]` `[patch]` (blind) The trace script never checks which mode it timed : fails unless each mode shows its view.
  - `[low]` `[patch]` (blind) `rememberAddedOn` waits on any matching POST : decodes the save and matches the category.
  - `[low]` `[patch]` (blind) JSON-looking category names (`2024`) fall back from a typed URL : numbers and booleans coerced back to strings; round-trip test with a `2024` category.
  - `[low]` `[reject]` (blind) No left fade once the row is scrolled right : DESIGN names a right fade only; the selected tab is always in view.
  - `[low]` `[reject]` (blind) A poll that reorders tabs can push the selected one out of view : the next switch scrolls it back; order changes are rare (settings page in 3.3).
  - `[low]` `[patch]` (blind) The tab-order test checks the collation against itself : literal expected order.
  - `[low]` `[patch]` (blind) The "still saving" check ignores categories : scoped to the current category; test added.
  - `[low]` `[reject]` (blind) The phone button's loading and failure states are untested : they reuse the 「全部」 button's tested branches.
  - `[low]` `[reject]` (edge) A tab click while that category's save is in flight shows the previous sort : needs a switch away and back within one save round trip.
  - `[low]` `[patch]` (edge) The fallback leaves the hint and a stale replay target : same as the blind hint entry; fixed there.
  - `[low]` `[patch]` (edge) A fake-qbit child that exits is not noticed : the script rejects when the child exits early.
  - `[low]` `[patch]` (edge) `boundingBox()` null passes the pill check : same as the blind e2e entry; fixed there.
  - `[low]` `[reject]` (edge, claim) The remembered sort right after a pick is not in the cache yet : same as the in-flight entry above.
  - `[false]` `[reject]` (edge, claim) No hint when the app falls back to 「狀態」 : deliberate, recorded.

## Design Notes

Who changed the sort is state the layout owns: set `category-switch` when a tab click applies a remembered sort, `manual` on `pickView`, `open` on first load and reload. The hint function stays pure; the layout passes it the sort before the switch, the sort after and the cause.

Claude 代決 (list in the PR): `category=` (empty) for uncategorized and 「未分類」 as its label; tab names sorted with `localeCompare` in zh-Hant; the disabled 「新增種子」 button in the empty state; phone stays as it is until Story 3.4.

Docs (AD-11): TanStack Router search params and `navigate({ replace })` https://tanstack.com/router/latest/docs/framework/react/guide/search-params ; zod 4 https://zod.dev/api ; MDN `Element.scrollIntoView` (`inline: 'nearest'`) https://developer.mozilla.org/en-US/docs/Web/API/Element/scrollIntoView ; WAI-ARIA tabs pattern https://www.w3.org/WAI/ARIA/apg/patterns/tabs/ ; Tailwind 4 `mask-image` / gradient utilities https://tailwindcss.com/docs/mask-image .

## Verification

**Commands:**
- `source ~/.nvm/nvm.sh && nvm use && npm run lint && npm run typecheck` -- expected: no errors
- `source ~/.nvm/nvm.sh && nvm use && npm test` -- expected: all pass
- `source ~/.nvm/nvm.sh && nvm use && npm run build && npx playwright test` -- expected: all pass, zero CSP violations
- `source ~/.nvm/nvm.sh && nvm use && npm run audit:prod` -- expected: passes
- `bash .claude/skills/next-story/check.sh` -- expected: every line ok

## Auto Run Result

Status: implemented, review not run yet.

**Summary.** `category` in the URL search (zod, `replace`; absent is 「全部」, `category=` is uncategorized); the `_authed` layout resolves it against the torrents present (`resolveCategory`: a bad or vanished one falls back to 「全部」 with the URL fixed once maindata answered, the selected one emptying on screen keeps its tab); `selectVisibleTorrents` and `selectBoardColumns` filter by category (the board's 已整理 column too); tab counts, order and the sticky selected tab in `src/lib/category-tabs.ts`, the hint rule in `src/lib/remembered-hint.ts`; the desktop tab row (`src/features/header/category-tabs.tsx`: pills, accent selected, sideways scroll without a scrollbar, 24px right fade only while tabs are cut off, selected tab scrolled into view with `scroll-padding` clear of the fade); a tab click writes `category` plus the remembered sort (else 「狀態」), keeps `hash` only when the new category holds it, scrolls to the top and replays the entrance from a layout effect keyed on the category; 「（這個分類記住的）」 on the desktop pill; manual picks save per category; the follow rule watches the current category only.

**Claude 代決 (for the PR).** `category=` (empty) for uncategorized, label 「未分類」; names outside `categoryOrder` sorted by the label shown with `Intl.Collator('zh-Hant')`; category keys the URL cannot carry (`__all__`, `__proto__`, over 255 characters, control characters) get no tab, their torrents count under 「全部」; the existing disabled 「新增種子」 empty block reused; the phone category button stays inert until 3.4 but shows the selected category and its count; another category remounts the board (columns back at the top, auto-collapse and the open 已整理 column reset); the list's viewed row resets per category (first row, no "successor" from the old order); the hint is also read in the pill's `aria-label` and shows only when a remembered sort was applied (the 「狀態」 fallback of a category that remembers none is cause `category-default`, no hint; following another device clears it); the tabs are plain buttons in a group labelled 「分類」 with `aria-pressed` (review: no arrow keys or tab panel, so not a `tablist`); the tab order waits for the settings like the list.

**Performance (100 ms budget).** `node scripts/trace-category-switch.mjs` on the built app with fake-qbit `many` (4165 visible torrents; X 1387, mteam-X 1389, mteam-tv 1389), headless Chromium 1440 x 900, dev Mac, 2026-11-18. Method: in the page, `performance.now()` before the tab's `click()`; commit when the tab turns `aria-pressed` (same commit as the new rows); frame after a `requestAnimationFrame` plus a `MessageChannel` task (the first painted frame with the new rows). 20 switches per mode (X, mteam-X, mteam-tv, 全部, five rounds):
- list (every category remembers 加入時間): frame median 14.4 ms, p95 17.0 ms, max 17.8 ms; commit median 5.6 ms, max 7.2 ms.
- board (nothing remembered): frame median 9.3 ms, p95 11.7 ms, max 13.1 ms; commit median 7.2 ms, max 10.5 ms.
(Second run after the review fixes; the first run was list max 19.0 ms, board max 11.7 ms.)
Summary JSON: `e2e-output/screenshots/3-2/switch-timing.json` (gitignored).

**Screenshots.** `e2e-output/screenshots/3-2/` from `e2e/category-tabs.spec.ts`, desktop 1280 x 800, light and dark: `tabs-overflow-*`, `tabs-selected-far-right-*`, `remembered-hint-*`, `emptied-category-*`. Fake data `data=categories` (21 code-name categories plus `only-archived`) and `data=categories-emptied` added to `scripts/fake-qbit.mjs`.

### Follow-up pass (2026-11-18)

Status: done. 31 findings, no high or medium: patched the low ones (the hint is tied to the switched category and reset by a fallback, the saving check is per category, JSON-looking category names round-trip, more tests for reload scroll, phone hash and pill layout with the hint, a stricter timing script); rejected the rest with reasons. Follow-up review: not recommended. Timing rerun after the patches: list max 16.6 ms, board max 12.7 ms on 4,165 fake torrents.
