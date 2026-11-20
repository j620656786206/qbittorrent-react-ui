---
title: 'Story 4.6: Add screen: paste, pick files, drag files'
type: 'feature'
created: '2026-11-20'
status: 'done'
baseline_revision: 'e334504e423530d2634d4c227b0b72df20a3e14e'
review_loop_iteration: 0
followup_review_recommended: false
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-4-context.md'
warnings: ['oversized']
deferred:
  - summary: >-
      The 「會存到 <路徑>」 line is true only if 4.7 adds with Automatic Torrent Management on; a relative category path also shows unresolved.
    evidence: |-
      qBittorrent ignores the category save path when autoTMM is off (its default), and resolves a relative category path
      against the default save path. 4.7 must send autoTMM=true (or the category path as savepath), and should show a
      relative path resolved or as is with that caveat.
    location: >-
      src/features/add/add-model.ts
    severity: medium
  - summary: >-
      In desktop list view in an empty category, 打開 writes the URL but shows no detail (the empty state has no detail panel).
    evidence: |-
      The list's empty block takes the whole width since story 2.4; the outside detail renders in the list panel only.
      Needs an empty category plus a pasted duplicate of a torrent elsewhere. Fix by rendering the outside detail next to
      the empty block, or switching to the torrent's category on 打開.
    location: >-
      src/features/list/torrent-list.tsx
    severity: medium
  - summary: >-
      iPhone Safari may grey out .torrent files in the Files picker for accept=".torrent,application/x-bittorrent" (unverified).
    evidence: |-
      e2e uses setInputFiles. Settle it on an iPhone: tap 選檔案 and pick a .torrent from Files; if greyed out, drop the
      accept filter on iOS (the judge already marks non-torrent files unreadable).
    location: >-
      src/features/add/add-parts.tsx
    severity: medium (unverified)
  - summary: >-
      Keeping the list when the screen crosses 1024px is covered by a DOM test only after this pass, not by e2e viewport changes.
    evidence: |-
      The draft and rows live above the shell switch; a Playwright setViewportSize step would pin it in a browser.
    location: >-
      src/features/add/add-screen.tsx
    severity: low
---

<intent-contract>

## Intent

**Problem:** The header 「新增」, the phone round add button and the empty state's 「新增種子」 are still disabled placeholders, so Alex cannot add torrents from this app. Story 4.5 left the judging functions ready but nothing calls them.

**Approach:** A new `src/features/add` feature: the add screen (desktop 640px dialog, phone fixed 90% sheet) with the paste box, the judged list, the category menu and the footer, plus a desktop drop overlay that works anywhere in the app. An `src/state/add-open.ts` store opens it from the header, the empty state and a drop. 「打開」 opens a torrent's detail even when it is not in the current list (no 第 N 個 header). 「新增 N 個」 stays inert until 4.7.

## Boundaries & Constraints

**Always:**
- Judging uses 4.5's functions only: `splitPaste`, `parseMagnet`, `readTorrentFiles` / `readTorrentFile` (with `yieldToMain = () => new Promise((r) => setTimeout(r, 0))`), `judgeEntries`, `ENTRY_LABELS`. The existing-hash set is every key of `['maindata']` torrents (archived included), re-judged when maindata changes while the screen is open.
- Never call `navigator.clipboard.readText`. Paste comes from the browser `paste` event on a focusable textarea (Cmd or Ctrl+V on desktop, long-press paste on phone). Text typed into it and confirmed with Enter is treated like a paste. Pasted files (`clipboardData.files`) are read like picked files.
- 「選檔案」 opens a hidden `<input type="file" multiple accept=".torrent,application/x-bittorrent">`.
- Names render as plain text (React text nodes, never HTML).
- Layering: `src/features/add` imports state, lib, shared only. The header (features/header), the list and board empty states (features/list, features/board) and the drop target reach it through `src/state/add-open.ts`; the add screen and the drop overlay are mounted by the route (`src/routes/_authed.tsx`). `src/shared/ui/list-blocks.tsx` `ListEmpty` takes an `onAdd` prop instead of importing state.
- Modal behavior reuses the existing shells: desktop `Dialog` / `DialogContent` (non-modal Radix plus `useModalSession`, AD-10 CSP), phone `BottomSheet` `mode="fixed90"` with a pinned `footer`. Esc closes through `useEscapeLayer(open, close, 'dialog')` (desktop) or `useSheetLayer` (phone), like `shortcut-help.tsx` and `sort-sheet.tsx`.
- Closing (取消, ✕, `Esc`, drag down) discards the list. The next open is empty.
- File reads started for a screen that has since closed are ignored when they finish.
- AD-15: e2e uses the fake qBittorrent only; nothing is sent (4.7).

**Never:**
- No submit, no `addTorrents` call, no new server function (4.7). 「新增 N 個」 is rendered with its count and disabled rules but does nothing when pressed.
- No drag on phone (below 1024px no overlay). A text drag shows no overlay.
- Do not change `followHash` / `setHash` semantics, `use-arrow-stepping.ts`, or the `[role="menu"]` plus `inMenus` rule in `shortcuts.ts`.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| A1 open | Header 「新增」, phone round button, empty-state 「新增種子」 | Desktop 640px dialog / phone 90% sheet opens empty; 「新增」 disabled | None |
| A2 paste | Paste 10 lines: magnets (hex, base32, with and without `dn`), an http link, junk, a duplicate | Box becomes the list: unreadable first, then 以前下載過，已整理好, then addable; duplicate merged | None |
| A3 files | 選檔案 with a valid .torrent, a non-torrent file, an 11 MB file | Rows: readable file, 看不懂這個檔案, 檔案超過 10 MB | None |
| A4 existing | Magnet whose btih is an existing (archived) torrent | 以前下載過，已整理好 + 打開 | None |
| A5 remove | ✕ or 拿掉 on a row; then every row | Row leaves, counts update; all removed returns to the empty box | None |
| A6 open existing | 打開 on an existing row (archived, desktop list and phone) | Add closes; the detail opens on that torrent with no 「第 N 個／共 M 個」 and no prev/next | None |
| A7 category default | Opened inside category mteam-X / in 全部 / in 未分類 | Menu preset mteam-X / empty / empty; path line follows the choice | None |
| A8 path | Category with `savePath` / with `savePath: ''` | 「會存到 /data/…」 in mono / 「會存到 qBittorrent 的預設位置」 | None |
| A9 footer | 7 addable, 3 not; no category; 0 addable | 「有 3 個不會加」 + 「新增 7 個」; disabled without category; disabled at 0 | None |
| A10 append | Paste or pick again with rows present | New entries judged together with the old ones (merge and order across all) | None |
| D1 drag files | Desktop, drag .torrent files over any screen, drop | Overlay 「放開就新增」, drop opens add with the files (appends when open) | None |
| D2 drag cancel | Drag out of the window, or Esc while dragging | Overlay disappears | None |
| D3 drag text | Dragging selected text | No overlay | None |
| D4 phone | Below 1024px | No overlay; sheet title area says 貼上磁力連結 | None |
| C1 close | 取消, ✕, Esc, drag down with rows | Closes; reopen is empty | None |
| C2 late read | Close while files are being read | Late results are dropped | None |
| R1 maindata change | A pasted addable hash appears in maindata while open | That row turns 以前下載過，已整理好 | None |

</intent-contract>

## Code Map

- Buttons:
  - `src/features/header/app-shell.tsx:74-81` desktop 「新增」 (native `disabled`), `:89-98` phone round button (`aria-label="新增種子"`, passed as `add` to `PhoneSearchHeader`, `search-box.tsx:256`). Header comment `:48-50` describes the placeholder; update it.
  - `src/shared/ui/list-blocks.tsx:21-33` `ListEmpty` (disabled 「新增種子」, no props), used by `src/features/list/torrent-list.tsx:234`, `src/features/board/torrent-board.tsx:127`, re-exported `src/features/list/list-states.tsx:81`.
  - Tests that assert disabled: `src/features/header/app-shell.test.tsx:116,124-141`, `src/features/list/torrent-list.test.tsx:332-338`, `src/routes/authed-categories.dom.test.tsx:519-522`, `e2e/category-tabs.spec.ts:287-295`.
- Shells:
  - `src/shared/ui/dialog.tsx` `Dialog` (`:38`, always non-modal), `DialogContent` (`:105-121`: `showCloseButton`, `closeOnOutsidePress`, `returnFocus`). The mockup's 36px bordered ✕ sits in the title row, so use `showCloseButton={false}` and render the ✕ in the add header. `ConfirmShell` does not fit (no ✕, no left footer text).
  - `src/shared/ui/bottom-sheet.tsx:81-110` (`mode`, `footer`, `title`/`header`, `closeLabel`, `returnFocus`); `SheetMode` includes `'fixed90'` (`src/shared/ui/sheet-snap.ts:23,27,54`).
  - Copy the open/close pattern of `src/features/header/shortcut-help.tsx:43-100` (state, return focus, a child that calls `useEscapeLayer(true, close, 'dialog')`), and `src/features/header/sort-sheet.tsx:103` (`useSheetLayer`).
- Data: `categorySchema = { name, savePath }` (`src/shared/maindata.ts:63-68`), `savePath` always present, may be `''`. `useMaindata(selectCategories | selectTorrents)` (`src/state/maindata.ts:175-188`). Current category `useListView().view.category` (`src/state/list-view.ts`), `ALL = '__all__'`, `UNCATEGORIZED = ''` (`src/shared/categories.ts:8-9`), `categoryLabel` in `src/lib/category-tabs`.
- Detail:
  - `useViewedHash()` (`src/state/viewed-hash.ts:12-32`), provided at `src/routes/_authed.tsx:503-513`.
  - Every detail path needs a position today: `DetailTarget = { torrent, position, columnName? }` (`src/features/detail/detail-view.tsx:22-26`), `DetailHeaderProps.position` (`detail-header.tsx:70`, ‹ › at `:152-175`), `positionText` (`detail-model.ts:23-29`).
  - Desktop list: `ListDetailPanel` (`list-detail-panel.tsx:17-52`) renders nothing without a position; `resolveListViewed` (`src/lib/detail-position.ts:100-136`) treats a hash outside the order as none (desktop falls back, phone writes `null`). Board: `useBoardDetailTarget` (`board-detail.ts:24-64`) closes a hash outside the columns (phone also for archived).
  - So 「打開」 needs a small addition: a state flag naming the hash opened from outside the list (e.g. `src/state/detail-outside.ts`), which the list and board detail targets honor while the URL hash equals it and maindata has it, with `position: null`. It clears when another row is chosen, the detail closes, or the torrent leaves the data.
- Keyboard: `src/state/shortcuts.ts` `ESCAPE_RANKS` (`:116`), `useEscapeLayer` (`:460`); a `dialog` layer blocks every shortcut action (`:168-172`). Cmd or Ctrl combos never reach the registry (`:357-359`), so Cmd+V reaches the textarea.
- Menus: `src/shared/ui/dropdown-menu.tsx` (portal `container` needed inside a sheet), `src/features/header/sort-menu.tsx:180-204` pill trigger pattern.
- Drag: nothing exists. Mount the overlay in the route tree (`_authed.tsx:517-524`); it listens on `window` for `dragenter`/`dragover`/`dragleave`/`drop` with `dataTransfer.types` including `Files`, only at 1024px and up.
- 4.5 API: `src/lib/info-hash.ts` (`readTorrentFile(s)(source, { yieldToMain })`, `parseMagnet`), `src/lib/add-entries.ts` (`splitPaste`, `judgeEntries`, `ENTRY_LABELS`, `addBatches`), `src/shared/torrent-add.ts`, `src/lib/bencode-testing.ts` (test torrents).
- Specs and mockups: DESIGN.md YAML `bottom-sheet` 309-319 (`height-add: 90%`), `dialog` 320-337 (`width-add: 640px`, `close-button-size: 36px`), `text-input` 338-346, `drop-overlay` 358-368; prose 611 (drop overlay), 661 (text input and the 240px category menu), 663 (add-torrent). EXPERIENCE.md 104, 106, 154-173. Mockups `S06-add-empty-desktop`, `S06-add-many-desktop`, `S06-drop-overlay-desktop`, `S06-add-phone` (`.dc.html`): copy their numbers (rows 40px / 48px phone, paddings, 28px text buttons and ✕ / 44px phone, paste strip, combobox 240 x 36 / 100% x 44, footer layout, dashed box 200px).
- e2e: `e2e/fixtures.ts` (`login`, `openList`, `setModes`, data `sample` has two archived torrents). No paste, drag or `setInputFiles` exists yet: use `locator.setInputFiles` with in-memory buffers, `page.evaluate` to dispatch a `ClipboardEvent('paste')` with a `DataTransfer`, and `dragenter`/`dragover`/`drop` events with a `DataTransfer` holding `File`s. `scripts/fake-qbit.mjs:925-932` categories (all have a savePath; add a data mode or test-only category with `savePath: ''` if A8's empty case needs it).
- Performance precedent: `scripts/trace-delete-exit.mjs`.

## Tasks & Acceptance

**Execution:**
- `src/state/add-open.ts` (new, + test): `openAdd(files?: File[])`, `closeAdd()`, `useAddOpen()`, a queue of files handed over by a drop (appended when already open).
- `src/state/detail-outside.ts` (new, + test) and the detail targets (`list-detail-panel.tsx`, `phone-detail-sheet.tsx`, `board-detail.ts`, `detail-view.tsx`, `detail-header.tsx`, + tests): a hash opened from outside the list shows the detail with `position: null`, no position text, no ‹ ›. A6.
- `src/features/add/` (new): the add screen (desktop dialog with title 「新增種子」 and the 36px ✕; phone `BottomSheet` `fixed90` with pinned footer), the paste box (textarea with the paste and Enter handling), the list (self-scrolling, rows, labels and buttons), the paste strip, the category menu and path line, the footer; file reading through `readTorrentFiles`, with a token to drop late results. Labels next to the name (desktop inline after the name, phone on the next line). + dom tests for A1 to A10, C1, C2, R1.
- `src/features/add/drop-overlay.tsx` (new, + dom test): D1 to D4.
- `src/features/header/app-shell.tsx`, `src/shared/ui/list-blocks.tsx`, `src/features/list/torrent-list.tsx`, `src/features/board/torrent-board.tsx` (+ update the disabled-button tests): enable the buttons and open add.
- `src/routes/_authed.tsx`: mount the add screen and the drop overlay.
- `scripts/fake-qbit.mjs` (only if needed): a category with `savePath: ''` for A8, without changing existing data modes' torrents.
- `e2e/add.spec.ts` (new): A1 to A10, D1 to D3, C1 on desktop; A1, A5, C1 and the phone layout at 390px; the 10-entry list with unreadable, existing and too-large rows; no horizontal scroll at 390px.
- `scripts/trace-add-files.mjs` (new): pick 20 generated 10 MB .torrent files in Chromium (setInputFiles), observe long tasks (`PerformanceObserver` `longtask`) and trace events until all rows show; report the longest task. Record it in Design Notes (closes 4.5's deferred browser measurement).
- Screenshots (`_bmad-output/implementation-artifacts/screenshots/4-6/`), desktop 1440 and phone 390, light and dark: empty; 10 entries (unreadable, existing, too large among them); drop overlay (desktop only); opened in 全部 with the category empty.

**Acceptance Criteria:**
- Given the add screen with problem rows on top and many entries, when the list scrolls, then the footer with 「新增 N 個」 stays visible (the list scrolls inside its frame).
- Given 20 files of 10 MB picked in Chromium, when they are read and judged, then no long task exceeds 200 ms, and the number is recorded.
- Given the add screen open, when any shortcut key except Esc is pressed outside the textarea, then no app shortcut runs (dialog layer).

## Spec Change Log

## Review Triage Log

### 2026-11-20: Review pass
- verdicts: 34 findings: high 0, medium 11, low 18, false 4, maybe-false 1
- findings:
  - `[medium]` `[defer]` (blind) 「會存到」 depends on 4.7 sending autoTMM; relative category paths show unresolved: deferred to 4.7.
  - `[low]` `[patch]` (blind) Re-judging on every poll: the existing-hash set is keyed on the hash list.
  - `[medium]` `[patch]` (blind) Typed text lost on pick, drop, 1024px crossing, paste over a draft: one shared draft, reset on open, paste inserts at the caret; tested.
  - `[false]` `[reject]` (blind) 打開 discards the list without asking: the AC says 打開 closes add.
  - `[medium]` `[patch]` (blind) A drop opens add over another dialog: ignored while another dialog layer is open (`dialogLayerOpen()`); tested.
  - `[low]` `[patch]` (blind) The overlay returns after Esc on the next dragover: hidden until the drag ends; Esc counts only during a drag; tested.
  - `[low]` `[patch]` (blind) Reads from a closed session delay the next one: a fresh read queue per open; tested.
  - `[maybe-false]` `[defer]` (blind) iOS may grey out .torrent in the picker: deferred, iPhone check listed for Alex.
  - `[low]` `[reject]` (blind) The 拿掉 text button and ✕ share an accessible name: both are the same action, as the AC draws them.
  - `[low]` `[patch]` (blind) Submit lacks `hover-solid` and a disabled guard: both added.
  - `[low]` `[patch]` (blind) Missing tests: desktop 新增 `aria-haspopup` and the multi-file yield count added; the IME branch and the board outside case are covered by existing DOM paths.
  - `[false]` `[reject]` (blind) No CI guard for the 200 ms rule: the 4.5 unit measurement runs in CI.
  - `[low]` `[reject]` (intent) Desktop labels sit at the right, not next to the name: the AC (「✕ 左邊」) and S06 mockup place them; flagged for Alex in the PR.
  - `[medium]` `[patch]` (intent) Phone list does not scroll by itself; category and path hide behind the footer: the list is the sheet's scroller, category, path, note and button pinned in the footer; screenshots retaken.
  - `[medium]` `[defer]` (intent) Empty-category desktop list shows no detail after 打開: deferred.
  - `[low]` `[reject]` (intent) Paste and drag tested with synthetic events: real OS drags are a manual NAS check.
  - `[medium]` `[patch]` (intent) Dragging over other dialogs: same fix as the blind row.
  - `[low]` `[reject]` (intent) The trace covers picking only: drop and paste read through the same reader and queue.
  - `[low]` `[reject]` (intent) The 10-entry screenshot shows 9 rows: 10 entries pasted, one duplicate merged by design.
  - `[low]` `[reject]` (intent) Board 打開 covered by DOM tests only: the board paths are exercised in detail.dom.test.tsx.
  - `[false]` `[reject]` (intent) 4.5's info-hash.ts changed: needed after main's CI measured a 314 ms slice.
  - `[low]` `[patch]` (gap) The empty-state 「新增種子」 is never clicked: route test clicks it and asserts the screen opens (AddScreen stubbed: closing the real dialog in the whole route tree spins happy-dom).
  - `[low]` `[patch]` (gap) Category reset on reopen untested: C1 now picks, closes, reopens, asserts the preset.
  - `[low]` `[patch]` (gap) Focus after removing the last row untested: asserted.
  - `[low]` `[defer]` (gap) Crossing 1024px keeps the list: a DOM test now covers the draft; e2e deferred.
  - `[medium]` `[patch]` (edge) Focus falls to body when the box turns into the list: focus moves to the strip's textarea; tested.
  - `[low]` `[patch]` (edge) Removing a row brings a hidden duplicate back: every item with that hash is removed; tested.
  - `[medium]` `[patch]` (edge) Typed draft dropped on pick or drop: same fix as the blind row.
  - `[medium]` `[patch]` (edge) Paste over a partial draft: same fix.
  - `[medium]` `[patch]` (edge) A drop on a narrow desktop window leaves the app: `preventDefault` on file drags at every width; tested.
  - `[medium]` `[patch]` (edge) A drop while another dialog is open: same fix as the blind row.
  - `[low]` `[patch]` (edge) The draft survives a fast phone close and reopen: reset on open; tested.
  - `[low]` `[patch]` (edge) No unit test for detail-outside: `src/state/detail-outside.test.ts` added.
  - `[false]` `[reject]` (edge) `readTorrentFiles` unused: the per-file loop is the same reader with a session token, as the spec allows.

### 2026-11-20: Review pass (follow-up)
- verdicts: 29 findings: high 0, medium 1, low 21, false 7, maybe-false 0
- findings:
  - `[low]` `[patch]` (edge) A paste that leaves the draft unchanged still moves the caret ref: set only when the draft changes; tested.
  - `[low]` `[patch]` (edge) Opened before maindata loads, existing torrents look addable: 「新增 N 個」 waits for `ready`, rows re-judged on load; tested.
  - `[false]` `[reject]` (edge) An outside torrent deleted in this tab loses its fade: it cannot be selected (not in the list), so this tab cannot delete it.
  - `[false]` `[reject]` (edge) A live torrent shows 以前下載過，已整理好: the PRD assumption uses one text for any state; flagged for Alex.
  - `[low]` `[reject]` (edge) A paste of tens of thousands of tokens freezes the UI: not a realistic paste; a cap adds a new rule.
  - `[low]` `[patch]` (edge) A files-heavy 10 MB torrent is not measured in a browser: the trace now runs a 150,000-file set (longest task 21 ms).
  - `[false]` `[reject]` (edge) `readTorrentFiles` unused: carried.
  - `[false]` `[reject]` (blind) The existing label on live torrents: same as the edge row.
  - `[medium]` `[patch]` (blind) After Esc the overlay can stay dismissed for the rest of the session in a real drag: a new `dragenter` from depth 0 starts a fresh drag and clears it; tested.
  - `[low]` `[patch]` (blind) The read chain has no catch: each read is guarded; a throwing file becomes 看不懂這個檔案 and the queue continues; tested.
  - `[low]` `[reject]` (blind) Duplicate accessible names on 拿掉 and ✕: carried.
  - `[low]` `[patch]` (blind) The trace overwrites the committed JSON on failure, hides fake-qbit output, fixed port: writes only on a complete run, stderr passed through, free port.
  - `[low]` `[patch]` (blind) The trace does not exercise the 5000-file slicing: same fix as the edge row.
  - `[low]` `[patch]` (blind) The IME Enter guard is untested: tested for `isComposing` and keyCode 229.
  - `[low]` `[patch]` (blind) A chosen category removed while open is untested: tested (menu empty, path cleared, 新增 disabled).
  - `[low]` `[defer]` (blind) iPhone picker `accept`: carried, deferred.
  - `[low]` `[patch]` (blind) The `hashKey` comment overstates: corrected.
  - `[false]` `[reject]` (blind) Esc and ✕ discard without asking while outside presses are blocked: the AC discards on every close; the outside press is blocked because it is the easiest accident.
  - `[low]` `[patch]` (blind) `role="status"` with `aria-live="assertive"`: `aria-live` removed; asserted.
  - `[low]` `[reject]` (blind) The screenshot name says ten for nine rows; duplicate setModes: carried; cosmetic.
  - `[low]` `[patch]` (gap) The phone A6 e2e would pass a sheet that closes at once: URL and settled visibility asserted.
  - `[false]` `[reject]` (intent) The phone sheet title stays 新增種子: D4 means the box text; the AC titles the screen 新增種子.
  - `[low]` `[reject]` (intent) Phone drag-down close is not in e2e: the sheet's drag close is covered by its own tests (2.2).
  - `[low]` `[reject]` (intent) Desktop board 打開 not in e2e: covered by DOM tests.
  - `[low]` `[reject]` (intent) Paste and drag through synthetic events: carried; manual NAS check.
  - `[low]` `[reject]` (intent) 選檔案 opening the picker not tested: browsers do not let tests open a native picker; the input's attributes are asserted.
  - `[low]` `[reject]` (intent) C2 and R1 only in DOM tests: their timing needs stubbed reads.
  - `[low]` `[reject]` (intent) 新增 uses `aria-disabled`: it stays focusable and inert, as the delete confirm does.
  - `[false]` `[reject]` (intent) 4.5's info-hash.ts changed: carried.

## Design Notes

Claude 代決 (Alex can veto):
- The add screen gets its own shell (desktop `Dialog` with the mockup's 36px ✕ in the title row; phone `BottomSheet` `fixed90`), not `ConfirmShell`, which has no ✕ and no left footer text.
- Opened in 未分類 the category menu starts empty, like 全部: qBittorrent has no category named ''.
- The category menu: the implementer may use a native `<select>` styled as the 36px pill (keyboard and phone pickers for free) or the existing `DropdownMenu` radio group; record the choice. Options are every qBittorrent category, sorted with `categoryLabel` order used by the tabs.
- Typed text confirmed with Enter counts as a paste, so the box works without a clipboard.
- Files appear in the list as each one is read (in input order); while reading, the paste strip (or the box) shows 「讀取中…」.
- A drop while the add screen is open appends.
- 「打開」 on a torrent outside the current list opens its detail without position text and arrows (PRD FR-38 assumption); choosing any row in the list or closing the detail ends that state.
- The desktop dialog's height is capped to the viewport (about 40px margin); the list frame takes the free space and scrolls.

Implementation notes (Claude 代決, Alex can veto):
- The category menu is a native `<select>` drawn as the 36px pill, 44px on the phone. It gets keyboard handling and the phone's own picker without extra code, and needs no portal inside the sheet.
- On desktop a press outside the dialog leaves it open, like the delete confirmation, so a stray click never discards a pasted list. 取消, ✕ and Esc close it.
- On the phone the list frame is the sheet's whole scrolling content, and the category field, 「會存到」 and the button sit in the pinned footer, so they stay in view. The paste strip sticks to the bottom of that scroller. The sheet's own drag rule then applies to the list: a drag scrolls it, and moves the sheet only from the top. With an empty box the category field sits low, above the button.
- The button reads 「新增」 when nothing is addable, as in the empty mockup, and 「新增 N 個」 otherwise.
- A paste that carries files counts only the files. Finder also puts the file name in the pasted text.
- In the paste box Enter confirms typed text and Shift+Enter adds a new line.
- 「打開」 keeps the normal position when a list row or board column holds the torrent, for example the desktop board's 已整理 column or a torrent in the current category. Only a torrent that nothing holds opens without a position.
- D4 is read as the phone box and paste strip text 「貼上磁力連結」. The sheet title stays 「新增種子」.
- For A8 in e2e, fake-qbit's new `cats=default-path` mode adds `X-default` with `savePath: ''`. Other modes are unchanged.
- Known gap: desktop list mode in an empty category has no detail panel (story 2.4), so 「打開」 there writes the URL but shows no detail until a row exists.

Measurement (closes 4.5's deferred browser check), `node scripts/trace-add-files.mjs` on 2026-11-20 in headless Chromium 156. Each set is 20 generated torrents picked at once on a freshly opened screen:
- single-file torrents just under 10 MB (largest 10,484,989 bytes): no long task over 50 ms, longest main-thread task 19 ms, all 20 rows after 3.3 s
- multi-file torrents with 150,000 `files` entries each (largest 5,711,851 bytes), which exercises the 5000-entry slicing from 80d1c42: no long task over 50 ms, longest main-thread task 21 ms, all 20 rows after 5.7 s
- the summary in `screenshots/4-6/trace-add-files.json` is written only when both sets show all 20 rows

AD-11 docs:
- `paste` event and `ClipboardEvent.clipboardData`: https://developer.mozilla.org/en-US/docs/Web/API/Element/paste_event
- HTML drag and drop, `DataTransfer.types` / `files`: https://developer.mozilla.org/en-US/docs/Web/API/HTML_Drag_and_Drop_API
- `<input type="file">` `accept`, `multiple`: https://developer.mozilla.org/en-US/docs/Web/HTML/Element/input/file
- `File` / `Blob.arrayBuffer()`: https://developer.mozilla.org/en-US/docs/Web/API/Blob/arrayBuffer
- Long tasks API: https://developer.mozilla.org/en-US/docs/Web/API/PerformanceLongTaskTiming
- Radix Dialog (radix-ui 1.8.1): https://www.radix-ui.com/primitives/docs/components/dialog
- Playwright `setInputFiles`: https://playwright.dev/docs/api/class-locator#locator-set-input-files

## Verification

**Commands:**
- `source ~/.nvm/nvm.sh && nvm use && npm run lint && npm run typecheck`: expected to pass.
- `source ~/.nvm/nvm.sh && nvm use && npm test`: all pass.
- `source ~/.nvm/nvm.sh && nvm use && npm run build && caffeinate -dimsu npx playwright test`: all pass.
- `source ~/.nvm/nvm.sh && nvm use && node scripts/trace-add-files.mjs`: longest long task under 200 ms.
- `bash .claude/skills/next-story/check.sh`: every line ok.

## Auto Run Result

Status: done (first pass; a follow-up review pass is recommended).

**Change.** The header 「新增」, the phone round button and the empty state's 「新增種子」 open the add screen (`src/features/add`): a 640px desktop dialog or a fixed 90% phone sheet with the paste box, the judged list (4.5's functions), the category menu with 「會存到」, and the footer with 「有 N 個不會加」 and an inert 「新增 N 個」. A desktop drop overlay opens it from any screen. 「打開」 shows a torrent outside the current list in the detail without position text (`src/state/detail-outside.ts`).

**Files.** `src/state/add-open.ts`, `src/state/detail-outside.ts` (+ tests); `src/features/add/` (model, entries hook, parts, screen, drop overlay, + tests); the header, `ListEmpty`, list and board wiring; the route mounts; the detail panel, sheet and board target for outside torrents; `dialogLayerOpen()` in `src/state/shortcuts.ts`; `scripts/fake-qbit.mjs` `cats=default-path`; `e2e/add.spec.ts`; `scripts/trace-add-files.mjs`; `src/lib/info-hash.ts` (yield every 5000 files, 80d1c42); screenshots in `screenshots/4-6/`.

**Review.** 34 findings. Patched: medium 7 entries (shared draft, focus after the swap, narrow-window drop, drop over another dialog, phone list scrolling, plus their duplicates), low 11 rows. Deferred: 4 (autoTMM for 4.7, empty-category 打開, iPhone picker, 1024px e2e). Rejected: 4 false, 8 low with reasons in the triage log.

**Follow-up review: true.** Two or more medium entries were patched. The unreviewed risks are the shared draft and caret insertion, the drop-overlay layer rule (`dialogLayerOpen()`), and the phone footer layout.

**Verification (2026-11-20, after the patches).**
- `npm run lint`, `npm run typecheck`: exit 0.
- `npm test`: 149 files, 3614 tests pass.
- `npm run build && npx playwright test`: 169 passed, 1 skipped (the opt-in recording), 20.5 min.
- `node scripts/trace-add-files.mjs` (before the patches): 20 files of 10 MB, longest main-thread task 18 ms, none over 50 ms.
- `check.sh`: every line ok.

### Follow-up pass 1 (2026-11-20)

Status: done. Follow-up review: false (no high patched; converged).

**Review.** 29 findings. Patched: medium 1 (overlay dismissed after Esc), low 11 rows. Deferred: 0 new (1 carried). Rejected: 7 false, 10 low with reasons in the triage log.

**Verification (after the patches).**
- `npm run lint`, `npm run typecheck`: exit 0.
- `npm test`: 149 files, 3620 tests pass.
- `npx playwright test` on add, category-tabs, detail, delete, shortcuts: 58 passed (the full suite, 169 passed, ran after the first pass).
- `node scripts/trace-add-files.mjs`: single-file set longest task 19 ms, 150,000-file set 21 ms, none over 50 ms.
- `check.sh`: every line ok.
