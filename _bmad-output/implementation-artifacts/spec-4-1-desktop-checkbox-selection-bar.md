---
title: 'Story 4.1: desktop checkboxes and selection bar'
type: 'feature'
created: '2026-11-19'
status: 'done'
baseline_revision: '51038f5c6defec15f0cf251dda63713606845064'
review_loop_iteration: 0
followup_review_recommended: true
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-4-context.md'
warnings: ['oversized']
deferred:
  - summary: >-
      The selection bar's stateBeforeMove wiring has no bar-level test with a moving torrent.
    evidence: |-
      selection-total.test.ts pins the pure function with a moving torrent, but selection-bar.dom.test.tsx and e2e/selection.spec.ts have no moving fixture, so passing {} instead of stateBeforeMove would go unnoticed. Add a moving fixture when story 4.3 wires the delete size to the same selector.
    location: >-
      src/features/selection/selection-bar.tsx
    severity: low
---

<intent-contract>

## Intent

**Problem:** Alex cannot pick several torrents at once. Epic 4's delete (4.3) and Epic 5's move need a selection. Story 4.1 covers the desktop half: hover checkboxes on list rows and board cards, and a floating selection bar that shows how many torrents are picked and how big they are.

**Approach:**
- Add an ordered selection store in `src/state/selection.ts`.
- On desktop (1024px and up), add a hover checkbox to each list row and board card, placed as a sibling of the row or card button.
- Add a selection pill composed in the home route. It shows 「已選 N 個」 and 「共 X GB」, and has 取消, 改路徑 (disabled) and 刪除（含檔案） (disabled).
- The total comes from a `src/lib` selector.
- A selection freezes the list order.
- A selection lifts the toast above the bar.

## Boundaries & Constraints

**Always:**
- Selection is an ordered hash array, earliest tick first.
- It clears when the category or the search query changes. This includes restore, back/forward, digit shortcuts and 「在全部裡找」.
- It does not clear on a round trip to `/settings` when category and query are unchanged.
- After every maindata update, hashes no longer in `torrents` drop out.
- The total sums `torrent.size`, the same field the row shows, and only for torrents whose files exist. Exclude `statusOf(...) === 'archived'` (已整理) and `heroKindOf(...) === 'missing_files'` (找不到檔案), both from `src/lib/torrent-status.ts`.
- The count uses `formatCount`. The size uses `formatSize`.
- Clicking the checkbox only toggles selection, and the detail stays as it is. Clicking the rest of the row or card still calls `setHash`.
- The checkbox must not sit inside the row's or card's `<button>`, because nested interactive elements are not allowed. It goes in the `role="listitem"` wrapper as a sibling, positioned over the row's reserved 20px slot (row) or at -6px/-6px of the card's top-left corner with its own `surface` background (card).
- The card checkbox must not be clipped by the card's `overflow-hidden` or the column scroller. The first card in a column needs at least 6px of top room.
- The checkbox's `aria-label` is 「選取 <torrent name>」.
- Bar text and labels must match the spec exactly: 已選 N 個, 共 X GB, 取消, 改路徑, 刪除（含檔案）.
- Animations change only `transform`. With `prefers-reduced-motion: reduce`, the bar and the toast appear and disappear with no transition.
- Layers stay as they are:
  - The store is in `src/state`.
  - The sum is in `src/lib`.
  - The bar is a new feature `src/features/selection/` composed only in `src/routes/_authed/index.tsx`, because features never import each other.
  - `src/state` never imports `src/shared/ui`.
  - `toast-store` is written only through `src/lib/toast.ts`.
- Keep these in place:
  - PR #42: `use-arrow-stepping.ts`, the `[role="menu"]` / `inMenus` menu check in `shortcuts.ts`, and the fact that `sortMenuOpen()` no longer exists.
  - PR #40: the split between `followHash` and `setHash`.

**Never:**
- No phone selection. Long press, the two-row phone bar and the 28px shift belong to Story 4.2. Below 1024px there is no checkbox and no bar.
- No select all.
- No `Esc` or keyboard shortcut to clear the selection.
- Do not wire delete. That is 4.3.
- No new dependency.
- No inline `style` attribute on the toaster, because CSP blocks it.
- Never sort torrents inside a feature.
- Never write to the real qBittorrent (AD-15).

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Tick order | tick B, then A, then C | store `[B, A, C]`; untick A gives `[B, C]` | none |
| Gone hash | `[B, A]`, next maindata lacks A | `[B]`; bar reads 已選 1 個 | none |
| All gone | every selected hash vanishes | selection empty, bar slides out, list reorders once | none |
| Category change | `[B]`, Alex presses `2` | selection `[]` | none |
| Settings round trip | `[B]`, open /settings, come back, same category and query | still `[B]` | none |
| Mixed total | 3 selected: 100 GB normal, 50 GB 已整理, 20 GB 找不到檔案 | 已選 3 個, 共 100 GB | none |
| Only missing | 2 selected, both 已整理 | 已選 2 個, 共 0 B (`formatSize(0)`) | none |
| Big count | 3,626 selected | 已選 3,626 個 | none |
| Toast while bar shows | failure toast fires with a selection | toast sits 16px above the bar | none |

</intent-contract>

## Code Map

- `src/state/order-freeze.ts:22` `FreezeReasons`. Add a `selection` reason that `isOrderFrozen()` ORs in. The comment already says "The selection joins later". `isBoardFrozen()` stays animation-only (EXPERIENCE: the board is not affected). Tests live in `order-freeze.test.ts` (`F6 freeze reasons` at line 160).
- `src/state/pending-ops.ts` has `prunePending(exists)` around line 65, called from a `useEffect` on `useMaindata(selectTorrents)`. Copy that pattern for pruning gone hashes.
- `src/state/maindata.ts` provides `useMaindata(select)` at line 170 and `selectTorrents` at line 183.
- Store pattern: `createStore` and `useSelector` from `@tanstack/react-store` 0.11.2, as in `order-freeze.ts:152` and `pending-ops.ts:23`. Exported setters, plus `reset*()` for tests.
- `src/routes/_authed.tsx` builds `view = {sort, dir, category, query}`. `selectCategory` is at line 366 and search goes through `useSearchOpen`. Do not move the restore or search logic back into this file.
- `src/routes/_authed/index.tsx` `Home` renders `TorrentList` or `BoardHome`. Compose `<SelectionBar/>` here, desktop only, together with the scope and prune hook. `BoardHome`'s `isEmptySpace` already treats a `button` (the Radix checkbox root) as non-empty.
- `src/features/list/torrent-row.tsx:80` is the reserved slot `<span aria-hidden className="hidden size-5 flex-none lg:block"/>`. `RowContent` is a `<button onClick={onOpen}>` with `rounded-row hover-row` and a `viewing-ring`. `TorrentRow` is `memo`'d, so pass `selected` as a prop so memo still works.
- `src/features/list/torrent-list.tsx` `TorrentRows` holds the virtualizer and the `role="listitem"` wrappers. The scroll div is `#rt-list-scroll` with `LIST_SCROLL_CLASS` (`list-states.tsx:27`). The token `--spacing-page-desktop-bottom: 110px` (`styles.css:210`) is unused.
- `src/features/board/board-card.tsx` `CardContent` is a `<button>`. `CARD_CLASS` has `overflow-hidden`, and the comment says "No checkbox (Epic 4)". Its wrapper is the absolute `role="listitem"` div in `card-list.tsx` around line 300. The column virtualizer has `paddingStart: 4` and `paddingEnd: 12` (`board-column.tsx` around line 148). The scroller is `overflow-y-auto px-3`. `archived-column.tsx` reuses `CardList`, so expanded 已整理 cards get the checkbox too.
- `src/shared/ui/checkbox.tsx` is the Radix Checkbox, already 20px and 6px with `bg-primary`. Tailwind's `primary` is the brand accent, and Tailwind's `accent` is not. Reuse it.
- `src/shared/ui/toaster.tsx` `Toaster` is `fixed … lg:bottom-6 lg:right-6 z-[60]`, mounted in `src/routes/__root.tsx:39`. It has no `style` attribute.
- `src/shared/toast-store.ts` and `src/lib/toast.ts` are the toast API (`failure`, `dismissFor`). The lift from `spec-2-6-pause-resume-and-toast.md:41` was never built.
- `src/lib/torrent-status.ts` has `heroKindOf` at line 239, `statusOf` at line 275 and `classify` at line 402. `src/lib/format.ts` has `formatCount` at line 63 and `formatSize` at line 74.
- `src/styles.css` tokens:
  - `bg-selection-row`, `bg-selection-bar`, `text-selection-bar-foreground`, `bg-delete`, `text-delete-foreground`, `bg-surface`, `shadow-float`.
  - The motion convention is `@keyframes` plus `@utility animate-*` with `cubic-bezier(0.2,0.8,0.2,1)` and a reduced-motion `animation:none`.
- Mockup: `_bmad-output/planning-artifacts/ux-designs/ux-react-torrent-2026-11-13/mockups/S07-delete-desktop.dc.html` around line 33, the bar. UX `DESIGN.md` around line 265 has the checkbox and selection-bar. `EXPERIENCE.md` around line 251 has the freeze rule.
- e2e:
  - `e2e/fixtures.ts` provides `setModes`, `login`, `openList` and `opCalls`.
  - The `SAMPLE` data has E04 (private missing, 找不到檔案) and E05/E06 (已整理).
  - Copy `e2e/pause.spec.ts` for screenshots: `SCREENSHOT_DIR`, `DESKTOP` 1440x900, `SCHEMES`, `[data-slot="toast"]`.

## Tasks & Acceptance

**Execution:**
- `src/lib/selection-total.ts` (+ test). Write a pure `selectionTotal(torrents, hashes, stateBeforeMove) → { count, bytes }`. `count` is the number of selected hashes present in `torrents`. `bytes` sums `size` over present torrents that are neither 已整理 nor 找不到檔案. Also write `selectionBarText(...)` or equivalent for 「已選 N 個」 and 「共 X GB」 using `formatCount` and `formatSize`. Test the matrix rows.
- `src/state/selection.ts` (+ test).
  - Write a TanStack Store `{ hashes: string[], scope: string | null }` with `toggleSelected(hash)`, `clearSelection()`, `pruneSelection(exists)`, `syncSelectionScope(scopeKey)` (clears when the key differs from the stored one, then stores it), `useSelectedHashes()`, `useIsSelected(hash)` and `resetSelection()`.
  - Write `useSelectionUpkeep(category, query)`. It runs the scope sync and the prune effect on `useMaindata(selectTorrents)`.
  - Toggling sets order-freeze's `selection` reason to `hashes.length > 0`.
  - Test the order, toggling off, pruning, scope clear vs. same scope, and the freeze reason.
- `src/state/order-freeze.ts` (+ test). Add the `selection` reason with a setter. `isOrderFrozen` includes it. `isBoardFrozen` does not. When the last selection clears, the list reorders once. Test it in the existing freeze suite.
- `src/features/list/torrent-row.tsx`, `torrent-list.tsx` (+ dom test).
  - In the listitem wrapper, render the shared `Checkbox` absolutely over the reserved slot, desktop only.
  - It shows on wrapper hover, on focus-within, or when the list has any selection (for example a `data-selecting` attribute on the list).
  - `aria-label` is 「選取 <name>」. Space toggles it, which Radix already does.
  - The DOM order puts the checkbox before the row button.
  - A selected row gets `bg-selection-row`, and hover does not change it.
  - The list scroller gets the 110px desktop bottom padding through the token.
  - Do not change `use-arrow-stepping.ts` behaviour.
- `src/features/board/board-card.tsx`, `card-list.tsx`, `board-column.tsx` (+ dom test).
  - Same checkbox, as a sibling in the card's listitem wrapper at `-top-1.5 -left-1.5` (6px) on a `bg-surface` rounded backing.
  - A selected card gets `bg-selection-row`.
  - Raise the virtualizer `paddingStart` so the first card's checkbox is not clipped, keeping the collapse measurements consistent.
  - Raise the desktop `paddingEnd` to 110px so the bar never covers the last card.
- `src/features/selection/selection-bar.tsx` (+ dom test).
  - Render a desktop pill fixed at bottom 24px, centred, with `bg-selection-bar text-selection-bar-foreground shadow-float`, `rounded-full`, padding 8/8/8/22px and a 14px gap.
  - From left to right: 「已選 N 個」 (700), 「共 X GB」 (12px, opacity .7), 取消 (text only, 600, 36px tall), 改路徑 (1px border pill, native `disabled`), 刪除（含檔案） (`bg-delete text-delete-foreground`, 700, native `disabled`, rightmost).
  - Focus outlines use `selection-bar-foreground`.
  - Wrap it in `role="region"` with `aria-label`「選取的種子」.
  - It slides up from below the viewport on the first tick and slides down when cleared. It stays mounted while sliding out.
  - The transition is `transform` only, 0.3s `cubic-bezier(0.2,0.8,0.2,1)`, and none under reduced motion.
  - 取消 calls `clearSelection()`.
  - While visible, it calls `toast.setLift(true)`. It calls `false` on clear or unmount.
- `src/routes/_authed/index.tsx`. Call `useSelectionUpkeep(view.category, view.query)` and render `<SelectionBar/>` when desktop.
- `src/shared/toast-store.ts`, `src/lib/toast.ts`, `src/shared/ui/toaster.tsx` (+ test). Add `lifted: boolean` to the store and `toast.setLift(on)` to the API. While lifted on desktop, the toaster moves up 68px with `translate-y`, so it lands 16px above the 52px bar (24 + 52 + 16 = 92px from the bottom). Animate it with a transform transition, and use no transition under reduced motion. Classes only.
- `e2e/selection.spec.ts`.
  - Hover shows the checkbox. Ticking 3 shows 已選 3 個 and the total. Clicking the row body still opens the detail.
  - The checkbox shows on board cards too, including expanded 已整理 cards.
  - Ticking 已整理 or 找不到檔案 torrents excludes their size.
  - Changing category clears the selection.
  - 取消 clears it.
  - Screenshots in `_bmad-output/implementation-artifacts/screenshots/4-1/` at 1440px, light and dark: the hover checkbox, 3 ticked in list and in board, the bar with a toast, and the 已整理 / 找不到檔案 total.

**Acceptance Criteria:**
- Given a desktop list with nothing selected, when the pointer or keyboard focus reaches a row, then only that row shows its checkbox and no row shifts. After the first tick every row and card shows its checkbox. After the last untick they hide again.
- Given a selection, when maindata refreshes with new speeds, then the list order does not change until the selection is cleared, and then it reorders once.
- Given the bar is visible, when the list is scrolled to the end, then the last row is fully visible above the bar.
- Given a viewport under 1024px, when the app runs, then no checkbox or selection bar appears.

## Spec Change Log

## Review Triage Log

### 2026-11-19: Review pass
- verdicts: 26 findings. high 0, medium 5, low 18, false 3, maybe-false 0
- findings:
  - `[medium]` `[patch]` (blind) A selection survives a drop below 1024px: the phone list stays frozen and no control can clear it. Action: Home clears the selection whenever `desktop` is false, with a test.
  - `[low]` `[reject]` (blind) Prune keeps a selected torrent that another device moved out of the current category or keyword. The epic's rule is to prune gone hashes. The case needs another device to act mid-selection, and 4.3's confirmation lists every name. The fix needs a scope-matching guard.
  - `[low]` `[patch]` (blind) Bar visibility (`count > 0`) and the freeze (`hashes.length > 0`) use two sources. Action: `visible` is based on `hashes.length > 0`.
  - `[low]` `[patch]` (blind) The count and size changes are not announced. Action: a polite live region around the two texts.
  - `[medium]` `[patch]` (blind) The centred bar overlaps the bottom of the desktop detail panel, whose padding is `pb-[22px]`. Action: both panel bodies get the 110px desktop bottom token.
  - `[low]` `[reject]` (blind) The 24, 52, 16 and 110 px literals are duplicated. These are developer-only and nothing diverges today. The lift is desktop-only and 4.2's phone bar does not use it.
  - `[low]` `[reject]` (blind) `onCheckedChange` ignores `checked`. Radix fires once per user toggle, so a duplicate event is not reachable in practice. The fix adds an API.
  - `[low]` `[reject]` (blind) Selectors reuse `data-entrance` and `aria-current`. `aria-current` renders `"true"` or `"false"` on every row (torrent-row.tsx:80), so they work. No breakage is named.
  - `[false]` `[reject]` (blind) The first render after a category change shows the old frozen order. False: `shownOrderReducer` returns `live` when `filterChanged` (order-freeze.ts), whatever the freeze.
  - `[low]` `[reject]` (blind) New torrents stay hidden while a selection holds. This matches the existing freeze semantics and EXPERIENCE 「不換列的位置」. In-app adds switch category through 「去看」, which applies the live order.
  - `[low]` `[reject]` (blind) `useIsSelected` is unused in production. The spec required it, it is harmless, and 4.2 may use it.
  - `[low]` `[reject]` (blind) The board padding test does not cover the focus outline. The e2e checks the first card's checkbox geometry and hit, and the screenshots show it.
  - `[false]` `[reject]` (blind) A selected card may keep `bg-surface`. False: `cn('rounded-card bg-surface hover-ring','bg-selection-row')` returns `rounded-card hover-ring bg-selection-row` (probe run).
  - `[false]` `[reject]` (blind) A sort change during a selection is untested or blocked. False: `viewChanged` returns `live` at once in `shownOrderReducer`. A frozen selection never blocks a sort change.
  - `[low]` `[reject]` (intent) Focus reveal, the focus outline colour and the checkbox look are checked only through class names. The checkbox is the existing shadcn component, and the e2e and screenshots cover the main geometry.
  - `[low]` `[patch]` (intent, grouped with the verification-gap row on the board's 110px) The board's 110px end is not geometry-tested. Action: the rendered assertion added below.
  - `[low]` `[patch]` (verification-gap) The board column's 110px `paddingEnd` is asserted only as a constant. Action: assert the rendered list height or the last card above the bar.
  - `[low]` `[defer]` (verification-gap) The bar's `stateBeforeMove` wiring is not exercised by a moving fixture. Deferred to 4.3, which reads the same selector.
  - `[medium]` `[patch]` (verification-gap other) A selection crossing below 1024px keeps the freeze and `bg-selection-row`. This is grouped with the first finding and fixed the same way.
  - `[medium]` `[patch]` (edge) Narrowing below 1024px keeps the selection. Grouped with the first finding.
  - `[medium]` `[patch]` (edge) Phone board cards keep the selected background left over from a desktop selection. Grouped with the first finding: clearing on `!desktop` removes it.
  - `[low]` `[reject]` (edge) After 取消, focus falls to the body. Global shortcuts still work. Moving focus needs a new target and more logic, and Alex mostly uses a mouse.
  - `[low]` `[patch]` (edge) Bar hidden while hashes exist and maindata is undefined. Grouped with the two-sources finding.
  - `[low]` `[reject]` (edge) Prune ignores scope. Same as the blind prune finding.
  - `[low]` `[reject]` (edge) A long selection hides new torrents. Same as the blind new-torrents finding.
  - `[low]` `[patch]` (edge) On a touch screen at 1024px or wider, the invisible checkbox takes taps. Action: `pointer-events-none` while hidden, restored together with the opacity.

## Design Notes

Claude 代決 (Alex can veto):
- The bar slides with 0.3s `cubic-bezier(0.2,0.8,0.2,1)`, the repo's motion curve. UX-DR87 gives no timing.
- The 110px bottom space on desktop is always present, so the list never jumps when the bar appears.
- The selection survives a `/settings` round trip because a scope key is compared, not a mount.
- The bar is labelled with `role="region"` 「選取的種子」.
- The selected torrents' total size uses `torrent.size`, the value the row shows.
- 4.1 does not render the bar below 1024px, and Story 4.2 adds the phone layout.
- The checkbox comes before the row button in the DOM so that the tab order matches the visual order.

AD-11 docs to check against locked versions:
- TanStack Store 0.11.2: https://tanstack.com/store/v0/docs/framework/react/quick-start
- TanStack Virtual 3.14.26 `paddingStart` / `paddingEnd`: https://tanstack.com/virtual/v3/docs/api/virtualizer
- Radix Checkbox (radix-ui 1.8.1): https://www.radix-ui.com/primitives/docs/components/checkbox
- Tailwind 4.3 transitions, translate and `motion-reduce`: https://tailwindcss.com/docs/transition-property and https://tailwindcss.com/docs/translate

## Verification

**Commands:**
- `source ~/.nvm/nvm.sh && nvm use && npm run lint && npm run typecheck`: expected to pass.
- `source ~/.nvm/nvm.sh && nvm use && npm test`: all pass, including the new selection, total, freeze and toast tests.
- `source ~/.nvm/nvm.sh && nvm use && npm run build && npx playwright test`: all pass, including `e2e/selection.spec.ts`.
- `bash .claude/skills/next-story/check.sh`: every line ok.

## Auto Run Result

Status: done (first pass)

**Summary.** On desktop, list rows and board cards now show a hover checkbox. Expanded 已整理 cards show it too. The selection is kept in an ordered store in `src/state/selection.ts`. It clears when the category or keyword changes and survives a trip to `/settings`. Torrents that disappear are pruned, and the selection is cleared below 1024px. A centred selection bar shows 已選 N 個 and 共 X GB, the size counting only torrents whose files exist. It has 取消, plus 改路徑 and 刪除（含檔案）, both disabled. The bar slides in and out using `transform` only. A selection holds the list order but never the board's. While the bar shows, toasts sit 16px above it. Desktop content keeps 110px of bottom room.

**Files**
- `src/state/selection.ts` (+ test): the ordered selection store, scope sync, prune and freeze reason.
- `src/lib/selection-total.ts` (+ test): count and size without 已整理 and 找不到檔案, plus the bar texts.
- `src/state/order-freeze.ts` (+ test): the `selection` reason. It applies to the list only.
- `src/features/selection/selection-bar.tsx` (+ dom test): the desktop pill, its slide and the polite status for the count and size.
- `src/routes/_authed/index.tsx` (+ `src/routes/home-selection.dom.test.tsx`): composes the upkeep and the bar, and clears the selection below 1024px.
- `src/features/list/torrent-row.tsx`, `torrent-list.tsx`, `list-states.tsx`: the row checkbox over the 20px slot, the `selection-row` background and the 110px bottom.
- `src/features/list/use-arrow-stepping.ts`: focus targets the row button (`button[aria-current]`), not the checkbox.
- `src/features/board/board-card.tsx`, `card-list.tsx`, `board-column.tsx`: the card checkbox 6px outside the corner, start padding 10 and end padding 110.
- `src/features/detail/list-detail-panel.tsx`, `board-detail-panel.tsx`: the 110px desktop bottom.
- `src/shared/toast-store.ts`, `src/lib/toast.ts`, `src/shared/ui/toaster.tsx`: `toast.setLift`, which moves toasts up 68px with a transform.
- `e2e/selection.spec.ts` (new), plus selector updates in seven existing specs: each row and card now holds a second button.
- `_bmad-output/implementation-artifacts/screenshots/4-1/`: 10 screenshots at 1440px, light and dark.

**Review findings.** 26 in total.
- Patched: 6 entries. 2 are medium (selection kept below 1024px, bar overlapping the detail panel) and 4 are low (one visibility source, a live region, a rendered board end-room test, hidden checkboxes taking no pointer events).
- Deferred: 1 (no moving fixture for the bar's `stateBeforeMove`, picked up in 4.3).
- Rejected: 19, each with its reason in the triage log. 3 are false and 16 are low.

**Follow-up review: recommended (true).** Two medium entries were patched on the first pass. The risks not yet verified are these:
- The pointer-events change on hidden checkboxes forced every e2e tick to hover first.
- The clear below 1024px interacts with resize and the restore.

**Verification**
- lint and typecheck are clean.
- vitest: 130 files and 3173 tests pass.
- The build passes.
- Playwright, full run before the patches: 124 passed.
- Playwright after the patches:
  - The full run took 2.4 h because the Mac display slept, and 12 tests timed out.
  - Rerunning the 12: the 5 outside `selection.spec.ts` passed.
  - The 7 inside `selection.spec.ts` failed because clicking a hidden checkbox now needs a hover first. Adding a `tick()` helper that hovers the row first fixed them, and `e2e/selection.spec.ts` now passes 10 of 10.
- check.sh: every line ok.

**Residual risks**
- The screenshot test rewrites the tracked 4-1 PNGs on every local e2e run.
- Board columns now start 6px lower and have 110px of room at the end, which is visible in every board screenshot.
- After this patch there was no single clean full Playwright run. The failed tests and the selection spec were rerun separately.
