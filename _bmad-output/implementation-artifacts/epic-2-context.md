# Epic 2 Context: Board, Detail, Sorting

<!-- Generated from planning artifacts. Regenerate with compile-epic-context if planning docs change. -->

## Goal

Turn the Epic 1 list into the real daily view. The "state" sort shows a board (desktop: 4 work columns plus a collapsed "organised" column with auto-collapse on scroll; mobile: 4 status tabs with swipe), and any of the other 50 sorts shows a list. Clicking a row or card opens the detail in place (fixed header with "N of M" and prev/next, overview, save-path block, files tab), where Alex can pause/resume one torrent and toggle file download/priority. This epic also introduces the shared bottom sheet, toast, `pendingOps`, the shortcut registry (Esc only) and a CI browser smoke. It matters because sorting, detail and the two exceptions (pause/resume, file selection) are required for the rewrite to replace VueTorrent for the two-week only-the-rewrite trial.

## Stories

- Story 2.0: Browser smoke in CI, Chinese not-found page, login wiring tests
- Story 2.1: 51 sorts and the desktop sort menu
- Story 2.2: Bottom sheet and mobile sort sheet
- Story 2.3: Board: 5 desktop columns and mobile status tabs
- Story 2.4: Opening detail: three containers, fixed header, prev/next
- Story 2.5: Detail overview: status hero, stat tiles, save-path block
- Story 2.6: Pause/resume and toast
- Story 2.7: Files tab: list, checkbox, priority
- Story 2.8: Board auto-collapse
- Story 2.9: Progress ring spin-in and row entrance
- Story 2.10: Reason text for errored torrents

## Requirements & Constraints

- Scale: about 4165 torrents. List, board columns and files tab are virtualised (`@tanstack/react-virtual`): the list under 100 rows in the DOM, each board column and the files tab under 60; re-sort plus repaint under about 100 ms. The 5 s maindata delta must stay under the 160 KB budget.
- Sort: exactly 51 field ids (no download path, its basename, or tags); top 5 are state, seeding time, added, ratio, completed. Missing values sort last in both directions; ties break by `added_on` newest then `hash`, never reversed. Board column order is fixed per column, not user-editable. "Organised" torrents never appear in list mode or count in totals and "M".
- Changing sort (including board/list switch) scrolls to top. No `sort` in URL means "state" (since Story 2.3).
- Refresh must not reorder the list while the desktop mouse is over it, anything is selected, a mobile finger is scrolling, a sheet is open, or an animation runs. The board is not frozen by hover; Alex's own actions always apply immediately.
- Actions (pause/resume, file priority, copy path) show no success toast and no optimistic update; the next refresh is the feedback. Non-connection failures show a "failure with retry" toast. Copy must work over plain http (textarea fallback).
- Motion only on `transform`/`opacity`, 60 fps target on a real phone; `prefers-reduced-motion` skips every animation without losing function.
- Breakpoint 1024 px; no horizontal scroll at 390 px; mobile tap targets at least 44 px. Status is colour plus icon; icon-only buttons have `aria-label`; truncated names stay reachable; keyboard focus (2 px `accent` outline on `:focus-visible`) differs from the 2 px inset "viewing" ring. Contrast at least 4.5 for text, 3 for large text.
- Every story screenshots light and dark. Torrent names, paths, file names and `error` reasons are always plain text. Private categories appear only as the code names X / mteam-X (including in sanitised error reasons).
- Writes are verified only against fake qBittorrent responses; Alex accepts writes on the NAS.

## Technical Decisions

- Layers are lint-enforced: features never import each other. Shared UI (bottom sheet, toast) goes in the shared component directory beside the Epic 1 shadcn components and status circle, not under `features/`.
- Data sources (one owner each, all read-only GETs through the server function factory):
  - `['maindata']`: the slim torrent table via `getMaindata({ since })`, written only by `maindata-merge`. List, board, detail list values, counts and header all derive from it.
  - `['sort-keys', field]`: sorts on fields the slim table does not carry (peer counts, limits, traffic, comment, content path, infohash and similar) come from `getSortKeys({ field, since })`, polled every 5 s only while that sort is active. The container keeps those fields in a second table and computes derived values with `src/lib` pure functions.
  - `['torrent-detail', hash]` (detail exception, added 2026-11-17 in Story 2.4): the few detail-only fields the slim table lacks (downloaded, uploaded from 2.4; seeds/sources and leechers added in 2.5) come from `getTorrentDetail({ hash })`, polled every 5 s only while the detail is open, for the viewed torrent only. The container reads them from the sort-keys second table and reuses a `sync/maindata` run from the last 6 s, syncing itself only if older. Changing torrent changes the key; never show the previous torrent's values. Only fields listed in `src/shared/torrent-detail.ts` are sent. Do not add these fields to the slim table (would exceed the 160 KB delta budget) and do not use `getSortKeys` for one torrent.
  - `['files', hash]`: only while the files tab is open, every 5 s.
- Tracker is stored and sent only as a hostname; full tracker URLs (they carry the passkey) and magnet links never leave the container. Comment, content path, root path and infohash are sent only via `getSortKeys`.
- URL search params own `sort`, `dir`, `hash` (zod schema in `src/shared`); changes use `replace`, invalid values reset to defaults and the URL is corrected.
- `selectVisibleTorrents` in `src/lib` is the only sorter, including board columns; no `sort()` in features. `classify()` is the only state mapping (no `torrent.state ===`); special values only in `src/lib/format.ts`; path last-two-segments only via `src/lib/paths.ts`. Sort ids in `src/shared/sort-fields.ts`; derived fields as `src/lib` pure functions following VueTorrent v2.37.0. Board "needs attention" sorts by `last_activity` newest first.
- One freeze hook in `src/state` owns the visible order used by "N of M", prev/next and the vanished-torrent successor (a pure `src/lib` function). Animations hold incoming maindata through the same hook.
- After a successful action call the single `refreshMaindata()` (file actions refetch `['files', hash]`). In-flight state only via `src/state` `pendingOps` (cleared when reflected or after 30 s).
- Server functions only via the `_define.ts` factory: GET reads, POST writes, `URLSearchParams`, zod hashes (40/64 lowercase hex, 1 to 5000, never `all` or `|`; hash-array body limit 384 KB), per-item batch result shape (fire-and-forget calls count every item as ok). File priority only `0`, `1`, `6`, `7`; file ids non-negative integers, joined in the container. Connection error codes are handled only by the global `onError`; features handle `qbit_rejected`, `timeout`, `invalid_input` via `src/lib/error-text.ts`. Error reasons (2.10) come from one new named read-only qBittorrent log method, rate-limited, not on the 5 s poll.
- Toast only via `src/lib/toast.ts` (normal, with button, failure with retry); shortcuts only via the `src/state` registry (this epic: `Esc` only); localStorage keys only in `src/lib/prefs.ts`.
- Browser smoke: Playwright, Chromium only, built server plus `scripts/fake-qbit.mjs`, zero CSP violations and console errors. CSP stays strict (nonce for HTML, no `unsafe-inline` scripts).
- FLIP for auto-collapse, SVG `stroke-dashoffset` for rings (no `conic-gradient`), hand-written pointer-event gestures; no shadcn `Sheet`, no animation or gesture packages. Check docs for the pinned framework versions and cite URLs in the PR.

## UX & Interaction Patterns

- Sort button shows view, field and arrow ("state" has no arrow); `aria-label` and tooltip spell out the direction in words. In the menu or sheet, clicking the selected item flips direction and stays open; clicking another applies its default direction and closes. "更多" expands inline (grouped, no submenu) and auto-opens when the current sort is inside it.
- Bottom sheet is the single mobile container (sort, detail, later dialogs): closes by drag down, scrim tap or ✕ with focus returned to the opener; `role="dialog"`, `aria-modal`, focus trapped, background scroll locked. Snap positions decided by a `src/lib` pure function.
- Detail containers: desktop list mode has a permanent right panel; desktop board mode has a floating panel over the completed and organised columns (no scrim, board stays clickable, Esc/✕/empty click closes); mobile uses the bottom sheet at 70%. Closing removes `hash` from the URL.
- Detail header is sticky across tabs: name, ‹ "第 N 個／共 M 個" ›, "⋯", then overview/files tabs. In board mode the range is the current column and prev/next never jump columns; buttons disable at the ends.
- Overview top to bottom: status hero (12 states, text from a `src/lib` function over `classify()`), 3 stat tiles that change by state group, save-path block (label, full path truncated from the front, copy plus three disabled buttons), info list.
- Vanished torrent: list mode moves to the next (else previous); board panel closes on delete but follows a column change; mobile sheet closes on delete.
- Loading uses same-size skeletons, never spinners or "載入中…". Empty board column says "沒有"; empty needs-attention says "都沒問題".
- Exact sizes, timings, colours and tokens for each component are in the story specs and UX DESIGN.md; do not improvise values.

## Cross-Story Dependencies

- Done: 2.0 to 2.4. 2.0's fake-qbit smoke is the browser check for every later story; 2.1 built sort fields, URL params, `getSortKeys` and the second table; 2.2 the bottom sheet; 2.3 the board and `last_activity` in the slim table; 2.4 the detail containers, `Esc` registry, freeze-based "N of M", successor function and `getTorrentDetail`.
- 2.5 extends `getTorrentDetail` / `src/shared/torrent-detail.ts` with seeds/sources and leechers for the stat tiles, and adds the hero, tiles and save-path block above 2.4's info list.
- "⋯" stays disabled until 2.6, files tab until 2.7. 2.6 creates `src/lib/toast.ts` (with a position parameter for the Epic 4 selection bar), reused by 2.7 and later epics.
- 2.8 creates `src/lib/prefs.ts`, reused by Epic 3 (3.3, 3.6). 2.9 exposes a `src/state` trigger that Epic 3 calls on category change.
- Deferred to later epics: per-category remembered sort, last-viewed torrent, `↑` `↓` and other shortcuts (Epic 3); checkboxes and selection bar (Epic 4); "☆ 加到常用", "改路徑", "改檔名" and moving state (Epic 5). These stay rendered but disabled using the Epic 1 pattern.
- Relies on Epic 1: `classify()`, `maindata-merge`, `refreshMaindata()`, the server function factory, `scripts/fake-qbit.mjs`, status circle and the disabled-control pattern. 2.10 replaces the fixed "qBittorrent 回報錯誤" text from Story 1.6.
