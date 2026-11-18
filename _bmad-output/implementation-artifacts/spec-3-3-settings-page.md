---
title: 'Story 3.3: Settings page'
type: 'feature'
created: '2026-11-18'
status: 'done'
baseline_revision: '2a41259b40ba0a3c196b422408426279a2426e48'
review_loop_iteration: 0
followup_review_recommended: false
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-3-context.md'
  - '{project-root}/_bmad-output/planning-artifacts/architecture/architecture-react-torrent-2026-11-15/ARCHITECTURE-SPINE.md'
  - '{project-root}/_bmad-output/implementation-artifacts/spec-3-2-desktop-category-tabs.md'
warnings: ['oversized']
deferred: []
---

<intent-contract>

## Intent

**Problem:** The header's settings button is disabled and there is no settings page, so Alex cannot put his most used categories first in the tab row or turn off the board's auto-collapse.

**Approach:** Enable the desktop header's settings button to open a `/settings` route under the authed layout (header as usual), placed and styled like the old settings route from before Story 1.1 (back button plus title, centered content), with exactly two items: the category tab order (up and down arrows per row, saved through a new `setCategoryOrder` server function, no optimistic move) and the 「捲動時自動收合其他欄」 switch on the existing `autoCollapse` pref.

## Boundaries & Constraints

**Always:**
- Route `/settings` under `src/routes/_authed` (`ssr: false` like the layout); the header shows as usual; the page has `aria-label`「設定」 on its main region (or an `h1` 「設定」 plus that label on the header button). Old layout to follow (from `git show 82551ad^:src/routes/settings.tsx`): a top row with a ghost icon back button and the title, content centered with a max width; rewrite the code with this app's tokens (DESIGN.md), no i18n.
- Desktop header settings button (`app-shell.tsx`, `IconButton label="設定"`) loses `disabled` and navigates to `/settings`. The phone entry is Story 3.4; the phone can still open `/settings` by URL and the page works at 390px.
- Back button returns to the list URL Alex came from, with its `category`, `sort`, `dir` (and `hash` if present) (Claude 代決, already in the epic): the 設定 button opens `/settings` with the list's search in its URL and `fromList` in the history entry's state (not localStorage); opened directly, back goes to `/`.
- Exactly two items on the page; no common paths, shortcut customizing or theme switch.
- Category order list:
  - 「全部」 fixed first, no arrows;
  - the rest are all of qBittorrent's categories (the `categories` map in maindata) plus any category a torrent uses that the map lacks, including ones with no torrents now, ordered by Story 3.2's rule (`categoryOrder`, then the rest by label in zh-Hant); 「未分類」 (`''`) is listed when some torrent is uncategorized (Claude 代決); names the URL cannot carry (3.2's rule) are left out;
  - each row has up and down arrow buttons on the right, with `aria-label` 「把 <名稱> 往上移」 / 「把 <名稱> 往下移」; the first row's up and the last row's down are disabled;
  - an arrow press calls `setCategoryOrder` with the whole new order (all listed names in their new positions, never `ALL`), idempotent; while it is pending that row's arrows are disabled; on success the list and the tab row take their positions from the returned settings (no optimistic move, AD-7);
  - failure (`settings_write_failed`, `timeout`, `invalid_input`) shows 3.1's failure-with-retry toast (text from `src/lib/error-text.ts`, Claude 代決 「順序沒存到：<code text>」, settings-specific `timeout` text like 3.1) and the list keeps its old order; connection codes stay global.
- `setCategoryOrder` server function from `_define.ts`: `serverPost`, `z.strictObject({ order })` with `order` an array of category keys (3.1's `categoryOrderEntrySchema`, at most the 256 KB file bound), duplicates or `ALL` give `invalid_input` (vitest at the container side), writes through the 3.1 store's locked update, returns the whole new settings; `not_logged_in` without a session (discover list).
- Auto-collapse switch: reads `autoCollapse` through `src/lib/prefs.ts` (default on), toggling writes it at once to this device; turning it off stops the board from collapsing on scroll (the 2.8 controller already reads the pref; make sure a change takes effect without a reload); on the phone it still shows, with a `text-muted` line 「只在電腦版有用」 next to it; storage that throws reads as on and never errors. The switch is a `button` with `role="switch"` and `aria-checked` (no new dependency), toggled by click and Space.
- Keyboard: back, every arrow and the switch are reachable by Tab with the focus outline; Space toggles the switch.
- Screenshots for the PR: desktop and phone 390px, light and dark, of the settings page.

**Never:**
- No phone entry from the category list (3.4), no shortcut list (3.7), no common path editing, no drag-and-drop reordering, no new dependency (no Radix Switch).
- No change to the settings schema; no localStorage outside `src/lib/prefs.ts`.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Open from the list | on `/?category=mteam-X&sort=ratio`, click 設定 | `/settings`; back returns to `/?category=mteam-X&sort=ratio` | No error expected |
| Open directly | `/settings` typed | back goes to `/` | No error expected |
| List order | `categoryOrder: ['b']`, categories a, b, c, d (d has no torrents) | 全部, b, a, c, d | No error expected |
| Move up | press 「把 c 往上移」 | `setCategoryOrder(['b','c','a','d'])`; c's arrows disabled until it answers; then list and tabs reorder | No error expected |
| First and last | first row up, last row down | disabled | No error expected |
| Save fails | `settings_write_failed` | toast 「順序沒存到：設定檔寫不進去」 with 重試; order unchanged | Toast |
| Container input | order with `__all__` or a duplicate | `invalid_input` | zod |
| No session | `setCategoryOrder` | `not_logged_in` | No error expected |
| Switch off | toggle | pref `off`; the board no longer collapses on scroll, without reload | No error expected |
| Storage throws | `localStorage` blocked | switch shows on; toggling does not throw | Silent |
| Phone | 390px | page fits, no horizontal scroll, 「只在電腦版有用」 under the switch | No error expected |

</intent-contract>

## Code Map

- `src/features/header/app-shell.tsx:60-75` -- `IconButton label="設定"` (disabled today); enable and navigate.
- `src/routes/_authed.tsx`, `src/routes/_authed/index.tsx` -- the authed layout and list route; add `src/routes/_authed/settings.tsx` (TanStack file route; regenerate `routeTree.gen.ts` through the build or the router plugin, CI checks it is committed unchanged).
- `src/shared/list-search.ts` -- `listSearchSchema` (category, sort, dir, hash) for remembering and restoring the list URL.
- `src/lib/category-tabs.ts` -- 3.2's ordering, labels (「未分類」), and the "URL can carry it" filter; reuse for the settings list.
- `src/shared/maindata.ts:63-98`, `src/state/maindata.ts` -- `categories` map from maindata.
- `src/shared/settings.ts` (`categoryOrderEntrySchema`), `src/server/settings/` (store `update`), `src/server/functions/set-category-sort.ts` -- patterns for `setCategoryOrder`; `src/server/functions/discover.test.ts` lists functions.
- `src/state/settings.ts` -- `categorySortOp`, `applySettings`, mutation scope; add the order op (one scope for order).
- `src/state/tracked-op.ts`, `src/lib/error-text.ts` -- per-op failure codes and texts (3.1 added `sortSaveFailureText`).
- `src/lib/prefs.ts` -- `readPref`, `writePref`, `autoCollapse`; `src/features/board/use-board-collapse.ts` reads it (check it reacts to a change made on the settings page; a small `src/state` subscription or reading on mount after navigation back is enough, since the board remounts when Alex returns).
- `git show 82551ad^:src/routes/settings.tsx` -- the old page's layout.
- `e2e/fixtures.ts` -- settings reset fixture, login, CSP watch.

## Tasks & Acceptance

**Execution:**
- `src/shared/settings.ts` (input schema), `src/server/functions/set-category-sort.ts` sibling `set-category-order.ts` + tests -- container validation (`ALL`, duplicates), idempotent write, `not_logged_in`.
- `src/state/settings.ts` + test -- the order op with its own failure text.
- `src/lib/` settings list helper + test -- all categories (map plus torrents, empty ones included, uncategorized when used), order, moves.
- `src/routes/_authed/settings.tsx`, `src/features/settings/` (page, order list, switch) + DOM tests -- matrix rows, keyboard, phone line.
- `src/features/header/app-shell.tsx` + test, a `src/state` value for the return URL -- open and back.
- board auto-collapse respects a toggle made on the settings page + test.
- `e2e/settings-page.spec.ts` -- open from a category list, move a category up, the tab row reorders after the answer, back returns to the same URL, the switch turns collapse off; screenshots desktop and phone, light and dark, to `e2e-output/screenshots/3-3/`; CSP clean.

**Acceptance Criteria:**
- Given the desktop header, when Alex clicks 設定, then `/settings` opens with the header as usual and a back button that returns to the list URL he came from.
- Given the order list, when Alex presses an arrow, then the whole new order is sent, that row's arrows wait, and the list and tabs move only after the answer; a failure shows the retry toast and keeps the order.
- Given the auto-collapse switch, when toggled off, then the desktop board no longer collapses on scroll; the phone shows 「只在電腦版有用」.
- Given lint, typecheck, vitest, build, Playwright, `npm run audit:prod` and `check.sh`, when run, then all pass.

## Spec Change Log

- 2026-11-18, first review pass: (1) the order op carries the move (`key`, `direction`) and builds the whole order from the current settings and maindata when the call runs, keeping stored entries that are not listed; a later 重試 or a queued press reapplies the move to the newest order; the page refetches settings on mount; while settings are unknown the list is read-only. (2) On `/settings` the header follows the remembered list search; any tab click and a sort pick go to the list on that category. (3) The return URL is recorded whenever the list search changes; 「回到列表」 replaces the history entry. KEEP: no optimistic move; only the pressed row's arrows wait; one shared order scope.
- 2026-11-18, multi-model review after merge (opus, fable, sonnet, haiku; Alex picked the fixes, PR "fix(epic-3)"): (1) The list's search rides in the `/settings` URL and `fromList` in the history entry's state (typed in `src/router.tsx`); `src/state/settings-return.ts` and the layout's in-memory return search are gone, so the header on `/settings` reads the same URL as the list, the URL fix-ups run there too, and a later entry point (story 3.4) cannot inherit a stale flag. (2) Pressing the selected tab on `/settings` returns to the list as it was, its sort too (no remembered-sort switch, no hint). (3) The order list is also read-only while the latest settings read failed (`useSettings().readFailed`), so an older cached order is never sent. (4) Order saves share the one settings write scope with sort saves (spec 3.1); the known trade-off in Auto Run Result no longer applies. KEEP: no optimistic move; the move is rebuilt from the newest order when the call runs.

## Review Triage Log

### 2026-11-18: Review pass
- verdicts: 34 findings, high 0, medium 10, low 19, false 5, maybe-false 0
- findings:
  - `[medium]` `[patch]` (verification-gap) The follow rule's "only on the list" guard is untested on `/settings` : test added with another device's sort change while on `/settings`.
  - `[medium]` `[patch]` (verification-gap) A sort pick on `/settings` returning to the list is untested : test added; grouped with the header entry below.
  - `[low]` `[patch]` (verification-gap) The order list's failed, empty and loading states are untested : tests added.
  - `[medium]` `[patch]` (verification-gap, other) On `/settings` the header shows 「全部」 and a sort pick saves under 全部 : the header follows the remembered return search; any tab click and a sort pick go to the list on that category.
  - `[medium]` `[patch]` (blind) A press erases stored order entries that are not listed : stored entries are kept in their relative place.
  - `[medium]` `[patch]` (blind) A failed settings read lets a press overwrite the saved order : the list is read-only with a note until settings are known.
  - `[medium]` `[patch]` (blind) Whole-order writes from a stale page overwrite a newer order : the op carries the move and computes the order from the current settings at send time; the page refetches settings on mount.
  - `[low]` `[patch]` (blind) 「回到列表」 pushes history : navigates with `replace`.
  - `[medium]` `[patch]` (blind) The header on `/settings` does not match the list being returned to : same as the verification-gap header entry; fixed there.
  - `[low]` `[patch]` (blind) The 設定 button on `/settings` is a dead control : `aria-current="page"`.
  - `[low]` `[patch]` (blind) The switch fails silently when storage refuses the write : a muted line says this device cannot keep the setting.
  - `[low]` `[patch]` (blind) Nothing announces a reorder : a polite live region announces the new position.
  - `[low]` `[patch]` (blind) `moved` is dead and its comment wrong : the move is now what the op carries.
  - `[low]` `[patch]` (blind) The e2e collapse check can pass vacuously : scroll asserted and a positive control added.
  - `[low]` `[patch]` (blind) Some list states have no tests : same as the verification-gap entry; fixed there.
  - `[low]` `[patch]` (blind) Two garbled comments : fixed.
  - `[low]` `[patch]` (blind) Leftover indirection (`useAutoCollapsePref`, `MAX_SETTINGS_BYTES` re-export) : removed.
  - `[false]` `[reject]` (blind) The diff leaves out `routeTree.gen.ts` and the spec : excluded from the review diff on purpose; both are committed with the story.
  - `[false]` `[reject]` (intent) The page keeps the app shell rather than copying the old full-screen page : the AC says 「頁首照常」 and the spine's component row says the old page means position and style with the code rewritten.
  - `[false]` `[reject]` (intent) 「未分類」 and torrent-only categories in the list : the list must match what the tabs can show; recorded as Claude 代決.
  - `[false]` `[reject]` (intent) Every arrow waits, not only the pressed row : a second press would compute from the stale order; recorded as Claude 代決.
  - `[low]` `[reject]` (intent) A write-only storage failure is untested : now covered by the switch entry above.
  - `[low]` `[reject]` (intent) The back link's focus ring and 44px target are not asserted : the shared button style is tested elsewhere; the e2e checks the switch and arrows.
  - `[false]` `[reject]` (intent) The return URL is lost on reload : intended (in memory per the spec); back goes to `/`.
  - `[medium]` `[patch]` (edge) A failed settings read lets a press overwrite the saved order : same as the blind entry; fixed there.
  - `[medium]` `[patch]` (edge) Another device's newer order is overwritten by a stale page : same as the blind stale entry; fixed there.
  - `[low]` `[patch]` (edge) 重試 resends an outdated order : the retry reapplies the move to the current order.
  - `[medium]` `[patch]` (edge) Stored entries of absent categories are erased : same as the blind entry; fixed there.
  - `[low]` `[patch]` (edge) The 「全部」 tab does nothing on `/settings` : any tab click there goes to the list.
  - `[low]` `[patch]` (edge) The remembered list URL goes stale after history navigation : recorded whenever the list search changes.
  - `[low]` `[reject]` (edge) A real category named 未分類 or 全部 duplicates a label : not a name anyone gives a qBittorrent category; the keys still differ.
  - `[low]` `[patch]` (edge) The switch gives no reason when storage refuses the write : same as the blind entry; fixed there.
  - `[low]` `[reject]` (edge, claim) A `qbit_rejected` answer to an order save shows no toast : the settings functions never return that code; an unexpected answer is a bug the global handler surfaces.
  - `[low]` `[patch]` (edge, claim) Back can open an older list URL after a history return : same as the edge stale-URL entry; fixed there.

### 2026-11-18: Review pass (follow-up)
- verdicts: 33 findings, high 0, medium 5, low 21, false 7, maybe-false 0
- findings:
  - `[false]` `[reject]` (intent) The payload keeps stored entries not listed : first-pass fix recorded (an erased position is data loss).
  - `[false]` `[reject]` (intent) 重試 reapplies the move instead of resending the same order : first-pass fix recorded; the container write stays idempotent.
  - `[false]` `[reject]` (intent) The header on `/settings` works as the list's header : first-pass fix recorded (it must match the list it returns to).
  - `[false]` `[reject]` (intent) Pending arrows use `aria-disabled` : keeps focus on the pressed button; presses are no-ops.
  - `[false]` `[reject]` (intent) The return search is recorded continuously : first-pass fix recorded.
  - `[medium]` `[patch]` (intent) Blocked storage shows a note although the AC says 「不報錯」 : the note is removed; storage failure reads as on, silently.
  - `[false]` `[reject]` (intent) A labelled section instead of an `h1` on `main` : the contract allows either; now `aria-labelledby` on the section.
  - `[low]` `[reject]` (intent) Reaching back by Tab and the outline on back and the arrows are not asserted : the shared focus style is tested; the e2e Tabs through arrows and the switch.
  - `[low]` `[reject]` (intent) The failure toast is not exercised end to end : covered in the route DOM test with the real op.
  - `[low]` `[patch]` (blind) The back link leaves two copies of the list in history : history back when opened from the list; `replace` for a directly opened page.
  - `[low]` `[patch]` (blind) The URL fix-up still runs on `/settings` : guarded with `onList`.
  - `[medium]` `[patch]` (blind) Arrows are active before the settings re-read finishes : they wait while `['settings']` is fetching.
  - `[low]` `[reject]` (blind) A second press loses the first press's announcement and focus : the moves themselves are correct; only the announcement of the earlier one is skipped.
  - `[low]` `[patch]` (blind) The announced position does not count 「全部」 : it counts it now.
  - `[low]` `[patch]` (blind) `settingsOpen = !onList` is too broad : compares `/settings` explicitly.
  - `[low]` `[patch]` (blind) The `settings-return.ts` comment is stale : corrected.
  - `[low]` `[patch]` (blind) The DOM test header contradicts its assertions : corrected.
  - `[low]` `[patch]` (blind) The blocked-storage test checks too little : asserts on, no throw and no note.
  - `[low]` `[patch]` (blind) `settle()` can hang on infinite animations : skips them.
  - `[low]` `[patch]` (blind) The switch card skips the card padding token : uses the shared padding.
  - `[low]` `[patch]` (blind) The page region's label duplicates its heading : `aria-labelledby`.
  - `[low]` `[reject]` (blind) Saved orders grow forever : bounded by the 256 KB file; pruning needs a decision on deleted categories that may come back.
  - `[low]` `[patch]` (blind) Two comments not rewrapped : rewrapped.
  - `[low]` `[patch]` (edge) Typed `/settings` with bad list params gets them rewritten into its URL : same as the blind fix-up entry; fixed there.
  - `[medium]` `[patch]` (edge) Another device's sort change while on `/settings` is never followed : the follow rule's last value no longer advances off the list.
  - `[medium]` `[patch]` (edge) A press before the mount refetch answers uses stale settings : same as the blind entry; fixed there.
  - `[low]` `[reject]` (edge) A second row's press drops the first announcement : same as the blind announcement entry.
  - `[low]` `[reject]` (edge) A re-render between press and the in-flight notice loses the announcement : announcement only; the move is correct.
  - `[medium]` `[patch]` (edge) An older sort-save answer can revert `categoryOrder` in the cache : answers are applied by one send sequence across settings ops.
  - `[false]` `[reject]` (blind, diff scope) Additions beyond the contract : logged Claude 代決 and first-pass fixes.
  - `[low]` `[patch]` (intent) The `fixListSearch` effect is not guarded although the comment says list-only effects are skipped : same as the blind fix-up entry; fixed there.
  - `[low]` `[reject]` (intent) The phone line sits under the label, not next to the switch : the matrix says under; both placements fit.
  - `[low]` `[reject]` (intent) 「No session」 tested through `guard.run`, not HTTP : the discover list also checks every function.

## Design Notes

Claude 代決 (list in the PR): the return URL carried in the `/settings` URL with `fromList` in history state (not localStorage; changed from in-memory by the post-merge review); 「未分類」 listed when used; the failure text 「順序沒存到：…」; a hand-made switch (`role="switch"`) instead of adding Radix Switch; the old page's layout rebuilt with current tokens.

Docs (AD-11): TanStack Router file routes and `navigate` https://tanstack.com/router/latest/docs/framework/react/routing/file-based-routing , https://tanstack.com/router/latest/docs/framework/react/guide/navigation ; WAI-ARIA switch pattern https://www.w3.org/WAI/ARIA/apg/patterns/switch/ ; TanStack Query mutation scopes https://tanstack.com/query/v5/docs/framework/react/guides/mutations#mutation-scopes ; zod 4 https://zod.dev/api .

## Verification

**Commands:**
- `source ~/.nvm/nvm.sh && nvm use && npm run lint && npm run typecheck` -- expected: no errors
- `source ~/.nvm/nvm.sh && nvm use && npm test` -- expected: all pass
- `source ~/.nvm/nvm.sh && nvm use && npm run build && npx playwright test` -- expected: all pass, zero CSP violations
- `source ~/.nvm/nvm.sh && nvm use && npm run audit:prod` -- expected: passes
- `bash .claude/skills/next-story/check.sh` -- expected: every line ok

## Auto Run Result

Status: done (first review pass)

**Summary.** `/settings` under the authed layout (header as usual) with a back button to the list Alex came from and two items: the category tab order (arrows, saved through the new `setCategoryOrder`, no optimistic move, failure toast with 重試) and the auto-collapse switch on the `autoCollapse` pref (applies without reload; phone note 「只在電腦版有用」). The desktop 設定 button opens it.

**Review.** 34 findings: patched 10 medium entries (stored order kept, read-only while settings are unknown, moves computed at send time with refetch on mount, header follows the list on `/settings`, tests for the follow guard and a sort pick on `/settings`) and low ones; rejected 7 (5 false, 2 low) with reasons; nothing deferred.

**Follow-up review: recommended.** Patched by verdict: medium 10. The named risk: the order op and the `/settings` header logic were reworked after review, so a second pass should re-check them.

### Follow-up pass (2026-11-18)

Status: done. 33 findings, no high: patched 5 medium (the storage-failure note removed per the AC's 「不報錯」, arrows wait while settings refetch, one send sequence across settings writes, the follow rule waits off the list, the URL fix-up only on the list) and the low ones (history back from the settings page, the announced position counts 「全部」, `aria-labelledby`, card padding token, infinite animations skipped in e2e waits, comments); rejected the rest with reasons. Follow-up review: not recommended (no high patched on a follow-up pass). Known trade-off: sort saves of different categories now share one answer order, so an older answer for one category can be dropped after a newer one for another; the next focus refetch corrects the cache.
