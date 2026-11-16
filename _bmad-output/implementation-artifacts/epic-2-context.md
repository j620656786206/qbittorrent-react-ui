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

- Scale: about 4165 torrents. List, board columns and files tab are virtualised (`@tanstack/react-virtual`), under 60 rows/cards in the DOM per list or column; re-sort plus repaint under about 100 ms.
- Sort: exactly 51 field ids (no download path, its basename, or tags); top 5 are state, seeding time, added, ratio, completed. Missing values sort last in both directions; ties break by `added_on` newest then `hash`, never reversed. Board column order is fixed per column, not user-editable. "Organised" torrents never appear in list mode or count in totals and "M".
- Changing sort (including board/list switch) scrolls to top. No `sort` in URL means "state" from Story 2.3 on.
- Refresh must not reorder the list while the desktop mouse is over it, anything is selected, a mobile finger is scrolling, or a sheet is open. The board is not frozen by hover; Alex's own actions always apply immediately.
- Actions (pause/resume, file priority, copy path) show no success toast and no optimistic update; the next refresh is the feedback. Non-connection failures show a "failure with retry" toast. Copy must work over plain http (textarea fallback).
- Motion only on `transform`/`opacity`, 60 fps target on a real phone; `prefers-reduced-motion` skips every animation without losing function.
- Breakpoint 1024 px; no horizontal scroll at 390 px; mobile tap targets at least 44 px. Status is colour plus icon; icon-only buttons have `aria-label`; truncated names stay reachable; keyboard focus (2 px `accent` outline on `:focus-visible`) differs from the 2 px inset "viewing" ring.
- Every story screenshots light and dark. Torrent names, paths, file names and `error` reasons are always plain text.
- Writes are verified only against fake qBittorrent responses; Alex accepts on the NAS.

## Technical Decisions

- Layers are lint-enforced: features never import each other. Shared UI (bottom sheet, toast) goes in the shared component directory beside the Epic 1 shadcn components and status circle, not under `features/`.
- URL search params own `sort`, `dir`, `hash` (zod schema in `src/shared`); changes use `replace`, invalid values reset to defaults and the URL is corrected.
- `selectVisibleTorrents` in `src/lib` is the only sorter, including board columns; no `sort()` in features. `classify()` is the only state mapping (no `torrent.state ===`); special values only in `src/lib/format.ts`. Sort ids in `src/shared/sort-fields.ts`; derived fields as `src/lib` pure functions following VueTorrent v2.37.0.
- One freeze hook in `src/state` owns the visible order used by "N of M", prev/next and the vanished-torrent successor (a pure `src/lib` function). Animations hold incoming maindata through the same hook.
- After a successful action call the single `refreshMaindata()` (file actions refetch `['files', hash]`). In-flight state only via `src/state` `pendingOps`.
- Server functions only via the `_define.ts` factory: GET reads, POST writes, zod hashes (40/64 lowercase hex, 1 to 5000, never `all` or `|`), `URLSearchParams`, per-item batch result shape. Connection error codes are handled only by the global `onError`; features handle `qbit_rejected`, `timeout`, `invalid_input` via `src/lib/error-text.ts`.
- Toast only via `src/lib/toast.ts`; shortcuts only via the `src/state` registry (this epic: `Esc` only); localStorage keys only in `src/lib/prefs.ts`.
- Browser smoke: Playwright, Chromium only, built server plus `scripts/fake-qbit.mjs`, zero CSP violations and console errors. CSP stays strict.
- FLIP for auto-collapse, SVG `stroke-dashoffset` for rings, hand-written pointer-event gestures; no shadcn `Sheet`, no animation or gesture packages. Check docs for the pinned framework versions and cite URLs in the PR.

## UX & Interaction Patterns

- Sort button shows view, field and arrow ("state" has no arrow); `aria-label` and tooltip spell out the direction in words. In the menu or sheet, clicking the selected item flips direction and stays open; clicking another applies its default direction and closes. "更多" expands inline (grouped, no submenu) and auto-opens when the current sort is inside it.
- Bottom sheet is the single mobile container (sort, detail, later dialogs): closes by drag down, scrim tap or ✕ with focus returned to the opener; `role="dialog"`, `aria-modal`, focus trapped, background scroll locked.
- Detail containers: desktop list mode has a permanent right panel; desktop board mode has a floating panel over the completed and organised columns (no scrim, board stays clickable, Esc/✕/empty click closes); mobile uses the bottom sheet at 70%. Closing removes `hash` from the URL.
- Detail header is sticky across tabs: name, ‹ "第 N 個／共 M 個" ›, "⋯", then overview/files tabs. In board mode the range is the current column and prev/next never jump columns; buttons disable at the ends.
- Vanished torrent: list mode moves to the next (else previous); board panel closes on delete but follows a column change; mobile sheet closes on delete.
- Loading uses same-size skeletons, never spinners or "載入中…". Empty board column says "沒有"; empty needs-attention says "都沒問題".
- Exact sizes, timings, colours and tokens for each component are in the story specs and UX DESIGN.md; do not improvise values.

## Cross-Story Dependencies

- 2.0 must land before the first story that opens a dialog or bottom sheet (2.2); its fake-qbit smoke is the browser check for every later story.
- 2.1 builds sort fields, URL params and `selectVisibleTorrents` sorting that 2.2, 2.3, 2.4 build on. "State" stays disabled in the menu until 2.3.
- 2.2's bottom sheet is reused by 2.4 (detail mode, 70%) and later epics; 2.4's detail containers and `Esc` registry are prerequisites for 2.5, 2.6, 2.7. "⋯" stays disabled until 2.6, files tab until 2.7.
- 2.6 creates `src/lib/toast.ts`, reused by 2.7 and later epics; its toast has a position parameter for the Epic 4 selection bar.
- 2.8 creates `src/lib/prefs.ts`, reused by Epic 3 (3.3, 3.6). 2.9 exposes a `src/state` trigger that Epic 3 calls on category change.
- Deferred to later epics: per-category remembered sort, last-viewed torrent, `↑` `↓` and other shortcuts (Epic 3); checkboxes and selection bar (Epic 4); "☆ 加到常用", "改路徑", "改檔名" and moving state (Epic 5). These stay rendered but disabled using the Epic 1 pattern.
- Relies on Epic 1: `classify()`, `maindata-merge`, `refreshMaindata()`, the server function factory, `scripts/fake-qbit.mjs`, status circle and the disabled-control pattern. 2.10 replaces the fixed "qBittorrent 回報錯誤" text from Story 1.6.
