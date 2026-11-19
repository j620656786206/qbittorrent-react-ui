---
title: 'Story 3.5: In-list search'
type: 'feature'
created: '2026-11-18'
status: 'done'
baseline_revision: '193343681cab50084918600d0b5ff3100a538dc2'
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

**Problem:** With about 3,000 torrents Alex cannot find one by name; the header's magnifier is a disabled placeholder.

**Approach:** Enable the magnifier (and `/` on desktop) to open a search box that filters the current category by name as he types, keep the keyword in the URL's `q`, filter only inside `selectVisibleTorrents` (list, board and the detail's "N of M" follow), show a no-result state with 「在全部裡找」, and close with ✕, 「取消」 or `Esc` in the registry's order.

## Boundaries & Constraints

**Always:**
- Magnifier (desktop header and phone first row, `app-shell.tsx`) loses `disabled`, `aria-label`「搜尋」. `/` opens it on desktop, registered in `src/state/shortcuts.ts` (the one registry; `/` is not handled while typing in a field). The registry's `keydown` listener must exist whenever a registered key can act (today it only exists while a layer is open).
- Desktop: the magnifier turns in place into a 240x36px pill (`surface` background, `border`), magnifier icon left, ✕ right, placeholder 「找名字」, over the header's empty middle; other buttons do not move (DESIGN search-box, mockup `S03-search-desktop`). Phone: 44px tall, full width over the first row, text 16px (no iOS zoom), a 「取消」 text button on the right. Focus moves to the input when it opens. The input is a labelled search field (`type="search"` or `role="searchbox"`, `aria-label`「找名字」).
- Filtering: as Alex types; only the current category; name only; case-insensitive (`toLocaleLowerCase` both sides); leading and trailing spaces ignored; empty means no filter. Characters like `.`, `*`, `(`, `<script>` match literally (plain substring, never a RegExp) and render as plain text. `q` lives in `src/shared/list-search.ts` (zod; written with `replace`, trimmed empty removes it). Filtering happens in `selectVisibleTorrents` (and the board's column selector) from `src/lib`; features never filter.
- What follows the keyword: list mode and the phone exclude 已整理 as always; the desktop board's 已整理 column is filtered too and its collapsed count shows the matches; board column counts and the detail's 「第 N 個／共 M 個」 follow the results; category tab and phone button counts do not change; with any result the board keeps its 4 columns and an empty one says 「沒有」; a viewed torrent filtered out follows Story 2.4 (next, or close).
- Category change while a keyword is set: the keyword stays, the box stays open, the list scrolls to the top (3.2's switch). The settings page round trip keeps `q` in the remembered list search (`openSettings` carries the list search).
- No result: not in 「全部」: the content area centre says 「『<keyword>』在 <category label> 找不到」 with an outline button 「在全部裡找」 that switches to 「全部」 (its remembered sort, 3.2's switch) keeping the keyword; in 「全部」: only 「找不到『<keyword>』」. On the board, the whole board is replaced by this message only when all 4 columns and 已整理 are empty; partly empty columns keep 「沒有」. Mockups `S01-no-result-desktop`, `S02-no-result-phone`.
- Closing: ✕, phone 「取消」 or `Esc` clears the keyword, removes `q` (replace) and collapses the box. `Esc` follows the registry order: an open dialog first, then search, then the detail, regardless of the order they opened (give layers a rank instead of pure open order); `Esc` works with focus in the search box; a key pressed while an IME is composing (`isComposing`), `Esc` or Enter, does nothing; vitest covers the `Esc` order.
- Performance: with about 4,165 fake torrents (`many` data), each keystroke's filter plus redraw stays within 100 ms on the dev machine; the PR states the method and numbers (extend or mirror `scripts/trace-category-switch.mjs`).
- Screenshots for the PR, desktop and phone 390px, light and dark: the open search box, a board with results, no result in a category, no result in 「全部」.

**Never:**
- No qBittorrent search engine, no fuzzy matching, no highlighting of matches (not in the spec), no new dependency, no localStorage of the keyword.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Open | click magnifier or press `/` on desktop | box open, focus in it | No error expected |
| `/` while typing | focus in another field | `/` types normally | No error expected |
| Type | `  Show.S01 ` in mteam-tv | only mteam-tv torrents whose name contains `show.s01` (any case); URL `q=Show.S01` | No error expected |
| Literal | `(` or `.*` or `<script>` | substring match, shown as text | No error expected |
| Counts | keyword set | board columns and N of M follow; tab counts unchanged; 已整理 collapsed count shows matches | No error expected |
| Viewed filtered out | detail open on a torrent that stops matching | next one or close (2.4) | No error expected |
| Switch category | keyword set, pick X | keyword kept, box open, top | No error expected |
| No result in a category | 牧神記 in mteam-tv | 「『牧神記』在 mteam-tv 找不到」 + 「在全部裡找」, then 全部 with 全部's sort, keyword kept | No error expected |
| No result in 全部 | 牧神記 | 「找不到『牧神記』」 only | No error expected |
| Board partly empty | some columns empty | columns stay with 「沒有」 | No error expected |
| Close | ✕ / 取消 / Esc | keyword cleared, `q` removed, box collapsed | No error expected |
| Esc order | dialog over detail over search | Esc closes dialog, then search, then detail | No error expected |
| IME | Esc or Enter while composing | ignored | No error expected |
| Reload | `?q=show` | box open with 「show」, filtered | No error expected |

</intent-contract>

## Code Map

- `src/features/header/app-shell.tsx:55-90` -- desktop and phone magnifier `IconButton label="搜尋"` (disabled placeholders).
- `src/state/shortcuts.ts:1-140` -- registry (`SHORTCUTS`, `handleShortcut`, `pushEscapeLayer`, `useEscapeLayer`, listener only while a layer is open); add `/`, layer ranks, the always-on listener.
- `src/shared/list-search.ts` -- `listSearchSchema` (`category`, `sort`, `dir`, `hash`), `fixListSearch`; add `q`.
- `src/lib/visible-torrents.ts` -- `selectVisibleTorrents(maindata, view, sortKeys)`, view has `category`; add the name filter. `src/features/board/board-model.ts` column selector likewise.
- `src/routes/_authed.tsx` -- builds `view` from the search, `selectCategory`, `openSettings`; carry `q` into the view and keep it on switches.
- `src/state/list-view.ts` -- `ListViewContext`; expose the keyword and setters (open, change, close).
- `src/features/list/list-states.tsx` -- empty states (add the no-result block); `src/features/board/torrent-board.tsx`, `archived-column.tsx` -- whole-board no-result and the collapsed 已整理 count.
- `src/lib/detail-position.ts`, `src/state/shown-order.ts` -- N of M and the successor come from the shown order, so they follow automatically once filtering is in the selector.
- `src/features/detail/*` -- the detail panel and phone sheet register `Esc` layers; check their rank against search.
- `scripts/trace-category-switch.mjs` -- pattern for the keystroke timing script.
- `e2e/category-tabs.spec.ts`, `e2e/fixtures.ts` -- categories data, settings reset, helpers.

## Tasks & Acceptance

**Execution:**
- `src/shared/list-search.ts` + tests -- `q` param.
- `src/lib/visible-torrents.ts`, board selector + tests -- name filter (case, trim, literal characters, empty), counts.
- `src/state/shortcuts.ts` + tests -- `/`, ranked `Esc` layers (dialog, search, detail), IME, always-on listener.
- `src/features/header/search-box.tsx` (new) + DOM test; `app-shell.tsx` -- desktop pill, phone overlay, focus, ✕, 取消.
- `src/routes/_authed.tsx`, `src/state/list-view.ts` + DOM tests -- keyword in URL and view, kept on category switch and settings round trip.
- no-result states in list and board + DOM tests.
- `e2e/search.spec.ts` -- open with `/` and the magnifier, type, filter, switch category keeps the keyword, no result in a category and 「在全部裡找」, no result in 全部, close with Esc/✕/取消, reload keeps `q`; screenshots desktop and phone, light and dark, to `e2e-output/screenshots/3-5/`; CSP clean.
- keystroke timing on `many` data; numbers in the Auto Run Result.

**Acceptance Criteria:**
- Given the header, when Alex clicks the magnifier or presses `/` on desktop, then the search box opens with focus in it, desktop as a 240px pill, phone over the first row with 「取消」.
- Given a keyword, when he types, then the list and board show only the current category's names containing it (case-insensitive, trimmed, literal), within 100 ms per keystroke on 4,165 fake torrents.
- Given no result, when not in 「全部」, then 「『<keyword>』在 <category> 找不到」 and 「在全部裡找」 show; in 「全部」 only 「找不到『<keyword>』」.
- Given the box open, when Alex presses ✕, 「取消」 or `Esc`, then the keyword and `q` are cleared; `Esc` closes a dialog first, then search, then the detail.
- Given lint, typecheck, vitest, build, Playwright, `npm run audit:prod` and `check.sh`, when run, then all pass.

## Spec Change Log

- 2026-11-18, review fixes (coordinator): matching folds both sides with `normalize('NFKC')` then `toLowerCase()` instead of `toLocaleLowerCase()` (full-width IME input matches, same result on every device locale); `q` is capped at 200 characters and refuses control characters; Enter (not while composing) leaves the field; a category with no torrent at all keeps 「這個分類沒有種子」 under a keyword; the board's no-result block covers the board instead of unmounting it; a keyword change applies at once even while an extra sort holds for its keys; one visually hidden polite status says 「找到 N 個」 or the no-result line once the keyword rests. KEEP: filtering only in the selectors; the Esc ranks.
- 2026-11-19, multi-model review after merge (opus, fable, sonnet, haiku; Alex picked the fixes, PR "fix(epic-3): 多模型 review 3.4 到 3.6 的修正"): (1) whether the box is open is one piece of state in `src/state/search-open.ts` (Alex opened it, or a keyword is set); a close never re-opens while the URL catches up, and nothing is set during render. (2) A keyword closed on `/settings` is not shown and is removed from the URL when history goes back to the list entry that still holds it; typing again in between forgets it. (3) On the phone, while a keyword is set, archived matches do not count toward the board total, so the no-result block and the polite status agree (the phone has no 已整理 column); without a keyword the 2.3 board is unchanged. KEEP: filtering only in the selectors; `q` in the URL.

## Review Triage Log

### 2026-11-18: Review pass
- verdicts: 40 findings, high 0, medium 1, low 34, false 5, maybe-false 0
- findings:
  - `[false]` `[reject]` (intent) The filter also runs in the board selector and `_authed.tsx` uses `nameMatches` : both live in `src/lib`; features never filter.
  - `[false]` `[reject]` (intent) On the phone a keyword matching only 已整理 shows four 「沒有」 tabs : the AC replaces the board only when all five buckets are empty.
  - `[false]` `[reject]` (intent) The magnifier swaps without an animation : DESIGN and the AC fix the end state; no animation is specified.
  - `[false]` `[reject]` (intent) Every empty column says 「沒有」 while searching : the AC says so.
  - `[false]` `[reject]` (intent) The timing number and screenshots are outside the diff : attached to the PR.
  - `[low]` `[patch]` (intent) N of M under a keyword is untested : test added.
  - `[low]` `[patch]` (intent) The board detail closing on a filtered-out torrent is untested : test added.
  - `[low]` `[patch]` (intent) The phone category button's count under a keyword is untested : test added.
  - `[low]` `[patch]` (intent) The category-switch test asserts the wrong scroller : asserts the scroller it moved.
  - `[low]` `[reject]` (intent) No test opens a real dialog over the open search : the rank order is unit-tested; the real search-over-detail order runs in e2e.
  - `[low]` `[patch]` (intent) 「其他按鈕不動」 checked only at 1280px : e2e at 1024px added.
  - `[low]` `[reject]` (blind) `fake show` does not match `Fake.Show` : the AC asks for literal matching; listed in the PR for Alex to decide.
  - `[low]` `[patch]` (blind) No Unicode normalization : NFKC on both sides; Simplified and Traditional folding not added (not in the AC).
  - `[low]` `[patch]` (blind) `toLocaleLowerCase()` without a locale : `toLowerCase()`.
  - `[low]` `[patch]` (blind) `q` has no length or control-character limit : capped and checked like `category`.
  - `[low]` `[patch]` (blind) Enter does nothing, so the phone keyboard stays up : Enter blurs the field.
  - `[low]` `[patch]` (blind) The echo queue can keep stale entries : drops up to the newest match; deferred-echo test.
  - `[low]` `[patch]` (blind) `setShortcutAction` keeps one provider per action : a per-action stack.
  - `[low]` `[patch]` (blind) A category with no torrents shows the no-result line : keeps 「這個分類沒有種子」.
  - `[low]` `[reject]` (blind) The no-result line hides matches in 已整理 : the AC excludes 已整理 from the list and the phone; a hint is not specified.
  - `[low]` `[patch]` (blind) Screen readers get little feedback : one always-mounted status region announces the result count.
  - `[low]` `[patch]` (blind) The phone loses its `h1` while searching : kept as `sr-only`.
  - `[low]` `[patch]` (blind) A long keyword can overflow the no-result block : `overflow-wrap: anywhere`.
  - `[low]` `[patch]` (blind) The pill check only runs at 1280px : same as the intent entry; fixed there.
  - `[low]` `[patch]` (blind) N of M and closing on the settings page are untested : tests added.
  - `[low]` `[patch]` (blind) The keystroke trace's mode check is weak : requires the expected mode.
  - `[low]` `[reject]` (blind) Doc links are not version-matched : the repo cites the same `latest` pages throughout; the pinned versions match their current content.
  - `[low]` `[patch]` (verification-gap) 要處理 says 「沒有」 while searching is never checked where it differs : test added.
  - `[low]` `[patch]` (verification-gap) A keyword change during an animation hold is untested : test added.
  - `[low]` `[patch]` (verification-gap) The board detail closing on a filtered-out torrent : same as the intent entry; fixed there.
  - `[low]` `[patch]` (verification-gap) The draft protection against late echoes is untested : deferred-echo test added.
  - `[low]` `[patch]` (verification-gap) Closing the search on `/settings` staying there is untested : test added.
  - `[low]` `[reject]` (verification-gap) The phone detail sheet's rank is never checked : needs a hardware keyboard on the phone; the rank mechanism is unit-tested.
  - `[low]` `[reject]` (edge) Esc clears a search hidden behind the phone detail sheet : the AC fixes search before detail.
  - `[low]` `[patch]` (edge) The no-result line overflows at 390px : same as the blind entry; fixed there.
  - `[low]` `[patch]` (edge) `q` length is unbounded : same as the blind entry; fixed there.
  - `[medium]` `[patch]` (edge) A momentary no-result remounts the board and resets its state : the no-result block no longer unmounts the board's state; test added.
  - `[low]` `[patch]` (edge) A keyword change during an extra sort's key hold keeps matches hidden : a keyword change applies at once.
  - `[low]` `[patch]` (edge) AltGr layouts cannot type `/` : AltGraph lets the key through.
  - `[low]` `[reject]` (edge, claim) `_authed.tsx` reuses `nameMatches` for keeping the hash : the same function as the selectors, so the rule cannot drift.

## Design Notes

Esc order by rank, not by open order: the AC fixes dialog > search > detail. A layer carries a rank; `Esc` closes the highest-ranked open layer, the most recent within a rank.

Claude 代決 (list in the PR): `toLocaleLowerCase` matching; trimmed empty keyword removes `q`; a reload with `q` opens the box; `/` is desktop only.

Docs (AD-11): MDN `KeyboardEvent.isComposing` https://developer.mozilla.org/en-US/docs/Web/API/KeyboardEvent/isComposing ; MDN `input type="search"` https://developer.mozilla.org/en-US/docs/Web/HTML/Element/input/search ; TanStack Router search params https://tanstack.com/router/latest/docs/framework/react/guide/search-params ; zod 4 https://zod.dev/api .

## Verification

**Commands:**
- `source ~/.nvm/nvm.sh && nvm use && npm run lint && npm run typecheck` -- expected: no errors
- `source ~/.nvm/nvm.sh && nvm use && npm test` -- expected: all pass
- `source ~/.nvm/nvm.sh && nvm use && npm run build && npx playwright test` -- expected: all pass, zero CSP violations
- `source ~/.nvm/nvm.sh && nvm use && npm run audit:prod` -- expected: passes
- `bash .claude/skills/next-story/check.sh` -- expected: every line ok

## Auto Run Result

Status: implemented, review not run yet.

**Summary.** `q` in the URL search (`src/shared/list-search.ts`: zod, read back to text like `category`, trimmed, only spaces is no keyword; `fixListSearch` trims or drops it with `replace`; `searchWithQuery`). Matching in `src/lib/name-search.ts` (`searchNeedle`: trim, `normalize('NFKC')`, `toLowerCase()`; `nameMatches`: `String.prototype.includes`, folded names cached per torrent object; `noResultText`; `q` at most 200 characters, no control characters). `selectVisibleTorrents` (view gains `query`) and `selectBoardColumns(maindata, category, query)` filter by name, the 已整理 column too; `useBoardColumns` caches per snapshot, category and keyword. The `_authed` layout puts `q` in the view, owns whether the box is open (open while a keyword is set, so a reload with `q` opens it; the magnifier or `/` opens it empty), and exposes `openSearch`, `setQuery` (writes `/` with `replace`, list back to the top) and `closeSearch` (removes `q` on the current page). A category switch keeps `q` (and keeps `hash` only when the new category holds it and its name matches); `openSettings` already carries the whole list search. The shortcut registry (`src/state/shortcuts.ts`) gains `/` (an action the desktop search box provides; not while typing, not with Cmd, Ctrl or Alt, not while a dialog is open), ranked `Esc` layers (`dialog` > `search` > `detail`, most recent within a rank; bottom sheets are `dialog`, the board panel and the phone detail sheet `detail`), Safari's `keyCode` 229 next to `isComposing`, and a listener that exists while a layer is open or an action is provided. `src/features/header/search-box.tsx`: desktop magnifier turns into the 240 x 36px pill (magnifier icon, `type="search"` field 「找名字」, ✕ 「清除搜尋」); phone field over the first row (44px, 16px text, 「取消」); focus into the field on open and back to the magnifier on close; IME composition not written until it ends. `IconButton` moved to `src/features/header/icon-button.tsx`. No-result block `ListNoResult` in `src/shared/ui/list-blocks.tsx` (「『<keyword>』在 <category> 找不到」 with 「在全部裡找」, or 「找不到『<keyword>』」 in 「全部」); the board shows it only when the four columns and 已整理 are all empty, and while searching every empty column says 「沒有」. The list's freeze and the board's animation hold treat a keyword change as Alex's own change (applied at once).

**Claude 代決 (for the PR).** NFKC plus `toLowerCase()` matching (review: replaces `toLocaleLowerCase`); `q` capped at 200 characters; a trimmed empty keyword removes `q`; a reload with `q` opens the box (without moving focus); `/` is desktop only; the box stays open after the keyword is deleted by typing (only ✕, 「取消」 or `Esc` close it); typing on the settings page goes to the list (like the other list setters), closing there stays on the page; each keystroke puts the list back at the top (EXPERIENCE 換篩選回到最上面); `/` does nothing while a dialog or sheet is open; the phone detail sheet ranks as the detail (after the search) even though it covers the page; Esc and Enter inside an IME composition are ignored, and so is Safari's `keyCode` 229; focus after 「在全部裡找」 goes to `main` like the retry block; the phone first row keeps 「種子」 only as a visually hidden `h1` while the field covers it; the result is announced 400 ms after the keyword rests; Enter leaves the field.

**Performance (100 ms budget).** `node scripts/trace-search-keystroke.mjs` on the built app with fake-qbit `many` (4165 visible torrents), headless Chromium 1440 x 900, dev Mac, 2026-11-18. Method: in the page, the field's value set and an `input` event dispatched (what React's onChange reads), `performance.now()` before it; commit = the first DOM change that alters the list's 「共 N 個」, the board's column counts or the no-result line (MutationObserver); frame = `requestAnimationFrame` then a `MessageChannel` task (after the first painted frame with the filtered result). Keystrokes 3, 31, 314, 3141 and back to empty, five rounds per mode (40 each):
- list (「全部」 remembers 加入時間): frame median 5.4 ms, p95 7.8 ms, max 18.2 ms; commit median 3.1 ms, max 6.5 ms.
- board: frame median 5.0 ms, p95 6.5 ms, max 12.4 ms; commit median 2.6 ms, max 5.0 ms.
- Rerun after the review fixes (the mode check now requires `list:` / `board:`): list frame median 5.8 ms, max 15.4 ms; board frame median 5.9 ms, max 11.5 ms.
Summary JSON: `e2e-output/screenshots/3-5/keystroke-timing.json` (gitignored).

**Screenshots.** `e2e-output/screenshots/3-5/` from `e2e/search.spec.ts`, desktop 1280 x 800 and phone 390 x 844, light and dark: `search-open-*`, `board-results-*`, `no-result-category-*`, `no-result-all-*`.

**Docs (AD-11).** MDN `KeyboardEvent.isComposing` https://developer.mozilla.org/en-US/docs/Web/API/KeyboardEvent/isComposing ; MDN `input type="search"` https://developer.mozilla.org/en-US/docs/Web/HTML/Element/input/search ; TanStack Router search params https://tanstack.com/router/latest/docs/framework/react/guide/search-params ; zod 4 https://zod.dev/api .
