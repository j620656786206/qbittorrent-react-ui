---
title: 'Story 2.4: Opening detail: three containers, sticky header, prev/next'
type: 'feature'
created: '2026-11-17'
status: 'done'
baseline_revision: 'eccb660257a2fd554a5273c85dfa8a10d599c0b9'
review_loop_iteration: 0
followup_review_recommended: false
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-2-context.md'
  - '{project-root}/_bmad-output/planning-artifacts/architecture/architecture-react-torrent-2026-11-15/ARCHITECTURE-SPINE.md'
  - '{project-root}/_bmad-output/implementation-artifacts/spec-2-3-board-desktop-columns-phone-status-tabs.md'
  - '{project-root}/_bmad-output/implementation-artifacts/spec-2-2-bottom-sheet-phone-sort-sheet.md'
warnings: ['oversized']
deferred: []
# Settled 2026-11-17 (epic 2 review of 2.3 to 2.5): in Chromium a click on a
# board column's scrollbar sends no `click`, so the panel stays
# (e2e/board-scrollbar.spec.ts, which fails if it ever closes). BoardHome
# also ignores a press on a scrollbar for browsers that do send one; Safari
# is not checked by CI.
---

<intent-contract>

## Intent

**Problem:** Rows and cards cannot be opened, so Alex cannot see one torrent's details or step through torrents one by one, and nothing survives a reload.

**Approach:** Put the viewed torrent's `hash` in the URL. Desktop list mode gets a permanent right detail panel; desktop board mode gets a floating panel over the 完成 and 已整理 columns; phone opens the Story 2.2 bottom sheet in `detail` mode. All three share one sticky detail header (name, 「第 N 個／共 M 個」 with prev/next, ⋯, tabs) and an overview tab that starts with the info list. A pure `src/lib` function picks the successor when the viewed torrent vanishes, and a `src/state` shortcut registry handles `Esc` only.

## Boundaries & Constraints

**Always:**
- URL: `hash` joins the `_authed` search schema (40 or 64 lowercase hex, same rule as `src/lib/is-torrent-hash.ts`; the shared schema may not import lib, so the regex lives in `src/shared`); invalid values are dropped by `fixListSearch` with `replace`. Opening, switching and closing write the URL with `replace` and `resetScroll: false`; closing removes `hash`. Sort changes keep `hash`. A `src/state` hook (e.g. `useViewedHash()` from the `_authed` provider, like `useListView`) exposes `hash` and `setHash`; features never touch the router.
- Composition: features never import each other. A new `src/features/detail/` owns the header, tabs, info list and the three containers' contents; the route `src/routes/_authed/index.tsx` composes list + detail panel, board + floating panel, or the phone sheet. Rows and cards only call `setHash(hash)`.
- Desktop list mode (≥1024px, mockup S01-list-mode-desktop): grid `minmax(0, 560px) minmax(0, 1fr)`, gap 16px; the list keeps its look in the left column; the right `<aside aria-label="詳情">` is `surface`, radius 22px, flex column, `overflow: hidden`; header padding 16px 22px 14px with a 1px `border` bottom line; tabs padding 12px 22px 4px; tabpanel padding 12px 22px 22px, scrolls itself. The page does not scroll as a whole: the list column and the panel each scroll (the list virtualizer's scroll element moves from `main` to the list's own scroller on both widths, with the existing freeze listeners, `scrollMargin` and the sort-change scroll-to-top following it through one shared helper, e.g. `resetListScroll()` in `src/shared/ui/main-scroll.ts`; the list still keeps under 100 rows in the DOM). Rows: hover background `surface-muted` (`hover-row`); a row is a `<button type="button" aria-current>` (true on the viewed one); click sets `hash`; the viewed row has `inset 0 0 0 2px` brand accent (`--color-primary`) ring. No `hash`, or a `hash` not in the current list: show the first row; never scroll to the viewed row. Empty list: the existing empty state replaces list and panel together.
- Desktop board mode: cards are `<button type="button">` with a 1px `text-faint` inset hover ring (`hover-ring`); click sets `hash`. The panel `<aside aria-label="詳情">` is absolutely positioned inside a `position: relative` wrapper around the board: `top: 0; right: 0; bottom: 0; width: calc((100% - 120px) / 4 + 78px); max-width: 100%`, radius 22px, `shadow-float` (`0 12px 32px rgba(0,0,0,.28)`), no scrim; enters with opacity 0 and `translateX(24px)` to rest in 0.3s `cubic-bezier(.2,.8,.2,1)` (transform and opacity only; none under `prefers-reduced-motion`). Board stays clickable: another card switches the panel; a click on empty board space, `Esc`, or the header ✕ (`aria-label`「關閉」) closes it and removes `hash`. A covered 完成 card is left as is (no scroll, no shift).
- Phone (<1024px), list or board: tapping a row or card (the name too) opens the shared bottom sheet in `detail` mode (70%; released past half its height closes, otherwise springs back to 70%; drag up to full screen). Closing removes `hash`. The sheet freezes the list behind (existing `sheetOpen`). The sheet needs an optional header slot so the detail header replaces its default title row (keep the handle, drag, focus trap, scroll lock and `aria-labelledby` on the name; the detail header's ✕ closes it).
- Detail header (sticky over both tabs): name `<h2>` in `text-detail-name`, one line with 「…」 (desktop `title` = full name); ‹ 「第 N 個／共 M 個」 › (13px, tabular, nowrap); ⋯ (`aria-label`「更多動作」, disabled until 2.6); a `border` line below; then the pill tabs 概覽 and 檔案 (`role="tablist" aria-label="詳情分頁"`, selected one brand accent background and foreground; 檔案 disabled until 2.7). Desktop list mode: one row (name `flex:1`, nav group gap 6px, header gap 8px). Phone and the board panel: two rows: row 1 name, ⋯, ✕; row 2 ‹, 第 N 個, ›, left-aligned right under the name (board header padding 16px 18px 12px 22px, gap 6px; phone padding 0 16px 12px, gap 4px). Nav buttons: 36px circles with 1px `border` on desktop, 44px on phone, `aria-label`「上一個」「下一個」, 18px chevrons; disabled (50%, not-allowed) at the first or last item. Tabs: desktop 32px tall, padding 0 16px; phone 44px, padding 0 18px.
- N and M: list mode from the same frozen order the list shows (publish the list's `useFrozenOrder` result through a `src/state` store or provider instead of running a second hook instance); M excludes 已整理. Board mode: the range is the torrent's current column from `useBoardColumns()` (live, as the board shows it), text prefixed by the column name and a full-width space, e.g. 「做種中　第 3 個／共 80 個」; prev/next stay inside the column and never jump to the next one; the expanded 已整理 column follows the same rule; on the phone board the torrent's column is the current status tab. A pure `src/lib` function computes `{ index, total, prev, next }` from an order and a hash; vitest covers normal, first, last, a single item, a hash not in the order, and a frozen order.
- Phone name tap: the name is `<h2><button aria-expanded aria-label="展開完整名稱">` (44px min height); expanded (`aria-label`「收起名稱」) it wraps (`overflow-wrap: anywhere`), the header grows and pushes the content down (no overlay); tapping again collapses; ‹ › collapse it.
- Overview tab: the info list (UX-DR46) is a `<dl>` grid `72px minmax(0,1fr)`, row gap 8px, column gap 12px, 13px/1.4, tabular; `dt` in `text-muted`, `dd` right after (not pushed right). Rows in order: 分類 (category, empty means 「沒有」), 大小 (`formatSize(size)`), 加入時間 (`formatDate(added_on)`), 完成時間 (`formatDate(completion_on)`), 已下載, 已上傳 (`formatSize`); every value through `format.ts`; 「沒有」 in `text-muted`. Story 2.5 adds blocks above it.
- `downloaded` and `uploaded` stay out of the slim table (spine AD-6). Alex decided 2026-11-17 (spine AD-6 detail exception): a new GET server function `getTorrentDetail({ hash })` answers the detail fields the slim table lacks for that one torrent, read from the container's sort extras table (reusing a `sync/maindata` pull younger than 6 s, so normally no extra qBittorrent request); `src/shared/torrent-detail.ts` lists the fields (2.4: `downloaded`, `uploaded`; 2.5 adds the seed and peer counts). The detail polls it every 5 s as `['torrent-detail', hash]` only while shown. Before the first answer the two rows show 「…」 muted; unknown is 「沒有」.
- Vanished viewed torrent: one pure `src/lib` function `(previousOrder, nextOrder, hash) => hash | null` returns the torrent that took its place (the old next one still present), else the old previous one still present, else `null`; vitest covers middle, last, only one, all gone, and still present. List mode: when the viewed hash leaves the frozen order (deleted, or became 已整理), switch to that successor and replace `hash`. Board panel: if the torrent is gone from every column, close; if it changed column, stay and recompute the column name and N of M. Phone sheet: if it is gone, close.
- Reload with `sort` and `hash`: same sort and torrent; list panel shows it, board panel opens, phone sheet opens.
- Shortcut registry in `src/state` (AR-52): register `Esc` only. Layers stack; `Esc` closes the topmost open one (this story: the board detail panel and any bottom sheet; a sheet above the panel closes first). While focus is in an `input`, `textarea`, `select` or contenteditable, only `Esc` is handled. The bottom sheet's document-level Esc handler moves into this registry (closes the 2.2 deferred item), injected through the existing `SheetRuntimeContext` bound in `src/router.tsx` because `src/shared` may not import `src/state`. vitest covers registration, ordering and the input rule.
- Focus: 2px brand accent outline, offset 2px, only on `:focus-visible` (existing base rule); it must look different from the 2px inset viewing ring, and both can show on different rows at once.
- 0 CSP violations and 0 console errors in the browser smoke; no `<style>` injection; fake data only (AD-15); UI text exactly as given; no em dash; `check.sh` before every commit.

**Never:**
- No status hero, stat tiles or save-path block (2.5), no pause/resume or ⋯ menu (2.6), no files tab content (2.7), no last-viewed torrent per category, no `↑` `↓` or other shortcuts (Epic 3), no checkboxes (Epic 4).
- No scrolling the list to the viewed row; no scrim for the board panel; no new runtime dependency; no shadcn `Sheet`; no CSP change.
- No `sort()` or `torrent.state ===` in features.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| D1 list default | desktop, list sort, no `hash` | panel shows the first row's torrent; first row has the ring | n/a |
| D2 list click | click row 5 | panel switches, URL `hash` replaced, ring moves | n/a |
| D3 hash not in list | `hash` of an archived or unknown torrent | first row shown | invalid hex dropped from URL |
| D4 board open/close | click a card; then empty space / Esc / ✕ | panel slides in; closes, `hash` removed | n/a |
| D5 board switch | panel open, click another card | panel shows the new one | n/a |
| D6 phone open | 390px, tap row or card | detail sheet at 70%; drag past half closes; drag up full screen | n/a |
| D7 N of M list | frozen order, viewed is 4th of 19 | 「第 4 個／共 19 個」; ‹ › follow the shown order | first/last disable |
| D8 N of M board | card in 做種中, 3rd of 80 | 「做種中　第 3 個／共 80 個」; never crosses columns | ends disable |
| D9 vanish list | viewed torrent deleted or archived | successor (next, else previous), URL updated | none left: empty state |
| D10 vanish board | gone / moved column | close / stay and recompute | n/a |
| D11 vanish phone | gone while sheet open | sheet closes | n/a |
| D12 reload | URL with `sort` and `hash` | same torrent in the right container | n/a |
| D13 Esc | sheet over panel, or focus in an input | topmost closes; only Esc acts in inputs | n/a |
| D14 phone name | tap name, then › | expands pushing content; › collapses | n/a |
| D15 info list | torrent without category or not completed | 「沒有」 muted | n/a |
| D16 reduced motion | prefers-reduced-motion | board panel appears without the slide | n/a |

</intent-contract>

## Code Map

- `src/shared/list-search.ts` -- search schema and `fixListSearch`; add `hash`. `src/routes/_authed.tsx` -- validates search, provides `ListViewContext`; add the viewed-hash control next to it. `src/state/list-view.ts` -- the provider pattern to mirror.
- `src/routes/_authed/index.tsx` -- picks board or list; becomes the composition point (list+panel, board+floating panel, phone sheet).
- `src/features/list/torrent-list.tsx` -- virtualizer on `getMain`, `scrollMargin`, freeze listeners, `useFrozenOrder` (line ~93, local `shown`); `torrent-row.tsx` `RowContent` (plain div today); `list-states.tsx` `LIST_SECTION_CLASS`.
- `src/features/board/torrent-board.tsx` `DesktopBoard` (grid inside `main`), `card-list.tsx`, `board-card.tsx` `CardContent` (div today), `status-tabs.tsx` (phone tab index local state), `board-model.ts` `COLUMN_META`, `WORK_COLUMNS`.
- `src/state/order-freeze.ts` -- `useFrozenOrder`, `useSheetOrderHold`; `src/state/maindata.ts` -- `useBoardColumns`, `useMaindata`, selectors.
- `src/shared/ui/bottom-sheet.tsx` (props `open, onOpenChange, title, mode, children, initialFocus, returnFocus, onOpened`; renders its own `<h2>` and ✕ at ~406-424), `sheet-session.ts:104-110` (document Esc listener to move), `sheet-snap.ts` (`detail` 0.7, close at half; implemented and tested). `src/router.tsx` -- binds `SheetRuntimeContext`.
- `src/shared/ui/main-scroll.ts` -- `getMain()`; `src/features/header/sort-menu.tsx`, `sort-sheet.tsx` -- reset `main.scrollTop` on sort change (switch to the shared helper).
- `src/lib/format.ts` -- `NO_VALUE`, `formatSize`, `formatDate`; `src/state/now.ts` `useDayClock`.
- `src/server/sync/extras-table.ts`, `syncer.ts`, `src/server/functions/get-sort-keys.ts`, `src/state/sort-keys.ts` -- the template for `getTorrentDetail` and its query.
- `src/styles.css` -- has `text-detail-name`, `--radius-panel`, `p-panel-padding`, `max-w-list-column-max` (560px), `shadow-float`, `hover-row`, `hover-ring`, base `:focus-visible`; add a slide-in keyframe utility (off under reduced motion) and a viewing-ring utility on `--color-primary` (Tailwind `accent` is shadcn's muted, not the brand accent).
- `e2e/fixtures.ts` (`login`, `openList`, `setModes`), `e2e/board.spec.ts`, `e2e/smoke.spec.ts`.
- UX: `DESIGN.md:283-319,541-542,589-599,629-646,694`; `EXPERIENCE.md:93-100,335,345,404-418`; mockups `S01-list-mode-desktop`, `S04-overview-desktop`, `SD-board-detail-desktop`, `S05-overview-phone`, `S05-name-expanded-phone`.

## Tasks & Acceptance

**Execution:**
- `src/shared/list-search.ts`, `src/routes/_authed.tsx`, `src/state/` viewed-hash control (+ tests) -- `hash` in the URL.
- `src/lib/detail-position.ts` (name may differ, + test) -- N/M/prev/next and the vanished successor (D7 to D11 logic).
- `src/state/shortcuts.ts` (+ test), `src/router.tsx`, `src/shared/ui/bottom-sheet.tsx`, `sheet-session.ts` -- Esc registry, sheet header slot, sheet Esc through the registry (D13).
- `src/state/` shown-order store (+ test) -- list publishes its frozen order for the detail.
- `src/shared/torrent-detail.ts`, `src/server/sync/extras-table.ts` (`rawOf`), `syncer.ts` (`readTorrentDetail`), `src/server/functions/get-torrent-detail.ts`, `src/state/torrent-detail.ts` (+ tests), spine AD-6 detail exception -- 已下載 and 已上傳.
- `src/features/list/*` -- row buttons, hover, viewing ring, own scroller, desktop grid with panel slot (+ tests).
- `src/features/board/*` -- card buttons, hover ring, click to open (+ tests).
- `src/features/detail/*` (+ DOM tests) -- header (both layouts), phone name expand, tabs, overview info list, list panel, board floating panel, phone sheet content, vanish handling.
- `src/routes/_authed/index.tsx` -- composition and empty-space close for the board.
- `src/styles.css` -- slide-in and viewing-ring utilities.
- `e2e/` -- detail smoke: list default and click, board open/switch/close (Esc, ✕, empty space), phone sheet open and close, reload with `hash`, 0 CSP; screenshots at 1440 and 390, light and dark: list mode with panel, board with panel, phone sheet at 70%, full screen, name expanded; no horizontal scroll at 390px.

**Acceptance Criteria:**
- Given fake data, when Alex clicks a row or card on desktop or taps one on the phone, then the right container shows that torrent with the sticky header, the right 「第 N 個／共 M 個」 and working prev/next, and the URL carries `hash`; reloading restores it.
- Given `npm run lint`, `npm run typecheck`, `npm test`, `npm run build`, `npm run smoke`, `CI=1 npm run smoke:browser`, `check.sh`, then all pass.
- Given the PR, then it carries the desktop list-mode panel, desktop board panel and phone sheet (70%, full screen, name expanded) screenshots in light and dark, with no horizontal scroll at 390px.

## Spec Change Log

- 2026-11-17: the run blocked on 已下載 and 已上傳 (slim table vs. AD-6's 160 KB delta budget: delta 177,654 B over 160 KiB). Alex picked a per-torrent read; spine AD-6 got the detail exception and the spec now uses `getTorrentDetail` instead of the slim table.

## Review Triage Log

### 2026-11-17: Review pass
- verdicts: 35 findings: high 0, medium 9, low 19, false 7, maybe-false 0
- findings:
  - `[medium]` `[patch]` (blind) no `hash` on desktop: the implicit first row follows `order[0]`, so a new torrent on top or an unfrozen reorder swaps the panel while Alex reads it. Patch: keep `previous.viewed` while it is still in the order.
  - `[medium]` `[patch]` (blind) `getTorrentDetail` pulls on its own (1 s reuse only), so two unaligned 5 s polls roughly double `sync/maindata` calls against the spine's "no extra request". Patch: the detail read reuses a pull younger than 6 s.
  - `[low]` `[patch]` (blind) crossing 1024px changes TorrentList's root element and remounts the rows, against the route comment. Patch: always render the wrapper (`contents` without a panel).
  - `[medium]` `[patch]` (blind) the board panel width assumes the collapsed 已整理 strip; expanded, it no longer covers 完成 plus 已整理. Patch: a width variant from the grid's `data-archived`.
  - `[low]` `[reject]` (blind) BottomSheet no longer handles Esc itself; callers use `useSheetLayer`. Documented deviation (Design Notes), same caller-side pattern as #19's `useSheetOrderHold`; a fix would re-add a runtime context.
  - `[low]` `[patch]` (blind) after switching cards, closing returns focus to the first card. Patch: `openerRef` follows the shown hash when focus is outside the panel.
  - `[low]` `[reject]` (blind) `hover-ring` replaces the card's `shadow-card` on hover. Cosmetic and only while hovering; the fix needs a new combined utility.
  - `[low]` `[reject]` (blind) `isEmptySpace` also closes on a text-selection drag ending in empty space or `role` elements. Rare on a board of buttons; the fix adds guards.
  - `[low]` `[reject]` (blind) board cards carry no `aria-current` for the shown torrent. Not in the AC (the ring is list-only); Alex alone uses the app; needs plumbing the viewed hash into every card.
  - `[false]` `[reject]` (blind) `useListViewed` mutates a ref during render. The only mutation clears `pending` when the committed router `hash` already shows it (and after the patch, when it changed): idempotent, so a discarded render cannot bring the blink back.
  - `[low]` `[reject]` (blind) the phone list's own scroller changes iOS address-bar collapse and status-bar tap. The spec chose one scroller for both widths (as the mockup); noted as a residual risk for the real-phone check.
  - `[false]` `[reject]` (blind) narrowing the window with `hash` set opens the phone sheet. `hash` in the URL means the detail is open; D12 asks a reload at phone width to open the sheet, so this is the intended state.
  - `[low]` `[reject]` (blind) `muted` is decided by comparing to 「沒有」 or 「…」, so a category literally named so is muted. Unlikely in use; the fix changes every row helper call.
  - `[low]` `[reject]` (blind) e2e aliases (`mainScrollTop`, `scrollMainTo` writing both) and the `as never` cast in `_authed.tsx`. Test and type tidiness with no named failure beyond the aliases.
  - `[low]` `[reject]` (blind) the closing phone sheet can send one more `getTorrentDetail` during its slide-out. One small read, negligible.
  - `[low]` `[patch]` (intent) the vitest row 「凍結中」 is covered by an `Object.freeze` test, not the app's freeze. Patch: honest name plus a DOM test that the published order stays frozen.
  - `[false]` `[reject]` (intent) the board's N of M uses live columns, not the frozen hook. The board is never frozen (2.3) and the spec says live "as the board shows it"; it matches the screen as the AC's binding phrase asks.
  - `[false]` `[reject]` (intent) the phone sheet closes on archive and on a reload with a hash the phone list lacks. The phone list never holds 已整理, so the torrent has left what is on screen; recorded in Design Notes.
  - `[false]` `[reject]` (intent) desktop keeps an unknown valid `hash` in the URL. Matches D3 (only invalid hex is dropped).
  - `[low]` `[patch]` (intent) 「列表全空時列表和詳情面板一起換掉」 has no test. Patch: DOM test for the empty state with a panel.
  - `[false]` `[reject]` (intent) the list's own scroller and earlier e2e helpers rewritten. Descriptive: the spec asks for the own scroller; all earlier e2e still run and pass.
  - `[medium]` `[patch]` (verification) a sort change keeping `hash` is tested with `page.goto`, never through `setView`. Patch: pick from the sort menu in e2e.
  - `[low]` `[patch]` (verification) the B14 scroll lock checks never include `#rt-list-scroll`. Patch: added to the e2e and DOM checks.
  - `[low]` `[patch]` (verification) the `aside` exclusion of the empty-space close is never reached. Patch: e2e click on an info value.
  - `[low]` `[patch]` (verification) focus back to the card after closing is untested. Patch: e2e step (with the opener fix).
  - `[medium]` `[patch]` (verification) `pendingRef`'s guard is never exercised (every test's `setHash` re-renders at once). Patch: DOM test with a deferred `setHash` (with the pending fix).
  - `[low]` `[patch]` (verification) switching torrents is not checked to clear the previous 已下載/已上傳. Patch: DOM test.
  - `[medium]` `[patch]` (verification, other) `pendingRef` clears only on the exact echo; a click before the echo leaves the detail stuck. Patch: clear once `hash` moves off the value seen at write time.
  - `[low]` `[patch]` (edge) TorrentList remount across 1024px (same root cause as the blind finding above). Patched there.
  - `[medium]` `[patch]` (edge) `pendingRef` never clears when the user sets another hash before the echo (same root cause as the row above). Patched there.
  - `[medium]` `[patch]` (edge) implicit first row swaps on a new top torrent (same root cause as the first blind finding). Patched there.
  - `[low]` `[patch]` (edge) a failing first `getTorrentDetail` leaves 「…」 forever. Patch: an error with no data shows 「沒有」.
  - `[medium]` `[patch]` (edge) the panel width with 已整理 expanded (same root cause as the blind finding). Patched there.
  - `[low]` `[patch]` (edge) a focused ‹ or › that becomes disabled drops focus to body. Patch: focus moves to the other nav button.
  - `[false]` `[reject]` (edge) a board click with `hash` set but no panel removes `hash`. With no target the hash is not on the board, and D12 already closes (removes `hash`) in that case.

### 2026-11-17: Review pass (follow-up)
- verdicts: 33 findings: high 0, medium 3, low 24, false 5, maybe-false 1
- findings:
  - `[false]` `[reject]` (blind) the viewed row is never scrolled into view. The AC says 「那一列不在畫面上時不捲過去」: not scrolling is the rule.
  - `[low]` `[reject]` (blind) board cards carry no mark for the open torrent. carried: same as the first pass's `aria-current` row.
  - `[low]` `[reject]` (blind) `hover-ring` replaces the card shadow on hover. carried: same as the first pass's row.
  - `[low]` `[reject]` (blind) cards under the board panel stay in the tab order. The spec leaves a covered 完成 card as is and the board stays clickable; `inert` columns would change that; rare with one keyboard user.
  - `[low]` `[reject]` (blind) the phone `<h2>` is named 「展開完整名稱」 by its button. The AC sets that `aria-label`; the fix edits the spec.
  - `[low]` `[reject]` (blind) a failed detail read and an unknown value both show 「沒有」. Failures already raise the global connection alert; a separate marker adds a state.
  - `[false]` `[reject]` (blind) phone Back does not close the sheet. The AC wants `replace` (no new history entry; e2e checks `history.length`).
  - `[false]` `[reject]` (blind) refs written during render. carried for `pendingRef`; the sheet's `lastRef` only keeps the last target for the close animation (idempotent), and the effect writes only while `write` is set, which the pending value turns off after one write.
  - `[low]` `[reject]` (blind) BottomSheet relies on callers for Esc. carried: same as the first pass's row.
  - `[low]` `[reject]` (blind) `searchWithHash(...) as never`. carried: same as the first pass's row.
  - `[low]` `[reject]` (blind) the list panel renders an empty `aside` before the first publish. One frame before the list publishes; `viewed` always comes from the same torrents.
  - `[low]` `[patch]` (blind) no e2e checks Esc with the real sort menu open over the board panel. Patch: e2e step in D4.
  - `[low]` `[reject]` (blind) Safari does not focus a clicked card, so the opener can be stale. Mouse users get focus on `main` (no visible change); keyboard Enter focuses the card; the fix plumbs the opener through every card.
  - `[low]` `[reject]` (blind) a click on a column heading closes the board panel. carried: same as the first pass's `isEmptySpace` row; e2e treats it as the intended empty-space close.
  - `[low]` `[reject]` (intent) no single test composes freeze, poll and the header's N of M. The frozen list publishes its frozen order (first-pass DOM test) and the panel reads only the published order (D7 tests).
  - `[false]` `[reject]` (intent) the sticky no-`hash` row reads against "no hash shows the first row". The first pass patched this on purpose (the panel must not swap while read); the first load still shows the first row.
  - `[false]` `[reject]` (intent) the expanded panel width differs from the formula. The AC asks the panel to float over 完成 and 已整理; the formula described the collapsed strip, e2e checks the edges in both states.
  - `[low]` `[reject]` (intent) the phone board range follows the torrent's column, not the tab, after a reload with `hash`. Only on a reload with a hash from another column; syncing the tab needs new plumbing (same as the edge row below).
  - `[low]` `[patch]` (intent) AD-6 text says "不另外問 qBittorrent" while the syncer pulls itself after 6 s. Patch: spine, spec and comments now say it reuses a pull younger than 6 s, else pulls.
  - `[low]` `[reject]` (intent) visual specs are checked as class names and CSS text. The PR screenshots in both themes check the rendering.
  - `[medium]` `[patch]` (intent) "does not scroll" has no test (same root cause as the verification row below). Patched there.
  - `[low]` `[reject]` (intent) widths between 390 and 1024 are not exercised. The layout switches at 1024 only; 390 is the narrow case.
  - `[medium]` `[patch]` (verification) opening or switching the detail is never checked to leave the list or board scroll alone. Patch: e2e with `data=many`, list and board column.
  - `[medium]` `[patch]` (edge) no `hash`, every shown row vanishes at once: `viewed` null, blank panel until a later render. Patch: fall back to the first row.
  - `[low]` `[reject]` (edge) a torrent deleted with focus in the board panel drops focus to body. Deleting from the app comes in 2.6; rare, and the fix reroutes the gone path.
  - `[low]` `[reject]` (edge) a deleted focused row drops focus to body. Same pattern as any virtualized row leaving; rare.
  - `[low]` `[reject]` (edge) phone board with an archived `hash` or a hash outside the current tab after reload. Reload-only; syncing the tab is new plumbing.
  - `[low]` `[reject]` (edge) `pressedRef` stays set when a nav target never lands. Needs the target to vanish inside one router turn; the fix adds state.
  - `[maybe-false]` `[defer]` (edge) a click on a column's scrollbar may count as empty space and close the board panel. Whether Chromium and Safari fire `click` for scrollbar drags on these columns needs a real-browser check.
  - `[low]` `[reject]` (edge) a BottomSheet with neither `title` nor `header` has no name. No caller does that; both callers pass one.
  - `[low]` `[reject]` (edge) the list scroller remounting while a sheet is open is not locked. Needs the list to empty and refill under an open sheet; rare.
  - `[low]` `[patch]` (edge) a held Esc auto-repeats and closes two layers. Patch: ignore `event.repeat`.
  - `[low]` `[reject]` (edge) `muted` by string compare. carried: same as the first pass's row.

## Design Notes

- Alex 2026-11-17: 已下載 and 已上傳 come from `getTorrentDetail` (spine AD-6 detail exception), not the slim table. Claude 代決 (Alex may veto): before its first answer the two rows show 「…」 in `text-muted`; the query keys on the hash so ‹ › never show the previous torrent's numbers. The ✕ is labelled 「關閉」 as the AC says (the mockup's 「關閉詳情」 is not used). Board N of M uses the torrent's current column, which equals the selected tab on the phone. The list moves to its own scroller (as the mockup does) so the panel can fill the height without sticky tricks.
- Docs to read first (AD-11): TanStack Router search params and `navigate` with `replace` (`https://tanstack.com/router/latest/docs/framework/react/guide/search-params`), TanStack Virtual virtualizer (`https://tanstack.com/virtual/latest/docs/api/virtualizer`), WAI-ARIA tabs (`https://www.w3.org/WAI/ARIA/apg/patterns/tabs/`). Record the URLs actually read.
- URLs actually read (2026-11-17): `https://tanstack.com/router/latest/docs/framework/react/guide/search-params` (`search: (prev) => ...` keeps the other params; zod v4 `.catch` keeps types; the page does not cover `replace`, `resetScroll` or removing a key, so `hash` is removed by leaving it out of the returned object and `replace`/`resetScroll` follow the existing `setView`), `https://tanstack.com/virtual/latest/docs/api/virtualizer` (`getScrollElement`, `scrollMargin` measured from the scroll container's start and subtracted in the transform, the scroll element's size from `clientWidth`/`clientHeight`), `https://www.w3.org/WAI/ARIA/apg/patterns/tabs/` (tablist label, `aria-selected`, `aria-controls`, the panel's `aria-labelledby`, `tabindex="0"` on a panel with nothing focusable; it does not cover disabled tabs, so 檔案 is a disabled button outside the Tab order).
- Implementation deviations (Claude 代決, Alex may veto):
  - `SheetRuntimeContext` no longer exists (removed in #19, sheet-snap moved to src/shared/ui). The sheet's document Esc listener is gone; `useSheetLayer(open, close)` in src/state/sheet-layer.ts (order hold plus an Esc layer in src/state/shortcuts.ts) is called by each feature that opens a sheet, the same caller-side pattern #19 chose for `useSheetOrderHold`.
  - `downloaded`/`uploaded` did not join the slim table (the payload budget test fails with them); after Alex's decision they come from `getTorrentDetail`.
  - The list publishes `{ order, viewed }` (src/state/shown-order.ts); `useListViewed` (src/state/list-viewed.ts, pure part `resolveListViewed` in src/lib/detail-position.ts) decides the viewed row, so the ring and the panel never disagree. On the phone a `hash` the list does not hold (archived, unknown) is removed and the sheet stays closed; on desktop it shows the first row and the URL is left alone (D3).
  - The board's column names moved to `BOARD_COLUMN_NAMES` in src/lib/torrent-status.ts (the detail needs them; features never import each other); `boardColumnOf` joined src/lib/visible-torrents.ts.
  - On the phone the dialog is named by the name's text span (the `<h2>` holds the expand button, whose `aria-label` would otherwise name the sheet 「展開完整名稱」); focus starts on the ✕ like the sort sheet.
  - Board panel: closing with focus inside returns focus to the card that opened it, else `main`.

## Verification

**Commands:**
- `source ~/.nvm/nvm.sh && nvm use && npm run lint && npm run typecheck && npm test` -- expected: all pass.
- `source ~/.nvm/nvm.sh && nvm use && npm run build && npm run smoke && CI=1 npm run smoke:browser` -- expected: all pass.
- `bash .claude/skills/next-story/check.sh` -- expected: every line ok.

## Auto Run Result

Status: done (two review passes: first pass and follow-up)

Summary: the detail opens from list rows and board cards in three containers (desktop list panel, desktop board floating panel, phone 70% sheet) with the sticky header, 「第 N 個／共 M 個」 and ‹ ›, `hash` in the URL, vanish handling and the Esc-only shortcut registry. 已下載 and 已上傳 come from the new `getTorrentDetail({ hash })` (spine AD-6 detail exception, Alex 2026-11-17), read from the container's extras table and reusing a pull younger than 6 s.

Files changed (main ones):
- `src/features/detail/*`: header, tabs, info list, the three containers, board target, DOM tests.
- `src/lib/detail-position.ts`: N of M, prev/next, the vanished successor, the list's viewed row.
- `src/state/shortcuts.ts`, `sheet-layer.ts`, `shown-order.ts`, `list-viewed.ts`, `viewed-hash.ts`, `torrent-detail.ts`: Esc layers, the published list order, the viewed row, the URL `hash`, the detail query.
- `src/shared/torrent-detail.ts`, `src/server/functions/get-torrent-detail.ts`, `src/server/sync/syncer.ts`, `extras-table.ts`: the per-torrent read.
- `src/features/list/*`, `src/features/board/*`, `src/routes/_authed*.tsx`, `src/shared/ui/bottom-sheet.tsx`, `sheet-session.ts`, `src/styles.css`: row and card buttons, the list's own scroller, the panel slot, the sheet header slot, utilities.
- `e2e/detail.spec.ts` (new), `e2e/smoke.spec.ts`, `e2e/board.spec.ts`: detail smoke and screenshots, helpers for the own scroller.
- ARCHITECTURE-SPINE AD-6: the detail exception.

Review, first pass: 35 findings. Patched 9 medium and 10 low entries (14 fixes), deferred none, rejected 16 (9 low not worth the added complexity, 7 false), each with its reason in the log.

Review, follow-up pass: 33 findings. Patched 3 medium and 3 low entries (blank panel when the whole order is replaced, held Esc repeat, AD-6 wording on the 6 s pull reuse, e2e for Esc with the real menu and for scroll staying put), deferred 1 maybe-false (scrollbar click may close the board panel, unverified medium), rejected 23 (18 low, 5 false), each with its reason in the log.

Follow-up review recommendation: false. The first pass recommended one (9 medium patched); the follow-up pass patched no high (3 medium, 3 low), so the work has converged.

Verification (2026-11-17, after the follow-up patches): `npm run lint` clean; `npm run typecheck` clean; `npm test` 84 files, 1591 tests passed; `npm run build` ok; `npm run smoke` built server ok; `CI=1 npm run smoke:browser` 39 passed; `check.sh` all ok. Matrix audit: rows D1 to D16 each have at least one covering test that ran and passed.

Residual risks: a click on a board column's scrollbar may close the board panel (deferred, unverified); the phone list now scrolls in its own scroller (iOS address-bar collapse and status-bar tap to top may change); the swipe and sheet feel still needs Alex's real-phone check.
