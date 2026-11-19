---
title: 'Story 3.7: keyboard shortcuts and help dialog'
type: 'feature'
created: '2026-11-19'
status: 'in-review'
review_loop_iteration: 0
followup_review_recommended: false
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-3-context.md'
warnings: ['oversized']
deferred: []
baseline_commit: '32936ec3dfef450a6a13b73c9be5f733e473bfaa'
---

<intent-contract>

## Intent

**Problem:** On desktop the shortcut registry only knows `Esc` and `/`. Alex cannot change torrents, jump categories or pick a common sort from the keyboard. The 快捷鍵 header button is a disabled placeholder, and the tab and button tooltips do not show their keys.

**Approach:** Complete the one registry in `src/state/shortcuts.ts` (key, description, group per entry) and have each feature provide the action behind a key, only at desktop width. Enable the 快捷鍵 button and `?` to open a shadcn `Dialog` listing the registry by group. Tooltips for tabs, the search and 快捷鍵 buttons, and the sort menu digits read the same table.

## Boundaries & Constraints

**Always:**
- One table in `src/state/shortcuts.ts` holds every shortcut: `/`, `Esc`, `↑` `↓`, `1` to `9`, `[` `]`, `S` then `1` to `5`, `?`. Each entry has its key(s), description text and group. The help dialog, tab tooltips, the search and 快捷鍵 button tooltips and the sort menu's `1` to `5` hints all derive their text from it.
- Keep the existing rules: in an input only `Esc`; any Cmd, Ctrl or Alt combo is not intercepted (AltGraph allowance stays); IME composition (`isComposing`, keyCode 229) is ignored; held-key repeat ignored; `defaultPrevented` skipped. Shift is allowed (`?`, `S`); `s` and `S` both open the sort menu.
- Desktop only (1024px and up): every new action is provided only when `useIsDesktop()` is true, the same way `search-box.tsx` provides `openSearch`. Phone has no 快捷鍵 button and no new keys.
- While any `dialog`-rank layer is open (help dialog, bottom sheets), no action runs (existing `runAction` rule). The help dialog registers a `dialog` layer with `useEscapeLayer(open, close, 'dialog')` so `/` and the other keys stay blocked and `Esc` closes it first (dialog > search > detail).
- `↑` `↓` are Alex's own choice: they write through `setHash` (remembered as last viewed), never `followHash`. The URL `hash` changes with `replace`.
- Number keys and `[` `]` go through `selectCategory` from `useListView()` (cancels the restore, switches to the remembered sort, scrolls to top). `S` + digit goes through the same `pickSort` and `pickView` path as clicking the menu item.
- Keep PR #40's structure: restore logic stays in `src/state/resume-last-place.ts`, search open state in `src/state/search-open.ts`; `src/state` never imports `src/shared/ui`; `features/header` never imports `features/list`, `features/detail` or `features/board` (cross-feature wiring goes through `src/state`).
- UI strings exactly as below (Traditional Chinese). No new dependencies: the Dialog is the existing `src/shared/ui/dialog.tsx` (Radix, already installed).

**Never:**
- No custom shortcuts, no shortcut settings, no animation or gesture libraries, no Radix Tooltip (tooltips stay native `title`).
- No wrapping at the first or last tab, row or card.
- No change to the 3.6 rule that a restored row is never scrolled into view on open; only `↑` `↓` scroll.
- No writes to the real qBittorrent anywhere (AD-15).

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| List next | List mode, viewed row k of the frozen order, press `↓` | Row k+1 is viewed, detail follows, URL `hash` replaced, focus moves to that row's button and it scrolls into view if off screen | Last row: nothing changes, key consumed (no page scroll) |
| List prev at top | Viewed row is the first, press `↑` | Nothing changes | Key consumed |
| Board with detail | Board, detail panel open on card in column C, press `↓` | Next card in the same column, same function as ‹ › | Column end: no move, never jumps column |
| Board without detail | Board, no detail open, `↑`/`↓` | No action; native scrolling untouched | Not consumed |
| Number key | Tabs 全部, A, B; press `3` | Switches to B like a click | `5` with only 3 tabs: no-op; tabs not loaded yet: no-op |
| Bracket keys | Current is first tab, press `[` | No-op | No wrap |
| Sort by key | Press `S`, menu opens, press `3` | 加入時間 picked exactly like clicking; tab digit action does not fire | Pressing the selected sort's digit flips direction and keeps the menu open (2.1 rule); 狀態 selected + `1` does nothing |
| Help | Press `?` or click 快捷鍵 | Dialog 「快捷鍵」 lists every registry group; `Esc` or ✕ closes | While open, `/`, digits and arrows do nothing |
| Input focus | Typing in the search box, press `1`, `?`, `S`, `↓` | Typed as text, no shortcut | `Esc` still closes the search |
| Modifier | `Cmd+1`, `Ctrl+[`, `Alt+S` | Browser default, not intercepted | n/a |
| Phone width | Width below 1024px, any new key | Nothing happens; no 快捷鍵 button | n/a |

</intent-contract>

## Code Map

- `src/state/shortcuts.ts` -- registry. `Shortcut` (:41) has `key, inInputs, description, run`; `SHORTCUTS` (:100) has only `Escape` and `/`. `ShortcutAction = 'openSearch'` (:69) with a provider stack per action (:72); `runAction` (:94) refuses while a layer of rank ≥ dialog is open. `handleShortcut` (:133) holds the composing, repeat, modifier and AltGraph rules; `isTypingTarget` (:116). Hooks `useEscapeLayer` (:226), `useShortcutAction` (:245). Extend here: groups, display keys, new actions (parameterised where needed, e.g. digit index).
- `src/state/shortcuts.test.ts` -- existing coverage of input rule, modifiers, AltGr, IME, ranks; extend.
- `src/shared/ui/dialog.tsx` -- stock shadcn Radix Dialog (`DialogContent` with ✕ labelled 「關閉」). Unused so far. Radix handles `Esc` itself and calls `preventDefault`, so the registry skips it; the feature must still push the `dialog` layer. `shared/ui` may not import `src/state` (layer rule), so the layer is registered by the help dialog feature, not inside `dialog.tsx`.
- `src/shared/ui/breakpoint.ts` -- `useIsDesktop()`, `DESKTOP_QUERY` (1024px).
- `src/features/header/app-shell.tsx` -- desktop header (:67-84): `<IconButton label="快捷鍵">` with `Keyboard` icon and no `onClick` (:80-82) is the disabled placeholder; comment :45-48 says placeholders have no `title` yet. Phone tree `lg:hidden` (:87) has no 快捷鍵 button.
- `src/features/header/icon-button.tsx` -- `IconButton({ label, phone, onClick, current, buttonRef, children })`; disabled without `onClick`; no `title` prop yet.
- `src/features/header/search-box.tsx` -- desktop magnifier; provides `openSearch` only when `!phone && current` (:96-97). Pattern to copy for the desktop gate.
- `src/features/header/category-tabs.tsx` -- `DesktopCategoryTabs` (:42), buttons `onClick={() => onSelect(tab.key)}` (:112); comment :33 reserves tooltips for 3.7. Tabs come from `useCategoryTabs()` (`src/state/list-view.ts:131`), `undefined` until ready.
- `src/routes/_authed.tsx:366-419` -- `selectCategory(next)`; exposed through `useListView().selectCategory`.
- `src/features/header/sort-menu.tsx` -- `DesktopSortMenu` (:45), local `open` state (:47) on Radix `DropdownMenu` (:119); top-5 digit hint is an `aria-hidden` span from `field.top` (:106-113); `onPick` (:68) calls `pickSort(view, id)` (`sort-model.ts:92`) then `resetListScroll()` and `pickView(next)`. Top five ids: `TOP_SORT_FIELDS` (`src/shared/sort-fields.ts:287`): state, seeding_time, added_on, ratio, completion_on.
- `src/features/list/torrent-list.tsx` -- frozen order via `useFrozenOrder` (~:124); virtualizer `useVirtualizer` (~:266-276) inside `TorrentRows`; no `scrollToIndex` use yet. Scroller `#rt-list-scroll`.
- `src/features/list/torrent-row.tsx` -- row is a native `<button>` with `aria-current` and `viewing-ring` (inset 2px, `src/styles.css:288`); keyboard focus is the outer outline.
- `src/state/viewed-hash.ts` -- `ViewedHashControl { hash, setHash, followHash }` (:12), `useViewedHash()`.
- `src/state/shown-order.ts` -- `useShownList()` gives `{ order, viewed }` of the shown list; `src/lib/detail-position.ts:19` `detailPosition(order, hash) => { index, total, prev, next }`.
- `src/features/detail/detail-header.tsx` -- ‹ › call `go(position.prev|next)` then `onNavigate(target)` (:121-139); list panel `list-detail-panel.tsx` and board panel `board-detail-panel.tsx` pass `onNavigate={setHash}`.
- `src/features/detail/board-detail.ts:20` -- `useBoardDetailTarget({ phone })`: same-column `detailPosition` over the live column; non-null means the board detail is open. `board-detail-panel.tsx:66` already pushes a `detail` Esc layer.
- `e2e/search.spec.ts:217-228` -- template for a keyboard e2e; helpers in `e2e/fixtures.ts` (`login`, `openList`, `listScrollTop`).
- `scripts/trace-category-switch.mjs` -- template for a local script that starts `scripts/fake-qbit.mjs` and drives Chromium; base the recording script on it.

## Tasks & Acceptance

**Execution:**
- `src/state/shortcuts.ts` -- add groups and display keys to the table; add actions `prevItem`, `nextItem`, `selectTab(index)`, `prevTab`, `nextTab`, `openSortMenu`, `pickTopSort(index)`, `openHelp`; while a `pickTopSort` provider exists, digits `1` to `5` go to it and not to `selectTab`; export a pure helper that returns a shortcut's tooltip or hint text from the table -- one source for dialog and tooltips.
- `src/state/shortcuts.test.ts` -- registration of every entry with key, description and group; input rule, modifier rule, IME, Shift allowed, `s`/`S`; digit routing to `pickTopSort` over `selectTab`; actions refused under a dialog layer; tooltip text and help rows built from the same table.
- `src/features/header/icon-button.tsx` -- optional `title` prop.
- `src/features/header/shortcut-help.tsx` (new) -- `ShortcutHelp` dialog: `Dialog` from `src/shared/ui/dialog.tsx`, title 「快捷鍵」, rows generated from the registry by group (keys in `<kbd>`, then description); `useEscapeLayer(open, close, 'dialog')`; provides `openHelp` on desktop.
- `src/features/header/app-shell.tsx` -- desktop 快捷鍵 button enabled (`aria-label`「快捷鍵」), opens the help, tooltip from the registry; phone tree unchanged; update the placeholder comment.
- `src/features/header/search-box.tsx` -- magnifier tooltip from the registry.
- `src/features/header/category-tabs.tsx` -- tooltips on the first 9 tabs with their digit (none from the 10th); provide `selectTab`, `prevTab`, `nextTab` on desktop through `selectCategory`, no wrap, no-op when tabs are undefined or the index is missing.
- `src/features/header/sort-menu.tsx` -- provide `openSortMenu` on desktop; while open provide `pickTopSort` that runs the same `onPick` path; digit hints read from the registry.
- `src/features/list/torrent-list.tsx`, `src/features/list/torrent-row.tsx` -- provide `prevItem`/`nextItem` in list mode on desktop: frozen-order neighbour via `detailPosition`, `setHash`, consume at the ends; bring the target into view (`scrollToIndex` on the virtualizer) and focus its row button; Tab to another row shows the focus outline while the viewed row keeps its inner ring.
- `src/features/detail/board-detail-panel.tsx` (or `detail-header.tsx`) -- in board mode, provide `prevItem`/`nextItem` only while the detail is open, calling the same function as ‹ ›.
- `src/features/header/*.dom.test.tsx`, `src/features/list/*.dom.test.tsx`, `src/features/detail/*.dom.test.tsx` -- DOM tests for the matrix rows: help dialog open/close and content from the registry, blocked keys while open, digits and brackets, `S` + digit, list arrows with focus, board arrows with and without detail, phone width does nothing.
- `e2e/shortcuts.spec.ts` (new) -- desktop: `2` switches category, `S` then `3` picks 加入時間, `↓` changes the viewed row and the focused row, `?` opens the dialog, `Esc` closes it; phone width: no 快捷鍵 button.
- `scripts/record-shortcuts.mjs` (new) -- local script on fake-qbit that records a Playwright video of the keyboard flow (switch category, pick a sort, `↑` `↓`, `Esc`) into `_bmad-output/implementation-artifacts/screenshots/3-7/`.

**Acceptance Criteria:**
- Given the desktop header, when Alex hovers the 快捷鍵 button, then it is enabled with `aria-label`「快捷鍵」 and a tooltip naming `?`; the search button's tooltip names `/`; the first nine tabs' tooltips name their digit.
- Given a tooltip or the help dialog, when its text is compared with the registry, then both come from the same table (vitest).
- Given `?` or a click on 快捷鍵, when the dialog opens, then it shows every group from the registry, and `Esc` or ✕ closes it with focus returned.
- Given list mode, when Alex presses `Tab` onto another row, then that row shows the focus outline and the viewed row keeps its inner ring.

## Spec Change Log

- 2026-11-19, first review pass: `src/shared/ui/dialog.tsx` became non-modal Radix plus `useModalSession` (Radix's modal scroll lock injects a `<style>` the CSP blocks); the session starts in a child inside the content and ends on close, `modal` and `DialogOverlay` are removed, focus returns through `returnFocus` only. `↑` `↓` repeats step; Shift is allowed only for `?` and `S`; `↑` `↓` are not handled while focus is in the detail tab list or tab panel (`OWN_ARROWS`), but are from the header's ‹ › and ✕. `openHelp` refuses while the sort menu is open; the help closes below desktop width. KEEP: one registry as the text source; actions provided only at desktop width; `setHash` for arrows; `selectCategory` and `pickSort` paths.
- 2026-11-19, follow-up pass: Shift is rejected only for `↑` `↓` (printable keys keep it: German `/`, AZERTY digits). While the sort menu is open only its digits act (`/`, `[`, `]`, `?` refused); an outside close leaves focus where Alex put it. The scrim carries `data-state`; the toast region does not dismiss the dialog. Held `↓` steps from the last stepped-to row; a pending row focus is dropped on the next other key or pointer press. Help groups are `role="group"`, not landmarks.
- 2026-11-19, multi-model review after merge (opus, fable, sonnet, haiku; branch story/3-7-review): A key pressed inside any open Radix menu (`role="menu"`, which keeps focus while open) runs only the digits. They go to the sort menu's `pickTopSort` and do nothing in the ⋯ or file priority menu. `sortMenuOpen()` and its three guards are removed. Before this, `2` or `]` with ⋯ open switched the category, and the open menu then acted on another torrent; a new e2e test fails on the old code. Held `↑` `↓` write the URL at most once per 200ms. Focus and scroll follow every step, and a new press writes at once. A pending write is sent before another key acts, on a pointer press, on window blur and when the page is hidden. The stepping code moved to `src/features/list/use-arrow-stepping.ts`. `check.sh` skips binary files for the dash count only, so the IP and secret checks scan them again. A test ties the sort digits to `TOP_SORT_FIELDS`.

## Review Triage Log

### 2026-11-19: Review pass
- verdicts: 32 findings, high 2, medium 4, low 24, false 2, maybe-false 0
- findings:
  - `[high]` `[patch]` (verification-gap) The dialog's modal session never starts (layout effect runs once while closed), so the page behind is not inert or scroll-locked while `aria-modal` is set : start and end the session on Radix's open state; DOM test asserts inert, overflow and their reset, plus scrim press closing.
  - `[low]` `[patch]` (verification-gap) Narrowing to phone width hides the help but leaves it open, so widening shows it again : close it below desktop width.
  - `[high]` `[patch]` (edge) Modal session never begins : same as the verification-gap entry; fixed there.
  - `[medium]` `[patch]` (edge) The session would only end on unmount, not on close : ends when the dialog closes.
  - `[low]` `[patch]` (edge) Help reappears after a resize : same as above.
  - `[medium]` `[patch]` (edge) A pending row focus can go stale and steal focus later : cleared after one frame or when focus moves elsewhere.
  - `[low]` `[patch]` (edge) `?` with the sort menu open makes the help dismiss itself : `openHelp` refuses while the sort menu is open.
  - `[low]` `[patch]` (edge) Closing an `S`-opened menu from its trigger returns focus to the old element : the trigger keeps focus.
  - `[low]` `[patch]` (edge) A negative e2e assertion reads the URL at once : settles first.
  - `[low]` `[patch]` (edge) The recording script leaves `.raw-video` on failure : try/finally cleanup.
  - `[low]` `[patch]` (blind) Holding an arrow moves one row then lets the list scroll : arrow repeats step rows.
  - `[medium]` `[patch]` (blind) A stale pending focus steals focus : same as the edge entry; fixed there.
  - `[medium]` `[patch]` (blind) `↑` `↓` change the torrent while focus is inside the detail panel, breaking keyboard scrolling there : not handled while focus is inside the detail panel.
  - `[low]` `[reject]` (blind) Board focus stays on the focused card : the AC asks board keys to match ‹ ›, whose focus rule is kept; focus following is a list-mode requirement.
  - `[low]` `[patch]` (blind) Two mechanisms return focus on close : one path through `returnFocus`; the stale comment fixed.
  - `[low]` `[patch]` (blind) `dialog.tsx` still accepts `modal` and exports an overlay that renders nothing : removed.
  - `[low]` `[patch]` (blind) The modal behaviour has no tests : same as the verification-gap entry; Tab wrapping added.
  - `[low]` `[patch]` (blind) The registry layer leaves before the exit animation ends : the layer stays until the content unmounts.
  - `[low]` `[patch]` (blind) The e2e promises a top-edge check it never runs : added.
  - `[low]` `[patch]` (blind) Negative e2e assertions run at once : same as the edge entry.
  - `[low]` `[patch]` (blind) `replace` for the arrow hash is never checked : e2e asserts history length is unchanged.
  - `[low]` `[patch]` (blind) The e2e compares a tab label with the URL key : reads the tab's key attribute.
  - `[low]` `[patch]` (blind) Shift is allowed on every key, so Shift+arrows step rows : Shift only for entries that need it.
  - `[low]` `[patch]` (blind) The recording script cleanup : same as the edge entry.
  - `[low]` `[reject]` (blind) Each re-recording adds a binary to history : the AC asks for the video in the PR; one file, replaced only when the flow changes.
  - `[low]` `[reject]` (blind) The help does not say what arrows do on the board without detail : the note 「看板打開詳情時換同一欄」 states when they act.
  - `[low]` `[patch]` (blind) `?` and `S` store the return target differently : one helper.
  - `[low]` `[patch]` (intent) Board arrows, brackets and stacked `Esc` have no real-browser test : e2e for board arrows with detail open and `Esc` closing help before search.
  - `[low]` `[reject]` (intent) Digit and bracket switches use a mocked `selectCategory` in DOM tests : the real path is covered by the e2e digit test and 3.2's tests.
  - `[false]` `[reject]` (intent) `sortMenuDigit` reads a module constant : the same constant builds the registry entry, so the source is one.
  - `[false]` `[reject]` (intent) "UI strings exactly as below" points at nothing : the strings are in Design Notes of the same spec and the code matches them.
  - `[low]` `[reject]` (intent) Files outside the named paths changed : each is needed (CSP fix, focus logic, `data-hash` for focus, the recording the AC asks for).

### 2026-11-19: Review pass (follow-up)
- verdicts: 27 findings, high 0, medium 4, low 18, false 5, maybe-false 0
- findings:
  - `[false]` `[reject]` (verification-gap) No gaps found in the changed behaviour : nothing to act on.
  - `[medium]` `[patch]` (verification-gap) Shift now blocks `/`, digits and Esc on layouts that need Shift : Shift is rejected only for `↑` `↓`.
  - `[low]` `[patch]` (verification-gap) The scrim lost its fade : `data-state` set from the open state.
  - `[low]` `[reject]` (intent) Held repeats step instead of being ignored : first-pass decision recorded in the change log.
  - `[low]` `[reject]` (intent) Digits go to the open sort menu however it opened : the menu's digits are the menu's keys; the AC says "效果同點選單".
  - `[false]` `[reject]` (intent) The dialog file was changed : first-pass decision (CSP) recorded.
  - `[low]` `[reject]` (intent) Sort hints share a constant rather than reading the entry : one source module; descriptions now built from it too.
  - `[low]` `[reject]` (intent) The help layer lives with the content mount : intended, so the exit animation does not let keys act behind it.
  - `[false]` `[reject]` (intent) Arrows are not taken inside the detail tabs and body : first-pass decision recorded.
  - `[low]` `[reject]` (intent) Downstream effects of `selectCategory` and `setHash` are asserted through mocks : those functions keep their own tests from 3.2 and 3.6.
  - `[medium]` `[patch]` (blind) `/`, `[`, `]` still run while the sort menu is open : refused like `?`.
  - `[medium]` `[patch]` (blind) The Shift rule breaks `/` on some layouts : same as the verification-gap entry.
  - `[low]` `[patch]` (blind) The scrim animation classes never apply : same as above.
  - `[low]` `[patch]` (blind) A pending row focus never expires : cleared on the next keydown or pointerdown.
  - `[false]` `[reject]` (blind) List arrows do nothing with no viewed row : desktop list mode always views a row (`fallbackFirst`); an empty list has nothing to step to.
  - `[low]` `[reject]` (blind) Board arrows keep focus on the old card and do not scroll : same rule as the board ‹ › (first pass).
  - `[low]` `[patch]` (blind) Two descriptions hard-code text the table builds : built from the digit constants.
  - `[low]` `[reject]` (blind) The sort pill tooltip does not name `S` : the AC names only the search and 快捷鍵 buttons and the tabs.
  - `[low]` `[patch]` (blind) Help groups are region landmarks : heading plus list, no landmarks.
  - `[low]` `[patch]` (blind) `[` `]` and `/` over the sort menu are untested in a browser : e2e for brackets, DOM for the menu cases.
  - `[false]` `[reject]` (blind) `[` `]` do nothing when the selected category has no tab : the selected category always keeps a tab (count 0 when empty, 3.2).
  - `[low]` `[patch]` (blind) The recording script has an unexplained wait : real wait or comment.
  - `[low]` `[reject]` (blind) The video adds a binary to history : the AC asks for the recording.
  - `[medium]` `[patch]` (edge) An `S`-opened menu closed from outside pulls focus back : outside interaction clears the return target.
  - `[low]` `[patch]` (edge) Focus into the toast region dismisses the dialog : prevented for the toast region.
  - `[low]` `[patch]` (edge) Held repeats can compute the same target before the URL updates : step from the last stepped-to hash.
  - `[low]` `[patch]` (edge) The browser can be orphaned if the server exits early : closed inside `record()`.

## Design Notes

**Claude 代決.**
- Groups and order in the table and dialog: 「換種子」(`↑` `↓`), 「換分類」(`1` 到 `9`, `[` `]`), 「排序」(`S` 再按 `1` 到 `5`), 「搜尋和關閉」(`/`, `Esc`), 「說明」(`?`). Most-used groups first, answering the design-advisor note that the frequent keys must not drown.
- Descriptions reuse EXPERIENCE's wording: 「上一個、下一個」 (with the board note 「看板打開詳情時換同一欄」), 「跳到分類，照分頁順序，1 是「全部」」, 「上一個、下一個分類」, 「打開排序選單，再按 1 到 5 選常用排序」, 「打開搜尋框找名字」, 「清除搜尋、關掉視窗或詳情」, 「打開快捷鍵說明」.
- Tooltip text: tabs 「快捷鍵 2」; search 「搜尋（/）」; 快捷鍵 button 「快捷鍵（?）」. Native `title`.
- At the first or last row the arrow is consumed so the list does not also scroll; with the board detail closed it is not consumed.
- The dialog layer is registered by `ShortcutHelp`, not inside `src/shared/ui/dialog.tsx`: the spine's layer rule forbids `shared` importing `src/state`. Any later dialog feature does the same.
- The video is committed under `screenshots/3-7/` and linked from the PR, since `gh` cannot attach files.

**AD-11 docs (versions per package.json).**
- Radix Dialog (react-dialog 1.3.1): https://www.radix-ui.com/primitives/docs/components/dialog
- shadcn Dialog: https://ui.shadcn.com/docs/components/dialog
- Radix Dropdown Menu keyboard: https://www.radix-ui.com/primitives/docs/components/dropdown-menu#keyboard-interactions
- TanStack Virtual v3 `scrollToIndex`: https://tanstack.com/virtual/v3/docs/api/virtualizer#scrolltoindex
- MDN `KeyboardEvent.key`: https://developer.mozilla.org/en-US/docs/Web/API/KeyboardEvent/key
- Playwright videos: https://playwright.dev/docs/videos

## Verification

**Commands:**
- `source ~/.nvm/nvm.sh && nvm use && npm run lint && npm run typecheck` -- expected: no errors
- `source ~/.nvm/nvm.sh && nvm use && npm test` -- expected: all pass
- `source ~/.nvm/nvm.sh && nvm use && npm run build && npx playwright test` -- expected: all pass, no CSP violations
- `bash .claude/skills/next-story/check.sh` -- expected: every line ok

## Auto Run Result

Status: done

**Summary.** One registry in `src/state/shortcuts.ts` (key, description, group per entry) with desktop-only actions: `↑` `↓` step the list (frozen order, `setHash`, focus follows, scroll into view) or the board column while the detail is open; `1` to `9` and `[` `]` switch tabs through `selectCategory` without wrapping; `S` then `1` to `5` pick through the menu's own path; `?` and the 快捷鍵 button open a Dialog generated from the registry. Tooltips read the same table.

**Review.** First pass: 32 findings (high 2, medium 4), patched the dialog's modal session never starting, stale focus, arrows inside the detail, repeats, Shift, e2e gaps; rejected 7 with reasons. Follow-up pass: 27 findings (no high, medium 4), patched Shift on non-US layouts, keys over the open sort menu, outside-close focus, scrim fade, toast region, held-key stepping; rejected 12 with reasons. Nothing deferred.

**Follow-up review: not recommended.** No high was patched on the follow-up pass.

**Deviation.** `src/shared/ui/dialog.tsx` is non-modal Radix plus `useModalSession`, because Radix's modal scroll lock injects a `<style>` the CSP blocks.
