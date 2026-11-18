# Epic 3 Context: Find it, remember it

<!-- Generated from planning artifacts. Regenerate with compile-epic-context if planning docs change. -->

## Goal

Let Alex narrow roughly 4,000 torrents to what he cares about and have the app remember how he likes to look at them. He filters by category (tabs on desktop, a bottom-sheet list on phone), types to filter names inside the current category, and each category (including "All") remembers the last sort he picked by hand. That memory lives in a settings file on the NAS so desktop and phone share it. Reopening the app returns this device to the last category and torrent. Desktop gets keyboard shortcuts with a help dialog, and a settings page orders the category tabs and toggles board auto-collapse. This epic introduces `settings.json` for the first time. Selection, delete, add, move and rename are out of scope.

## Stories

- Story 3.1: Settings file and "All" remembers its sort
- Story 3.2: Desktop category tabs
- Story 3.3: Settings page
- Story 3.4: Phone category sheet
- Story 3.5: In-list search
- Story 3.6: Reopen the app where you left off
- Story 3.7: Keyboard shortcuts and help dialog

## Requirements & Constraints

- Picking a category filters to it, switches the sort to that category's remembered one, and scrolls the list or board back to the top. A category with no remembered sort uses "狀態" (the board).
- Only a manual sort pick (menu, phone sheet, or tapping the selected item to flip direction) writes the remembered sort. An app-driven sort change on category switch never writes.
- Remembered sorts, category order and common paths are shared across devices via the NAS. Concurrent edits must not overwrite each other, and a half-written file must never corrupt settings.
- Last-viewed category and per-category last-viewed torrent are per device, never sent to the NAS.
- Search filters only the current category, matches name only, case-insensitive, trims surrounding whitespace; empty string means no filter. Special characters (`.`, `*`, `(`, `<script>`) match literally and render as plain text. Category names are plain text too.
- Performance: with about 4,165 fake torrents, a category switch plus redraw, and each search keystroke plus redraw, must finish within 100 ms on the dev machine. PRs report the measurement method and numbers.
- Shortcuts, the settings-page entry from the header, and tab-number hints are desktop only (width 1024px and up). Phone has no shortcut button.
- Accessibility: labelled icon buttons, visible focus rings, 44px phone touch targets, no horizontal scroll at 390px.
- Tests use only fake qBittorrent responses and a temporary settings folder; never touch `./config` or the real qBittorrent.

## Technical Decisions

- **State owners (single owner per piece of state):**
  - URL search params: `category`, `q`, plus the existing `sort`, `dir`, `hash`. Schema lives in `src/shared`, validated with zod, always updated with `replace` (no history entries). Invalid or no-longer-existing `category` falls back to "All" and the URL is corrected with `replace`.
  - `settings.json`: per-category sort, category order, common paths.
  - localStorage, only through the key table in `src/lib/prefs.ts`: last-viewed category, per-category last-viewed hash (added in 3.6), auto-collapse toggle (already exists). Read with zod; bad values or storage errors count as "absent". No direct `localStorage` in feature code.
  - `src/state`: shortcut registry, order freeze.
- URL `sort`/`dir` mean "the sort on screen now". On category switch the app replaces them with the category's remembered sort; on a manual pick the app updates both the URL and `settings.json`. A URL without `sort` uses the current category's remembered sort, replacing Epic 2's hard-coded "狀態" default.
- **Settings schema** (`src/shared/settings.ts`, fixed in 3.1; changing it later requires changing the architecture spine first): `{ version: 1, categorySort: {}, categoryOrder: [], commonPaths: [] }`. `categorySort` maps category key to `{ sort, dir }`, `sort` restricted to the 51 ids in `src/shared/sort-fields.ts`. `categoryOrder` is category names, never `ALL`. `commonPaths` entries are `{ path, name, mediaLibrary }`: `path` passes the shared path schema, `name` 1 to 50 chars, max 50 entries.
- **Category keys** (`src/shared/categories.ts`): `ALL = '__all__'`; uncategorized is the empty string, appears only when it has torrents, displayed as 「未分類」, ordered like any other category.
- **Shared path schema** (in `src/shared`, defined in 3.1 for `commonPaths`, reused by Epic 5): absolute, normalized, no NUL, backslash, control characters or `..` segments, max 1024 chars; the container also requires it under a `SAVE_ROOTS` root on a folder boundary.
- **Settings storage** (`src/server/settings`): `${CONFIG_DIR}/settings.json`, mode 600. Missing file or section: fill defaults. Unparseable JSON: keep the old file renamed with a timestamp, start from defaults, log without content. `version` newer than the code knows: leave the file alone, serve defaults, fail every write with `settings_write_failed`. One invalid entry is dropped and logged, not treated as corruption. Migrations live in `src/server/settings/migrations.ts`. Writes queue on one lock, go to a temp file then rename, and a file over 256 KB is rejected.
- **Server functions** (only via the `_define.ts` factory): `getSettings` (GET, no side effects), `setCategorySort({ category, sort, dir })` and `setCategoryOrder` (POST, idempotent, full new order). Mutations return the full new settings, which the frontend writes into `['settings']`; `['settings']` is refetched on window focus. Unauthenticated calls return `not_logged_in`. `setCategoryOrder` rejects `ALL` or duplicate names with `invalid_input`.
- **Errors:** `settings_write_failed`, `timeout`, `invalid_input` on settings writes show the "failure with retry" toast from `src/lib/toast.ts`, text from `src/lib/error-text.ts`. The screen keeps what Alex picked. Connection-class codes are handled only by the global handler.
- **Pure functions in `src/lib`:** category and search filtering happen inside `selectVisibleTorrents(maindata, view)` (the view gains category and query); feature code never filters or sorts torrents itself. Tab counts (excluding 已整理), tab ordering ("All" first, then `categoryOrder`, then unlisted names sorted by name), and the "remembered sort" hint condition (input: sort before, sort after, who changed it) are each one pure function with vitest coverage.
- **Shortcuts:** one registry in `src/state`. Each entry has key, description and group; the help dialog and tooltips are generated from it (vitest asserts same source). In inputs only `Esc` is handled; Cmd/Ctrl/Alt combos and IME composition (`isComposing`) are ignored. `Esc` closes dialog, then search, then detail.
- **Settings-page order arrows** wait for the container's response before moving (no optimistic update); that row's arrows are disabled while waiting.

## UX & Interaction Patterns

- **Desktop category tabs:** pills with a muted count (excluding 已整理); selected is `accent` on `accent-foreground`, unselected `surface` with `border`. Overflow scrolls horizontally (no scrollbar, right-edge fade, never wraps), the selected tab scrolls into view, the sort button stays pinned right. Empty categories get no tab; a category holding only 已整理 shows with count 0. If the selected category empties while viewed, its tab stays with 「這個分類沒有種子」 until Alex leaves.
- **"Remembered sort" hint:** after an app-driven switch that changed the sort, desktop appends a muted 「（這個分類記住的）」 to the sort button; phone shows a muted line below the third row (「排序換成這個分類記住的：<sort>」) that pushes content down. Gone after a manual pick; never shown on app open or when the sort did not change.
- **Phone category sheet:** the category button (「<name> <count> ▾」) opens the existing content-height bottom sheet titled 「分類」: "All" first, empty categories omitted, current one bold with a check, and a final 「設定」 row below a hairline. Tapping the current category just closes it.
- **Search:** header magnifier or `/`. Desktop expands in place to a 240x36px pill over empty header space; phone covers the first row with a 「取消」 button. Focus goes to the input; ✕, 「取消」 or `Esc` clears `q`. The query survives category switches. Column counts and 「第 N 個／共 M 個」 follow results; tab and category-button counts do not. No results in a category: 「『<q>』在 <category> 找不到」 plus 「在全部裡找」 (keeps the query); in "All" only 「找不到『<q>』」. The whole board is replaced only when every column including 已整理 is empty.
- **Settings page:** reuses the old settings page's position and style (deleted in 1.1, recoverable from git history) with rewritten code, a back button to the list URL Alex came from, and exactly two items: category order (all qBittorrent categories, "All" fixed first, labelled up/down arrows) and the 「捲動時自動收合其他欄」 switch (default on, per device, noted as desktop-only on phone).
- **Reopen:** with no `category`, `sort` or `hash` in the URL, restore the last category (fallback "All") and its remembered sort via `replace`. List mode opens detail on that category's last-viewed torrent, else the first row; board mode and phone never auto-open detail. Explicit URL params always win.
- **Shortcuts:** `/`, `Esc`, `↑` `↓` (list: frozen-order prev/next with focus following the viewed row; board: same column, only while detail is open), `1` to `9` for tabs, `[` `]` without wrapping, `S` then `1` to `5` for the five common sorts, `?` for a shadcn `Dialog` help grouped from the registry.
- **Category switch:** progress rings spin from 0 and rows re-enter once, as on app open.

## Cross-Story Dependencies

- **Existing from Epics 1 and 2 (all merged):** sort ids in `src/shared/sort-fields.ts`; the `sort`/`dir`/`hash` search schema in `src/shared/list-search.ts`; `selectVisibleTorrents`; the order-freeze hook behind 「第 N 個」 and prev/next; the shortcut registry in `src/state/shortcuts.ts` (only `Esc` so far); `src/lib/prefs.ts` with `autoCollapse` (2.8); the bottom sheet (2.2); the toast wrapper (2.6); `replayEntrance()` in `src/state/entrance.ts` (2.9, meant for category switches); the skeleton (1.8, which leaves "wait for settings" to 3.1); disabled header placeholders for search, shortcuts and settings; and the sort menu's `1` to `5` hints, currently text only (2.1).
- 3.1 must land first: it defines the settings schema, path schema, category keys and `setCategorySort`, which 3.2 to 3.6 use. The common-paths section is defined here but its mutators belong to Epic 5.
- 3.2 defines tab ordering, counts and the "remembered sort" pure function reused by 3.3 (order list), 3.4 (sheet and hint line) and 3.7 (number keys and tooltips).
- 3.3's phone entry point is wired by 3.4's 「設定」 row.
- 3.5 registers `/` and the search layer in `Esc`'s close order; 3.7 completes the registry and the help dialog over everything earlier stories registered.
- 3.6 removes 2.4's "no last-viewed torrent" behaviour; its scroll-into-view depends on 3.7's `↑`/`↓`.
- Epic 4's selection clears on category or search change, so the URL `category` and `q` defined here become its triggers.
