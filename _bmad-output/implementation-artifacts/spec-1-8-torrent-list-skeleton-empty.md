---
title: 'Story 1.8: Torrent list, skeleton and empty state'
type: 'feature'
created: '2026-11-16'
status: 'done'
baseline_revision: '62465241a56d5b64bdb0104d6e69632a46d89d81'
review_loop_iteration: 0
followup_review_recommended: false
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-1-context.md'
  - '{project-root}/_bmad-output/planning-artifacts/architecture/architecture-react-torrent-2026-11-15/ARCHITECTURE-SPINE.md'
  - '{project-root}/_bmad-output/planning-artifacts/ux-designs/ux-react-torrent-2026-11-13/DESIGN.md'
  - '{project-root}/_bmad-output/planning-artifacts/ux-designs/ux-react-torrent-2026-11-13/EXPERIENCE.md'
warnings: ['oversized']
deferred:
  - summary: >-
      Virtualizer DOM count, smooth scrolling and the freeze's DOM event wiring are verified in the browser only (no DOM test environment).
    evidence: |-
      Implementer's browser run: at most 33 listitems while scrolling 4165 rows, no long tasks; desktop freeze held and released once. Revisit if a DOM test setup is added.
    location: >-
      src/features/list/torrent-list.tsx
    severity: low
  - summary: >-
      Phone touch freeze timing after lift (300 ms after the last momentum scroll) is covered by fake-timer unit tests only.
    evidence: |-
      Emulated touch in the browser rendered too slowly to observe the settle reliably; Alex can confirm on his phone after deploy (Story 1.9 checklist).
    location: >-
      src/state/order-freeze.ts
    severity: low (unverified)
  - summary: >-
      Desktop freeze lasts as long as the mouse rests over the list, which fills the content area, with no time limit or new-items hint.
    evidence: |-
      Follows AR-50 and EXPERIENCE as written; a limit or hint is a design change for Alex to decide after using it.
    location: >-
      src/state/order-freeze.ts
    severity: medium (unverified)
---

<intent-contract>

## Intent

**Problem:** After login the shell (Story 1.7) shows the header but `main` is empty: no torrent rows, no first-load skeleton, no empty state. A first `['maindata']` fetch that fails with a non-connection code (`qbit_rejected`, `bad_origin`, `invalid_input`) leaves every skeleton pulsing forever (spec 1.7 deferred item).

**Approach:** Add `src/features/list`: a virtualized list (`@tanstack/react-virtual` 3.14.26, `main` as the scroll element) of memoized rows keyed by hash, fed by `useVisibleTorrents(EPIC1_VIEW)` through one order-freezing hook in `src/state`; row-sized skeletons before data; a centered empty state; a first-load error state (pending the blocking question). Extend `scripts/fake-qbit.mjs` with data modes for screenshots and the 4165-row check.

## Boundaries & Constraints

**Always:**
- Order comes only from `useVisibleTorrents(EPIC1_VIEW)` (`selectVisibleTorrents`, archived excluded), passed through `useFrozenOrder` in `src/state/order-freeze.ts`. No `sort()` in features.
- Status, word, progress ring and error detail only from `classify()`; numbers only from `src/lib/format.ts` (`formatSize`, `formatRowSpeed`, `formatRatio`, `isGoodRatio`, `formatDate`, `formatPercent`); location text only from `locationLabel()`.
- Every visual value from S01/S02 list-mode, loading, no-result, offline mockups or DESIGN.md (table in Design Notes); colors only through existing tokens.
- Torrent names and details render as JSX text (never HTML, never links). Desktop names carry `title` with the full name.
- Rows: React key and `getItemKey` are the hash; the row component is `memo` and receives the torrent object (merge keeps unchanged references), its `stateBeforeMove` entry and a day value that changes only when the local date changes, so an unchanged torrent never re-renders on a poll.
- Fixed row height: one constant shared by skeleton rows and data rows on both breakpoints (set on the row box, so a short second line cannot shrink it), verified in the browser.
- Rows have no click action, no hover background, no cursor change and are not focusable. The 20px checkbox slot is an empty `aria-hidden` box on desktop and absent on phone.
- Freezing: values keep updating while frozen; only positions hold. Unfreeze applies one reorder.
- Fake data uses only code names `X`, `mteam-X`, `mteam-tv`, paths like `/data/media/X/incompleted`, `/data/torrent/mteam-seed`, fake hashes.

**Never:**
- No sort menu, category, search, selection, detail panel, row click, hover, spin-in animation (Epic 2), common paths or media-library tag styling (Epic 5), or `['settings']` gating (Epic 3).
- No jsdom, testing-library, animation, gesture or i18n package; the only new dependency is `@tanstack/react-virtual` pinned exactly.
- No change to the error contract, `callFn`, server functions, `src/shared/csp.ts` or `src/shared/maindata.ts` fields.
- Never contact the real qBittorrent or read `.env`; screenshots only against `scripts/fake-qbit.mjs`. The script is never imported from `src/`.
- Features never import each other: `MAIN_ID` and `focusMain` move to `src/shared/ui/main-scroll.ts`.

## I/O & Edge-Case Matrix

Clock: `now` = 2026-11-16 12:00 `Asia/Taipei`, passed explicitly. `C` = 2 x pi x 16.5.

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| R1 Seeding row | `uploading`, progress 1, ratio 3.12, upspeed 2495611, size 182.7e9 B, `/data/torrent/mteam-seed`, added today 09:12 | tag 「torrent/mteam-seed」, size via `formatSize`, speed 「↑」 plus 「2.38 MB/s」, ratio 「3.12」 `good`, value 「今天 09:12」 | none |
| R2 Downloading row | progress 0.87, dlspeed 6510000, upspeed 30000 | speed is ↓ dlspeed 「6.21 MB/s」 (progress under 1 shows download speed) | none |
| R3 Zero speed | speed 0 | no speed item in the second line | none |
| R4 Ratio | 0.88; 1.0; -1 | 「0.88」 `text`; 「1.00」 `good`; 「∞」 `good` | none |
| R5 Dates | added yesterday 21:40; 2026-11-05; 2025-07-18 | 「昨天 21:40」 「11/05」 「2025/07/18」 | none |
| R6 Error rows | state `error`; `missingFiles` private | detail 「qBittorrent 回報錯誤」 / 「找不到檔案，做不了種」 after the size (desktop), in place of size and speed (phone) | none |
| C1 Ring | downloading 0.87; paused 0.45; stalled 0.87 | arc offset `C x 0.13`, `C x 0.55`, `C x 0.13` on `track`; label 「下載中，87%」 「已暫停，45%」 「停滯，87%」 | none |
| C2 Full ring | seeding, done, error | full ring in status color, no track; label 「做種中」 「已完成」 「錯誤」 | none |
| C3 Ring edges | downloading 0; 0.999 | no arc drawn, 「下載中，0%」; 「下載中，99%」 | none |
| X1 Plain text | name `<script>alert(1)</script>`, `<img src=x onerror=alert(1)>`, `javascript:alert(1)` | markup has escaped text, no `<script`, `<img`, `<a`, `href` | none |
| V1 View | no data and pending; no data and `home_unreachable`, `qbit_unreachable`, `timeout`, `cloudflare_expired`, `not_logged_in` | `skeleton` | none |
| V2 First-load error | no data and `qbit_rejected`, `bad_origin`, `invalid_input` | `error` (option A in Design Notes) | 「重試」 calls `refreshMaindata` once; success shows rows |
| V3 Empty | data with 0 torrents; data with only archived | `empty`; 「全部」 count 0 | none |
| V4 Rows | data, N visible | `rows`; a later failed poll keeps rows (old data) | none |
| H1 Header on V2 | no data, `qbit_rejected` | speed groups and count leave the skeleton (option A) | none |
| F1 Not frozen | shown any, live L | returns L | none |
| F2 Frozen, values only | frozen, live has same set reordered | previous shown order, same reference | none |
| F3 Frozen, removal | frozen, a shown hash left live (deleted or archived) | previous order minus that hash | none |
| F4 Frozen, new torrent | frozen, live has a new hash | new hash held back until unfreeze | none |
| F5 First render frozen | shown null, frozen | returns live | none |
| F6 Freeze reasons | mouse inside list; touching; 299 ms and 300 ms after the last scroll that followed touchend | frozen; frozen; frozen; not frozen (`TOUCH_SETTLE_MS` 300) | none |
| M1 Memo | two merges, one torrent changed | props of unchanged rows shallow-equal; changed row differs | none |

</intent-contract>

## Code Map

- `src/routes/_authed/index.tsx` -- `Home` returns `null`; becomes `<TorrentList />`.
- `src/features/header/app-shell.tsx` -- `ContentDim` (line 238) renders `main` (`id={MAIN_ID}`, `overflow-y-auto`, `opacity-50` on dim): the virtualizer's scroll element. `DesktopCount`/`PhoneCount` (182, 188) show a skeleton while `allCount` is null.
- `src/features/header/speed-area.tsx` -- `MAIN_ID` (16), `focusMain` (19) move to shared; local `Skeleton` (34) replaced by the shared one; `GroupContent` (59) draws skeleton bars when `group` is null.
- `src/features/header/header-model.ts`, `header-context.tsx` -- `headerModel({ serverState, alert, allCount })`; add the first-load-error input here (H1).
- `src/shared/ui/alert-bar.tsx` -- focus restore via `restoreFocusTo={focusMain}` (deferred item c).
- `src/state/maindata.ts` -- `useVisibleTorrents(view)`, `useMaindata(select)` with stable selectors `selectTorrents`, `selectStateBeforeMove`; `refreshMaindata(client)`; the query keeps old data on failure and polls on after an error.
- `src/state/query-client.ts` -- global `onError`: connection codes to the store, maindata `timeout` as `qbit_unreachable`, `bad_origin` logged once, login-stop codes; non-connection maindata failures call `clearUnreachable()` and show nothing today.
- `src/state/now.ts` -- `useNow(intervalMs)` for the day value; `src/state/testing.ts`, `src/lib/testing.ts` (`t`, `fakeHash`, `fakeResponse`) for tests.
- `src/lib/app-error.ts` -- `isConnectionCode`, `isLoginStopCode`, `isAppError` for `listView`.
- `src/lib/visible-torrents.ts` -- `EPIC1_VIEW`, `selectVisibleTorrents`, `countAll`.
- `src/lib/torrent-status.ts` -- `classify(t, { now, timeZone?, stateBeforeMove })` returns `status`, `word`, `detail`, `showsProgress`; `TorrentStatusId` matches `status-*` tokens.
- `src/lib/format.ts`, `src/lib/paths.ts` (`locationLabel`), `src/lib/maindata-merge.ts` (`mergeMaindata` keeps references), `src/lib/error-text.ts`.
- `src/shared/ui/cn.ts`, `src/styles.css` -- tokens, `animate-skeleton`, `text-row-name`, `text-row-value`, `rounded-row`, `rounded-panel`, `bg-track`.
- `eslint.config.js` -- boundaries (features import state, lib, shared), AR-41 ban on `torrent.state`, AD-10 HTML bans.
- `scripts/fake-qbit.mjs` -- `TORRENTS` (line 129), `mode` (71), `QBIT_MODES` (53), maindata handler (194 to 229), `controlMode` (239); CI runs `node --check` on it.

## Tasks & Acceptance

**Execution:**
- `package.json`, `package-lock.json` -- add `"@tanstack/react-virtual": "3.14.26"` (exact) with `npm install --save-exact` -- AR-7, AD-11.
- `src/shared/ui/main-scroll.ts` -- move `MAIN_ID` and `focusMain` here; update `speed-area.tsx` and `app-shell.tsx` imports -- features never import each other.
- `src/shared/ui/skeleton.tsx` -- shadcn `Skeleton` (`data-slot="skeleton"`, `aria-hidden`), classes `animate-skeleton bg-surface-muted` plus `className`; header uses it instead of its local copy -- UX-DR88.
- `src/state/order-freeze.ts`, `src/state/order-freeze.test.ts` -- pure `nextShownOrder(shown, live, frozen)`, `isOrderFrozen(reasons)`, `touchFrozen({ touching, lastScrollAt, now })`, `TOUCH_SETTLE_MS`; a store of reasons (`pointerInList`, `touchScroll`; doc comment: selection, sheet and animation join later) with `setPointerInList`, `touchScrollStart`, `touchScrollEnd`, `noteScroll` (settle timer); `useFrozenOrder(live)` keeps the last shown order in a ref -- AR-50, AD-13; rows F1 to F6.
- `src/lib/error-text.ts`, its test -- add `LIST_LOAD_FAILED = '讀不到種子清單'` (option A) -- V2.
- `src/features/list/list-model.ts`, `list-model.test.ts` -- pure `listView({ hasData, visibleCount, error })` returning `skeleton | error | empty | rows`; `rowModel(torrent, { now, timeZone, stateBeforeMove })` returning circle (`status`, `label`, `arcFraction | null`), name, tag, size, speed (`{ direction, text } | null`), ratio (`{ text, good }`), value, `errorDetail | null`; `rowProps(maindata, hash, today)`; `dayValue(now, timeZone)` -- rows R1 to R6, C1 to C3, V1 to V4, M1.
- `src/features/list/status-circle.tsx` -- 36px SVG per Design Notes, `role="img"`, `aria-label` from the model; icon paths copied from the mockups -- UX-DR24, UX-DR77.
- `src/features/list/torrent-row.tsx` -- `memo` row: checkbox slot (desktop), circle, name (`title`), second line, ratio (desktop), value; phone second line drops speed then size by CSS wrap -- UX-DR30 to UX-DR32, UX-DR34.
- `src/features/list/list-states.tsx` -- `ListSkeleton` (12 skeleton rows, section `aria-busy="true"`), `ListEmpty` (「這個分類沒有種子」, disabled 「新增種子」), `ListLoadError` (option A) -- FR-15, UX-DR88, UX-DR90.
- `src/features/list/torrent-list.tsx` -- reads `useVisibleTorrents(EPIC1_VIEW)`, `selectTorrents`, `selectStateBeforeMove`, query error; `useFrozenOrder`; `useVirtualizer` with `getScrollElement` = `main`, `count`, `estimateSize` = row pitch, `getItemKey` = hash, `overscan: 10`, `useFlushSync: false`; mouse `pointerenter`/`pointerleave` on the section, `touchstart`/`touchend`/`touchcancel`/`scroll` on `main`; section `aria-label` 「種子列表，共 N 個」, inner `role="list"`, rows `role="listitem"` with `aria-setsize`/`aria-posinset` -- NFR-1, AR-7, AR-50.
- `src/features/list/torrent-list.test.tsx` -- `renderToStaticMarkup` of row, circle, skeleton, empty and error with fixed models: X1, ring offsets, no `<button` in a row, checkbox slot `aria-hidden`, labels, empty button `disabled`.
- `src/features/header/header-model.ts`, `header-context.tsx`, `header-model.test.ts`, `app-shell.tsx`, `speed-area.tsx` -- take `loadFailed` (no data and a V2 code from the maindata query error) and leave the skeletons per option A -- H1, deferred item (a).
- `src/routes/_authed/index.tsx` -- render `<TorrentList />`.
- `scripts/fake-qbit.mjs` -- add `data=sample|many|empty|archived` (default `sample`, keeps 1.7 behavior) and `grow=0|1`, plus `qbit=rejected` (maindata answers 200 `not json`, so the container returns `qbit_rejected`). `many`: 4165 visible torrents plus 50 archived; the newest 12 cover downloading, paused, stalled, seeding, done, `error`, private `missingFiles`, `moving`, `unknown`, one name over 200 characters and the three X1 names; speeds of downloading and seeding ones change on every request. `empty`: no torrents. `archived`: only non-private `missingFiles`. `grow=1`: each maindata request adds one newer torrent. Update the header usage comment.

**Acceptance Criteria:**
- Given the fake script in `data=many` at 1280 x 844, when ego-browser opens `/` after login, then rows follow added time newest first, the section spans the content width (at most 1240px), each row shows slot, circle, name with `title`, second line, 「分享率」 column and added-time value, rows have no hover background and Tab never lands on a row.
- Given width 390px, when the same list renders, then there is no ratio column, row padding is 9px 10px, rows sit 12px from the screen edges, no checkbox slot, the location tag is at most half the line with 「…」, and `document.documentElement.scrollWidth` is 390.
- Given `data=many`, when `main` is scrolled from top to bottom in steps, then `document.querySelectorAll('[role=listitem]').length` stays under 100, the last row is fully visible, rows keep their measured height equal to the constant, and a `PerformanceObserver('longtask')` records no task over 100 ms during the scroll.
- Given `data=many&grow=1`, when the mouse rests on the desktop list (and on phone while a finger scrolls), then speeds keep changing but no row moves and new torrents do not appear; after the mouse leaves (finger lifts and scrolling settles) the list reorders once with the new torrents on top.
- Given `qbit=slow` on a fresh load, when the page renders, then row-sized skeletons show without a spinner and data replaces them directly.
- Given `data=empty` and `data=archived`, when data arrives, then the centered 「這個分類沒有種子」 block with a disabled 「新增種子」 shows and the 「全部」 tab reads 0.
- Given `qbit=rejected` on a fresh load, when the page renders, then the list shows the first-load error state and the header leaves its skeletons (option A); after `qbit=normal`, 「重試」 shows the rows.
- Given data on screen and `front=down`, when ego-browser checks, then `main` computes opacity 0.5, rows are dimmed, the header and bar are not, and `main` still scrolls; then with keyboard focus on 「重試」 and `front=normal`, pressing it removes the bar and `document.activeElement.id` is `rt-main` (deferred items b and c).
- Given the fake script, when ego-browser saves screenshots after hiding every extension overlay (1Password included), then `_bmad-output/implementation-artifacts/screenshots/1-8/` holds `list-{loading,data,empty,error}-{desktop,phone}-{light,dark}.png` (16) and `list-dim-{desktop,phone}-light.png` (2), desktop 1280 x 844, phone 390 x 844, dark via emulated `prefers-color-scheme`; the data shots show every status and the long name; the implementer opens every PNG and confirms no real data, no personal data, no overlay, and no CSP violation in the console.

## Spec Change Log

### 2026-11-16: review pass 1
- Trigger: the first-load error block flickered every poll because TanStack Query resets `error` when a fetch starts without data; plus row geometry on half pixels and the shared-main margin.
- Amended (applied as patches): a sticky last-maindata-failure store in `src/state` drives the list and header error state; ROW_HEIGHT 59 (was 58.6); the phone 12px edges live on the list section with a compensating `main` padding; moving error rows show 「搬移中」 only.
- Known-bad state avoided: a flashing error block that steals focus and re-announces every 5 s.
- KEEP: virtualized list, pure row model, freeze reducer, option A layout.

## Review Triage Log

### 2026-11-16: Review pass
- verdicts: 29 findings: high 1, medium 4, low 23, false 1, maybe-false 0
- findings:
  - `[low]` `[patch]` Blind: fractional row geometry. rounded to whole pixels.
  - `[low]` `[reject]` Blind: header count and list label disagree while frozen. the header count is live by design; the list label describes what is shown.
  - `[medium]` `[reject]` Blind: desktop freeze can last as long as the mouse rests over the list. AR-50 and EXPERIENCE define the freeze as mouse over the list; a time limit or new-items hint is a design change; raised to Alex in the story summary.
  - `[low]` `[patch]` Blind: freeze misses a cursor already inside. hover check on mount.
  - `[low]` `[patch]` Blind: added time read without label; phone hides ratio from screen readers. sr-only text.
  - `[false]` `[reject]` Blind: failures after the first load are silent. the header shows 「最後更新 N 秒前」 once data is older than 10 s (stale alert).
  - `[low]` `[patch]` Blind: retry gives no visible feedback. block stays mounted with aria-busy during the retry (sticky failure).
  - `[low]` `[patch]` Blind: dayValue duplicates format.ts. shared day-key helper.
  - `[low]` `[patch]` Blind: testable glue untested. TorrentList, TorrentRow and HeaderProvider render tests; freeze reducer tests.
  - `[low]` `[patch]` Blind: isFirstLoadError test hand-lists codes. derived from ERROR_CODES.
  - `[low]` `[patch]` Blind: fake many data inconsistent. fixed.
  - `[low]` `[patch]` Blind: fake screenshots not reproducible. BASE_TIME.
  - `[low]` `[reject]` Blind: bad_origin and invalid_input never exercised in a browser. same code path as qbit_rejected through the sticky failure; unit tests cover the classification.
  - `[low]` `[patch]` Blind: list-only margin on the shared main. moved to the list section.
  - `[low]` `[patch]` Blind: styling gaps between list states. consistent corners; ratio placeholder.
  - `[low]` `[reject]` Intent R3: mockups show seeding time and common-path tags. AC wins: added time and path tags; common paths come in Epic 5.
  - `[low]` `[reject]` Intent R4: empty state shown whenever the list is empty. AC wording; EXPERIENCE's narrower trigger needs categories (Epic 3).
  - `[low]` `[defer]` Intent: virtualizer DOM count and smooth scroll only browser-checked. no DOM test environment; recorded with numbers in the PR.
  - `[low]` `[reject]` Intent: removed torrents leave immediately while frozen. Claude 代決: a vanished torrent cannot keep its slot; new ones wait.
  - `[low]` `[patch]` Intent: phone 12px margin applied to every page. moved to the list.
  - `[medium]` `[patch]` Edge: moving error torrent shows 搬移中 twice. errorDetail fixed.
  - `[low]` `[patch]` Edge: multi-finger touchend ends the freeze. touches.length check.
  - `[low]` `[patch]` Edge: remount under a resting mouse. hover check.
  - `[low]` `[patch]` Edge: backward clock prolongs the touch freeze. performance.now.
  - `[medium]` `[patch]` VG: list first-load wiring untested. TorrentList render under a failing client.
  - `[medium]` `[patch]` VG: header loadFailed wiring untested. AppShell render under a failing client.
  - `[low]` `[patch]` VG: TorrentRow moving handoff untested. static-markup case.
  - `[low]` `[patch]` VG: freeze hook and events only browser-checked. pure reducer extracted and tested; DOM events stay browser-checked.
  - `[high]` `[patch]` VG other: error block flickers every poll (error cleared on each fetch without data). sticky last-failure state in src/state.

## Design Notes

## Resolved question (Alex, 2026-11-16)

Alex chose option (A): a first-load failure that is neither a connection problem nor a login stop shows a centered block in the content area (「讀不到種子清單」 plus an outline 「重試」 calling `refreshMaindata`), styled like the no-result block; the header speeds show 「沒有」 and the 「全部」 count is left out; the next successful poll replaces it with data. The spec already follows (A). Original question kept below.

### Original question

A first `['maindata']` fetch can fail with a code that is neither a connection problem nor a login stop (`qbit_rejected`, for example the container cannot parse qBittorrent's answer; `bad_origin`, `APP_ORIGINS` is wrong; `invalid_input`). There is no data yet, no alert bar (those codes have none), and the list and header show skeletons forever while each 5 s poll fails again. No mockup or EXPERIENCE row draws this state (the nearest is the files tab's 「讀不到檔案清單」 plus 「重試」). What should the screen show?
- (A) The content area shows a centered block like `S01-no-result-desktop` / `S02-no-result-phone`: 「讀不到種子清單」 (15px/700, `role="alert"`) and an outline 「重試」 button (36px desktop, 44px phone) that calls `refreshMaindata`. The header leaves its skeletons: each speed group shows the arrow plus 「沒有」 in `text-muted` (format.ts `NO_VALUE`), the 「全部」 count is left out. The next successful poll replaces everything with data. Claude's recommendation: it mirrors the files-tab wording and the existing centered-block pattern, and needs no new component.
- (B) The existing alert bar under the header shows 「讀不到種子清單」 plus 「重試」 (`TriangleAlert` icon); the list keeps row skeletons; the header shows 「沒有」 as in (A).
- (C) No new state: skeletons stay while polling retries, the code is logged once (`bad_origin` already is); close the deferred item as accepted.

The spec is written for (A). For (B) only `list-states.tsx`, `header-model.ts` and the V2/H1 rows change; for (C) drop V2, H1, `LIST_LOAD_FAILED` and the error screenshots. Flip `status` to `ready-for-dev` after the answer.

**Visual values** (S01-list-mode-desktop, S02-list-mode-phone, S01/S02-loading, S01/S02-no-result, DESIGN components):

| Element | Value |
|---|---|
| List section | `surface`, radius `panel` 22px, padding 8px, rows gap 2px, `min-h-full`; phone margin 0 -4px, radius 22px 22px 0 0, padding 4px |
| Row | flex, center, gap 10px (phone 8px), padding 9px 12px (phone 9px 10px), radius `row` 14px, transparent; height about 58.6px (18.2 name + 3 gap + 19.4 tag line + 18 padding), pitch plus 2px gap; confirm with `getBoundingClientRect` |
| Checkbox slot | 20 x 20, desktop only, empty |
| Inner | flex, center, gap 12px (phone 10px); text column `flex-1 min-w-0`, gap 3px |
| Status circle | 36px; ring r 16.5, stroke 3; progress arc status color, `stroke-linecap: round`, `rotate(-90 18 18)`, dasharray `C`, dashoffset `C x (1 - progress)` over a `track` ring; inner r 14.4 status fill; icon 15px at 10.5, `status-icon` stroke 2.8 |
| Name | `row-name` 13px/600/1.4, one line, ellipsis |
| Second line | flex, gap 8px, 11px/1.4, `text-muted`, tabular, nowrap, overflow hidden; phone `flex-wrap` with one-line height so speed then size drop |
| Location tag | inline-flex, gap 4px, padding 1px 8px, full radius, 1px `border`, `text-muted`, folder icon 12px stroke 2.4 (mockup path `M3 7h6l2 2h10v10H3z`); phone `max-w-1/2` with ellipsis |
| Row speed | inline-flex gap 2px, arrow 11px stroke 2.6, ↓ `status-downloading`, ↑ `status-seeding` |
| Ratio | desktop only, width 76px, right, 12px/1.4 `text-muted`, 「分享率 」 plus bold 600 value in `good` or `text` |
| Value | right, `max-w-[160px]`, `row-value` 18px/700/1.2, tabular, nowrap |
| Skeleton row | same box and height as a row; 36px circle radius 18px, name bar 88% x 12 radius 6px, second bar 52% x 10 radius 5px, value bar 72 x 18 radius 6px; `Skeleton` |
| Empty / error block | `surface`, radius 22px, centered column, gap 14px, padding 24px, fills `main` (phone margin 0 -4px 16px); text 15px/700; button outline capsule, 36px (phone 44px), padding 0 18px, weight 600, `surface`, 1px `border` |

**Claude 代決** (for Alex's veto):
- Error rows show `classify().detail` as in the list-mode mockups: desktop after the size, phone right after the tag (size and speed dropped, as S02-list-mode-phone draws). The AC's plain-text row mentions the error reason on rows.
- Row speed: progress under 1 shows ↓ download speed, otherwise ↑ upload speed; omitted at 0.
- Skeleton row bar sizes follow the card skeleton vocabulary; 12 rows; `animate-skeleton` (the mockup pulse) instead of shadcn's `animate-pulse`.
- Empty state uses the no-result block and its outline button (no mockup draws 「這個分類沒有種子」).
- Section bottom padding stays 8px / 4px until the selection bar story adds the floating-bar space (the mockups' 96px and 140px are for that bar).
- While frozen, new torrents wait for the unfreeze; deleted or archived ones leave at once (their data is gone).
- Touch freeze lasts from `touchstart` until 300 ms after the last scroll event after `touchend` (covers momentum); the hover freeze counts only `pointerType === 'mouse'` on the list section.
- Dates use a day value that changes at local midnight, so rows do not re-render every minute.
- `useFlushSync: false` (React 19 warning), `overscan: 10`, rows positioned with `transform: translateY`.
- Status icons use the mockup path data inside the circle SVG; progress 0 draws no arc (a round cap would show a dot).
- List semantics: section label 「種子列表，共 N 個」 (mockup), `role="list"` with `aria-setsize`/`aria-posinset`; rows are plain `div`s until Epic 2 adds the click.
- `MAIN_ID`/`focusMain` move to `src/shared/ui/main-scroll.ts`.

**Carried-forward items:**
- (a) first-load non-connection failure: V2, H1 and the blocking question.
- (b) 50% dim and scrolling with content: browser AC with `front=down` plus `list-dim-*` screenshots.
- (c) focus after the bar unmounts on a successful retry: browser AC (`document.activeElement.id === 'rt-main'`).
- (d) spec 1.6 wire size: untouched, stays for Story 1.9.

**Docs consulted (AD-11):**
- TanStack Virtual `Virtualizer` options (`getScrollElement`, `estimateSize`, `getItemKey`, `overscan`, `scrollMargin`, `paddingStart`, `isScrollingResetDelay`, `useScrollendEvent`): https://tanstack.com/virtual/latest/docs/api/virtualizer
- TanStack Virtual React adapter (`useVirtualizer`, `useFlushSync` and the React 19 warning, fixed-size example): https://tanstack.com/virtual/latest/docs/framework/react/react-virtual
- `@tanstack/react-virtual` 3.14.26 (published 2026-11-03, peer React 19): `npm view @tanstack/react-virtual`
- SVG `stroke-dashoffset` / `stroke-dasharray`: https://developer.mozilla.org/en-US/docs/Web/SVG/Reference/Attribute/stroke-dashoffset
- Pointer events `pointerenter` and `pointerType`: https://developer.mozilla.org/en-US/docs/Web/API/PointerEvent/pointerType
- Touch events and `scroll` on elements: https://developer.mozilla.org/en-US/docs/Web/API/Element/touchstart_event, https://developer.mozilla.org/en-US/docs/Web/API/Element/scroll_event
- shadcn Skeleton: https://ui.shadcn.com/docs/components/skeleton
- TanStack Query v5 `useQuery` (`error`, `status`, `select` with structural sharing): https://tanstack.com/query/v5/docs/framework/react/reference/useQuery
- React `memo`: https://react.dev/reference/react/memo

## Verification

**Commands:**
- `bash -c 'source ~/.nvm/nvm.sh && nvm use && npm run lint'` -- expected: exit 0.
- `bash -c 'source ~/.nvm/nvm.sh && nvm use && npm run typecheck'` -- expected: exit 0.
- `bash -c 'source ~/.nvm/nvm.sh && nvm use && npm test'` -- expected: all pass, including every matrix row.
- `bash -c 'source ~/.nvm/nvm.sh && nvm use && npm audit'` -- expected: 0 vulnerabilities.
- `bash -c 'source ~/.nvm/nvm.sh && nvm use && npm run build'` -- expected: exit 0.
- `bash -c 'source ~/.nvm/nvm.sh && nvm use && npm run smoke'` -- expected: passes.
- `bash -c 'source ~/.nvm/nvm.sh && nvm use && node --check scripts/fake-qbit.mjs'` -- expected: exit 0; `rg -n "fake-qbit|__fake" src .output` has no hit.
- `bash .claude/skills/next-story/check.sh` -- expected: every line ok.

**Manual checks (if no CLI):**
- `bash -c 'source ~/.nvm/nvm.sh && nvm use && npm run build && npm run fake-qbit'`, then with the ego-browser skill run the browser ACs, switch modes with the printed `curl`, take the 18 screenshots, and open every PNG. If ego-browser fails, halt as blocked.

## Auto Run Result (pipeline)

- **Decision by Alex (2026-11-16):** first-load failure that is neither a connection problem nor a login stop shows a centered 「讀不到種子清單」 block with 重試; header speeds show 「沒有」, count hidden.
- **Carried items closed:** 1.7's first-load error state (sticky failure), content dim and scrolling with rows (browser-checked: main at 50%, still scrolls), focus to `main` after a successful retry (browser-checked).
- **Review findings:** 29 findings. 21 patched (1 high, 4 medium among them), 1 deferred, 7 rejected with reasons.
- **Follow-up review recommended:** false. The high patch (sticky failure) has store tests plus real-wiring renders of TorrentList and AppShell under a failing client; no unverified risk from the patches can be named.
- **Verification (Node v26.13.1):** lint exit 0; typecheck exit 0; vitest 55 files, 1068 tests passed; audit 0 vulnerabilities; `node --check scripts/fake-qbit.mjs` ok; fresh build ok; `npm run smoke` passed; `check.sh` all ok.
- **Screenshots:** 18 PNGs in `screenshots/1-8/` against the fake server, viewed by the orchestrator as contact sheets: fake names, code-name paths only, XSS names shown as text, no overlays or personal data. Taken before the review patches (rows were 58.6px, no ratio placeholder in the skeleton, times from the real clock).
- **Residual risks:** the deferred items; screenshots predate the 0.4px row change.
